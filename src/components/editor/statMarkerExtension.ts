import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import {
  StateEffect,
  StateField,
  RangeSetBuilder,
  type Extension,
} from '@codemirror/state'
import type { Character, StatDelta, StatDeltaOp } from '../../types'
import { STAT_MARKER_REGEX } from '../../lib/markerUtils'
import {
  renderModeField,
  setRenderModeEffect,
  markerPresentation,
} from './renderMode'

/**
 * Compact snapshot of character-store state needed to render dot widgets.
 * Mirrors only what the CodeMirror plugin actually reads, so React concerns
 * (subscriptions, selectors) stay in the wiring layer.
 */
export interface CharacterSnapshot {
  markers: Record<string, StatDelta[]>
  characters: Character[]
}

const EMPTY_SNAPSHOT: CharacterSnapshot = { markers: {}, characters: [] }

/** StateEffect delivering a fresh snapshot into the editor state. */
export const setCharacterSnapshotEffect = StateEffect.define<CharacterSnapshot>()

/** Holds the latest CharacterSnapshot — used by the decoration plugin. */
const characterSnapshotField = StateField.define<CharacterSnapshot>({
  create: () => EMPTY_SNAPSHOT,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setCharacterSnapshotEffect)) return e.value
    }
    return value
  },
})

/** Dispatch a new snapshot into the view. */
export function dispatchCharacterSnapshot(
  view: EditorView,
  snapshot: CharacterSnapshot
): void {
  view.dispatch({ effects: setCharacterSnapshotEffect.of(snapshot) })
}

/**
 * One-line summary of a marker's deltas, scoped to the first delta's character
 * for display context. Designed to read well inside a tooltip.
 */
export function summarizeDeltas(
  deltas: StatDelta[],
  character: Character | undefined
): string {
  if (deltas.length === 0) return 'No changes'
  const statName = (statId: string): string => {
    if (!character) return statId
    const def = character.stats.find((s) => s.id === statId)
    return def?.name ?? statId
  }
  const parts: string[] = []
  for (const d of deltas) {
    parts.push(formatOp(d.op, statName))
  }
  return parts.join(', ')
}

/**
 * Multi-line tooltip text describing a marker's full set of deltas plus any
 * author note. Rendered as the native `title=` attribute on the dot widget —
 * newlines separate deltas so compound markers read one-per-line.
 */
export function buildMarkerTooltip(
  deltas: StatDelta[],
  charactersById: Map<string, Character>
): string {
  if (deltas.length === 0) return 'Empty marker'
  const firstCharacter = charactersById.get(deltas[0].characterId)
  const headerName = firstCharacter?.name ?? 'Unknown'
  const lines: string[] = [headerName]
  const notes: string[] = []
  for (const d of deltas) {
    const character = charactersById.get(d.characterId)
    const statName = (statId: string): string => {
      if (!character) return statId
      const def = character.stats.find((s) => s.id === statId)
      return def?.name ?? statId
    }
    const summary = formatOp(d.op, statName)
    // Prefix with character name when compound marker crosses characters.
    if (character && character.id !== firstCharacter?.id) {
      lines.push(`  [${character.name}] ${summary}`)
    } else {
      lines.push(`  ${summary}`)
    }
    const trimmedNote = d.note?.trim()
    if (trimmedNote) notes.push(trimmedNote)
  }
  if (notes.length > 0) lines.push('', ...notes.map((n) => `"${n}"`))
  return lines.join('\n')
}

function formatOp(
  op: StatDeltaOp,
  statName: (id: string) => string
): string {
  switch (op.kind) {
    case 'adjust': {
      const sign = op.delta >= 0 ? '+' : ''
      const label = op.attributeKey
        ? `${statName(op.statId)}.${op.attributeKey}`
        : statName(op.statId)
      return `${label} ${sign}${op.delta}`
    }
    case 'set':
      return `set ${statName(op.statId)}`
    case 'maxAdjust': {
      const sign = op.delta >= 0 ? '+' : ''
      return `max${capitalize(statName(op.statId))} ${sign}${op.delta}`
    }
    case 'listAdd':
      return `+${op.items.join(', ')} → ${statName(op.statId)}`
    case 'listRemove':
      return `-${op.items.join(', ')} from ${statName(op.statId)}`
    case 'equip':
      return `equip ${op.itemName ?? op.itemId} (${op.slot})`
    case 'unequip':
      return `unequip ${op.slot}`
    case 'buffApply':
      return `buff ${op.buffName ?? op.buffId}`
    case 'buffRemove':
      return `-buff ${op.buffId}`
    case 'rankChange':
      if (op.direction === 'set') {
        return `${statName(op.statId)} → ${op.value ?? '?'}`
      }
      return `${statName(op.statId)} rank ${op.direction}`
  }
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s
}

const NEUTRAL_COLOR = '#6b7280' // gray-500

class StatMarkerWidget extends WidgetType {
  readonly markerId: string
  readonly color: string
  readonly tooltip: string
  readonly ariaLabel: string

  constructor(
    markerId: string,
    color: string,
    tooltip: string,
    ariaLabel: string
  ) {
    super()
    this.markerId = markerId
    this.color = color
    this.tooltip = tooltip
    this.ariaLabel = ariaLabel
  }

  eq(other: WidgetType): boolean {
    if (!(other instanceof StatMarkerWidget)) return false
    return (
      other.markerId === this.markerId &&
      other.color === this.color &&
      other.tooltip === this.tooltip &&
      other.ariaLabel === this.ariaLabel
    )
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-stat-marker-dot'
    span.style.backgroundColor = this.color
    span.setAttribute('data-marker-id', this.markerId)
    span.setAttribute('title', this.tooltip)
    span.setAttribute('role', 'button')
    span.setAttribute('aria-label', this.ariaLabel)
    span.tabIndex = 0
    return span
  }

  ignoreEvent(): boolean {
    // Let clicks/keypresses bubble so a delegated listener (Phase 5) can
    // pick them up from contentDOM.
    return false
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const presentation = markerPresentation(view.state.field(renderModeField))
  // In source mode the raw `<!-- stat:uuid -->` text stays visible — no decoration.
  if (presentation === 'raw') return Decoration.none

  const snapshot = view.state.field(characterSnapshotField)
  const characterById = new Map<string, Character>()
  for (const c of snapshot.characters) characterById.set(c.id, c)

  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)
    const re = new RegExp(STAT_MARKER_REGEX.source, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const start = from + m.index
      const end = start + m[0].length
      // clean mode: hide the marker text entirely with no widget.
      if (presentation === 'empty') {
        builder.add(start, end, Decoration.replace({}))
        continue
      }
      const markerId = m[1]
      const deltas = snapshot.markers[markerId]
      const firstDelta = deltas?.[0]
      const character = firstDelta
        ? characterById.get(firstDelta.characterId)
        : undefined
      const color = character?.color ?? NEUTRAL_COLOR
      const summary = deltas && deltas.length > 0
        ? summarizeDeltas(deltas, character)
        : 'Empty marker'
      const tooltip = deltas && deltas.length > 0
        ? buildMarkerTooltip(deltas, characterById)
        : 'Empty marker'
      const ariaLabel = `Stat marker — ${summary}`
      builder.add(
        start,
        end,
        Decoration.replace({
          widget: new StatMarkerWidget(markerId, color, tooltip, ariaLabel),
        })
      )
    }
  }
  return builder.finish()
}

const statMarkerViewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }
    update(update: ViewUpdate): void {
      const snapshotChanged =
        update.startState.field(characterSnapshotField) !==
        update.state.field(characterSnapshotField)
      const renderModeChanged = update.transactions.some((tr) =>
        tr.effects.some((e) => e.is(setRenderModeEffect))
      )
      if (
        update.docChanged ||
        update.viewportChanged ||
        snapshotChanged ||
        renderModeChanged
      ) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    // Widgets replace an entire comment range; atomicRanges keeps cursor
    // motion across the dot feel natural (jump over the whole widget).
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => {
        return view.plugin(plugin)?.decorations ?? Decoration.none
      }),
  }
)

const statMarkerBaseTheme = EditorView.baseTheme({
  '.cm-stat-marker-dot': {
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '50%',
    verticalAlign: 'middle',
    margin: '0 2px',
    cursor: 'pointer',
    boxShadow: '0 0 0 1px rgba(0,0,0,0.35) inset',
  },
  '.cm-stat-marker-dot:hover': {
    outline: '2px solid rgba(255,255,255,0.35)',
    outlineOffset: '1px',
  },
  '.cm-stat-marker-dot:focus-visible': {
    outline: '2px solid #fff',
    outlineOffset: '2px',
  },
})

/** Bundle of the StateField, ViewPlugin, and base theme. */
export function statMarkerExtension(): Extension {
  return [characterSnapshotField, statMarkerViewPlugin, statMarkerBaseTheme]
}

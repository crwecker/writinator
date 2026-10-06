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
import type { Character, StatDelta } from '../../types'
import { STAT_MARKER_REGEX } from '../../lib/markerUtils'
import { buildMarkerChip, formatOpTooltip, statNameLookup, type MarkerChip } from '../../lib/statFormat'
import { useEditorStore, type StatChipMode } from '../../stores/editorStore'
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
export const characterSnapshotField = StateField.define<CharacterSnapshot>({
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

/** StateEffect switching how markers render (chips / dots / hidden). */
export const setStatChipModeEffect = StateEffect.define<StatChipMode>()

/** Chip display setting, seeded from (and kept in sync with) editorStore. */
export const statChipModeField = StateField.define<StatChipMode>({
  create: () => useEditorStore.getState().statChipMode,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setStatChipModeEffect)) return e.value
    }
    return value
  },
})

/**
 * Mirrors editorStore.statChipMode into the view. Lives here (not in the
 * Editor component) so the extension is self-contained; dispatches from the
 * store subscription, never inside a CodeMirror update.
 */
const statChipModeSync = ViewPlugin.fromClass(
  class {
    private unsubscribe: () => void
    constructor(view: EditorView) {
      this.unsubscribe = useEditorStore.subscribe((state, prev) => {
        if (state.statChipMode === prev.statChipMode) return
        if (view.state.field(statChipModeField, false) === state.statChipMode) return
        view.dispatch({ effects: setStatChipModeEffect.of(state.statChipMode) })
      })
    }
    destroy(): void {
      this.unsubscribe()
    }
  },
)

/**
 * One-line summary of a marker's deltas, scoped to the first delta's character
 * for display context. Designed to read well inside a tooltip.
 */
export function summarizeDeltas(
  deltas: StatDelta[],
  character: Character | undefined
): string {
  if (deltas.length === 0) return 'No changes'
  const statName = statNameLookup(character)
  const parts: string[] = []
  for (const d of deltas) {
    parts.push(formatOpTooltip(d.op, statName))
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
    const summary = formatOpTooltip(d.op, statNameLookup(character))
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

class StatChipWidget extends WidgetType {
  readonly markerId: string
  readonly chip: MarkerChip
  readonly tooltip: string

  constructor(markerId: string, chip: MarkerChip, tooltip: string) {
    super()
    this.markerId = markerId
    this.chip = chip
    this.tooltip = tooltip
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof StatChipWidget &&
      other.markerId === this.markerId &&
      other.tooltip === this.tooltip &&
      other.chip.text === this.chip.text &&
      other.chip.groups.map((g) => g.color).join() === this.chip.groups.map((g) => g.color).join()
    )
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-stat-chip'
    const accent = this.chip.groups[0]?.color ?? NEUTRAL_COLOR
    span.style.setProperty('--chip-accent', accent)
    span.setAttribute('data-marker-id', this.markerId)
    span.setAttribute('title', this.tooltip)
    span.setAttribute('role', 'button')
    span.setAttribute('aria-label', `Stat change — ${this.chip.text || 'empty'}. Click to edit.`)
    span.tabIndex = 0
    if (this.chip.groups.length === 0) {
      span.classList.add('cm-stat-chip-empty')
      span.textContent = 'empty change'
      return span
    }
    this.chip.groups.forEach((g, i) => {
      if (i > 0) span.append('  ')
      const name = document.createElement('span')
      name.className = 'cm-stat-chip-name'
      name.style.color = g.color
      name.textContent = g.name
      span.append(name)
      for (const part of g.parts) span.append(` · ${part}`)
    })
    if (this.chip.more > 0) {
      const more = document.createElement('span')
      more.className = 'cm-stat-chip-more'
      more.textContent = ` · +${this.chip.more} more`
      span.append(more)
    }
    return span
  }

  ignoreEvent(): boolean {
    return false
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const presentation = markerPresentation(view.state.field(renderModeField))
  // In source mode the raw `<!-- stat:uuid -->` text stays visible — no decoration.
  if (presentation === 'raw') return Decoration.none
  const chipMode = view.state.field(statChipModeField, false) ?? 'chips'

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
      // clean mode (or chips hidden): hide the marker text entirely with no widget.
      if (presentation === 'empty' || chipMode === 'hidden') {
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
      const widget =
        chipMode === 'chips'
          ? new StatChipWidget(markerId, buildMarkerChip(deltas ?? [], characterById), tooltip)
          : new StatMarkerWidget(markerId, color, tooltip, ariaLabel)
      builder.add(start, end, Decoration.replace({ widget }))
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
        tr.effects.some((e) => e.is(setRenderModeEffect) || e.is(setStatChipModeEffect))
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
  '.cm-stat-chip': {
    display: 'inline-block',
    maxWidth: '32em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'pre',
    verticalAlign: 'text-bottom',
    margin: '0 3px',
    padding: '0 6px',
    borderRadius: '4px',
    borderLeft: '2px solid var(--chip-accent, #6b7280)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#a8a29e',
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    fontSize: '0.72em',
    fontStyle: 'normal',
    fontWeight: '400',
    lineHeight: '1.7',
    cursor: 'pointer',
    userSelect: 'none',
  },
  '.cm-stat-chip:hover': {
    backgroundColor: 'rgba(255,255,255,0.12)',
    color: '#d6d3d1',
  },
  '.cm-stat-chip:focus-visible': {
    outline: '1px solid var(--chip-accent, #fff)',
    outlineOffset: '1px',
  },
  '.cm-stat-chip-name': {
    fontWeight: '600',
  },
  '.cm-stat-chip-more, .cm-stat-chip-empty': {
    fontStyle: 'italic',
    color: '#78716c',
  },
  // Light editor themes (e.g. Parchment): dark ink on a faint tint.
  '&light .cm-stat-chip': {
    backgroundColor: 'rgba(68,52,32,0.08)',
    color: '#57534e',
  },
  '&light .cm-stat-chip:hover': {
    backgroundColor: 'rgba(68,52,32,0.14)',
    color: '#292524',
  },
  '&light .cm-stat-chip-more, &light .cm-stat-chip-empty': {
    color: '#78716c',
  },
})

/** Bundle of the StateField, ViewPlugin, and base theme. */
export function statMarkerExtension(): Extension {
  return [characterSnapshotField, statChipModeField, statChipModeSync, statMarkerViewPlugin, statMarkerBaseTheme]
}

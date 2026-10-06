import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
  hoverTooltip,
  closeHoverTooltips,
  type Tooltip,
} from '@codemirror/view'
import { StateEffect, type Extension, type Range } from '@codemirror/state'
import { STAT_MARKER_REGEX } from '../../lib/markerUtils'
import { computeMarkerWarnings, type MarkerWarning, type MarkerWarningFix } from '../../lib/markerWarnings'
import { useCharacterStore } from '../../stores/characterStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { isFileLockedNow } from '../../lib/fileLock'
import { characterSnapshotField, statChipModeField, setStatChipModeEffect } from './statMarkerExtension'
import { getLiveBook } from './statRefExtension'
import { renderModeField, setRenderModeEffect, markerPresentation } from './renderMode'

/**
 * Lint-style warnings on change markers that produce impossible values
 * (HP over max or below 0, removing an item not owned, unequipping an empty
 * slot, unknown stats): a small ⚠ after the chip (a wavy underline on the
 * raw comment in source mode) with a hover card offering one-click fixes.
 * Fixes edit the marker store, never the prose. No keybindings.
 */

/** Apply a warning's fix to the character store. */
export function applyMarkerWarningFix(markerId: string, fix: MarkerWarningFix): void {
  if (isFileLockedNow()) return
  const store = useCharacterStore.getState()
  if (fix.kind === 'replaceDeltas') {
    store.updateMarker(markerId, fix.deltas)
    return
  }
  const character = store.characters.find((c) => c.id === fix.characterId)
  if (!character || character.equipmentSlots.includes(fix.slot)) return
  store.setEquipmentSlots(fix.characterId, [...character.equipmentSlots, fix.slot])
}

const refreshWarningsEffect = StateEffect.define<null>()

interface WarnedRange {
  from: number
  to: number
  warnings: MarkerWarning[]
}

class WarningBadge extends WidgetType {
  readonly text: string
  constructor(text: string) {
    super()
    this.text = text
  }
  eq(other: WidgetType): boolean {
    return other instanceof WarningBadge && other.text === this.text
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-stat-warning-badge'
    span.textContent = '⚠'
    span.setAttribute('title', this.text)
    span.setAttribute('aria-label', `Stat warning: ${this.text}`)
    return span
  }
  ignoreEvent(): boolean {
    return false
  }
}

/** Warnings for the open storylet, or null when the doc and store disagree on which one that is. */
function currentWarnings(view: EditorView): Map<string, MarkerWarning[]> | null {
  const storyletId = useStoryletStore.getState().activeStoryletId
  const book = getLiveBook(view.state)
  if (!storyletId || !book) return null
  const storylet = book.storylets.find((s) => s.id === storyletId)
  if (!storylet || (storylet.content ?? '') !== view.state.doc.toString()) return null
  const { characters, markers } = view.state.field(characterSnapshotField)
  if (characters.length === 0) return null
  return computeMarkerWarnings(book, storyletId, characters, markers)
}

function scan(view: EditorView): { decorations: DecorationSet; ranges: WarnedRange[] } {
  const presentation = markerPresentation(view.state.field(renderModeField))
  const chipMode = view.state.field(statChipModeField, false) ?? 'chips'
  const none = { decorations: Decoration.none, ranges: [] }
  if (presentation === 'empty' || chipMode === 'hidden') return none
  const warnings = currentWarnings(view)
  if (!warnings || warnings.size === 0) return none
  const text = view.state.doc.toString()
  const re = new RegExp(STAT_MARKER_REGEX.source, 'g')
  const decos: Range<Decoration>[] = []
  const ranges: WarnedRange[] = []
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    const list = warnings.get(m[1])
    if (!list) continue
    const from = m.index
    const to = from + m[0].length
    ranges.push({ from, to, warnings: list })
    if (presentation === 'raw') decos.push(Decoration.mark({ class: 'cm-stat-warning-underline' }).range(from, to))
    decos.push(
      Decoration.widget({ widget: new WarningBadge(list.map((w) => w.message).join('\n')), side: 1 }).range(to),
    )
  }
  return { decorations: Decoration.set(decos, true), ranges }
}

const DEBOUNCE_MS = 400

const warningPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    ranges: WarnedRange[]
    private timer: ReturnType<typeof setTimeout> | null = null
    private view: EditorView

    constructor(view: EditorView) {
      this.view = view
      const r = scan(view)
      this.decorations = r.decorations
      this.ranges = r.ranges
    }

    update(update: ViewUpdate): void {
      const immediate =
        update.startState.field(characterSnapshotField) !== update.state.field(characterSnapshotField) ||
        update.transactions.some((tr) =>
          tr.effects.some((e) => e.is(refreshWarningsEffect) || e.is(setRenderModeEffect) || e.is(setStatChipModeEffect)),
        )
      if (immediate) {
        const r = scan(update.view)
        this.decorations = r.decorations
        this.ranges = r.ranges
        return
      }
      if (update.docChanged) {
        // Keep the old badges in place while typing; recompute when idle.
        this.decorations = this.decorations.map(update.changes)
        this.ranges = this.ranges
          .map((r) => ({ ...r, from: update.changes.mapPos(r.from, 1), to: update.changes.mapPos(r.to, -1) }))
          .filter((r) => r.to > r.from)
        this.schedule()
      }
    }

    schedule(): void {
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.timer = null
        this.view.dispatch({ effects: refreshWarningsEffect.of(null) })
      }, DEBOUNCE_MS)
    }

    destroy(): void {
      if (this.timer) clearTimeout(this.timer)
    }
  },
  { decorations: (v) => v.decorations },
)

function tooltipDom(view: EditorView, range: WarnedRange): HTMLElement {
  const dom = document.createElement('div')
  dom.className = 'cm-stat-warning-card'
  for (const w of range.warnings) {
    const row = document.createElement('div')
    row.className = 'cm-stat-warning-row'
    const msg = document.createElement('div')
    msg.className = 'cm-stat-warning-message'
    msg.textContent = w.message
    row.append(msg)
    if (w.fixes.length > 0 && !isFileLockedNow()) {
      const actions = document.createElement('div')
      actions.className = 'cm-stat-warning-actions'
      for (const fix of w.fixes) {
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.className = 'cm-stat-warning-fix'
        btn.textContent = fix.label
        btn.addEventListener('mousedown', (e) => e.preventDefault())
        btn.addEventListener('click', () => {
          applyMarkerWarningFix(w.markerId, fix)
          view.dispatch({ effects: closeHoverTooltips })
        })
        actions.append(btn)
      }
      row.append(actions)
    }
    dom.append(row)
  }
  return dom
}

const warningTooltip = hoverTooltip(
  (view, pos): Tooltip | null => {
    const plugin = view.plugin(warningPlugin)
    const range = plugin?.ranges.find((r) => pos >= r.from && pos <= r.to)
    if (!range) return null
    return { pos: range.to, above: true, create: (v) => ({ dom: tooltipDom(v, range) }) }
  },
  { hoverTime: 250 },
)

const warningTheme = EditorView.baseTheme({
  '.cm-stat-warning-badge': {
    display: 'inline-block',
    marginLeft: '1px',
    marginRight: '2px',
    color: '#f59e0b',
    fontSize: '0.7em',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    verticalAlign: 'super',
    lineHeight: '1',
    cursor: 'help',
    textDecoration: 'underline wavy #f59e0b',
    textUnderlineOffset: '3px',
  },
  '.cm-stat-warning-underline': {
    textDecoration: 'underline wavy #f59e0b',
    textUnderlineOffset: '3px',
  },
  '.cm-stat-warning-card': {
    maxWidth: '320px',
    padding: '6px 8px',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize: '12px',
    color: '#e5e7eb',
    backgroundColor: '#1f2937',
    border: '1px solid #374151',
    borderRadius: '6px',
  },
  '.cm-stat-warning-row + .cm-stat-warning-row': { marginTop: '6px', paddingTop: '6px', borderTop: '1px solid #374151' },
  '.cm-stat-warning-message': { color: '#fcd34d' },
  '.cm-stat-warning-actions': { display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' },
  '.cm-stat-warning-fix': {
    padding: '1px 6px',
    fontSize: '11px',
    color: '#d1d5db',
    backgroundColor: 'transparent',
    border: '1px solid #4b5563',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  '.cm-stat-warning-fix:hover': { borderColor: '#9ca3af', backgroundColor: '#374151' },
})

/** Requires `statMarkerExtension()` and `statRefExtension()` (snapshot + live book). */
export function statWarningExtension(): Extension {
  return [warningPlugin, warningTooltip, warningTheme]
}

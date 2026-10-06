import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type ViewUpdate,
} from '@codemirror/view'
import { Prec, StateEffect, StateField, type Extension } from '@codemirror/state'
import { completionStatus } from '@codemirror/autocomplete'
import { getCM } from '@replit/codemirror-vim'
import type { StatDelta } from '../../types'
import { findSentenceBefore, suggestFromSentence, type ProseSuggestion } from '../../lib/proseSuggest'
import { parseQuickEntry } from '../../lib/quickEntry'
import { findDocStatMarkers, insertStatDeltas, insertionStopOffset } from '../../lib/insertStatDelta'
import { useCharacterStore } from '../../stores/characterStore'
import { useEditorStore } from '../../stores/editorStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { useItemCatalogStore } from '../../stores/itemCatalogStore'
import { liveBookFor, stateLookupAt } from '../characters/statEntryContext'

// ---------------------------------------------------------------------------
// Ghost-chip stat suggestions. When the writer finishes a sentence (types
// . ! ? ] or pauses at a sentence end), only that sentence is matched locally
// (lib/proseSuggest). A hit shows one faint chip at the sentence end:
// Tab / click records it through the quick-entry parser + insertStatDeltas,
// Escape or typing on dismisses, × mutes the pattern.
// ---------------------------------------------------------------------------

export interface ActiveProseSuggestion {
  suggestion: ProseSuggestion
  /** Sentence start / end (the marker goes at `at`). */
  from: number
  at: number
  /** Sentence text — the chip goes away if the sentence is edited. */
  text: string
}

export const showProseSuggestion = StateEffect.define<ActiveProseSuggestion>({
  map: (v, changes) => ({ ...v, from: changes.mapPos(v.from, 1), at: changes.mapPos(v.at, -1) }),
})
export const clearProseSuggestion = StateEffect.define<null>()

const IDLE_MS = 1500
/** How far past the sentence end (whitespace only) the caret may wander. */
const MAX_TRAILING = 200

export const proseSuggestionField = StateField.define<ActiveProseSuggestion | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(showProseSuggestion)) return e.value
      if (e.is(clearProseSuggestion)) return null
    }
    if (!value || (!tr.docChanged && !tr.selection)) return value
    const next = tr.docChanged
      ? { ...value, from: tr.changes.mapPos(value.from, 1), at: tr.changes.mapPos(value.at, -1) }
      : value
    const sel = tr.state.selection.main
    if (!sel.empty || sel.head < next.at || sel.head - next.at > MAX_TRAILING) return null
    if (!/^\s*$/.test(tr.state.doc.sliceString(next.at, sel.head))) return null
    if (tr.state.doc.sliceString(next.from, next.at) !== next.text) return null
    return next
  },
  provide: (f) =>
    EditorView.decorations.from(f, (v) =>
      v ? Decoration.set([Decoration.widget({ widget: new GhostChipWidget(v.suggestion), side: 1 }).range(v.at)]) : Decoration.none,
    ),
})

// ---------------------------------------------------------------------------
// Widget
// ---------------------------------------------------------------------------

class GhostChipWidget extends WidgetType {
  readonly suggestion: ProseSuggestion
  constructor(suggestion: ProseSuggestion) {
    super()
    this.suggestion = suggestion
  }

  eq(other: WidgetType): boolean {
    return other instanceof GhostChipWidget && other.suggestion.text === this.suggestion.text
  }

  toDOM(view: EditorView): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-prose-suggest'
    span.setAttribute('role', 'button')
    span.setAttribute('aria-label', `Suggested stat change: ${this.suggestion.label}. Press Tab or click to record.`)
    span.title = `Record “${this.suggestion.text}” (Tab)`
    span.append(`＋ ${this.suggestion.label}`)
    const hint = document.createElement('span')
    hint.className = 'cm-prose-suggest-key'
    hint.textContent = 'Tab'
    span.append(hint)
    const mute = document.createElement('span')
    mute.className = 'cm-prose-suggest-mute'
    mute.setAttribute('role', 'button')
    mute.setAttribute('aria-label', "Don't suggest this again")
    mute.title = "Don't suggest this again"
    mute.textContent = '×'
    span.append(mute)

    span.addEventListener('mousedown', (e) => {
      e.preventDefault()
      e.stopPropagation()
      if (e.target instanceof Node && mute.contains(e.target)) muteProseSuggestion(view)
      else acceptProseSuggestion(view)
      view.focus()
    })
    return span
  }

  ignoreEvent(): boolean {
    return true
  }
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

function quickEntryContextAt(view: EditorView, at: number) {
  const { characters, markers } = useCharacterStore.getState()
  const { book, activeStoryletId } = useStoryletStore.getState()
  const offset = insertionStopOffset(at, findDocStatMarkers(view.state.doc.toString()), markers)
  return {
    characters,
    stateFor: stateLookupAt({
      book: liveBookFor(view, book, activeStoryletId),
      storyletId: activeStoryletId,
      characters,
      markers,
      offset,
    }),
  }
}

/** Record the visible suggestion at its sentence end. Returns false when none is showing. */
export function acceptProseSuggestion(view: EditorView): boolean {
  const active = view.state.field(proseSuggestionField, false)
  if (!active) return false
  view.dispatch({ effects: clearProseSuggestion.of(null) })
  const result = parseQuickEntry(active.suggestion.text, quickEntryContextAt(view, active.at))
  if (!result.ok) return true
  const head = view.state.selection.main.head
  const before = view.state.doc.length
  insertStatDeltas(view, result.ops, active.at)
  const grew = view.state.doc.length - before
  // Keep the caret where the writer left it (past any trailing spaces).
  const nextHead = head >= active.at ? head + grew : head
  if (view.state.selection.main.head !== nextHead) view.dispatch({ selection: { anchor: nextHead } })
  return true
}

/** Hide the visible suggestion and never offer its pattern(s) again. */
export function muteProseSuggestion(view: EditorView): void {
  const active = view.state.field(proseSuggestionField, false)
  if (!active) return
  useEditorStore.getState().muteStatSuggestions(active.suggestion.keys)
  view.dispatch({ effects: clearProseSuggestion.of(null) })
}

/** VIM is on and not in insert mode — Tab and friends belong to VIM. */
function vimOwnsKeys(view: EditorView): boolean {
  const cm = getCM(view)
  const vimState = (cm?.state as { vim?: { insertMode?: boolean } } | undefined)?.vim
  return !!vimState && !vimState.insertMode
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

const knownItemsCache = new WeakMap<Record<string, StatDelta[]>, string[]>()

/** Item names recorded by any marker (with the catalog: items nobody holds right now). */
function knownItemsFrom(markers: Record<string, StatDelta[]>): string[] {
  const cached = knownItemsCache.get(markers)
  if (cached) return cached
  const names = new Set<string>()
  for (const deltas of Object.values(markers)) {
    for (const { op } of deltas) {
      if (op.kind === 'itemAdd' || op.kind === 'itemFieldAdjust') names.add(op.name)
      else if (op.kind === 'listAdd') for (const raw of op.items) names.add(raw.replace(/\s*[x×]\s*\d+$/i, '').trim())
      else if (op.kind === 'equip' && op.itemName) names.add(op.itemName)
    }
  }
  const out = [...names].filter(Boolean)
  knownItemsCache.set(markers, out)
  return out
}

/** Match the sentence ending at the caret; show its suggestion. Returns the sentence key analysed. */
function analyze(view: EditorView, lastKey: string | null): string | null {
  const settings = useEditorStore.getState()
  if (!settings.statSuggestions) return lastKey
  const sel = view.state.selection.main
  if (!sel.empty) return lastKey
  const line = view.state.doc.lineAt(sel.head)
  const span = findSentenceBefore(line.text, sel.head - line.from)
  if (!span) return lastKey
  const from = line.from + span.from
  const at = line.from + span.to
  const key = `${from}:${span.text}`
  if (key === lastKey) return lastKey
  const current = view.state.field(proseSuggestionField, false)
  if (current && current.from === from && current.text === span.text) return key
  if (span.markerAfter) return key

  const { characters, markers } = useCharacterStore.getState()
  if (characters.length === 0) return key
  let lookup: ((id: string) => ReturnType<ReturnType<typeof stateLookupAt>>) | null = null
  const suggestion = suggestFromSentence(
    {
      sentence: span.text,
      before: span.before,
      recent: view.state.doc.sliceString(Math.max(0, line.from - 800), line.from),
    },
    {
      characters,
      knownItems: [...useItemCatalogStore.getState().items.map((i) => i.name), ...knownItemsFrom(markers)],
      muted: new Set(settings.mutedStatSuggestions),
      // Computed only if a rule needs someone's inventory.
      stateFor: (id) => {
        lookup ??= quickEntryContextAt(view, at).stateFor
        return lookup(id)
      },
    },
  )
  if (suggestion) view.dispatch({ effects: showProseSuggestion.of({ suggestion, from, at, text: span.text }) })
  return key
}

const TRIGGER = /[.!?\]]/

const analyzer = ViewPlugin.fromClass(
  class {
    private timer: ReturnType<typeof setTimeout> | null = null
    private immediate = false
    private lastKey: string | null = null
    private readonly unsubscribe: () => void

    private readonly view: EditorView

    constructor(view: EditorView) {
      this.view = view
      this.unsubscribe = useEditorStore.subscribe((state, prev) => {
        if (state.statSuggestions === prev.statSuggestions || state.statSuggestions) return
        if (this.view.state.field(proseSuggestionField, false)) {
          this.view.dispatch({ effects: clearProseSuggestion.of(null) })
        }
      })
    }

    update(update: ViewUpdate): void {
      if (!update.docChanged || !update.transactions.some((tr) => tr.isUserEvent('input.type'))) return
      const head = update.state.selection.main.head
      const typed = update.state.doc.sliceString(head - 1, head)
      // A space right after a terminator keeps the pending immediate check.
      if (this.immediate && /^[ \t]$/.test(typed)) return
      this.clear()
      if (!useEditorStore.getState().statSuggestions) return
      // Never dispatch inside an update — defer, immediately on a terminator.
      this.immediate = TRIGGER.test(typed)
      this.timer = setTimeout(() => this.run(), this.immediate ? 0 : IDLE_MS)
    }

    private run(): void {
      this.timer = null
      this.immediate = false
      this.lastKey = analyze(this.view, this.lastKey)
    }

    /** Drop a pending check (Escape means "not now"). */
    clear(): void {
      if (this.timer !== null) clearTimeout(this.timer)
      this.timer = null
      this.immediate = false
    }

    destroy(): void {
      this.clear()
      this.unsubscribe()
    }
  },
)

const keys = Prec.highest(
  EditorView.domEventHandlers({
    keydown(event, view) {
      const active = view.state.field(proseSuggestionField, false)
      if (event.key === 'Escape') {
        // Dismiss (and cancel a pending check), but let VIM / others still see Escape.
        view.plugin(analyzer)?.clear()
        if (active) view.dispatch({ effects: clearProseSuggestion.of(null) })
        return false
      }
      if (!active) return false
      if (event.key !== 'Tab' || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) return false
      if (completionStatus(view.state) === 'active' || vimOwnsKeys(view)) return false
      event.preventDefault()
      return acceptProseSuggestion(view)
    },
  }),
)

const theme = EditorView.baseTheme({
  '.cm-prose-suggest': {
    display: 'inline-block',
    maxWidth: '32em',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'pre',
    verticalAlign: 'text-bottom',
    margin: '0 3px',
    padding: '0 4px 0 6px',
    borderRadius: '4px',
    border: '1px dashed rgba(167, 243, 208, 0.35)',
    backgroundColor: 'transparent',
    color: 'rgba(167, 243, 208, 0.6)',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    fontSize: '0.72em',
    fontStyle: 'italic',
    fontWeight: '400',
    lineHeight: '1.6',
    cursor: 'pointer',
    userSelect: 'none',
    opacity: '0.75',
  },
  '.cm-prose-suggest:hover': {
    opacity: '1',
    backgroundColor: 'rgba(167, 243, 208, 0.06)',
  },
  '.cm-prose-suggest-key': {
    marginLeft: '6px',
    padding: '0 3px',
    borderRadius: '3px',
    backgroundColor: 'rgba(255,255,255,0.08)',
    color: '#9ca3af',
    fontStyle: 'normal',
    fontSize: '0.9em',
  },
  '.cm-prose-suggest-mute': {
    marginLeft: '4px',
    padding: '0 3px',
    color: '#6b7280',
    fontStyle: 'normal',
  },
  '.cm-prose-suggest-mute:hover': {
    color: '#e5e7eb',
  },
  // Light editor themes (e.g. Parchment): a green ink that reads on cream.
  '&light .cm-prose-suggest': {
    border: '1px dashed rgba(4, 120, 87, 0.45)',
    color: 'rgba(4, 120, 87, 0.85)',
  },
  '&light .cm-prose-suggest-key': {
    backgroundColor: 'rgba(68,52,32,0.08)',
    color: '#57534e',
  },
  '&light .cm-prose-suggest-mute:hover': {
    color: '#292524',
  },
})

/** Ghost-chip stat suggestions from finished sentences (gated by editorStore.statSuggestions). */
export function proseSuggestions(): Extension {
  return [proseSuggestionField, analyzer, keys, theme]
}

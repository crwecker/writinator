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
import type { PositionNote } from '../../types'
import { NOTE_MARKER_REGEX } from '../../lib/noteUtils'
import {
  renderModeField,
  setRenderModeEffect,
  markerPresentation,
} from './renderMode'

/**
 * Compact snapshot of notes-store state needed to render square widgets.
 * Mirrors only what the CodeMirror plugin actually reads, so React concerns
 * (subscriptions, selectors) stay in the wiring layer.
 */
export interface NotesSnapshot {
  positionNotes: Record<string, PositionNote>
}

const EMPTY_SNAPSHOT: NotesSnapshot = { positionNotes: {} }

/** StateEffect delivering a fresh snapshot into the editor state. */
export const setNotesSnapshotEffect = StateEffect.define<NotesSnapshot>()

/** Holds the latest NotesSnapshot — used by the decoration plugin. */
const notesSnapshotField = StateField.define<NotesSnapshot>({
  create: () => EMPTY_SNAPSHOT,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setNotesSnapshotEffect)) return e.value
    }
    return value
  },
})

/** Dispatch a new snapshot into the view. */
export function dispatchNotesSnapshot(
  view: EditorView,
  snapshot: NotesSnapshot
): void {
  view.dispatch({ effects: setNotesSnapshotEffect.of(snapshot) })
}

const EMPTY_NOTE_FALLBACK = 'New note'
const TOOLTIP_PREVIEW_LEN = 60
const NEUTRAL_COLOR = '#6b7280' // gray-500

/**
 * First-60-chars preview of a note body, collapsing whitespace. Used as the
 * native `title=` tooltip on the square widget. Empty bodies fall back to
 * a helpful "New note" placeholder so freshly-inserted anchors still hint
 * at meaning on hover.
 */
function buildNoteTooltip(note: PositionNote | undefined): string {
  const body = note?.body?.trim() ?? ''
  if (!body) return EMPTY_NOTE_FALLBACK
  const collapsed = body.replace(/\s+/g, ' ')
  if (collapsed.length <= TOOLTIP_PREVIEW_LEN) return collapsed
  return collapsed.slice(0, TOOLTIP_PREVIEW_LEN) + '…'
}

class NoteMarkerWidget extends WidgetType {
  readonly noteId: string
  readonly color: string
  readonly tooltip: string
  readonly ariaLabel: string

  constructor(
    noteId: string,
    color: string,
    tooltip: string,
    ariaLabel: string
  ) {
    super()
    this.noteId = noteId
    this.color = color
    this.tooltip = tooltip
    this.ariaLabel = ariaLabel
  }

  eq(other: WidgetType): boolean {
    if (!(other instanceof NoteMarkerWidget)) return false
    return (
      other.noteId === this.noteId &&
      other.color === this.color &&
      other.tooltip === this.tooltip &&
      other.ariaLabel === this.ariaLabel
    )
  }

  toDOM(): HTMLElement {
    const span = document.createElement('span')
    span.className = 'cm-note-marker-square'
    span.style.backgroundColor = this.color
    span.setAttribute('data-note-id', this.noteId)
    span.setAttribute('title', this.tooltip)
    span.setAttribute('role', 'button')
    span.setAttribute('aria-label', this.ariaLabel)
    span.tabIndex = 0
    return span
  }

  ignoreEvent(): boolean {
    // Let clicks/keypresses bubble so a delegated listener (Phase 7) can
    // pick them up from contentDOM.
    return false
  }
}

function buildDecorations(view: EditorView): DecorationSet {
  const presentation = markerPresentation(view.state.field(renderModeField))
  // In source mode the raw `<!-- note:uuid -->` text stays visible — no decoration.
  if (presentation === 'raw') return Decoration.none

  const snapshot = view.state.field(notesSnapshotField)

  const builder = new RangeSetBuilder<Decoration>()
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to)
    const re = new RegExp(NOTE_MARKER_REGEX.source, 'g')
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) {
      const start = from + m.index
      const end = start + m[0].length
      // clean mode: hide the marker text entirely with no widget.
      if (presentation === 'empty') {
        builder.add(start, end, Decoration.replace({}))
        continue
      }
      const noteId = m[1]
      const note = snapshot.positionNotes[noteId]
      const color = note?.color ?? NEUTRAL_COLOR
      const tooltip = buildNoteTooltip(note)
      const ariaLabel = `Note — ${tooltip}`
      builder.add(
        start,
        end,
        Decoration.replace({
          widget: new NoteMarkerWidget(noteId, color, tooltip, ariaLabel),
        })
      )
    }
  }
  return builder.finish()
}

const noteMarkerViewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }
    update(update: ViewUpdate): void {
      const snapshotChanged =
        update.startState.field(notesSnapshotField) !==
        update.state.field(notesSnapshotField)
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
    // motion across the square feel natural (jump over the whole widget).
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => {
        return view.plugin(plugin)?.decorations ?? Decoration.none
      }),
  }
)

const noteMarkerBaseTheme = EditorView.baseTheme({
  '.cm-note-marker-square': {
    display: 'inline-block',
    width: '8px',
    height: '8px',
    borderRadius: '2px',
    verticalAlign: 'middle',
    margin: '0 2px',
    cursor: 'pointer',
    boxShadow: '0 0 0 1px rgba(0,0,0,0.35) inset',
  },
  '.cm-note-marker-square:hover': {
    outline: '2px solid rgba(255,255,255,0.35)',
    outlineOffset: '1px',
  },
  '.cm-note-marker-square:focus-visible': {
    outline: '2px solid #fff',
    outlineOffset: '2px',
  },
})

/** Bundle of the StateField, ViewPlugin, and base theme. */
export function noteMarkerExtension(): Extension {
  return [notesSnapshotField, noteMarkerViewPlugin, noteMarkerBaseTheme]
}

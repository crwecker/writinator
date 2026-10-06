import { useEffect, useMemo, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { useCharacterStore } from '../../stores/characterStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { findDocStatMarkers, insertStatDeltas, insertionStopOffset } from '../../lib/insertStatDelta'
import type { QuickEntryContext, QuickEntryResult } from '../../lib/quickEntry'
import { QuickEntryInput } from './QuickEntryInput'
import { characterBefore, liveBookFor, popoverStyleAt, stateLookupAt } from './statEntryContext'

interface Props {
  open: boolean
  onClose: () => void
  editorView: EditorView | null
  /** Escape hatch to the full DeltaEditorModal at the same spot. */
  onOpenFullEditor: () => void
}

const WIDTH = 420

// The character the last entry ended on — "HP +5" right after "Kael -3 HP"
// keeps meaning Kael, even across popovers.
let lastCharacterId: string | null = null

/**
 * Ctrl/Cmd+Shift+. — a one-line stat-change entry anchored at the cursor.
 * Saves as one marker at the cursor (or merged into the marker abutting it).
 */
export function QuickEntryPopover({ open, onClose, editorView, onOpenFullEditor }: Props) {
  const characters = useCharacterStore((s) => s.characters)
  const markers = useCharacterStore((s) => s.markers)
  const book = useStoryletStore((s) => s.book)
  const storyletId = useStoryletStore((s) => s.activeStoryletId)
  // Where the marker goes: the cursor when the popover opened.
  const [at] = useState(() => editorView?.state.selection.main.head ?? 0)
  const panelRef = useRef<HTMLDivElement>(null)

  const context = useMemo<QuickEntryContext | null>(() => {
    if (!editorView) return null
    const text = editorView.state.doc.toString()
    const liveBook = liveBookFor(editorView, book, storyletId)
    const offset = insertionStopOffset(at, findDocStatMarkers(text), markers)
    const remembered = lastCharacterId && characters.some((c) => c.id === lastCharacterId) ? lastCharacterId : null
    return {
      characters,
      stateFor: stateLookupAt({ book: liveBook, storyletId, characters, markers, offset }),
      defaultCharacterId:
        characterBefore(text, markers, at + 1) ?? remembered ?? (characters.length === 1 ? characters[0].id : null),
    }
  }, [editorView, book, storyletId, characters, markers, at])

  // Click outside closes, like Escape.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, onClose])

  if (!open || !editorView || !context) return null

  function close() {
    onClose()
    editorView?.focus()
  }

  function submit(result: QuickEntryResult) {
    if (!editorView) return
    insertStatDeltas(editorView, result.ops, at)
    lastCharacterId = result.lastCharacterId
    close()
  }

  return (
    <div
      ref={panelRef}
      data-testid="quick-entry"
      style={popoverStyleAt(editorView, at, WIDTH)}
      className="z-50 rounded-lg border border-gray-700 bg-gray-900/95 p-2.5 shadow-2xl backdrop-blur-sm"
    >
      <QuickEntryInput context={context} onSubmit={submit} onCancel={close} />
      <div className="mt-2 flex items-center justify-between text-[10px] text-gray-500">
        <span>Enter to save · Tab to complete · Esc to cancel</span>
        <button
          type="button"
          data-testid="quick-entry-full-editor"
          onClick={() => {
            onClose()
            onOpenFullEditor()
          }}
          className="text-gray-400 underline-offset-2 hover:text-gray-200 hover:underline"
        >
          Open full editor
        </button>
      </div>
    </div>
  )
}

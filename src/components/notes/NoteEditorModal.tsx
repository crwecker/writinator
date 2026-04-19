import { useEffect, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { useNotesStore } from '../../stores/notesStore'
import { NOTE_MARKER_REGEX } from '../../lib/noteUtils'

interface Props {
  open: boolean
  onClose: () => void
  noteId: string | null
  mode: 'create' | 'edit'
  editorView: EditorView | null
}

export function NoteEditorModal({
  open,
  onClose,
  noteId,
  mode,
  editorView,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const note = useNotesStore((s) =>
    noteId ? s.positionNotes[noteId] : undefined,
  )
  const updatePositionNote = useNotesStore((s) => s.updatePositionNote)
  const removePositionNote = useNotesStore((s) => s.removePositionNote)

  const [body, setBody] = useState<string>('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Seed draft whenever the modal opens (or the target note changes).
  useEffect(() => {
    if (!open) return
    setConfirmDelete(false)
    setBody(note?.body ?? '')
    // Focus the textarea after the panel renders.
    const t = setTimeout(() => textareaRef.current?.focus(), 0)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, noteId])

  // Escape to close.
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Outside click to close. Defer registration by one tick so the click
  // that opened the modal doesn't immediately close it.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, onClose])

  if (!open || !noteId) return null

  function handleSave() {
    if (!noteId) return
    updatePositionNote(noteId, { body })
    onClose()
  }

  function handleDelete() {
    if (!noteId) return
    if (editorView) {
      const doc = editorView.state.doc.toString()
      const re = new RegExp(NOTE_MARKER_REGEX.source, 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(doc)) !== null) {
        if (m[1] === noteId) {
          editorView.dispatch({
            changes: { from: m.index, to: m.index + m[0].length, insert: '' },
          })
          break
        }
      }
    }
    removePositionNote(noteId)
    onClose()
  }

  const shortId = noteId.slice(0, 8)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        ref={panelRef}
        data-testid="note-editor-modal"
        className="w-[min(92vw,640px)] max-h-[90vh] bg-gray-900 border border-gray-700 rounded-xl shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-gray-200">
              {mode === 'create' ? 'New Note' : 'Edit Note'}
            </span>
            <span className="text-[11px] text-gray-500 font-mono">{shortId}</span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-xs"
          >
            Close
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          <label className="block text-xs text-gray-400 mb-1">Body</label>
          <textarea
            ref={textareaRef}
            data-testid="note-editor-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a note…"
            className="w-full min-h-[160px] resize-y bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-200 placeholder:text-gray-600 outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-700 px-5 py-3 shrink-0">
          <div className="flex items-center gap-2">
            {confirmDelete ? (
              <div className="flex items-center gap-1">
                <span className="text-xs text-gray-400">Delete note?</span>
                <button
                  data-testid="note-editor-delete-confirm"
                  onClick={handleDelete}
                  className="text-xs bg-red-900 hover:bg-red-800 text-red-200 rounded px-2 py-1"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-2 py-1"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                data-testid="note-editor-delete"
                onClick={() => setConfirmDelete(true)}
                className="text-xs text-red-400 hover:text-red-300 border border-red-900/50 hover:border-red-700 rounded px-2 py-1"
              >
                Delete note
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded px-2 py-1"
            >
              Cancel
            </button>
            <button
              data-testid="note-editor-save"
              onClick={handleSave}
              className="text-xs bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

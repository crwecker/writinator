import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useNotesStore } from '../../stores/notesStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { extractNotes } from '../../lib/noteUtils'
import type { PositionNote, Storylet, StoryletNote } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
}

interface StoryletSection {
  storylet: Storylet
  notes: Array<{ id: string; offset: number; note: PositionNote | undefined }>
}

interface StoryletNotesSection {
  storylet: Storylet
  notes: StoryletNote[]
}

function previewBody(body: string): string {
  const collapsed = body.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= 60) return collapsed
  return collapsed.slice(0, 60).trimEnd() + '\u2026'
}

function nowIso(): string {
  return new Date().toISOString()
}

// ---------------------------------------------------------------------------
// StoryletNoteRow — inline-edited textarea with debounced auto-save (400ms).
// Also renders a small trash button with a two-step confirm.
// ---------------------------------------------------------------------------

interface StoryletNoteRowProps {
  storyletId: string
  note: StoryletNote
}

function StoryletNoteRow({ storyletId, note }: StoryletNoteRowProps) {
  const updateStoryletNote = useNotesStore((s) => s.updateStoryletNote)
  const removeStoryletNote = useNotesStore((s) => s.removeStoryletNote)

  const [draft, setDraft] = useState<string>(note.body)
  const [lastSyncedUpdatedAt, setLastSyncedUpdatedAt] = useState<string>(
    note.updatedAt,
  )
  const [confirmDelete, setConfirmDelete] = useState(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Reconcile external updates (file load, undo) using the "derived state
  // from props" pattern. When the store-owned updatedAt moves forward and we
  // have no pending save, re-sync the draft.
  if (note.updatedAt !== lastSyncedUpdatedAt) {
    setLastSyncedUpdatedAt(note.updatedAt)
    if (note.body !== draft) {
      setDraft(note.body)
    }
  }

  // Flush on unmount so we don't lose pending edits when the panel closes.
  useEffect(() => {
    return () => {
      if (saveTimer.current !== null) {
        clearTimeout(saveTimer.current)
        saveTimer.current = null
      }
    }
  }, [])

  const handleChange = useCallback(
    (value: string) => {
      setDraft(value)
      if (saveTimer.current !== null) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => {
        updateStoryletNote(storyletId, note.id, { body: value })
        saveTimer.current = null
      }, 400)
    },
    [storyletId, note.id, updateStoryletNote],
  )

  const handleDelete = useCallback(() => {
    if (saveTimer.current !== null) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    removeStoryletNote(storyletId, note.id)
  }, [storyletId, note.id, removeStoryletNote])

  return (
    <div
      data-testid="storylet-note-row"
      data-note-id={note.id}
      className="relative group"
    >
      <textarea
        data-testid="storylet-note-textarea"
        value={draft}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Write a storylet note…"
        className="w-full min-h-[60px] resize-none bg-gray-800/40 border border-gray-700 rounded px-2 py-1.5 pr-7 text-sm text-gray-200 placeholder:text-gray-600 focus:outline-none focus:border-blue-500"
      />
      <div className="absolute top-1 right-1 flex items-center gap-1">
        {confirmDelete ? (
          <>
            <button
              data-testid="storylet-note-delete-confirm"
              onClick={handleDelete}
              className="text-[10px] bg-red-900 hover:bg-red-800 text-red-200 rounded px-1.5 py-0.5"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-1.5 py-0.5"
            >
              No
            </button>
          </>
        ) : (
          <button
            data-testid="storylet-note-delete"
            onClick={() => setConfirmDelete(true)}
            title="Delete note"
            className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-500 hover:text-red-400 p-0.5 transition-opacity"
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// StoryletNotesGroup — sub-header + list of storylet notes + "+ Note" button.
// ---------------------------------------------------------------------------

interface StoryletNotesGroupProps {
  storylet: Storylet
  notes: StoryletNote[]
}

function StoryletNotesGroup({ storylet, notes }: StoryletNotesGroupProps) {
  const addStoryletNote = useNotesStore((s) => s.addStoryletNote)

  const handleAdd = useCallback(() => {
    const timestamp = nowIso()
    const newNote: StoryletNote = {
      id: crypto.randomUUID(),
      storyletId: storylet.id,
      body: '',
      tags: [],
      createdAt: timestamp,
      updatedAt: timestamp,
    }
    addStoryletNote(storylet.id, newNote)
  }, [storylet.id, addStoryletNote])

  return (
    <div
      data-testid={`storylet-notes-group-${storylet.id}`}
      className="space-y-2"
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] uppercase tracking-wide text-gray-400">
          {storylet.name}
        </span>
        <button
          data-testid="storylet-note-add"
          onClick={handleAdd}
          className="text-[11px] text-gray-400 hover:text-gray-200 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded px-2 py-0.5"
        >
          + Note
        </button>
      </div>
      {notes.length === 0 ? (
        <div className="text-[11px] text-gray-600 italic px-1">
          No storylet notes yet.
        </div>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => (
            <StoryletNoteRow
              key={note.id}
              storyletId={storylet.id}
              note={note}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// NotesPanel
// ---------------------------------------------------------------------------

export function NotesPanel({ open, onClose }: Props) {
  const book = useStoryletStore((s) => s.book)
  const activeStoryletId = useStoryletStore((s) => s.activeStoryletId)
  const positionNotes = useNotesStore((s) => s.positionNotes)
  const storyletNotes = useNotesStore((s) => s.storyletNotes)

  // Active storylet (or fallback to first) is pinned at the top. Any other
  // storylets with notes render below in a secondary list.
  const storyletNotesSections = useMemo<{
    active: StoryletNotesSection | null
    others: StoryletNotesSection[]
  }>(() => {
    if (!book) return { active: null, others: [] }
    const active =
      book.storylets.find((s) => s.id === activeStoryletId) ??
      book.storylets[0] ??
      null

    const activeSection: StoryletNotesSection | null = active
      ? { storylet: active, notes: storyletNotes[active.id] ?? [] }
      : null

    const others: StoryletNotesSection[] = []
    for (const storylet of book.storylets) {
      if (active && storylet.id === active.id) continue
      const notes = storyletNotes[storylet.id]
      if (!notes || notes.length === 0) continue
      others.push({ storylet, notes })
    }
    return { active: activeSection, others }
  }, [book, activeStoryletId, storyletNotes])

  const sections = useMemo<StoryletSection[]>(() => {
    if (!book) return []
    const out: StoryletSection[] = []
    for (const storylet of book.storylets) {
      const extracted = extractNotes(storylet.content ?? '')
      if (extracted.length === 0) continue
      out.push({
        storylet,
        notes: extracted.map((n) => ({
          id: n.id,
          offset: n.offset,
          note: positionNotes[n.id],
        })),
      })
    }
    return out
  }, [book, positionNotes])

  const totalPositionNotes = useMemo(
    () => sections.reduce((sum, s) => sum + s.notes.length, 0),
    [sections],
  )

  if (!open) return null

  return (
    <div
      data-testid="notes-panel"
      className="flex flex-col bg-gray-900 border-l border-gray-700 h-full w-[320px] shrink-0 overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <span className="text-sm font-medium text-gray-200">Notes</span>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 text-xs"
        >
          Close
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-4">
        {/* Pinned: Storylet notes ----------------------------------------- */}
        {storyletNotesSections.active && (
          <section
            data-testid="storylet-notes-section"
            className="space-y-3"
          >
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              Storylet notes
            </div>
            <StoryletNotesGroup
              storylet={storyletNotesSections.active.storylet}
              notes={storyletNotesSections.active.notes}
            />
            {storyletNotesSections.others.length > 0 && (
              <div
                data-testid="storylet-notes-others"
                className="pt-2 border-t border-gray-800 space-y-3"
              >
                {storyletNotesSections.others.map((s) => (
                  <StoryletNotesGroup
                    key={s.storylet.id}
                    storylet={s.storylet}
                    notes={s.notes}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {/* Position notes ------------------------------------------------- */}
        {totalPositionNotes > 0 && (
          <section className="space-y-2">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
              Position notes
            </div>
            {sections.map((section) => (
              <div
                key={section.storylet.id}
                data-testid={`notes-panel-section-${section.storylet.id}`}
                className="border border-gray-800 rounded overflow-hidden"
              >
                <div className="px-2 py-1.5 bg-gray-800/60 text-[11px] uppercase tracking-wide text-gray-400">
                  {section.storylet.name}
                </div>
                <ul className="divide-y divide-gray-800/60">
                  {section.notes.map(({ id, note }) => {
                    const body = note?.body ?? ''
                    const preview = previewBody(body)
                    const isEmpty = preview.length === 0
                    const tags = note?.tags ?? []
                    const color = note?.color ?? '#6b7280'
                    return (
                      <li
                        key={id}
                        data-testid="notes-panel-note-row"
                        data-note-id={id}
                        className="flex items-start gap-2 px-2 py-2"
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-sm shrink-0 translate-y-[3px]"
                          style={{ backgroundColor: color }}
                          title={note?.color ? `Color ${note.color}` : 'No color'}
                        />
                        <div className="flex-1 min-w-0 space-y-1">
                          <div
                            className={`text-[12px] leading-snug truncate ${
                              isEmpty ? 'text-gray-600 italic' : 'text-gray-200'
                            }`}
                            title={isEmpty ? '' : body}
                          >
                            {isEmpty ? '(empty)' : preview}
                          </div>
                          {tags.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {tags.map((t) => (
                                <span
                                  key={t}
                                  className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700"
                                >
                                  {t}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ))}
          </section>
        )}

        {/* Empty state — only when there is no book at all. */}
        {!book && (
          <div
            data-testid="notes-panel-empty"
            className="text-center text-xs text-gray-500 py-8"
          >
            No notes yet.
          </div>
        )}
      </div>
    </div>
  )
}

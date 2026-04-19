import { useMemo } from 'react'
import { useNotesStore } from '../../stores/notesStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { extractNotes } from '../../lib/noteUtils'
import type { PositionNote, Storylet } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
}

interface StoryletSection {
  storylet: Storylet
  notes: Array<{ id: string; offset: number; note: PositionNote | undefined }>
}

function previewBody(body: string): string {
  const collapsed = body.replace(/\s+/g, ' ').trim()
  if (collapsed.length <= 60) return collapsed
  return collapsed.slice(0, 60).trimEnd() + '\u2026'
}

export function NotesPanel({ open, onClose }: Props) {
  const book = useStoryletStore((s) => s.book)
  const positionNotes = useNotesStore((s) => s.positionNotes)

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

  const totalNotes = useMemo(
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
      <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {totalNotes === 0 ? (
          <div
            data-testid="notes-panel-empty"
            className="text-center text-xs text-gray-500 py-8"
          >
            No notes yet.
          </div>
        ) : (
          sections.map((section) => (
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
          ))
        )}
      </div>
    </div>
  )
}

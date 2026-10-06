import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useCharacterStore } from '../../stores/characterStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { storyletStartState } from '../../lib/storyletStartState'

const MAX_CHARACTERS = 6

/** Floating card: each character's key stats as the storylet opens. */
export function StoryletStateCard({ storyletId, top, left }: { storyletId: string; top: number; left: number }) {
  const book = useStoryletStore((s) => s.book)
  const characters = useCharacterStore((s) => s.characters)
  const markers = useCharacterStore((s) => s.markers)
  const states = useMemo(
    () => (book ? storyletStartState(book, storyletId, characters.slice(0, MAX_CHARACTERS), markers) : []),
    [book, storyletId, characters, markers],
  )
  if (states.length === 0) return null
  return createPortal(
    <div
      data-testid="storylet-state-card"
      role="tooltip"
      className="fixed z-50 w-60 rounded-md border border-gray-700 bg-gray-900/95 px-3 py-2 shadow-xl pointer-events-none"
      style={{ top, left }}
    >
      <div className="mb-1.5 text-[10px] uppercase tracking-wider text-gray-500">As this chapter opens</div>
      <div className="space-y-2">
        {states.map((s) => (
          <div key={s.characterId}>
            <div className="text-xs font-medium" style={{ color: s.color }}>{s.name}</div>
            <div className="mt-0.5 grid grid-cols-[auto_1fr] gap-x-3 text-[11px]">
              {s.rows.map((r) => (
                <div key={r.label} className="contents">
                  <span className="text-gray-500">{r.label}</span>
                  <span className="text-gray-200 font-mono truncate">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {characters.length > MAX_CHARACTERS && (
        <div className="mt-1.5 text-[10px] text-gray-600">+{characters.length - MAX_CHARACTERS} more</div>
      )}
    </div>,
    document.body,
  )
}

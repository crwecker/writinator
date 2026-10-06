import { useEffect, useRef, useState } from 'react'
import { ScrollText } from 'lucide-react'
import { useWriteathonStore } from '../../stores/writeathonStore'
import { useGameSettingsStore } from '../../stores/gameSettingsStore'
import { showToast } from '../../stores/genericToastStore'
import { createBoardQuest } from '../../lib/writeathon'
import { noteQuestDescription, noteQuestTitle } from '../../lib/noteQuest'

const GOALS = [250, 500, 1000, 2000]

/** "Make quest": pin a villager request titled from this note, with a chosen word goal. */
export function NoteQuestButton({ body, testIdPrefix = 'note' }: { body: string; testIdPrefix?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey, true)
    }
  }, [open])

  function pin(goal: number) {
    const title = noteQuestTitle(body)
    const quest = createBoardQuest('villager', goal, {
      title,
      description: noteQuestDescription(body) || undefined,
    })
    useWriteathonStore.getState().addVillagerQuest(quest)
    setOpen(false)
    if (!useGameSettingsStore.getState().quietMode) showToast(`Pinned to the Quest Board: ${title}`, 'success')
  }

  return (
    <span ref={ref} className="relative inline-flex">
      <button
        type="button"
        data-testid={`${testIdPrefix}-make-quest`}
        onClick={() => setOpen((v) => !v)}
        title="Make quest"
        aria-expanded={open}
        className="text-gray-500 hover:text-amber-300 p-0.5 rounded hover:bg-gray-800"
      >
        <ScrollText size={12} />
      </button>
      {open && (
        <span className="absolute right-0 top-full z-30 mt-1 w-44 rounded-lg border border-gray-700 bg-gray-900 p-2 text-[11px] text-gray-300 shadow-xl">
          <span className="mb-1.5 block text-gray-400">Make a quest from this note:</span>
          <span className="flex flex-wrap gap-1">
            {GOALS.map((g) => (
              <button
                key={g}
                type="button"
                data-testid={`${testIdPrefix}-quest-goal-${g}`}
                onClick={() => pin(g)}
                className="rounded bg-gray-800 px-1.5 py-0.5 tabular-nums text-gray-200 hover:bg-amber-600 hover:text-gray-900"
              >
                {g.toLocaleString()} words
              </button>
            ))}
          </span>
        </span>
      )}
    </span>
  )
}

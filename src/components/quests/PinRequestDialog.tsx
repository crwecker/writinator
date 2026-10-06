import { useEffect, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useWriteathonStore } from '../../stores/writeathonStore'
import { createBoardQuest } from '../../lib/writeathon'
import { GuildButton } from './QuestUi'

const WORD_GOAL_PRESETS = [250, 500, 1000, 2000, 5000]
const TIME_PRESETS = [10, 15, 30, 60]

interface PinRequestDialogProps {
  open: boolean
  onClose: () => void
}

function Preset({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-semibold tabular-nums transition-colors ${
        active
          ? 'bg-amber-500 text-stone-950'
          : 'border border-stone-700 bg-stone-900 text-stone-300 hover:border-amber-600 hover:text-amber-200'
      }`}
    >
      {children}
    </button>
  )
}

/** Write your own quest and pin it to the board as a villager request. */
export function PinRequestDialog({ open, onClose }: PinRequestDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [wordGoal, setWordGoal] = useState('500')
  const [timed, setTimed] = useState(false)
  const [minutes, setMinutes] = useState('15')

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!open) return null

  const goal = parseInt(wordGoal, 10)
  const mins = parseInt(minutes, 10)
  const goalValid = Number.isFinite(goal) && goal >= 1 && goal <= 100000
  const timeValid = !timed || (Number.isFinite(mins) && mins >= 1 && mins <= 1440)
  const canPin = goalValid && timeValid

  function handlePin() {
    if (!canPin) return
    const quest = createBoardQuest('villager', goal, {
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      timeMinutes: timed ? mins : undefined,
    })
    useWriteathonStore.getState().addVillagerQuest(quest)
    setTitle('')
    setDescription('')
    onClose()
  }

  const input =
    'w-full rounded-lg border border-stone-700 bg-stone-950/70 px-3 py-2 text-sm text-stone-100 placeholder-stone-500 outline-none transition-colors focus:border-amber-500'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4 backdrop-blur-[2px]" onMouseDown={onClose}>
      <div
        role="dialog"
        aria-label="Pin a request"
        className="w-full max-w-md rounded-2xl border border-amber-800/50 bg-stone-900 p-5 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h3 className="font-serif text-xl font-semibold text-amber-100">Pin a request</h3>
            <p className="text-sm text-stone-400">Set your own writing goal. It pays like any other quest.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-stone-500 hover:text-stone-200" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-400">Title</span>
            <input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Write ${goalValid ? goal.toLocaleString() : '…'} words`}
              maxLength={80}
              className={input}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-stone-400">What's it for? (optional)</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Finish the tavern scene…"
              maxLength={200}
              rows={2}
              className={`${input} resize-none`}
            />
          </label>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-stone-400">Word goal</span>
            <div className="flex flex-wrap items-center gap-1.5">
              {WORD_GOAL_PRESETS.map((g) => (
                <Preset key={g} active={goal === g} onClick={() => setWordGoal(String(g))}>
                  {g.toLocaleString()}
                </Preset>
              ))}
              <input
                type="number"
                min={1}
                max={100000}
                value={wordGoal}
                onChange={(e) => setWordGoal(e.target.value)}
                aria-label="Custom word goal"
                className={`${input} w-24 py-1 text-xs`}
              />
            </div>
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-stone-300">
              <input
                type="checkbox"
                checked={timed}
                onChange={(e) => setTimed(e.target.checked)}
                className="h-4 w-4 accent-amber-500"
              />
              Race the clock for a bigger reward
            </label>
            {timed && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-6">
                {TIME_PRESETS.map((t) => (
                  <Preset key={t} active={mins === t} onClick={() => setMinutes(String(t))}>
                    {t} min
                  </Preset>
                ))}
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  aria-label="Custom minutes"
                  className={`${input} w-20 py-1 text-xs`}
                />
              </div>
            )}
          </div>

          {!goalValid && <p className="text-xs text-red-400">Word goal must be between 1 and 100,000.</p>}
          {goalValid && !timeValid && <p className="text-xs text-red-400">Time must be between 1 and 1,440 minutes.</p>}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <GuildButton variant="ghost" onClick={onClose}>Cancel</GuildButton>
          <GuildButton onClick={handlePin} disabled={!canPin}>Pin to board</GuildButton>
        </div>
      </div>
    </div>
  )
}

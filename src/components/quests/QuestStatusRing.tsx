import { useImageRevealStore } from '../../stores/imageRevealStore'
import type { ImageRevealSession } from '../../types'

/** The active quest closest to done (by share of its goal). */
function nearest(sessions: ImageRevealSession[]): ImageRevealSession | undefined {
  let best: ImageRevealSession | undefined
  for (const s of sessions) {
    if (!best || s.wordsWritten / s.wordGoal > best.wordsWritten / best.wordGoal) best = s
  }
  return best
}

const SIZE = 14
const STROKE = 2
const R = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * R

/**
 * Status-bar progress ring + "312 / 500" for the active quest nearest to done.
 * Subscribes on its own (primitive selectors) so word updates re-render only
 * this, never the shell. Stays visible in quiet mode.
 */
export function QuestStatusRing({ onOpen }: { onOpen: () => void }) {
  const written = useImageRevealStore((s) => nearest(s.activeSessions)?.wordsWritten ?? -1)
  const goal = useImageRevealStore((s) => nearest(s.activeSessions)?.wordGoal ?? 0)
  const title = useImageRevealStore((s) => nearest(s.activeSessions)?.title)
  const count = useImageRevealStore((s) => s.activeSessions.length)

  if (written < 0 || goal <= 0) return null

  const progress = Math.min(written / goal, 1)
  const label = `${written.toLocaleString()} / ${goal.toLocaleString()}`
  const more = count > 1 ? ` (+${count - 1} more)` : ''

  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex items-center gap-1.5 tabular-nums text-stone-400 transition-colors hover:text-amber-200"
      title={`${title ?? 'Quest'}: ${label} words${more}. Open the quest journal.`}
      aria-label={`${title ?? 'Quest'} progress ${label} words`}
    >
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90" aria-hidden="true">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" strokeWidth={STROKE} className="stroke-stone-700" />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          className="stroke-amber-400 transition-[stroke-dashoffset] duration-500"
        />
      </svg>
      {label}
    </button>
  )
}

import { useEffect, useState } from 'react'
import { getTimerState } from '../../lib/timer'
import { CONSUMABLES, isPassiveConsumable } from '../../lib/items'

// Passive items (Streak Freeze) work on their own and are never used from a quest.
const QUEST_CONSUMABLES = CONSUMABLES.filter((c) => !isPassiveConsumable(c))
import type { ImageRevealSession } from '../../types'

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

export function PhotographerCredit({ session }: { session: ImageRevealSession }) {
  if (!session.photographer) return null
  return (
    <p className="text-center text-gray-500 text-[10px] mt-2">
      Photo by{' '}
      {session.photographerUrl ? (
        <a
          href={session.photographerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-gray-300 underline"
        >
          {session.photographer}
        </a>
      ) : (
        session.photographer
      )}{' '}
      on Unsplash
    </p>
  )
}

// -----------

interface ProgressBarProps {
  session: ImageRevealSession
  showText?: boolean
}

export function ProgressBar({ session, showText = true }: ProgressBarProps) {
  const progress = Math.min(session.wordsWritten / session.wordGoal, 1)
  const remaining = Math.max(session.wordGoal - session.wordsWritten, 0)

  return (
    <div>
      {showText && (
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-gray-400 tabular-nums">
            {session.wordsWritten.toLocaleString()} / {session.wordGoal.toLocaleString()}
          </span>
          <span className="text-gray-500 tabular-nums">
            {remaining.toLocaleString()} left
          </span>
        </div>
      )}
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 bg-amber-500"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  )
}

// -----------

interface SessionTimerProps {
  session: ImageRevealSession
  isPaused: boolean
  pauseStartedAt: number | null
  compact?: boolean
}

/** Countdown display for a single timed session (display only — expiry is handled by the store). */
export function SessionTimer({ session, isPaused, pauseStartedAt, compact = false }: SessionTimerProps) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500)
    return () => clearInterval(id)
  }, [])

  if (!session.timeMinutes) return null

  const totalSeconds = session.timeMinutes * 60
  const startedAtMs = Date.parse(session.startedAt)
  const timerState = getTimerState(
    startedAtMs,
    totalSeconds,
    session.pausedDuration ?? 0,
    isPaused && pauseStartedAt !== null ? pauseStartedAt : undefined,
  )

  const pct = timerState.percentRemaining
  const timerColor =
    pct > 50
      ? 'text-white'
      : pct > 25
        ? 'text-amber-400'
        : pct > 10
          ? 'text-orange-400'
          : 'text-red-400'
  const pulse = pct <= 10 ? 'animate-pulse' : ''

  if (compact) {
    return (
      <span className={`text-xs font-mono font-semibold tabular-nums ${timerColor} ${pulse}`}>
        {isPaused ? 'PAUSED' : formatTime(timerState.remainingSeconds)}
      </span>
    )
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-gray-500">Time remaining</span>
      <span className={`text-sm font-mono font-semibold tabular-nums ${timerColor} ${pulse}`}>
        {isPaused ? <span className="text-amber-400">PAUSED</span> : formatTime(timerState.remainingSeconds)}
      </span>
    </div>
  )
}

// -----------

interface ConsumableButtonsProps {
  inventory: Record<string, number>
  onUse: (itemId: string) => void
}

export function ConsumableButtons({ inventory, onUse }: ConsumableButtonsProps) {
  if (QUEST_CONSUMABLES.length === 0) return null
  return (
    <div>
      <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">Consumables</p>
      <div className="flex items-center gap-2 flex-wrap">
        {QUEST_CONSUMABLES.map((item) => {
          const count = inventory[item.id] ?? 0
          return (
            <button
              key={item.id}
              onClick={() => onUse(item.id)}
              disabled={count === 0}
              title={`${item.name}: ${item.description}`}
              className="relative bg-gray-700 hover:bg-gray-600 rounded p-1.5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <span className="text-base leading-none">{item.icon}</span>
              {count > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-600 text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

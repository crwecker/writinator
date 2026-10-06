import { useEffect, useRef, useState } from 'react'
import { useWriteathonStore } from '../../stores/writeathonStore'
import { useEditorStore } from '../../stores/editorStore'
import { dayStatusOf, getWriteathonToday, type WriteathonDayStatus } from '../../lib/writeathon'
import { formatDayLabel } from '../../lib/days'
import type { MilestoneTier } from '../../types'

interface JourneyBarProps {
  bookWordCount: number
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

const TIER_FILL: Record<MilestoneTier, string> = {
  apprentice: 'bg-emerald-400',
  journeyman: 'bg-sky-400',
  master: 'bg-fuchsia-400',
  legendary: 'bg-amber-300',
}

const STATUS_TEXT: Record<WriteathonDayStatus, string> = {
  paid: 'target met',
  missed: 'missed',
  today: 'today',
  upcoming: 'upcoming',
}

/** Writeathon journey: word progress toward the goal, with one marker per calendar date. */
export function JourneyBar({ bookWordCount }: JourneyBarProps) {
  const config = useWriteathonStore((s) => s.config)
  const milestones = useWriteathonStore((s) => s.milestones)
  const distractionFree = useEditorStore((s) => s.distractionFree)

  // Pop animation for dates that just paid out.
  const [justCompleted, setJustCompleted] = useState<Set<number>>(new Set())
  const paidRef = useRef<Set<number> | null>(null)

  useEffect(() => {
    const paid = new Set(milestones.filter((m) => m.completed).map((m) => m.blockNumber))
    const prev = paidRef.current
    paidRef.current = paid
    if (prev === null) return
    const fresh = [...paid].filter((n) => !prev.has(n))
    if (fresh.length === 0) return
    const add = setTimeout(() => setJustCompleted((s) => new Set([...s, ...fresh])), 0)
    const remove = setTimeout(() => {
      setJustCompleted((s) => new Set([...s].filter((n) => !fresh.includes(n))))
    }, 700)
    return () => {
      clearTimeout(add)
      clearTimeout(remove)
    }
  }, [milestones])

  if (!config?.active || milestones.length === 0) return null

  const { startingWordCount, targetWordCount } = config
  const span = targetWordCount - startingWordCount
  const fillPercent = span > 0 ? clamp(((bookWordCount - startingWordCount) / span) * 100, 0, 100) : 0
  const today = getWriteathonToday(config, milestones, bookWordCount)
  const n = milestones.length

  return (
    <div
      className={`relative w-full bg-bg-dark border-t border-gray-700 px-3 py-2 shrink-0${
        distractionFree ? ' opacity-20 hover:opacity-60 transition-opacity' : ''
      }`}
    >
      <div className="relative h-1 w-full rounded-full bg-gray-800">
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-amber-500 transition-[width] duration-500 ease-out"
          style={{ width: `${fillPercent}%` }}
        />

        {milestones.map((day, index) => {
          const status = dayStatusOf(milestones, index, today.index)
          const pos = n <= 1 ? 100 : ((index + 1) / n) * 100
          const pop = justCompleted.has(day.blockNumber) ? 'milestone-just-completed milestone-pop' : ''
          const marker =
            status === 'paid'
              ? `w-2 h-2 ${TIER_FILL[day.tier]} ${pop}`
              : status === 'today'
                ? `w-2.5 h-2.5 bg-gray-900 border-2 border-amber-300 ${config.paused ? '' : 'animate-pulse'}`
                : status === 'missed'
                  ? 'w-1.5 h-1.5 bg-gray-700'
                  : 'w-1.5 h-1.5 bg-gray-900 border border-gray-500'

          return (
            <div
              key={day.blockNumber}
              className="group absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
              style={{ left: `${pos}%` }}
            >
              <div className={`rotate-45 ${marker}`} />
              <div className="absolute bottom-full mb-3 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                <div className="bg-gray-800 text-gray-200 text-xs rounded px-2 py-1 whitespace-nowrap border border-gray-700 shadow-lg">
                  <span className="font-medium">{formatDayLabel(day.date)}</span>
                  <span className="mx-1 text-gray-500">·</span>
                  <span>
                    Day {index + 1} of {n}
                  </span>
                  <span className={`ml-1.5 ${status === 'paid' ? 'text-emerald-400' : status === 'today' ? 'text-amber-300' : 'text-gray-400'}`}>
                    {STATUS_TEXT[status]}
                    {status === 'paid' && ` · ${day.coinsAwarded} coins`}
                    {status === 'today' && !today.paid && ` · ${today.written.toLocaleString()} / ${today.target.toLocaleString()}`}
                  </span>
                </div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-700" />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

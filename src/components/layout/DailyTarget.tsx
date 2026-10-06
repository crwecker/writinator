import { useWriteathonStore } from '../../stores/writeathonStore'
import { getWriteathonToday } from '../../lib/writeathon'

interface DailyTargetProps {
  bookWordCount: number
}

function getColorClass(ratio: number): string {
  if (ratio >= 1.0) return 'text-amber-300 font-medium'
  if (ratio >= 0.5) return 'text-emerald-400'
  if (ratio >= 0.25) return 'text-amber-400'
  return 'text-gray-500'
}

/** Status-bar line for today's writeathon date: words written today toward the on-pace target. */
export function DailyTarget({ bookWordCount }: DailyTargetProps) {
  const config = useWriteathonStore((s) => s.config)
  const milestones = useWriteathonStore((s) => s.milestones)

  if (!config?.active || config.completedAt) return null

  const today = getWriteathonToday(config, milestones, bookWordCount)
  if (today.phase === 'over') {
    const paid = milestones.filter((m) => m.completed).length
    return <span className="text-gray-500">Writeathon ended · {paid}/{milestones.length} days</span>
  }
  if (today.phase !== 'active') return null
  if (config.paused) return <span className="text-gray-500">Writeathon paused</span>

  const label = `Day ${today.index + 1}/${milestones.length}`
  if (today.paid) {
    return (
      <span className="tabular-nums text-amber-300" title="Today's writeathon target is met">
        {label}: {today.written.toLocaleString()} ✓
      </span>
    )
  }
  const ratio = today.target > 0 ? today.written / today.target : 0
  return (
    <span
      className={`tabular-nums ${getColorClass(ratio)}`}
      title={`Words today toward today's on-pace target (${today.remainingDays} day${today.remainingDays === 1 ? '' : 's'} left)`}
    >
      {label}: {today.written.toLocaleString()} / {today.target.toLocaleString()}
    </span>
  )
}

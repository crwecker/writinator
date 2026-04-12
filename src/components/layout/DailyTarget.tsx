import { useWriteathonStore } from '../../stores/writeathonStore'

interface DailyTargetProps {
  bookWordCount: number
}

function getColorClass(ratio: number): string {
  if (ratio >= 1.0) return 'text-amber-300 font-medium'
  if (ratio >= 0.5) return 'text-emerald-400'
  if (ratio >= 0.25) return 'text-amber-400'
  return 'text-gray-500'
}

export function DailyTarget({ bookWordCount }: DailyTargetProps) {
  const config = useWriteathonStore((s) => s.config)
  const milestones = useWriteathonStore((s) => s.milestones)
  const getDailyTarget = useWriteathonStore((s) => s.getDailyTarget)
  const getCurrentBlock = useWriteathonStore((s) => s.getCurrentBlock)

  if (!config?.active) return null

  const currentBlock = getCurrentBlock()
  const dailyTarget = getDailyTarget()

  const completedCount = milestones.filter((m) => m.completed).length
  const startOfBlockWordCount =
    completedCount > 0
      ? milestones[completedCount - 1].targetWordCount
      : config.startingWordCount
  const wordsToday = Math.max(0, bookWordCount - startOfBlockWordCount)

  const ratio = dailyTarget > 0 ? wordsToday / dailyTarget : 0
  const colorClass = getColorClass(ratio)

  return (
    <span className={`tabular-nums ${colorClass}`}>
      Day {currentBlock}: {wordsToday.toLocaleString()} / {dailyTarget.toLocaleString()}
    </span>
  )
}

import { useMemo } from 'react'
import { useStreakStore } from '../../stores/streakStore'
import { levelInfo, lifetimeWords, type LevelInfo } from '../../lib/progression'

/** The writer's author level, from lifetime counted words across every book. */
export function useAuthorLevel(): LevelInfo {
  const dailyWords = useStreakStore((s) => s.dailyWords)
  return useMemo(() => levelInfo(lifetimeWords(dailyWords)), [dailyWords])
}

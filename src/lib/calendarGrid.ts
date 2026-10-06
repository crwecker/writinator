import { STREAK_THRESHOLD, type CoverKind } from './streak'
import { addDays, weekStartKey } from './days'
import { todayKey } from './metrics'

export interface CalendarCell {
  date: string
  words: number
  /** 0 = nothing, 1 = under the streak threshold, 2–4 = increasing amounts. */
  level: 0 | 1 | 2 | 3 | 4
  cover: CoverKind | null
  inCurrentStreak: boolean
  future: boolean
}

/**
 * GitHub-style year grid: columns are Monday–Sunday weeks, oldest first, the
 * last column holding today. `weeks` columns in total.
 */
export function buildCalendarGrid(
  dailyWords: Record<string, number>,
  covered: Record<string, CoverKind>,
  currentStreakStart: string | null,
  now: number = Date.now(),
  weeks = 53,
): CalendarCell[][] {
  const today = todayKey(now)
  const firstMonday = addDays(weekStartKey(now), -7 * (weeks - 1))
  const grid: CalendarCell[][] = []
  for (let w = 0; w < weeks; w++) {
    const column: CalendarCell[] = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(firstMonday, w * 7 + d)
      const words = dailyWords[date] ?? 0
      column.push({
        date,
        words,
        level: wordLevel(words),
        cover: covered[date] ?? null,
        inCurrentStreak: currentStreakStart !== null && date >= currentStreakStart && date <= today,
        future: date > today,
      })
    }
    grid.push(column)
  }
  return grid
}

export function wordLevel(words: number): CalendarCell['level'] {
  if (words <= 0) return 0
  if (words < STREAK_THRESHOLD) return 1
  if (words < 500) return 2
  if (words < 1500) return 3
  return 4
}

import { todayKey } from './metrics'

/** Local-calendar day helpers. Day keys are `YYYY-MM-DD` in local time. */

export { todayKey as dayKey }

/** Local midnight of a day key. */
export function parseDayKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/** The day key `n` calendar days after `key` (negative goes back). DST-safe. */
export function addDays(key: string, n: number): string {
  const d = parseDayKey(key)
  return todayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime())
}

/** Whole calendar days from `a` to `b` (positive when b is later). */
export function dayDiff(a: string, b: string): number {
  return Math.round((parseDayKey(b).getTime() - parseDayKey(a).getTime()) / 86_400_000)
}

/** Monday of the local week containing `now`. */
export function weekStartKey(now: number = Date.now()): string {
  const key = todayKey(now)
  const dow = parseDayKey(key).getDay() // 0 = Sunday
  return addDays(key, -((dow + 6) % 7))
}

/** Sum of a day-keyed word log over the Monday–Sunday week containing `now`. */
export function weekTotal(dailyWords: Record<string, number>, now: number = Date.now()): number {
  const start = weekStartKey(now)
  let sum = 0
  for (let i = 0; i < 7; i++) sum += dailyWords[addDays(start, i)] ?? 0
  return sum
}

/** Short label like "Tue, Oct 6". */
export function formatDayLabel(key: string): string {
  return parseDayKey(key).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

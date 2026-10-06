import { parseDayKey, weekStartKey } from './days'

/** One stretch of counted writing, as delivered by a metrics flush. */
export interface WritingSample {
  start: number
  end: number
  words: number
}

/** How long a flush with no recent predecessor is assumed to have taken at most. */
const MAX_SAMPLE_SPAN_MS = 60_000

/**
 * Turn a counted-words flush into a sample. Flushes are debounced, so the
 * writing behind one started around the previous flush (when that was recent);
 * otherwise assume roughly a word a second, capped at a minute.
 */
export function makeSample(prev: WritingSample | undefined, timestamp: number, words: number): WritingSample {
  const start =
    prev !== undefined && timestamp - prev.end <= MAX_SAMPLE_SPAN_MS
      ? prev.end
      : timestamp - Math.min(MAX_SAMPLE_SPAN_MS, words * 1000)
  return { start, end: timestamp, words }
}

/** Shortest time (ms) in which `target` words were written, or null if never reached. */
export function fastestSpan(samples: WritingSample[], target: number): number | null {
  let best: number | null = null
  let left = 0
  let sum = 0
  for (let right = 0; right < samples.length; right++) {
    sum += samples[right].words
    // Drop samples from the left while the rest still reaches the target.
    while (left < right && sum - samples[left].words >= target) {
      sum -= samples[left].words
      left++
    }
    if (sum >= target) {
      const span = samples[right].end - samples[left].start
      if (best === null || span < best) best = span
    }
  }
  return best
}

export function bestDayFrom(dailyWords: Record<string, number>): { words: number; date: string } | null {
  let best: { words: number; date: string } | null = null
  for (const [date, words] of Object.entries(dailyWords)) {
    if (words > 0 && (best === null || words > best.words)) best = { words, date }
  }
  return best
}

export function bestWeekFrom(dailyWords: Record<string, number>): { words: number; weekStart: string } | null {
  const weeks = new Map<string, number>()
  for (const [date, words] of Object.entries(dailyWords)) {
    const week = weekStartKey(parseDayKey(date).getTime())
    weeks.set(week, (weeks.get(week) ?? 0) + words)
  }
  let best: { words: number; weekStart: string } | null = null
  for (const [weekStart, words] of weeks) {
    if (words > 0 && (best === null || words > best.words)) best = { words, weekStart }
  }
  return best
}

export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(totalSec / 3600)
  const m = Math.floor((totalSec % 3600) / 60)
  const s = totalSec % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

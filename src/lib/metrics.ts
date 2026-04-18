import * as localforage from 'localforage'
import type { DailyMetricBucket, MetricKey, MetricsState, Snapshot } from '../types'
import type { Book, Storylet } from '../types'
import { countWords } from './words'

/**
 * Returns today's date key in YYYY-MM-DD format using local time.
 */
export function todayKey(now: number = Date.now()): string {
  const d = new Date(now)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Returns the start timestamp (ms) for a given range window.
 * 'all' returns 0 (epoch).
 */
export function rangeStart(
  range: '7d' | '30d' | '90d' | '365d' | 'all',
  now: number = Date.now()
): number {
  if (range === 'all') return 0
  const days =
    range === '7d' ? 7 : range === '30d' ? 30 : range === '90d' ? 90 : 365
  return now - days * 24 * 60 * 60 * 1000
}

/**
 * Aggregates daily buckets within the given range window.
 * Returns total gross words, net words, and number of active days.
 */
export function aggregateRange(
  buckets: Record<string, DailyMetricBucket>,
  range: '7d' | '30d' | '90d' | '365d' | 'all',
  now: number = Date.now()
): { gross: number; net: number; days: number } {
  const start = rangeStart(range, now)
  let gross = 0
  let net = 0
  let days = 0

  for (const [key, bucket] of Object.entries(buckets)) {
    // Parse YYYY-MM-DD as local midnight
    const [year, month, day] = key.split('-').map(Number)
    const bucketMs = new Date(year, month - 1, day).getTime()
    if (bucketMs >= start && bucketMs <= now) {
      gross += bucket.gross
      net += bucket.net
      days += 1
    }
  }

  return { gross, net, days }
}

/**
 * Formats a number using the locale's grouping (e.g. 1,234).
 */
export function formatNumber(n: number): string {
  return n.toLocaleString()
}

/**
 * Computes WPM over a rolling window from the transient ring buffer.
 * windowMs defaults to 10 minutes (600_000 ms).
 * Allocation-free: iterates in place, no intermediate arrays.
 */
export function computeWPM(
  samples: Array<{ timestamp: number; delta: number }>,
  windowMs: number = 600_000,
  now: number = Date.now(),
): number {
  const cutoff = now - windowMs
  let sum = 0
  for (const s of samples) {
    if (s.timestamp >= cutoff && s.delta > 0) sum += s.delta
  }
  const minutes = windowMs / 60_000
  return Math.round(sum / minutes)
}

/**
 * Returns the gross and net totals for the current session.
 * Returns {gross: 0, net: 0} when no session is active.
 */
export function currentSessionTotals(state: MetricsState): {
  gross: number
  net: number
} {
  if (!state.session) return { gross: 0, net: 0 }
  return { gross: state.session.gross, net: state.session.net }
}

/**
 * Returns a human-readable label and formatted value string for a given MetricKey.
 * wpmSamples is read via metricsStore.getState() when needed — pass null to skip.
 */
export function getMetricDisplayValue(
  key: MetricKey,
  metrics: MetricsState,
  book: Book | null,
  activeStorylet: Storylet | null,
  now: number = Date.now(),
): { value: string; label: string } {
  const { dayBuckets } = metrics
  const tk = todayKey(now)

  switch (key) {
    case 'session': {
      const n = metrics.session?.gross ?? 0
      return { label: 'Session', value: formatNumber(n) }
    }
    case 'today': {
      const n = dayBuckets[tk]?.gross ?? 0
      return { label: 'Today', value: formatNumber(n) }
    }
    case 'todayNet': {
      const n = dayBuckets[tk]?.net ?? 0
      return { label: 'Today (net)', value: formatNumber(n) }
    }
    case 'wpm10': {
      const wpm = computeWPM(metrics.wpmSamples, 600_000, now)
      return { label: 'WPM (10m)', value: formatNumber(wpm) }
    }
    case 'week': {
      const n = aggregateRange(dayBuckets, '7d', now).net
      return { label: 'This week', value: formatNumber(n) }
    }
    case 'month': {
      const n = aggregateRange(dayBuckets, '30d', now).net
      return { label: 'This month', value: formatNumber(n) }
    }
    case 'year': {
      const n = aggregateRange(dayBuckets, '365d', now).net
      return { label: 'This year', value: formatNumber(n) }
    }
    case 'storyletWords': {
      const n = countWords(activeStorylet?.content ?? null)
      return { label: 'Storylet words', value: formatNumber(n) }
    }
    case 'bookWords': {
      const n =
        book?.storylets.reduce(
          (sum, s) => sum + countWords(s.content),
          0,
        ) ?? 0
      return { label: 'Book words', value: formatNumber(n) }
    }
  }
}

// ---------------------------------------------------------------------------
// Snapshot backfill
// ---------------------------------------------------------------------------

export interface BackfillPoint {
  date: string       // YYYY-MM-DD
  bookWords: number  // estimated total book word count that day
}

/**
 * Scans localforage for all writinator-snapshots-* keys, collapses per-storylet
 * snapshots into per-day book-wide word count estimates.
 * For each day, takes the most recent snapshot per storylet then sums across storylets.
 */
export async function loadSnapshotBackfill(): Promise<BackfillPoint[]> {
  let keys: string[]
  try {
    keys = await localforage.keys()
  } catch {
    return []
  }

  const snapshotKeys = keys.filter((k) => k.startsWith('writinator-snapshots-'))

  // Map: dateKey -> Map<storyletId, { wordCount, ts }>
  const dateMap = new Map<string, Map<string, { wordCount: number; ts: number }>>()

  for (const key of snapshotKeys) {
    let snapshots: Snapshot[] | null
    try {
      snapshots = await localforage.getItem<Snapshot[]>(key)
    } catch {
      continue
    }
    if (!Array.isArray(snapshots)) continue

    for (const snap of snapshots) {
      if (!snap || typeof snap.timestamp !== 'string' || typeof snap.wordCount !== 'number') continue
      const ts = new Date(snap.timestamp).getTime()
      if (isNaN(ts)) continue

      const dateKey = todayKey(ts)
      const storyletId = snap.storyletId ?? key.replace('writinator-snapshots-', '')

      let storyletMap = dateMap.get(dateKey)
      if (!storyletMap) {
        storyletMap = new Map()
        dateMap.set(dateKey, storyletMap)
      }

      // Keep the latest (largest timestamp) snapshot per (date, storyletId)
      const existing = storyletMap.get(storyletId)
      if (existing === undefined || ts > existing.ts) {
        storyletMap.set(storyletId, { wordCount: snap.wordCount, ts })
      }
    }
  }

  // For each date, sum the latest-per-storylet wordCounts
  const points: BackfillPoint[] = []
  for (const [date, storyletMap] of dateMap.entries()) {
    let bookWords = 0
    for (const entry of storyletMap.values()) {
      bookWords += entry.wordCount
    }
    points.push({ date, bookWords })
  }

  points.sort((a, b) => a.date.localeCompare(b.date))
  return points
}

export interface MergedSeriesPoint {
  date: string            // YYYY-MM-DD
  gross: number           // from dayBuckets, 0 if missing
  net: number             // from dayBuckets, 0 if missing
  bookWords: number | null  // from backfill, null if unknown
  isBackfilled: boolean   // true if bookWords came only from backfill
}

/**
 * Merges dayBuckets with snapshot backfill data into a unified time series.
 * Union of dates within range, sorted ascending. dayBuckets wins for gross/net.
 * bookWords comes from backfill; isBackfilled = no dayBuckets entry for that date.
 */
export function mergeBucketsWithBackfill(
  dayBuckets: Record<string, DailyMetricBucket>,
  backfill: BackfillPoint[],
  range: '7d' | '30d' | '90d' | '365d' | 'all',
  now: number = Date.now(),
): MergedSeriesPoint[] {
  const start = rangeStart(range, now)
  const todayStr = todayKey(now)

  const allDates = new Set<string>()

  // Dates from dayBuckets within range
  for (const key of Object.keys(dayBuckets)) {
    const [year, month, day] = key.split('-').map(Number)
    const ms = new Date(year, month - 1, day).getTime()
    if (ms >= start && ms <= now) allDates.add(key)
  }

  // Dates from backfill within range
  for (const bp of backfill) {
    const [year, month, day] = bp.date.split('-').map(Number)
    const ms = new Date(year, month - 1, day).getTime()
    if (ms >= start && ms <= now) allDates.add(bp.date)
  }

  const backfillMap = new Map<string, number>(backfill.map((bp) => [bp.date, bp.bookWords]))

  const sorted = Array.from(allDates).sort()

  return sorted.map((date) => {
    const bucket = dayBuckets[date]
    const bfWords = backfillMap.get(date) ?? null
    const hasBucket = bucket !== undefined
    const isToday = date === todayStr

    return {
      date,
      gross: bucket?.gross ?? 0,
      net: bucket?.net ?? 0,
      bookWords: bfWords,
      isBackfilled: !hasBucket && !isToday && bfWords !== null,
    }
  })
}

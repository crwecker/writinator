import type { DailyMetricBucket } from '../types'

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
  range: '7d' | '30d' | '90d' | 'all',
  now: number = Date.now()
): number {
  if (range === 'all') return 0
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  return now - days * 24 * 60 * 60 * 1000
}

/**
 * Aggregates daily buckets within the given range window.
 * Returns total gross words, net words, and number of active days.
 */
export function aggregateRange(
  buckets: Record<string, DailyMetricBucket>,
  range: '7d' | '30d' | '90d' | 'all',
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

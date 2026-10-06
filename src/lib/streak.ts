import { addDays } from './days'

/** Counted words needed on a local calendar day for it to be a writing day. */
export const STREAK_THRESHOLD = 100
/** A grace day can be used at most once in any rolling 7-day window. */
export const GRACE_WINDOW_DAYS = 7
export const STREAK_FREEZE_ID = 'streak-freeze'

export const STREAK_MILESTONES: { days: number; coins: number }[] = [
  { days: 3, coins: 25 },
  { days: 7, coins: 75 },
  { days: 14, coins: 150 },
  { days: 30, coins: 300 },
  { days: 50, coins: 500 },
  { days: 100, coins: 750 },
  { days: 365, coins: 1000 },
]

export type CoverKind = 'grace' | 'freeze'

export interface StreakLedger {
  /** Counted (gross) words per local day, for this writer across all books. */
  dailyWords: Record<string, number>
  /** Missed days kept alive by a grace day or a Streak Freeze. */
  covered: Record<string, CoverKind>
  /** Last day whose outcome is final; uncovered misses on or before it are permanent breaks. */
  evaluatedThrough: string | null
}

export function isWritingDay(ledger: Pick<StreakLedger, 'dailyWords'>, day: string): boolean {
  return (ledger.dailyWords[day] ?? 0) >= STREAK_THRESHOLD
}

/** Whether a grace day may be used on `day`: no grace in the 6 days before it. */
export function graceAvailableOn(covered: Record<string, CoverKind>, day: string): boolean {
  for (let i = 1; i < GRACE_WINDOW_DAYS; i++) {
    if (covered[addDays(day, -i)] === 'grace') return false
  }
  return true
}

/** First day a grace day can be used again, counting from `today`. */
export function nextGraceDay(covered: Record<string, CoverKind>, today: string): string {
  let last: string | null = null
  for (const [day, kind] of Object.entries(covered)) {
    if (kind === 'grace' && day <= today && (last === null || day > last)) last = day
  }
  if (last === null) return today
  const next = addDays(last, GRACE_WINDOW_DAYS)
  return next > today ? next : today
}

export interface StreakEvaluation {
  /** New covers to add to the ledger. */
  covers: Record<string, CoverKind>
  freezesUsed: number
  evaluatedThrough: string | null
}

/**
 * Finalise every day before `today`. A run of missed days ending yesterday is
 * covered (grace first, then freezes) only when the whole gap can be bridged;
 * otherwise nothing is spent and the streak is broken. Idempotent: days already
 * evaluated are never revisited, so freezes are never spent twice.
 */
export function evaluateStreak(ledger: StreakLedger, today: string, freezesOwned: number): StreakEvaluation {
  const yesterday = addDays(today, -1)
  const { evaluatedThrough, covered } = ledger
  const none: StreakEvaluation = {
    covers: {},
    freezesUsed: 0,
    evaluatedThrough: evaluatedThrough !== null && evaluatedThrough > yesterday ? evaluatedThrough : yesterday,
  }
  if (evaluatedThrough !== null && evaluatedThrough >= yesterday) return none

  const earliest = earliestDay(ledger)
  // Nothing logged yet: finalise nothing, book history may still be merged in.
  if (earliest === null) return { covers: {}, freezesUsed: 0, evaluatedThrough }

  // Walk back over the run of missed days that ends yesterday.
  const gap: string[] = []
  let d = yesterday
  while (d >= earliest && !isWritingDay(ledger, d) && covered[d] === undefined) {
    gap.unshift(d)
    d = addDays(d, -1)
  }
  if (gap.length === 0) return none
  if (d < earliest) return none // nothing before the gap: no streak to save
  if (evaluatedThrough !== null && gap[0] <= evaluatedThrough) return none // already broken

  const covers: Record<string, CoverKind> = {}
  let freezesUsed = 0
  for (const day of gap) {
    if (graceAvailableOn({ ...covered, ...covers }, day)) {
      covers[day] = 'grace'
    } else if (freezesUsed < freezesOwned) {
      covers[day] = 'freeze'
      freezesUsed++
    } else {
      return none // can't bridge the whole gap: keep the freezes, the streak is over
    }
  }
  return { ...none, covers, freezesUsed }
}

function earliestDay(ledger: Pick<StreakLedger, 'dailyWords' | 'covered'>): string | null {
  let earliest: string | null = null
  for (const key of Object.keys(ledger.dailyWords)) {
    if ((ledger.dailyWords[key] ?? 0) > 0 && (earliest === null || key < earliest)) earliest = key
  }
  for (const key of Object.keys(ledger.covered)) {
    if (earliest === null || key < earliest) earliest = key
  }
  return earliest
}

export interface StreakStatus {
  /** Writing days in the current chain (grace/freeze days keep it alive but don't add to it). */
  current: number
  /** First day of the current chain, or null when there is no streak. */
  chainStart: string | null
  todayQualified: boolean
}

export function computeStreak(ledger: Pick<StreakLedger, 'dailyWords' | 'covered'>, today: string): StreakStatus {
  const todayQualified = isWritingDay(ledger, today)
  const earliest = earliestDay(ledger)
  let current = 0
  let chainStart: string | null = null
  if (earliest !== null) {
    let d = todayQualified ? today : addDays(today, -1)
    while (d >= earliest && (isWritingDay(ledger, d) || ledger.covered[d] !== undefined)) {
      if (isWritingDay(ledger, d)) {
        current++
        chainStart = d
      }
      d = addDays(d, -1)
    }
  }
  return { current, chainStart, todayQualified }
}

/** Milestones reached by `current` that haven't been paid yet in this chain. */
export function dueMilestones(current: number, paid: number[]): { days: number; coins: number }[] {
  return STREAK_MILESTONES.filter((m) => m.days <= current && !paid.includes(m.days))
}

/** Longest run of writing days anywhere in the ledger (covered days bridge, don't count). */
export function longestRun(ledger: Pick<StreakLedger, 'dailyWords' | 'covered'>): number {
  const days = new Set<string>(Object.keys(ledger.covered))
  for (const key of Object.keys(ledger.dailyWords)) if (isWritingDay(ledger, key)) days.add(key)
  let best = 0
  for (const day of days) {
    // Only start counting at the first day of a run.
    if (days.has(addDays(day, -1))) continue
    let count = 0
    for (let d = day; days.has(d); d = addDays(d, 1)) if (isWritingDay(ledger, d)) count++
    best = Math.max(best, count)
  }
  return best
}

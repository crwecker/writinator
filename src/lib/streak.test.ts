import { describe, expect, it } from 'vitest'
import { addDays, dayDiff, weekStartKey, weekTotal } from './days'
import {
  computeStreak,
  dueMilestones,
  evaluateStreak,
  graceAvailableOn,
  longestRun,
  nextGraceDay,
  type StreakLedger,
} from './streak'
import { todayKey } from './metrics'

function ledger(words: Record<string, number>, extra: Partial<StreakLedger> = {}): StreakLedger {
  return { dailyWords: words, covered: {}, evaluatedThrough: null, ...extra }
}

describe('day helpers', () => {
  it('uses local midnight as the boundary', () => {
    expect(todayKey(new Date(2026, 9, 6, 23, 59).getTime())).toBe('2026-10-06')
    expect(todayKey(new Date(2026, 9, 7, 0, 1).getTime())).toBe('2026-10-07')
  })

  it('adds days across month ends and DST changes', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-03-08', 1)).toBe('2026-03-09')
    expect(addDays('2026-11-01', 1)).toBe('2026-11-02')
    expect(dayDiff('2026-03-01', '2026-04-01')).toBe(31)
  })

  it('weeks run Monday to Sunday', () => {
    // 2026-10-06 is a Tuesday; 2026-10-11 is a Sunday
    expect(weekStartKey(new Date(2026, 9, 6, 12).getTime())).toBe('2026-10-05')
    expect(weekStartKey(new Date(2026, 9, 11, 23).getTime())).toBe('2026-10-05')
    expect(weekStartKey(new Date(2026, 9, 12, 1).getTime())).toBe('2026-10-12')
    const words = { '2026-10-04': 999, '2026-10-05': 100, '2026-10-11': 50, '2026-10-12': 7 }
    expect(weekTotal(words, new Date(2026, 9, 8).getTime())).toBe(150)
  })
})

describe('computeStreak', () => {
  it('counts consecutive writing days of 100+ words ending today', () => {
    const s = computeStreak(ledger({ '2026-10-04': 100, '2026-10-05': 300, '2026-10-06': 120 }), '2026-10-06')
    expect(s).toEqual({ current: 3, chainStart: '2026-10-04', todayQualified: true })
  })

  it('keeps the streak alive through yesterday while today is still in progress', () => {
    const s = computeStreak(ledger({ '2026-10-04': 100, '2026-10-05': 300, '2026-10-06': 40 }), '2026-10-06')
    expect(s.current).toBe(2)
    expect(s.todayQualified).toBe(false)
  })

  it('a day under 100 words breaks it', () => {
    const s = computeStreak(ledger({ '2026-10-03': 500, '2026-10-04': 99, '2026-10-05': 300 }), '2026-10-06')
    expect(s.current).toBe(1)
    expect(s.chainStart).toBe('2026-10-05')
  })

  it('covered days bridge the chain but do not add to the count', () => {
    const s = computeStreak(
      ledger({ '2026-10-03': 500, '2026-10-05': 300 }, { covered: { '2026-10-04': 'grace' } }),
      '2026-10-06',
    )
    expect(s.current).toBe(2)
    expect(s.chainStart).toBe('2026-10-03')
  })
})

describe('evaluateStreak', () => {
  it('uses the grace day for a single missed day', () => {
    const ev = evaluateStreak(ledger({ '2026-10-03': 500, '2026-10-04': 200 }), '2026-10-06', 0)
    expect(ev.covers).toEqual({ '2026-10-05': 'grace' })
    expect(ev.freezesUsed).toBe(0)
    expect(ev.evaluatedThrough).toBe('2026-10-05')
  })

  it('a second miss within 7 days needs a freeze', () => {
    const l = ledger(
      { '2026-10-01': 500, '2026-10-03': 200, '2026-10-04': 200 },
      { covered: { '2026-10-02': 'grace' }, evaluatedThrough: '2026-10-04' },
    )
    expect(evaluateStreak(l, '2026-10-06', 0).covers).toEqual({})
    const withFreeze = evaluateStreak(l, '2026-10-06', 1)
    expect(withFreeze.covers).toEqual({ '2026-10-05': 'freeze' })
    expect(withFreeze.freezesUsed).toBe(1)
  })

  it('grace is available again once the 7-day window has passed', () => {
    expect(graceAvailableOn({ '2026-10-01': 'grace' }, '2026-10-07')).toBe(false)
    expect(graceAvailableOn({ '2026-10-01': 'grace' }, '2026-10-08')).toBe(true)
    expect(nextGraceDay({ '2026-10-01': 'grace' }, '2026-10-03')).toBe('2026-10-08')
    expect(nextGraceDay({}, '2026-10-03')).toBe('2026-10-03')
  })

  it('does not spend freezes on a gap they cannot fully bridge', () => {
    const l = ledger({ '2026-09-20': 500 })
    const ev = evaluateStreak(l, '2026-10-06', 2)
    expect(ev.covers).toEqual({})
    expect(ev.freezesUsed).toBe(0)
  })

  it('bridges a multi-day gap with grace then freezes', () => {
    const ev = evaluateStreak(ledger({ '2026-10-02': 500 }), '2026-10-06', 2)
    expect(ev.covers).toEqual({ '2026-10-03': 'grace', '2026-10-04': 'freeze', '2026-10-05': 'freeze' })
    expect(ev.freezesUsed).toBe(2)
  })

  it('is idempotent: a re-run spends nothing more', () => {
    const l = ledger({ '2026-10-02': 500 })
    const first = evaluateStreak(l, '2026-10-06', 2)
    const after: StreakLedger = {
      ...l,
      covered: { ...l.covered, ...first.covers },
      evaluatedThrough: first.evaluatedThrough,
    }
    const second = evaluateStreak(after, '2026-10-06', 5)
    expect(second.covers).toEqual({})
    expect(second.freezesUsed).toBe(0)
  })

  it('a break that was already final cannot be rescued by buying freezes later', () => {
    // 10-04 was evaluated and left uncovered (no freezes then); now 10-05 is also missed.
    const l = ledger(
      { '2026-10-01': 500, '2026-10-03': 300 },
      { covered: { '2026-10-02': 'grace' }, evaluatedThrough: '2026-10-04' },
    )
    expect(evaluateStreak(l, '2026-10-06', 5).covers).toEqual({})
  })

  it('never touches today', () => {
    const ev = evaluateStreak(ledger({ '2026-10-05': 500 }), '2026-10-06', 3)
    expect(ev.covers).toEqual({})
  })
})

describe('dueMilestones', () => {
  it('returns unpaid milestones reached', () => {
    expect(dueMilestones(7, [3]).map((m) => m.days)).toEqual([7])
    expect(dueMilestones(2, [])).toEqual([])
  })
})

describe('longestRun', () => {
  it('finds the longest chain anywhere in history', () => {
    const l = ledger(
      { '2026-01-01': 100, '2026-01-02': 100, '2026-01-04': 100, '2026-01-05': 100, '2026-02-01': 300 },
      { covered: { '2026-01-03': 'freeze' } },
    )
    expect(longestRun(l)).toBe(4)
    expect(longestRun(ledger({}))).toBe(0)
  })
})

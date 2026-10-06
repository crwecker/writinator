import { describe, expect, it } from 'vitest'
import { shouldNudge } from './nudge'
import { buildCalendarGrid, wordLevel } from './calendarGrid'

const at = (day: number, hour: number, min = 0) => new Date(2026, 9, day, hour, min).getTime()

describe('shouldNudge', () => {
  const base = { enabled: true, time: '20:00', todayWords: 0, lastNudgedDay: null }

  it('reminds after the chosen local time when under 100 words', () => {
    expect(shouldNudge(base, at(6, 19, 59))).toBe(false)
    expect(shouldNudge(base, at(6, 20, 0))).toBe(true)
    expect(shouldNudge(base, at(6, 23, 30))).toBe(true)
  })

  it('stays quiet when off, when today already counts, or when already reminded today', () => {
    expect(shouldNudge({ ...base, enabled: false }, at(6, 21))).toBe(false)
    expect(shouldNudge({ ...base, todayWords: 100 }, at(6, 21))).toBe(false)
    expect(shouldNudge({ ...base, lastNudgedDay: '2026-10-06' }, at(6, 21))).toBe(false)
    expect(shouldNudge({ ...base, lastNudgedDay: '2026-10-05' }, at(6, 21))).toBe(true)
  })
})

describe('buildCalendarGrid', () => {
  it('lays out Monday–Sunday weeks ending with the current week', () => {
    // 2026-10-06 is a Tuesday
    const grid = buildCalendarGrid({ '2026-10-05': 250, '2026-10-01': 40 }, { '2026-10-02': 'grace' }, '2026-10-01', at(6, 12), 2)
    expect(grid).toHaveLength(2)
    expect(grid[0][0].date).toBe('2026-09-28')
    expect(grid[1][0]).toMatchObject({ date: '2026-10-05', words: 250, level: 2, inCurrentStreak: true, future: false })
    expect(grid[1][1]).toMatchObject({ date: '2026-10-06', future: false })
    expect(grid[1][2]).toMatchObject({ date: '2026-10-07', future: true })
    expect(grid[0][3]).toMatchObject({ date: '2026-10-01', level: 1 })
    expect(grid[0][4]).toMatchObject({ date: '2026-10-02', cover: 'grace' })
    expect(grid[0][0].inCurrentStreak).toBe(false)
  })

  it('buckets word counts', () => {
    expect([0, 50, 100, 600, 2000].map(wordLevel)).toEqual([0, 1, 2, 3, 4])
  })
})

import { describe, expect, it } from 'vitest'
import {
  calendarDailyTarget,
  createCalendarDays,
  createMilestones,
  dayStatusOf,
  getWriteathonToday,
  migrateWriteathonData,
  WRITEATHON_MODEL,
  type WriteathonDay,
} from './writeathon'
import type { WriteathonConfig } from '../types'

const at = (day: number, hour = 12) => new Date(2026, 9, day, hour).getTime()

function config(extra: Partial<WriteathonConfig> = {}): WriteathonConfig {
  return {
    id: 'w',
    startDate: new Date(2026, 9, 4, 9).toISOString(),
    startingWordCount: 1000,
    targetWordCount: 6000,
    totalBlocks: 5,
    wordsPerBlock: 1000,
    active: true,
    ...extra,
  }
}

describe('calendarDailyTarget', () => {
  it('spreads what is left over the dates left, today included', () => {
    expect(calendarDailyTarget(10_000, 4000, 3)).toBe(2000)
    expect(calendarDailyTarget(10_000, 4001, 3)).toBe(2000) // rounds up: 1999.67
    expect(calendarDailyTarget(10_000, 12_000, 3)).toBe(0)
    expect(calendarDailyTarget(10_000, 0, 0)).toBe(0)
  })
})

describe('getWriteathonToday', () => {
  it('uses the frozen start-of-day count and target', () => {
    const days: WriteathonDay[] = createCalendarDays('2026-10-04', 1000, 1000, 5)
    days[2] = { ...days[2], dayStartWordCount: 2000, dayTarget: 1334 }
    const today = getWriteathonToday(config(), days, 2500, at(6))
    expect(today).toMatchObject({
      index: 2,
      date: '2026-10-06',
      phase: 'active',
      dayStartWordCount: 2000,
      target: 1334,
      written: 500,
      paid: false,
      remainingDays: 3,
    })
  })

  it('before the first update of a day, today starts from the live count', () => {
    const days = createCalendarDays('2026-10-04', 1000, 1000, 5)
    const today = getWriteathonToday(config(), days, 3000, at(6))
    expect(today.dayStartWordCount).toBe(3000)
    expect(today.target).toBe(1000) // (6000 - 3000) / 3
    expect(today.written).toBe(0)
  })

  it('is over once the last date has passed, complete once the goal is reached', () => {
    const days = createCalendarDays('2026-10-04', 1000, 1000, 5)
    expect(getWriteathonToday(config(), days, 3000, at(9)).phase).toBe('over')
    expect(getWriteathonToday(config({ completedAt: 'x' }), days, 6000, at(6)).phase).toBe('complete')
  })

  it('labels each date paid / missed / today / upcoming', () => {
    const days = createCalendarDays('2026-10-04', 1000, 1000, 5)
    days[0] = { ...days[0], completed: true }
    expect(dayStatusOf(days, 0, 2)).toBe('paid')
    expect(dayStatusOf(days, 1, 2)).toBe('missed')
    expect(dayStatusOf(days, 2, 2)).toBe('today')
    expect(dayStatusOf(days, 3, 2)).toBe('upcoming')
  })
})

describe('migrateWriteathonData', () => {
  it('turns completed checkpoints into paid days ending yesterday; the rest start today', () => {
    const milestones = createMilestones(1000, 500, 24).map((m, i) =>
      i < 5 ? { ...m, completed: true, completedAt: '2026-09-01T00:00:00.000Z' } : m,
    )
    const old = { config: config({ totalBlocks: 24, startDate: '2026-08-01T10:00:00.000Z' }), milestones }
    const migrated = migrateWriteathonData(old, at(6))

    expect(migrated.model).toBe(WRITEATHON_MODEL)
    expect(migrated.milestones).toHaveLength(24)
    expect(migrated.milestones[0].date).toBe('2026-10-01')
    expect(migrated.milestones[5].date).toBe('2026-10-06')
    expect(migrated.milestones[23].date).toBe('2026-10-24')
    expect(migrated.milestones.filter((m) => m.completed)).toHaveLength(5)
    expect(migrated.milestones[4].coinsAwarded).toBe(milestones[4].coinsAwarded)
    expect(new Date(migrated.config!.startDate).getDate()).toBe(1)
    const today = getWriteathonToday(migrated.config!, migrated.milestones, 3500, at(6))
    expect(today.index).toBe(5)
    expect(today.remainingDays).toBe(19)
  })

  it('leaves calendar data alone', () => {
    const days = createCalendarDays('2026-10-04', 1000, 1000, 5)
    const data = { config: config(), milestones: days, model: WRITEATHON_MODEL, lastSeenBookWords: 1200 }
    expect(migrateWriteathonData(data, at(20))).toEqual(data)
  })

  it('handles an empty writeathon', () => {
    expect(migrateWriteathonData({ config: null, milestones: [] }, at(6))).toEqual({
      config: null,
      milestones: [],
      model: WRITEATHON_MODEL,
      lastSeenBookWords: null,
    })
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useStreakStore } from './streakStore'
import { useMetricsStore } from './metricsStore'
import { usePlayerStore } from './playerStore'
import { resetStreakStore } from '../test/habitFixtures'

const at = (day: number, hour = 12) => new Date(2026, 9, day, hour).getTime()

function write(words: number, day: number, hour = 12) {
  useMetricsStore.getState().recordDelta(0, words, at(day, hour))
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(at(6))
  resetStreakStore()
  useMetricsStore.setState({ dayBuckets: {}, session: null })
  usePlayerStore.setState(usePlayerStore.getInitialState(), true)
})

describe('streakStore', () => {
  it('logs counted words per local day from the metrics feed (new words only)', () => {
    write(60, 5, 23)
    useMetricsStore.getState().recordDelta(60, 40, at(5, 23))
    write(70, 6, 0)
    expect(useStreakStore.getState().dailyWords).toEqual({ '2026-10-05': 60, '2026-10-06': 70 })
  })

  it('updates the current streak as words come in', () => {
    write(150, 4)
    write(150, 5)
    expect(useStreakStore.getState().currentStreak).toBe(2)
    write(99, 6)
    expect(useStreakStore.getState().todayQualified).toBe(false)
    write(1, 6)
    expect(useStreakStore.getState().currentStreak).toBe(3)
    expect(useStreakStore.getState().todayQualified).toBe(true)
    expect(useStreakStore.getState().longestStreak).toBe(3)
  })

  it('pays a milestone bonus once per streak', () => {
    write(150, 4)
    write(150, 5)
    write(150, 6)
    expect(usePlayerStore.getState().coins).toBe(25)
    write(500, 6)
    expect(usePlayerStore.getState().coins).toBe(25)
  })

  it('spends a Streak Freeze automatically when the grace day is used up, only once', () => {
    usePlayerStore.setState({ consumableInventory: { 'streak-freeze': 2 } })
    write(150, 1)
    // 10-02 missed → grace
    useStreakStore.getState().evaluate(at(3))
    write(150, 3)
    write(150, 4)
    // 10-05 missed, grace still on cooldown → freeze
    vi.setSystemTime(at(6))
    useStreakStore.getState().evaluate(at(6))
    useStreakStore.getState().evaluate(at(6, 18))
    const s = useStreakStore.getState()
    expect(s.covered).toEqual({ '2026-10-02': 'grace', '2026-10-05': 'freeze' })
    expect(usePlayerStore.getState().consumableInventory['streak-freeze']).toBe(1)
    expect(s.currentStreak).toBe(3)
  })

  it('seeds history from a book’s buckets silently (max per day, no coins)', () => {
    useStreakStore.setState({ dailyWords: { '2026-10-04': 500 } })
    useStreakStore.getState().mergeHistory(
      {
        '2026-10-03': { gross: 200, net: 100, minutesActive: 1, lastMinuteIndex: null },
        '2026-10-04': { gross: 300, net: 100, minutesActive: 1, lastMinuteIndex: null },
        '2026-10-05': { gross: 400, net: 100, minutesActive: 1, lastMinuteIndex: null },
      },
      at(6),
    )
    const s = useStreakStore.getState()
    expect(s.dailyWords).toEqual({ '2026-10-03': 200, '2026-10-04': 500, '2026-10-05': 400 })
    expect(s.currentStreak).toBe(3)
    expect(usePlayerStore.getState().coins).toBe(0)
    // the 3-day milestone counts as already celebrated
    write(200, 6)
    expect(usePlayerStore.getState().coins).toBe(0)
  })
})

describe('startup ordering', () => {
  it('waits for the player store before finalising days, then spends the freeze once', () => {
    let finish: (() => void) | null = null
    vi.spyOn(usePlayerStore.persist, 'hasHydrated').mockReturnValue(false)
    vi.spyOn(usePlayerStore.persist, 'onFinishHydration').mockImplementation((fn) => {
      finish = () => fn(usePlayerStore.getState())
      return () => {}
    })
    useStreakStore.setState({
      dailyWords: { '2026-10-01': 200, '2026-10-03': 200, '2026-10-04': 200 },
      covered: { '2026-10-02': 'grace' },
      evaluatedThrough: '2026-10-04',
    })
    useStreakStore.getState().evaluate(at(6))
    expect(useStreakStore.getState().evaluatedThrough).toBe('2026-10-04')

    usePlayerStore.setState({ consumableInventory: { 'streak-freeze': 1 } })
    vi.mocked(usePlayerStore.persist.hasHydrated).mockReturnValue(true)
    expect(finish).not.toBeNull()
    finish!()
    expect(useStreakStore.getState().covered['2026-10-05']).toBe('freeze')
    expect(usePlayerStore.getState().consumableInventory['streak-freeze']).toBe(0)
  })

  it('an empty log does not finalise anything (history may still arrive)', () => {
    useStreakStore.getState().evaluate(at(6))
    expect(useStreakStore.getState().evaluatedThrough).toBeNull()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getRecentRecordBreaks, useRecordsStore } from './recordsStore'
import { useMetricsStore } from './metricsStore'
import { useStreakStore } from './streakStore'
import { usePlayerStore } from './playerStore'
import { getGenericToastsSnapshot } from './genericToastStore'
import { bestDayFrom, bestWeekFrom, fastestSpan, makeSample, type WritingSample } from '../lib/records'
import { resetRecordsStore, resetStreakStore } from '../test/habitFixtures'

const at = (day: number, hour = 12, min = 0, sec = 0) => new Date(2026, 9, day, hour, min, sec).getTime()

function write(words: number, ts: number) {
  useMetricsStore.getState().recordDelta(0, words, ts)
}

function toastMessages(): string[] {
  return getGenericToastsSnapshot().map((t) => t.message)
}

function startSession(id: string, startedAt: number) {
  useMetricsStore.setState({ session: { sessionId: id, startedAt, gross: 0, net: 0 } })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(at(6))
  resetStreakStore()
  resetRecordsStore()
  useMetricsStore.setState({ dayBuckets: {}, session: null })
  usePlayerStore.setState(usePlayerStore.getInitialState(), true)
})

afterEach(() => {
  vi.runAllTimers() // let this test's toasts expire
  vi.useRealTimers()
})

describe('record helpers', () => {
  it('finds the best day and best Monday–Sunday week', () => {
    const words = { '2026-09-28': 300, '2026-10-04': 400, '2026-10-05': 600, '2026-10-06': 200 }
    expect(bestDayFrom(words)).toEqual({ words: 600, date: '2026-10-05' })
    // week of 09-28 (Mon) .. 10-04 (Sun) = 700; week of 10-05 = 800
    expect(bestWeekFrom(words)).toEqual({ words: 800, weekStart: '2026-10-05' })
  })

  it('finds the shortest stretch that reached the target', () => {
    const samples: WritingSample[] = [
      { start: 0, end: 60_000, words: 200 },
      { start: 60_000, end: 120_000, words: 100 },
      { start: 120_000, end: 150_000, words: 300 },
      { start: 150_000, end: 400_000, words: 100 },
    ]
    // 100 + 300 + ... the best 500 is samples 0..2 (150s) or 1..2 is only 400
    expect(fastestSpan(samples, 500)).toBe(150_000)
    expect(fastestSpan(samples.slice(0, 2), 500)).toBeNull()
  })

  it('a flush right after another one starts where the last ended', () => {
    const first = makeSample(undefined, 100_000, 30)
    expect(first).toEqual({ start: 70_000, end: 100_000, words: 30 })
    expect(makeSample(first, 110_000, 10)).toEqual({ start: 100_000, end: 110_000, words: 10 })
    // a long pause: assume a word a second, capped at a minute
    expect(makeSample(first, 1_000_000, 500)).toEqual({ start: 940_000, end: 1_000_000, words: 500 })
  })
})

describe('recordsStore', () => {
  it('celebrates a new best day once and remembers the break', () => {
    useRecordsStore.setState({ bestDay: { words: 500, date: '2026-10-01' } })
    write(450, at(6, 9))
    expect(toastMessages()).toEqual([])
    write(100, at(6, 10))
    write(100, at(6, 11))
    expect(toastMessages()).toEqual(['New best day: 550 words'])
    expect(useRecordsStore.getState().bestDay).toEqual({ words: 650, date: '2026-10-06' })
    const breaks = getRecentRecordBreaks(at(6, 0))
    expect(breaks).toHaveLength(1)
    expect(breaks[0]).toMatchObject({ kind: 'day', value: 650, previous: 500 })
    expect(getRecentRecordBreaks(at(6, 11, 30))).toHaveLength(0)
  })

  it('stays quiet when there was no earlier record', () => {
    write(800, at(6, 9))
    expect(toastMessages()).toEqual([])
    expect(useRecordsStore.getState().bestDay).toEqual({ words: 800, date: '2026-10-06' })
  })

  it('tracks the best week', () => {
    useRecordsStore.setState({ bestWeek: { words: 1000, weekStart: '2026-09-28' } })
    useStreakStore.setState({ dailyWords: { '2026-10-05': 900 } })
    write(200, at(6, 9))
    expect(toastMessages()).toContain('New best week: 1,100 words')
  })

  it('tracks the fastest 500 words within a session', () => {
    useRecordsStore.setState({ fastest500: { ms: 20 * 60_000, at: 0 } })
    startSession('s1', at(6, 9))
    write(250, at(6, 9, 0, 0))
    write(250, at(6, 9, 5, 0))
    expect(useRecordsStore.getState().fastest500?.ms).toBe(6 * 60_000)
    expect(toastMessages()).toEqual(['New fastest 500 words: 6m 00s'])
    // a new session starts its own window
    startSession('s2', at(6, 14))
    write(400, at(6, 14, 0, 0))
    expect(useRecordsStore.getState().fastest500?.ms).toBe(6 * 60_000)
  })

  it('tracks the biggest session', () => {
    useRecordsStore.setState({ biggestSession: { words: 300, at: 0 } })
    startSession('s1', at(6, 9))
    write(200, at(6, 9))
    write(200, at(6, 9, 30))
    write(200, at(6, 9, 40))
    expect(useRecordsStore.getState().biggestSession?.words).toBe(600)
    expect(toastMessages()).toContain('New biggest session: 400 words')
    expect(toastMessages().filter((m) => m.startsWith('New biggest session'))).toHaveLength(1)
  })

  it('tracks the longest streak', () => {
    useRecordsStore.setState({ longestStreak: { days: 2, at: 0 } })
    useStreakStore.setState({ dailyWords: { '2026-10-04': 200, '2026-10-05': 200 } })
    write(150, at(6, 9))
    expect(useRecordsStore.getState().longestStreak?.days).toBe(3)
    expect(toastMessages()).toContain('New longest streak: 3 days')
  })

  it('folds in history silently', () => {
    useStreakStore.getState().mergeHistory(
      { '2026-10-01': { gross: 900, net: 0, minutesActive: 1, lastMinuteIndex: null } },
      at(6),
    )
    expect(useRecordsStore.getState().bestDay).toEqual({ words: 900, date: '2026-10-01' })
    expect(toastMessages()).toEqual([])
  })
})

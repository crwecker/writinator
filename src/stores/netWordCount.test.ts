import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useStreakStore } from './streakStore'
import { useMetricsStore } from './metricsStore'
import { usePlayerStore } from './playerStore'
import { useGameSettingsStore } from './gameSettingsStore'
import { useStoryletStore } from './storyletStore'
import { useImageRevealStore } from './imageRevealStore'
import { resetStreakStore } from '../test/habitFixtures'
import { makeBook, makeStorylet, seedCharacters, seedStore } from '../test/fixtures'
import { resetQuestLedger } from '../lib/wordAccounting'

const at = (day: number, hour = 12) => new Date(2026, 9, day, hour).getTime()

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(at(6))
  resetStreakStore()
  resetQuestLedger()
  useMetricsStore.setState({ dayBuckets: {}, session: null })
  usePlayerStore.setState(usePlayerStore.getInitialState(), true)
  useGameSettingsStore.setState(useGameSettingsStore.getInitialState(), true)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('streak words: gross vs net', () => {
  it('gross (default): deletions do not reduce the day', () => {
    useMetricsStore.getState().recordDelta(0, 100, at(6))
    useMetricsStore.getState().recordDelta(100, 40, at(6))
    expect(useStreakStore.getState().dailyWords['2026-10-06']).toBe(100)
  })

  it('net: the day counts growth, floored at 0', () => {
    useGameSettingsStore.getState().setWordCountMode('net')
    useMetricsStore.getState().recordDelta(0, 100, at(6))
    useMetricsStore.getState().recordDelta(100, 40, at(6))
    expect(useStreakStore.getState().dailyWords['2026-10-06']).toBe(40)
    useMetricsStore.getState().recordDelta(40, -400, at(6))
    expect(useStreakStore.getState().dailyWords['2026-10-06']).toBe(0)
    useMetricsStore.getState().recordDelta(0, 100, at(6))
    expect(useStreakStore.getState().dailyWords['2026-10-06']).toBe(0)
  })

  it('net: book history merges net words, not gross', () => {
    useGameSettingsStore.getState().setWordCountMode('net')
    useStreakStore.getState().mergeHistory({ '2026-10-04': { gross: 500, net: 120, minutesActive: 5, lastMinuteIndex: null } }, at(6))
    expect(useStreakStore.getState().dailyWords['2026-10-04']).toBe(120)
  })
})

describe('quest words from the flush', () => {
  const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')

  beforeEach(() => {
    seedStore(makeBook([makeStorylet('a', 'Chapter A')]), 'a')
    seedCharacters([], {})
  })

  function type(content: string) {
    useStoryletStore.getState().updateStoryletContent(content, 'a')
    useStoryletStore.getState()._flushContentUpdate()
  }

  it('gross: rewriting deleted words counts again', () => {
    const addWords = vi.spyOn(useImageRevealStore.getState(), 'addWords')
    type(words(100))
    type(words(50))
    type(words(100))
    expect(addWords.mock.calls.map((c) => c[0])).toEqual([98, 50])
  })

  it('net: rewriting deleted words only repays what was deleted', () => {
    useGameSettingsStore.getState().setWordCountMode('net')
    const addWords = vi.spyOn(useImageRevealStore.getState(), 'addWords')
    type(words(100))
    type(words(50))
    type(words(100))
    type(words(120))
    expect(addWords.mock.calls.map((c) => c[0])).toEqual([98, 20])
  })
})

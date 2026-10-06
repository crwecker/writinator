import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { localforageJSONStorage } from './localforageStorage'
import { subscribeCountedWords, useMetricsStore } from './metricsStore'
import { subscribeStreakHistory, subscribeStreakWrites, useStreakStore } from './streakStore'
import { showToast } from './genericToastStore'
import { useGameSettingsStore } from './gameSettingsStore'
import { weekStartKey, weekTotal, parseDayKey } from '../lib/days'
import { bestDayFrom, bestWeekFrom, fastestSpan, formatDuration, makeSample, type WritingSample } from '../lib/records'

/**
 * Personal records for this writer (localforage only, never in book files).
 * New bests are detected as words come in; each is toasted once per period
 * (day, week, streak run, session) and then updated silently.
 */

export type RecordKind = 'day' | 'week' | 'streak' | 'fastest500' | 'session'

export interface RecordBreak {
  kind: RecordKind
  /** The day, week start, streak start or session id the record belongs to. */
  periodKey: string
  /** Latest value (words, days, or ms for fastest500). */
  value: number
  /** The record it beat. */
  previous: number
  /** When it was first beaten. */
  at: number
  /** When `value` last changed. */
  updatedAt: number
}

export const FASTEST_TARGET_WORDS = 500
const MAX_BREAKS = 50
const MAX_SAMPLES = 3000

interface RecordsState {
  bestDay: { words: number; date: string } | null
  bestWeek: { words: number; weekStart: string } | null
  longestStreak: { days: number; at: number; chainStart?: string } | null
  fastest500: { ms: number; at: number; sessionId?: string } | null
  biggestSession: { words: number; at: number; sessionId?: string } | null
  breaks: RecordBreak[]
  _hasHydrated: boolean
}

const storage = localforageJSONStorage<RecordsState>()

let pending: Array<() => void> = []

export const useRecordsStore = create<RecordsState>()(
  persist(
    (): RecordsState => ({
      bestDay: null,
      bestWeek: null,
      longestStreak: null,
      fastest500: null,
      biggestSession: null,
      breaks: [],
      _hasHydrated: false,
    }),
    {
      name: 'writinator-records',
      storage,
      version: 1,
      partialize: (s) =>
        ({
          bestDay: s.bestDay,
          bestWeek: s.bestWeek,
          longestStreak: s.longestStreak,
          fastest500: s.fastest500,
          biggestSession: s.biggestSession,
          breaks: s.breaks,
        }) as unknown as RecordsState,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.error('[recordsStore] rehydration error:', error)
        useRecordsStore.setState({ _hasHydrated: true })
        const queued = pending
        pending = []
        for (const op of queued) op()
      },
    },
  ),
)

/** Record breaks first set or improved at or after `sinceMs`, oldest first (for session recaps). */
export function getRecentRecordBreaks(sinceMs: number): RecordBreak[] {
  return useRecordsStore
    .getState()
    .breaks.filter((b) => b.updatedAt >= sinceMs)
    .sort((a, b) => a.at - b.at)
}

/** Add or update the break for (kind, periodKey). Returns true when it's new (worth a toast). */
function noteBreak(kind: RecordKind, periodKey: string, value: number, previous: number, now: number): boolean {
  const { breaks } = useRecordsStore.getState()
  const i = breaks.findIndex((b) => b.kind === kind && b.periodKey === periodKey)
  if (i >= 0) {
    const next = [...breaks]
    next[i] = { ...breaks[i], value, updatedAt: now }
    useRecordsStore.setState({ breaks: next })
    return false
  }
  const entry: RecordBreak = { kind, periodKey, value, previous, at: now, updatedAt: now }
  useRecordsStore.setState({ breaks: [...breaks, entry].slice(-MAX_BREAKS) })
  return true
}

/** Update the value of an existing break for (kind, periodKey), if there is one. */
function touchBreak(kind: RecordKind, periodKey: string, value: number, now: number): void {
  const { breaks } = useRecordsStore.getState()
  const i = breaks.findIndex((b) => b.kind === kind && b.periodKey === periodKey)
  if (i < 0) return
  const next = [...breaks]
  next[i] = { ...breaks[i], value, updatedAt: now }
  useRecordsStore.setState({ breaks: next })
}

function celebrate(message: string): void {
  // Quiet mode hides game feedback; records still update.
  if (useGameSettingsStore.getState().quietMode) return
  showToast(message, 'success')
}

const words = (n: number) => `${n.toLocaleString()} word${n === 1 ? '' : 's'}`

// ---------------------------------------------------------------------------
// Day / week / streak — checked after each write lands in the streak log
// ---------------------------------------------------------------------------

function onWrite(day: string, now: number): void {
  if (!useRecordsStore.getState()._hasHydrated) {
    pending.push(() => onWrite(day, now))
    return
  }
  const streak = useStreakStore.getState()
  const state = useRecordsStore.getState()

  const dayWords = streak.dailyWords[day] ?? 0
  const { bestDay } = state
  if (bestDay === null || bestDay.date === day) {
    if (dayWords > (bestDay?.words ?? 0)) {
      useRecordsStore.setState({ bestDay: { words: dayWords, date: day } })
      touchBreak('day', day, dayWords, now)
    }
  } else if (dayWords > bestDay.words) {
    useRecordsStore.setState({ bestDay: { words: dayWords, date: day } })
    if (noteBreak('day', day, dayWords, bestDay.words, now)) celebrate(`New best day: ${words(dayWords)}`)
  }

  const week = weekStartKey(parseDayKey(day).getTime())
  const weekWords = weekTotal(streak.dailyWords, parseDayKey(day).getTime())
  const { bestWeek } = useRecordsStore.getState()
  if (bestWeek === null || bestWeek.weekStart === week) {
    if (weekWords > (bestWeek?.words ?? 0)) {
      useRecordsStore.setState({ bestWeek: { words: weekWords, weekStart: week } })
      touchBreak('week', week, weekWords, now)
    }
  } else if (weekWords > bestWeek.words) {
    useRecordsStore.setState({ bestWeek: { words: weekWords, weekStart: week } })
    if (noteBreak('week', week, weekWords, bestWeek.words, now)) celebrate(`New best week: ${words(weekWords)}`)
  }

  const current = streak.currentStreak
  const chainStart = streak.milestonesPaid.chainStart ?? day
  const { longestStreak } = useRecordsStore.getState()
  if (current > 0) {
    if (longestStreak === null) {
      useRecordsStore.setState({ longestStreak: { days: current, at: now, chainStart } })
    } else if (current > longestStreak.days) {
      useRecordsStore.setState({ longestStreak: { days: current, at: now, chainStart } })
      const isNew = noteBreak('streak', chainStart, current, longestStreak.days, now)
      // Growing your own record is quiet; overtaking an earlier run is news.
      if (isNew && longestStreak.chainStart !== chainStart) celebrate(`New longest streak: ${current} days`)
    }
  }
}

// ---------------------------------------------------------------------------
// Session records — fastest 500 words and biggest session
// ---------------------------------------------------------------------------

let tracker: { sessionId: string | null; samples: WritingSample[] } = { sessionId: null, samples: [] }

function onCountedWords(delta: number, now: number): void {
  if (delta <= 0) return
  const session = useMetricsStore.getState().session
  if (!session) return
  if (!useRecordsStore.getState()._hasHydrated) {
    pending.push(() => onCountedWords(delta, now))
    return
  }
  if (tracker.sessionId !== session.sessionId) tracker = { sessionId: session.sessionId, samples: [] }
  tracker.samples.push(makeSample(tracker.samples.at(-1), now, delta))
  if (tracker.samples.length > MAX_SAMPLES) tracker.samples = tracker.samples.slice(-MAX_SAMPLES / 2)

  const id = session.sessionId
  const span = fastestSpan(tracker.samples, FASTEST_TARGET_WORDS)
  const { fastest500, biggestSession } = useRecordsStore.getState()
  if (span !== null) {
    if (fastest500 === null) {
      useRecordsStore.setState({ fastest500: { ms: span, at: now, sessionId: id } })
    } else if (span < fastest500.ms) {
      useRecordsStore.setState({ fastest500: { ms: span, at: now, sessionId: id } })
      const isNew = noteBreak('fastest500', id, span, fastest500.ms, now)
      if (isNew && fastest500.sessionId !== id) {
        celebrate(`New fastest ${FASTEST_TARGET_WORDS} words: ${formatDuration(span)}`)
      }
    }
  }

  const gross = session.gross
  if (biggestSession === null) {
    if (gross > 0) useRecordsStore.setState({ biggestSession: { words: gross, at: now, sessionId: id } })
  } else if (gross > biggestSession.words) {
    useRecordsStore.setState({ biggestSession: { words: gross, at: now, sessionId: id } })
    const isNew = noteBreak('session', id, gross, biggestSession.words, now)
    if (isNew && biggestSession.sessionId !== id) celebrate(`New biggest session: ${words(gross)}`)
  }
}

// ---------------------------------------------------------------------------
// History merges — recompute quietly
// ---------------------------------------------------------------------------

function onHistory(): void {
  if (!useRecordsStore.getState()._hasHydrated) {
    pending.push(onHistory)
    return
  }
  const streak = useStreakStore.getState()
  const state = useRecordsStore.getState()
  const day = bestDayFrom(streak.dailyWords)
  const week = bestWeekFrom(streak.dailyWords)
  const patch: Partial<RecordsState> = {}
  if (day && day.words > (state.bestDay?.words ?? 0)) patch.bestDay = day
  if (week && week.words > (state.bestWeek?.words ?? 0)) patch.bestWeek = week
  if (streak.longestStreak > (state.longestStreak?.days ?? 0)) {
    patch.longestStreak = { days: streak.longestStreak, at: Date.now(), chainStart: streak.milestonesPaid.chainStart ?? undefined }
  }
  if (Object.keys(patch).length > 0) useRecordsStore.setState(patch)
}

subscribeStreakWrites(({ day, timestamp }) => onWrite(day, timestamp))
subscribeStreakHistory(onHistory)
subscribeCountedWords(onCountedWords)

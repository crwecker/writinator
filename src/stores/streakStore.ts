import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { localforageJSONStorage } from './localforageStorage'
import type { DailyMetricBucket } from '../types'
import {
  computeStreak,
  dueMilestones,
  evaluateStreak,
  longestRun,
  STREAK_FREEZE_ID,
  type CoverKind,
} from '../lib/streak'
import { todayKey } from '../lib/metrics'
import { subscribeCountedWords, subscribeMetricsHistory } from './metricsStore'
import { usePlayerStore } from './playerStore'
import { addToast } from '../components/quests/rewardToastStore'
import { showToast } from './genericToastStore'
import { useGameSettingsStore } from './gameSettingsStore'

/**
 * Per-writer writing habits: a day-by-day log of counted words (all books),
 * the streak built on it, the weekly goal and the reminder settings. Lives in
 * localforage only — never in book files.
 */

export interface NudgeSettings {
  enabled: boolean
  /** Local time of day, "HH:MM". */
  time: string
}

export interface StreakWriteEvent {
  day: string
  timestamp: number
}

interface StreakState {
  /** Counted (gross) words per local day across every book. */
  dailyWords: Record<string, number>
  /** Missed days kept alive by a grace day or a Streak Freeze. */
  covered: Record<string, CoverKind>
  evaluatedThrough: string | null
  longestStreak: number
  /** Milestones already celebrated in the streak that started on `chainStart`. */
  milestonesPaid: { chainStart: string | null; days: number[] }
  weeklyGoal: number | null
  nudge: NudgeSettings
  lastNudgedDay: string | null
  /** Derived from the ledger; cached so components can subscribe to primitives. */
  currentStreak: number
  todayQualified: boolean
  _hasHydrated: boolean

  recordWords: (delta: number, timestamp: number) => void
  /** Finalise past days (grace / freezes) and refresh the derived streak. */
  evaluate: (now?: number) => void
  /** Fold a book's metric history in (max per day). Silent: no coins, no toasts. */
  mergeHistory: (dayBuckets: Record<string, DailyMetricBucket>, now?: number) => void
  setWeeklyGoal: (goal: number | null) => void
  setNudge: (patch: Partial<NudgeSettings>) => void
  markNudged: (day: string) => void
}

type WriteListener = (event: StreakWriteEvent) => void
const writeListeners = new Set<WriteListener>()
const historyListeners = new Set<() => void>()

/** Fired after counted words land in the log (records use this for "new best" checks). */
export function subscribeStreakWrites(listener: WriteListener): () => void {
  writeListeners.add(listener)
  return () => writeListeners.delete(listener)
}

/** Fired after history was merged in (records recompute silently). */
export function subscribeStreakHistory(listener: () => void): () => void {
  historyListeners.add(listener)
  return () => historyListeners.delete(listener)
}

// Work that arrives before rehydration finishes would be overwritten by it.
let pending: Array<() => void> = []
// Freezes live in the player store; never finalise days before it has loaded.
let waitingForPlayer = false

const storage = localforageJSONStorage<StreakState>()

export const useStreakStore = create<StreakState>()(
  persist(
    (set, get) => {
      /** Evaluate past days, then recompute the derived streak and milestones. */
      function refresh(now: number, pay: boolean): void {
        const today = todayKey(now)
        const state = get()
        const playerReady = usePlayerStore.persist.hasHydrated()
        if (!playerReady && !waitingForPlayer) {
          waitingForPlayer = true
          const off = usePlayerStore.persist.onFinishHydration(() => {
            waitingForPlayer = false
            off()
            get().evaluate(Date.now())
          })
        }
        const freezesOwned = usePlayerStore.getState().consumableInventory[STREAK_FREEZE_ID] ?? 0
        const ev = playerReady
          ? evaluateStreak(state, today, freezesOwned)
          : { covers: {}, freezesUsed: 0, evaluatedThrough: state.evaluatedThrough }
        const covered = Object.keys(ev.covers).length > 0 ? { ...state.covered, ...ev.covers } : state.covered
        if (ev.freezesUsed > 0) {
          for (let i = 0; i < ev.freezesUsed; i++) usePlayerStore.getState().useConsumable(STREAK_FREEZE_ID)
        }

        const status = computeStreak({ dailyWords: state.dailyWords, covered }, today)
        let paid = state.milestonesPaid
        // A new run starts the milestone ladder over; a momentary gap (null) doesn't.
        if (status.chainStart !== null && status.chainStart !== paid.chainStart) {
          paid = { chainStart: status.chainStart, days: [] }
        }
        const due = dueMilestones(status.current, paid.days)
        if (due.length > 0) paid = { ...paid, days: [...paid.days, ...due.map((m) => m.days)] }

        set({
          covered,
          evaluatedThrough: ev.evaluatedThrough,
          currentStreak: status.current,
          todayQualified: status.todayQualified,
          longestStreak: Math.max(state.longestStreak, status.current),
          milestonesPaid: paid,
        })

        if (pay) {
          const graces = Object.values(ev.covers).filter((k) => k === 'grace').length
          if ((graces > 0 || ev.freezesUsed > 0) && !useGameSettingsStore.getState().quietMode) {
            const what =
              ev.freezesUsed > 0
                ? `${ev.freezesUsed} Streak Freeze${ev.freezesUsed === 1 ? '' : 's'}${graces > 0 ? ' and your grace day' : ''}`
                : 'Your grace day'
            showToast(`${what} kept your ${status.current}-day streak alive`, 'info')
          }
          for (const m of due) {
            usePlayerStore.getState().addCoins(m.coins)
            addToast(m.coins, `🔥 ${m.days}-day writing streak!`)
          }
        }
      }

      return {
        dailyWords: {},
        covered: {},
        evaluatedThrough: null,
        longestStreak: 0,
        milestonesPaid: { chainStart: null, days: [] },
        weeklyGoal: null,
        nudge: { enabled: false, time: '20:00' },
        lastNudgedDay: null,
        currentStreak: 0,
        todayQualified: false,
        _hasHydrated: false,

        recordWords: (delta, timestamp) => {
          if (delta <= 0) return
          if (!get()._hasHydrated) {
            pending.push(() => get().recordWords(delta, timestamp))
            return
          }
          const day = todayKey(timestamp)
          const { dailyWords } = get()
          set({ dailyWords: { ...dailyWords, [day]: (dailyWords[day] ?? 0) + delta } })
          refresh(timestamp, true)
          for (const listener of writeListeners) listener({ day, timestamp })
        },

        evaluate: (now = Date.now()) => {
          if (!get()._hasHydrated) return
          refresh(now, true)
        },

        mergeHistory: (dayBuckets, now = Date.now()) => {
          if (!get()._hasHydrated) {
            pending.push(() => get().mergeHistory(dayBuckets, now))
            return
          }
          const { dailyWords } = get()
          let next: Record<string, number> | null = null
          for (const [day, bucket] of Object.entries(dayBuckets)) {
            const gross = Math.max(0, bucket.gross)
            if (gross > (dailyWords[day] ?? 0)) {
              next ??= { ...dailyWords }
              next[day] = gross
            }
          }
          if (next) {
            set({ dailyWords: next, longestStreak: Math.max(get().longestStreak, longestRun({ dailyWords: next, covered: get().covered })) })
          }
          refresh(now, false)
          for (const listener of historyListeners) listener()
        },

        setWeeklyGoal: (goal) => set({ weeklyGoal: goal !== null && goal > 0 ? Math.round(goal) : null }),
        setNudge: (patch) => set((s) => ({ nudge: { ...s.nudge, ...patch } })),
        markNudged: (day) => set({ lastNudgedDay: day }),
      }
    },
    {
      name: 'writinator-streak',
      storage,
      version: 1,
      partialize: (s) =>
        ({
          dailyWords: s.dailyWords,
          covered: s.covered,
          evaluatedThrough: s.evaluatedThrough,
          longestStreak: s.longestStreak,
          milestonesPaid: s.milestonesPaid,
          weeklyGoal: s.weeklyGoal,
          nudge: s.nudge,
          lastNudgedDay: s.lastNudgedDay,
        }) as unknown as StreakState,
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.error('[streakStore] rehydration error:', error)
        useStreakStore.setState({ _hasHydrated: true })
        const queued = pending
        pending = []
        for (const op of queued) op()
        useStreakStore.getState().evaluate()
      },
    },
  ),
)

subscribeCountedWords((delta, timestamp) => useStreakStore.getState().recordWords(delta, timestamp))
subscribeMetricsHistory((dayBuckets) => useStreakStore.getState().mergeHistory(dayBuckets))

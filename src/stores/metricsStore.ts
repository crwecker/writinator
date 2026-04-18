import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as localforage from 'localforage'
import type { DailyMetricBucket, MetricKey, MetricsState } from '../types'
import { todayKey } from '../lib/metrics'

const localforageStorage = createJSONStorage<MetricsState>(() => ({
  getItem: async (name: string) => {
    const value = await localforage.getItem<string>(name)
    return value
  },
  setItem: async (name: string, value: string) => {
    await localforage.setItem(name, value)
  },
  removeItem: async (name: string) => {
    await localforage.removeItem(name)
  },
}))

export const useMetricsStore = create<MetricsState>()(
  persist(
    (set, get) => ({
      dayBuckets: {},
      session: null,
      pinnedMetrics: ['storyletWords', 'bookWords'] as MetricKey[],
      hasHydrated: false,
      wpmSamples: [],

      recordDelta: (
        oldCount: number,
        newCount: number,
        timestamp: number,
      ) => {
        const delta = newCount - oldCount
        if (delta === 0) return

        const key = todayKey(timestamp)
        const { dayBuckets, session } = get()

        const existing: DailyMetricBucket = dayBuckets[key] ?? {
          gross: 0,
          net: 0,
          minutesActive: 0,
          lastMinuteIndex: null,
        }

        const currentMinuteIndex = Math.floor(timestamp / 60_000)
        const minutesActiveIncrement =
          existing.lastMinuteIndex !== currentMinuteIndex ? 1 : 0

        const updatedBucket: DailyMetricBucket = {
          gross: delta > 0 ? existing.gross + delta : existing.gross,
          net: existing.net + delta,
          minutesActive: existing.minutesActive + minutesActiveIncrement,
          lastMinuteIndex: currentMinuteIndex,
        }

        const updatedSession =
          session !== null
            ? {
                ...session,
                gross: delta > 0 ? session.gross + delta : session.gross,
                net: session.net + delta,
              }
            : null

        set({
          dayBuckets: { ...dayBuckets, [key]: updatedBucket },
          ...(updatedSession !== null ? { session: updatedSession } : {}),
        })
      },

      recordWpmSample: (delta: number, timestamp: number) => {
        // Implemented in Phase 3
        void delta
        void timestamp
      },

      startSession: () => {
        // Implemented in Phase 3
      },

      resetSession: () => {
        // Implemented in Phase 3
      },

      togglePin: (key: MetricKey) => {
        const { pinnedMetrics } = get()
        const already = pinnedMetrics.includes(key)
        set({
          pinnedMetrics: already
            ? pinnedMetrics.filter((k) => k !== key)
            : [...pinnedMetrics, key],
        })
      },

      isPinned: (key: MetricKey) => {
        return get().pinnedMetrics.includes(key)
      },
    }),
    {
      name: 'writinator-metrics',
      storage: localforageStorage,
      version: 0,
      migrate: (persisted, version) => {
        void version
        // Stub — future versions will populate migration logic here
        return persisted as MetricsState
      },
      partialize: (state) =>
        ({
          dayBuckets: state.dayBuckets,
          session: state.session,
          pinnedMetrics: state.pinnedMetrics,
        }) as unknown as MetricsState,
      onRehydrateStorage: () => (_state, error) => {
        if (error) {
          console.error('[metricsStore] rehydration error:', error)
        }
        useMetricsStore.setState({ hasHydrated: true })
      },
    }
  )
)

if (import.meta.env.DEV) {
  ;(globalThis as unknown as { __metricsStore?: unknown }).__metricsStore =
    useMetricsStore
}

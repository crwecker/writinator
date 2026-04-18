import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'
import * as localforage from 'localforage'
import type { DailyMetricBucket, MetricKey, MetricsFileData, MetricsState } from '../types'
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
        // NOTE: wpmSamples is intentionally excluded from `partialize` (transient).
        // Do NOT subscribe to wpmSamples via useMetricsStore(s => s.wpmSamples) in
        // React components — it fires on every keystroke. Read via getState() in
        // callbacks or compute WPM on demand.
        if (delta <= 0) return
        const now = timestamp
        const cutoff = now - 600_000 // 10 minutes
        const { wpmSamples } = get()
        // Prune old samples + append new one (immutable array so Zustand notifies subscribers)
        let pruned = wpmSamples.filter((s) => s.timestamp >= cutoff)
        pruned = [...pruned, { timestamp, delta }]
        // Bound array size to prevent unbounded growth
        if (pruned.length > 5000) {
          pruned = pruned.slice(-3000)
        }
        set({ wpmSamples: pruned })
      },

      startSession: () => {
        const { session } = get()
        const fourHours = 4 * 60 * 60 * 1000
        if (session !== null && Date.now() - session.startedAt < fourHours) {
          // Reuse existing session — still within the 4-hour window
          return
        }
        set({
          session: {
            sessionId: crypto.randomUUID(),
            startedAt: Date.now(),
            gross: 0,
            net: 0,
          },
        })
      },

      resetSession: () => {
        set({ session: null })
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
      version: 1,
      migrate: (persisted, version) => {
        if (!persisted || typeof persisted !== 'object') return persisted as MetricsState
        const s = persisted as Partial<MetricsState>
        if (version < 1) {
          if (!Array.isArray(s.pinnedMetrics) || s.pinnedMetrics.length === 0) {
            return { ...s, pinnedMetrics: ['storyletWords', 'bookWords'] as MetricKey[] } as MetricsState
          }
        }
        return s as MetricsState
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

// ---------------------------------------------------------------------------
// File serialization helpers — used by fileSystem.ts section registry
// ---------------------------------------------------------------------------

export function serializeMetrics(): MetricsFileData {
  const { dayBuckets, session, pinnedMetrics } = useMetricsStore.getState()
  return { dayBuckets, session, pinnedMetrics }
}

export function hydrateMetrics(data: MetricsFileData | undefined): void {
  if (data === undefined) return
  // wpmSamples is a transient buffer — intentionally NOT cleared here
  useMetricsStore.setState({
    dayBuckets: data.dayBuckets,
    session: data.session,
    pinnedMetrics: data.pinnedMetrics,
  })
}

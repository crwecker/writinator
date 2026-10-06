import { beforeEach, describe, expect, it } from 'vitest'
import { hydrateMetrics, subscribeCountedWords, subscribeMetricsHistory, useMetricsStore } from './metricsStore'

beforeEach(() => {
  useMetricsStore.setState({ dayBuckets: {}, session: null })
})

describe('metrics listeners', () => {
  it('tells counted-word listeners about each recorded change', () => {
    const seen: [number, number][] = []
    const off = subscribeCountedWords((delta, ts) => seen.push([delta, ts]))
    const t = new Date(2026, 9, 6, 10).getTime()
    useMetricsStore.getState().recordDelta(10, 25, t)
    useMetricsStore.getState().recordDelta(25, 20, t + 1)
    useMetricsStore.getState().recordDelta(20, 20, t + 2)
    off()
    useMetricsStore.getState().recordDelta(20, 30, t + 3)
    expect(seen).toEqual([[15, t], [-5, t + 1]])
  })

  it('listeners see the store already updated', () => {
    useMetricsStore.setState({ session: { sessionId: 's', startedAt: 0, gross: 0, net: 0 } })
    let sessionGross = -1
    const off = subscribeCountedWords(() => {
      sessionGross = useMetricsStore.getState().session?.gross ?? -1
    })
    useMetricsStore.getState().recordDelta(0, 40, Date.now())
    off()
    expect(sessionGross).toBe(40)
  })

  it('tells history listeners when a book’s buckets are loaded', () => {
    const loaded: string[][] = []
    const off = subscribeMetricsHistory((b) => loaded.push(Object.keys(b)))
    hydrateMetrics({
      dayBuckets: { '2026-10-01': { gross: 300, net: 200, minutesActive: 5, lastMinuteIndex: null } },
      session: null,
      pinnedMetrics: [],
    })
    off()
    expect(loaded).toEqual([['2026-10-01']])
  })
})

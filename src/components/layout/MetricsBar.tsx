import { useState, useRef, useEffect, useMemo } from 'react'
import { useMetricsStore } from '../../stores/metricsStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { getMetricDisplayValue } from '../../lib/metrics'
import { MetricsPopover } from './MetricsPopover'
import { MetricsGraphModal } from './MetricsGraphModal'
import type { MetricKey } from '../../types'

interface MetricsBarProps {
  wordCount: number
  bookWordCount: number
}

function pillLabel(key: MetricKey, value: string, wordCount: number): string {
  switch (key) {
    case 'session':
      return `${value} session`
    case 'today':
      return `${value} today`
    case 'todayNet':
      return `${value} today (net)`
    case 'wpm10':
      return `${value} WPM`
    case 'week':
      return `${value} wk`
    case 'month':
      return `${value} mo`
    case 'year':
      return `${value} yr`
    case 'storyletWords':
      return `${value} ${wordCount === 1 ? 'word' : 'words'}`
    case 'bookWords':
      return `${value} book`
  }
}

export function MetricsBar({ wordCount, bookWordCount }: MetricsBarProps) {
  const [open, setOpen] = useState(false)
  const [graphOpen, setGraphOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const [, setTick] = useState(0)

  const pinnedMetrics = useMetricsStore((s) => s.pinnedMetrics)
  const dayBuckets = useMetricsStore((s) => s.dayBuckets)
  const session = useMetricsStore((s) => s.session)
  const book = useStoryletStore((s) => s.book)
  const activeStoryletId = useStoryletStore((s) => s.activeStoryletId)
  const activeStorylet = useMemo(
    () => book?.storylets.find((s) => s.id === activeStoryletId) ?? null,
    [book, activeStoryletId],
  )

  const wpm10Pinned = pinnedMetrics.includes('wpm10')

  // Refresh interval for WPM when pinned or popover open
  useEffect(() => {
    if (!wpm10Pinned && !open) return
    const id = setInterval(() => setTick((t) => t + 1), 500)
    return () => clearInterval(id)
  }, [wpm10Pinned, open])

  // Build metrics snapshot without subscribing to wpmSamples reactively
  const metricsSnapshot = useMemo(
    () => ({
      dayBuckets,
      session,
      pinnedMetrics,
      hasHydrated: true,
      wpmSamples: useMetricsStore.getState().wpmSamples,
      recordDelta: useMetricsStore.getState().recordDelta,
      recordWpmSample: useMetricsStore.getState().recordWpmSample,
      startSession: useMetricsStore.getState().startSession,
      resetSession: useMetricsStore.getState().resetSession,
      togglePin: useMetricsStore.getState().togglePin,
      isPinned: useMetricsStore.getState().isPinned,
    }),
    [dayBuckets, session, pinnedMetrics],
  )

  function getDisplayValue(key: MetricKey): string {
    if (key === 'storyletWords') return wordCount.toLocaleString()
    if (key === 'bookWords') return bookWordCount.toLocaleString()
    // Read wpmSamples fresh on each render tick
    const liveSnapshot = { ...metricsSnapshot, wpmSamples: useMetricsStore.getState().wpmSamples }
    return getMetricDisplayValue(key, liveSnapshot, book ?? null, activeStorylet).value
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        data-testid="metrics-bar"
        className="text-gray-500 tabular-nums transition-colors hover:text-gray-300 cursor-pointer"
        onClick={() => setOpen((v) => !v)}
        title="Writing metrics"
      >
        {pinnedMetrics.length === 0 ? (
          <span>View metrics</span>
        ) : (
          pinnedMetrics.map((key, i) => {
            const value = getDisplayValue(key)
            const label = pillLabel(key, value, wordCount)
            return (
              <span key={key}>
                <span>{label}</span>
                {i < pinnedMetrics.length - 1 && (
                  <span className="mx-1.5 text-gray-600">·</span>
                )}
              </span>
            )
          })
        )}
      </button>
      <MetricsPopover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={triggerRef}
        onShowGraph={() => { setOpen(false); setGraphOpen(true) }}
      />
      <MetricsGraphModal open={graphOpen} onClose={() => setGraphOpen(false)} />
    </div>
  )
}

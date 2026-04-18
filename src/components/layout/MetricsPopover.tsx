import { useEffect, useRef, useState, useMemo } from 'react'
import { Pin, PinOff, LineChart } from 'lucide-react'
import { useMetricsStore } from '../../stores/metricsStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { getMetricDisplayValue } from '../../lib/metrics'
import type { MetricKey } from '../../types'

const ALL_METRIC_KEYS: MetricKey[] = [
  'session',
  'today',
  'todayNet',
  'wpm10',
  'week',
  'month',
  'year',
  'storyletWords',
  'bookWords',
]

interface MetricsPopoverProps {
  open: boolean
  onClose: () => void
  anchorRef: React.RefObject<HTMLElement | null>
  onShowGraph: () => void
}

export function MetricsPopover({ open, onClose, anchorRef, onShowGraph }: MetricsPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  // Tick state forces re-render every 500ms when open, so WPM stays live
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

  // Build a MetricsState-shaped object so getMetricDisplayValue can read wpmSamples
  // without subscribing to it reactively (avoids re-render on every keystroke).
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

  // Live-refresh while open (ensures WPM ticks)
  useEffect(() => {
    if (!open) return
    const id = setInterval(() => setTick((t) => t + 1), 500)
    return () => clearInterval(id)
  }, [open])

  // Outside-click + Escape dismiss
  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose()
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose, anchorRef])

  if (!open) return null

  // Read wpmSamples fresh on each render (tick forces this)
  const liveMetrics = {
    ...metricsSnapshot,
    wpmSamples: useMetricsStore.getState().wpmSamples,
  }

  return (
    <div
      ref={popoverRef}
      aria-label="Writing metrics popover"
      className="absolute bottom-full left-0 mb-1 z-50 w-[280px] bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-2"
    >
      <div className="text-[10px] uppercase tracking-wider text-gray-500 px-3 pt-1 pb-2">
        Writing Metrics
      </div>

      {ALL_METRIC_KEYS.map((key) => {
        const { label, value } = getMetricDisplayValue(
          key,
          liveMetrics,
          book ?? null,
          activeStorylet,
        )
        const pinned = pinnedMetrics.includes(key)

        return (
          <div
            key={key}
            className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm rounded hover:bg-gray-800/60"
          >
            <span className="text-gray-300 flex-1">{label}</span>
            <span className="tabular-nums text-gray-200">{value}</span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                useMetricsStore.getState().togglePin(key)
              }}
              title={pinned ? 'Unpin' : 'Pin to bar'}
              className={`ml-1 transition-colors ${
                pinned
                  ? 'text-amber-400'
                  : 'text-gray-600 hover:text-gray-300'
              }`}
            >
              {pinned ? <Pin size={14} /> : <PinOff size={14} />}
            </button>
          </div>
        )
      })}

      <div className="my-2 border-t border-gray-800" />

      <button
        title="Show metrics graph"
        className="w-full text-left px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 rounded flex items-center gap-2 transition-colors"
        onClick={() => {
          onClose()
          onShowGraph()
        }}
      >
        <LineChart size={14} />
        Show graph
      </button>
    </div>
  )
}

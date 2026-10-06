import { useEffect, useRef, useState, useMemo } from 'react'
import { Pin, PinOff, LineChart } from 'lucide-react'
import { useMetricsStore } from '../../stores/metricsStore'
import { useStreakStore } from '../../stores/streakStore'
import { weekTotal } from '../../lib/days'
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

/** Weekly goal and daily reminder settings (per writer, not per book). */
function HabitSettings() {
  const weeklyGoal = useStreakStore((s) => s.weeklyGoal)
  const weekWords = useStreakStore((s) => weekTotal(s.dailyWords))
  const nudge = useStreakStore((s) => s.nudge)
  const [draft, setDraft] = useState(weeklyGoal === null ? '' : String(weeklyGoal))

  function commitGoal() {
    const n = Number(draft)
    useStreakStore.getState().setWeeklyGoal(draft.trim() === '' || !Number.isFinite(n) || n <= 0 ? null : n)
  }

  function toggleNudge(enabled: boolean) {
    useStreakStore.getState().setNudge({ enabled })
    // Ask from the click that turns it on; the in-app toast covers a "no".
    if (enabled && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => undefined)
    }
  }

  const pct = weeklyGoal ? Math.min(100, (weekWords / weeklyGoal) * 100) : 0
  const input =
    'bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-gray-200 tabular-nums outline-none focus:border-amber-600'

  return (
    <div className="px-3 py-1 space-y-2 text-sm">
      <div className="text-[10px] uppercase tracking-wider text-gray-500">Habits</div>
      <label className="flex items-center justify-between gap-2">
        <span className="text-gray-300">Weekly goal</span>
        <input
          type="number"
          min={0}
          step={500}
          placeholder="off"
          aria-label="Weekly word goal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitGoal}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitGoal()
          }}
          className={`${input} w-20 text-right`}
        />
      </label>
      {weeklyGoal !== null && (
        <div>
          <div className="h-1 rounded-full bg-gray-800 overflow-hidden">
            <div className="h-full bg-emerald-500 transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <div className="mt-1 text-xs text-gray-500 tabular-nums">
            {weekWords.toLocaleString()} of {weeklyGoal.toLocaleString()} this week (Mon–Sun)
          </div>
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-gray-300">
          <input
            type="checkbox"
            checked={nudge.enabled}
            onChange={(e) => toggleNudge(e.target.checked)}
            className="accent-amber-500"
          />
          Remind me at
        </label>
        <input
          type="time"
          aria-label="Reminder time"
          value={nudge.time}
          disabled={!nudge.enabled}
          onChange={(e) => e.target.value && useStreakStore.getState().setNudge({ time: e.target.value })}
          className={`${input} disabled:opacity-40`}
        />
      </div>
      {nudge.enabled && (
        <div className="text-xs text-gray-500">Once a day, only if you haven't written 100 words yet.</div>
      )}
    </div>
  )
}

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

      <HabitSettings />

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
        Graph & writing calendar
      </button>
    </div>
  )
}

import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { X } from 'lucide-react'
import { useMetricsStore } from '../../stores/metricsStore'
import {
  loadSnapshotBackfill,
  mergeBucketsWithBackfill,
} from '../../lib/metrics'
import type { BackfillPoint, MergedSeriesPoint } from '../../lib/metrics'

interface MetricsGraphModalProps {
  open: boolean
  onClose: () => void
}

type Range = '7d' | '30d' | '90d' | 'all'

const CHART_HEIGHT = 260
const PADDING_LEFT = 48
const PADDING_RIGHT = 16
const PADDING_TOP = 16
const PADDING_BOTTOM = 28
const VIEW_WIDTH = 820

const INNER_W = VIEW_WIDTH - PADDING_LEFT - PADDING_RIGHT
const INNER_H = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM

function fmtDate(date: string): string {
  const [, month, day] = date.split('-').map(Number)
  return `${month}/${day}`
}

function buildPath(pts: Array<{ x: number; y: number }>): string {
  if (pts.length === 0) return ''
  return pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')
}

interface ChartProps {
  series: MergedSeriesPoint[]
  showGross: boolean
  showNet: boolean
  showBook: boolean
}

function MetricsChart({ series, showGross, showNet, showBook }: ChartProps) {
  if (series.length === 0) {
    return (
      <div className="flex items-center justify-center h-[260px] text-gray-500 text-sm">
        No writing data yet for this range
      </div>
    )
  }

  // Collect all active values to determine Y range
  const allValues: number[] = []
  for (const p of series) {
    if (showGross) allValues.push(p.gross)
    if (showNet) allValues.push(p.net)
    if (showBook && p.bookWords !== null) allValues.push(p.bookWords)
  }

  const maxVal = allValues.length > 0 ? Math.max(...allValues) : 0
  const yMax = maxVal <= 0 ? 100 : Math.ceil(maxVal * 1.1)

  const xOf = (i: number) =>
    PADDING_LEFT + (series.length <= 1 ? INNER_W / 2 : (i / (series.length - 1)) * INNER_W)

  const yOf = (v: number) => PADDING_TOP + INNER_H - (v / yMax) * INNER_H

  // Gridlines (4 horizontal)
  const gridlines = [0, 1, 2, 3].map((i) => {
    const fraction = i / 3
    const value = Math.round(yMax * (1 - fraction))
    const yPos = PADDING_TOP + fraction * INNER_H
    return { yPos, label: value.toLocaleString() }
  })

  // X-axis: sample every Nth label to avoid overlap
  const tickStride = series.length <= 10 ? 1 : series.length <= 30 ? 3 : series.length <= 90 ? 7 : 30

  // Build gross path
  const grossPts = series.map((p, i) => ({ x: xOf(i), y: yOf(p.gross) }))
  const grossPath = buildPath(grossPts)

  // Build net path
  const netPts = series.map((p, i) => ({ x: xOf(i), y: yOf(p.net) }))
  const netPath = buildPath(netPts)

  // Build book size paths: split into solid (non-backfilled) and dashed (backfilled)
  const bookSolidSegments: Array<Array<{ x: number; y: number }>> = []
  const bookDashedPts: Array<{ x: number; y: number; date: string; bookWords: number }> = []

  let currentSolid: Array<{ x: number; y: number }> = []
  for (let i = 0; i < series.length; i++) {
    const p = series[i]
    if (p.bookWords === null) {
      if (currentSolid.length > 0) {
        bookSolidSegments.push(currentSolid)
        currentSolid = []
      }
      continue
    }
    const pt = { x: xOf(i), y: yOf(p.bookWords) }
    if (p.isBackfilled) {
      if (currentSolid.length > 0) {
        bookSolidSegments.push(currentSolid)
        currentSolid = []
      }
      bookDashedPts.push({ ...pt, date: p.date, bookWords: p.bookWords })
    } else {
      currentSolid.push(pt)
    }
  }
  if (currentSolid.length > 0) bookSolidSegments.push(currentSolid)

  const bookDashedPath = buildPath(bookDashedPts)

  return (
    <svg
      viewBox={`0 0 ${VIEW_WIDTH} ${CHART_HEIGHT}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height: CHART_HEIGHT }}
      data-testid="metrics-graph-svg"
    >
      {/* Background */}
      <rect
        x={PADDING_LEFT}
        y={PADDING_TOP}
        width={INNER_W}
        height={INNER_H}
        fill="rgba(17,24,39,0.4)"
      />

      {/* Y gridlines + labels */}
      {gridlines.map((g, i) => (
        <g key={`grid-${i}`}>
          <line
            x1={PADDING_LEFT}
            x2={PADDING_LEFT + INNER_W}
            y1={g.yPos}
            y2={g.yPos}
            stroke="rgba(55,65,81,0.6)"
            strokeWidth={1}
          />
          <text
            x={PADDING_LEFT - 4}
            y={g.yPos + 3}
            fontSize={9}
            textAnchor="end"
            fill="#6b7280"
          >
            {g.label}
          </text>
        </g>
      ))}

      {/* X-axis labels */}
      {series.map((p, i) =>
        i % tickStride === 0 ? (
          <text
            key={`xt-${i}`}
            x={xOf(i)}
            y={CHART_HEIGHT - 10}
            fontSize={9}
            textAnchor="middle"
            fill="#6b7280"
          >
            {fmtDate(p.date)}
          </text>
        ) : null,
      )}

      {/* Gross written — amber */}
      {showGross && grossPath && (
        <path d={grossPath} fill="none" stroke="#d97706" strokeWidth={1.5} />
      )}
      {showGross &&
        series.map((p, i) => (
          <circle key={`gross-${i}`} cx={xOf(i)} cy={yOf(p.gross)} r={3} fill="#d97706">
            <title>{`${p.date}: ${p.gross.toLocaleString()} gross`}</title>
          </circle>
        ))}

      {/* Net book growth — emerald */}
      {showNet && netPath && (
        <path d={netPath} fill="none" stroke="#10b981" strokeWidth={1.5} />
      )}
      {showNet &&
        series.map((p, i) => (
          <circle key={`net-${i}`} cx={xOf(i)} cy={yOf(p.net)} r={3} fill="#10b981">
            <title>{`${p.date}: ${p.net.toLocaleString()} net`}</title>
          </circle>
        ))}

      {/* Book size — sky, solid segments */}
      {showBook &&
        bookSolidSegments.map((seg, si) => (
          <g key={`bksolid-${si}`}>
            <path d={buildPath(seg)} fill="none" stroke="#38bdf8" strokeWidth={1.5} />
            {seg.map((pt, pi) => {
              // find original series index to get date/bookWords
              const seriesIdx = series.findIndex(
                (sp, idx) => sp.bookWords !== null && !sp.isBackfilled && Math.abs(xOf(idx) - pt.x) < 0.5,
              )
              const sp = seriesIdx >= 0 ? series[seriesIdx] : null
              return (
                <circle key={`bks-dot-${si}-${pi}`} cx={pt.x} cy={pt.y} r={3} fill="#38bdf8">
                  <title>{sp ? `${sp.date}: ${sp.bookWords?.toLocaleString()} book` : 'book'}</title>
                </circle>
              )
            })}
          </g>
        ))}

      {/* Book size — dashed backfill */}
      {showBook && bookDashedPath && (
        <path
          d={bookDashedPath}
          fill="none"
          stroke="#38bdf8"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          strokeOpacity={0.65}
        />
      )}
      {showBook &&
        bookDashedPts.map((pt, i) => (
          <circle key={`bkd-${i}`} cx={pt.x} cy={pt.y} r={3} fill="#38bdf8" fillOpacity={0.55}>
            <title>{`${pt.date}: ${pt.bookWords.toLocaleString()} book (estimated)`}</title>
          </circle>
        ))}
    </svg>
  )
}

export function MetricsGraphModal({ open, onClose }: MetricsGraphModalProps) {
  const [range, setRange] = useState<Range>('30d')
  const [showGross, setShowGross] = useState(true)
  const [showNet, setShowNet] = useState(true)
  const [showBook, setShowBook] = useState(true)
  const [backfill, setBackfill] = useState<BackfillPoint[]>([])
  const backdropRef = useRef<HTMLDivElement>(null)

  const dayBuckets = useMetricsStore((s) => s.dayBuckets)

  // Load backfill when modal opens
  useEffect(() => {
    if (!open) return
    let cancelled = false
    loadSnapshotBackfill().then((pts) => {
      if (!cancelled) setBackfill(pts)
    })
    return () => {
      cancelled = true
    }
  }, [open])

  // Escape to close
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const series: MergedSeriesPoint[] = useMemo(
    () => mergeBucketsWithBackfill(dayBuckets, backfill, range === 'all' ? 'all' : range),
    [dayBuckets, backfill, range],
  )

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) onClose()
    },
    [onClose],
  )

  if (!open) return null

  const rangeOptions: Array<{ label: string; value: Range }> = [
    { label: '7d', value: '7d' },
    { label: '30d', value: '30d' },
    { label: '90d', value: '90d' },
    { label: 'all', value: 'all' },
  ]

  return (
    <div
      ref={backdropRef}
      data-testid="metrics-graph-modal"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"
      onClick={handleBackdropClick}
    >
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-xl w-[880px] max-w-[95vw] max-h-[85vh] overflow-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-gray-200 text-lg font-medium">Writing metrics</span>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            title="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Controls row */}
        <div className="flex items-center gap-4 mb-5 flex-wrap">
          {/* Range picker */}
          <div className="flex items-center gap-1">
            {rangeOptions.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRange(opt.value)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  range === opt.value
                    ? 'bg-gray-800 text-gray-200'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="w-px h-4 bg-gray-700" />

          {/* Series toggles */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGross((v) => !v)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                showGross
                  ? 'bg-amber-900/50 text-amber-400 border border-amber-700/40'
                  : 'text-gray-500 hover:text-gray-300 border border-transparent'
              }`}
            >
              Gross written
            </button>
            <button
              onClick={() => setShowNet((v) => !v)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                showNet
                  ? 'bg-emerald-900/50 text-emerald-400 border border-emerald-700/40'
                  : 'text-gray-500 hover:text-gray-300 border border-transparent'
              }`}
            >
              Net book growth
            </button>
            <button
              onClick={() => setShowBook((v) => !v)}
              className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                showBook
                  ? 'bg-sky-900/50 text-sky-400 border border-sky-700/40'
                  : 'text-gray-500 hover:text-gray-300 border border-transparent'
              }`}
            >
              Book size
            </button>
          </div>
        </div>

        {/* Chart */}
        <div className="w-full overflow-hidden rounded">
          <MetricsChart
            series={series}
            showGross={showGross}
            showNet={showNet}
            showBook={showBook}
          />
        </div>

        {/* Legend footer */}
        <div className="mt-3 flex items-center gap-4 text-[10px] text-gray-500">
          {showGross && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 bg-amber-500" />
              Gross written
            </span>
          )}
          {showNet && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 bg-emerald-500" />
              Net book growth
            </span>
          )}
          {showBook && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-0.5 bg-sky-400" />
              Book size
              <span className="opacity-60">(dashed = estimated from history)</span>
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

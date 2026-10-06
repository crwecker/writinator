import { useMemo, useState } from 'react'
import { Flame } from 'lucide-react'
import { useStreakStore } from '../../stores/streakStore'
import { useRecordsStore } from '../../stores/recordsStore'
import { buildCalendarGrid, type CalendarCell } from '../../lib/calendarGrid'
import { formatDayLabel, parseDayKey } from '../../lib/days'
import { formatDuration } from '../../lib/records'
import { STREAK_THRESHOLD } from '../../lib/streak'

const CELL = 11
const GAP = 2
const STEP = CELL + GAP
const LEFT = 26
const TOP = 16

// One hue, light → dark on the dark surface (sequential magnitude).
const LEVEL_FILL: Record<CalendarCell['level'], string> = {
  0: '#2a2725',
  1: '#1e4d3d',
  2: '#25785a',
  3: '#34a877',
  4: '#6ee7b7',
}
const STREAK_RING = '#f59e0b'

const DAY_LABELS: [number, string][] = [
  [0, 'Mon'],
  [2, 'Wed'],
  [4, 'Fri'],
]

function cellLabel(cell: CalendarCell): string {
  const parts = [`${formatDayLabel(cell.date)}: ${cell.words.toLocaleString()} word${cell.words === 1 ? '' : 's'}`]
  if (cell.words >= STREAK_THRESHOLD) parts.push('writing day')
  if (cell.cover === 'grace') parts.push('kept by grace day')
  if (cell.cover === 'freeze') parts.push('kept by Streak Freeze')
  return parts.join(' · ')
}

/** GitHub-style year of daily counted words, with the current streak outlined. */
export function WritingCalendar() {
  const dailyWords = useStreakStore((s) => s.dailyWords)
  const covered = useStreakStore((s) => s.covered)
  const current = useStreakStore((s) => s.currentStreak)
  const longest = useStreakStore((s) => s.longestStreak)
  const chainStart = useStreakStore((s) => s.milestonesPaid.chainStart)
  const records = useRecordsStore()
  const [hover, setHover] = useState<{ cell: CalendarCell; x: number; y: number } | null>(null)

  const grid = useMemo(
    () => buildCalendarGrid(dailyWords, covered, current > 0 ? chainStart : null),
    [dailyWords, covered, current, chainStart],
  )

  const width = LEFT + grid.length * STEP
  const height = TOP + 7 * STEP

  // Month labels at the first column whose Monday starts a new month.
  const months: { x: number; label: string }[] = []
  grid.forEach((col, i) => {
    const d = parseDayKey(col[0].date)
    const prev = i > 0 ? parseDayKey(grid[i - 1][0].date) : null
    if (prev === null || prev.getMonth() !== d.getMonth()) {
      if (i < grid.length - 2) months.push({ x: LEFT + i * STEP, label: d.toLocaleDateString(undefined, { month: 'short' }) })
    }
  })

  const yearDays = grid.flat().filter((c) => !c.future)
  const yearWords = yearDays.reduce((sum, c) => sum + c.words, 0)
  const writingDays = yearDays.filter((c) => c.words >= STREAK_THRESHOLD).length

  const summary: [string, string][] = [
    ['Current streak', `${current} day${current === 1 ? '' : 's'}`],
    ['Longest streak', `${longest} day${longest === 1 ? '' : 's'}`],
    ['Writing days (year)', writingDays.toLocaleString()],
    ['Words (year)', yearWords.toLocaleString()],
  ]
  const bests: [string, string][] = [
    ['Best day', records.bestDay ? `${records.bestDay.words.toLocaleString()} · ${formatDayLabel(records.bestDay.date)}` : '—'],
    ['Best week', records.bestWeek ? `${records.bestWeek.words.toLocaleString()} · wk of ${formatDayLabel(records.bestWeek.weekStart)}` : '—'],
    ['Fastest 500', records.fastest500 ? formatDuration(records.fastest500.ms) : '—'],
    ['Biggest session', records.biggestSession ? records.biggestSession.words.toLocaleString() : '—'],
  ]

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        {summary.map(([label, value]) => (
          <div key={label} className="rounded border border-gray-700 bg-gray-800/40 px-3 py-2">
            <div className="text-[10px] uppercase tracking-wider text-gray-500 flex items-center gap-1">
              {label === 'Current streak' && <Flame size={10} className="text-amber-500" />}
              {label}
            </div>
            <div className="text-gray-200 tabular-nums font-medium">{value}</div>
          </div>
        ))}
      </div>

      <div className="relative overflow-x-auto">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role="img"
          aria-label={`Writing calendar: ${writingDays} writing days and ${yearWords.toLocaleString()} words in the last year`}
          onMouseLeave={() => setHover(null)}
        >
          {months.map((m) => (
            <text key={`${m.x}`} x={m.x} y={10} className="fill-gray-500" fontSize={9}>
              {m.label}
            </text>
          ))}
          {DAY_LABELS.map(([row, label]) => (
            <text key={label} x={0} y={TOP + row * STEP + CELL - 2} className="fill-gray-500" fontSize={9}>
              {label}
            </text>
          ))}
          {grid.map((col, ci) =>
            col.map((cell, ri) => {
              if (cell.future) return null
              const x = LEFT + ci * STEP
              const y = TOP + ri * STEP
              return (
                <g key={cell.date}>
                  <rect
                    x={x}
                    y={y}
                    width={CELL}
                    height={CELL}
                    rx={2}
                    fill={LEVEL_FILL[cell.level]}
                    stroke={cell.inCurrentStreak && (cell.level >= 2 || cell.cover) ? STREAK_RING : 'none'}
                    strokeWidth={cell.inCurrentStreak ? 1.25 : 0}
                    onMouseEnter={() => setHover({ cell, x: x + CELL / 2, y })}
                  />
                  {cell.cover && (
                    <circle cx={x + CELL / 2} cy={y + CELL / 2} r={1.6} fill={cell.cover === 'freeze' ? '#7dd3fc' : '#d6d3d1'} pointerEvents="none" />
                  )}
                </g>
              )
            }),
          )}
        </svg>
        {hover && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded border border-gray-700 bg-gray-800 px-2 py-1 text-xs text-gray-200 whitespace-nowrap shadow-lg"
            style={{ left: hover.x, top: hover.y - 4 }}
          >
            {cellLabel(hover.cell)}
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          Less
          {([0, 1, 2, 3, 4] as const).map((l) => (
            <span key={l} className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: LEVEL_FILL[l] }} />
          ))}
          More
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-2.5 h-2.5 rounded-sm border" style={{ borderColor: STREAK_RING }} />
          Current streak
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-stone-300" /> Grace day
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-sky-300" /> Streak Freeze
        </span>
        <span>A writing day is {STREAK_THRESHOLD}+ new words. Counts every book.</span>
      </div>

      <div className="mt-5">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Personal records</div>
        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {bests.map(([label, value]) => (
            <div key={label} className="rounded border border-gray-700 bg-gray-800/40 px-3 py-2">
              <dt className="text-[10px] uppercase tracking-wider text-gray-500">{label}</dt>
              <dd className="text-gray-200 tabular-nums text-sm">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  )
}

import { useMemo, useState } from 'react'
import { useCharacterStore } from '../../stores/characterStore'
import { useDocumentStore } from '../../stores/documentStore'
import { computeHistory } from '../../lib/characterState'
import type { HistorySample, StatDefinition, StatValue } from '../../types'

interface Props {
  characterId: string
}

interface PlottableStat {
  def: StatDefinition
  label: string
}

function extractNumeric(
  v: StatValue | undefined,
  def: StatDefinition
): { value: number; max?: number } | null {
  if (!v) return null
  if (v.kind === 'number') return { value: v.value }
  if (v.kind === 'numberWithMax') return { value: v.value, max: v.max }
  if (v.kind === 'rank') {
    const tiers = def.rankTiers
    if (!tiers) return null
    const idx = tiers.indexOf(v.tier)
    if (idx === -1) return null
    return { value: idx }
  }
  return null
}

const CHART_HEIGHT = 220
const PADDING_LEFT = 36
const PADDING_RIGHT = 12
const PADDING_TOP = 14
const PADDING_BOTTOM = 28

export function ProgressionGraph({ characterId }: Props) {
  const character = useCharacterStore((s) =>
    s.characters.find((c) => c.id === characterId)
  )
  const markers = useCharacterStore((s) => s.markers)
  const book = useDocumentStore((s) => s.book)

  const history: HistorySample[] = useMemo(() => {
    if (!character || !book) return []
    return computeHistory(character, book, markers)
  }, [character, book, markers])

  const plottable: PlottableStat[] = useMemo(() => {
    if (!character) return []
    return character.stats
      .filter((s) => s.type === 'number' || s.type === 'numberWithMax' || s.type === 'rank')
      .map((s) => ({ def: s, label: s.name }))
  }, [character])

  const [selectedStatId, setSelectedStatId] = useState<string>(
    () => plottable[0]?.def.id ?? ''
  )

  // Sync selection if plottable set changed.
  const effectiveSelectedId = useMemo(() => {
    if (plottable.find((p) => p.def.id === selectedStatId)) return selectedStatId
    return plottable[0]?.def.id ?? ''
  }, [plottable, selectedStatId])

  if (!character) {
    return <div className="text-xs text-gray-500 py-6 text-center">Character not found.</div>
  }
  if (!book) {
    return <div className="text-xs text-gray-500 py-6 text-center">No active book.</div>
  }
  if (plottable.length === 0) {
    return (
      <div className="text-xs text-gray-500 py-6 text-center">
        No numeric stats to plot.
      </div>
    )
  }

  const selected = plottable.find((p) => p.def.id === effectiveSelectedId) ?? plottable[0]

  // Build data points
  const points = history
    .map((sample) => {
      const n = extractNumeric(sample.effective[selected.def.id], selected.def)
      if (!n) return null
      return {
        markerIndex: sample.markerIndex,
        value: n.value,
        max: n.max,
        documentId: sample.documentId,
        documentName: sample.documentName,
        offset: sample.offset,
      }
    })
    .filter((p): p is NonNullable<typeof p> => p !== null)

  if (points.length === 0) {
    return (
      <div className="space-y-3">
        <StatSelect
          stats={plottable}
          selectedId={selected.def.id}
          onChange={setSelectedStatId}
        />
        <div
          data-testid="progression-graph-empty"
          className="text-xs text-gray-500 py-6 text-center border border-dashed border-gray-800 rounded"
        >
          No history yet — add some stat changes.
        </div>
      </div>
    )
  }

  // Compute chart dimensions
  const n = points.length
  const values = points.map((p) => p.value)
  const maxValues = points
    .map((p) => p.max)
    .filter((v): v is number => typeof v === 'number')
  const allYs = [...values, ...maxValues]
  let yMin = Math.min(...allYs)
  let yMax = Math.max(...allYs)
  if (yMin === yMax) {
    yMin = yMin - 1
    yMax = yMax + 1
  }
  // Pad range slightly
  const yPad = Math.max(1, (yMax - yMin) * 0.1)
  yMin = Math.floor(yMin - yPad)
  yMax = Math.ceil(yMax + yPad)

  const viewWidth = 560 // SVG coord space; responsive via viewBox
  const innerW = viewWidth - PADDING_LEFT - PADDING_RIGHT
  const innerH = CHART_HEIGHT - PADDING_TOP - PADDING_BOTTOM

  const x = (i: number) => {
    if (n === 1) return PADDING_LEFT + innerW / 2
    return PADDING_LEFT + (innerW * i) / (n - 1)
  }
  const y = (v: number) => {
    const t = (v - yMin) / (yMax - yMin)
    return PADDING_TOP + innerH * (1 - t)
  }

  // Y gridlines (5 lines)
  const gridCount = 5
  const gridlines: { yPos: number; label: number }[] = []
  for (let i = 0; i <= gridCount; i++) {
    const val = yMin + ((yMax - yMin) * i) / gridCount
    gridlines.push({ yPos: y(val), label: Math.round(val * 100) / 100 })
  }

  // Document boundaries (vertical dashed lines) — where documentId changes
  const boundaries: { x: number; name: string }[] = []
  for (let i = 1; i < points.length; i++) {
    if (points[i].documentId !== points[i - 1].documentId) {
      boundaries.push({ x: x(i), name: points[i].documentName })
    }
  }

  // X tick labels: every few samples
  const tickStride = Math.max(1, Math.ceil(n / 8))

  // Line path for current value
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.value)}`).join(' ')
  // Max line (dashed) — only if any max values present and stat is numberWithMax
  const hasMax = selected.def.type === 'numberWithMax' && maxValues.length === points.length
  const maxPath = hasMax
    ? points
        .map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i)} ${y(p.max as number)}`)
        .join(' ')
    : ''

  return (
    <div className="space-y-3" data-testid="progression-graph">
      <StatSelect
        stats={plottable}
        selectedId={selected.def.id}
        onChange={setSelectedStatId}
      />
      <div className="relative w-full">
        <svg
          viewBox={`0 0 ${viewWidth} ${CHART_HEIGHT}`}
          preserveAspectRatio="none"
          className="w-full"
          style={{ height: CHART_HEIGHT }}
          data-testid="progression-graph-svg"
        >
          {/* Background */}
          <rect
            x={PADDING_LEFT}
            y={PADDING_TOP}
            width={innerW}
            height={innerH}
            fill="rgba(17,24,39,0.4)"
          />

          {/* Y gridlines + labels */}
          {gridlines.map((g, i) => (
            <g key={`grid-${i}`}>
              <line
                x1={PADDING_LEFT}
                x2={PADDING_LEFT + innerW}
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

          {/* Document boundaries */}
          {boundaries.map((b, i) => (
            <g key={`bnd-${i}`}>
              <line
                x1={b.x}
                x2={b.x}
                y1={PADDING_TOP}
                y2={PADDING_TOP + innerH}
                stroke="rgba(107,114,128,0.5)"
                strokeWidth={1}
                strokeDasharray="3 3"
              />
              <text
                x={b.x + 2}
                y={PADDING_TOP + 9}
                fontSize={8}
                fill="#9ca3af"
              >
                {b.name.length > 20 ? b.name.slice(0, 18) + '…' : b.name}
              </text>
            </g>
          ))}

          {/* X tick labels */}
          {points.map((_, i) =>
            i % tickStride === 0 ? (
              <text
                key={`xt-${i}`}
                x={x(i)}
                y={CHART_HEIGHT - 10}
                fontSize={9}
                textAnchor="middle"
                fill="#6b7280"
              >
                {i}
              </text>
            ) : null,
          )}

          {/* Max dashed line */}
          {hasMax && maxPath && (
            <path
              d={maxPath}
              fill="none"
              stroke={character.color}
              strokeOpacity={0.45}
              strokeWidth={1.5}
              strokeDasharray="4 3"
            />
          )}

          {/* Value line */}
          <path
            d={linePath}
            fill="none"
            stroke={character.color}
            strokeWidth={2}
          />

          {/* Dots */}
          {points.map((p, i) => (
            <g key={`dot-${i}`}>
              <circle
                cx={x(i)}
                cy={y(p.value)}
                r={3.5}
                fill={character.color}
                data-testid="progression-graph-dot"
                data-marker-index={p.markerIndex}
                data-value={p.value}
              >
                <title>{`#${i} • ${selected.def.name} ${p.value}${p.max !== undefined ? '/' + p.max : ''} • ${p.documentName} @ ${p.offset}`}</title>
              </circle>
            </g>
          ))}

          {/* Axis label */}
          <text
            x={PADDING_LEFT}
            y={CHART_HEIGHT - 2}
            fontSize={9}
            fill="#6b7280"
          >
            marker index
          </text>
        </svg>
      </div>
      <div className="flex items-center gap-3 text-[10px] text-gray-500">
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-3 h-0.5"
            style={{ backgroundColor: character.color }}
          />
          value
        </span>
        {hasMax && (
          <span className="flex items-center gap-1">
            <span
              className="inline-block w-3 h-0.5 border-t border-dashed"
              style={{ borderColor: character.color }}
            />
            max
          </span>
        )}
        <span>samples: {points.length}</span>
      </div>
    </div>
  )
}

interface StatSelectProps {
  stats: PlottableStat[]
  selectedId: string
  onChange: (id: string) => void
}

function StatSelect({ stats, selectedId, onChange }: StatSelectProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wide text-gray-500">Stat</span>
      <select
        data-testid="progression-graph-stat-select"
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
        className="flex-1 bg-gray-800 text-gray-200 text-xs border border-gray-700 rounded px-2 py-1"
      >
        {stats.map((s) => (
          <option key={s.def.id} value={s.def.id}>
            {s.label}
          </option>
        ))}
      </select>
    </div>
  )
}

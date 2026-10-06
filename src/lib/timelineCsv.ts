import type { Book, Character, StatDelta, StatDeltaOp, StatValue } from '../types'
import { computeStateAt, formatQty, getStoryletTreeOrder, type ComputedCharacterState } from './characterState'
import { extractMarkers } from './markerUtils'
import { EXPORT_VALUE_FORMAT, formatOpSummary, formatStatValue, statNameLookup } from './statFormat'
import { excerptBefore } from './relink'

/** One stat change in the book, flattened for a spreadsheet. */
export interface TimelineRow {
  chapter: string
  /** Character offset of the marker within its chapter. */
  position: number
  /** Prose just before the marker. */
  excerpt: string
  character: string
  /** Stat, slot or buff the change touches. */
  stat: string
  change: string
  /** The touched value right after the marker. */
  valueAfter: string
}

function valueText(v: StatValue | undefined): string {
  if (!v) return ''
  if (v.kind === 'inventory') {
    return v.items.length === 0 ? EXPORT_VALUE_FORMAT.emptyList : v.items.map((it) => formatQty(it.name, it.fields.qty ?? 1)).join(', ')
  }
  return formatStatValue(v, EXPORT_VALUE_FORMAT)
}

function describe(op: StatDeltaOp, character: Character | undefined, after: ComputedCharacterState | undefined) {
  const statName = statNameLookup(character)
  switch (op.kind) {
    case 'equip':
    case 'unequip': {
      const item = after?.state.equipped[op.slot]
      return { stat: op.slot, value: after ? (item ? item.itemName ?? item.itemId : '—') : '' }
    }
    case 'buffApply':
    case 'buffRemove': {
      const buff = after?.state.activeBuffs.find((b) => b.buffId === op.buffId)
      const name = op.kind === 'buffApply' ? op.buffName ?? op.buffId : buff?.buffName ?? op.buffId
      return { stat: name, value: after ? (buff ? 'active' : 'ended') : '' }
    }
    default:
      return { stat: statName(op.statId), value: valueText(after?.effective[op.statId]) }
  }
}

/** Every stat change in book order, one row per delta. */
export function buildStatTimeline(
  book: Book,
  characters: Character[],
  markers: Record<string, StatDelta[]>,
): TimelineRow[] {
  const rows: TimelineRow[] = []
  const byId = new Map(characters.map((c) => [c.id, c]))
  for (const storylet of getStoryletTreeOrder(book)) {
    const content = storylet.content ?? ''
    for (const marker of extractMarkers(content)) {
      if (marker.kind !== 'delta') continue
      const deltas = markers[marker.id]
      if (!deltas || deltas.length === 0) continue
      const excerpt = excerptBefore(content, marker.offset)
      for (const d of deltas) {
        const character = byId.get(d.characterId)
        const after = character
          ? computeStateAt(character, book, markers, { storyletId: storylet.id, offset: marker.offset + 1 })
          : undefined
        const { stat, value } = describe(d.op, character, after)
        rows.push({
          chapter: storylet.name,
          position: marker.offset,
          excerpt,
          character: character?.name ?? 'Unknown',
          stat,
          change: formatOpSummary(d.op, statNameLookup(character)),
          valueAfter: value,
        })
      }
    }
  }
  return rows
}

function cell(value: string | number): string {
  let s = String(value)
  // A leading = or @ makes spreadsheets run the cell as a formula.
  if (/^[=@\t\r]/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const HEADER = ['Chapter', 'Position', 'Excerpt', 'Character', 'Stat', 'Change', 'Value after']

/** RFC 4180 CSV (CRLF line ends) with a header row. */
export function timelineToCsv(rows: TimelineRow[]): string {
  const lines = [HEADER.join(',')]
  for (const r of rows) {
    lines.push([r.chapter, r.position, r.excerpt, r.character, r.stat, r.change, r.valueAfter].map(cell).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

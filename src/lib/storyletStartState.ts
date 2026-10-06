import type { Book, Character, StatDelta } from '../types'
import { computeStateAt } from './characterState'
import { PANEL_VALUE_FORMAT, formatStatValue } from './statFormat'

export interface StartStateRow { label: string; value: string }
export interface CharacterStartState { characterId: string; name: string; color: string; rows: StartStateRow[] }

const MAX_SCALARS = 5

/**
 * Each character's key stats as a storylet opens (before its own markers):
 * up to five numbers / ranks in sheet order, then an inventory item count.
 */
export function storyletStartState(
  book: Book,
  storyletId: string,
  characters: Character[],
  markers: Record<string, StatDelta[]>,
): CharacterStartState[] {
  if (!book.storylets.some((s) => s.id === storyletId)) return []
  return characters.map((c) => {
    const { effective } = computeStateAt(c, book, markers, { storyletId, offset: 0 })
    const rows: StartStateRow[] = []
    let scalars = 0
    for (const def of c.stats) {
      const v = effective[def.id]
      if (!v) continue
      if ((v.kind === 'number' || v.kind === 'numberWithMax' || v.kind === 'rank') && scalars < MAX_SCALARS) {
        rows.push({ label: def.name, value: formatStatValue(v, PANEL_VALUE_FORMAT) })
        scalars++
      }
    }
    for (const def of c.stats) {
      const v = effective[def.id]
      if (v?.kind === 'inventory') rows.push({ label: def.name, value: formatStatValue(v, PANEL_VALUE_FORMAT) })
    }
    return { characterId: c.id, name: c.name, color: c.color, rows }
  })
}

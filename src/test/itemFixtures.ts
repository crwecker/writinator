import type { CatalogItem, Character, QuickMacro } from '../types'

/** A catalog item with a stable id derived from its name. */
export function catalogItem(name: string, extra: Partial<Omit<CatalogItem, 'id' | 'name'>> = {}): CatalogItem {
  return { id: `item-${name.toLowerCase().replace(/\s+/g, '-')}`, name, ...extra }
}

export function macro(name: string, body: string, characterId?: string): QuickMacro {
  return { id: `macro-${name.toLowerCase().replace(/\s+/g, '-')}`, name, body, ...(characterId ? { characterId } : {}) }
}

/** `c` with an extra stat + base value (e.g. a Capacity number). */
export function withNumberStat(c: Character, id: string, name: string, value: number, extra: { currency?: boolean } = {}): Character {
  return {
    ...c,
    stats: [...c.stats, { id, name, type: 'number', ...extra }],
    baseValues: { ...c.baseValues, [id]: { kind: 'number', value } },
  }
}

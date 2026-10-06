import type { Character, CharacterState, StatListItem } from '../types'
import { createDefaultCharacter } from '../stores/characterStore'

/**
 * A default-template character (HP, MP, Level, XP, Gold, Class, Status Effects,
 * Inventory, Spells, Skills, Attributes; Weapon/Armor/Accessory slots) with a
 * fixed id and the given colour, HP and inventory.
 */
export function makeHero(
  id: string,
  opts: { color?: string; hp?: [number, number]; inventory?: StatListItem[]; spells?: StatListItem[] } = {},
): Character {
  const base = createDefaultCharacter(id[0].toUpperCase() + id.slice(1), opts.color ?? '#f87171')
  const [value, max] = opts.hp ?? [40, 40]
  return {
    ...base,
    id,
    baseValues: {
      ...base.baseValues,
      hp: { kind: 'numberWithMax', value, max },
      gold: { kind: 'number', value: 20 },
      inventory: { kind: 'inventory', items: opts.inventory ?? [] },
      spells: { kind: 'spellList', items: opts.spells ?? [] },
      rank: { kind: 'rank', tier: 'D' },
    },
    stats: [
      ...base.stats,
      { id: 'rank', name: 'Rank', type: 'rank', rankTiers: ['F', 'E', 'D', 'C', 'B', 'A', 'S'] },
    ],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }
}

export function withRank(c: Character, tier: string): Character {
  return { ...c, baseValues: { ...c.baseValues, rank: { kind: 'rank', tier } } }
}

export function item(name: string, qty = 1): StatListItem {
  return { name, fields: { qty } }
}

/** Initial (no markers applied) state of a character. */
export function initialState(c: Character): CharacterState {
  return { base: structuredClone(c.baseValues), equipped: {}, activeBuffs: [] }
}

/** stateFor lookup over the characters' initial states, with optional overrides. */
export function stateLookup(
  characters: Character[],
  overrides: Record<string, CharacterState> = {},
): (characterId: string) => CharacterState | undefined {
  return (id) => {
    if (overrides[id]) return overrides[id]
    const c = characters.find((ch) => ch.id === id)
    return c ? initialState(c) : undefined
  }
}

import type { Character } from '../types'

/** Names that mean "the party stash" when no character has that name. */
export const PARTY_NAME_RE = /^(?:the\s+)?(?:party|group)(?:\s+stash)?$|^stash$/i

/**
 * A shared party stash: a character-like holder with coins and an inventory,
 * so every stat feature (quick entry, gives, statblocks, the panel) works on
 * it unchanged. Its Gold is flagged as currency.
 */
export function createPartyCharacter(name = 'Party', color = '#a3a3a3'): Character {
  const timestamp = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    name,
    color,
    kind: 'party',
    stats: [
      { id: 'gold', name: 'Gold', type: 'number', currency: true },
      { id: 'inventory', name: 'Inventory', type: 'inventory' },
    ],
    baseValues: {
      gold: { kind: 'number', value: 0 },
      inventory: { kind: 'inventory', items: [] },
    },
    equipmentSlots: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  }
}

export function partyOf(characters: Character[]): Character | undefined {
  return characters.find((c) => c.kind === 'party')
}

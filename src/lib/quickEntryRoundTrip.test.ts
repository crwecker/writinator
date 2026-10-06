import { describe, expect, it } from 'vitest'
import { opToQuickEntry, parseQuickEntry, statForSuggestion } from './quickEntry'
import { initialState, item, makeHero, stateLookup } from '../test/characterFixtures'
import type { CharacterState, StatDeltaOp } from '../types'

const kael = makeHero('kael', {
  inventory: [item('Arrows', 5), item('Rope')],
  spells: [{ name: 'Fireball', fields: { level: 1, mana: 3 } }],
})
const hasted: CharacterState = {
  ...initialState(kael),
  activeBuffs: [{ buffId: 'haste-1', buffName: 'Haste', modifiers: [] }],
}

describe('opToQuickEntry', () => {
  const roundTrips: StatDeltaOp[] = [
    { kind: 'adjust', statId: 'hp', delta: -15 },
    { kind: 'adjust', statId: 'attributes', delta: 2, attributeKey: 'STR' },
    { kind: 'set', statId: 'hp', value: { kind: 'numberWithMax', value: 30, max: 50 } },
    { kind: 'set', statId: 'gold', value: { kind: 'number', value: 7 } },
    { kind: 'set', statId: 'class', value: { kind: 'text', value: 'Ranger' } },
    { kind: 'maxAdjust', statId: 'hp', delta: -3 },
    { kind: 'fill', statId: 'mp' },
    { kind: 'itemAdd', statId: 'inventory', name: 'Wolf Pelt', fields: { qty: 1 } },
    { kind: 'itemAdd', statId: 'inventory', name: 'Bolts', fields: { qty: 4 } },
    { kind: 'itemRemove', statId: 'inventory', name: 'Arrows' },
    { kind: 'itemRemove', statId: 'inventory', name: 'Rope' },
    { kind: 'itemFieldAdjust', statId: 'inventory', name: 'Arrows', field: 'qty', delta: 2 },
    { kind: 'itemAdd', statId: 'spells', name: 'Ice Lance', fields: { level: 1, mana: 0 } },
    { kind: 'itemRemove', statId: 'spells', name: 'Fireball' },
    { kind: 'listAdd', statId: 'status_effects', items: ['Poisoned'] },
    { kind: 'listAdd', statId: 'status_effects', items: ['Bruise x2'] },
    { kind: 'equip', slot: 'Armor', itemId: 'Old Cloak', itemName: 'Old Cloak', modifiers: [] },
    { kind: 'unequip', slot: 'Weapon' },
    { kind: 'buffApply', buffId: 'Shield', buffName: 'Shield', modifiers: [], expiresAfter: 3 },
    { kind: 'buffRemove', buffId: 'haste-1' },
    { kind: 'rankChange', statId: 'rank', direction: 'up' },
    { kind: 'rankChange', statId: 'rank', direction: 'set', value: 'B' },
  ]
  it.each(roundTrips)('round-trips %o', (op) => {
    const text = opToQuickEntry(op, kael, hasted)
    expect(text).not.toBeNull()
    const r = parseQuickEntry(text!, { characters: [kael], stateFor: stateLookup([kael], { kael: hasted }) })
    expect(r.clauses[0].error).toBeUndefined()
    expect(r.ops).toEqual([{ characterId: 'kael', op }])
  })

  it('declines ops the grammar cannot express', () => {
    expect(
      opToQuickEntry({ kind: 'equip', slot: 'Weapon', itemId: 'x', modifiers: [{ statId: 'hp', kind: 'flat', amount: 1 }] }, kael, hasted),
    ).toBeNull()
    expect(opToQuickEntry({ kind: 'buffApply', buffId: 'b-7', buffName: 'Haste', modifiers: [] }, kael, hasted)).toBeNull()
    // Re-parsing would reuse the active Haste's id.
    expect(opToQuickEntry({ kind: 'buffApply', buffId: 'Haste', buffName: 'Haste', modifiers: [] }, kael, hasted)).toBeNull()
    expect(
      opToQuickEntry({ kind: 'set', statId: 'attributes', value: { kind: 'attributeSet', values: { STR: 1 } } }, kael, hasted),
    ).toBeNull()
  })

  it('writes the text with the character name first', () => {
    expect(opToQuickEntry({ kind: 'adjust', statId: 'hp', delta: -15 }, kael, hasted)).toBe('Kael -15 HP')
  })
})

describe('statForSuggestion', () => {
  it('creates a number stat with a unique id', () => {
    expect(statForSuggestion('Sanity', 'number', ['sanity'])).toEqual({
      def: { id: 'sanity_2', name: 'Sanity', type: 'number' },
      value: { kind: 'number', value: 0 },
    })
  })

  it('creates an empty inventory and a ranked stat with default tiers', () => {
    expect(statForSuggestion('Inventory', 'inventory', [])).toEqual({
      def: { id: 'inventory', name: 'Inventory', type: 'inventory' },
      value: { kind: 'inventory', items: [] },
    })
    expect(statForSuggestion('Guild Rank', 'rank', []).def).toEqual({
      id: 'guild_rank',
      name: 'Guild Rank',
      type: 'rank',
      rankTiers: ['F', 'E', 'D', 'C', 'B', 'A', 'S'],
    })
  })
})

import { describe, expect, it } from 'vitest'
import { parseQuickEntry, quickEntryCompletions, type QuickEntryContext } from './quickEntry'
import { item, makeHero, stateLookup } from '../test/characterFixtures'
import type { CharacterState } from '../types'

const kael = makeHero('kael', {
  hp: [40, 40],
  inventory: [item('Healing Potion', 2), item('Arrows', 5), item('Iron Sword')],
  spells: [{ name: 'Fireball', fields: { level: 1, mana: 3 } }],
})
const mira = makeHero('mira', { color: '#60a5fa', hp: [20, 30], inventory: [item('Rope')] })
const characters = [kael, mira]

function ctx(extra: Partial<QuickEntryContext> = {}): QuickEntryContext {
  return { characters, stateFor: stateLookup(characters), defaultCharacterId: null, ...extra }
}

function ops(input: string, extra: Partial<QuickEntryContext> = {}) {
  const r = parseQuickEntry(input, ctx(extra))
  const errors = r.clauses.map((c) => c.error).filter(Boolean)
  expect(errors).toEqual([])
  return r.ops
}

function previewTexts(input: string, extra: Partial<QuickEntryContext> = {}) {
  return parseQuickEntry(input, ctx(extra)).clauses.flatMap((c) =>
    c.preview.map((p) => `${p.characterName} · ${p.text}${p.warning ? ` [${p.warning}]` : ''}`),
  )
}

describe('quick entry — numeric stats', () => {
  it('parses "Kael -15 HP" as an HP adjust', () => {
    expect(ops('Kael -15 HP')).toEqual([{ characterId: 'kael', op: { kind: 'adjust', statId: 'hp', delta: -15 } }])
  })

  it('is case-insensitive and accepts the unicode minus', () => {
    expect(ops('kael −15 hp')).toEqual([{ characterId: 'kael', op: { kind: 'adjust', statId: 'hp', delta: -15 } }])
  })

  it('parses "Kael +1 Level"', () => {
    expect(ops('Kael +1 Level')).toEqual([{ characterId: 'kael', op: { kind: 'adjust', statId: 'level', delta: 1 } }])
  })

  it('uses the default character when the clause names none ("HP +5")', () => {
    expect(ops('HP +5', { defaultCharacterId: 'mira' })).toEqual([
      { characterId: 'mira', op: { kind: 'adjust', statId: 'hp', delta: 5 } },
    ])
  })

  it('carries the character over between comma-separated clauses', () => {
    expect(ops('Kael -15 HP, +1 Level, Mira +5 HP, -2 MP')).toEqual([
      { characterId: 'kael', op: { kind: 'adjust', statId: 'hp', delta: -15 } },
      { characterId: 'kael', op: { kind: 'adjust', statId: 'level', delta: 1 } },
      { characterId: 'mira', op: { kind: 'adjust', statId: 'hp', delta: 5 } },
      { characterId: 'mira', op: { kind: 'adjust', statId: 'mp', delta: -2 } },
    ])
  })

  it('reports the last character used', () => {
    expect(parseQuickEntry('Kael -1 HP, Mira +1 HP', ctx()).lastCharacterId).toBe('mira')
  })

  it('sets a numberWithMax value keeping the current max ("Kael HP = 30")', () => {
    expect(ops('Kael HP = 30')).toEqual([
      { characterId: 'kael', op: { kind: 'set', statId: 'hp', value: { kind: 'numberWithMax', value: 30, max: 40 } } },
    ])
  })

  it('sets value and max with "HP = 30/50"', () => {
    expect(ops('Kael HP = 30/50')[0].op).toEqual({
      kind: 'set',
      statId: 'hp',
      value: { kind: 'numberWithMax', value: 30, max: 50 },
    })
  })

  it('sets a plain number and a text stat', () => {
    expect(ops('Kael Gold = 100, Class = Ranger').map((o) => o.op)).toEqual([
      { kind: 'set', statId: 'gold', value: { kind: 'number', value: 100 } },
      { kind: 'set', statId: 'class', value: { kind: 'text', value: 'Ranger' } },
    ])
  })

  it('adjusts the max ("Kael max HP +10")', () => {
    expect(ops('Kael max HP +10')[0].op).toEqual({ kind: 'maxAdjust', statId: 'hp', delta: 10 })
    expect(ops('Kael +10 max HP')[0].op).toEqual({ kind: 'maxAdjust', statId: 'hp', delta: 10 })
  })

  it('fills a stat ("Kael fill HP")', () => {
    expect(ops('Kael fill HP')[0].op).toEqual({ kind: 'fill', statId: 'hp' })
    expect(ops('Kael refill MP')[0].op).toEqual({ kind: 'fill', statId: 'mp' })
  })

  it('adjusts an attribute by key ("Kael +2 STR", "DEX -1")', () => {
    expect(ops('Kael +2 STR, DEX -1').map((o) => o.op)).toEqual([
      { kind: 'adjust', statId: 'attributes', delta: 2, attributeKey: 'STR' },
      { kind: 'adjust', statId: 'attributes', delta: -1, attributeKey: 'DEX' },
    ])
  })

  it('sets one attribute keeping the others', () => {
    const op = ops('Kael STR = 14')[0].op
    expect(op.kind).toBe('set')
    if (op.kind !== 'set' || op.value.kind !== 'attributeSet') throw new Error('expected attributeSet set')
    expect(op.value.values.STR).toBe(14)
    expect(op.value.values.DEX).toBe(10)
  })
})

describe('quick entry — items', () => {
  it('adds a new item with qty 1 ("+Wolf Pelt")', () => {
    expect(ops('Kael +Wolf Pelt')).toEqual([
      { characterId: 'kael', op: { kind: 'itemAdd', statId: 'inventory', name: 'Wolf Pelt', fields: { qty: 1 } } },
    ])
  })

  it('adds a new counted item ("+3 Bolts")', () => {
    expect(ops('Kael +3 Bolts')[0].op).toEqual({ kind: 'itemAdd', statId: 'inventory', name: 'Bolts', fields: { qty: 3 } })
  })

  it('raises the quantity of an owned item instead of a no-op itemAdd ("+3 Arrows")', () => {
    expect(ops('Kael +3 arrows')[0].op).toEqual({
      kind: 'itemFieldAdjust',
      statId: 'inventory',
      name: 'Arrows',
      field: 'qty',
      delta: 3,
    })
  })

  it('lowers the quantity when some remain ("Kael -2 Arrows")', () => {
    expect(ops('Kael -2 Arrows')[0].op).toEqual({
      kind: 'itemFieldAdjust',
      statId: 'inventory',
      name: 'Arrows',
      field: 'qty',
      delta: -2,
    })
  })

  it('removes the item when none would remain ("-Iron Sword", "-5 Arrows")', () => {
    expect(ops('Kael -Iron Sword, -5 Arrows').map((o) => o.op)).toEqual([
      { kind: 'itemRemove', statId: 'inventory', name: 'Iron Sword' },
      { kind: 'itemRemove', statId: 'inventory', name: 'Arrows' },
    ])
  })

  it('drops one of a stack ("-Healing Potion" with 2 owned)', () => {
    expect(ops('Kael -Healing Potion')[0].op).toEqual({
      kind: 'itemFieldAdjust',
      statId: 'inventory',
      name: 'Healing Potion',
      field: 'qty',
      delta: -1,
    })
  })

  it('applies clauses in order, so a second removal sees the first', () => {
    expect(ops('Kael -Healing Potion, -Healing Potion').map((o) => o.op.kind)).toEqual(['itemFieldAdjust', 'itemRemove'])
  })

  it('warns when removing an item that is not owned', () => {
    const r = parseQuickEntry('Kael -Elixir', ctx())
    expect(r.ok).toBe(true)
    expect(r.ops[0].op).toEqual({ kind: 'itemRemove', statId: 'inventory', name: 'Elixir' })
    expect(r.clauses[0].preview[0].warning).toMatch(/doesn.t have Elixir/)
  })

  it('warns when removing more than owned', () => {
    const r = parseQuickEntry('Kael -9 Arrows', ctx())
    expect(r.clauses[0].preview[0].warning).toMatch(/only has 5/)
  })

  it('targets the list stat that already holds the item', () => {
    const sick = { ...kael, baseValues: { ...kael.baseValues, status_effects: { kind: 'list' as const, items: ['Poisoned'] } } }
    const c = { characters: [sick], stateFor: stateLookup([sick]), defaultCharacterId: 'kael' }
    expect(parseQuickEntry('-Poisoned', c).ops[0].op).toEqual({ kind: 'listRemove', statId: 'status_effects', items: ['Poisoned'] })
  })

  it('marks newly gained items in the preview', () => {
    const r = parseQuickEntry('Kael +Wolf Pelt', ctx())
    expect(r.clauses[0].preview[0]).toMatchObject({ text: '+Wolf Pelt ×1', isNew: true })
  })
})

describe('quick entry — spells, rank, equipment, buffs', () => {
  it('learns and forgets spells', () => {
    expect(ops('Kael learns Ice Lance, forgets Fireball').map((o) => o.op)).toEqual([
      { kind: 'itemAdd', statId: 'spells', name: 'Ice Lance', fields: { level: 1, mana: 0 } },
      { kind: 'itemRemove', statId: 'spells', name: 'Fireball' },
    ])
  })

  it('learns a skill when asked ("learns skill Tracking")', () => {
    expect(ops('Kael learns skill Tracking')[0].op).toEqual({
      kind: 'itemAdd',
      statId: 'skills',
      name: 'Tracking',
      fields: { level: 1 },
    })
  })

  it('ranks up, down and to a tier', () => {
    expect(ops('Kael rank up, rank down, rank = c').map((o) => o.op)).toEqual([
      { kind: 'rankChange', statId: 'rank', direction: 'up' },
      { kind: 'rankChange', statId: 'rank', direction: 'down' },
      { kind: 'rankChange', statId: 'rank', direction: 'set', value: 'C' },
    ])
  })

  it('rejects an unknown tier and lists the valid ones', () => {
    const r = parseQuickEntry('Kael rank = Z', ctx())
    expect(r.ok).toBe(false)
    expect(r.clauses[0].error).toBe('“Z” isn’t a Rank tier (F, E, D, C, B, A, S)')
  })

  it('equips into a guessed slot with a readable item id', () => {
    expect(ops('Kael equips Iron Sword')[0].op).toEqual({
      kind: 'equip',
      slot: 'Weapon',
      itemId: 'Iron Sword',
      itemName: 'Iron Sword',
      modifiers: [],
    })
    expect(ops('Kael equips Silver Ring')[0].op).toMatchObject({ slot: 'Accessory' })
    expect(ops('Kael equips Old Cloak as Armor')[0].op).toMatchObject({ slot: 'Armor', itemName: 'Old Cloak' })
  })

  it('unequips by slot or by equipped item name', () => {
    const equipped: CharacterState = {
      base: structuredClone(kael.baseValues),
      equipped: { Weapon: { itemId: 'Iron Sword', itemName: 'Iron Sword', modifiers: [] } },
      activeBuffs: [],
    }
    const c = ctx({ stateFor: stateLookup(characters, { kael: equipped }) })
    expect(parseQuickEntry('Kael unequips Weapon', c).ops[0].op).toEqual({ kind: 'unequip', slot: 'Weapon' })
    expect(parseQuickEntry('Kael unequips iron sword', c).ops[0].op).toEqual({ kind: 'unequip', slot: 'Weapon' })
  })

  it('errors when the character has no equipment slots', () => {
    const bare = { ...kael, equipmentSlots: [] }
    const r = parseQuickEntry('Kael equips Iron Sword', { characters: [bare], stateFor: stateLookup([bare]) })
    expect(r.clauses[0].error).toBe('Kael has no equipment slots')
  })

  it('applies a timed buff and removes it by name', () => {
    expect(ops('Kael buff Haste 3')[0].op).toEqual({
      kind: 'buffApply',
      buffId: 'Haste',
      buffName: 'Haste',
      modifiers: [],
      expiresAfter: 3,
    })
    expect(ops('Kael buff Stone Skin')[0].op).toEqual({
      kind: 'buffApply',
      buffId: 'Stone Skin',
      buffName: 'Stone Skin',
      modifiers: [],
    })
    const hasted: CharacterState = {
      base: structuredClone(kael.baseValues),
      equipped: {},
      activeBuffs: [{ buffId: 'haste-1', buffName: 'Haste', modifiers: [] }],
    }
    const c = ctx({ stateFor: stateLookup(characters, { kael: hasted }) })
    expect(parseQuickEntry('Kael lose buff haste', c).ops[0].op).toEqual({ kind: 'buffRemove', buffId: 'haste-1' })
  })
})

describe('quick entry — transfers', () => {
  it('moves an item between characters in one entry', () => {
    expect(ops('Kael gives Mira Iron Sword')).toEqual([
      { characterId: 'kael', op: { kind: 'itemRemove', statId: 'inventory', name: 'Iron Sword' } },
      { characterId: 'mira', op: { kind: 'itemAdd', statId: 'inventory', name: 'Iron Sword', fields: { qty: 1 } } },
    ])
  })

  it('moves a number stat ("Kael gives Mira 5 Gold")', () => {
    expect(ops('Kael gives Mira 5 Gold')).toEqual([
      { characterId: 'kael', op: { kind: 'adjust', statId: 'gold', delta: -5 } },
      { characterId: 'mira', op: { kind: 'adjust', statId: 'gold', delta: 5 } },
    ])
  })

  it('moves part of a stack', () => {
    expect(ops('Kael gives Mira 2 Arrows')).toEqual([
      { characterId: 'kael', op: { kind: 'itemFieldAdjust', statId: 'inventory', name: 'Arrows', field: 'qty', delta: -2 } },
      { characterId: 'mira', op: { kind: 'itemAdd', statId: 'inventory', name: 'Arrows', fields: { qty: 2 } } },
    ])
  })

  it('keeps the giver as the current character afterwards', () => {
    expect(ops('Kael gives Mira 1 Gold, -1 HP')[2]).toEqual({
      characterId: 'kael',
      op: { kind: 'adjust', statId: 'hp', delta: -1 },
    })
  })
})

describe('quick entry — errors and create-on-mention', () => {
  it('offers to create an unknown character', () => {
    const r = parseQuickEntry('Bob -15 HP', ctx())
    expect(r.ok).toBe(false)
    expect(r.clauses[0].error).toBe('Unknown character “Bob”')
    expect(r.clauses[0].create).toEqual({ kind: 'character', name: 'Bob' })
  })

  it('treats an unknown leading name as a character even with a default character', () => {
    const r = parseQuickEntry('Old Tom +Rope', ctx({ defaultCharacterId: 'kael' }))
    expect(r.clauses[0].create).toEqual({ kind: 'character', name: 'Old Tom' })
  })

  it('offers to create an unknown numeric stat as a number', () => {
    const r = parseQuickEntry('Kael Sanity -5', ctx())
    expect(r.clauses[0].error).toBe('Kael has no stat “Sanity”')
    expect(r.clauses[0].create).toEqual({ kind: 'stat', characterId: 'kael', name: 'Sanity', type: 'number' })
  })

  it('offers an inventory stat when the character has nowhere to put items', () => {
    const bare = { ...mira, stats: mira.stats.filter((s) => s.type !== 'inventory' && s.type !== 'list') }
    const r = parseQuickEntry('Mira +Rope', { characters: [bare], stateFor: stateLookup([bare]) })
    expect(r.clauses[0].create).toEqual({ kind: 'stat', characterId: 'mira', name: 'Inventory', type: 'inventory' })
  })

  it('asks for a character when none is known', () => {
    const r = parseQuickEntry('-15 HP', ctx())
    expect(r.clauses[0].error).toBe('Start with a character name, e.g. “Kael -15 HP”')
  })

  it('offers to create the receiver of a transfer', () => {
    const r = parseQuickEntry('Kael gives Bob Iron Sword', ctx())
    expect(r.clauses[0].error).toBe('Unknown character “Bob”')
    expect(r.clauses[0].create).toEqual({ kind: 'character', name: 'Bob' })
  })

  it('reports unreadable clauses', () => {
    const r = parseQuickEntry('Kael flies away', ctx())
    expect(r.clauses[0].error).toBe('Can’t read “flies away”')
  })

  it('ignores empty clauses and blank input', () => {
    expect(parseQuickEntry('  ', ctx()).ok).toBe(false)
    expect(parseQuickEntry('Kael -1 HP, ', ctx()).ok).toBe(true)
  })

  it('records clause source ranges', () => {
    const r = parseQuickEntry('Kael -1 HP, +1 Level', ctx())
    expect(r.clauses.map((c) => [c.from, c.to])).toEqual([[0, 10], [12, 20]])
  })
})

describe('quick entry — preview', () => {
  it('shows before → after per clause', () => {
    expect(previewTexts('Kael -15 HP, +1 Level, max HP +10')).toEqual([
      'Kael · HP 40 → 25',
      'Kael · Level 1 → 2',
      'Kael · HP max 40 → 50',
    ])
  })

  it('warns when HP drops below 0 or exceeds max', () => {
    expect(previewTexts('Kael -50 HP')).toEqual(['Kael · HP 40 → -10 [HP below 0]'])
    expect(previewTexts('Mira +20 HP')).toEqual(['Mira · HP 20 → 40 [HP above max (30)]'])
  })

  it('previews items, equipment and rank', () => {
    expect(previewTexts('Kael +3 Arrows, -Iron Sword, equips Axe, rank up')).toEqual([
      'Kael · Arrows ×5 → ×8',
      'Kael · −Iron Sword',
      'Kael · Weapon: — → Axe',
      'Kael · Rank D → C',
    ])
  })
})

describe('quick entry — completions', () => {
  it('completes character names', () => {
    expect(quickEntryCompletions('Ka', 2, ctx())).toEqual({ from: 0, to: 2, options: ['Kael'] })
  })

  it('completes stat names after a number', () => {
    const c = quickEntryCompletions('Kael -15 h', 10, ctx())
    expect(c?.from).toBe(9)
    expect(c?.options[0]).toBe('HP')
  })

  it('completes owned item names across words', () => {
    const c = quickEntryCompletions('Kael -Healing P', 15, ctx())
    expect(c).toEqual({ from: 6, to: 15, options: ['Healing Potion'] })
  })

  it('completes within the current clause only', () => {
    const c = quickEntryCompletions('Kael -1 HP, Mi', 14, ctx())
    expect(c).toEqual({ from: 12, to: 14, options: ['Mira'] })
  })

  it('returns null with nothing to complete', () => {
    expect(quickEntryCompletions('Kael ', 5, ctx())).toBeNull()
  })
})

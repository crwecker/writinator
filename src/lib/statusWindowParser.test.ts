import { describe, it, expect } from 'vitest'
import { mergeStatusIntoCharacter, parseStatusWindow } from './statusWindowParser'
import { makeHero } from '../test/characterFixtures'
import type { StatValue } from '../types'

function values(text: string): Record<string, StatValue> {
  return Object.fromEntries(parseStatusWindow(text).entries.map((e) => [e.label, e.value]))
}

describe('parseStatusWindow', () => {
  it('reads the one-line example', () => {
    const parsed = parseStatusWindow('HP: 40/50, MP 10/20, STR 12 DEX 9, Level 3, Inventory: Healing Potion x2, Rope')
    expect(parsed.entries.map((e) => [e.label, e.def.type])).toEqual([
      ['HP', 'numberWithMax'],
      ['MP', 'numberWithMax'],
      ['Attributes', 'attributeSet'],
      ['Level', 'number'],
      ['Inventory', 'inventory'],
    ])
    const v = values('HP: 40/50, MP 10/20, STR 12 DEX 9, Level 3, Inventory: Healing Potion x2, Rope')
    expect(v.HP).toEqual({ kind: 'numberWithMax', value: 40, max: 50 })
    expect(v.Attributes).toEqual({ kind: 'attributeSet', values: { STR: 12, DEX: 9 } })
    expect(v.Level).toEqual({ kind: 'number', value: 3 })
    expect(v.Inventory).toEqual({
      kind: 'inventory',
      items: [{ name: 'Healing Potion', fields: { qty: 2 } }, { name: 'Rope', fields: { qty: 1 } }],
    })
    expect(parsed.entries.find((e) => e.label === 'Attributes')?.def.attributeKeys).toEqual(['STR', 'DEX'])
  })

  it('reads a bracketed multi-line LitRPG window', () => {
    const text = `
╔════════════════════╗
║ [STATUS]           ║
║ Name: Kael         ║
║ Class: Ranger      ║
║ Lv. 7  (EXP 340)   ║
║ Health: 85 / 100   ║
║ Mana: 12/40        ║
║ STR: 14 | AGI: 18  ║
║ Rank: C            ║
║ Gold: 1,250        ║
╚════════════════════╝
Skills: Archery (Lv 3), Tracking
Status effects: Poisoned, Tired
`
    const parsed = parseStatusWindow(text)
    expect(parsed.name).toBe('Kael')
    const v = values(text)
    expect(v.Class).toEqual({ kind: 'text', value: 'Ranger' })
    expect(v.Level).toEqual({ kind: 'number', value: 7 })
    expect(v.XP).toEqual({ kind: 'number', value: 340 })
    expect(v.HP).toEqual({ kind: 'numberWithMax', value: 85, max: 100 })
    expect(v.MP).toEqual({ kind: 'numberWithMax', value: 12, max: 40 })
    expect(v.Attributes).toEqual({ kind: 'attributeSet', values: { STR: 14, AGI: 18 } })
    expect(v.Rank).toEqual({ kind: 'rank', tier: 'C' })
    expect(v.Gold).toEqual({ kind: 'number', value: 1250 })
    expect(v.Skills).toEqual({
      kind: 'skillList',
      items: [{ name: 'Archery', fields: { level: 3 } }, { name: 'Tracking', fields: { level: 1 } }],
    })
    expect(v['Status Effects']).toEqual({ kind: 'list', items: ['Poisoned', 'Tired'] })
  })

  it('collects bulleted list items under a label', () => {
    const v = values('Inventory:\n- 3 Arrows\n• Iron Sword\n* Torch x2\nLevel 2')
    expect(v.Inventory).toEqual({
      kind: 'inventory',
      items: [
        { name: 'Arrows', fields: { qty: 3 } },
        { name: 'Iron Sword', fields: { qty: 1 } },
        { name: 'Torch', fields: { qty: 2 } },
      ],
    })
    expect(v.Level).toEqual({ kind: 'number', value: 2 })
  })

  it('reads spells with costs', () => {
    const v = values('Spells: Fireball (Lv 2, 10 MP), Heal (5 mana)')
    expect(v.Spells).toEqual({
      kind: 'spellList',
      items: [
        { name: 'Fireball', fields: { level: 2, mana: 10 } },
        { name: 'Heal', fields: { level: 1, mana: 5 } },
      ],
    })
  })

  it('ends a list at the next known label on the same line', () => {
    const v = values('Inventory: Rope, Torch; Level: 4')
    expect(v.Inventory).toEqual({
      kind: 'inventory',
      items: [{ name: 'Rope', fields: { qty: 1 } }, { name: 'Torch', fields: { qty: 1 } }],
    })
    expect(v.Level).toEqual({ kind: 'number', value: 4 })
  })

  it('handles compact and decorated numbers', () => {
    const v = values('Lv3 | Hit Points: 40 / 50 (80%) | Strength 11 | Karma -2')
    expect(v.Level).toEqual({ kind: 'number', value: 3 })
    expect(v.HP).toEqual({ kind: 'numberWithMax', value: 40, max: 50 })
    expect(v.Attributes).toEqual({ kind: 'attributeSet', values: { STR: 11 } })
    expect(v.Karma).toEqual({ kind: 'number', value: -2 })
  })

  it('keeps the last value when a stat repeats and merges repeated lists', () => {
    const v = values('HP 10/10\nHP 7/10\nInventory: Rope\nInventory: Torch')
    expect(v.HP).toEqual({ kind: 'numberWithMax', value: 7, max: 10 })
    expect(v.Inventory).toEqual({
      kind: 'inventory',
      items: [{ name: 'Rope', fields: { qty: 1 } }, { name: 'Torch', fields: { qty: 1 } }],
    })
  })

  it('ignores lines with nothing it understands', () => {
    expect(parseStatusWindow('Ding! You feel stronger.').entries).toEqual([])
  })
})

describe('mergeStatusIntoCharacter', () => {
  it('updates matching stats by name or alias and adds the rest', () => {
    const kael = makeHero('kael')
    const parsed = parseStatusWindow('Health 25/60, Level 4, STR 15, Luck 3, Stamina 8/10, Inventory: Rope x2')
    const result = mergeStatusIntoCharacter(kael, parsed)
    expect(result.baseValues.hp).toEqual({ kind: 'numberWithMax', value: 25, max: 60 })
    expect(result.baseValues.level).toEqual({ kind: 'number', value: 4 })
    const attrs = result.baseValues.attributes
    expect(attrs.kind === 'attributeSet' && attrs.values).toMatchObject({ STR: 15, LUCK: 3, DEX: 10 })
    const added = result.stats.find((s) => s.name === 'Stamina')
    expect(added?.type).toBe('numberWithMax')
    expect(result.baseValues[added!.id]).toEqual({ kind: 'numberWithMax', value: 8, max: 10 })
    expect(result.baseValues.inventory).toEqual({ kind: 'inventory', items: [{ name: 'Rope', fields: { qty: 2 } }] })
    expect(result.updated).toEqual(['HP', 'Level', 'Attributes', 'Inventory'])
    expect(result.added).toEqual(['Stamina'])
  })

  it('adds unknown attribute keys to the existing attribute set', () => {
    const kael = makeHero('kael')
    const result = mergeStatusIntoCharacter(kael, parseStatusWindow('AGI 18'))
    expect(result.stats.find((s) => s.id === 'attributes')?.attributeKeys).toContain('AGI')
  })

  it('builds a whole sheet for an empty character', () => {
    const result = mergeStatusIntoCharacter({ stats: [], baseValues: {} }, parseStatusWindow('HP 10/10, Rank: B'))
    expect(result.stats.map((s) => [s.id, s.name, s.type])).toEqual([
      ['hp', 'HP', 'numberWithMax'],
      ['rank', 'Rank', 'rank'],
    ])
    expect(result.stats[1].rankTiers).toContain('B')
    expect(result.baseValues.rank).toEqual({ kind: 'rank', tier: 'B' })
  })

  it('converts a number value into a numberWithMax stat by keeping the max', () => {
    const kael = makeHero('kael')
    const result = mergeStatusIntoCharacter(kael, parseStatusWindow('HP 12'))
    expect(result.baseValues.hp).toEqual({ kind: 'numberWithMax', value: 12, max: 40 })
  })
})

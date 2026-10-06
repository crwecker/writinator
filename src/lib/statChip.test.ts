import { describe, expect, it } from 'vitest'
import { buildMarkerChip, formatOpChip, statNameLookup } from './statFormat'
import { delta } from '../test/fixtures'
import { makeHero } from '../test/characterFixtures'
import type { StatDeltaOp } from '../types'

const kael = makeHero('kael', { color: '#f87171' })
const mira = makeHero('mira', { color: '#60a5fa' })
const byId = new Map([kael, mira].map((c) => [c.id, c]))
const name = statNameLookup(kael)

describe('formatOpChip', () => {
  const cases: Array<[StatDeltaOp, string]> = [
    [{ kind: 'adjust', statId: 'hp', delta: -15 }, 'HP −15'],
    [{ kind: 'adjust', statId: 'level', delta: 1 }, 'Level +1'],
    [{ kind: 'adjust', statId: 'attributes', delta: 2, attributeKey: 'STR' }, 'STR +2'],
    [{ kind: 'maxAdjust', statId: 'hp', delta: 10 }, 'max HP +10'],
    [{ kind: 'set', statId: 'hp', value: { kind: 'numberWithMax', value: 30, max: 40 } }, 'HP = 30/40'],
    [{ kind: 'set', statId: 'class', value: { kind: 'text', value: 'Ranger' } }, 'Class = Ranger'],
    [{ kind: 'fill', statId: 'hp' }, 'HP full'],
    [{ kind: 'itemAdd', statId: 'inventory', name: 'Wolf Pelt', fields: { qty: 1 } }, '+Wolf Pelt'],
    [{ kind: 'itemAdd', statId: 'inventory', name: 'Arrows', fields: { qty: 3 } }, '+3 Arrows'],
    [{ kind: 'itemRemove', statId: 'inventory', name: 'Healing Potion' }, '−Healing Potion'],
    [{ kind: 'itemFieldAdjust', statId: 'inventory', name: 'Arrows', field: 'qty', delta: -2 }, '−2 Arrows'],
    [{ kind: 'itemFieldAdjust', statId: 'spells', name: 'Fireball', field: 'level', delta: 1 }, 'Fireball level +1'],
    [{ kind: 'itemAdd', statId: 'spells', name: 'Fireball', fields: { level: 1, mana: 0 } }, 'learns Fireball'],
    [{ kind: 'itemRemove', statId: 'spells', name: 'Fireball' }, 'forgets Fireball'],
    [{ kind: 'listAdd', statId: 'status_effects', items: ['Poisoned'] }, '+Poisoned'],
    [{ kind: 'listRemove', statId: 'status_effects', items: ['Poisoned'] }, '−Poisoned'],
    [{ kind: 'equip', slot: 'Weapon', itemId: 'x', itemName: 'Iron Sword', modifiers: [] }, 'equips Iron Sword'],
    [{ kind: 'unequip', slot: 'Weapon' }, 'unequips Weapon'],
    [{ kind: 'buffApply', buffId: 'Haste', buffName: 'Haste', modifiers: [], expiresAfter: 3 }, '+Haste (3)'],
    [{ kind: 'buffRemove', buffId: 'Haste' }, '−Haste'],
    [{ kind: 'rankChange', statId: 'rank', direction: 'up' }, 'Rank ↑'],
    [{ kind: 'rankChange', statId: 'rank', direction: 'set', value: 'C' }, 'Rank = C'],
  ]
  it.each(cases)('%o → %s', (op, expected) => {
    expect(formatOpChip(op, name, kael)).toBe(expected)
  })
})

describe('buildMarkerChip', () => {
  it('reads "Kael · HP −15 · +Wolf Pelt"', () => {
    const chip = buildMarkerChip(
      [
        delta('kael', { kind: 'adjust', statId: 'hp', delta: -15 }),
        delta('kael', { kind: 'itemAdd', statId: 'inventory', name: 'Wolf Pelt', fields: { qty: 1 } }),
      ],
      byId,
    )
    expect(chip.text).toBe('Kael · HP −15 · +Wolf Pelt')
    expect(chip.groups[0]).toMatchObject({ name: 'Kael', color: '#f87171' })
  })

  it('groups ops per character in first-appearance order', () => {
    const chip = buildMarkerChip(
      [
        delta('kael', { kind: 'itemRemove', statId: 'inventory', name: 'Iron Sword' }),
        delta('mira', { kind: 'itemAdd', statId: 'inventory', name: 'Iron Sword', fields: { qty: 1 } }),
        delta('kael', { kind: 'adjust', statId: 'hp', delta: -1 }),
      ],
      byId,
    )
    expect(chip.text).toBe('Kael · −Iron Sword · HP −1  Mira · +Iron Sword')
  })

  it('truncates long markers with "+N more"', () => {
    const deltas = ['A', 'B', 'C', 'D', 'E'].map((n) =>
      delta('kael', { kind: 'itemAdd', statId: 'inventory', name: n, fields: { qty: 1 } }),
    )
    const chip = buildMarkerChip(deltas, byId)
    expect(chip.more).toBe(2)
    expect(chip.text).toBe('Kael · +A · +B · +C · +2 more')
  })

  it('names deleted characters "Unknown" in a neutral colour', () => {
    const chip = buildMarkerChip([delta('ghost', { kind: 'fill', statId: 'hp' })], byId)
    expect(chip.groups[0]).toMatchObject({ name: 'Unknown', color: '#6b7280' })
  })
})

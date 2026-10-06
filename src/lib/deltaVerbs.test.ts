import { describe, expect, it } from 'vitest'
import {
  amountForVerb,
  opForVerb,
  signedForVerb,
  targetForOp,
  verbForOp,
  verbsForTarget,
  type DeltaVerb,
} from './deltaVerbs'
import { makeHero } from '../test/characterFixtures'
import type { StatDeltaOp } from '../types'

const kael = makeHero('kael')
const stat = (statId: string) => ({ kind: 'stat' as const, statId })

describe('verbsForTarget', () => {
  it('offers only verbs that fit the stat type', () => {
    expect(verbsForTarget(stat('hp'), kael)).toEqual(['damage', 'heal', 'set', 'raiseMax', 'lowerMax', 'refill'])
    expect(verbsForTarget(stat('gold'), kael)).toEqual(['change', 'set'])
    expect(verbsForTarget(stat('attributes'), kael)).toEqual(['change', 'set'])
    expect(verbsForTarget(stat('class'), kael)).toEqual(['set'])
    expect(verbsForTarget(stat('status_effects'), kael)).toEqual(['gainItem', 'loseItem', 'set'])
    expect(verbsForTarget(stat('inventory'), kael)).toEqual(['gainItem', 'loseItem', 'changeQty', 'set'])
    expect(verbsForTarget(stat('spells'), kael)).toEqual(['learn', 'forget', 'adjustField', 'set'])
    expect(verbsForTarget(stat('rank'), kael)).toEqual(['rankUp', 'rankDown', 'setRank'])
    expect(verbsForTarget({ kind: 'equipment' }, kael)).toEqual(['equip', 'unequip'])
    expect(verbsForTarget({ kind: 'buffs' }, kael)).toEqual(['applyBuff', 'removeBuff'])
  })

  it('offers nothing for a missing stat', () => {
    expect(verbsForTarget(stat('nope'), kael)).toEqual([])
  })
})

describe('verbForOp / targetForOp', () => {
  const cases: Array<[StatDeltaOp, DeltaVerb]> = [
    [{ kind: 'adjust', statId: 'hp', delta: -5 }, 'damage'],
    [{ kind: 'adjust', statId: 'hp', delta: 5 }, 'heal'],
    [{ kind: 'adjust', statId: 'gold', delta: -5 }, 'change'],
    [{ kind: 'adjust', statId: 'attributes', delta: 1, attributeKey: 'STR' }, 'change'],
    [{ kind: 'set', statId: 'rank', value: { kind: 'rank', tier: 'C' } }, 'set'],
    [{ kind: 'maxAdjust', statId: 'hp', delta: -2 }, 'lowerMax'],
    [{ kind: 'maxAdjust', statId: 'hp', delta: 2 }, 'raiseMax'],
    [{ kind: 'fill', statId: 'hp' }, 'refill'],
    [{ kind: 'listAdd', statId: 'status_effects', items: ['x'] }, 'gainItem'],
    [{ kind: 'listRemove', statId: 'status_effects', items: ['x'] }, 'loseItem'],
    [{ kind: 'itemAdd', statId: 'inventory', name: 'x', fields: { qty: 1 } }, 'gainItem'],
    [{ kind: 'itemAdd', statId: 'spells', name: 'x', fields: {} }, 'learn'],
    [{ kind: 'itemRemove', statId: 'skills', name: 'x' }, 'forget'],
    [{ kind: 'itemFieldAdjust', statId: 'inventory', name: 'x', field: 'qty', delta: 1 }, 'changeQty'],
    [{ kind: 'itemFieldAdjust', statId: 'spells', name: 'x', field: 'mana', delta: 1 }, 'adjustField'],
    [{ kind: 'rankChange', statId: 'rank', direction: 'down' }, 'rankDown'],
    [{ kind: 'rankChange', statId: 'rank', direction: 'set', value: 'C' }, 'setRank'],
    [{ kind: 'equip', slot: 'Weapon', itemId: 'x', modifiers: [{ statId: 'hp', kind: 'flat', amount: 1 }] }, 'equip'],
    [{ kind: 'unequip', slot: 'Weapon' }, 'unequip'],
    [{ kind: 'buffApply', buffId: 'b', modifiers: [] }, 'applyBuff'],
    [{ kind: 'buffRemove', buffId: 'b' }, 'removeBuff'],
  ]
  it.each(cases)('%o reads as %s and that verb is on offer', (op, verb) => {
    expect(verbForOp(op, kael)).toBe(verb)
    const offered = verbsForTarget(targetForOp(op), kael)
    // A legacy op whose verb isn't normally offered (set on a rank) is still shown.
    if (!(op.kind === 'set' && op.statId === 'rank')) expect(offered).toContain(verb)
  })
})

describe('opForVerb', () => {
  it('keeps the amount when switching between damage and heal', () => {
    const prev: StatDeltaOp = { kind: 'adjust', statId: 'hp', delta: -7 }
    expect(opForVerb('heal', stat('hp'), kael, prev)).toEqual({ kind: 'adjust', statId: 'hp', delta: 7 })
    expect(opForVerb('lowerMax', stat('hp'), kael, prev)).toEqual({ kind: 'maxAdjust', statId: 'hp', delta: -7 })
  })

  it('builds defaults per verb', () => {
    expect(opForVerb('damage', stat('hp'), kael)).toEqual({ kind: 'adjust', statId: 'hp', delta: 0 })
    expect(opForVerb('change', stat('attributes'), kael)).toEqual({
      kind: 'adjust',
      statId: 'attributes',
      delta: 0,
      attributeKey: 'STR',
    })
    expect(opForVerb('set', stat('hp'), kael)).toEqual({
      kind: 'set',
      statId: 'hp',
      value: { kind: 'numberWithMax', value: 40, max: 40 },
    })
    expect(opForVerb('gainItem', stat('inventory'), kael)).toEqual({
      kind: 'itemAdd',
      statId: 'inventory',
      name: '',
      fields: { qty: 1 },
    })
    expect(opForVerb('gainItem', stat('status_effects'), kael)).toEqual({ kind: 'listAdd', statId: 'status_effects', items: [] })
    expect(opForVerb('changeQty', stat('inventory'), kael)).toEqual({
      kind: 'itemFieldAdjust',
      statId: 'inventory',
      name: '',
      field: 'qty',
      delta: 0,
    })
    expect(opForVerb('learn', stat('spells'), kael)).toEqual({
      kind: 'itemAdd',
      statId: 'spells',
      name: '',
      fields: { level: 1, mana: 0 },
    })
    expect(opForVerb('setRank', stat('rank'), kael)).toEqual({ kind: 'rankChange', statId: 'rank', direction: 'set', value: 'D' })
    expect(opForVerb('equip', { kind: 'equipment' }, kael)).toEqual({ kind: 'equip', slot: 'Weapon', itemId: '', modifiers: [] })
    expect(opForVerb('removeBuff', { kind: 'buffs' }, kael)).toEqual({ kind: 'buffRemove', buffId: '' })
  })

  it('keeps the item name when switching item verbs', () => {
    const prev: StatDeltaOp = { kind: 'itemAdd', statId: 'inventory', name: 'Rope', fields: { qty: 1 } }
    expect(opForVerb('loseItem', stat('inventory'), kael, prev)).toEqual({ kind: 'itemRemove', statId: 'inventory', name: 'Rope' })
  })
})

describe('amountForVerb / signedForVerb', () => {
  it('shows damage and max changes as positive amounts and writes the sign back', () => {
    expect(amountForVerb('damage', -15)).toBe(15)
    expect(signedForVerb('damage', 15)).toBe(-15)
    expect(signedForVerb('heal', 15)).toBe(15)
    expect(signedForVerb('lowerMax', 3)).toBe(-3)
    expect(amountForVerb('change', -4)).toBe(-4)
    expect(signedForVerb('change', -4)).toBe(-4)
  })
})

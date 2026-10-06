import { describe, it, expect } from 'vitest'
import { computeMarkerWarnings } from './markerWarnings'
import { makeBook, makeStorylet } from '../test/fixtures'
import { makeHero, item } from '../test/characterFixtures'
import { m, one } from '../test/mechanicsFixtures'
import type { StatDelta } from '../types'

const kael = makeHero('kael', { hp: [40, 50], inventory: [item('Healing Potion', 2), item('Rope')] })

function run(content: string, markers: Record<string, StatDelta[]>, characters = [kael]) {
  const book = makeBook([makeStorylet('c1', content)])
  return computeMarkerWarnings(book, 'c1', characters, markers)
}

describe('computeMarkerWarnings', () => {
  it('flags HP pushed over max and offers a clamp', () => {
    const markers = { a: one('kael', { kind: 'adjust', statId: 'hp', delta: 20 }, 'd1') }
    const w = run(`Heal ${m('a')}`, markers).get('a')
    expect(w).toHaveLength(1)
    expect(w![0].message).toBe('HP would be 60/50 — above max')
    const fix = w![0].fixes[0]
    expect(fix.label).toBe('Clamp to 50')
    expect(fix.kind === 'replaceDeltas' && fix.deltas[0].op).toEqual({ kind: 'adjust', statId: 'hp', delta: 10 })
  })

  it('flags HP below 0 and clamps to 0', () => {
    const markers = { a: one('kael', { kind: 'adjust', statId: 'hp', delta: -45 }) }
    const w = run(m('a'), markers).get('a')!
    expect(w[0].message).toBe('HP would be −5/50 — below 0')
    expect(w[0].fixes[0].kind === 'replaceDeltas' && w[0].fixes[0].deltas[0].op).toEqual({
      kind: 'adjust', statId: 'hp', delta: -40,
    })
  })

  it('only flags the change that crossed the bound, not later ones', () => {
    const markers = {
      a: one('kael', { kind: 'adjust', statId: 'hp', delta: -45 }),
      b: one('kael', { kind: 'adjust', statId: 'hp', delta: -1 }),
    }
    const w = run(`${m('a')} later ${m('b')}`, markers)
    expect(w.has('a')).toBe(true)
    expect(w.has('b')).toBe(false)
  })

  it('suggests the closest owned item when removing one not owned', () => {
    const markers = { a: one('kael', { kind: 'itemRemove', statId: 'inventory', name: 'Healing Potions' }) }
    const w = run(m('a'), markers).get('a')!
    expect(w[0].message).toBe('Kael doesn’t have Healing Potions')
    expect(w[0].fixes.map((f) => f.label)).toEqual(['Remove Healing Potion instead', 'Delete this change'])
    const fix = w[0].fixes[0]
    expect(fix.kind === 'replaceDeltas' && fix.deltas[0].op).toEqual({
      kind: 'itemRemove', statId: 'inventory', name: 'Healing Potion',
    })
  })

  it('flags unequipping an empty slot', () => {
    const markers = { a: one('kael', { kind: 'unequip', slot: 'Weapon' }) }
    const w = run(m('a'), markers).get('a')!
    expect(w[0].message).toBe('Weapon is already empty')
    expect(w[0].fixes[0].kind === 'replaceDeltas' && w[0].fixes[0].deltas).toEqual([])
  })

  it('flags an unknown stat and retargets by name', () => {
    const markers = { a: one('kael', { kind: 'adjust', statId: 'HP', delta: -3 }) }
    const w = run(m('a'), markers).get('a')!
    expect(w[0].message).toBe('Kael has no stat “HP”')
    expect(w[0].fixes[0].label).toBe('Use HP')
    expect(w[0].fixes[0].kind === 'replaceDeltas' && w[0].fixes[0].deltas[0].op).toEqual({
      kind: 'adjust', statId: 'hp', delta: -3,
    })
  })

  it('offers to add an equip slot the character lacks', () => {
    const markers = {
      a: one('kael', { kind: 'equip', slot: 'Ring', itemId: 'r', itemName: 'Ring of Fire', modifiers: [] }),
    }
    const w = run(m('a'), markers).get('a')!
    expect(w[0].fixes[0]).toEqual({ kind: 'addSlot', label: 'Add a Ring slot', characterId: 'kael', slot: 'Ring' })
  })

  it('keeps other deltas of a compound marker when fixing one', () => {
    const markers: Record<string, StatDelta[]> = {
      a: [
        { id: 'x', characterId: 'kael', op: { kind: 'adjust', statId: 'gold', delta: 5 } },
        { id: 'y', characterId: 'kael', op: { kind: 'unequip', slot: 'Armor' } },
      ],
    }
    const w = run(m('a'), markers).get('a')!
    expect(w).toHaveLength(1)
    expect(w[0].deltaId).toBe('y')
    const fix = w[0].fixes[0]
    expect(fix.kind === 'replaceDeltas' && fix.deltas.map((d) => d.id)).toEqual(['x'])
  })

  it('returns the same map for the same inputs (cached)', () => {
    const book = makeBook([makeStorylet('c1', m('a'))])
    const markers = { a: one('kael', { kind: 'unequip', slot: 'Weapon' }) }
    const chars = [kael]
    expect(computeMarkerWarnings(book, 'c1', chars, markers)).toBe(computeMarkerWarnings(book, 'c1', chars, markers))
  })

  it('is quiet for valid changes', () => {
    const markers = { a: one('kael', { kind: 'adjust', statId: 'hp', delta: -5 }) }
    expect(run(m('a'), markers).size).toBe(0)
  })
})

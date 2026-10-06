import { describe, it, expect } from 'vitest'
import { duplicateCharacter } from './duplicateCharacter'
import { makeHero, item } from '../test/characterFixtures'

describe('duplicateCharacter', () => {
  const kael = makeHero('kael', { inventory: [item('Rope')] })

  it('copies stats and base values under a new id and name', () => {
    const copy = duplicateCharacter(kael)
    expect(copy.id).not.toBe(kael.id)
    expect(copy.name).toBe('Kael (copy)')
    expect(copy.stats).toEqual(kael.stats)
    expect(copy.baseValues).toEqual(kael.baseValues)
    expect(copy.equipmentSlots).toEqual(kael.equipmentSlots)
  })

  it('does not share nested objects with the source', () => {
    const copy = duplicateCharacter(kael)
    expect(copy.baseValues.inventory).not.toBe(kael.baseValues.inventory)
    expect(copy.stats[0]).not.toBe(kael.stats[0])
  })

  it('numbers the copy when the name is taken and takes a new colour', () => {
    const copy = duplicateCharacter(kael, ['Kael', 'Kael (copy)'], '#22d3ee')
    expect(copy.name).toBe('Kael (copy 2)')
    expect(copy.color).toBe('#22d3ee')
  })

  it('never copies the party-stash role', () => {
    const copy = duplicateCharacter({ ...kael, kind: 'party' })
    expect(copy.kind).toBeUndefined()
  })
})

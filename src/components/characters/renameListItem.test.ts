import { describe, expect, it } from 'vitest'
import { renameListItem } from './renameListItem'
import { useCharacterStore } from '../../stores/characterStore'
import { delta, makeCharacter, seedCharacters } from '../../test/fixtures'
import type { Character } from '../../types'

function seedHero(baseItems: string[]): Character {
  const hero = makeCharacter(
    'hero',
    [
      { id: 'bag', name: 'Bag', type: 'list' },
      { id: 'inv', name: 'Inventory', type: 'inventory' },
    ],
    {
      bag: { kind: 'list', items: baseItems },
      inv: { kind: 'inventory', items: [{ name: 'Rope', fields: { qty: 1 } }] },
    },
  )
  seedCharacters([hero], {
    m1: [delta('hero', { kind: 'listAdd', statId: 'bag', items: ['Potion x2'] }, 'd1')],
    m2: [delta('hero', { kind: 'listRemove', statId: 'bag', items: ['potion'] }, 'd2')],
    m3: [delta('hero', { kind: 'itemFieldAdjust', statId: 'inv', name: 'rope', field: 'qty', delta: 1 }, 'd3')],
  })
  return hero
}

const state = () => useCharacterStore.getState()
const baseOf = (statId: string) => state().characters[0].baseValues[statId]

describe('renaming a list item from the panel', () => {
  it('renames a plain-list item shown with its quantity, keeping quantities everywhere', () => {
    const hero = seedHero(['Potion x3', 'Torch'])
    // The panel shows the effective string, quantity included.
    expect(renameListItem(hero, 'bag', 'Potion x5', 'Elixir')).toBe(true)
    expect(baseOf('bag')).toEqual({ kind: 'list', items: ['Elixir x3', 'Torch'] })
    expect(state().markers.m1[0].op).toMatchObject({ kind: 'listAdd', items: ['Elixir x2'] })
    expect(state().markers.m2[0].op).toMatchObject({ kind: 'listRemove', items: ['Elixir'] })
  })

  it('renames a plain-list item that only exists through markers', () => {
    const hero = seedHero(['Torch'])
    expect(renameListItem(hero, 'bag', 'Potion x2', 'Elixir')).toBe(true)
    expect(baseOf('bag')).toEqual({ kind: 'list', items: ['Torch'] })
    expect(state().markers.m1[0].op).toMatchObject({ items: ['Elixir x2'] })
  })

  it('allows a case-only rename and rejects a clash with another item', () => {
    const hero = seedHero(['Potion x3', 'Torch'])
    expect(renameListItem(hero, 'bag', 'Potion x3', 'torch')).toBe(false)
    expect(renameListItem(hero, 'bag', 'Potion x3', 'POTION')).toBe(true)
    expect(baseOf('bag')).toEqual({ kind: 'list', items: ['POTION x3', 'Torch'] })
  })

  it('matches structured items case-insensitively, as the engine does', () => {
    const hero = seedHero([])
    expect(renameListItem(hero, 'inv', 'Rope', 'Cord')).toBe(true)
    expect(baseOf('inv')).toMatchObject({ items: [{ name: 'Cord' }] })
    expect(state().markers.m3[0].op).toMatchObject({ kind: 'itemFieldAdjust', name: 'Cord' })
  })
})

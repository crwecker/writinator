import { describe, expect, it } from 'vitest'
import { useCharacterStore } from './characterStore'
import { useStoryletStore } from './storyletStore'
import { delta, makeBook, makeCharacter, makeStorylet, seedCharacters, seedStore, storyletContent } from '../test/fixtures'

const marker = (id: string) => `<!-- stat:${id} -->`

describe('removing a character', () => {
  it("drops the character's deltas, and the markers and comments left empty", () => {
    const hero = makeCharacter('hero', [{ id: 'gold', name: 'Gold', type: 'number' }], { gold: { kind: 'number', value: 0 } })
    const rival = makeCharacter('rival', [{ id: 'gold', name: 'Gold', type: 'number' }], { gold: { kind: 'number', value: 0 } })
    const gold = { kind: 'adjust', statId: 'gold', delta: 1 } as const
    seedStore(
      makeBook([
        makeStorylet('c1', `A ${marker('solo')} B ${marker('mixed')} C`),
        makeStorylet('c2', `D ${marker('empty')} E ${marker('other')} F`),
      ]),
      'c1',
    )
    seedCharacters([hero, rival], {
      solo: [delta('hero', gold, 'd1')],
      mixed: [delta('hero', gold, 'd2'), delta('rival', gold, 'd3')],
      // An entry made with "Create empty entry" belongs to nobody — leave it.
      empty: [],
      other: [delta('rival', gold, 'd4')],
    })
    // Unflushed typing in the open storylet must survive the cleanup.
    useStoryletStore.getState().updateStoryletContent(`A ${marker('solo')} B ${marker('mixed')} C typed`, 'c1')

    useCharacterStore.getState().removeCharacter('hero')

    const { characters, markers } = useCharacterStore.getState()
    expect(characters.map((c) => c.id)).toEqual(['rival'])
    expect(markers).toEqual({
      mixed: [delta('rival', gold, 'd3')],
      empty: [],
      other: [delta('rival', gold, 'd4')],
    })
    expect(storyletContent('c1')).toBe(`A  B ${marker('mixed')} C typed`)
    expect(storyletContent('c2')).toBe(`D ${marker('empty')} E ${marker('other')} F`)
  })
})

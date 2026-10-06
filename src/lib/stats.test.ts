import { beforeEach, describe, expect, it } from 'vitest'
import { extractMarkers } from './markerUtils'
import { renderStoryletAsMarkdown } from './render'
import { computeStateAt } from './characterState'
import { coerceStatValue } from './coerceStatValue'
import { planStatTypeChange } from './statTypeChange'
import type { Book, Character, StatDelta, StatType } from '../types'
import { delta, makeBook, makeCharacter, makeStorylet, seedCharacters, seedStore } from '../test/fixtures'

const marker = (id: string) => `<!-- stat:${id} -->`

describe('statblock fields', () => {
  const hero = makeCharacter(
    'hero',
    [
      { id: 'hp', name: 'HP', type: 'numberWithMax' },
      { id: 'mp', name: 'MP', type: 'numberWithMax' },
      { id: 'level', name: 'Level', type: 'number' },
      { id: 'gold', name: 'Gold', type: 'number' },
    ],
    {
      hp: { kind: 'numberWithMax', value: 7, max: 10 },
      mp: { kind: 'numberWithMax', value: 3, max: 5 },
      level: { kind: 'number', value: 4 },
      gold: { kind: 'number', value: 99 },
    },
  )

  beforeEach(() => {
    seedCharacters([hero], {})
  })

  it('reads every field from a statblock written by the toolbar (fields=a,b,c)', () => {
    const [m] = extractMarkers('<!-- statblock:hero:fields=hp,mp,level -->')
    expect(m.kind).toBe('statblock')
    const fields = m.kind === 'statblock' ? m.options.fields : ''
    expect(fields.split(/[|,]/)).toEqual(['hp', 'mp', 'level'])
  })

  it('exports every requested field', () => {
    const book = makeBook([makeStorylet('a', 'Status check.\n\n<!-- statblock:hero:fields=hp,mp,level -->')])
    seedStore(book, 'a')
    const md = renderStoryletAsMarkdown(book.storylets[0], book)
    expect(md).toContain('HP: 7/10')
    expect(md).toContain('MP: 3/5')
    expect(md).toContain('Level: 4')
    expect(md).not.toContain('Gold')
  })
})

/** Change a stat's type with planStatTypeChange and return the new character + markers. */
function applyTypeChange(
  character: Character,
  book: Book,
  markers: Record<string, StatDelta[]>,
  statId: string,
  newType: StatType,
) {
  const plan = planStatTypeChange(character, book, markers, statId, newType)
  if (!plan) throw new Error('no plan')
  const next: Character = {
    ...character,
    stats: character.stats.map((s) => (s.id === statId ? { ...s, ...plan.defPatch } : s)),
    baseValues: { ...character.baseValues, [statId]: plan.baseValue },
  }
  return { plan, character: next, markers: { ...markers, ...plan.markers } }
}

describe('changing a stat type', () => {
  it('number → number with max keeps the value', () => {
    expect(coerceStatValue({ kind: 'number', value: 50 }, 'numberWithMax')).toMatchObject({ value: 50 })
  })

  it('number with max → number keeps the current value', () => {
    expect(coerceStatValue({ kind: 'numberWithMax', value: 7, max: 10 }, 'number')).toEqual({
      kind: 'number',
      value: 7,
    })
  })

  it('number → number with max keeps values set by markers', () => {
    const hero = makeCharacter('hero', [{ id: 'hp', name: 'HP', type: 'number' }], {
      hp: { kind: 'number', value: 50 },
    })
    const markers = { m1: [delta('hero', { kind: 'set', statId: 'hp', value: { kind: 'number', value: 30 } })] }
    const book = makeBook([makeStorylet('a', `Ouch ${marker('m1')}`)])
    const after = applyTypeChange(hero, book, markers, 'hp', 'numberWithMax')

    expect(computeStateAt(after.character, book, after.markers).effective.hp).toMatchObject({ value: 30 })
  })

  it('converting to rank gives the stat a set of tiers', () => {
    const hero = makeCharacter('hero', [{ id: 'r', name: 'Rank', type: 'text' }], {
      r: { kind: 'text', value: 'Novice' },
    })
    const { plan } = applyTypeChange(hero, makeBook([makeStorylet('a', '')]), {}, 'r', 'rank')
    expect(plan.defPatch.rankTiers?.length).toBeGreaterThan(0)
  })

  it('list → counted list ends with the same items and quantities', () => {
    const hero = makeCharacter('hero', [{ id: 'bag', name: 'Bag', type: 'list' }], {
      bag: { kind: 'list', items: ['Potion'] },
    })
    const markers = {
      m1: [delta('hero', { kind: 'listAdd', statId: 'bag', items: ['Potion x2'] })],
      m2: [delta('hero', { kind: 'listAdd', statId: 'bag', items: ['Potion x2', 'Rope'] })],
      m3: [delta('hero', { kind: 'listRemove', statId: 'bag', items: ['Potion'] })],
    }
    const book = makeBook([makeStorylet('a', `${marker('m1')} then ${marker('m2')} then ${marker('m3')}`)])
    const before = computeStateAt(hero, book, markers).effective.bag
    const after = applyTypeChange(hero, book, markers, 'bag', 'inventory')

    expect(computeStateAt(after.character, book, after.markers).effective.bag).toEqual(
      coerceStatValue(before, 'inventory'),
    )
  })

  it('counted list → list ends with the same items and quantities', () => {
    const hero = makeCharacter('hero', [{ id: 'bag', name: 'Bag', type: 'inventory' }], {
      bag: { kind: 'inventory', items: [{ name: 'Potion', fields: { qty: 3 } }] },
    })
    const markers = {
      m1: [delta('hero', { kind: 'itemFieldAdjust', statId: 'bag', name: 'Potion', field: 'qty', delta: 2 })],
      m2: [delta('hero', { kind: 'itemRemove', statId: 'bag', name: 'Potion' })],
      m3: [delta('hero', { kind: 'itemAdd', statId: 'bag', name: 'Elixir', fields: { qty: 2 } })],
    }
    const book = makeBook([makeStorylet('a', `${marker('m1')} ${marker('m2')} ${marker('m3')}`)])
    const before = computeStateAt(hero, book, markers).effective.bag
    const after = applyTypeChange(hero, book, markers, 'bag', 'list')

    expect(computeStateAt(after.character, book, after.markers).effective.bag).toEqual(
      coerceStatValue(before, 'list'),
    )
  })
})

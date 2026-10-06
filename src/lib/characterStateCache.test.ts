import { describe, expect, it, vi } from 'vitest'
import * as markerUtils from './markerUtils'
import { computeStateAt } from './characterState'
import { delta, makeBook, makeCharacter, makeStorylet } from '../test/fixtures'

vi.mock('./markerUtils', async (importOriginal) => {
  const actual = await importOriginal<typeof markerUtils>()
  return { ...actual, extractMarkers: vi.fn(actual.extractMarkers) }
})

const hero = makeCharacter('hero', [{ id: 'gold', name: 'Gold', type: 'number' }], {
  gold: { kind: 'number', value: 0 },
})

function chapter(id: string, markerIds: string[]): ReturnType<typeof makeStorylet> {
  return makeStorylet(id, markerIds.map((m) => `Some prose. <!-- stat:${m} --> More prose.`).join('\n'))
}

const book = makeBook([chapter('c1', ['m1', 'm2']), chapter('c2', ['m3']), chapter('c3', ['m4', 'm5'])])
const markers = Object.fromEntries(
  ['m1', 'm2', 'm3', 'm4', 'm5'].map((m) => [m, [delta('hero', { kind: 'adjust', statId: 'gold', delta: 10 })]]),
)

describe('character state lookups', () => {
  it('gives the right value at each position in the book', () => {
    const c3 = book.storylets[2].content!
    const afterFirstInC3 = c3.indexOf('<!-- stat:m4') + 1
    expect(computeStateAt(hero, book, markers, { storyletId: 'c1', offset: 0 }).effective.gold).toEqual({ kind: 'number', value: 0 })
    expect(computeStateAt(hero, book, markers, { storyletId: 'c2', offset: 0 }).effective.gold).toEqual({ kind: 'number', value: 20 })
    expect(computeStateAt(hero, book, markers, { storyletId: 'c3', offset: afterFirstInC3 }).effective.gold).toEqual({ kind: 'number', value: 40 })
    expect(computeStateAt(hero, book, markers).effective.gold).toEqual({ kind: 'number', value: 50 })
  })

  it('does not re-scan the whole book for every lookup', () => {
    const spy = vi.mocked(markerUtils.extractMarkers)
    spy.mockClear()
    for (let offset = 0; offset < 200; offset += 5) {
      computeStateAt(hero, book, markers, { storyletId: 'c3', offset })
    }
    expect(spy.mock.calls.length).toBeLessThanOrEqual(book.storylets.length)
  })
})

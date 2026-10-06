import { describe, expect, it } from 'vitest'
import { processCharacterMarkers, type CharacterMarkerContext } from './export'
import { delta, makeBook, makeCharacter, makeStorylet } from '../test/fixtures'
import type { StatDelta } from '../types'

const hero = makeCharacter(
  'hero',
  [{ id: 'hp', name: 'HP', type: 'numberWithMax' }],
  { hp: { kind: 'numberWithMax', value: 10, max: 10 } },
)

const markers: Record<string, StatDelta[]> = {
  m1: [delta('hero', { kind: 'adjust', statId: 'hp', delta: -3 })],
}

function ctxFor(content: string, snippets?: Record<string, string>): CharacterMarkerContext {
  return {
    book: makeBook([makeStorylet('c1', content)]),
    storyletId: 'c1',
    characters: [hero],
    markers,
    snippets,
  }
}

describe('character markers in export', () => {
  it('resolves stat refs inside a snippet at the snippet token, not at their offset in the template', () => {
    const content = 'The goblin hits. <!-- stat:m1 --> Now: {Status}'
    const out = processCharacterMarkers(content, ctxFor(content, { Status: 'HP {HP}' }), 'plain')
    expect(out).toContain('Now: HP 7')
  })

  it('resolves nested snippets at the outermost token', () => {
    const content = 'The goblin hits. <!-- stat:m1 --> Now: {Outer}'
    const out = processCharacterMarkers(content, ctxFor(content, { Outer: '[{Inner}]', Inner: '{HP}' }), 'plain')
    expect(out).toContain('Now: [7]')
  })

  it('computes a statblock right after a delta marker from its original position', () => {
    const content = 'Some text <!-- stat:m1 --><!-- statblock:hero:fields=hp -->'
    const out = processCharacterMarkers(content, ctxFor(content), 'plain')
    expect(out).toContain('HP: 7/10')
  })

  it('does not let ref expansion push a statblock past a later marker', () => {
    // `{Status}` expands to far more text than the token, which would move the
    // statblock past m1 if offsets were taken after expansion.
    const content = '{Status} <!-- statblock:hero:fields=hp --><!-- stat:m1 -->'
    const long = 'A long status line that is much longer than the token itself.'
    const out = processCharacterMarkers(content, ctxFor(content, { Status: long }), 'plain', {
      preserveStatMarkers: true,
    })
    expect(out).toContain('HP: 10/10')
  })
})

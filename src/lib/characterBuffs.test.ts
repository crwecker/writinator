import { describe, expect, it } from 'vitest'
import { checkConsistency, computeHistory, computeStateAt } from './characterState'
import { delta, makeBook, makeCharacter, makeStorylet } from '../test/fixtures'
import type { StatDelta } from '../types'

// A buff with `expiresAfter: N` stays active for the next N markers that
// affect the character after the marker that applied it.

const hero = makeCharacter(
  'hero',
  [{ id: 'hp', name: 'HP', type: 'numberWithMax' }],
  { hp: { kind: 'numberWithMax', value: 10, max: 10 } },
)

const marker = (id: string) => `<!-- stat:${id} -->`
const content = ['A', marker('buff'), 'B', marker('m1'), 'C', marker('m2'), 'D', marker('m3'), 'E'].join(' ')
const book = makeBook([makeStorylet('c1', content)])

function markersWithBuff(expiresAfter: number): Record<string, StatDelta[]> {
  return {
    buff: [
      delta('hero', {
        kind: 'buffApply',
        buffId: 'rage',
        buffName: 'Rage',
        modifiers: [{ statId: 'hp', kind: 'maxFlat', amount: 5 }],
        expiresAfter,
      }),
    ],
    m1: [delta('hero', { kind: 'adjust', statId: 'hp', delta: -1 })],
    m2: [delta('hero', { kind: 'adjust', statId: 'hp', delta: -1 })],
    m3: [delta('hero', { kind: 'adjust', statId: 'hp', delta: -1 })],
  }
}

const at = (text: string) => ({ storyletId: 'c1', offset: content.indexOf(text) })

describe('buff expiry', () => {
  it('expiresAfter: 1 is active until the next marker, then gone', () => {
    const markers = markersWithBuff(1)
    const buffs = (text: string) => computeStateAt(hero, book, markers, at(text)).state.activeBuffs.map((b) => b.buffId)
    expect(buffs('B')).toEqual(['rage'])
    expect(buffs('C')).toEqual([])
  })

  it('expiresAfter: 2 lasts through two later markers', () => {
    const markers = markersWithBuff(2)
    const buffs = (text: string) => computeStateAt(hero, book, markers, at(text)).state.activeBuffs.map((b) => b.buffId)
    expect(buffs('B')).toEqual(['rage'])
    expect(buffs('C')).toEqual(['rage'])
    expect(buffs('D')).toEqual([])
  })

  it('history samples follow the same expiry', () => {
    const samples = computeHistory(hero, book, markersWithBuff(1))
    const max = samples.map((s) => {
      const v = s.effective.hp
      return v.kind === 'numberWithMax' ? v.max : null
    })
    // base, after buff, after m1, after m2, after m3
    expect(max).toEqual([10, 15, 10, 10, 10])
  })

  it('consistency check sees the buff while it is active', () => {
    // A max buff of 5 lets HP go to 13 at m1 without exceeding max; once the
    // buff expires at m2, 13/10 is impossible.
    const markers: Record<string, StatDelta[]> = {
      ...markersWithBuff(1),
      buff: [
        delta('hero', {
          kind: 'buffApply',
          buffId: 'rage',
          modifiers: [{ statId: 'hp', kind: 'maxFlat', amount: 5 }],
          expiresAfter: 2,
        }),
        delta('hero', { kind: 'adjust', statId: 'hp', delta: 3 }),
      ],
    }
    const issues = checkConsistency(book, [hero], markers)
    const offsets = issues.filter((i) => i.kind === 'impossibleValue').map((i) => ('offset' in i ? i.offset : -1))
    // HP 13 after buff, 12 after m1, 11 after m2 (buff gone), 10 after m3.
    expect(offsets).toEqual([content.indexOf(marker('m2'))])
  })
})

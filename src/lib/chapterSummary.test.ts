import { describe, it, expect } from 'vitest'
import { summarizeChapter, formatChapterSummary } from './chapterSummary'
import { makeBook, makeStorylet } from '../test/fixtures'
import { makeHero, item } from '../test/characterFixtures'
import { m, one } from '../test/mechanicsFixtures'

const kael = makeHero('kael', { hp: [40, 50], inventory: [item('Rope')] })
const mira = makeHero('mira')

describe('summarizeChapter', () => {
  it('nets each stat over the chapter with before → after', () => {
    const book = makeBook([
      makeStorylet('c1', `Start ${m('a')} more`),
      makeStorylet('c2', `Fight ${m('b')} then ${m('c')} loot ${m('d')} ${m('e')}`),
    ])
    const markers = {
      a: one('kael', { kind: 'adjust', statId: 'hp', delta: 5 }), // chapter 1: 40 → 45
      b: one('kael', { kind: 'adjust', statId: 'hp', delta: -20 }),
      c: one('kael', { kind: 'adjust', statId: 'hp', delta: 5 }),
      d: one('kael', { kind: 'itemAdd', statId: 'inventory', name: 'Wolf Pelt', fields: { qty: 2 } }),
      e: one('kael', { kind: 'adjust', statId: 'level', delta: 1 }),
    }
    const list = summarizeChapter(book, 'c2', [kael, mira], markers)
    expect(list).toHaveLength(1)
    expect(list[0].name).toBe('Kael')
    expect(list[0].parts).toEqual(['HP −15 (45 → 30)', 'Level 1 → 2', '+2 items'])
    expect(formatChapterSummary(list)).toBe('Kael HP −15 (45 → 30), Level 1 → 2, +2 items')
  })

  it('is empty when the chapter has no markers', () => {
    const book = makeBook([makeStorylet('c1', 'plain prose')])
    expect(summarizeChapter(book, 'c1', [kael], {})).toEqual([])
  })

  it('reports equipment, rank, removed items and several characters', () => {
    const book = makeBook([makeStorylet('c1', `${m('a')} ${m('b')} ${m('c')}`)])
    const markers = {
      a: one('kael', { kind: 'itemRemove', statId: 'inventory', name: 'Rope' }),
      b: one('mira', { kind: 'rankChange', statId: 'rank', direction: 'up' }),
      c: one('kael', { kind: 'equip', slot: 'Weapon', itemId: 'sword', itemName: 'Iron Sword', modifiers: [] }),
    }
    const list = summarizeChapter(book, 'c1', [kael, mira], markers)
    expect(list.map((s) => s.name)).toEqual(['Kael', 'Mira'])
    expect(list[0].parts).toEqual(['−1 item', 'equips Iron Sword'])
    expect(list[1].parts).toEqual(['Rank D → C'])
    expect(formatChapterSummary(list)).toBe('Kael −1 item, equips Iron Sword · Mira Rank D → C')
  })

  it('says "no net change" when changes cancel out', () => {
    const book = makeBook([makeStorylet('c1', `${m('a')} ${m('b')}`)])
    const markers = {
      a: one('kael', { kind: 'adjust', statId: 'gold', delta: 5 }),
      b: one('kael', { kind: 'adjust', statId: 'gold', delta: -5 }),
    }
    expect(summarizeChapter(book, 'c1', [kael], markers)[0].parts).toEqual(['no net change'])
  })
})

import { describe, it, expect } from 'vitest'
import { buildStatTimeline, timelineToCsv, type TimelineRow } from './timelineCsv'
import { makeBook, makeStorylet } from '../test/fixtures'
import { makeHero, item } from '../test/characterFixtures'
import { m, one } from '../test/mechanicsFixtures'
import type { StatDelta } from '../types'

const kael = makeHero('kael', { hp: [40, 50], inventory: [item('Rope')] })

describe('buildStatTimeline', () => {
  it('lists every change in book order with the value after it', () => {
    const book = makeBook([
      makeStorylet('c1', `The wolf bit him. ${m('a')} He ran.`, { name: 'Chapter 1' }),
      makeStorylet('c2', `Loot! <!-- stat:b --> Done`, { name: 'Chapter 2' }),
    ])
    const markers: Record<string, StatDelta[]> = {
      a: one('kael', { kind: 'adjust', statId: 'hp', delta: -15 }),
      b: [
        { id: 'x', characterId: 'kael', op: { kind: 'itemAdd', statId: 'inventory', name: 'Wolf Pelt', fields: { qty: 1 } } },
        { id: 'y', characterId: 'kael', op: { kind: 'equip', slot: 'Weapon', itemId: 'fang', itemName: 'Fang Dagger', modifiers: [] } },
      ],
    }
    const rows = buildStatTimeline(book, [kael], markers)
    expect(rows).toEqual<TimelineRow[]>([
      { chapter: 'Chapter 1', position: 18, excerpt: 'The wolf bit him.', character: 'Kael', stat: 'HP', change: 'HP -15', valueAfter: '25/50' },
      { chapter: 'Chapter 2', position: 6, excerpt: 'Loot!', character: 'Kael', stat: 'Inventory', change: 'Inventory + Wolf Pelt', valueAfter: 'Rope, Wolf Pelt' },
      { chapter: 'Chapter 2', position: 6, excerpt: 'Loot!', character: 'Kael', stat: 'Weapon', change: 'Equip Weapon: Fang Dagger', valueAfter: 'Fang Dagger' },
    ])
  })

  it('names an unknown character', () => {
    const book = makeBook([makeStorylet('c1', m('a'))])
    const rows = buildStatTimeline(book, [], { a: one('ghost', { kind: 'adjust', statId: 'hp', delta: 1 }) })
    expect(rows[0].character).toBe('Unknown')
    expect(rows[0].valueAfter).toBe('')
  })
})

describe('timelineToCsv', () => {
  it('writes a header and quotes commas, quotes and newlines', () => {
    const csv = timelineToCsv([
      { chapter: 'One, Two', position: 3, excerpt: 'He said "hi"\nthen', character: 'Kael', stat: 'HP', change: 'HP -1', valueAfter: '9/10' },
    ])
    expect(csv).toBe(
      'Chapter,Position,Excerpt,Character,Stat,Change,Value after\r\n' +
        '"One, Two",3,"He said ""hi""\nthen",Kael,HP,HP -1,9/10\r\n',
    )
  })

  it('defuses spreadsheet formulas', () => {
    const csv = timelineToCsv([
      { chapter: '=cmd', position: 0, excerpt: '', character: 'K', stat: 'HP', change: '-5', valueAfter: '+3' },
    ])
    expect(csv.split('\r\n')[1]).toBe("'=cmd,0,,K,HP,-5,+3")
  })
})

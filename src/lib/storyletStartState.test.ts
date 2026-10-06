import { describe, it, expect } from 'vitest'
import { storyletStartState } from './storyletStartState'
import { makeBook, makeStorylet } from '../test/fixtures'
import { makeHero, item } from '../test/characterFixtures'
import { m, one } from '../test/mechanicsFixtures'

const kael = makeHero('kael', { hp: [40, 50], inventory: [item('Rope'), item('Torch', 3)] })

describe('storyletStartState', () => {
  const book = makeBook([
    makeStorylet('c1', `Fight ${m('a')}`),
    makeStorylet('c2', `Rest ${m('b')}`),
  ])
  const markers = {
    a: one('kael', { kind: 'adjust', statId: 'hp', delta: -15 }),
    b: one('kael', { kind: 'adjust', statId: 'hp', delta: 10 }),
  }

  it('shows key stats as the chapter opens, before its own changes', () => {
    const [kaelState] = storyletStartState(book, 'c2', [kael], markers)
    expect(kaelState.name).toBe('Kael')
    expect(kaelState.rows).toEqual([
      { label: 'HP', value: '25/50' },
      { label: 'MP', value: '10/10' },
      { label: 'Level', value: '1' },
      { label: 'XP', value: '0' },
      { label: 'Gold', value: '20' },
      { label: 'Inventory', value: '2 items' },
    ])
  })

  it('uses base values for the first chapter', () => {
    expect(storyletStartState(book, 'c1', [kael], markers)[0].rows[0]).toEqual({ label: 'HP', value: '40/50' })
  })

  it('is empty without characters or for an unknown storylet', () => {
    expect(storyletStartState(book, 'c1', [], markers)).toEqual([])
    expect(storyletStartState(book, 'nope', [kael], markers)).toEqual([])
  })
})

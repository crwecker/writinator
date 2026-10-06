import { describe, expect, it } from 'vitest'
import { formatOpChip, statNameLookup } from './statFormat'
import { makeHero } from '../test/characterFixtures'
import { withNumberStat } from '../test/itemFixtures'

describe('chips for currency stats', () => {
  const kael = withNumberStat(makeHero('kael'), 'purse', 'Purse', 0, { currency: true })
  const name = statNameLookup(kael)

  it('shows coin changes as coins', () => {
    expect(formatOpChip({ kind: 'adjust', statId: 'purse', delta: 2.5 }, name, kael)).toBe('Purse +2g 50s')
    expect(formatOpChip({ kind: 'adjust', statId: 'purse', delta: -0.003 }, name, kael)).toBe('Purse −30c')
  })

  it('leaves plain number stats alone', () => {
    expect(formatOpChip({ kind: 'adjust', statId: 'xp', delta: 2.5 }, name, kael)).toBe('XP +2.5')
  })

  it('treats a stat named for a coin as currency', () => {
    expect(formatOpChip({ kind: 'adjust', statId: 'gold', delta: 2.5 }, name, kael)).toBe('Gold +2g 50s')
  })

  it('respects currency switched off on a coin-named stat', () => {
    const off = { ...kael, stats: kael.stats.map((s) => (s.id === 'gold' ? { ...s, currency: false } : s)) }
    expect(formatOpChip({ kind: 'adjust', statId: 'gold', delta: 2.5 }, statNameLookup(off), off)).toBe('Gold +2.5')
  })
})

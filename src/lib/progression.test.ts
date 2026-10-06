import { describe, expect, it } from 'vitest'
import { levelInfo, levelUpReward, lifetimeWords, titleForLevel, xpToReach, AUTHOR_TITLES } from './progression'

describe('author level curve', () => {
  it('starts at level 1 with no words', () => {
    const info = levelInfo(0)
    expect(info.level).toBe(1)
    expect(info.title).toBe('Apprentice Scribe')
    expect(info.nextLevelXp).toBe(250)
  })

  it('uses a gentle quadratic curve: 125·(L−1)·L words to reach level L', () => {
    expect(xpToReach(1)).toBe(0)
    expect(xpToReach(2)).toBe(250)
    expect(xpToReach(3)).toBe(750)
    expect(xpToReach(10)).toBe(11_250)
    expect(levelInfo(249).level).toBe(1)
    expect(levelInfo(250).level).toBe(2)
    expect(levelInfo(11_250).level).toBe(10)
    // A 90k-word novel lands in the high 20s.
    expect(levelInfo(90_000).level).toBe(27)
  })

  it('reports progress within the level and the next title', () => {
    const info = levelInfo(1000) // level 3 (750) → level 4 (1500)
    expect(info.level).toBe(3)
    expect(info.levelStartXp).toBe(750)
    expect(info.nextLevelXp).toBe(1500)
    expect(info.nextTitle).toEqual({ level: 5, title: 'Scribe' })
  })

  it('changes title every few levels', () => {
    expect(titleForLevel(4)).toBe('Apprentice Scribe')
    expect(titleForLevel(5)).toBe('Scribe')
    expect(titleForLevel(10)).toBe('Chronicler')
    expect(titleForLevel(99)).toBe(AUTHOR_TITLES[AUTHOR_TITLES.length - 1].title)
  })

  it('pays more for higher levels and a bonus on a new title', () => {
    expect(levelUpReward(2)).toBe(30)
    expect(levelUpReward(4)).toBe(50)
    expect(levelUpReward(5)).toBe(60 + 100)
  })

  it('sums lifetime words from the daily log', () => {
    expect(lifetimeWords({ '2026-01-01': 100, '2026-01-02': 250 })).toBe(350)
    expect(lifetimeWords({})).toBe(0)
  })
})

import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS, achievementStatuses, emptyAchievementContext, newlyEarned } from './achievements'

describe('achievements', () => {
  it('has around thirty badges with unique ids and positive rewards', () => {
    expect(ACHIEVEMENTS.length).toBeGreaterThanOrEqual(28)
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length)
    for (const a of ACHIEVEMENTS) {
      expect(a.coins).toBeGreaterThan(0)
      expect(a.target).toBeGreaterThan(0)
    }
  })

  it('covers the headline milestones', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id)
    for (const id of ['words-1k', 'words-10k', 'words-50k', 'words-100k', 'day-2k', 'streak-7', 'streak-30', 'quest-1', 'quests-10', 'quests-50', 'epic-timed', 'chapter-3k', 'first-publish', 'gallery-set', 'pictures-25', 'early-bird', 'night-owl', 'comeback']) {
      expect(ids).toContain(id)
    }
  })

  it('earns badges whose metric reaches the target', () => {
    const ctx = { ...emptyAchievementContext(), lifetimeWords: 12_000, bestDayWords: 2100, questsCompleted: 1 }
    const earned = newlyEarned(ctx, {}).map((a) => a.id)
    expect(earned).toContain('words-1k')
    expect(earned).toContain('words-10k')
    expect(earned).not.toContain('words-50k')
    expect(earned).toContain('day-2k')
    expect(earned).toContain('quest-1')
    expect(earned).not.toContain('quests-10')
  })

  it('never re-earns an unlocked badge', () => {
    const ctx = { ...emptyAchievementContext(), lifetimeWords: 1000 }
    expect(newlyEarned(ctx, { 'words-1k': '2026-01-01' }).map((a) => a.id)).not.toContain('words-1k')
  })

  it('keeps unlocked badges unlocked even if the metric drops (e.g. another book is open)', () => {
    const statuses = achievementStatuses(emptyAchievementContext(), { 'chapter-3k': '2026-01-01' })
    const s = statuses.find((x) => x.def.id === 'chapter-3k')
    expect(s?.unlocked).toBe(true)
  })

  it('reports progress toward locked badges', () => {
    const statuses = achievementStatuses({ ...emptyAchievementContext(), lifetimeWords: 5000 }, {})
    const s = statuses.find((x) => x.def.id === 'words-10k')
    expect(s?.unlocked).toBe(false)
    expect(s?.value).toBe(5000)
  })
})

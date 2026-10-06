import { describe, expect, it } from 'vitest'
import { chapterQuestReward, median, suggestChapterQuests, type ChapterSource } from './chapterQuests'

function words(n: number): string {
  return Array.from({ length: n }, () => 'word').join(' ')
}

function storylet(id: string, n: number, extra: Partial<ChapterSource> = {}): ChapterSource {
  return { id, name: `Chapter ${id}`, content: n > 0 ? words(n) : '', updatedAt: `2026-01-0${id.length}T00:00:00.000Z`, ...extra }
}

describe('chapter quests', () => {
  it('computes a median', () => {
    expect(median([1, 3, 2])).toBe(2)
    expect(median([1, 2, 3, 4])).toBe(2.5)
    expect(median([])).toBe(0)
  })

  it('asks to bring a chapter to the next round thousand', () => {
    const quests = suggestChapterQuests([storylet('7', 2400), storylet('8', 2600)])
    const ch7 = quests.find((q) => q.storyletId === '7')
    expect(ch7).toBeDefined()
    expect(ch7?.kind).toBe('grow')
    expect(ch7?.targetWords).toBe(3000)
    expect(ch7?.wordGoal).toBe(600)
    expect(ch7?.title).toBe('Bring Chapter 7 to 3,000 words')
  })

  it('aims a short chapter at the median chapter length', () => {
    const quests = suggestChapterQuests([storylet('a', 400), storylet('b', 3000), storylet('c', 3200), storylet('d', 2900)])
    const short = quests.find((q) => q.storyletId === 'a')
    expect(short?.targetWords).toBe(3000)
    expect(short?.wordGoal).toBe(2600)
  })

  it('offers to draft an empty storylet, but not a folder', () => {
    const quests = suggestChapterQuests([
      storylet('1', 1200),
      storylet('2', 0, { name: 'The Wedding' }),
      storylet('3', 0, { name: 'Part Two' }),
      storylet('4', 800, { parentId: '3' }),
    ])
    const drafts = quests.filter((q) => q.kind === 'draft')
    expect(drafts.map((q) => q.storyletId)).toEqual(['2'])
    expect(drafts[0].title).toBe('Draft The Wedding')
    expect(drafts[0].wordGoal).toBe(500)
  })

  it('suggests between 2 and 4 quests when there is enough book', () => {
    const many = Array.from({ length: 10 }, (_, i) => storylet(String(i), 1000 + i * 100))
    const quests = suggestChapterQuests(many)
    expect(quests.length).toBeGreaterThanOrEqual(2)
    expect(quests.length).toBeLessThanOrEqual(4)
    expect(new Set(quests.map((q) => q.storyletId)).size).toBe(quests.length)
  })

  it('pays more for more words needed', () => {
    expect(chapterQuestReward(1000)).toBeGreaterThan(chapterQuestReward(500))
    expect(chapterQuestReward(500)).toBeGreaterThan(0)
  })
})

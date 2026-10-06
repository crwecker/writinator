import { beforeEach, describe, expect, it, vi } from 'vitest'
import { acceptChapterQuest, acceptRevisionQuest, activeChapterStoryletIds } from './bookQuests'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { useWriteathonStore } from '../../stores/writeathonStore'
import { useProgressionStore } from '../../stores/progressionStore'
import { usePlayerStore } from '../../stores/playerStore'
import { fetchRandomImage } from '../../lib/unsplash'
import { suggestChapterQuests } from '../../lib/chapterQuests'
import { makeBook, makeStorylet, seedStore } from '../../test/fixtures'

vi.mock('../../lib/unsplash', () => ({ fetchRandomImage: vi.fn(), loadImage: vi.fn() }))

const words = (n: number) => Array.from({ length: n }, () => 'w').join(' ')

beforeEach(() => {
  useImageRevealStore.setState(useImageRevealStore.getInitialState(), true)
  useWriteathonStore.setState(useWriteathonStore.getInitialState(), true)
  usePlayerStore.setState(usePlayerStore.getInitialState(), true)
  useProgressionStore.setState({ ...useProgressionStore.getInitialState(), _hasHydrated: true }, true)
  seedStore(makeBook([makeStorylet('s1', words(2400), { name: 'Seven' })]), 's1')
  vi.mocked(fetchRandomImage).mockReset().mockResolvedValue({
    id: 'p', url: 'https://images.unsplash.com/p', width: 8, height: 6, photographer: 'A', photographerUrl: 'u', downloadLocationUrl: 'd',
  })
})

describe('accepting quests from the book', () => {
  it('starts a chapter quest measured on its storylet', async () => {
    const [suggestion] = suggestChapterQuests(bookStorylets())
    await acceptChapterQuest(suggestion)
    const [session] = useImageRevealStore.getState().activeSessions
    expect(session.progressSource).toBe('storylet')
    expect(session.wordGoal).toBe(600)
    expect(useProgressionStore.getState().tracked[session.id]).toEqual({ kind: 'storylet', storyletId: 's1', bookId: 'book-1', startWords: 2400 })
    const quests = useWriteathonStore.getState().activeBoardQuests
    expect(quests).toHaveLength(1)
    expect(quests[0].type).toBe('chapter')
    expect(activeChapterStoryletIds(quests)).toEqual(new Set(['s1']))
  })

  it('starts a revision quest measured on revised words', async () => {
    await acceptRevisionQuest({ wordGoal: 500, title: 'Revise 500 words', coinReward: 75 })
    const [session] = useImageRevealStore.getState().activeSessions
    expect(session.progressSource).toBe('revision')
    expect(useWriteathonStore.getState().activeBoardQuests[0]).toMatchObject({ type: 'revision', coinReward: 75 })
  })
})

function bookStorylets() {
  return makeBook([makeStorylet('s1', words(2400), { name: 'Seven' })]).storylets
}

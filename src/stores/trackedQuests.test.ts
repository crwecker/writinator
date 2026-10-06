import { beforeEach, describe, expect, it } from 'vitest'
import { useImageRevealStore } from './imageRevealStore'
import { usePlayerStore } from './playerStore'

beforeEach(() => {
  useImageRevealStore.setState(useImageRevealStore.getInitialState(), true)
  usePlayerStore.setState(usePlayerStore.getInitialState(), true)
})

describe('quests with their own progress source', () => {
  it('records the progress source on the session', () => {
    const id = useImageRevealStore.getState().startSession('u', 1, 1, 100, undefined, undefined, undefined, undefined, 'Ch', { progressSource: 'storylet' })
    expect(useImageRevealStore.getState().activeSessions.find((s) => s.id === id)?.progressSource).toBe('storylet')
  })

  it('does not advance chapter or revision quests on general typing', () => {
    const store = useImageRevealStore.getState()
    const plain = store.startSession('u1', 1, 1, 100)
    const chapter = store.startSession('u2', 1, 1, 100, undefined, undefined, undefined, undefined, 'Ch', { progressSource: 'storylet' })
    const revision = store.startSession('u3', 1, 1, 100, undefined, undefined, undefined, undefined, 'Rev', { progressSource: 'revision' })
    useImageRevealStore.getState().addWords(30)
    const words = (id: string) => useImageRevealStore.getState().activeSessions.find((s) => s.id === id)?.wordsWritten
    expect(words(plain)).toBe(30)
    expect(words(chapter)).toBe(0)
    expect(words(revision)).toBe(0)
    useImageRevealStore.getState().creditWords(chapter, 40)
    expect(words(chapter)).toBe(40)
  })
})

describe('tracked quests in book files', () => {
  it('keep their progress source and board-quest type through save and open', async () => {
    const { buildWritinatorFile, parseFileJSON } = await import('../lib/fileSystem')
    const { hydrateImageReveal } = await import('./imageRevealStore')
    const { hydrateWriteathon, useWriteathonStore } = await import('./writeathonStore')
    const { createBoardQuest } = await import('../lib/writeathon')
    const { makeBook, makeStorylet } = await import('../test/fixtures')

    useWriteathonStore.setState(useWriteathonStore.getInitialState(), true)
    const id = useImageRevealStore.getState().startSession('u', 1, 1, 100, undefined, undefined, undefined, undefined, 'Ch', { progressSource: 'storylet' })
    useWriteathonStore.getState().acceptBoardQuest({ ...createBoardQuest('chapter', 100), id: 'chapter:a:1000' }, id)

    const file = await buildWritinatorFile(makeBook([makeStorylet('a', 'x')]), {}, 1)
    const reopened = parseFileJSON(JSON.stringify(file))
    useImageRevealStore.setState(useImageRevealStore.getInitialState(), true)
    useWriteathonStore.setState(useWriteathonStore.getInitialState(), true)
    hydrateImageReveal(reopened!.quests)
    hydrateWriteathon(reopened!.writeathon)

    expect(useImageRevealStore.getState().activeSessions[0].progressSource).toBe('storylet')
    expect(useWriteathonStore.getState().activeBoardQuests[0]).toMatchObject({ type: 'chapter', id: 'chapter:a:1000' })
  })
})

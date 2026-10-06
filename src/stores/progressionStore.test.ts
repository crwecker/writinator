import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  BOOK_FINISHED_BONUS,
  FIRST_PUBLISH_BONUS,
  installProgression,
  noteImageSource,
  progressionReady,
  recordRevisedChars,
  trackQuestSession,
  useProgressionStore,
} from './progressionStore'
import { useStreakStore } from './streakStore'
import { useMetricsStore } from './metricsStore'
import { usePlayerStore } from './playerStore'
import { useImageRevealStore } from './imageRevealStore'
import { useGameSettingsStore } from './gameSettingsStore'
import { useStoryletStore } from './storyletStore'
import { useWriteathonStore } from './writeathonStore'
import { addToast } from '../components/quests/rewardToastStore'
import { resetStreakStore } from '../test/habitFixtures'
import { makeSession } from '../test/questFixtures'
import { makeBook, makeStorylet, seedStore } from '../test/fixtures'
import { GALLERY_SET_BONUS, GALLERY_SET_SIZE } from '../lib/gallerySets'
import { levelInfo } from '../lib/progression'

vi.mock('../components/quests/rewardToastStore', () => ({ addToast: vi.fn() }))

const at = (day: number, hour = 12) => new Date(2026, 9, day, hour).getTime()
const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ')

function write(n: number, day = 6, hour = 12) {
  useMetricsStore.getState().recordDelta(0, n, at(day, hour))
}

function resetProgression(extra: Partial<ReturnType<typeof useProgressionStore.getState>> = {}) {
  useProgressionStore.setState({ ...useProgressionStore.getInitialState(), _hasHydrated: true, seeded: true, ...extra }, true)
}

let uninstall: () => void = () => {}

async function install() {
  uninstall = installProgression()
  await progressionReady()
}

beforeEach(async () => {
  resetStreakStore()
  useMetricsStore.setState({ dayBuckets: {}, session: null })
  usePlayerStore.setState(usePlayerStore.getInitialState(), true)
  useImageRevealStore.setState(useImageRevealStore.getInitialState(), true)
  useGameSettingsStore.setState(useGameSettingsStore.getInitialState(), true)
  useWriteathonStore.setState(useWriteathonStore.getInitialState(), true)
  seedStore(makeBook([makeStorylet('a', words(100), { name: 'Chapter One' }), makeStorylet('b', words(50))]), 'a')
  vi.mocked(addToast).mockReset()
  resetProgression()
  await install()
})

afterEach(() => {
  uninstall()
})

const coins = () => usePlayerStore.getState().coins
const p = () => useProgressionStore.getState()

describe('author level', () => {
  it('celebrates a level-up from live writing with coins and a toast', () => {
    write(300)
    expect(p().celebratedLevel).toBe(2)
    expect(addToast).toHaveBeenCalledWith(30, expect.stringContaining('Level 2'))
    expect(coins()).toBeGreaterThanOrEqual(30)
  })

  it('pays but stays quiet in quiet mode', () => {
    useGameSettingsStore.getState().setQuietMode(true)
    write(300)
    expect(p().celebratedLevel).toBe(2)
    expect(coins()).toBeGreaterThanOrEqual(30)
    expect(addToast).not.toHaveBeenCalled()
  })

  it('absorbs merged book history silently', () => {
    useStreakStore.getState().mergeHistory({ '2026-01-01': { gross: 20_000, net: 20_000, minutesActive: 1, lastMinuteIndex: null } }, at(6))
    expect(p().celebratedLevel).toBe(levelInfo(20_000).level)
    expect(p().unlocked['words-10k']).toBeDefined()
    expect(coins()).toBe(0)
    expect(addToast).not.toHaveBeenCalled()
  })
})

describe('achievements from live events', () => {
  it('unlocks with a coin reward and a toast', () => {
    write(150)
    expect(p().unlocked['words-100']).toBeDefined()
    expect(addToast).toHaveBeenCalledWith(10, expect.stringContaining('First Ink'))
  })

  it('notices early writing and a comeback after two weeks away', () => {
    resetProgression({ lastWriteDay: '2026-09-15' })
    write(20, 6, 5)
    expect(p().feats.earlyBird).toBe(1)
    expect(p().feats.comebacks).toBe(1)
    expect(p().unlocked['comeback']).toBeDefined()
  })

  it('notices writing after midnight', () => {
    write(20, 6, 1)
    expect(p().feats.nightOwl).toBe(1)
  })
})

describe('gallery sets', () => {
  it('records reveals by picture source and completes a set once', () => {
    const sessions = Array.from({ length: GALLERY_SET_SIZE }, (_, i) =>
      makeSession(`s${i}`, { imageUrl: `https://images.unsplash.com/${i}`, wordGoal: 10 }),
    )
    for (const s of sessions) noteImageSource(s.imageUrl, 'ocean')
    useImageRevealStore.setState({ activeSessions: sessions })
    const before = coins()
    useImageRevealStore.getState().addWords(10)
    expect(p().reveals).toHaveLength(GALLERY_SET_SIZE)
    expect(p().reveals.every((r) => r.source === 'ocean')).toBe(true)
    expect(p().completedSets.ocean).toBeDefined()
    expect(coins() - before).toBeGreaterThanOrEqual(GALLERY_SET_BONUS)
    expect(addToast).toHaveBeenCalledWith(GALLERY_SET_BONUS, expect.stringContaining('Ocean'))
  })

  it('ignores sessions that arrive with an opened book file', () => {
    useImageRevealStore.setState({ completedSessions: [makeSession('old', { completed: true, result: 'success' })] })
    expect(p().reveals).toHaveLength(0)
  })
})

describe('chapter quests', () => {
  it('progress on the storylet word count, without double-counting retyped words', () => {
    const id = useImageRevealStore.getState().startSession('u', 1, 1, 50, undefined, undefined, undefined, undefined, 'Grow', { progressSource: 'storylet' })
    trackQuestSession(id, { kind: 'storylet', storyletId: 'a', bookId: 'book-1', startWords: 100 })
    const progress = () => useImageRevealStore.getState().activeSessions.find((s) => s.id === id)?.wordsWritten
    useStoryletStore.getState().setStoryletContent('a', words(130))
    expect(progress()).toBe(30)
    useStoryletStore.getState().setStoryletContent('a', words(110))
    useStoryletStore.getState().setStoryletContent('a', words(130))
    expect(progress()).toBe(30)
    // Typing in another storylet doesn't count.
    useStoryletStore.getState().setStoryletContent('b', words(500))
    expect(progress()).toBe(30)
    useStoryletStore.getState().setStoryletContent('a', words(160))
    expect(useImageRevealStore.getState().activeSessions.find((s) => s.id === id)).toBeUndefined()
    expect(p().reveals.at(-1)?.tracking).toBe('storylet')
    expect(p().unlocked['chapter-quest']).toBeDefined()
  })
})

describe('revision quests', () => {
  it('progress on revised words only', () => {
    const id = useImageRevealStore.getState().startSession('u', 1, 1, 10, undefined, undefined, undefined, undefined, 'Revise', { progressSource: 'revision' })
    recordRevisedChars(30, at(6))
    expect(p().revisedWords).toBe(5)
    expect(useImageRevealStore.getState().activeSessions.find((s) => s.id === id)?.wordsWritten).toBe(5)
    recordRevisedChars(31, at(6))
    expect(p().revisedWords).toBe(10)
    expect(useImageRevealStore.getState().activeSessions.find((s) => s.id === id)).toBeUndefined()
    expect(p().revisedByDay['2026-10-06']).toBe(10)
  })
})

describe('publishing', () => {
  const meta = (n: number) => ({ lastPublishedAt: `2026-10-06T0${n}:00:00.000Z`, lastPublishedSnapshotId: `snap-${n}` })

  it('pays a bonus the first time a storylet is published, once', () => {
    useStoryletStore.getState().setStoryletPublishedMeta('a', meta(1))
    expect(addToast).toHaveBeenCalledWith(FIRST_PUBLISH_BONUS, expect.stringContaining('Chapter One'))
    expect(p().unlocked['first-publish']).toBeDefined()
    const after = coins()
    useStoryletStore.getState().setStoryletPublishedMeta('a', meta(2))
    expect(coins()).toBe(after)
  })

  it('pays a bigger bonus when every storylet is published', () => {
    useStoryletStore.getState().setStoryletPublishedMeta('a', meta(1))
    vi.mocked(addToast).mockReset()
    useStoryletStore.getState().setStoryletPublishedMeta('b', meta(2))
    expect(addToast).toHaveBeenCalledWith(BOOK_FINISHED_BONUS, expect.stringContaining('Test Book'))
    expect(p().finishedBooks['book:book-1']).toBeDefined()
  })

  it('pays the book bonus when a writeathon completes', () => {
    useWriteathonStore.setState({ config: { id: 'w1', startDate: '', startingWordCount: 0, targetWordCount: 10, totalBlocks: 1, wordsPerBlock: 10, active: true } })
    useWriteathonStore.setState({ config: { id: 'w1', startDate: '', startingWordCount: 0, targetWordCount: 10, totalBlocks: 1, wordsPerBlock: 10, active: true, completedAt: '2026-10-06' } })
    expect(p().finishedBooks['writeathon:w1']).toBeDefined()
    expect(addToast).toHaveBeenCalledWith(BOOK_FINISHED_BONUS, expect.any(String))
  })
})

describe('first run', () => {
  it('seeds silently from existing history', async () => {
    uninstall()
    useStreakStore.setState({ dailyWords: { '2026-09-01': 12_000 } })
    useImageRevealStore.setState({
      completedSessions: [
        makeSession('x', { completed: true, result: 'success' }),
        makeSession('y', { completed: true, result: 'abandoned' }),
      ],
    })
    resetProgression({ seeded: false })
    await install()
    expect(p().seeded).toBe(true)
    expect(p().reveals.map((r) => r.id)).toEqual(['x'])
    expect(p().celebratedLevel).toBe(levelInfo(12_000).level)
    expect(p().unlocked['words-10k']).toBeDefined()
    expect(p().lastWriteDay).toBe('2026-09-01')
    expect(coins()).toBe(0)
    expect(addToast).not.toHaveBeenCalled()
  })
})

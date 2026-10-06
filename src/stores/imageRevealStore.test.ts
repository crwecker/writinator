import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { onQuestProgress, useImageRevealStore, type QuestProgressEvent } from './imageRevealStore'
import { usePlayerStore } from './playerStore'
import { useWriteathonStore } from './writeathonStore'
import { acceptBoardQuest } from '../components/quests/useAcceptQuest'
import { createBoardQuest } from '../lib/writeathon'
import { calculateBaseReward, estimateQuestCoins } from '../lib/questRewards'
import { getWeaponMultiplier } from '../lib/items'
import { makeSession } from '../test/questFixtures'

vi.mock('../lib/unsplash', () => ({
  fetchRandomImage: vi.fn(() => Promise.reject(new Error('offline'))),
  loadImage: vi.fn(() => new Promise(() => {})),
}))

function equip(weapon: string, armor: string) {
  usePlayerStore.setState({
    ownedItems: ['wooden-pencil', 'cloth-tunic', weapon, armor],
    equippedWeapon: weapon,
    equippedArmor: armor,
  })
}

beforeEach(() => {
  useImageRevealStore.setState(useImageRevealStore.getInitialState(), true)
  usePlayerStore.setState(usePlayerStore.getInitialState(), true)
  useWriteathonStore.setState({ activeBoardQuests: [], villagerQuests: [] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('gear boosts coins only', () => {
  it('a strong weapon does not speed up quest progress', () => {
    equip('celestial-stylus', 'cloth-tunic')
    useImageRevealStore.setState({ activeSessions: [makeSession('a', { wordGoal: 100 })] })
    useImageRevealStore.getState().addWords(40)
    expect(useImageRevealStore.getState().activeSessions[0].wordsWritten).toBe(40)
  })

  it('a 100-word quest needs 100 real words, but the weapon raises its coins', () => {
    equip('celestial-stylus', 'cloth-tunic')
    useImageRevealStore.setState({ activeSessions: [makeSession('a', { wordGoal: 100 })] })
    useImageRevealStore.getState().addWords(60)
    expect(useImageRevealStore.getState().activeSessions).toHaveLength(1)
    useImageRevealStore.getState().addWords(40)
    const done = useImageRevealStore.getState().completedSessions[0]
    expect(done.result).toBe('success')
    expect(done.coinsEarned).toBe(calculateBaseReward(100, 2))
  })
})

describe('Word Burst: next 50 words earn double coins', () => {
  it('does not double word progress', () => {
    useImageRevealStore.setState({
      activeSessions: [makeSession('a', { wordGoal: 100 })],
      activeEffects: [{ type: 'wordBurst', remainingValue: 50 }],
    })
    useImageRevealStore.getState().addWords(30)
    expect(useImageRevealStore.getState().activeSessions[0].wordsWritten).toBe(30)
    expect(useImageRevealStore.getState().activeEffects).toEqual([{ type: 'wordBurst', remainingValue: 20 }])
  })

  it('pays the coin share of burst words a second time', () => {
    // 500-word untimed quest pays 50; 50 of its words were burst words → +5.
    useImageRevealStore.setState({
      activeSessions: [makeSession('a', { wordGoal: 500 })],
      activeEffects: [{ type: 'wordBurst', remainingValue: 50 }],
    })
    useImageRevealStore.getState().addWords(80)
    useImageRevealStore.getState().addWords(420)
    expect(useImageRevealStore.getState().completedSessions[0].coinsEarned).toBe(55)
    expect(usePlayerStore.getState().coins).toBe(55)
    expect(useImageRevealStore.getState().activeEffects).toEqual([])
  })

  it('is not wiped while only untimed quests are running', () => {
    useImageRevealStore.setState({
      activeSessions: [makeSession('a', { wordGoal: 500 })],
      activeEffects: [{ type: 'wordBurst', remainingValue: 50 }],
    })
    useImageRevealStore.getState().addWords(10)
    expect(useImageRevealStore.getState().activeEffects).toEqual([{ type: 'wordBurst', remainingValue: 40 }])
  })
})

describe('timed quest payout matches the board estimate (end to end)', () => {
  async function runTimedQuest(finishAfterFraction: number): Promise<{ paid: number; estimate: { min: number; max: number } }> {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-05-01T10:00:00Z'))
    equip('phoenix-feather-pen', 'time-shield')
    const minutes = 20
    const quest = createBoardQuest('permanent', 500, { title: 'Steady March', coinReward: 50, timeMinutes: minutes })
    const estimate = estimateQuestCoins({
      wordGoal: 500,
      questCoins: 50,
      weaponMultiplier: getWeaponMultiplier('phoenix-feather-pen'),
      timeMinutes: minutes,
    })
    await acceptBoardQuest(quest)
    const session = useImageRevealStore.getState().activeSessions[0]
    expect(session.timeMinutes).toBeCloseTo(25) // Time Shield +25%
    const before = usePlayerStore.getState().coins
    vi.setSystemTime(Date.now() + session.timeMinutes! * 60_000 * finishAfterFraction)
    useImageRevealStore.getState().addWords(500)
    expect(useImageRevealStore.getState().completedSessions[0]?.result).toBe('success')
    return { paid: usePlayerStore.getState().coins - before, estimate }
  }

  it('finishing instantly pays the top of the range', async () => {
    const { paid, estimate } = await runTimedQuest(0)
    expect(paid).toBe(estimate.max)
  })

  it('finishing at the buzzer pays the bottom of the range', async () => {
    const { paid, estimate } = await runTimedQuest(1)
    expect(paid).toBe(estimate.min)
  })
})

describe('startSession bookkeeping', () => {
  it('records the chosen minutes and the board reward', () => {
    equip('wooden-pencil', 'time-shield')
    const id = useImageRevealStore.getState().startSession('u', 1, 1, 500, undefined, undefined, undefined, 20, 'T', { boardCoins: 50 })
    const s = useImageRevealStore.getState().activeSessions.find((x) => x.id === id)
    expect(s?.baseTimeMinutes).toBe(20)
    expect(s?.boardCoins).toBe(50)
  })

  it('creditWords adds words to one session only', () => {
    useImageRevealStore.setState({ activeSessions: [makeSession('a'), makeSession('b')] })
    useImageRevealStore.getState().creditWords('b', 12)
    const [a, b] = useImageRevealStore.getState().activeSessions
    expect(a.wordsWritten).toBe(0)
    expect(b.wordsWritten).toBe(12)
  })
})

describe('onQuestProgress', () => {
  it('reports counted words, coins earned and quests finished', () => {
    const events: QuestProgressEvent[] = []
    const off = onQuestProgress((e) => events.push(e))
    useImageRevealStore.setState({ activeSessions: [makeSession('a', { wordGoal: 100 })] })
    useImageRevealStore.getState().addWords(30)
    useImageRevealStore.getState().addWords(70)
    off()
    useImageRevealStore.getState().addWords(5)
    expect(events).toEqual([
      { words: 30, coins: 0, finished: 0 },
      { words: 70, coins: 10, finished: 1 },
    ])
  })

  it('reports words even when no quest is running', () => {
    const events: QuestProgressEvent[] = []
    const off = onQuestProgress((e) => events.push(e))
    useImageRevealStore.getState().addWords(7)
    off()
    expect(events).toEqual([{ words: 7, coins: 0, finished: 0 }])
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { hydrateWriteathon, serializeWriteathon, useWriteathonStore } from './writeathonStore'
import { createMilestones } from '../lib/writeathon'
import { localforageMemory } from '../test/setup'
import { useImageRevealStore } from './imageRevealStore'
import { usePlayerStore } from './playerStore'
import type { BoardQuest } from '../types'

function makeQuest(id: string): BoardQuest {
  return {
    id,
    title: `Quest ${id}`,
    description: '',
    type: 'villager',
    wordGoal: 100,
    coinReward: 500,
    accepted: false,
    createdAt: '2026-01-01T00:00:00.000Z',
  }
}

function acceptQuest(questId: string, timeMinutes?: number): string {
  const sessionId = useImageRevealStore
    .getState()
    .startSession('https://img', 10, 10, 100, undefined, undefined, undefined, timeMinutes)
  useWriteathonStore.getState().acceptBoardQuest(makeQuest(questId), sessionId)
  return sessionId
}

afterEach(() => {
  vi.useRealTimers()
})

beforeEach(() => {
  useWriteathonStore.setState(useWriteathonStore.getInitialState(), true)
  useImageRevealStore.setState(useImageRevealStore.getInitialState(), true)
  usePlayerStore.setState(usePlayerStore.getInitialState(), true)
})

describe('board quest settlement', () => {
  it('pays the reward when the linked session succeeds', () => {
    acceptQuest('q1')
    useImageRevealStore.getState().addWords(100)
    expect(useWriteathonStore.getState().activeBoardQuests).toHaveLength(0)
    // 500 board reward + whatever the image reveal itself paid
    const sessionCoins = useImageRevealStore.getState().completedSessions[0].coinsEarned ?? 0
    expect(usePlayerStore.getState().coins).toBe(500 + sessionCoins)
  })

  it('ends the quest without reward when the session is abandoned', () => {
    const sessionId = acceptQuest('q1')
    useImageRevealStore.getState().abandonSession(sessionId)
    expect(useWriteathonStore.getState().activeBoardQuests).toHaveLength(0)
    expect(usePlayerStore.getState().coins).toBe(0)
  })

  it('ends the quest without reward when the timed session fails', () => {
    const sessionId = acceptQuest('q1', 10)
    useImageRevealStore.getState().failSession(sessionId)
    expect(useWriteathonStore.getState().activeBoardQuests).toHaveLength(0)
    expect(usePlayerStore.getState().coins).toBe(0)
  })

  it('ends every quest without reward on abandonAllSessions', () => {
    acceptQuest('q1')
    acceptQuest('q2')
    useImageRevealStore.getState().abandonAllSessions()
    expect(useWriteathonStore.getState().activeBoardQuests).toHaveLength(0)
    expect(usePlayerStore.getState().coins).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Calendar-day writeathons
// ---------------------------------------------------------------------------

const day = (d: number, hour = 12) => new Date(2026, 9, d, hour).getTime()

function start(startWords = 1000, target = 11_000, days = 10, now = day(6, 9)) {
  useWriteathonStore.getState().startWriteathon(startWords, target, days, now)
}

describe('calendar writeathon', () => {
  it('gives each day a real date starting today', () => {
    start()
    const { milestones } = useWriteathonStore.getState()
    expect(milestones.map((m) => m.date).slice(0, 3)).toEqual(['2026-10-06', '2026-10-07', '2026-10-08'])
    expect(milestones.at(-1)?.date).toBe('2026-10-15')
  })

  it('pays a date when its target is met, once', () => {
    start()
    const { updateProgress } = useWriteathonStore.getState()
    updateProgress(1999, day(6, 10))
    expect(usePlayerStore.getState().coins).toBe(0)
    updateProgress(2000, day(6, 11))
    const reward = useWriteathonStore.getState().milestones[0].coinsAwarded
    expect(usePlayerStore.getState().coins).toBe(reward)
    updateProgress(2600, day(6, 12))
    expect(usePlayerStore.getState().coins).toBe(reward)
    expect(useWriteathonStore.getState().milestones[0].completed).toBe(true)
  })

  it('freezes the day’s target so writing does not move it', () => {
    start()
    const { updateProgress } = useWriteathonStore.getState()
    updateProgress(1500, day(6, 10))
    expect(useWriteathonStore.getState().milestones[0].dayTarget).toBe(1000)
    expect(useWriteathonStore.getState().milestones[0].dayStartWordCount).toBe(1000)
  })

  it('a missed date pays nothing and the shortfall spreads over the dates left', () => {
    start()
    const { updateProgress } = useWriteathonStore.getState()
    updateProgress(1200, day(6, 10)) // short of 1000 today
    updateProgress(1250, day(7, 10)) // first update tomorrow: 50 of them written tomorrow
    const s = useWriteathonStore.getState()
    expect(s.milestones[0].completed).toBe(false)
    expect(s.milestones[1].dayStartWordCount).toBe(1200)
    expect(s.milestones[1].dayTarget).toBe(Math.ceil((11_000 - 1200) / 9))
    expect(usePlayerStore.getState().coins).toBe(0)
    expect(s.getDailyTarget(day(7, 11))).toBe(Math.ceil((11_000 - 1200) / 9))
  })

  it('completes when the book reaches the goal and pays today', () => {
    start(1000, 3000, 2)
    useWriteathonStore.getState().updateProgress(3100, day(6, 10))
    const s = useWriteathonStore.getState()
    expect(s.config?.completedAt).toBeDefined()
    expect(s.milestones[0].completed).toBe(true)
  })

  it('pays nothing while paused', () => {
    start()
    useWriteathonStore.getState().pauseWriteathon()
    useWriteathonStore.getState().updateProgress(5000, day(6, 10))
    expect(usePlayerStore.getState().coins).toBe(0)
    expect(useWriteathonStore.getState().milestones[0].completed).toBe(false)
  })

  it('migrates an in-progress checkpoint writeathon from a book file', () => {
    vi.setSystemTime(day(6, 9))
    const milestones = createMilestones(1000, 500, 24).map((m, i) => (i < 3 ? { ...m, completed: true } : m))
    hydrateWriteathon({
      config: {
        id: 'old',
        startDate: '2026-01-01T00:00:00.000Z',
        startingWordCount: 1000,
        targetWordCount: 13_000,
        totalBlocks: 24,
        wordsPerBlock: 500,
        active: true,
      },
      milestones,
      villagerQuests: [],
      activeBoardQuests: [],
      dailyQuestAccepted: false,
    })
    const s = useWriteathonStore.getState()
    expect(s.milestones[3].date).toBe('2026-10-06')
    expect(s.getCurrentBlock(day(6, 10))).toBe(4)
    expect(serializeWriteathon().model).toBe(2)
  })

  it('migrates persisted v1 state on rehydrate', async () => {
    vi.setSystemTime(day(6, 9))
    const milestones = createMilestones(1000, 500, 4).map((m, i) => (i < 1 ? { ...m, completed: true } : m))
    localforageMemory.set(
      'writinator-writeathon',
      JSON.stringify({
        state: {
          config: {
            id: 'old',
            startDate: '2026-01-01T00:00:00.000Z',
            startingWordCount: 1000,
            targetWordCount: 3000,
            totalBlocks: 4,
            wordsPerBlock: 500,
            active: true,
          },
          milestones,
          villagerQuests: [],
          activeBoardQuests: [],
          dailyQuestAccepted: false,
        },
        version: 1,
      }),
    )
    await useWriteathonStore.persist.rehydrate()
    const s = useWriteathonStore.getState()
    expect(s.milestones.map((m) => m.date)).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'])
    expect(s.milestones[0].completed).toBe(true)
  })
})

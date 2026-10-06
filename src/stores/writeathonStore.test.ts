import { beforeEach, describe, expect, it } from 'vitest'
import { useWriteathonStore } from './writeathonStore'
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

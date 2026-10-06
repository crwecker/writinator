import { describe, expect, it } from 'vitest'
import {
  calculateQuestReward,
  calculateDifficulty,
  estimateQuestCoins,
  estimateSessionCoins,
  sessionDifficulty,
  TIMED_REWARD_MULTIPLIER,
} from './questRewards'

describe('estimateQuestCoins', () => {
  it('untimed: quest reward + bonus + session base reward', () => {
    expect(estimateQuestCoins({ wordGoal: 500, questCoins: 50, bonusCoins: 10, weaponMultiplier: 1.15 })).toEqual({
      min: 50 + 10 + 57,
      max: 50 + 10 + 57,
    })
  })

  it('timed: range matches what the session actually pays at the buzzer and instantly', () => {
    const goal = 500
    const minutes = 20
    const difficulty = calculateDifficulty(goal, minutes)
    const board = 50
    const atBuzzer = calculateQuestReward({ wordGoal: goal, wordsWritten: goal, weaponMultiplier: 1, timeMinutes: minutes, timeUsedSeconds: minutes * 60, difficulty, boardCoins: board })
    const instant = calculateQuestReward({ wordGoal: goal, wordsWritten: goal, weaponMultiplier: 1, timeMinutes: minutes, timeUsedSeconds: 0, difficulty, boardCoins: board })
    expect(estimateQuestCoins({ wordGoal: goal, questCoins: board, weaponMultiplier: 1, timeMinutes: minutes })).toEqual({
      min: board + atBuzzer,
      max: board + instant,
    })
  })
})

describe('timed rewards', () => {
  it('pay 1.5×/2×/2.5×/3× the untimed reward by difficulty', () => {
    expect(TIMED_REWARD_MULTIPLIER).toEqual({ easy: 1.5, medium: 2, hard: 2.5, epic: 3 })
  })

  it.each([
    [500, 60, 'easy', 1.5],
    [500, 25, 'medium', 2],
    [500, 15, 'hard', 2.5],
    [500, 10, 'epic', 3],
  ] as const)('%i words in %i min (%s): buzzer pays the multiple, instant at most +20%', (goal, minutes, difficulty, mult) => {
    expect(calculateDifficulty(goal, minutes)).toBe(difficulty)
    const untimed = estimateQuestCoins({ wordGoal: goal, questCoins: 50, weaponMultiplier: 1.25 })
    const timed = estimateQuestCoins({ wordGoal: goal, questCoins: 50, weaponMultiplier: 1.25, timeMinutes: minutes })
    expect(timed.min).toBe(Math.floor(untimed.min * mult))
    expect(timed.max).toBe(Math.floor(untimed.min * mult * 1.2))
  })

  it('a quest without a board reward still pays the multiplied session reward', () => {
    const paid = calculateQuestReward({ wordGoal: 500, wordsWritten: 500, weaponMultiplier: 1, timeMinutes: 25, timeUsedSeconds: 25 * 60, difficulty: 'medium' })
    expect(paid).toBe(100)
  })
})

describe('sessionDifficulty', () => {
  it('uses the minutes the writer chose, not the armor-extended timer', () => {
    // 500 words in 20 min is hard; Time Shield (+25%) stretches the clock to 25 min (medium pace).
    expect(sessionDifficulty({ wordGoal: 500, timeMinutes: 25, baseTimeMinutes: 20 })).toBe('hard')
  })

  it('falls back to the session timer for older sessions', () => {
    expect(sessionDifficulty({ wordGoal: 500, timeMinutes: 25 })).toBe('medium')
  })
})

describe('estimateSessionCoins', () => {
  it('estimates a running quest from the chosen minutes and its board reward, matching the board card', () => {
    const running = { wordGoal: 500, timeMinutes: 25, baseTimeMinutes: 20, boardCoins: 50 }
    expect(estimateSessionCoins(running, 1.25)).toEqual(
      estimateQuestCoins({ wordGoal: 500, questCoins: 50, weaponMultiplier: 1.25, timeMinutes: 20 }),
    )
  })
})

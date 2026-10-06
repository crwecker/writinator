import { describe, expect, it } from 'vitest'
import { calculateQuestReward, calculateDifficulty, estimateQuestCoins } from './questRewards'

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
    const atBuzzer = calculateQuestReward({ wordGoal: goal, wordsWritten: goal, weaponMultiplier: 1, timeMinutes: minutes, timeUsedSeconds: minutes * 60, difficulty })
    const instant = calculateQuestReward({ wordGoal: goal, wordsWritten: goal, weaponMultiplier: 1, timeMinutes: minutes, timeUsedSeconds: 0, difficulty })
    expect(estimateQuestCoins({ wordGoal: goal, questCoins: 50, weaponMultiplier: 1, timeMinutes: minutes })).toEqual({
      min: 50 + atBuzzer,
      max: 50 + instant,
    })
  })
})

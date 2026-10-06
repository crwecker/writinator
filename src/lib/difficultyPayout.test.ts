import { beforeEach, describe, expect, it } from 'vitest'
import {
  calculateDifficulty,
  calculateQuestReward,
  estimateQuestCoins,
  scaleCoins,
} from './questRewards'
import { DIFFICULTY_PRESETS, currentPayoutMultiplier, useGameSettingsStore, type DifficultyPreset } from '../stores/gameSettingsStore'
import { useWriteathonStore } from '../stores/writeathonStore'
import { usePlayerStore } from '../stores/playerStore'

beforeEach(() => {
  useGameSettingsStore.setState(useGameSettingsStore.getInitialState(), true)
})

/** What a quest actually pays: the board quest's reward (paid by the writeathon store) + the session's coins. */
function actualPaid(opts: { goal: number; board: number; weapon: number; minutes?: number; usedSeconds?: number }): number {
  const boardPaid = scaleCoins(opts.board)
  const session =
    opts.minutes === undefined
      ? calculateQuestReward({ wordGoal: opts.goal, wordsWritten: opts.goal, weaponMultiplier: opts.weapon, boardCoins: opts.board })
      : calculateQuestReward({
          wordGoal: opts.goal,
          wordsWritten: opts.goal,
          weaponMultiplier: opts.weapon,
          timeMinutes: opts.minutes,
          timeUsedSeconds: opts.usedSeconds ?? 0,
          difficulty: calculateDifficulty(opts.goal, opts.minutes),
          boardCoins: opts.board,
        })
  return boardPaid + session
}

describe('difficulty presets', () => {
  it('relaxed pays 0.8×, standard 1×, hardcore 1.3×', () => {
    expect(DIFFICULTY_PRESETS.relaxed.payoutMultiplier).toBe(0.8)
    expect(DIFFICULTY_PRESETS.standard.payoutMultiplier).toBe(1)
    expect(DIFFICULTY_PRESETS.hardcore.payoutMultiplier).toBe(1.3)
  })

  it('choosing a preset sets the session goal, timer default and multiplier together', () => {
    useGameSettingsStore.getState().setDifficulty('hardcore')
    const s = useGameSettingsStore.getState()
    expect(s.difficulty).toBe('hardcore')
    expect(s.autoQuest.wordGoal).toBe(DIFFICULTY_PRESETS.hardcore.sessionGoal)
    expect(s.defaultTimerMinutes).toBe(DIFFICULTY_PRESETS.hardcore.timerMinutes)
    expect(currentPayoutMultiplier()).toBe(1.3)
    expect(DIFFICULTY_PRESETS.relaxed.sessionGoal).toBeLessThan(DIFFICULTY_PRESETS.standard.sessionGoal)
    expect(DIFFICULTY_PRESETS.hardcore.sessionGoal).toBeGreaterThan(DIFFICULTY_PRESETS.standard.sessionGoal)
  })

  it('defaults to standard', () => {
    expect(useGameSettingsStore.getState().difficulty).toBe('standard')
    expect(currentPayoutMultiplier()).toBe(1)
  })
})

describe('payout multiplier parity', () => {
  const cases: Array<{ preset: DifficultyPreset; goal: number; board: number; weapon: number; minutes?: number }> = [
    { preset: 'relaxed', goal: 500, board: 50, weapon: 1.15 },
    { preset: 'relaxed', goal: 500, board: 50, weapon: 1, minutes: 20 },
    { preset: 'relaxed', goal: 250, board: 900, weapon: 1, minutes: 30 },
    { preset: 'relaxed', goal: 250, board: 900, weapon: 1 },
    { preset: 'hardcore', goal: 1000, board: 105, weapon: 1.25 },
    { preset: 'hardcore', goal: 1000, board: 105, weapon: 1.5, minutes: 20 },
    { preset: 'hardcore', goal: 333, board: 0, weapon: 2, minutes: 10 },
  ]

  it.each(cases)('$preset: $goal words, board $board, timer $minutes — estimate equals payout', (c) => {
    useGameSettingsStore.getState().setDifficulty(c.preset)
    const est = estimateQuestCoins({ wordGoal: c.goal, questCoins: c.board, weaponMultiplier: c.weapon, timeMinutes: c.minutes })
    if (c.minutes === undefined) {
      expect(est.min).toBe(est.max)
      expect(est.min).toBe(actualPaid(c))
    } else {
      expect(est.min).toBe(actualPaid({ ...c, usedSeconds: c.minutes * 60 }))
      expect(est.max).toBe(actualPaid({ ...c, usedSeconds: 0 }))
    }
  })

  it('scales the whole reward', () => {
    const standard = estimateQuestCoins({ wordGoal: 500, questCoins: 50, weaponMultiplier: 1 }).min
    useGameSettingsStore.getState().setDifficulty('relaxed')
    expect(estimateQuestCoins({ wordGoal: 500, questCoins: 50, weaponMultiplier: 1 }).min).toBe(Math.floor(standard * 0.8))
    useGameSettingsStore.getState().setDifficulty('hardcore')
    expect(estimateQuestCoins({ wordGoal: 500, questCoins: 50, weaponMultiplier: 1 }).min).toBe(Math.floor(standard * 1.3))
  })

  it('the board quest pays its scaled reward', () => {
    useGameSettingsStore.getState().setDifficulty('hardcore')
    usePlayerStore.setState({ coins: 0 })
    useWriteathonStore.setState({
      activeBoardQuests: [
        { id: 'q1', title: 'Test', description: '', type: 'permanent', wordGoal: 500, coinReward: 50, bonusCoins: 10, accepted: true, createdAt: '' },
      ],
    })
    useWriteathonStore.getState().completeBoardQuest('q1')
    expect(usePlayerStore.getState().coins).toBe(scaleCoins(60))
    expect(usePlayerStore.getState().coins).toBe(78)
  })
})

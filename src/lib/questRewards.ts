import type { QuestDifficulty } from '../types';
import { currentPayoutMultiplier } from '../stores/gameSettingsStore';

export function calculateDifficulty(wordGoal: number, timeMinutes: number): QuestDifficulty {
  const wpm = wordGoal / timeMinutes;
  if (wpm < 15) return 'easy';
  if (wpm < 25) return 'medium';
  if (wpm < 40) return 'hard';
  return 'epic';
}

/**
 * Difficulty of a timed session, judged on the time limit the writer chose —
 * armor and Second Wind lengthen the clock but don't make the quest cheaper.
 */
export function sessionDifficulty(s: { wordGoal: number; timeMinutes: number; baseTimeMinutes?: number }): QuestDifficulty {
  return calculateDifficulty(s.wordGoal, s.baseTimeMinutes ?? s.timeMinutes)
}

/** A timed quest pays this multiple of the same quest's untimed reward. */
export const TIMED_REWARD_MULTIPLIER: Record<QuestDifficulty, number> = {
  easy: 1.5,
  medium: 2,
  hard: 2.5,
  epic: 3,
}

/** Finishing instantly adds this much on top; finishing at the buzzer adds nothing. */
export const MAX_SPEED_BONUS = 0.2

/** Speed bonus (0 … MAX_SPEED_BONUS) for the share of the timer left unused. */
export function calculateSpeedBonus(timeMinutes: number, timeUsedSeconds: number): number {
  const totalSeconds = timeMinutes * 60
  const remaining = totalSeconds - timeUsedSeconds
  return remaining > 0 && totalSeconds > 0 ? (remaining / totalSeconds) * MAX_SPEED_BONUS : 0
}

/** Everything a completed timed quest pays, given what the untimed quest would. */
function timedTotal(untimedTotal: number, difficulty: QuestDifficulty, speedBonus: number): number {
  return Math.floor(untimedTotal * TIMED_REWARD_MULTIPLIER[difficulty] * (1 + speedBonus))
}

/**
 * Coins after the difficulty preset's payout multiplier (Relaxed 0.8×,
 * Hardcore 1.3×). Board rewards and session rewards are scaled separately with
 * this same function, so estimates always add up to what's paid.
 */
export function scaleCoins(coins: number, payoutMultiplier: number = currentPayoutMultiplier()): number {
  if (payoutMultiplier === 1) return coins
  // Epsilon guards against float noise like 39.99999 → 39.
  return Math.floor(coins * payoutMultiplier + 1e-9)
}

/** The image-reveal session's own reward. Gear raises coins, never word progress. */
export function calculateBaseReward(wordGoal: number, weaponMultiplier: number): number {
  return Math.floor(wordGoal * 0.1 * weaponMultiplier)
}

/**
 * Extra coins a completed timed quest pays over its untimed reward
 * (`untimedTotal` = board reward + session base reward).
 */
export function calculateTimedBonus(
  untimedTotal: number,
  difficulty: QuestDifficulty,
  timeMinutes: number,
  timeUsedSeconds: number,
): number {
  return timedTotal(untimedTotal, difficulty, calculateSpeedBonus(timeMinutes, timeUsedSeconds)) - untimedTotal
}

/**
 * Coins the image-reveal session itself pays on completion. A linked board
 * quest pays `boardCoins` separately, so for a timed quest the session pays
 * the rest of the multiplied total: (board + base) × multiplier × speed − board.
 */
export function calculateQuestReward(opts: {
  wordGoal: number
  wordsWritten: number
  weaponMultiplier: number
  timeMinutes?: number
  timeUsedSeconds?: number
  difficulty?: QuestDifficulty
  boardCoins?: number
  /** Difficulty preset multiplier; defaults to the current setting. */
  payoutMultiplier?: number
}): number {
  const m = opts.payoutMultiplier ?? currentPayoutMultiplier()
  const base = scaleCoins(calculateBaseReward(opts.wordGoal, opts.weaponMultiplier), m)
  if (
    opts.timeMinutes !== undefined &&
    opts.timeUsedSeconds !== undefined &&
    opts.difficulty !== undefined &&
    opts.wordsWritten >= opts.wordGoal
  ) {
    // The board pays its (scaled) reward itself; the session pays the rest.
    const board = scaleCoins(opts.boardCoins ?? 0, m)
    return base + calculateTimedBonus(base + board, opts.difficulty, opts.timeMinutes, opts.timeUsedSeconds)
  }
  return base
}

export function getDifficultyColor(difficulty: QuestDifficulty): string {
  switch (difficulty) {
    case 'easy':   return 'text-green-400';
    case 'medium': return 'text-yellow-400';
    case 'hard':   return 'text-orange-400';
    case 'epic':   return 'text-purple-400';
  }
}

export function getDifficultyLabel(difficulty: QuestDifficulty): string {
  switch (difficulty) {
    case 'easy':   return 'Easy';
    case 'medium': return 'Medium';
    case 'hard':   return 'Hard';
    case 'epic':   return 'Epic';
  }
}

/**
 * Coins a quest pays if completed: the quest's own reward (+ bonus) plus the
 * image-reveal session's base reward. A timed quest multiplies that total by
 * its difficulty (1.5×–3×) plus a speed bonus of up to +20%. Returns the range
 * from finishing right at the buzzer to finishing instantly. `timeMinutes` is
 * the limit the writer chose (before armor).
 */
export function estimateQuestCoins(opts: {
  wordGoal: number
  questCoins: number
  bonusCoins?: number
  weaponMultiplier: number
  timeMinutes?: number
  /** Difficulty preset multiplier; defaults to the current setting. */
  payoutMultiplier?: number
}): { min: number; max: number } {
  const m = opts.payoutMultiplier ?? currentPayoutMultiplier()
  const untimed =
    scaleCoins(opts.questCoins + (opts.bonusCoins ?? 0), m) +
    scaleCoins(calculateBaseReward(opts.wordGoal, opts.weaponMultiplier), m)
  if (opts.timeMinutes === undefined) return { min: untimed, max: untimed }
  const difficulty = calculateDifficulty(opts.wordGoal, opts.timeMinutes)
  return {
    min: timedTotal(untimed, difficulty, 0),
    max: timedTotal(untimed, difficulty, MAX_SPEED_BONUS),
  }
}

/** The coin estimate for a session already under way (board reward included). */
export function estimateSessionCoins(
  session: { wordGoal: number; timeMinutes?: number; baseTimeMinutes?: number; boardCoins?: number },
  weaponMultiplier: number,
  questCoins: number = session.boardCoins ?? 0,
): { min: number; max: number } {
  return estimateQuestCoins({
    wordGoal: session.wordGoal,
    questCoins,
    weaponMultiplier,
    timeMinutes: session.timeMinutes === undefined ? undefined : (session.baseTimeMinutes ?? session.timeMinutes),
  })
}

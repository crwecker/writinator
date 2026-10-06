import type { QuestDifficulty } from '../types';

export function calculateDifficulty(wordGoal: number, timeMinutes: number): QuestDifficulty {
  const wpm = wordGoal / timeMinutes;
  if (wpm < 15) return 'easy';
  if (wpm < 25) return 'medium';
  if (wpm < 40) return 'hard';
  return 'epic';
}

export function calculateReward(
  wordGoal: number,
  timeMinutes: number,
  wordsWritten: number,
  timeUsedSeconds: number,
  difficulty: QuestDifficulty,
): number {
  if (wordsWritten < wordGoal) return 0;

  const multiplierMap: Record<QuestDifficulty, number> = {
    easy: 1.0,
    medium: 1.5,
    hard: 2.0,
    epic: 3.0,
  };

  const base = wordGoal;
  const difficultyMultiplier = multiplierMap[difficulty];
  const completionRatio = Math.min(wordsWritten / wordGoal, 1.0);

  const totalTimeSeconds = timeMinutes * 60;
  const timeRemainingSeconds = totalTimeSeconds - timeUsedSeconds;
  const speedBonus =
    timeRemainingSeconds > 0 ? (timeRemainingSeconds / totalTimeSeconds) * 0.5 : 0;

  return Math.floor(base * difficultyMultiplier * completionRatio * (1 + speedBonus));
}

export function calculateBaseReward(wordGoal: number, weaponMultiplier: number): number {
  return Math.floor(wordGoal * 0.1 * weaponMultiplier)
}

export function calculateTimedBonus(
  wordGoal: number,
  timeMinutes: number,
  wordsWritten: number,
  timeUsedSeconds: number,
  difficulty: QuestDifficulty,
): number {
  if (wordsWritten < wordGoal) return 0

  const multiplierMap: Record<QuestDifficulty, number> = {
    easy: 1.0,
    medium: 1.5,
    hard: 2.0,
    epic: 3.0,
  }

  const difficultyMultiplier = multiplierMap[difficulty]
  const completionRatio = Math.min(wordsWritten / wordGoal, 1.0)

  const totalTimeSeconds = timeMinutes * 60
  const timeRemainingSeconds = totalTimeSeconds - timeUsedSeconds
  const speedBonus =
    timeRemainingSeconds > 0 ? (timeRemainingSeconds / totalTimeSeconds) * 0.5 : 0

  return Math.floor(wordGoal * difficultyMultiplier * completionRatio * (1 + speedBonus))
}

export function calculateQuestReward(opts: {
  wordGoal: number
  wordsWritten: number
  weaponMultiplier: number
  timeMinutes?: number
  timeUsedSeconds?: number
  difficulty?: QuestDifficulty
}): number {
  const base = calculateBaseReward(opts.wordGoal, opts.weaponMultiplier)
  if (
    opts.timeMinutes !== undefined &&
    opts.timeUsedSeconds !== undefined &&
    opts.difficulty !== undefined
  ) {
    return base + calculateTimedBonus(
      opts.wordGoal,
      opts.timeMinutes,
      opts.wordsWritten,
      opts.timeUsedSeconds,
      opts.difficulty,
    )
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

const DIFFICULTY_MULTIPLIER: Record<QuestDifficulty, number> = {
  easy: 1.0,
  medium: 1.5,
  hard: 2.0,
  epic: 3.0,
}

/**
 * Coins a board quest pays if completed: the quest's own reward (+ bonus)
 * plus the image-reveal session's base reward, plus — for timed quests — the
 * timed bonus, which grows with how much time is left (up to +50%).
 * Returns the range from finishing right at the buzzer to finishing instantly.
 */
export function estimateQuestCoins(opts: {
  wordGoal: number
  questCoins: number
  bonusCoins?: number
  weaponMultiplier: number
  timeMinutes?: number
}): { min: number; max: number } {
  const fixed = opts.questCoins + (opts.bonusCoins ?? 0) + calculateBaseReward(opts.wordGoal, opts.weaponMultiplier)
  if (opts.timeMinutes === undefined) return { min: fixed, max: fixed }
  const multiplier = DIFFICULTY_MULTIPLIER[calculateDifficulty(opts.wordGoal, opts.timeMinutes)]
  return {
    min: fixed + Math.floor(opts.wordGoal * multiplier),
    max: fixed + Math.floor(opts.wordGoal * multiplier * 1.5),
  }
}

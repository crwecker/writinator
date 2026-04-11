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

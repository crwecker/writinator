import type { WriteathonMilestone, MilestoneTier, BoardQuest, BoardQuestType } from '../types'

export const PERMANENT_QUESTS = [
  { wordGoal: 250, title: 'Quick Sprint', coinReward: 25 },
  { wordGoal: 500, title: 'Steady March', coinReward: 50 },
  { wordGoal: 700, title: 'Extended Push', coinReward: 70 },
  { wordGoal: 1000, title: 'Deep Focus', coinReward: 100 },
  { wordGoal: 2000, title: 'Marathon Session', coinReward: 200 },
]

export function calculateDailyTarget(
  targetWordCount: number,
  currentWordCount: number,
  remainingBlocks: number
): number {
  if (remainingBlocks <= 0) return 0
  return Math.ceil((targetWordCount - currentWordCount) / remainingBlocks)
}

export function getMilestoneTier(blockNumber: number): MilestoneTier {
  if (blockNumber <= 6) return 'apprentice'
  if (blockNumber <= 12) return 'journeyman'
  if (blockNumber <= 18) return 'master'
  return 'legendary'
}

export function getMilestoneReward(blockNumber: number): number {
  const tier = getMilestoneTier(blockNumber)
  const baseRewards: Record<MilestoneTier, number> = {
    apprentice: 50,
    journeyman: 100,
    master: 200,
    legendary: 400,
  }
  const base = baseRewards[tier]
  // Bonus at tier boundaries (blocks 6, 12, 18, 24)
  const isBoundary = blockNumber % 6 === 0
  return isBoundary ? base * 2 : base
}

export function createMilestones(
  startingWordCount: number,
  wordsPerBlock: number,
  totalBlocks: number
): WriteathonMilestone[] {
  return Array.from({ length: totalBlocks }, (_, i) => {
    const blockNumber = i + 1
    return {
      blockNumber,
      targetWordCount: startingWordCount + wordsPerBlock * blockNumber,
      completed: false,
      coinsAwarded: getMilestoneReward(blockNumber),
      tier: getMilestoneTier(blockNumber),
    }
  })
}

export function createBoardQuest(
  type: BoardQuestType,
  wordGoal: number,
  options?: {
    timeMinutes?: number
    title?: string
    description?: string
    coinReward?: number
    bonusCoins?: number
  }
): BoardQuest {
  return {
    id: crypto.randomUUID(),
    type,
    wordGoal,
    timeMinutes: options?.timeMinutes,
    title: options?.title ?? `Write ${wordGoal} words`,
    description: options?.description ?? `Complete a writing session of ${wordGoal} words`,
    coinReward: options?.coinReward ?? Math.floor(wordGoal * 0.1),
    bonusCoins: options?.bonusCoins,
    accepted: false,
    createdAt: new Date().toISOString(),
  }
}

export function getDailyQuestTitle(blockNumber: number): string {
  const titles: Record<number, string> = {
    1: "The Apprentice's First Task",
    2: 'Finding Your Rhythm',
    3: 'Words Take Shape',
    4: 'Building Momentum',
    5: 'The Steady Hand',
    6: "Apprentice's Trial Complete",
    7: "Journeyman's Opening",
    8: 'The Deepening Craft',
    9: 'Stories Unfold',
    10: 'The Middle Path',
    11: 'Persistence Pays',
    12: "Journeyman's Proving",
    13: "Master's Awakening",
    14: 'The Forge Burns Bright',
    15: 'Words Like Water',
    16: 'The Relentless Pen',
    17: 'Echoes of Mastery',
    18: "Master's Crucible",
    19: 'Legend Begins',
    20: 'The Final Ascent',
    21: 'Ink and Fire',
    22: 'The Unstoppable',
    23: 'Dawn of Legend',
    24: 'The Last Word',
  }
  return titles[blockNumber] ?? `Block ${blockNumber}`
}

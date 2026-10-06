import type { WriteathonMilestone, MilestoneTier, BoardQuest, BoardQuestType, WriteathonConfig } from '../types'
import { addDays, dayDiff, parseDayKey } from './days'
import { todayKey } from './metrics'

// ---------------------------------------------------------------------------
// Calendar model: each writeathon "day" is a real local date starting from the
// start date. Today's target is whatever keeps you on pace for the dates left,
// frozen at the start of the day; a date pays when its target is met, a missed
// date simply pays nothing.
// ---------------------------------------------------------------------------

export const WRITEATHON_MODEL = 2

/** A writeathon day. Extends the stored milestone shape (book files keep it). */
export interface WriteathonDay extends WriteathonMilestone {
  /** Local calendar date, YYYY-MM-DD. */
  date: string
  /** Book word count when this date's writing began (frozen at the first update that day). */
  dayStartWordCount?: number
  /** Words needed on this date (frozen together with dayStartWordCount). */
  dayTarget?: number
}

export type WriteathonDayStatus = 'paid' | 'missed' | 'today' | 'upcoming'

export interface WriteathonToday {
  /** 0-based index of today in the plan (may be < 0 or >= length). */
  index: number
  date: string
  phase: 'before' | 'active' | 'over' | 'complete'
  dayStartWordCount: number
  target: number
  written: number
  paid: boolean
  remainingDays: number
}

export function writeathonStartDay(config: Pick<WriteathonConfig, 'startDate'>): string {
  return todayKey(Date.parse(config.startDate))
}

/** Words needed today to stay on pace: what's left spread over the dates left (including today). */
export function calendarDailyTarget(targetWordCount: number, dayStartWordCount: number, remainingDays: number): number {
  if (remainingDays <= 0) return 0
  return Math.ceil(Math.max(0, targetWordCount - dayStartWordCount) / remainingDays)
}

export function createCalendarDays(
  startDay: string,
  startingWordCount: number,
  wordsPerBlock: number,
  totalBlocks: number,
): WriteathonDay[] {
  return createMilestones(startingWordCount, wordsPerBlock, totalBlocks).map((m, i) => ({
    ...m,
    date: addDays(startDay, i),
  }))
}

export function dayStatusOf(days: WriteathonDay[], index: number, todayIndex: number): WriteathonDayStatus {
  if (days[index]?.completed) return 'paid'
  if (index < todayIndex) return 'missed'
  if (index === todayIndex) return 'today'
  return 'upcoming'
}

/** Where today sits in the writeathon and how it's going. Pure; `bookWords` is the live count. */
export function getWriteathonToday(
  config: WriteathonConfig,
  days: WriteathonDay[],
  bookWords: number,
  now: number = Date.now(),
): WriteathonToday {
  const date = todayKey(now)
  const total = days.length
  const index = dayDiff(days[0]?.date ?? writeathonStartDay(config), date)
  const remainingDays = Math.max(0, Math.min(total, total - index))
  const phase: WriteathonToday['phase'] = config.completedAt
    ? 'complete'
    : index < 0
      ? 'before'
      : index >= total
        ? 'over'
        : 'active'
  if (phase !== 'active') {
    return { index, date, phase, dayStartWordCount: bookWords, target: 0, written: 0, paid: false, remainingDays }
  }
  const day = days[index]
  const dayStartWordCount = day.dayStartWordCount ?? bookWords
  const target = day.dayTarget ?? calendarDailyTarget(config.targetWordCount, dayStartWordCount, remainingDays)
  return {
    index,
    date,
    phase,
    dayStartWordCount,
    target,
    written: Math.max(0, bookWords - dayStartWordCount),
    paid: day.completed,
    remainingDays,
  }
}

export interface CalendarWriteathonData {
  config: WriteathonConfig | null
  milestones: WriteathonDay[]
  model: typeof WRITEATHON_MODEL
  lastSeenBookWords: number | null
}

/**
 * Bring old checkpoint-model data onto the calendar. Completed blocks become
 * already-paid days ending yesterday, and the remaining days start today, so
 * nothing is paid twice and an old plan isn't instantly "over". Calendar data
 * passes through unchanged.
 */
export function migrateWriteathonData(
  data: { config: WriteathonConfig | null; milestones: WriteathonMilestone[]; model?: number; lastSeenBookWords?: number | null },
  now: number = Date.now(),
): CalendarWriteathonData {
  if (data.model === WRITEATHON_MODEL) {
    return {
      config: data.config,
      milestones: data.milestones as WriteathonDay[],
      model: WRITEATHON_MODEL,
      lastSeenBookWords: data.lastSeenBookWords ?? null,
    }
  }
  if (!data.config) return { config: null, milestones: [], model: WRITEATHON_MODEL, lastSeenBookWords: null }

  const paidCount = data.milestones.filter((m) => m.completed).length
  const startDay = addDays(todayKey(now), -paidCount)
  return {
    config: { ...data.config, startDate: parseDayKey(startDay).toISOString() },
    milestones: data.milestones.map((m, i) => ({ ...m, date: addDays(startDay, i) })),
    model: WRITEATHON_MODEL,
    lastSeenBookWords: null,
  }
}

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
    apprentice: 150,
    journeyman: 250,
    master: 400,
    legendary: 600,
  }
  const bonusRewards: Record<MilestoneTier, number> = {
    apprentice: 500,
    journeyman: 1000,
    master: 1500,
    legendary: 2500,
  }
  const base = baseRewards[tier]
  // Bonus at tier boundaries (blocks 6, 12, 18, 24)
  const isBoundary = blockNumber % 6 === 0
  return isBoundary ? base + bonusRewards[tier] : base
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

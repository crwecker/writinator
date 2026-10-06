/**
 * Author level: lifetime counted words are XP. Reaching level L takes
 * 125·(L−1)·L words — 250 for level 2, ~11k for level 10, ~90k (a novel) for
 * level 27 — so early levels come quickly and later ones stay reachable.
 */

export interface LevelInfo {
  level: number
  title: string
  /** Lifetime words. */
  xp: number
  /** XP at which the current level began. */
  levelStartXp: number
  /** XP needed for the next level. */
  nextLevelXp: number
  /** The next title and the level that grants it (null at the last title). */
  nextTitle: { level: number; title: string } | null
}

const XP_STEP = 125

/** A new title every five levels (plus the first one). */
export const AUTHOR_TITLES: { level: number; title: string }[] = [
  { level: 1, title: 'Apprentice Scribe' },
  { level: 5, title: 'Scribe' },
  { level: 10, title: 'Chronicler' },
  { level: 15, title: 'Storyteller' },
  { level: 20, title: 'Wordsmith' },
  { level: 25, title: 'Loremaster' },
  { level: 30, title: 'Bard of Ages' },
  { level: 35, title: 'Mythweaver' },
  { level: 40, title: 'Keeper of Tales' },
  { level: 50, title: 'Legend of the Quill' },
]

/** Total lifetime words needed to reach `level`. */
export function xpToReach(level: number): number {
  if (level <= 1) return 0
  return XP_STEP * (level - 1) * level
}

export function titleForLevel(level: number): string {
  let title = AUTHOR_TITLES[0].title
  for (const t of AUTHOR_TITLES) if (level >= t.level) title = t.title
  return title
}

export function levelInfo(xp: number): LevelInfo {
  const safeXp = Math.max(0, Math.floor(xp))
  // Solve 125·(L−1)·L ≤ xp for the largest L, then correct for float error.
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * safeXp) / XP_STEP)) / 2))
  while (xpToReach(level + 1) <= safeXp) level++
  while (level > 1 && xpToReach(level) > safeXp) level--
  const next = AUTHOR_TITLES.find((t) => t.level > level) ?? null
  return {
    level,
    title: titleForLevel(level),
    xp: safeXp,
    levelStartXp: xpToReach(level),
    nextLevelXp: xpToReach(level + 1),
    nextTitle: next ? { level: next.level, title: next.title } : null,
  }
}

/** True when reaching `level` grants a new title. */
export function isTitleLevel(level: number): boolean {
  return level > 1 && AUTHOR_TITLES.some((t) => t.level === level)
}

/** Coins for reaching `level`: 10 + 10·level, plus 100 for a new title. */
export function levelUpReward(level: number): number {
  return 10 + 10 * level + (isTitleLevel(level) ? 100 : 0)
}

export function lifetimeWords(dailyWords: Record<string, number>): number {
  let total = 0
  for (const w of Object.values(dailyWords)) total += Math.max(0, w)
  return total
}

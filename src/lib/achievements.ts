export interface AchievementContext {
  lifetimeWords: number
  bestDayWords: number
  longestStreak: number
  questsCompleted: number
  picturesRevealed: number
  epicTimedQuests: number
  gallerySetsCompleted: number
  customPicturesRevealed: number
  longestChapterWords: number
  chapterQuestsCompleted: number
  revisedWords: number
  revisionQuestsCompleted: number
  storyletsPublished: number
  booksFinished: number
  earlyBird: number
  nightOwl: number
  comebacks: number
  level: number
}
export interface AchievementDef {
  id: string
  name: string
  description: string
  icon: string
  coins: number
  metric: keyof AchievementContext
  target: number
}
/** Shorthand for a badge definition. */
function a(id: string, icon: string, name: string, description: string, metric: keyof AchievementContext, target: number, coins: number): AchievementDef {
  return { id, icon, name, description, metric, target, coins }
}

/** Every badge, in the order the Hall shows them. */
export const ACHIEVEMENTS: AchievementDef[] = [
  // Lifetime words
  a('words-100', '✒️', 'First Ink', 'Write your first 100 words.', 'lifetimeWords', 100, 10),
  a('words-1k', '📜', 'A Thousand Words', 'Write 1,000 words in total.', 'lifetimeWords', 1_000, 25),
  a('words-10k', '📚', 'Ten Thousand Strong', 'Write 10,000 words in total.', 'lifetimeWords', 10_000, 75),
  a('words-50k', '🏔️', 'NaNo Summit', 'Write 50,000 words in total.', 'lifetimeWords', 50_000, 200),
  a('words-100k', '🐉', 'Hundred-Thousand Hoard', 'Write 100,000 words in total.', 'lifetimeWords', 100_000, 400),
  a('words-250k', '👑', 'Epic Saga', 'Write 250,000 words in total.', 'lifetimeWords', 250_000, 800),
  // Big days
  a('day-1k', '☀️', 'Solid Day', 'Write 1,000 words in a single day.', 'bestDayWords', 1_000, 30),
  a('day-2k', '🔥', 'Blazing Day', 'Write 2,000 words in a single day.', 'bestDayWords', 2_000, 60),
  a('day-5k', '⚡', 'Lightning Day', 'Write 5,000 words in a single day.', 'bestDayWords', 5_000, 150),
  // Streaks
  a('streak-3', '🕯️', 'Kindling', 'Keep a 3-day writing streak.', 'longestStreak', 3, 20),
  a('streak-7', '🔥', 'Week of Fire', 'Keep a 7-day writing streak.', 'longestStreak', 7, 60),
  a('streak-30', '🌙', 'Moon Cycle', 'Keep a 30-day writing streak.', 'longestStreak', 30, 250),
  a('streak-100', '🌟', 'Unbroken', 'Keep a 100-day writing streak.', 'longestStreak', 100, 750),
  // Quests
  a('quest-1', '🗡️', 'First Quest', 'Complete your first quest.', 'questsCompleted', 1, 15),
  a('quests-10', '🛡️', 'Seasoned Adventurer', 'Complete 10 quests.', 'questsCompleted', 10, 60),
  a('quests-50', '🏰', 'Guild Veteran', 'Complete 50 quests.', 'questsCompleted', 50, 200),
  a('quests-100', '🏆', 'Guild Legend', 'Complete 100 quests.', 'questsCompleted', 100, 400),
  a('epic-timed', '⏳', 'Beat the Clock', 'Finish an Epic timed quest.', 'epicTimedQuests', 1, 100),
  // Gallery
  a('pictures-25', '🖼️', 'Curator', 'Reveal 25 pictures.', 'picturesRevealed', 25, 100),
  a('pictures-100', '🏛️', 'Grand Gallery', 'Reveal 100 pictures.', 'picturesRevealed', 100, 300),
  a('gallery-set', '🧩', 'Collector', 'Complete a gallery set.', 'gallerySetsCompleted', 1, 50),
  a('gallery-sets-3', '💎', 'Connoisseur', 'Complete three gallery sets.', 'gallerySetsCompleted', 3, 150),
  a('custom-picture', '🎨', 'Self-Portrait', 'Reveal a picture of your own.', 'customPicturesRevealed', 1, 25),
  // The book
  a('chapter-3k', '📖', 'A Proper Chapter', 'Grow a chapter to 3,000 words.', 'longestChapterWords', 3_000, 75),
  a('chapter-quest', '🔖', 'Chapter and Verse', 'Complete a quest from your book.', 'chapterQuestsCompleted', 1, 40),
  a('revise-500', '✂️', 'Red Pen', 'Revise 500 words of existing text.', 'revisedWords', 500, 40),
  a('revise-5k', '🪶', 'Ruthless Editor', 'Revise 5,000 words of existing text.', 'revisedWords', 5_000, 150),
  a('revision-quest', '🧹', 'Polished', 'Complete a revision quest.', 'revisionQuestsCompleted', 1, 40),
  a('first-publish', '📣', 'Into the World', 'Publish a storylet for the first time.', 'storyletsPublished', 1, 50),
  a('book-finished', '🎉', 'The End', 'Finish a book: publish every storylet or complete a writeathon.', 'booksFinished', 1, 300),
  // Habits
  a('early-bird', '🐦', 'Early Bird', 'Write before 7 in the morning.', 'earlyBird', 1, 25),
  a('night-owl', '🦉', 'Night Owl', 'Write after midnight.', 'nightOwl', 1, 25),
  a('comeback', '🌱', 'The Return', 'Come back to writing after 14 days away.', 'comebacks', 1, 50),
  // Levels
  a('level-10', '🎖️', 'Chronicler', 'Reach author level 10.', 'level', 10, 100),
  a('level-25', '🧙', 'Loremaster', 'Reach author level 25.', 'level', 25, 300),
]

export interface AchievementStatus {
  def: AchievementDef
  /** Current value of the badge's metric. */
  value: number
  unlocked: boolean
  /** ISO time it was unlocked. */
  unlockedAt?: string
}

/** Every badge with its progress. Unlocked badges stay unlocked whatever the metric says now. */
export function achievementStatuses(ctx: AchievementContext, unlocked: Record<string, string>): AchievementStatus[] {
  return ACHIEVEMENTS.map((def) => {
    const at = unlocked[def.id]
    return { def, value: ctx[def.metric], unlocked: at !== undefined, ...(at !== undefined ? { unlockedAt: at } : {}) }
  })
}

/** Badges whose criteria are met now but which aren't unlocked yet. */
export function newlyEarned(ctx: AchievementContext, unlocked: Record<string, string>): AchievementDef[] {
  return ACHIEVEMENTS.filter((def) => unlocked[def.id] === undefined && ctx[def.metric] >= def.target)
}

export function emptyAchievementContext(): AchievementContext {
  return { lifetimeWords: 0, bestDayWords: 0, longestStreak: 0, questsCompleted: 0, picturesRevealed: 0, epicTimedQuests: 0, gallerySetsCompleted: 0, customPicturesRevealed: 0, longestChapterWords: 0, chapterQuestsCompleted: 0, revisedWords: 0, revisionQuestsCompleted: 0, storyletsPublished: 0, booksFinished: 0, earlyBird: 0, nightOwl: 0, comebacks: 0, level: 1 }
}

import type { Storylet } from '../types'
import { countWords } from './words'

/**
 * "From your book" quests: goals measured on one storylet's word count rather
 * than on typing in general. Suggestions are derived from the open book each
 * time, so they follow the writing without being stored.
 */

export interface ChapterQuestSuggestion {
  /** Stable for a storylet and target, so an accepted quest keeps its card. */
  id: string
  storyletId: string
  storyletName: string
  kind: 'grow' | 'draft'
  currentWords: number
  targetWords: number
  /** Words still needed: targetWords − currentWords. */
  wordGoal: number
  coinReward: number
  title: string
  description: string
}

export type ChapterSource = Pick<Storylet, 'id' | 'name' | 'content' | 'parentId' | 'updatedAt'>

/** Below this a storylet counts as empty (worth drafting, not growing). */
const EMPTY_BELOW = 50
const DRAFT_TARGET = 500
const MIN_GOAL = 200
const MAX_GOAL = 3000
const MAX_DRAFTS = 1

export function median(values: number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

/** Board reward for a chapter quest: grows with the words it needs. */
export function chapterQuestReward(wordGoal: number): number {
  return Math.round(20 + Math.max(0, wordGoal) * 0.12)
}

function displayName(s: ChapterSource): string {
  return s.name.trim() || 'Untitled'
}

function growTarget(current: number, typical: number): number {
  // A chapter well short of the book's typical length aims for that length.
  if (typical > 0 && current < typical * 0.75) {
    const target = Math.ceil(typical / 500) * 500
    if (target - current <= MAX_GOAL) return target
  }
  let target = Math.ceil((current + 1) / 1000) * 1000
  if (target - current < MIN_GOAL) target += 1000
  return target
}

export function suggestChapterQuests(storylets: ChapterSource[], max = 4): ChapterQuestSuggestion[] {
  const parents = new Set(storylets.map((s) => s.parentId).filter((id): id is string => !!id))
  const leaves = storylets
    .filter((s) => !parents.has(s.id))
    .map((s) => ({ s, words: countWords(s.content) }))

  const written = leaves.filter((l) => l.words >= EMPTY_BELOW)
  const typical = median(written.map((l) => l.words))

  const drafts: ChapterQuestSuggestion[] = leaves
    .filter((l) => l.words < EMPTY_BELOW)
    .slice(0, MAX_DRAFTS)
    .map(({ s, words }) => {
      const wordGoal = DRAFT_TARGET - words
      return {
        id: `chapter:${s.id}:${DRAFT_TARGET}`,
        storyletId: s.id,
        storyletName: displayName(s),
        kind: 'draft',
        currentWords: words,
        targetWords: DRAFT_TARGET,
        wordGoal,
        coinReward: chapterQuestReward(wordGoal),
        title: `Draft ${displayName(s)}`,
        description: `Get the first ${DRAFT_TARGET.toLocaleString()} words of “${displayName(s)}” down.`,
      }
    })

  const grows: ChapterQuestSuggestion[] = [...written]
    .sort((a, b) => Date.parse(b.s.updatedAt) - Date.parse(a.s.updatedAt))
    .slice(0, Math.max(0, max - drafts.length))
    .map(({ s, words }) => {
      const targetWords = growTarget(words, typical)
      const wordGoal = targetWords - words
      return {
        id: `chapter:${s.id}:${targetWords}`,
        storyletId: s.id,
        storyletName: displayName(s),
        kind: 'grow',
        currentWords: words,
        targetWords,
        wordGoal,
        coinReward: chapterQuestReward(wordGoal),
        title: `Bring ${displayName(s)} to ${targetWords.toLocaleString()} words`,
        description: `Only words in “${displayName(s)}” count. It has ${words.toLocaleString()} now.`,
      }
    })

  return [...grows, ...drafts].slice(0, max)
}

/** Revision quests progress on words revised in existing text, not new words. */
export const REVISION_QUESTS = [
  { wordGoal: 250, title: 'Polish a Passage', coinReward: 40 },
  { wordGoal: 500, title: 'Revise 500 words', coinReward: 75 },
  { wordGoal: 1500, title: 'Deep Revision', coinReward: 200 },
]

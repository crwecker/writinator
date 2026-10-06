import { useImageRevealStore } from '../../stores/imageRevealStore'
import { useWriteathonStore } from '../../stores/writeathonStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { trackQuestSession, type TrackedQuest } from '../../stores/progressionStore'
import { createBoardQuest } from '../../lib/writeathon'
import { countWords } from '../../lib/words'
import type { ChapterQuestSuggestion } from '../../lib/chapterQuests'
import type { BoardQuest, ImageRevealSession } from '../../types'
import { acceptBlocker, questImage } from './useAcceptQuest'

/** Start the reveal session for a chapter/revision board quest and link it to what it measures. */
async function acceptTracked(
  quest: BoardQuest,
  source: NonNullable<ImageRevealSession['progressSource']>,
  tracking: () => { quest: BoardQuest; tracking: TrackedQuest },
): Promise<void> {
  const blocker = acceptBlocker(quest)
  if (blocker) throw new Error(blocker)
  const image = await questImage()
  // Measure from where things stand once the picture has loaded.
  const final = tracking()
  const id = useImageRevealStore.getState().startSession(
    image.url,
    image.width,
    image.height,
    final.quest.wordGoal,
    image.photographer,
    image.photographerUrl,
    image.unsplashId,
    undefined,
    final.quest.title,
    { boardCoins: final.quest.coinReward, progressSource: source },
  )
  if (id === '') throw new Error(acceptBlocker(quest) ?? 'Could not start the quest.')
  trackQuestSession(id, final.tracking)
  useWriteathonStore.getState().acceptBoardQuest(final.quest, id)
}

/** "Bring <chapter> to N words" / "Draft <storylet>": progress is that storylet's word count. */
export async function acceptChapterQuest(suggestion: ChapterQuestSuggestion): Promise<void> {
  const make = (wordGoal: number): BoardQuest => ({
    ...createBoardQuest('chapter', wordGoal, {
      title: suggestion.title,
      description: suggestion.description,
      coinReward: suggestion.coinReward,
    }),
    id: suggestion.id,
  })
  await acceptTracked(make(suggestion.wordGoal), 'storylet', () => {
    const book = useStoryletStore.getState().book
    const storylet = book?.storylets.find((s) => s.id === suggestion.storyletId)
    if (!book || !storylet) throw new Error('That storylet is no longer in the open book.')
    const startWords = countWords(storylet.content)
    const wordGoal = Math.max(1, suggestion.targetWords - startWords)
    return {
      quest: make(wordGoal),
      tracking: { kind: 'storylet', storyletId: storylet.id, bookId: book.id, startWords },
    }
  })
}

/** "Revise N words": progress is words revised in existing text. */
export async function acceptRevisionQuest(def: { wordGoal: number; title: string; coinReward: number }): Promise<void> {
  const quest: BoardQuest = {
    ...createBoardQuest('revision', def.wordGoal, {
      title: def.title,
      description: `Rework ${def.wordGoal.toLocaleString()} words of text you've already written.`,
      coinReward: def.coinReward,
    }),
    id: `revision:${def.wordGoal}`,
  }
  await acceptTracked(quest, 'revision', () => ({ quest, tracking: { kind: 'revision' } }))
}

/** Storylets that already have a chapter quest underway (ids look like chapter:<storyletId>:<target>). */
export function activeChapterStoryletIds(quests: BoardQuest[]): Set<string> {
  const ids = new Set<string>()
  for (const q of quests) {
    if (q.type !== 'chapter' || q.completedAt) continue
    const storyletId = q.id.split(':')[1]
    if (storyletId) ids.add(storyletId)
  }
  return ids
}

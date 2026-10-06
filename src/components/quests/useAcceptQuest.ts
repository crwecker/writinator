import { useState } from 'react'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { useWriteathonStore } from '../../stores/writeathonStore'
import { usePlayerStore } from '../../stores/playerStore'
import { type QuestImage } from '../../lib/questArt'
import { chooseQuestImage } from './questPicture'
import { getArmorTimeBonus } from '../../lib/items'
import { PERMANENT_QUESTS, createBoardQuest } from '../../lib/writeathon'
import type { BoardQuest, ImageRevealSession } from '../../types'

/** Why a quest can't be accepted right now, or null when it can. */
export function acceptBlocker(quest: Pick<BoardQuest, 'timeMinutes'>): string | null {
  const { activeSessions } = useImageRevealStore.getState()
  if (activeSessions.length >= 25) return 'You have 25 quests going. Finish or abandon one first.'
  if (quest.timeMinutes !== undefined && activeSessions.some((s) => s.timeMinutes !== undefined)) {
    return 'Only one timed quest at a time. Finish your current one first.'
  }
  return null
}

/** A picture for a new quest: the writer's chosen picture, an Unsplash photo in the chosen theme, or generated art. */
export function questImage(): Promise<QuestImage> {
  return chooseQuestImage()
}

/** Start an image-reveal session for an already-fetched picture. Returns '' if blocked. */
export function startQuestSession(
  image: QuestImage,
  quest: { wordGoal: number; timeMinutes?: number; title?: string; boardCoins?: number },
): string {
  return useImageRevealStore.getState().startSession(
    image.url,
    image.width,
    image.height,
    quest.wordGoal,
    image.photographer,
    image.photographerUrl,
    image.unsplashId,
    quest.timeMinutes,
    quest.title,
    quest.boardCoins ? { boardCoins: quest.boardCoins } : undefined,
  )
}

/** Start the image-reveal session for a board quest and mark it accepted. */
export async function acceptBoardQuest(quest: BoardQuest): Promise<void> {
  const blocker = acceptBlocker(quest)
  if (blocker) throw new Error(blocker)
  const image = await questImage()
  const sessionId = startQuestSession(image, {
    wordGoal: quest.wordGoal,
    timeMinutes: quest.timeMinutes,
    title: quest.title,
    boardCoins: quest.coinReward + (quest.bonusCoins ?? 0),
  })
  if (sessionId === '') throw new Error(acceptBlocker(quest) ?? 'Could not start the quest.')
  useWriteathonStore.getState().acceptBoardQuest(quest, sessionId)
}

/** Start a quest that isn't on the board (session quests, chains). */
export async function startPlainQuest(quest: { wordGoal: number; timeMinutes?: number; title?: string }): Promise<string> {
  const blocker = acceptBlocker(quest)
  if (blocker) throw new Error(blocker)
  const image = await questImage()
  const id = startQuestSession(image, quest)
  if (id === '') throw new Error(acceptBlocker(quest) ?? 'Could not start the quest.')
  return id
}

/** The time limit a finished session's writer chose (before armor/Second Wind). */
export function chosenMinutes(session: ImageRevealSession): number | undefined {
  if (session.timeMinutes === undefined) return undefined
  if (session.baseTimeMinutes !== undefined) return session.baseTimeMinutes
  const armor = getArmorTimeBonus(usePlayerStore.getState().equippedArmor)
  return Math.round(session.timeMinutes / (1 + armor))
}

/**
 * "Another one": start the same quest again — same goal, same timer choice.
 * A guild contract is re-accepted from the board (so it pays its board
 * reward again); anything else starts as a plain quest with the same title.
 */
export async function startChainQuest(session: ImageRevealSession): Promise<void> {
  const timeMinutes = chosenMinutes(session)
  const contract = PERMANENT_QUESTS.find((pq) => pq.wordGoal === session.wordGoal && pq.title === session.title)
  if (contract) {
    await acceptBoardQuest(
      createBoardQuest('permanent', contract.wordGoal, {
        title: contract.title,
        coinReward: contract.coinReward,
        timeMinutes,
      }),
    )
    return
  }
  await startPlainQuest({ wordGoal: session.wordGoal, timeMinutes, title: session.title })
}

export function useAcceptQuest() {
  const [acceptingId, setAcceptingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** `key` identifies the card showing the spinner (defaults to the quest id). */
  async function accept(quest: BoardQuest, key: string = quest.id): Promise<boolean> {
    if (acceptingId) return false
    setAcceptingId(key)
    setError(null)
    try {
      await acceptBoardQuest(quest)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the quest.')
      return false
    } finally {
      setAcceptingId(null)
    }
  }

  return { accept, acceptingId, error, clearError: () => setError(null) }
}

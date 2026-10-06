import { useState } from 'react'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { useWriteathonStore } from '../../stores/writeathonStore'
import { fetchRandomImage } from '../../lib/unsplash'
import { getQuestImage } from '../../lib/questArt'
import type { BoardQuest } from '../../types'

/** Why a quest can't be accepted right now, or null when it can. */
export function acceptBlocker(quest: Pick<BoardQuest, 'timeMinutes'>): string | null {
  const { activeSessions } = useImageRevealStore.getState()
  if (activeSessions.length >= 25) return 'You have 25 quests going. Finish or abandon one first.'
  if (quest.timeMinutes !== undefined && activeSessions.some((s) => s.timeMinutes !== undefined)) {
    return 'Only one timed quest at a time. Finish your current one first.'
  }
  return null
}

/** Start the image-reveal session for a board quest and mark it accepted. */
export async function acceptBoardQuest(quest: BoardQuest): Promise<void> {
  const blocker = acceptBlocker(quest)
  if (blocker) throw new Error(blocker)
  const image = await getQuestImage(fetchRandomImage)
  const sessionId = useImageRevealStore.getState().startSession(
    image.url,
    image.width,
    image.height,
    quest.wordGoal,
    image.photographer,
    image.photographerUrl,
    image.unsplashId,
    quest.timeMinutes,
    quest.title,
  )
  if (sessionId === '') throw new Error(acceptBlocker(quest) ?? 'Could not start the quest.')
  useWriteathonStore.getState().acceptBoardQuest(quest, sessionId)
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

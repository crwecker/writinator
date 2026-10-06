import { onQuestProgress, useImageRevealStore } from '../../stores/imageRevealStore'
import { gameSettingsReady, useGameSettingsStore } from '../../stores/gameSettingsStore'
import { showToast } from '../../stores/genericToastStore'
import { questImage, startQuestSession } from './useAcceptQuest'

export const SESSION_QUEST_TITLE = 'Session quest'

// Once per app session: the first counted words decide whether to start one.
let decided = false
let inFlight = false
/** Words counted while the picture loads — credited to the new quest. */
let pendingWords = 0

function hasUntimedQuest(): boolean {
  // Chapter/revision quests don't progress on typing, so they don't count here.
  return useImageRevealStore.getState().activeSessions.some((s) => s.timeMinutes === undefined && s.progressSource === undefined)
}

async function start(): Promise<void> {
  try {
    await gameSettingsReady()
    const { autoQuest } = useGameSettingsStore.getState()
    if (!autoQuest.enabled || hasUntimedQuest()) return
    const image = await questImage()
    // Things may have changed while the picture loaded.
    if (!useGameSettingsStore.getState().autoQuest.enabled || hasUntimedQuest()) return
    const id = startQuestSession(image, { wordGoal: autoQuest.wordGoal, title: SESSION_QUEST_TITLE })
    if (id === '') return
    useImageRevealStore.getState().creditWords(id, pendingWords)
    if (!useGameSettingsStore.getState().quietMode) {
      showToast(`Session quest started: ${autoQuest.wordGoal.toLocaleString()} words`, 'info')
    }
  } catch (err) {
    console.warn('[quests] could not start the session quest:', err)
  } finally {
    inFlight = false
    pendingWords = 0
  }
}

/**
 * Silently start an untimed "Session quest" when writing begins and no untimed
 * quest is running (gameSettings.autoQuest). Returns an uninstall function.
 */
export function installAutoSessionQuest(): () => void {
  return onQuestProgress(({ words }) => {
    if (words <= 0) return
    if (inFlight) {
      pendingWords += words
      return
    }
    if (decided) return
    decided = true
    inFlight = true
    pendingWords = words
    void start()
  })
}

/** Test helper: forget that this app session already decided. */
export function resetAutoSessionQuest(): void {
  decided = false
  inFlight = false
  pendingWords = 0
}

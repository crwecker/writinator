import { installAutoSessionQuest } from './autoSessionQuest'
import { installSessionTracker } from './sessionRecap'
import { installProgression } from '../../stores/progressionStore'

let installed = false

/** Install the session quest + recap tracker once for the app's lifetime. */
export function ensureQuestAutomation(): void {
  if (installed) return
  installed = true
  installAutoSessionQuest()
  installSessionTracker()
  installProgression()
}

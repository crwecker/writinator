import { useEffect } from 'react'
import { ensureQuestAutomation } from './questAutomation'
import { SessionRecapCard } from './SessionRecapCard'

/**
 * App-level quest automation (auto session quest, session tally) plus the
 * session recap card. Render it in both the book view and the landing page so
 * the recap shown on closing a book survives the switch.
 */
export function QuestSessionLayer() {
  useEffect(() => {
    ensureQuestAutomation()
  }, [])
  return <SessionRecapCard />
}

import { useState, useEffect, useRef } from 'react'
import { useStoryletStore } from '../../stores/storyletStore'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { countWords } from '../../lib/words'

interface QuestReminderProps {
  onStartQuest: () => void
}

export function QuestReminder({ onStartQuest }: QuestReminderProps) {
  const [dismissed, setDismissed] = useState(false)
  const [visible, setVisible] = useState(false)

  // Track whether writing was detected (ref avoids triggering extra renders)
  const hasWrittenRef = useRef(false)
  // Ref for the timer so it can be cleaned up
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const activeStoryletId = useStoryletStore((s) => s.activeStoryletId)
  const book = useStoryletStore((s) => s.book)
  const activeSessions = useImageRevealStore((s) => s.activeSessions)

  const currentWordCount = (() => {
    if (!book || !activeStoryletId) return 0
    const storylet = book.storylets.find((d) => d.id === activeStoryletId)
    return countWords(storylet?.content ?? null)
  })()

  // Keep stable refs to the previous word count / storylet
  const prevWordCountRef = useRef(currentWordCount)
  const prevStoryletIdRef = useRef(activeStoryletId)
  const hasActiveSessions = activeSessions.length > 0

  // Schedule the reminder the first time writing is detected with no active
  // quests. Keyed on the word count only, so unrelated re-renders don't touch
  // the pending timer.
  useEffect(() => {
    const delta = currentWordCount - prevWordCountRef.current
    const switchedStorylet = prevStoryletIdRef.current !== activeStoryletId
    prevWordCountRef.current = currentWordCount
    prevStoryletIdRef.current = activeStoryletId

    if (dismissed || hasWrittenRef.current || hasActiveSessions) return
    if (switchedStorylet || delta <= 0) return

    // Writing detected — mark and start countdown
    hasWrittenRef.current = true
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      setVisible(true)
    }, 5000)
  }, [currentWordCount, activeStoryletId, dismissed, hasActiveSessions])

  // Clear a pending countdown on unmount only.
  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current)
  }, [])

  const handleDismiss = () => {
    setVisible(false)
    setTimeout(() => setDismissed(true), 300)
  }

  const handleStartQuest = () => {
    handleDismiss()
    onStartQuest()
  }

  if (dismissed || activeSessions.length > 0) return null

  return (
    <div
      className={`fixed right-4 z-30 transition-transform duration-300 ease-out ${
        visible ? 'translate-y-0' : 'translate-y-[calc(100%+40px)]'
      }`}
      style={{ bottom: '40px' }}
    >
      <div className="flex items-center gap-3 bg-gray-900/90 border border-gray-700 shadow-xl rounded-lg px-4 py-3 backdrop-blur-sm min-w-[300px] max-w-xs">
        <span className="text-base shrink-0" aria-hidden="true">
          &#9876;&#65039;
        </span>
        <span className="text-gray-300 text-sm flex-1">
          Start a quest to make your writing count!
        </span>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleStartQuest}
            className="text-amber-400 hover:text-amber-300 text-xs font-medium transition-colors"
          >
            Let&apos;s go
          </button>
          <button
            onClick={handleDismiss}
            className="text-gray-600 hover:text-gray-400 transition-colors leading-none"
            aria-label="Dismiss"
            title="Dismiss"
          >
            &#x2715;
          </button>
        </div>
      </div>
    </div>
  )
}

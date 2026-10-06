import { useMemo, useState } from 'react'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { useGameSettingsStore } from '../../stores/gameSettingsStore'
import { CollapsedThumbnail } from './ImageRevealCanvases'
import { SessionTimer } from './ImageRevealWidgets'
import { ImageRevealResult } from './ImageRevealResult'
import { ImageRevealSessionCard } from './ImageRevealSessionCard'
import { useSessionImages } from './useSessionImages'

// The 1s expiry ticker and the queue of finished sessions live in
// imageRevealStore, so this panel can be unmounted (distraction-free mode)
// without timed quests going untracked or results being lost.

type UserView = 'collapsed' | 'mini' | 'expanded'

export function ImageRevealPanel() {
  const quiet = useGameSettingsStore((s) => s.quietMode)
  const activeSessions = useImageRevealStore((s) => s.activeSessions)
  const resultQueue = useImageRevealStore((s) => s.resultQueue)
  const isPaused = useImageRevealStore((s) => s.isPaused)
  const pauseStartedAt = useImageRevealStore((s) => s.pauseStartedAt)

  const [userView, setUserView] = useState<UserView>('collapsed')

  const imageSessions = useMemo(
    () => [...activeSessions, ...resultQueue],
    [activeSessions, resultQueue],
  )
  const loadedImages = useSessionImages(imageSessions)

  // ------------------------------------------------------------------
  // Derive effective panel state from user intent + data
  // ------------------------------------------------------------------
  const hasAnything = activeSessions.length > 0 || resultQueue.length > 0

  // Quiet mode: results wait in the queue and show once it's turned off.
  if (!hasAnything || quiet) return null

  const showingResult = userView !== 'collapsed' && resultQueue.length > 0

  const effectiveUserView: UserView =
    activeSessions.length === 0 && !showingResult ? 'collapsed' : userView

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  const collapse = () => setUserView('collapsed')
  const minimize = () => setUserView('mini')
  const expand = () => setUserView('expanded')

  const dismissResult = () => {
    useImageRevealStore.getState().dismissResult()
    // Read live state: "Another 500?" may have just started a new quest.
    setUserView(useImageRevealStore.getState().activeSessions.length > 0 ? 'expanded' : 'collapsed')
  }

  const overallProgress =
    activeSessions.length === 0
      ? 0
      : activeSessions.reduce(
          (sum, s) => sum + Math.min(s.wordsWritten / s.wordGoal, 1),
          0,
        ) / activeSessions.length

  // ==================================================================
  // RESULT — celebration / time's up (intercepts any expanded view)
  // ==================================================================
  if (showingResult) {
    const session = resultQueue[0]
    return (
      <ImageRevealResult
        session={session}
        image={loadedImages[session.id]}
        onDone={dismissResult}
      />
    )
  }

  // ==================================================================
  // COLLAPSED
  // ==================================================================
  if (effectiveUserView === 'collapsed') {
    const firstSession = activeSessions[0]
    const firstImage = firstSession ? loadedImages[firstSession.id] : undefined
    const firstTimedSession = activeSessions.find((s) => s.timeMinutes !== undefined)

    return (
      <div className="fixed bottom-12 right-4 z-40">
        <button
          onClick={expand}
          className="group relative flex items-center gap-2 bg-stone-950/95 border border-amber-900/50 shadow-2xl rounded-xl p-1.5 hover:border-amber-700/70 transition-colors"
          title={firstSession?.title ? `${firstSession.title} — click to expand` : 'Expand image quests'}
        >
          {/* Ring fills as the quests progress */}
          <span
            className="rounded-lg p-[2px]"
            style={{
              background: `conic-gradient(#fbbf24 ${overallProgress * 360}deg, rgba(120,113,108,0.35) 0deg)`,
            }}
          >
            {firstSession && firstImage ? (
              <CollapsedThumbnail session={firstSession} image={firstImage} className="block rounded-md" />
            ) : (
              <span className="block w-16 h-16 rounded-md bg-stone-800" />
            )}
          </span>

          <div className="pr-1.5 flex flex-col items-center gap-1">
            {activeSessions.length > 1 && (
              <span className="text-[10px] font-bold text-gray-300 bg-gray-700 rounded-full px-1.5 py-0.5 leading-none">
                {activeSessions.length}
              </span>
            )}
            <span className="text-xs text-gray-400 tabular-nums group-hover:text-gray-300">
              {Math.round(overallProgress * 100)}%
            </span>
            {firstTimedSession && (
              <SessionTimer
                session={firstTimedSession}
                isPaused={isPaused}
                pauseStartedAt={pauseStartedAt}
                compact
              />
            )}
          </div>

          {/* Dot when results are waiting */}
          {resultQueue.length > 0 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-gray-900" />
          )}
        </button>
      </div>
    )
  }

  // ==================================================================
  // MINI — bottom panel with small thumbnails (all sessions)
  // ==================================================================
  if (effectiveUserView === 'mini') {
    return (
      <aside className="relative flex items-center gap-2 bg-gray-900 border-t border-gray-700 w-full shrink-0 px-2 py-1.5 animate-fade-in">
        <button
          onClick={collapse}
          className="absolute top-1 right-2 z-10 text-gray-500 hover:text-gray-300 text-xs leading-none p-1"
          title="Minimize to overlay"
        >
          &#x2015;
        </button>
        <div className="flex items-center gap-2 overflow-x-auto pr-6">
          {activeSessions.map((session) => {
            const image = loadedImages[session.id]
            const pct = Math.round(
              Math.min(session.wordsWritten / session.wordGoal, 1) * 100,
            )
            const isTimedSession = session.timeMinutes !== undefined
            return (
              <button
                key={session.id}
                onClick={expand}
                className="group flex items-center gap-2 rounded hover:bg-gray-800 p-1 transition-colors shrink-0"
                title="Expand image quests"
              >
                {image ? (
                  <CollapsedThumbnail session={session} image={image} />
                ) : (
                  <div className="w-16 h-16 rounded bg-gray-800" />
                )}
                <div className="flex flex-col items-start gap-0.5 pr-1">
                  <span className="text-xs text-gray-400 tabular-nums group-hover:text-gray-300">
                    {pct}%
                  </span>
                  {isTimedSession && (
                    <SessionTimer
                      session={session}
                      isPaused={isPaused}
                      pauseStartedAt={pauseStartedAt}
                      compact
                    />
                  )}
                </div>
              </button>
            )
          })}
        </div>
      </aside>
    )
  }

  // ==================================================================
  // EXPANDED — all sessions at full size in bottom panel
  // ==================================================================
  return (
    <aside className="relative flex flex-col bg-gray-900 border-t border-gray-700 w-full shrink-0 overflow-hidden animate-fade-in">
      <button
        onClick={minimize}
        className="absolute top-1 right-2 z-10 text-gray-500 hover:text-gray-300 text-xs leading-none p-1"
        title="Minimize"
      >
        &#x2015;
      </button>

      <div className="flex overflow-x-auto">
        {activeSessions.map((session) => (
          <ImageRevealSessionCard
            key={session.id}
            session={session}
            image={loadedImages[session.id]}
            onMinimize={minimize}
          />
        ))}
      </div>
    </aside>
  )
}

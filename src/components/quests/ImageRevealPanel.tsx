import { useState, useEffect, useRef, useCallback } from 'react'
import { useImageRevealStore, PIXEL_LEVELS } from '../../stores/imageRevealStore'
import { drawPixelated, animateReveal } from '../../lib/pixelate'
import { loadImage } from '../../lib/unsplash'
import type { ImageRevealSession } from '../../types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The user-controlled panel state: collapsed, looking at the session list,
 * or drilling into a single session.  Celebration is handled separately via
 * a queue so it doesn't interfere with navigation intent.
 */
type UserView = 'collapsed' | 'stack' | { kind: 'detail'; sessionId: string }

interface LoadedImages {
  [sessionId: string]: HTMLImageElement
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

interface ThumbnailCanvasProps {
  session: ImageRevealSession
  image: HTMLImageElement | undefined
}

function ThumbnailCanvas({ session, image }: ThumbnailCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!image || !canvasRef.current) return
    drawPixelated(canvasRef.current, image, PIXEL_LEVELS[session.currentLevel])
  }, [image, session.currentLevel])

  return (
    <canvas
      ref={canvasRef}
      width={64}
      height={64}
      className="w-16 h-16 rounded shrink-0 object-cover bg-gray-800"
    />
  )
}

// -----------

interface DetailCanvasProps {
  session: ImageRevealSession
  image: HTMLImageElement | undefined
}

function DetailCanvas({ session, image }: DetailCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cancelAnimRef = useRef<(() => void) | null>(null)
  const prevLevelRef = useRef<number>(-1)
  const prevSessionId = useRef<string>('')

  useEffect(() => {
    if (!image || !canvasRef.current) return

    const canvas = canvasRef.current
    const gridSize = PIXEL_LEVELS[session.currentLevel]

    // Reset prev level when session changes
    if (prevSessionId.current !== session.id) {
      prevSessionId.current = session.id
      prevLevelRef.current = -1
    }

    const prevLevel = prevLevelRef.current

    cancelAnimRef.current?.()
    if (prevLevel !== -1 && prevLevel !== session.currentLevel) {
      const fromGrid = PIXEL_LEVELS[prevLevel]
      cancelAnimRef.current = animateReveal(canvas, image, fromGrid, gridSize)
    } else {
      drawPixelated(canvas, image, gridSize)
      cancelAnimRef.current = null
    }

    prevLevelRef.current = session.currentLevel

    return () => {
      cancelAnimRef.current?.()
    }
  }, [image, session.id, session.currentLevel])

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={280}
      className="w-[280px] h-[280px] mx-auto rounded object-cover bg-gray-800"
    />
  )
}

// -----------

interface CelebrationCanvasProps {
  session: ImageRevealSession
  image: HTMLImageElement | undefined
}

function CelebrationCanvas({ session, image }: CelebrationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const cancelAnimRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!image || !canvasRef.current) return

    const fromGrid = PIXEL_LEVELS[session.currentLevel] ?? 2
    cancelAnimRef.current?.()
    cancelAnimRef.current = animateReveal(canvasRef.current, image, fromGrid, 0)

    return () => {
      cancelAnimRef.current?.()
    }
  }, [image, session.id, session.currentLevel])

  return (
    <canvas
      ref={canvasRef}
      width={280}
      height={280}
      className="w-[280px] h-[280px] mx-auto rounded object-cover bg-gray-800"
    />
  )
}

// -----------

function PhotographerCredit({ session }: { session: ImageRevealSession }) {
  if (!session.photographer) return null
  return (
    <p className="text-center text-gray-500 text-[10px] mt-2">
      Photo by{' '}
      {session.photographerUrl ? (
        <a
          href={session.photographerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 hover:text-gray-300 underline"
        >
          {session.photographer}
        </a>
      ) : (
        session.photographer
      )}{' '}
      on Unsplash
    </p>
  )
}

// -----------

interface ProgressBarProps {
  session: ImageRevealSession
  showText?: boolean
}

function ProgressBar({ session, showText = true }: ProgressBarProps) {
  const progress = Math.min(session.wordsWritten / session.wordGoal, 1)
  const remaining = Math.max(session.wordGoal - session.wordsWritten, 0)

  return (
    <div>
      {showText && (
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-gray-400 tabular-nums">
            {session.wordsWritten.toLocaleString()} / {session.wordGoal.toLocaleString()}
          </span>
          <span className="text-gray-500 tabular-nums">
            {remaining.toLocaleString()} left
          </span>
        </div>
      )}
      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500 bg-amber-500"
          style={{ width: `${progress * 100}%` }}
        />
      </div>
    </div>
  )
}

// -----------

interface PanelHeaderProps {
  title: string
  onBack?: () => void
  onCollapse: () => void
}

function PanelHeader({ title, onBack, onCollapse }: PanelHeaderProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 shrink-0">
      <div className="flex items-center gap-2">
        {onBack && (
          <button
            onClick={onBack}
            className="text-gray-500 hover:text-gray-300 text-sm leading-none"
            title="Back to list"
          >
            &#8592;
          </button>
        )}
        <span className="text-xs text-gray-300 font-medium">{title}</span>
      </div>
      <button
        onClick={onCollapse}
        className="text-gray-500 hover:text-gray-400 text-xs"
        title="Minimize"
      >
        &#x2015;
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Collapsed thumbnail
// ---------------------------------------------------------------------------

interface CollapsedThumbnailProps {
  session: ImageRevealSession
  image: HTMLImageElement
}

function CollapsedThumbnail({ session, image }: CollapsedThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    drawPixelated(canvasRef.current, image, PIXEL_LEVELS[session.currentLevel])
  }, [image, session.currentLevel])

  return (
    <canvas
      ref={canvasRef}
      width={64}
      height={64}
      className="w-16 h-16 rounded object-cover"
    />
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ImageRevealPanel() {
  const activeSessions = useImageRevealStore((s) => s.activeSessions)
  const abandonSession = useImageRevealStore((s) => s.abandonSession)

  // userView: what the user has explicitly navigated to
  const [userView, setUserView] = useState<UserView>('collapsed')
  const [loadedImages, setLoadedImages] = useState<LoadedImages>({})

  // Celebration queue: FIFO list of completed sessions waiting to be shown
  const [celebrationQueue, setCelebrationQueue] = useState<ImageRevealSession[]>([])

  const loadingRef = useRef<Set<string>>(new Set())

  // ------------------------------------------------------------------
  // Load images for all active sessions
  // ------------------------------------------------------------------
  const loadSessionImage = useCallback(
    (session: ImageRevealSession) => {
      const { id, imageUrl } = session
      if (loadingRef.current.has(id) || loadedImages[id]) return

      loadingRef.current.add(id)
      loadImage(imageUrl)
        .then((img) => {
          setLoadedImages((prev) => ({ ...prev, [id]: img }))
        })
        .catch((err) => {
          console.warn('[ImageRevealPanel] Failed to load image for session', id, err)
        })
        .finally(() => {
          loadingRef.current.delete(id)
        })
    },
    [loadedImages],
  )

  useEffect(() => {
    for (const session of activeSessions) {
      loadSessionImage(session)
    }
  }, [activeSessions, loadSessionImage])

  // ------------------------------------------------------------------
  // Subscribe to store for completion events (outside React render cycle)
  // ------------------------------------------------------------------
  useEffect(() => {
    let prevCount = useImageRevealStore.getState().completedSessions.length

    const unsub = useImageRevealStore.subscribe((state) => {
      if (state.completedSessions.length <= prevCount) return

      const newlyCompleted = state.completedSessions.slice(prevCount)
      prevCount = state.completedSessions.length

      // Pre-load images for celebration
      for (const s of newlyCompleted) {
        if (!loadingRef.current.has(s.id)) {
          loadingRef.current.add(s.id)
          loadImage(s.imageUrl)
            .then((img) => {
              setLoadedImages((prev) => ({ ...prev, [s.id]: img }))
            })
            .catch((err) => {
              console.warn('[ImageRevealPanel] Failed to load celebration image', s.id, err)
            })
            .finally(() => {
              loadingRef.current.delete(s.id)
            })
        }
      }

      setCelebrationQueue((prev) => [...prev, ...newlyCompleted])
    })

    return unsub
  }, [])

  // ------------------------------------------------------------------
  // Derive effective panel state from user intent + data
  // ------------------------------------------------------------------

  // If the detailed session was abandoned, treat it as stack
  const resolvedUserView: UserView =
    typeof userView === 'object' && userView.kind === 'detail'
      ? activeSessions.some((s) => s.id === userView.sessionId)
        ? userView
        : 'stack'
      : userView

  // Nothing to show at all
  const hasAnything =
    activeSessions.length > 0 || celebrationQueue.length > 0

  if (!hasAnything) return null

  // If user is looking at something (not collapsed) and there is a celebration
  // pending, surface it immediately (the celebration takes over the panel).
  const showingCelebration =
    resolvedUserView !== 'collapsed' && celebrationQueue.length > 0

  // If sessions ran out but we're expanded without a celebration, collapse
  const effectiveUserView: UserView =
    activeSessions.length === 0 && !showingCelebration
      ? 'collapsed'
      : resolvedUserView

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------

  const collapse = () => setUserView('collapsed')

  const expand = () => setUserView('stack')

  const dismissCelebration = () => {
    // Pop head of queue
    setCelebrationQueue((prev) => prev.slice(1))
    // Return to appropriate view
    if (activeSessions.length > 0) {
      setUserView('stack')
    } else {
      setUserView('collapsed')
    }
  }

  const overallProgress =
    activeSessions.length === 0
      ? 0
      : activeSessions.reduce(
          (sum, s) => sum + Math.min(s.wordsWritten / s.wordGoal, 1),
          0,
        ) / activeSessions.length

  // ==================================================================
  // CELEBRATION (intercepts any expanded view)
  // ==================================================================
  if (showingCelebration) {
    const session = celebrationQueue[0]
    const image = loadedImages[session.id]

    return (
      <div className="fixed bottom-12 right-4 z-40 animate-fade-in">
        <div className="w-80 bg-gray-900 border border-gray-700 shadow-2xl rounded-lg overflow-hidden">
          <div className="p-3">
            <div className="text-center mb-2">
              <h3 className="text-lg font-bold text-emerald-400">Image Revealed!</h3>
              <p className="text-gray-400 text-xs mt-0.5">
                {session.wordGoal.toLocaleString()} words written
              </p>
            </div>
            <CelebrationCanvas session={session} image={image} />
            <PhotographerCredit session={session} />
          </div>
          <button
            onClick={dismissCelebration}
            className="w-full py-2 text-xs text-gray-400 hover:text-gray-300 border-t border-gray-700 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    )
  }

  // ==================================================================
  // COLLAPSED
  // ==================================================================
  if (effectiveUserView === 'collapsed') {
    const firstSession = activeSessions[0]
    const firstImage = firstSession ? loadedImages[firstSession.id] : undefined

    return (
      <div className="fixed bottom-12 right-4 z-40">
        <button
          onClick={expand}
          className="group relative flex items-center gap-2 bg-gray-900 border border-gray-700 shadow-2xl rounded-lg p-1.5 hover:border-gray-600 transition-colors"
          title="Expand image quests"
        >
          {firstSession && firstImage ? (
            <CollapsedThumbnail session={firstSession} image={firstImage} />
          ) : (
            <div className="w-16 h-16 rounded bg-gray-800" />
          )}

          <div className="pr-1.5 flex flex-col items-center gap-1">
            {activeSessions.length > 1 && (
              <span className="text-[10px] font-bold text-gray-300 bg-gray-700 rounded-full px-1.5 py-0.5 leading-none">
                {activeSessions.length}
              </span>
            )}
            <span className="text-xs text-gray-400 tabular-nums group-hover:text-gray-300">
              {Math.round(overallProgress * 100)}%
            </span>
          </div>

          {/* Dot when celebrations are waiting */}
          {celebrationQueue.length > 0 && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-gray-900" />
          )}
        </button>
      </div>
    )
  }

  // ==================================================================
  // STACK
  // ==================================================================
  if (effectiveUserView === 'stack') {
    return (
      <div className="fixed bottom-12 right-4 z-40 animate-fade-in">
        <div className="w-80 bg-gray-900 border border-gray-700 shadow-2xl rounded-lg overflow-hidden flex flex-col">
          <PanelHeader
            title={`Image Quests (${activeSessions.length})`}
            onCollapse={collapse}
          />

          <div className="overflow-y-auto max-h-[400px]">
            {activeSessions.map((session) => {
              const image = loadedImages[session.id]

              return (
                <button
                  key={session.id}
                  onClick={() => setUserView({ kind: 'detail', sessionId: session.id })}
                  className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-800 transition-colors border-b border-gray-800 last:border-b-0 text-left"
                >
                  <ThumbnailCanvas session={session} image={image} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-300 font-medium mb-1 truncate">
                      {session.wordGoal.toLocaleString()} words
                    </div>
                    <ProgressBar session={session} showText={false} />
                    <div className="text-[10px] text-gray-500 tabular-nums mt-1">
                      {session.wordsWritten.toLocaleString()} / {session.wordGoal.toLocaleString()}
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  // ==================================================================
  // DETAIL
  // ==================================================================
  // effectiveUserView here must be the detail object
  const detailView = effectiveUserView
  if (typeof detailView !== 'object' || detailView.kind !== 'detail') return null

  const session = activeSessions.find((s) => s.id === detailView.sessionId)
  if (!session) return null

  const image = loadedImages[session.id]
  const remaining = Math.max(session.wordGoal - session.wordsWritten, 0)

  return (
    <div className="fixed bottom-12 right-4 z-40 animate-fade-in">
      <div className="w-80 bg-gray-900 border border-gray-700 shadow-2xl rounded-lg overflow-hidden flex flex-col">
        <PanelHeader
          title="Image Quest"
          onBack={() => setUserView('stack')}
          onCollapse={collapse}
        />

        <div className="p-3">
          <DetailCanvas session={session} image={image} />
        </div>

        <div className="px-3 pb-2">
          <div className="flex items-center justify-between text-xs mb-1">
            <span className="text-gray-400 tabular-nums">
              {session.wordsWritten.toLocaleString()} / {session.wordGoal.toLocaleString()}
            </span>
            <span className="text-gray-500 tabular-nums">
              {remaining.toLocaleString()} left
            </span>
          </div>
          <ProgressBar session={session} showText={false} />
        </div>

        <div className="px-3 pb-1">
          <PhotographerCredit session={session} />
        </div>

        <div className="flex items-center justify-end px-3 py-2 border-t border-gray-700">
          <button
            onClick={() => {
              abandonSession(session.id)
              setUserView('stack')
            }}
            className="text-[10px] text-gray-600 hover:text-red-400 transition-colors"
            title="Abandon this quest"
          >
            Abandon
          </button>
        </div>
      </div>
    </div>
  )
}

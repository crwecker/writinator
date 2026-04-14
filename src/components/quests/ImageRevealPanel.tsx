import { useState, useEffect, useRef, useCallback } from 'react'
import { useImageRevealStore, PIXEL_LEVELS } from '../../stores/imageRevealStore'
import { usePlayerStore } from '../../stores/playerStore'
import { drawPixelated, animateReveal } from '../../lib/pixelate'
import { loadImage } from '../../lib/unsplash'
import { getTimerState } from '../../lib/timer'
import {
  CONSUMABLES,
  getItemById,
  getWeaponMultiplier,
  getArmorTimeBonus,
} from '../../lib/items'
import {
  calculateQuestReward,
  calculateDifficulty,
  getDifficultyColor,
  getDifficultyLabel,
  calculateBaseReward,
} from '../../lib/questRewards'
import type { ImageRevealSession, QuestResult } from '../../types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UserView = 'collapsed' | 'expanded'

interface LoadedImages {
  [sessionId: string]: HTMLImageElement
}

// Snapshot captured when a timed session resolves, for the result overlay
interface TimedResultSnapshot {
  sessionId: string
  result: QuestResult
  wordsWritten: number
  wordGoal: number
  coinsEarned: number
  imageUrl: string
  photographer?: string
  photographerUrl?: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

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
// Timer display for a single session
// ---------------------------------------------------------------------------

interface SessionTimerProps {
  session: ImageRevealSession
  isPaused: boolean
  pauseStartedAt: number | null
  compact?: boolean
}

function SessionTimer({ session, isPaused, pauseStartedAt, compact = false }: SessionTimerProps) {
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500)
    return () => clearInterval(id)
  }, [])

  if (!session.timeMinutes) return null

  const totalSeconds = session.timeMinutes * 60
  const startedAtMs = Date.parse(session.startedAt)
  const timerState = getTimerState(
    startedAtMs,
    totalSeconds,
    session.pausedDuration ?? 0,
    isPaused && pauseStartedAt !== null ? pauseStartedAt : undefined,
  )

  const pct = timerState.percentRemaining
  const timerColor =
    pct > 50
      ? 'text-white'
      : pct > 25
        ? 'text-amber-400'
        : pct > 10
          ? 'text-orange-400'
          : 'text-red-400'
  const pulse = pct <= 10 ? 'animate-pulse' : ''

  if (compact) {
    return (
      <span className={`text-xs font-mono font-semibold tabular-nums ${timerColor} ${pulse}`}>
        {isPaused ? 'PAUSED' : formatTime(timerState.remainingSeconds)}
      </span>
    )
  }

  return (
    <div className="flex items-center justify-between">
      <span className="text-[10px] text-gray-500">Time remaining</span>
      <span className={`text-sm font-mono font-semibold tabular-nums ${timerColor} ${pulse}`}>
        {isPaused ? <span className="text-amber-400">PAUSED</span> : formatTime(timerState.remainingSeconds)}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Consumable buttons (shown for timed sessions)
// ---------------------------------------------------------------------------

interface ConsumableButtonsProps {
  inventory: Record<string, number>
  onUse: (itemId: string) => void
}

function ConsumableButtons({ inventory, onUse }: ConsumableButtonsProps) {
  if (CONSUMABLES.length === 0) return null
  return (
    <div>
      <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1.5">Consumables</p>
      <div className="flex items-center gap-2 flex-wrap">
        {CONSUMABLES.map((item) => {
          const count = inventory[item.id] ?? 0
          return (
            <button
              key={item.id}
              onClick={() => onUse(item.id)}
              disabled={count === 0}
              title={`${item.name}: ${item.description}`}
              className="relative bg-gray-700 hover:bg-gray-600 rounded p-1.5 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <span className="text-base leading-none">{item.icon}</span>
              {count > 0 && (
                <span className="absolute -top-1 -right-1 bg-amber-600 text-white text-[9px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center leading-none">
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Result overlay — timed success
// ---------------------------------------------------------------------------

interface TimedSuccessOverlayProps {
  snapshot: TimedResultSnapshot
  image: HTMLImageElement | undefined
  onDone: () => void
}

function TimedSuccessOverlay({ snapshot, image, onDone }: TimedSuccessOverlayProps) {
  // Fake session shape to render CelebrationCanvas
  const fakeSession: ImageRevealSession = {
    id: snapshot.sessionId,
    imageUrl: snapshot.imageUrl,
    imageWidth: 0,
    imageHeight: 0,
    wordGoal: snapshot.wordGoal,
    wordsWritten: snapshot.wordsWritten,
    currentLevel: PIXEL_LEVELS.length - 1,
    completed: true,
    startedAt: new Date().toISOString(),
    photographer: snapshot.photographer,
    photographerUrl: snapshot.photographerUrl,
  }

  return (
    <div className="fixed bottom-12 right-4 z-40 animate-fade-in">
      <div className="w-80 bg-gray-900 border border-gray-700 shadow-2xl rounded-lg overflow-hidden">
        <div className="p-3 flex flex-col gap-3">
          <div className="text-center">
            <h3 className="text-lg font-bold text-emerald-400">Quest Complete!</h3>
          </div>
          <CelebrationCanvas session={fakeSession} image={image} />
          {snapshot.photographer && (
            <p className="text-center text-gray-500 text-[10px]">
              Photo by{' '}
              {snapshot.photographerUrl ? (
                <a href={snapshot.photographerUrl} target="_blank" rel="noopener noreferrer" className="text-gray-400 underline">
                  {snapshot.photographer}
                </a>
              ) : snapshot.photographer}{' '}
              on Unsplash
            </p>
          )}
          <div className="flex items-center justify-center gap-2">
            <span className="text-xl">&#x1FA99;</span>
            <span className="text-emerald-400 font-medium text-sm">+{snapshot.coinsEarned} coins</span>
          </div>
        </div>
        <button
          onClick={onDone}
          className="w-full py-2 text-xs text-gray-400 hover:text-gray-300 border-t border-gray-700 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Result overlay — timed failure
// ---------------------------------------------------------------------------

interface TimedFailureOverlayProps {
  snapshot: TimedResultSnapshot
  image: HTMLImageElement | undefined
  onDone: () => void
}

function TimedFailureOverlay({ snapshot, image, onDone }: TimedFailureOverlayProps) {
  return (
    <div className="fixed bottom-12 right-4 z-40 animate-fade-in">
      <div className="w-80 bg-gray-900 border border-gray-700 shadow-2xl rounded-lg overflow-hidden">
        <div className="p-3 flex flex-col gap-3">
          <div className="text-center">
            <h3 className="text-lg font-bold text-orange-400">Time&rsquo;s Up!</h3>
          </div>
          {image && (
            <img
              src={snapshot.imageUrl}
              alt="Partial quest image"
              className="w-[280px] h-[280px] mx-auto rounded object-cover bg-gray-800 opacity-50"
              crossOrigin="anonymous"
            />
          )}
          <p className="text-center text-gray-400 text-xs">
            {snapshot.wordsWritten.toLocaleString()} / {snapshot.wordGoal.toLocaleString()} words
          </p>
          {snapshot.coinsEarned > 0 && (
            <div className="flex items-center justify-center gap-2">
              <span className="text-xl">&#x1FA99;</span>
              <span className="text-amber-400 font-medium text-sm">+{snapshot.coinsEarned} partial coins</span>
            </div>
          )}
        </div>
        <button
          onClick={onDone}
          className="w-full py-2 text-xs text-gray-400 hover:text-gray-300 border-t border-gray-700 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function ImageRevealPanel() {
  const activeSessions = useImageRevealStore((s) => s.activeSessions)
  const isPaused = useImageRevealStore((s) => s.isPaused)
  const pauseStartedAt = useImageRevealStore((s) => s.pauseStartedAt)
  const equippedWeapon = usePlayerStore((s) => s.equippedWeapon)
  const equippedArmor = usePlayerStore((s) => s.equippedArmor)
  const consumableInventory = usePlayerStore((s) => s.consumableInventory)

  const [userView, setUserView] = useState<UserView>('collapsed')
  const [loadedImages, setLoadedImages] = useState<LoadedImages>({})
  const [celebrationQueue, setCelebrationQueue] = useState<ImageRevealSession[]>([])
  const [timedResultQueue, setTimedResultQueue] = useState<TimedResultSnapshot[]>([])

  const loadingRef = useRef<Set<string>>(new Set())

  const hasTimedSessions = activeSessions.some((s) => s.timeMinutes !== undefined)

  // ------------------------------------------------------------------
  // Timer tick for timed sessions
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!hasTimedSessions) return
    const id = setInterval(() => {
      useImageRevealStore.getState().tickTimer()
    }, 1000)
    return () => clearInterval(id)
  }, [hasTimedSessions])

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
    let prevCompleted = useImageRevealStore.getState().completedSessions.length
    const weaponMultiplier = getWeaponMultiplier(usePlayerStore.getState().equippedWeapon)

    const unsub = useImageRevealStore.subscribe((state) => {
      if (state.completedSessions.length <= prevCompleted) return

      const newlyCompleted = state.completedSessions.slice(prevCompleted)
      prevCompleted = state.completedSessions.length

      for (const s of newlyCompleted) {
        // Pre-load image
        if (!loadingRef.current.has(s.id) && !loadedImages[s.id]) {
          loadingRef.current.add(s.id)
          loadImage(s.imageUrl)
            .then((img) => {
              setLoadedImages((prev) => ({ ...prev, [s.id]: img }))
            })
            .catch((err) => {
              console.warn('[ImageRevealPanel] Failed to load completion image', s.id, err)
            })
            .finally(() => {
              loadingRef.current.delete(s.id)
            })
        }

        if (s.timeMinutes !== undefined) {
          // Timed session — show timed result overlay instead of generic celebration
          if (s.result === 'abandoned') continue

          const isSuccess = s.result === 'success' || (s.completed && !s.result)
          const coinsEarned = s.coinsEarned ?? (() => {
            if (isSuccess) {
              const difficulty = calculateDifficulty(s.wordGoal, s.timeMinutes)
              return calculateQuestReward({
                wordGoal: s.wordGoal,
                wordsWritten: s.wordsWritten,
                weaponMultiplier,
                timeMinutes: s.timeMinutes,
                timeUsedSeconds: 0,
                difficulty,
              })
            }
            // partial failure reward
            return Math.floor(calculateBaseReward(s.wordGoal, weaponMultiplier) * (s.wordsWritten / s.wordGoal) * 0.5)
          })()

          setTimedResultQueue((prev) => [
            ...prev,
            {
              sessionId: s.id,
              result: isSuccess ? 'success' : 'failure',
              wordsWritten: s.wordsWritten,
              wordGoal: s.wordGoal,
              coinsEarned,
              imageUrl: s.imageUrl,
              photographer: s.photographer,
              photographerUrl: s.photographerUrl,
            },
          ])
        } else {
          // Non-timed — standard celebration
          setCelebrationQueue((prev) => [...prev, s])
        }
      }
    })

    return unsub
  }, [loadedImages])

  // ------------------------------------------------------------------
  // Derive effective panel state from user intent + data
  // ------------------------------------------------------------------
  const hasAnything =
    activeSessions.length > 0 ||
    celebrationQueue.length > 0 ||
    timedResultQueue.length > 0

  if (!hasAnything) return null

  const showingCelebration =
    userView !== 'collapsed' && celebrationQueue.length > 0

  const showingTimedResult =
    userView !== 'collapsed' && timedResultQueue.length > 0

  const effectiveUserView: UserView =
    activeSessions.length === 0 && !showingCelebration && !showingTimedResult
      ? 'collapsed'
      : userView

  // ------------------------------------------------------------------
  // Helpers
  // ------------------------------------------------------------------
  const collapse = () => setUserView('collapsed')
  const expand = () => setUserView('expanded')

  const dismissCelebration = () => {
    setCelebrationQueue((prev) => prev.slice(1))
    if (activeSessions.length > 0) {
      setUserView('expanded')
    } else {
      setUserView('collapsed')
    }
  }

  const dismissTimedResult = () => {
    setTimedResultQueue((prev) => prev.slice(1))
    if (activeSessions.length > 0) {
      setUserView('expanded')
    } else {
      setUserView('collapsed')
    }
  }

  const handlePauseResume = () => {
    if (isPaused) {
      useImageRevealStore.getState().resumeTimer()
    } else {
      useImageRevealStore.getState().pauseTimer()
    }
  }

  const handleUseConsumable = (itemId: string) => {
    useImageRevealStore.getState().useConsumable(itemId)
  }

  const overallProgress =
    activeSessions.length === 0
      ? 0
      : activeSessions.reduce(
          (sum, s) => sum + Math.min(s.wordsWritten / s.wordGoal, 1),
          0,
        ) / activeSessions.length

  // ------------------------------------------------------------------
  // TIMED RESULT (intercepts expanded view — check before celebration)
  // ------------------------------------------------------------------
  if (showingTimedResult && timedResultQueue.length > 0) {
    const snapshot = timedResultQueue[0]
    const image = loadedImages[snapshot.sessionId]
    if (snapshot.result === 'success') {
      return (
        <TimedSuccessOverlay
          snapshot={snapshot}
          image={image}
          onDone={dismissTimedResult}
        />
      )
    } else {
      return (
        <TimedFailureOverlay
          snapshot={snapshot}
          image={image}
          onDone={dismissTimedResult}
        />
      )
    }
  }

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
            {session.coinsEarned !== undefined && session.coinsEarned > 0 && (
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className="text-xl">&#x1FA99;</span>
                <span className="text-amber-400 font-medium text-sm">+{session.coinsEarned} coins</span>
              </div>
            )}
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
    const firstTimedSession = activeSessions.find((s) => s.timeMinutes !== undefined)

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
            {firstTimedSession && (
              <SessionTimer
                session={firstTimedSession}
                isPaused={isPaused}
                pauseStartedAt={pauseStartedAt}
                compact
              />
            )}
          </div>

          {/* Dot when celebrations are waiting */}
          {(celebrationQueue.length > 0 || timedResultQueue.length > 0) && (
            <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-gray-900" />
          )}
        </button>
      </div>
    )
  }

  // ==================================================================
  // EXPANDED — all sessions at full size, pinned as right sidebar
  // ==================================================================
  return (
    <aside className="relative flex flex-col bg-gray-900 border-t border-gray-700 w-full shrink-0 overflow-hidden animate-fade-in">
        <button
          onClick={collapse}
          className="absolute top-1 right-2 z-10 text-gray-500 hover:text-gray-300 text-xs leading-none p-1"
          title="Minimize"
        >
          &#x2015;
        </button>

        <div className="flex overflow-x-auto">
          {activeSessions.map((session) => {
            const image = loadedImages[session.id]
            const remaining = Math.max(session.wordGoal - session.wordsWritten, 0)
            const isTimed = session.timeMinutes !== undefined

            // For timed sessions, calculate difficulty and reward preview
            const difficulty = isTimed
              ? calculateDifficulty(session.wordGoal, session.timeMinutes!)
              : null
            const difficultyColorClass = difficulty ? getDifficultyColor(difficulty) : ''

            const weaponItem = getItemById(equippedWeapon)
            const weaponMultiplier = getWeaponMultiplier(equippedWeapon)
            const coinEstimate = calculateBaseReward(session.wordGoal, weaponMultiplier)
            const textShadow = '[text-shadow:0_1px_2px_rgba(0,0,0,0.95)]'

            return (
              <div
                key={session.id}
                className="shrink-0 w-[280px] border-r border-gray-800 last:border-r-0"
              >
                {/* Image with overlaid text */}
                <div className="relative">
                  <DetailCanvas session={session} image={image} />

                  {/* Top-left: difficulty + timer (timed only) */}
                  {isTimed && (
                    <div className="absolute top-1 left-2 flex flex-col items-start gap-0.5">
                      {difficulty && (
                        <span className={`text-[10px] font-medium ${difficultyColorClass} ${textShadow}`}>
                          {getDifficultyLabel(difficulty)}
                        </span>
                      )}
                      <span className={textShadow}>
                        <SessionTimer
                          session={session}
                          isPaused={isPaused}
                          pauseStartedAt={pauseStartedAt}
                          compact
                        />
                      </span>
                    </div>
                  )}

                  {/* Bottom gradient with progress + word counts + RPG info */}
                  <div className="absolute inset-x-0 bottom-0 px-2 pt-6 pb-2 space-y-1 bg-gradient-to-t from-black/85 via-black/55 to-transparent">
                    <ProgressBar session={session} showText={false} />
                    <div className={`flex items-center justify-between text-[10px] text-gray-100 tabular-nums ${textShadow}`}>
                      <span>
                        {session.wordsWritten.toLocaleString()} / {session.wordGoal.toLocaleString()}
                      </span>
                      <span>
                        {remaining.toLocaleString()} left
                      </span>
                    </div>
                    <div className={`flex items-center justify-between text-[10px] ${textShadow}`}>
                      {weaponItem ? (
                        <span className="text-gray-200">{weaponItem.icon} {weaponItem.name} ({weaponMultiplier}x)</span>
                      ) : (
                        <span />
                      )}
                      <span className="text-amber-300">~{coinEstimate} coins</span>
                    </div>
                  </div>
                </div>

                {/* Controls — only for timed sessions */}
                {isTimed && (
                  <div className="px-2 py-2 space-y-2">
                    {/* Armor time bonus info if equipped */}
                    {(() => {
                      const bonus = getArmorTimeBonus(equippedArmor)
                      const armorItem = getItemById(equippedArmor)
                      if (bonus <= 0 || !armorItem) return null
                      return (
                        <p className="text-[10px] text-gray-600">
                          {armorItem.icon} {armorItem.name} (+{Math.round(bonus * 100)}% time)
                        </p>
                      )
                    })()}

                    {/* Consumables */}
                    <ConsumableButtons
                      inventory={consumableInventory}
                      onUse={handleUseConsumable}
                    />

                    {/* Pause/Resume */}
                    <button
                      onClick={handlePauseResume}
                      className="w-full text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-2 py-1.5 transition-colors"
                    >
                      {isPaused ? '\u25B6 Resume' : '\u23F8 Pause'}
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
    </aside>
  )
}

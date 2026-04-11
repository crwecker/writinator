import { useState, useEffect, useRef } from 'react'
import { useImageRevealStore, PIXEL_LEVELS } from '../../stores/imageRevealStore'
import { usePlayerStore } from '../../stores/playerStore'
import { fetchRandomImage } from '../../lib/unsplash'
import { getItemById, getWeaponMultiplier, getArmorTimeBonus } from '../../lib/items'
import {
  calculateDifficulty,
  getDifficultyLabel,
  calculateQuestReward,
  calculateBaseReward,
} from '../../lib/questRewards'
import type { ImageRevealSession, QuestDifficulty } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
}

const WORD_GOAL_PRESETS = [250, 500, 1000, 2000, 5000]
const TIME_PRESETS = [5, 10, 15, 30, 60]

const MAX_LEVEL_INDEX = PIXEL_LEVELS.length - 1

function getBlurStyle(currentLevel: number): string {
  const fraction = currentLevel / MAX_LEVEL_INDEX
  const blurPx = Math.round((1 - fraction) * 12)
  return blurPx > 0 ? `blur(${blurPx}px)` : 'none'
}

function difficultyBgClass(difficulty: QuestDifficulty): string {
  switch (difficulty) {
    case 'easy':   return 'bg-emerald-900/40 text-emerald-400 border border-emerald-700'
    case 'medium': return 'bg-amber-900/40 text-amber-400 border border-amber-700'
    case 'hard':   return 'bg-orange-900/40 text-orange-400 border border-orange-700'
    case 'epic':   return 'bg-purple-900/40 text-purple-400 border border-purple-700'
  }
}

function resultLabel(result: ImageRevealSession['result']): string {
  switch (result) {
    case 'success':   return 'Success'
    case 'failure':   return 'Failed'
    case 'abandoned': return 'Abandoned'
    default:          return ''
  }
}

function resultColorClass(result: ImageRevealSession['result']): string {
  switch (result) {
    case 'success':   return 'text-emerald-400'
    case 'failure':   return 'text-red-400'
    case 'abandoned': return 'text-gray-500'
    default:          return 'text-gray-500'
  }
}

// ---------------------------------------------------------------------------
// Active session card
// ---------------------------------------------------------------------------

interface ActiveSessionCardProps {
  session: ImageRevealSession
  onAbandon: (id: string) => void
}

function ActiveSessionCard({ session, onAbandon }: ActiveSessionCardProps) {
  const progress = session.wordGoal > 0 ? session.wordsWritten / session.wordGoal : 0
  const progressPct = Math.min(progress * 100, 100)
  const blurFilter = getBlurStyle(session.currentLevel)
  const [confirmAbandon, setConfirmAbandon] = useState(false)

  return (
    <div className="flex items-center gap-3 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2">
      <div className="shrink-0 w-12 h-12 rounded overflow-hidden bg-gray-700">
        <img
          src={session.imageUrl}
          alt="Quest image"
          crossOrigin="anonymous"
          className="w-full h-full object-cover"
          style={{
            imageRendering: 'pixelated',
            filter: blurFilter,
          }}
        />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-400 mb-1">
          {session.wordGoal.toLocaleString()} words
          {session.timeMinutes !== undefined && (
            <span className="ml-1.5 text-amber-500 font-medium">{session.timeMinutes}m timer</span>
          )}
        </p>
        <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden mb-1">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <p className="text-[10px] text-gray-500">
          {session.wordsWritten.toLocaleString()} / {session.wordGoal.toLocaleString()} words
        </p>
      </div>

      <div className="shrink-0">
        {!confirmAbandon ? (
          <button
            onClick={() => setConfirmAbandon(true)}
            className="text-gray-600 hover:text-gray-300 transition-colors text-xs px-1 py-0.5 rounded"
            title="Abandon quest"
          >
            &#x2715;
          </button>
        ) : (
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={() => onAbandon(session.id)}
              className="text-[10px] bg-red-900 hover:bg-red-800 text-red-300 rounded px-1.5 py-0.5"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmAbandon(false)}
              className="text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-400 rounded px-1.5 py-0.5"
            >
              No
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main QuestPicker
// ---------------------------------------------------------------------------

export function QuestPicker({ open, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  const activeSessions = useImageRevealStore((s) => s.activeSessions)
  const completedSessions = useImageRevealStore((s) => s.completedSessions)
  const abandonSession = useImageRevealStore((s) => s.abandonSession)

  const equippedWeapon = usePlayerStore((s) => s.equippedWeapon)
  const equippedArmor = usePlayerStore((s) => s.equippedArmor)

  // Word goal form
  const [wordGoal, setWordGoal] = useState(500)
  const [isCustomGoal, setIsCustomGoal] = useState(false)
  const [customGoal, setCustomGoal] = useState('')

  // Timer toggle
  const [timerEnabled, setTimerEnabled] = useState(false)
  const [timeMinutes, setTimeMinutes] = useState(15)
  const [isCustomTime, setIsCustomTime] = useState(false)
  const [customTime, setCustomTime] = useState('')

  // Loading / error state
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Completed gallery
  const [viewingImage, setViewingImage] = useState<string | null>(null)

  const effectiveWordGoal = isCustomGoal ? parseInt(customGoal, 10) || null : wordGoal
  const effectiveTimeMinutes = isCustomTime ? parseInt(customTime, 10) || null : timeMinutes

  const weaponMultiplier = getWeaponMultiplier(equippedWeapon)
  const armorTimeBonus = getArmorTimeBonus(equippedArmor)
  const weaponItem = getItemById(equippedWeapon)
  const armorItem = getItemById(equippedArmor)

  const canStart =
    effectiveWordGoal !== null &&
    !isNaN(effectiveWordGoal) &&
    effectiveWordGoal > 0 &&
    (!timerEnabled ||
      (effectiveTimeMinutes !== null && !isNaN(effectiveTimeMinutes) && effectiveTimeMinutes > 0))

  const difficulty: QuestDifficulty | null =
    timerEnabled && canStart && effectiveWordGoal !== null && effectiveTimeMinutes !== null
      ? calculateDifficulty(effectiveWordGoal, effectiveTimeMinutes)
      : null

  const rewardPreview: number = (() => {
    if (!canStart || effectiveWordGoal === null) return 0
    if (timerEnabled && difficulty !== null && effectiveTimeMinutes !== null) {
      return calculateQuestReward({
        wordGoal: effectiveWordGoal,
        wordsWritten: effectiveWordGoal,
        weaponMultiplier,
        timeMinutes: effectiveTimeMinutes,
        timeUsedSeconds: 0,
        difficulty,
      })
    }
    return calculateBaseReward(effectiveWordGoal, weaponMultiplier)
  })()

  // Reset error when opened
  useEffect(() => {
    if (open) setError(null)
  }, [open])

  // Escape key
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Click outside
  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open, onClose])

  if (!open) return null

  async function handleStartQuest() {
    setLoading(true)
    setError(null)
    try {
      const goal = effectiveWordGoal
      if (!goal || goal < 1 || goal > 100000) {
        setError('Please enter a word goal between 1 and 100,000.')
        setLoading(false)
        return
      }
      if (timerEnabled) {
        const mins = effectiveTimeMinutes
        if (!mins || mins < 1 || mins > 1440) {
          setError('Please enter a time between 1 and 1440 minutes.')
          setLoading(false)
          return
        }
      }
      const img = await fetchRandomImage()
      useImageRevealStore.getState().startSession(
        img.url, img.width, img.height, goal,
        img.photographer, img.photographerUrl, img.id,
        timerEnabled && effectiveTimeMinutes !== null ? effectiveTimeMinutes : undefined,
      )
      onClose()
    } catch {
      setError('Failed to fetch image. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const presetButtonClass = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-mono transition-colors ${
      active
        ? 'bg-blue-600 text-white'
        : 'bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700'
    }`

  const timePresetButtonClass = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-mono transition-colors ${
      active
        ? 'bg-amber-600 text-white'
        : 'bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700'
    }`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        ref={panelRef}
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[520px] max-w-[92vw] max-h-[84vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <span className="text-sm font-medium text-gray-200">Writing Quests</span>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-xs"
          >
            Close
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* New Quest creation form */}
          <section>
            <p className="text-xs font-medium text-gray-400 mb-2">New Quest</p>

            {/* Word goal presets */}
            <div className="flex flex-wrap gap-2 mb-2">
              {WORD_GOAL_PRESETS.map((g) => (
                <button
                  key={g}
                  onClick={() => { setWordGoal(g); setIsCustomGoal(false) }}
                  className={presetButtonClass(!isCustomGoal && wordGoal === g)}
                >
                  {g.toLocaleString()}
                </button>
              ))}
              <button
                onClick={() => setIsCustomGoal(true)}
                className={presetButtonClass(isCustomGoal)}
              >
                Custom
              </button>
            </div>

            {isCustomGoal && (
              <input
                type="number"
                value={customGoal}
                onChange={(e) => setCustomGoal(e.target.value)}
                placeholder="Enter word count..."
                className="mb-3 w-full px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
                min={1}
                autoFocus
              />
            )}

            <p className="text-[10px] text-gray-600 mb-3">
              Write to reveal a random photo, one pixel layer at a time.
            </p>

            {/* Add Timer toggle */}
            <div className="flex items-center gap-3 mb-3">
              <button
                onClick={() => setTimerEnabled((v) => !v)}
                className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 transition-colors duration-200 focus:outline-none ${
                  timerEnabled ? 'bg-amber-600 border-amber-600' : 'bg-gray-700 border-gray-600'
                }`}
                role="switch"
                aria-checked={timerEnabled}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow transform transition-transform duration-200 mt-px ${
                    timerEnabled ? 'translate-x-3.5' : 'translate-x-0.5'
                  }`}
                />
              </button>
              <span className="text-xs text-gray-400">Add Timer</span>
            </div>

            {/* Timer options (shown when timer toggled on) */}
            {timerEnabled && (
              <div className="pl-3 border-l-2 border-amber-700/40 mb-3 space-y-3">
                <div>
                  <p className="text-xs font-medium text-gray-400 mb-2">Time Limit</p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    {TIME_PRESETS.map((t) => (
                      <button
                        key={t}
                        onClick={() => { setTimeMinutes(t); setIsCustomTime(false) }}
                        className={timePresetButtonClass(!isCustomTime && timeMinutes === t)}
                      >
                        {t}m
                      </button>
                    ))}
                    <button
                      onClick={() => setIsCustomTime(true)}
                      className={timePresetButtonClass(isCustomTime)}
                    >
                      Custom
                    </button>
                  </div>
                  {isCustomTime && (
                    <input
                      type="number"
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                      placeholder="Minutes..."
                      className="w-full px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
                      min={1}
                      autoFocus
                    />
                  )}
                </div>

                {/* Difficulty badge */}
                {difficulty !== null && (
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500">Difficulty</span>
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${difficultyBgClass(difficulty)}`}>
                      {getDifficultyLabel(difficulty)}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Equipment display */}
            {(weaponItem || (armorItem && timerEnabled && armorTimeBonus > 0)) && (
              <div className="bg-gray-800/60 border border-gray-700 rounded-lg px-3 py-2 mb-3 space-y-1">
                {weaponItem && (
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-gray-500">{weaponItem.icon} {weaponItem.name}</span>
                    {weaponMultiplier !== 1.0 && (
                      <span className="text-amber-500">+{Math.round((weaponMultiplier - 1) * 100)}% words</span>
                    )}
                  </div>
                )}
                {armorItem && timerEnabled && armorTimeBonus > 0 && (
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-gray-500">{armorItem.icon} {armorItem.name}</span>
                    <span className="text-blue-400">+{Math.round(armorTimeBonus * 100)}% time</span>
                  </div>
                )}
              </div>
            )}

            {/* Reward preview */}
            {canStart && (
              <div className="flex items-center justify-between text-xs text-gray-500 mb-3 px-1">
                <span>Estimated reward</span>
                <span className="text-amber-400 font-medium">~{rewardPreview} coins</span>
              </div>
            )}

            {error && (
              <p className="text-xs text-red-400 mb-2">{error}</p>
            )}

            <button
              onClick={handleStartQuest}
              disabled={loading || !canStart || activeSessions.length >= 25}
              className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
            >
              {activeSessions.length >= 25
                ? 'Quest limit reached (25)'
                : loading
                  ? 'Finding image...'
                  : timerEnabled
                    ? 'Start Timed Quest'
                    : 'Start Quest'}
            </button>
          </section>

          {/* Active Sessions */}
          {activeSessions.length > 0 && (
            <section>
              <p className="text-xs font-medium text-gray-400 mb-2">
                Active Quests <span className="text-gray-600">({activeSessions.length})</span>
              </p>
              <div className="space-y-2">
                {activeSessions.map((session) => (
                  <ActiveSessionCard
                    key={session.id}
                    session={session}
                    onAbandon={abandonSession}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Completed Gallery */}
          {completedSessions.length > 0 && (
            <section>
              <p className="text-xs font-medium text-gray-400 mb-2">
                Completed <span className="text-gray-600">({completedSessions.length})</span>
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[...completedSessions].reverse().map((session) => (
                  <button
                    key={session.id}
                    onClick={() =>
                      setViewingImage(viewingImage === session.id ? null : session.id)
                    }
                    className="relative aspect-[4/3] rounded-lg overflow-hidden border border-gray-700 hover:border-gray-500 transition-colors group"
                  >
                    <img
                      src={session.imageUrl}
                      alt={session.photographer ? `Photo by ${session.photographer}` : 'Revealed image'}
                      className="w-full h-full object-cover"
                      crossOrigin="anonymous"
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-end">
                      <div className="w-full px-1.5 py-1 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                        <p className="text-[9px] text-gray-300 truncate">
                          {session.wordGoal.toLocaleString()} words
                        </p>
                        {session.coinsEarned !== undefined && (
                          <p className="text-[9px] text-amber-400 truncate">
                            +{session.coinsEarned} coins
                          </p>
                        )}
                        {session.result && (
                          <p className={`text-[9px] truncate ${resultColorClass(session.result)}`}>
                            {resultLabel(session.result)}
                          </p>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>

              {viewingImage && (() => {
                const session = completedSessions.find((s) => s.id === viewingImage)
                if (!session) return null
                return (
                  <div className="mt-2 rounded-lg overflow-hidden border border-gray-700 bg-gray-800">
                    <img
                      src={session.imageUrl}
                      alt={session.photographer ? `Photo by ${session.photographer}` : 'Revealed image'}
                      className="w-full object-contain max-h-[300px]"
                      crossOrigin="anonymous"
                    />
                    <div className="px-3 py-2 flex items-center justify-between">
                      <div>
                        {session.photographer && (
                          <a
                            href={session.photographerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
                          >
                            {session.photographer}
                          </a>
                        )}
                        <p className="text-[10px] text-gray-500">
                          {session.wordGoal.toLocaleString()} words
                          {session.completedAt && (
                            <> &middot; {new Date(session.completedAt).toLocaleDateString()}</>
                          )}
                          {session.coinsEarned !== undefined && (
                            <> &middot; <span className="text-amber-400">+{session.coinsEarned} coins</span></>
                          )}
                        </p>
                      </div>
                      {session.unsplashId && (
                        <a
                          href={`https://unsplash.com/photos/${session.unsplashId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                        >
                          View on Unsplash
                        </a>
                      )}
                    </div>
                  </div>
                )
              })()}
            </section>
          )}

        </div>
      </div>
    </div>
  )
}

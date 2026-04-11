import { useState, useEffect, useRef } from 'react'
import { useImageRevealStore, PIXEL_LEVELS } from '../../stores/imageRevealStore'
import { useTimedQuestStore } from '../../stores/timedQuestStore'
import { usePlayerStore } from '../../stores/playerStore'
import { fetchRandomImage } from '../../lib/unsplash'
import { getItemById, getWeaponMultiplier, getArmorTimeBonus } from '../../lib/items'
import {
  calculateDifficulty,
  calculateReward,
  getDifficultyLabel,
} from '../../lib/questRewards'
import { getTimerState } from '../../lib/timer'
import type { ImageRevealSession, TimedQuest, QuestDifficulty } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
}

type Tab = 'image' | 'timed'

const IMAGE_GOAL_PRESETS = [250, 500, 1000, 2000, 5000]
const TIMED_WORD_PRESETS = [250, 500, 1000, 2000]
const TIMED_TIME_PRESETS = [5, 10, 15, 30, 60]

const MAX_LEVEL_INDEX = PIXEL_LEVELS.length - 1

function getBlurStyle(currentLevel: number): string {
  const fraction = currentLevel / MAX_LEVEL_INDEX
  const blurPx = Math.round((1 - fraction) * 12)
  return blurPx > 0 ? `blur(${blurPx}px)` : 'none'
}

function difficultyColorClass(difficulty: QuestDifficulty): string {
  switch (difficulty) {
    case 'easy':   return 'text-emerald-400'
    case 'medium': return 'text-amber-400'
    case 'hard':   return 'text-orange-400'
    case 'epic':   return 'text-purple-400'
  }
}

function difficultyBgClass(difficulty: QuestDifficulty): string {
  switch (difficulty) {
    case 'easy':   return 'bg-emerald-900/40 text-emerald-400 border-emerald-700'
    case 'medium': return 'bg-amber-900/40 text-amber-400 border-amber-700'
    case 'hard':   return 'bg-orange-900/40 text-orange-400 border-orange-700'
    case 'epic':   return 'bg-purple-900/40 text-purple-400 border-purple-700'
  }
}

function formatSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function resultLabel(result: TimedQuest['result']): string {
  switch (result) {
    case 'success':   return 'Success'
    case 'failure':   return 'Failed'
    case 'abandoned': return 'Abandoned'
    default:          return ''
  }
}

function resultColorClass(result: TimedQuest['result']): string {
  switch (result) {
    case 'success':   return 'text-emerald-400'
    case 'failure':   return 'text-red-400'
    case 'abandoned': return 'text-gray-500'
    default:          return 'text-gray-500'
  }
}

interface ActiveSessionCardProps {
  session: ImageRevealSession
  onAbandon: (id: string) => void
}

function ActiveSessionCard({ session, onAbandon }: ActiveSessionCardProps) {
  const progress = session.wordGoal > 0 ? session.wordsWritten / session.wordGoal : 0
  const progressPct = Math.min(progress * 100, 100)
  const blurFilter = getBlurStyle(session.currentLevel)

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

      <button
        onClick={() => onAbandon(session.id)}
        className="shrink-0 text-gray-600 hover:text-gray-300 transition-colors text-xs px-1 py-0.5 rounded"
        title="Abandon quest"
      >
        ✕
      </button>
    </div>
  )
}

// ---- Active Timed Quest Card ----

interface ActiveTimedQuestCardProps {
  quest: TimedQuest
  onAbandon: () => void
}

function ActiveTimedQuestCard({ quest, onAbandon }: ActiveTimedQuestCardProps) {
  const isPaused = useTimedQuestStore((s) => s.isPaused)
  const pauseStartedAt = useTimedQuestStore((s) => s.pauseStartedAt)
  const [, setTick] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const totalSeconds = quest.timeMinutes * 60
  const startedAtMs = Date.parse(quest.startedAt)
  const timerState = getTimerState(
    startedAtMs,
    totalSeconds,
    quest.pausedDuration,
    isPaused && pauseStartedAt !== null ? pauseStartedAt : undefined,
  )

  const progress = quest.wordGoal > 0 ? quest.wordsWritten / quest.wordGoal : 0
  const progressPct = Math.min(progress * 100, 100)
  const difficulty = calculateDifficulty(quest.wordGoal, quest.timeMinutes)

  const timeColor =
    timerState.percentRemaining > 50
      ? 'text-emerald-400'
      : timerState.percentRemaining > 20
      ? 'text-amber-400'
      : 'text-red-400'

  return (
    <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-200">Active Quest</span>
        <span className={`text-xs font-mono font-medium border px-1.5 py-0.5 rounded ${difficultyBgClass(difficulty)}`}>
          {getDifficultyLabel(difficulty)}
        </span>
      </div>

      {/* Word progress */}
      <div>
        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
          <span>{quest.wordsWritten.toLocaleString()} words</span>
          <span>{quest.wordGoal.toLocaleString()} goal</span>
        </div>
        <div className="w-full h-1.5 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-blue-500 rounded-full transition-all"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {/* Timer */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-500">Time remaining</span>
        <span className={`text-sm font-mono font-semibold ${timeColor}`}>
          {isPaused ? (
            <span className="text-amber-400">PAUSED</span>
          ) : (
            formatSeconds(timerState.remainingSeconds)
          )}
        </span>
      </div>

      <button
        onClick={onAbandon}
        className="w-full py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs text-gray-300 transition-colors"
      >
        Abandon Quest
      </button>
    </div>
  )
}

// ---- Timed Quest Creation Form ----

function TimedQuestForm() {
  const equippedWeapon = usePlayerStore((s) => s.equippedWeapon)
  const equippedArmor = usePlayerStore((s) => s.equippedArmor)

  const [wordGoal, setWordGoal] = useState<number | null>(500)
  const [isCustomWord, setIsCustomWord] = useState(false)
  const [customWordGoal, setCustomWordGoal] = useState('')

  const [timeMinutes, setTimeMinutes] = useState<number | null>(15)
  const [isCustomTime, setIsCustomTime] = useState(false)
  const [customTime, setCustomTime] = useState('')

  const effectiveWordGoal = isCustomWord ? parseInt(customWordGoal, 10) || null : wordGoal
  const effectiveTimeMinutes = isCustomTime ? parseInt(customTime, 10) || null : timeMinutes

  const canStart =
    effectiveWordGoal !== null &&
    !isNaN(effectiveWordGoal) &&
    effectiveWordGoal > 0 &&
    effectiveTimeMinutes !== null &&
    !isNaN(effectiveTimeMinutes) &&
    effectiveTimeMinutes > 0

  const difficulty: QuestDifficulty | null =
    canStart && effectiveWordGoal !== null && effectiveTimeMinutes !== null
      ? calculateDifficulty(effectiveWordGoal, effectiveTimeMinutes)
      : null

  const weaponMultiplier = getWeaponMultiplier(equippedWeapon)
  const armorTimeBonus = getArmorTimeBonus(equippedArmor)

  const rewardPreview: number | null =
    canStart && difficulty !== null && effectiveWordGoal !== null && effectiveTimeMinutes !== null
      ? Math.floor(
          calculateReward(
            effectiveWordGoal,
            effectiveTimeMinutes,
            effectiveWordGoal,
            effectiveTimeMinutes * 60,
            difficulty,
          ) * weaponMultiplier,
        )
      : null

  const weaponItem = getItemById(equippedWeapon)
  const armorItem = getItemById(equippedArmor)

  function handleStart() {
    if (!canStart || effectiveWordGoal === null || effectiveTimeMinutes === null) return
    useTimedQuestStore.getState().startQuest(effectiveWordGoal, effectiveTimeMinutes)
  }

  const presetButtonClass = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-mono transition-colors ${
      active
        ? 'bg-amber-600 text-white'
        : 'bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700'
    }`

  return (
    <div className="space-y-4">
      {/* Word Goal */}
      <div>
        <p className="text-xs font-medium text-gray-400 mb-2">Word Goal</p>
        <div className="flex flex-wrap gap-2 mb-2">
          {TIMED_WORD_PRESETS.map((g) => (
            <button
              key={g}
              onClick={() => { setWordGoal(g); setIsCustomWord(false) }}
              className={presetButtonClass(!isCustomWord && wordGoal === g)}
            >
              {g.toLocaleString()}
            </button>
          ))}
          <button
            onClick={() => setIsCustomWord(true)}
            className={presetButtonClass(isCustomWord)}
          >
            Custom
          </button>
        </div>
        {isCustomWord && (
          <input
            type="number"
            value={customWordGoal}
            onChange={(e) => setCustomWordGoal(e.target.value)}
            placeholder="Enter word count..."
            className="w-full px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
            min={1}
            autoFocus
          />
        )}
      </div>

      {/* Time Limit */}
      <div>
        <p className="text-xs font-medium text-gray-400 mb-2">Time Limit</p>
        <div className="flex flex-wrap gap-2 mb-2">
          {TIMED_TIME_PRESETS.map((t) => (
            <button
              key={t}
              onClick={() => { setTimeMinutes(t); setIsCustomTime(false) }}
              className={presetButtonClass(!isCustomTime && timeMinutes === t)}
            >
              {t}m
            </button>
          ))}
          <button
            onClick={() => setIsCustomTime(true)}
            className={presetButtonClass(isCustomTime)}
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
          />
        )}
      </div>

      {/* Difficulty + Reward preview */}
      {canStart && difficulty !== null && rewardPreview !== null && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Difficulty</span>
            <span className={`text-xs font-medium border px-1.5 py-0.5 rounded ${difficultyBgClass(difficulty)}`}>
              {getDifficultyLabel(difficulty)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Reward (100% completion)</span>
            <span className="text-xs font-medium text-amber-400">~{rewardPreview} coins</span>
          </div>
          {/* Equipment info */}
          <div className="pt-1 border-t border-gray-700 space-y-0.5">
            {weaponItem && (
              <p className="text-[10px] text-gray-600">
                {weaponItem.icon} {weaponItem.name}
                {weaponMultiplier !== 1.0 && (
                  <span className="text-amber-600"> +{Math.round((weaponMultiplier - 1) * 100)}% words</span>
                )}
              </p>
            )}
            {armorItem && (
              <p className="text-[10px] text-gray-600">
                {armorItem.icon} {armorItem.name}
                {armorTimeBonus > 0 && (
                  <span className="text-blue-500"> +{Math.round(armorTimeBonus * 100)}% time</span>
                )}
              </p>
            )}
          </div>
        </div>
      )}

      <button
        onClick={handleStart}
        disabled={!canStart}
        className="w-full py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
      >
        Start Timed Quest
      </button>
    </div>
  )
}

// ---- Completed Timed Quests List ----

interface CompletedTimedQuestsProps {
  quests: TimedQuest[]
}

function CompletedTimedQuests({ quests }: CompletedTimedQuestsProps) {
  if (quests.length === 0) return null
  const recent = quests.slice(0, 10)

  return (
    <section>
      <p className="text-xs font-medium text-gray-400 mb-2">
        Completed <span className="text-gray-600">({quests.length})</span>
      </p>
      <div className="space-y-1">
        {recent.map((q) => {
          const difficulty = calculateDifficulty(q.wordGoal, q.timeMinutes)
          return (
            <div
              key={q.id}
              className="flex items-center gap-2 text-[11px] px-2 py-1.5 bg-gray-800 rounded border border-gray-700"
            >
              <span className={`shrink-0 font-medium ${difficultyColorClass(difficulty)}`}>
                {getDifficultyLabel(difficulty)}
              </span>
              <span className="text-gray-400 shrink-0">{q.wordGoal.toLocaleString()} words</span>
              <span className="text-gray-600 shrink-0">{Math.round(q.timeMinutes)}m</span>
              <span className={`ml-auto shrink-0 font-medium ${resultColorClass(q.result)}`}>
                {resultLabel(q.result)}
              </span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ---- Main QuestPicker ----

export function QuestPicker({ open, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Image quest store
  const activeSessions = useImageRevealStore((s) => s.activeSessions)
  const completedSessions = useImageRevealStore((s) => s.completedSessions)
  const abandonSession = useImageRevealStore((s) => s.abandonSession)

  // Timed quest store
  const activeQuest = useTimedQuestStore((s) => s.activeQuest)
  const completedQuests = useTimedQuestStore((s) => s.completedQuests)
  const abandonQuest = useTimedQuestStore((s) => s.abandonQuest)

  // Default tab: timed if no active image sessions, otherwise image
  const defaultTab: Tab = activeSessions.length === 0 ? 'timed' : 'image'
  const [activeTab, setActiveTab] = useState<Tab>(defaultTab)

  // Image quest form
  const [wordGoal, setWordGoal] = useState(500)
  const [isCustom, setIsCustom] = useState(false)
  const [customGoal, setCustomGoal] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Completed gallery
  const [viewingImage, setViewingImage] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setError(null)
      setActiveTab(activeSessions.length === 0 ? 'timed' : 'image')
    }
  }, [open, activeSessions.length])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

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
      const goal = isCustom ? parseInt(customGoal, 10) : wordGoal
      if (!goal || goal < 1 || goal > 100000) {
        setError('Please enter a word goal between 1 and 100,000.')
        setLoading(false)
        return
      }
      const img = await fetchRandomImage()
      useImageRevealStore.getState().startSession(
        img.url, img.width, img.height, goal,
        img.photographer, img.photographerUrl, img.id
      )
    } catch {
      setError('Failed to fetch image. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const tabClass = (tab: Tab) =>
    `px-4 py-2 text-xs font-medium transition-colors border-b-2 ${
      activeTab === tab
        ? 'border-amber-400 text-amber-400'
        : 'border-transparent text-gray-500 hover:text-gray-300'
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

        {/* Tabs */}
        <div className="flex border-b border-gray-700 bg-gray-800/50 shrink-0">
          <button className={tabClass('image')} onClick={() => setActiveTab('image')}>
            Image Quest
          </button>
          <button className={tabClass('timed')} onClick={() => setActiveTab('timed')}>
            Timed Quest
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {activeTab === 'image' && (
            <>
              {/* Start New Image Quest */}
              <section>
                <p className="text-xs font-medium text-gray-400 mb-2">New Quest</p>

                <div className="flex flex-wrap gap-2 mb-2">
                  {IMAGE_GOAL_PRESETS.map((g) => (
                    <button
                      key={g}
                      onClick={() => { setWordGoal(g); setIsCustom(false) }}
                      className={`px-3 py-1.5 rounded-full text-xs font-mono transition-colors ${
                        !isCustom && wordGoal === g
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700'
                      }`}
                    >
                      {g.toLocaleString()}
                    </button>
                  ))}
                  <button
                    onClick={() => setIsCustom(true)}
                    className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                      isCustom
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-400 hover:text-gray-200 border border-gray-700'
                    }`}
                  >
                    Custom
                  </button>
                </div>

                {isCustom && (
                  <input
                    type="number"
                    value={customGoal}
                    onChange={(e) => setCustomGoal(e.target.value)}
                    placeholder="Enter word count..."
                    className="mb-2 w-full px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
                    min={1}
                    autoFocus
                  />
                )}

                {error && (
                  <p className="text-xs text-red-400 mb-2">{error}</p>
                )}

                <button
                  onClick={handleStartQuest}
                  disabled={loading || activeSessions.length >= 25}
                  className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
                >
                  {activeSessions.length >= 25 ? 'Quest limit reached (25)' : loading ? 'Finding image...' : 'Start Quest'}
                </button>

                <p className="text-[10px] text-gray-600 mt-2">
                  Write to reveal a random photo, one pixel layer at a time.
                </p>
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
                    Completed Quests <span className="text-gray-600">({completedSessions.length})</span>
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
                              {session.wordGoal.toLocaleString()} words &middot;{' '}
                              {new Date(session.completedAt!).toLocaleDateString()}
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
            </>
          )}

          {activeTab === 'timed' && (
            <>
              {activeQuest ? (
                <ActiveTimedQuestCard
                  quest={activeQuest}
                  onAbandon={abandonQuest}
                />
              ) : (
                <TimedQuestForm />
              )}

              <CompletedTimedQuests quests={completedQuests} />
            </>
          )}

        </div>
      </div>
    </div>
  )
}

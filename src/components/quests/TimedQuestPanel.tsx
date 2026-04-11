import { useState, useEffect } from 'react'
import { useTimedQuestStore } from '../../stores/timedQuestStore'
import { usePlayerStore } from '../../stores/playerStore'
import { getTimerState } from '../../lib/timer'
import type { TimerState } from '../../lib/timer'
import { CONSUMABLES, getItemById, getWeaponMultiplier } from '../../lib/items'
import {
  calculateDifficulty,
  calculateReward,
  getDifficultyLabel,
} from '../../lib/questRewards'
import type { QuestDifficulty } from '../../types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const mm = Math.floor(s / 60)
  const ss = s % 60
  return `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

interface DifficultyBadgeProps {
  difficulty: QuestDifficulty
  /** When true, render as colored dot only (collapsed mode) */
  dotOnly?: boolean
}

function DifficultyBadge({ difficulty, dotOnly = false }: DifficultyBadgeProps) {
  const colorMap: Record<QuestDifficulty, { dot: string; bg: string; text: string }> = {
    easy:   { dot: 'bg-emerald-400', bg: 'bg-emerald-900', text: 'text-emerald-400' },
    medium: { dot: 'bg-amber-400',   bg: 'bg-amber-900',   text: 'text-amber-400'   },
    hard:   { dot: 'bg-orange-400',  bg: 'bg-orange-900',  text: 'text-orange-400'  },
    epic:   { dot: 'bg-red-400',     bg: 'bg-red-900',     text: 'text-red-400'     },
  }
  const c = colorMap[difficulty]
  if (dotOnly) {
    return <span className={`inline-block w-2 h-2 rounded-full ${c.dot} shrink-0`} />
  }
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${c.bg} ${c.text}`}>
      {getDifficultyLabel(difficulty)}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function TimedQuestPanel() {
  const activeQuest = useTimedQuestStore((s) => s.activeQuest)
  const isPaused = useTimedQuestStore((s) => s.isPaused)
  const activeEffects = useTimedQuestStore((s) => s.activeEffects)
  const consumableInventory = usePlayerStore((s) => s.consumableInventory)
  const equippedWeapon = usePlayerStore((s) => s.equippedWeapon)
  const equippedArmor = usePlayerStore((s) => s.equippedArmor)

  const [isExpanded, setIsExpanded] = useState(false)
  const [timerState, setTimerState] = useState<TimerState>({
    remainingSeconds: 0,
    elapsedSeconds: 0,
    isExpired: false,
    percentRemaining: 100,
  })
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false)
  // 'completed' | 'failed' | null — captured when activeQuest transitions to those statuses
  const [showResult, setShowResult] = useState<'completed' | 'failed' | null>(null)
  // Snapshot of the quest at the time it finished, so we can display result info
  const [resultSnapshot, setResultSnapshot] = useState<{
    wordsWritten: number
    wordGoal: number
    timeMinutes: number
    coinsEarned: number
    difficulty: QuestDifficulty
    remainingSeconds: number
  } | null>(null)

  // -------------------------------------------------------------------
  // Timer tick — runs every second, drives display state
  // -------------------------------------------------------------------
  useEffect(() => {
    const id = setInterval(() => {
      useTimedQuestStore.getState().tickTimer()

      const { activeQuest: q, isPaused: paused, pauseStartedAt } = useTimedQuestStore.getState()
      if (!q) return

      const totalSeconds = q.timeMinutes * 60
      const startedAtMs = Date.parse(q.startedAt)
      const state = getTimerState(
        startedAtMs,
        totalSeconds,
        q.pausedDuration,
        paused && pauseStartedAt != null ? pauseStartedAt : undefined,
      )
      setTimerState(state)
    }, 1000)

    return () => clearInterval(id)
  }, [])

  // -------------------------------------------------------------------
  // Detect quest completion / failure
  // Store clears activeQuest to null when quest ends — subscribe to capture result.
  // -------------------------------------------------------------------
  useEffect(() => {
    const unsub = useTimedQuestStore.subscribe((state, prevState) => {
      if (prevState.activeQuest && !state.activeQuest) {
        const prev = prevState.activeQuest
        const totalSeconds = prev.timeMinutes * 60
        const startedAtMs = Date.parse(prev.startedAt)
        const ts = getTimerState(startedAtMs, totalSeconds, prev.pausedDuration)

        const difficulty = calculateDifficulty(prev.wordGoal, prev.timeMinutes)
        const isSuccess = prev.wordsWritten >= prev.wordGoal

        let coinsEarned = 0
        if (isSuccess) {
          coinsEarned = calculateReward(
            prev.wordGoal,
            prev.timeMinutes,
            prev.wordsWritten,
            ts.elapsedSeconds,
            difficulty,
          )
        } else {
          // partial reward (mirrors failQuest logic)
          const fullReward = calculateReward(prev.wordGoal, prev.timeMinutes, prev.wordGoal, 0, difficulty)
          const fraction = prev.wordsWritten / prev.wordGoal
          coinsEarned = Math.floor(fullReward * fraction * 0.5)
        }

        // Only show result if quest wasn't abandoned (abandon produces no result overlay)
        // We check the completedQuests array for the last entry's result
        const lastCompleted = state.completedQuests[0]
        if (lastCompleted && lastCompleted.result === 'abandoned') return

        setResultSnapshot({
          wordsWritten: prev.wordsWritten,
          wordGoal: prev.wordGoal,
          timeMinutes: prev.timeMinutes,
          coinsEarned,
          difficulty,
          remainingSeconds: ts.remainingSeconds,
        })
        setShowResult(isSuccess ? 'completed' : 'failed')
        setIsExpanded(true)
      }
    })
    return unsub
  }, [])

  // -------------------------------------------------------------------
  // Seed timerState on mount / when quest changes
  // -------------------------------------------------------------------
  useEffect(() => {
    if (!activeQuest) return
    const totalSeconds = activeQuest.timeMinutes * 60
    const startedAtMs = Date.parse(activeQuest.startedAt)
    const state = getTimerState(
      startedAtMs,
      totalSeconds,
      activeQuest.pausedDuration,
      isPaused && useTimedQuestStore.getState().pauseStartedAt != null
        ? (useTimedQuestStore.getState().pauseStartedAt ?? undefined)
        : undefined,
    )
    setTimerState(state)
  }, [activeQuest?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // -------------------------------------------------------------------
  // Visibility gate
  // -------------------------------------------------------------------
  if (!activeQuest && !showResult) return null

  // -------------------------------------------------------------------
  // Derived values (only valid when activeQuest is present)
  // -------------------------------------------------------------------
  const quest = activeQuest
  const difficulty = quest
    ? calculateDifficulty(quest.wordGoal, quest.timeMinutes)
    : (resultSnapshot?.difficulty ?? 'medium')

  const weaponItem = getItemById(equippedWeapon)
  const armorItem = getItemById(equippedArmor)
  const weaponMultiplier = getWeaponMultiplier(equippedWeapon)
  const hasWordBurst = activeEffects.some((e) => e.type === 'wordBurst')

  const timerColor =
    timerState.percentRemaining > 50
      ? 'text-gray-100'
      : timerState.percentRemaining > 25
        ? 'text-amber-400'
        : timerState.percentRemaining > 10
          ? 'text-orange-400'
          : 'text-red-400'

  const timerPulse = timerState.percentRemaining <= 10 ? 'animate-pulse' : ''

  // -------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------
  const handlePauseResume = () => {
    if (isPaused) {
      useTimedQuestStore.getState().resumeTimer()
    } else {
      useTimedQuestStore.getState().pauseTimer()
    }
  }

  const handleAbandon = () => {
    useTimedQuestStore.getState().abandonQuest()
    setShowAbandonConfirm(false)
    setShowResult(null)
    setResultSnapshot(null)
    setIsExpanded(false)
  }

  const handleDismissResult = () => {
    setShowResult(null)
    setResultSnapshot(null)
    setIsExpanded(false)
  }

  // -------------------------------------------------------------------
  // COLLAPSED VIEW
  // -------------------------------------------------------------------
  if (!isExpanded) {
    const wordsWritten = quest?.wordsWritten ?? 0
    const wordGoal = quest?.wordGoal ?? resultSnapshot?.wordGoal ?? 0

    return (
      <div className="fixed bottom-12 left-4 z-40">
        <button
          onClick={() => setIsExpanded(true)}
          className="flex items-center gap-2.5 bg-gray-900 border border-gray-700 rounded-lg shadow-2xl px-3 py-2 cursor-pointer hover:bg-gray-800 transition-colors"
          title="Expand timed quest panel"
        >
          <DifficultyBadge difficulty={difficulty} dotOnly />
          <span className={`text-sm font-mono font-medium tabular-nums ${timerColor} ${timerPulse}`}>
            {formatTime(timerState.remainingSeconds)}
          </span>
          <span className="text-xs text-gray-400 tabular-nums">
            {wordsWritten.toLocaleString()} / {wordGoal.toLocaleString()}
          </span>
        </button>
      </div>
    )
  }

  // -------------------------------------------------------------------
  // EXPANDED VIEW
  // -------------------------------------------------------------------
  return (
    <div className="fixed bottom-12 left-4 z-40 w-[280px]">
      <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-700 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-300 font-medium">Timed Quest</span>
            <DifficultyBadge difficulty={difficulty} />
          </div>
          <button
            onClick={() => setIsExpanded(false)}
            className="text-gray-500 hover:text-gray-400 text-sm leading-none"
            title="Minimize"
          >
            &#9662;
          </button>
        </div>

        <div className="overflow-y-auto">

          {/* Result overlay — Success */}
          {showResult === 'completed' && resultSnapshot && (
            <div className="p-4 flex flex-col gap-3">
              <div className="text-center">
                <h3 className="text-lg font-bold text-emerald-400">Quest Complete!</h3>
              </div>
              <div className="flex items-center justify-center gap-2 text-sm">
                <span className="text-xl">&#x1FA99;</span>
                <span className="text-emerald-400 font-medium">+{resultSnapshot.coinsEarned} coins</span>
              </div>
              <div className="flex items-center justify-center">
                <DifficultyBadge difficulty={resultSnapshot.difficulty} />
              </div>
              {resultSnapshot.remainingSeconds > 0 && (
                <p className="text-center text-gray-400 text-xs">
                  {formatTime(resultSnapshot.remainingSeconds)} remaining
                </p>
              )}
              <button
                onClick={handleDismissResult}
                className="w-full py-1.5 rounded text-sm font-medium bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {/* Result overlay — Failure */}
          {showResult === 'failed' && resultSnapshot && (
            <div className="p-4 flex flex-col gap-3">
              <div className="text-center">
                <h3 className="text-lg font-bold text-orange-400">Time&rsquo;s Up!</h3>
              </div>
              <p className="text-center text-gray-400 text-xs">
                {resultSnapshot.wordsWritten.toLocaleString()} / {resultSnapshot.wordGoal.toLocaleString()} words
              </p>
              {resultSnapshot.coinsEarned > 0 && (
                <div className="flex items-center justify-center gap-2 text-sm">
                  <span className="text-xl">&#x1FA99;</span>
                  <span className="text-amber-400 font-medium">+{resultSnapshot.coinsEarned} coins</span>
                </div>
              )}
              <button
                onClick={handleDismissResult}
                className="w-full py-1.5 rounded text-sm font-medium bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={handleDismissResult}
                className="w-full py-1.5 rounded text-sm font-medium bg-gray-800 hover:bg-gray-700 text-gray-400 transition-colors"
              >
                Done
              </button>
            </div>
          )}

          {/* Active quest content */}
          {!showResult && quest && (
            <div className="p-3 flex flex-col gap-3">

              {/* Timer display */}
              <div className="text-center">
                <span className={`text-4xl font-mono font-bold tabular-nums ${timerColor} ${timerPulse}`}>
                  {formatTime(timerState.remainingSeconds)}
                </span>
                {isPaused && (
                  <p className="text-xs text-gray-500 mt-1">Paused</p>
                )}
              </div>

              {/* Word progress */}
              <div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min((quest.wordsWritten / quest.wordGoal) * 100, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-gray-400 tabular-nums mt-1">
                  {quest.wordsWritten.toLocaleString()} / {quest.wordGoal.toLocaleString()} words
                </p>
                {(weaponMultiplier > 1 || hasWordBurst) && (
                  <p className="text-xs text-amber-400 mt-0.5">
                    {hasWordBurst && weaponMultiplier > 1
                      ? `2x from Word Burst + ${weaponMultiplier}x from ${weaponItem?.name ?? 'weapon'}`
                      : hasWordBurst
                        ? '2x from Word Burst'
                        : `${weaponMultiplier}x from ${weaponItem?.name ?? 'weapon'}`}
                  </p>
                )}
              </div>

              {/* Equipment info */}
              {(weaponItem || armorItem) && (
                <div className="text-xs text-gray-500 flex flex-col gap-0.5">
                  {weaponItem && weaponItem.id !== 'wooden-pencil' && (
                    <span>{weaponItem.icon} {weaponItem.name} &mdash; {weaponMultiplier}x words</span>
                  )}
                  {armorItem && armorItem.id !== 'cloth-tunic' && (() => {
                    const armor = armorItem as import('../../types').ArmorItem
                    return (
                      <span>{armor.icon} {armor.name} &mdash; +{Math.round(armor.timeBonus * 100)}% time</span>
                    )
                  })()}
                </div>
              )}

              {/* Consumables */}
              {CONSUMABLES.length > 0 && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">Consumables</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {CONSUMABLES.map((item) => {
                      const count = consumableInventory[item.id] ?? 0
                      return (
                        <button
                          key={item.id}
                          onClick={() => useTimedQuestStore.getState().useConsumable(item.id)}
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
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePauseResume}
                  className="flex-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-2 py-1.5 transition-colors"
                >
                  {isPaused ? '\u25B6 Resume' : '\u23F8 Pause'}
                </button>

                {!showAbandonConfirm ? (
                  <button
                    onClick={() => setShowAbandonConfirm(true)}
                    className="text-xs text-red-400 hover:text-red-300 transition-colors px-2 py-1.5"
                  >
                    Abandon
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-red-400">Really?</span>
                    <button
                      onClick={handleAbandon}
                      className="text-[10px] bg-red-900 hover:bg-red-800 text-red-300 rounded px-1.5 py-1 transition-colors"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setShowAbandonConfirm(false)}
                      className="text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-400 rounded px-1.5 py-1 transition-colors"
                    >
                      No
                    </button>
                  </div>
                )}
              </div>

            </div>
          )}

        </div>
      </div>
    </div>
  )
}

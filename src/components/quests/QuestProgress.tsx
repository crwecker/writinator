import { useState, useEffect } from 'react'
import { useQuestStore, getPixelLevel } from '../../stores/questStore'
import { questArcs } from '../../data/quests'

export function QuestProgress() {
  const activeQuest = useQuestStore((s) => s.activeQuest)
  const abandonQuest = useQuestStore((s) => s.abandonQuest)
  const [showCelebration, setShowCelebration] = useState(false)
  const [wasCompleted, setWasCompleted] = useState(false)

  // Detect completion transition
  useEffect(() => {
    if (activeQuest?.completed && !wasCompleted) {
      setShowCelebration(true)
      const timer = setTimeout(() => setShowCelebration(false), 4000)
      return () => clearTimeout(timer)
    }
    setWasCompleted(activeQuest?.completed ?? false)
  }, [activeQuest?.completed, wasCompleted])

  if (!activeQuest) return null

  const arc = questArcs.find((a) => a.id === activeQuest.arcId)
  const quest = arc?.quests.find((q) => q.id === activeQuest.questId)
  if (!quest) return null

  const progress = Math.min(activeQuest.wordsWritten / quest.wordsToWin, 1)
  const pixelLevel = getPixelLevel(progress)
  const remaining = Math.max(quest.wordsToWin - activeQuest.wordsWritten, 0)

  return (
    <>
      {/* Celebration overlay */}
      {showCelebration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 animate-fade-in">
          <div className="text-center">
            <div className="text-4xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-emerald-400 mb-2">Quest Complete!</h2>
            <p className="text-gray-300 text-lg mb-1">{quest.title}</p>
            <p className="text-gray-400 text-sm">{quest.winningMessage}</p>
            <img
              src={quest.image}
              alt={quest.title}
              className="w-48 h-48 mx-auto mt-4 rounded-lg object-cover"
            />
          </div>
        </div>
      )}

      {/* Progress panel — compact bar above the bottom status bar */}
      <div className="flex items-center gap-3 px-4 py-1.5 border-t border-gray-700 bg-gray-900/80 text-xs">
        {/* Pixelated image thumbnail */}
        <div className="relative w-8 h-8 rounded overflow-hidden shrink-0 bg-gray-800">
          <img
            src={quest.image}
            alt={quest.title}
            className="w-full h-full object-cover"
            style={{
              filter: pixelLevel > 0
                ? `blur(${Math.min(pixelLevel / 8, 10)}px)`
                : 'none',
              transform: 'scale(1.1)',
            }}
          />
        </div>

        {/* Quest info + progress bar */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-0.5">
            <span className="text-gray-300 truncate font-medium">{quest.title}</span>
            <span className="text-gray-500 tabular-nums shrink-0 ml-2">
              {activeQuest.completed
                ? 'Done!'
                : `${remaining.toLocaleString()} left`}
            </span>
          </div>
          <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                activeQuest.completed ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </div>

        {/* Abandon button */}
        {!activeQuest.completed && (
          <button
            onClick={abandonQuest}
            className="text-gray-600 hover:text-gray-400 text-[10px] shrink-0"
            title="Abandon quest"
          >
            ✕
          </button>
        )}
      </div>
    </>
  )
}

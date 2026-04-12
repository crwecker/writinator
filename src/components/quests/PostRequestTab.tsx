import { useState } from 'react'
import { useWriteathonStore } from '../../stores/writeathonStore'
import { createBoardQuest } from '../../lib/writeathon'

const WORD_GOAL_PRESETS = [250, 500, 1000, 2000, 5000]
const TIME_PRESETS = [5, 10, 15, 30, 60]

export default function PostRequestTab() {
  const villagerQuests = useWriteathonStore((s) => s.villagerQuests)

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [wordGoal, setWordGoal] = useState(500)
  const [isCustomGoal, setIsCustomGoal] = useState(false)
  const [customGoal, setCustomGoal] = useState('')
  const [timerEnabled, setTimerEnabled] = useState(false)
  const [timeMinutes, setTimeMinutes] = useState(15)
  const [isCustomTime, setIsCustomTime] = useState(false)
  const [customTime, setCustomTime] = useState('')
  const [posted, setPosted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveWordGoal = isCustomGoal ? parseInt(customGoal, 10) || null : wordGoal
  const effectiveTimeMinutes = isCustomTime ? parseInt(customTime, 10) || null : timeMinutes

  const canPost =
    effectiveWordGoal !== null &&
    !isNaN(effectiveWordGoal) &&
    effectiveWordGoal >= 1 &&
    effectiveWordGoal <= 100000 &&
    (!timerEnabled ||
      (effectiveTimeMinutes !== null &&
        !isNaN(effectiveTimeMinutes) &&
        effectiveTimeMinutes >= 1 &&
        effectiveTimeMinutes <= 1440))

  function handlePost() {
    const goal = effectiveWordGoal
    if (!goal || goal < 1 || goal > 100000) {
      setError('Please enter a word goal between 1 and 100,000.')
      return
    }
    if (timerEnabled) {
      const mins = effectiveTimeMinutes
      if (!mins || mins < 1 || mins > 1440) {
        setError('Please enter a time between 1 and 1440 minutes.')
        return
      }
    }
    setError(null)

    const quest = createBoardQuest('villager', goal, {
      title: title.trim() || undefined,
      description: description.trim() || undefined,
      timeMinutes: timerEnabled && effectiveTimeMinutes !== null ? effectiveTimeMinutes : undefined,
    })
    useWriteathonStore.getState().addVillagerQuest(quest)

    // Reset form
    setTitle('')
    setDescription('')
    setWordGoal(500)
    setIsCustomGoal(false)
    setCustomGoal('')
    setTimerEnabled(false)
    setTimeMinutes(15)
    setIsCustomTime(false)
    setCustomTime('')

    // Flash success
    setPosted(true)
    setTimeout(() => setPosted(false), 1500)
  }

  const presetBtn = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-mono transition-colors ${
      active
        ? 'bg-amber-700 text-amber-100'
        : 'bg-gray-700 text-gray-400 hover:text-gray-200 border border-gray-600'
    }`

  const timePresetBtn = (active: boolean) =>
    `px-3 py-1.5 rounded-full text-xs font-mono transition-colors ${
      active
        ? 'bg-amber-700 text-amber-100'
        : 'bg-gray-700 text-gray-400 hover:text-gray-200 border border-gray-600'
    }`

  return (
    <div className="space-y-6">
      {/* Creation form */}
      <section>
        <p className="text-xs font-medium text-gray-400 mb-3 uppercase tracking-wide">
          Pin a Custom Request
        </p>

        {/* Title */}
        <div className="mb-3">
          <label className="text-xs text-gray-500 block mb-1">Title (optional)</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Auto-generated if blank…"
            maxLength={80}
            className="w-full px-3 py-1.5 rounded bg-gray-700 border border-gray-600 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-600"
          />
        </div>

        {/* Description */}
        <div className="mb-3">
          <label className="text-xs text-gray-500 block mb-1">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What is this quest about?"
            maxLength={200}
            rows={2}
            className="w-full px-3 py-1.5 rounded bg-gray-700 border border-gray-600 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-600 resize-none"
          />
        </div>

        {/* Word goal presets */}
        <div className="mb-2">
          <label className="text-xs text-gray-500 block mb-1">Word Goal</label>
          <div className="flex flex-wrap gap-2">
            {WORD_GOAL_PRESETS.map((g) => (
              <button
                key={g}
                onClick={() => { setWordGoal(g); setIsCustomGoal(false) }}
                className={presetBtn(!isCustomGoal && wordGoal === g)}
              >
                {g.toLocaleString()}
              </button>
            ))}
            <button
              onClick={() => setIsCustomGoal(true)}
              className={presetBtn(isCustomGoal)}
            >
              Custom
            </button>
          </div>
        </div>

        {isCustomGoal && (
          <input
            type="number"
            value={customGoal}
            onChange={(e) => setCustomGoal(e.target.value)}
            placeholder="Enter word count…"
            min={1}
            max={100000}
            autoFocus
            className="mb-3 w-full px-3 py-1.5 rounded bg-gray-700 border border-gray-600 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-600"
          />
        )}

        {/* Timer toggle */}
        <div className="flex items-center gap-3 mt-3 mb-3">
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

        {timerEnabled && (
          <div className="pl-3 border-l-2 border-amber-700/40 mb-3 space-y-2">
            <p className="text-xs text-gray-500">Time Limit</p>
            <div className="flex flex-wrap gap-2">
              {TIME_PRESETS.map((t) => (
                <button
                  key={t}
                  onClick={() => { setTimeMinutes(t); setIsCustomTime(false) }}
                  className={timePresetBtn(!isCustomTime && timeMinutes === t)}
                >
                  {t}m
                </button>
              ))}
              <button
                onClick={() => setIsCustomTime(true)}
                className={timePresetBtn(isCustomTime)}
              >
                Custom
              </button>
            </div>
            {isCustomTime && (
              <input
                type="number"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                placeholder="Minutes…"
                min={1}
                max={1440}
                autoFocus
                className="w-full px-3 py-1.5 rounded bg-gray-700 border border-gray-600 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-amber-600"
              />
            )}
          </div>
        )}

        {error && <p className="text-xs text-red-400 mb-2">{error}</p>}

        <button
          onClick={handlePost}
          disabled={!canPost}
          className="w-full py-2 rounded-lg bg-amber-700 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-serif font-semibold text-gray-900 transition-colors flex items-center justify-center gap-2"
        >
          {posted ? (
            <span className="text-emerald-900">&#10003; Request Posted!</span>
          ) : (
            <>
              <span>📌</span>
              Post Request
            </>
          )}
        </button>
      </section>

      {/* Pending villager quests */}
      <section>
        <p className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
          Pending Requests
        </p>
        {villagerQuests.filter((q) => !q.completedAt).length === 0 ? (
          <p className="text-xs text-gray-600 italic">No pending requests.</p>
        ) : (
          <div className="space-y-2">
            {villagerQuests
              .filter((q) => !q.completedAt)
              .map((quest) => (
                <div
                  key={quest.id}
                  className="flex items-start justify-between gap-3 bg-gray-700/60 border border-gray-600 rounded-lg px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-gray-200 font-medium truncate">{quest.title}</p>
                    {quest.description && (
                      <p className="text-xs text-gray-500 truncate">{quest.description}</p>
                    )}
                    <p className="text-xs text-amber-500 mt-0.5">
                      {quest.wordGoal.toLocaleString()} words
                      {quest.timeMinutes !== undefined && ` · ${quest.timeMinutes}m`}
                      {` · ${quest.coinReward} coins`}
                    </p>
                  </div>
                  <button
                    onClick={() => useWriteathonStore.getState().removeVillagerQuest(quest.id)}
                    className="shrink-0 text-xs text-gray-500 hover:text-red-400 transition-colors px-2 py-0.5 rounded border border-gray-600 hover:border-red-700"
                    title="Retract request"
                  >
                    Retract
                  </button>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  )
}

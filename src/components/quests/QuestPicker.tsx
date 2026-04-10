import { useState, useEffect, useRef } from 'react'
import { useImageRevealStore, PIXEL_LEVELS } from '../../stores/imageRevealStore'
import { fetchRandomImage } from '../../lib/unsplash'
import type { ImageRevealSession } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
}

const GOAL_PRESETS = [250, 500, 1000, 2000, 5000]
const MAX_LEVEL_INDEX = PIXEL_LEVELS.length - 1

function getBlurStyle(currentLevel: number): string {
  // PIXEL_LEVELS goes from 128 (most pixelated) to 0 (clear)
  // currentLevel is an index into PIXEL_LEVELS
  // At index 0 (value 128): heavy blur
  // At max index (value 0): no blur
  const fraction = currentLevel / MAX_LEVEL_INDEX
  const blurPx = Math.round((1 - fraction) * 12)
  return blurPx > 0 ? `blur(${blurPx}px)` : 'none'
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
      {/* Thumbnail */}
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

      {/* Progress */}
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

      {/* Abandon */}
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

export function QuestPicker({ open, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  // Store
  const activeSessions = useImageRevealStore((s) => s.activeSessions)
  const completedSessions = useImageRevealStore((s) => s.completedSessions)
  const abandonSession = useImageRevealStore((s) => s.abandonSession)

  // New quest form
  const [wordGoal, setWordGoal] = useState(500)
  const [isCustom, setIsCustom] = useState(false)
  const [customGoal, setCustomGoal] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Completed gallery
  const [viewingImage, setViewingImage] = useState<string | null>(null)

  // Reset error on open
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
      // Intentionally do NOT close — let user see the new active session appear
    } catch {
      setError('Failed to fetch image. Please try again.')
    } finally {
      setLoading(false)
    }
  }

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

          {/* Start New Quest */}
          <section>
            <p className="text-xs font-medium text-gray-400 mb-2">New Quest</p>

            {/* Goal presets */}
            <div className="flex flex-wrap gap-2 mb-2">
              {GOAL_PRESETS.map((g) => (
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

              {/* Expanded view */}
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
        </div>
      </div>
    </div>
  )
}

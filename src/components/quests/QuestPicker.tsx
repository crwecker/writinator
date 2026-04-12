import { useState, useEffect, useRef } from 'react'
import { useImageRevealStore, PIXEL_LEVELS } from '../../stores/imageRevealStore'
import type { ImageRevealSession } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
}

const MAX_LEVEL_INDEX = PIXEL_LEVELS.length - 1

function getBlurStyle(currentLevel: number): string {
  const fraction = currentLevel / MAX_LEVEL_INDEX
  const blurPx = Math.round((1 - fraction) * 12)
  return blurPx > 0 ? `blur(${blurPx}px)` : 'none'
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

  // Completed gallery
  const [viewingImage, setViewingImage] = useState<string | null>(null)

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        ref={panelRef}
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[520px] max-w-[92vw] max-h-[84vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <span className="text-sm font-medium text-gray-200">Your Quests</span>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-xs"
          >
            Close
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">

          {/* Active Sessions */}
          {activeSessions.length > 0 ? (
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
          ) : (
            <p className="text-xs text-gray-600 italic">
              No active quests. Start one from the Quest Board.
            </p>
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

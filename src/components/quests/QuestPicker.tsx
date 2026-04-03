import { useState, useEffect, useRef } from 'react'
import { questArcs } from '../../data/quests'
import { useQuestStore } from '../../stores/questStore'
import { useDocumentStore } from '../../stores/documentStore'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { fetchRandomImage } from '../../lib/unsplash'
import type { Quest, QuestArc } from '../../types'

function getTotalWordCount(): number {
  const book = useDocumentStore.getState().book
  if (!book) return 0
  return book.chapters.reduce((sum, ch) => {
    if (!ch.content) return sum
    return sum + ch.content.trim().split(/\s+/).filter(Boolean).length
  }, 0)
}

interface Props {
  open: boolean
  onClose: () => void
}

export function QuestPicker({ open, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const [selectedArc, setSelectedArc] = useState<QuestArc | null>(null)
  const [activeTab, setActiveTab] = useState<'arcs' | 'image'>('arcs')
  const [wordGoal, setWordGoal] = useState(500)
  const [customGoal, setCustomGoal] = useState('')
  const [isCustom, setIsCustom] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const startQuest = useQuestStore((s) => s.startQuest)
  const activeQuest = useQuestStore((s) => s.activeQuest)
  const completedQuests = useQuestStore((s) => s.completedQuests)
  const activeImageSession = useImageRevealStore((s) => s.activeSession)
  const completedImageSessions = useImageRevealStore((s) => s.completedSessions)
  const [viewingImage, setViewingImage] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setSelectedArc(null)
      setError(null)
    }
  }, [open])

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
    function onClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open, onClose])

  if (!open) return null

  function isCompleted(questId: string) {
    return completedQuests.some((q) => q.questId === questId)
  }

  function isActive(questId: string) {
    return activeQuest?.questId === questId
  }

  function handleSelectQuest(arc: QuestArc, quest: Quest) {
    if (isCompleted(quest.id) || isActive(quest.id)) return
    startQuest(arc.id, quest.id, getTotalWordCount())
    onClose()
  }

  async function handleStartImageReveal() {
    setLoading(true)
    setError(null)
    try {
      const goal = isCustom ? parseInt(customGoal, 10) : wordGoal
      if (!goal || goal < 1 || goal > 100000) {
        setError('Please enter a word goal between 1 and 100,000')
        setLoading(false)
        return
      }
      const img = await fetchRandomImage()
      useImageRevealStore.getState().startSession(
        img.url, img.width, img.height, goal,
        img.photographer, img.photographerUrl, img.id
      )
      onClose()
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
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[500px] max-w-[90vw] max-h-[80vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <button
            onClick={() => {
              if (activeTab === 'arcs' && selectedArc) {
                setSelectedArc(null)
              } else {
                onClose()
              }
            }}
            className="text-gray-500 hover:text-gray-300 text-xs"
          >
            {activeTab === 'arcs' && selectedArc ? '\u2190 Back' : 'Close'}
          </button>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setActiveTab('arcs')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'arcs'
                  ? 'bg-gray-700 text-gray-200'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Quest Arcs
            </button>
            <button
              onClick={() => setActiveTab('image')}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                activeTab === 'image'
                  ? 'bg-gray-700 text-gray-200'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              Image Reveal
            </button>
          </div>
          <span className="w-10" />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'arcs' && (
            <>
              {!selectedArc ? (
                // Arc list
                <div className="space-y-3">
                  {questArcs.map((arc) => {
                    const completed = arc.quests.filter((q) => isCompleted(q.id)).length
                    return (
                      <button
                        key={arc.id}
                        onClick={() => setSelectedArc(arc)}
                        className="w-full text-left p-4 rounded-lg bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-600 transition-colors"
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-200">{arc.title}</span>
                          <span className="text-[10px] text-gray-500">
                            {completed}/{arc.quests.length}
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">{arc.description}</p>
                      </button>
                    )
                  })}
                </div>
              ) : (
                // Quest list within arc
                <div className="space-y-3">
                  {selectedArc.quests.map((quest) => {
                    const completed = isCompleted(quest.id)
                    const active = isActive(quest.id)
                    return (
                      <button
                        key={quest.id}
                        onClick={() => handleSelectQuest(selectedArc, quest)}
                        disabled={completed || active}
                        className={`w-full text-left p-4 rounded-lg border transition-colors ${
                          completed
                            ? 'bg-emerald-950/30 border-emerald-800/40 opacity-70'
                            : active
                              ? 'bg-blue-950/30 border-blue-700/50'
                              : 'bg-gray-800 border-gray-700 hover:border-gray-600 hover:bg-gray-700'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-200">
                            {completed ? '\u2713 ' : ''}{quest.title}
                          </span>
                          <span className="text-[10px] text-gray-500 font-mono">
                            {quest.wordsToWin.toLocaleString()} words
                          </span>
                        </div>
                        <p className="text-xs text-gray-400">{quest.description}</p>
                        {active && (
                          <p className="text-[10px] text-blue-400 mt-1">Active quest</p>
                        )}
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {activeTab === 'image' && (
            <div className="space-y-4">
              {activeImageSession ? (
                <div className="text-center py-6">
                  <p className="text-sm text-gray-300 mb-1">Image reveal in progress</p>
                  <p className="text-xs text-gray-500">
                    {activeImageSession.wordsWritten.toLocaleString()} / {activeImageSession.wordGoal.toLocaleString()} words
                  </p>
                </div>
              ) : (
                <>
                  <div>
                    <p className="text-xs text-gray-400 mb-2">Word goal</p>
                    <div className="flex flex-wrap gap-2">
                      {[250, 500, 1000, 2000, 5000].map((g) => (
                        <button
                          key={g}
                          onClick={() => { setWordGoal(g); setIsCustom(false) }}
                          className={`px-3 py-1.5 rounded text-xs font-mono transition-colors ${
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
                        className={`px-3 py-1.5 rounded text-xs transition-colors ${
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
                        className="mt-2 w-full px-3 py-1.5 rounded bg-gray-800 border border-gray-700 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-gray-500"
                        min={1}
                        autoFocus
                      />
                    )}
                  </div>
                  <p className="text-xs text-gray-500">
                    Write to reveal a random photo, one pixel layer at a time.
                  </p>
                  {error && (
                    <p className="text-xs text-red-400">{error}</p>
                  )}
                  <button
                    onClick={handleStartImageReveal}
                    disabled={loading}
                    className="w-full py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium text-white transition-colors"
                  >
                    {loading ? 'Finding image...' : 'Start Writing'}
                  </button>
                </>
              )}

              {/* Completed reveals gallery */}
              {completedImageSessions.length > 0 && (
                <div>
                  <p className="text-xs text-gray-500 mb-2">
                    Revealed ({completedImageSessions.length})
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {[...completedImageSessions].reverse().map((session) => (
                      <button
                        key={session.id}
                        onClick={() => setViewingImage(viewingImage === session.id ? null : session.id)}
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

                  {/* Expanded image view */}
                  {viewingImage && (() => {
                    const session = completedImageSessions.find((s) => s.id === viewingImage)
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
                              {session.wordGoal.toLocaleString()} words &middot; {new Date(session.completedAt!).toLocaleDateString()}
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
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

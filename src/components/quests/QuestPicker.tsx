import { useState, useEffect, useRef } from 'react'
import { questArcs } from '../../data/quests'
import { useQuestStore } from '../../stores/questStore'
import { useDocumentStore } from '../../stores/documentStore'
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
  const startQuest = useQuestStore((s) => s.startQuest)
  const activeQuest = useQuestStore((s) => s.activeQuest)
  const completedQuests = useQuestStore((s) => s.completedQuests)

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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        ref={panelRef}
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[500px] max-w-[90vw] max-h-[80vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700">
          <button
            onClick={() => selectedArc ? setSelectedArc(null) : onClose()}
            className="text-gray-500 hover:text-gray-300 text-xs"
          >
            {selectedArc ? '← Back' : 'Close'}
          </button>
          <span className="text-sm font-medium text-gray-200">
            {selectedArc ? selectedArc.title : 'Quests'}
          </span>
          <span className="w-10" />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {!selectedArc ? (
            // Arc list
            <div className="space-y-3">
              {questArcs.map((arc) => {
                const completed = arc.quests.filter((q) => isCompleted(q.id)).length
                return (
                  <button
                    key={arc.id}
                    onClick={() => setSelectedArc(arc)}
                    className="w-full text-left p-4 rounded-lg bg-gray-800 hover:bg-gray-750 border border-gray-700 hover:border-gray-600 transition-colors"
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
                          : 'bg-gray-800 border-gray-700 hover:border-gray-600 hover:bg-gray-750'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-medium text-gray-200">
                        {completed ? '✓ ' : ''}{quest.title}
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
        </div>
      </div>
    </div>
  )
}

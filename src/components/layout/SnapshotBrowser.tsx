import { useState, useEffect, useRef } from 'react'
import type { Snapshot } from '../../types'
import { getSnapshots } from '../../stores/snapshotStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { formatTime } from '../../lib/formatTime'
import { DiffView } from './DiffView'

const triggerLabel: Record<Snapshot['trigger'], string> = {
  manual: 'save',
  switch: 'switch',
  auto: 'auto',
  closeBook: 'close',
  bulkReplace: 'replace',
  orphan: 'orphan (before new file)',
  fileOnReconnect: 'file on reconnect',
}

interface Props {
  open: boolean
  onClose: () => void
  onRestore: (content: string) => void
}

type CompareTarget = 'snapshots' | 'current'

export function SnapshotBrowser({ open, onClose, onRestore }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [compareMode, setCompareMode] = useState(false)
  // selected ids for compare mode (max 2)
  const [selected, setSelected] = useState<string[]>([])
  // whether we're showing the diff pane in compare mode
  const [compareTarget, setCompareTarget] = useState<CompareTarget | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const activeStoryletId = useStoryletStore((s) => s.activeStoryletId)
  const currentContent = useStoryletStore((s) => {
    if (!s.activeStoryletId) return ''
    return s.book?.storylets.find((st) => st.id === s.activeStoryletId)?.content ?? ''
  })

  useEffect(() => {
    if (!open || !activeStoryletId) return
    let cancelled = false
    getSnapshots(activeStoryletId).then((snaps) => {
      if (cancelled) return
      setSnapshots(snaps)
      // Reset UI state each time the panel (re-)opens for a storylet
      setCompareMode(false)
      setSelected([])
      setCompareTarget(null)
      setPreviewId(null)
    }).catch(() => { /* ignore */ })
    return () => { cancelled = true }
  }, [open, activeStoryletId])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Close on click outside
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

  const preview = !compareMode && previewId ? snapshots.find((s) => s.id === previewId) : null

  // Compare mode helpers
  function toggleSelected(id: string) {
    if (selected.includes(id)) {
      const next = selected.filter((x) => x !== id)
      setSelected(next)
      // if we deselect while showing a two-snapshot diff, return to list
      if (compareTarget === 'snapshots') setCompareTarget(null)
    } else {
      const next = selected.length >= 2 ? [selected[1], id] : [...selected, id]
      setSelected(next)
      if (next.length === 2) setCompareTarget('snapshots')
    }
  }

  // Sorted selected snapshots (older first)
  const selectedSnapshots = selected
    .map((id) => snapshots.find((s) => s.id === id))
    .filter((s): s is Snapshot => s !== undefined)
    .sort((a, b) => a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0)

  const showingDiff = compareMode && compareTarget !== null

  function handleToggleCompare() {
    setCompareMode((prev) => !prev)
    setSelected([])
    setCompareTarget(null)
    setPreviewId(null)
  }

  function handleBack() {
    if (showingDiff) {
      // return to compare selection list, keep selection
      setCompareTarget(null)
    } else if (compareMode) {
      setCompareMode(false)
      setSelected([])
    } else {
      setPreviewId(null)
    }
  }

  const showingDetail = showingDiff || (!compareMode && !!preview)
  const newerSnapshot = selectedSnapshots[selectedSnapshots.length - 1]

  return (
    <div
      ref={panelRef}
      className="fixed right-0 top-0 bottom-0 z-50 w-[420px] max-w-[90vw] bg-gray-900 border-l border-gray-700 shadow-2xl flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <span className="text-sm font-medium text-gray-200">
          {compareMode
            ? compareTarget === 'snapshots'
              ? 'Comparing A → B'
              : compareTarget === 'current'
              ? 'Compare to current'
              : 'Compare mode'
            : preview
            ? 'Preview'
            : 'Snapshots'}
        </span>
        <div className="flex items-center gap-2">
          {!preview && (
            <button
              onClick={handleToggleCompare}
              className={`text-xs px-2 py-0.5 rounded border transition-colors ${
                compareMode
                  ? 'border-blue-500 text-blue-400 bg-blue-500/10 hover:bg-blue-500/20'
                  : 'border-gray-600 text-gray-400 hover:text-gray-200 hover:border-gray-500'
              }`}
            >
              {compareMode ? 'Exit compare' : 'Compare'}
            </button>
          )}
          <button
            onClick={showingDetail ? handleBack : onClose}
            className="text-gray-500 hover:text-gray-300 text-xs"
          >
            {showingDetail ? 'Back' : 'Close'}
          </button>
        </div>
      </div>

      {/* Content */}
      {!compareMode && preview ? (
        // Normal single-snapshot preview
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 text-xs text-gray-400">
            <span>{formatTime(preview.timestamp)} &middot; {preview.wordCount} words</span>
            <button
              onClick={() => {
                onRestore(preview.content)
                onClose()
              }}
              className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-medium"
            >
              Restore
            </button>
          </div>
          <pre className="flex-1 overflow-auto px-4 py-3 text-sm text-gray-300 whitespace-pre-wrap font-serif leading-relaxed">
            {preview.content}
          </pre>
        </div>
      ) : showingDiff && selectedSnapshots.length >= 1 ? (
        // Compare diff pane
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex items-center justify-between px-4 py-2 border-b border-gray-800 text-xs text-gray-400">
            {compareTarget === 'snapshots' && selectedSnapshots.length === 2 ? (
              <span>
                {formatTime(selectedSnapshots[0].timestamp)}
                {' → '}
                {formatTime(selectedSnapshots[1].timestamp)}
              </span>
            ) : (
              <span>
                {formatTime(selectedSnapshots[0].timestamp)} → current
              </span>
            )}
            {compareTarget === 'snapshots' && newerSnapshot && (
              <button
                onClick={() => {
                  onRestore(newerSnapshot.content)
                  onClose()
                }}
                className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-medium"
              >
                Restore newer
              </button>
            )}
          </div>
          <div className="flex-1 overflow-auto px-4 py-3 font-serif">
            <DiffView
              oldText={selectedSnapshots[0].content}
              newText={
                compareTarget === 'snapshots' && selectedSnapshots.length === 2
                  ? selectedSnapshots[1].content
                  : currentContent
              }
            />
          </div>
        </div>
      ) : (
        // Snapshot list (normal or compare-selection)
        <div className="flex-1 flex flex-col min-h-0">
          {compareMode && (
            <div className="px-4 py-2 border-b border-gray-800 text-xs text-gray-500">
              {selected.length === 0
                ? 'Select up to 2 snapshots to compare'
                : 'Select a second snapshot, or compare to current'}
            </div>
          )}
          {compareMode && selected.length === 1 && (
            <div className="px-4 py-2 border-b border-gray-700">
              <button
                onClick={() => setCompareTarget('current')}
                className="w-full text-xs text-center py-1.5 rounded bg-blue-500/10 border border-blue-500/40 text-blue-400 hover:bg-blue-500/20 transition-colors"
              >
                Compare to current →
              </button>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {snapshots.length === 0 ? (
              <div className="px-4 py-8 text-center text-gray-500 text-sm">
                No snapshots yet. Snapshots are created on save, storylet switch, and every 5 minutes.
              </div>
            ) : (
              snapshots.map((s) => {
                const isSelected = selected.includes(s.id)
                const selectionIndex = selected.indexOf(s.id)
                if (compareMode) {
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleSelected(s.id)}
                      className={`w-full text-left px-4 py-2.5 border-b border-gray-800 transition-colors ${
                        isSelected
                          ? 'bg-blue-500/10 ring-1 ring-inset ring-blue-500'
                          : 'hover:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-300">{formatTime(s.timestamp)}</span>
                        <div className="flex items-center gap-1.5">
                          {isSelected && (
                            <span className="text-[10px] text-blue-400 font-semibold">
                              {selectionIndex === 0 ? 'A' : 'B'}
                            </span>
                          )}
                          <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded font-mono">
                            {triggerLabel[s.trigger]}
                          </span>
                        </div>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {s.wordCount.toLocaleString()} words
                      </div>
                    </button>
                  )
                }
                return (
                  <button
                    key={s.id}
                    onClick={() => setPreviewId(s.id)}
                    className="w-full text-left px-4 py-2.5 hover:bg-gray-800 border-b border-gray-800 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">{formatTime(s.timestamp)}</span>
                      <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded font-mono">
                        {triggerLabel[s.trigger]}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {s.wordCount.toLocaleString()} words
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useRef, useCallback } from 'react'
import type { Snapshot } from '../../types'
import { getSnapshots } from '../../stores/snapshotStore'
import { useDocumentStore } from '../../stores/documentStore'

function formatTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMin = Math.floor(diffMs / 60000)

  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`

  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) +
    ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

const triggerLabel: Record<Snapshot['trigger'], string> = {
  manual: 'save',
  switch: 'switch',
  auto: 'auto',
}

interface Props {
  open: boolean
  onClose: () => void
  onRestore: (content: string) => void
}

export function SnapshotBrowser({ open, onClose, onRestore }: Props) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([])
  const [previewId, setPreviewId] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId)

  const load = useCallback(async () => {
    if (!activeDocumentId) return
    setSnapshots(await getSnapshots(activeDocumentId))
    setPreviewId(null)
  }, [activeDocumentId])

  useEffect(() => {
    if (open) load()
  }, [open, load])

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

  const preview = previewId ? snapshots.find((s) => s.id === previewId) : null

  return (
    <div
      ref={panelRef}
      className="fixed right-0 top-0 bottom-0 z-50 w-[380px] max-w-[90vw] bg-gray-900 border-l border-gray-700 shadow-2xl flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <span className="text-sm font-medium text-gray-200">
          {preview ? 'Preview' : 'Snapshots'}
        </span>
        <button
          onClick={preview ? () => setPreviewId(null) : onClose}
          className="text-gray-500 hover:text-gray-300 text-xs"
        >
          {preview ? 'Back' : 'Close'}
        </button>
      </div>

      {/* Content */}
      {preview ? (
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
      ) : (
        <div className="flex-1 overflow-y-auto">
          {snapshots.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500 text-sm">
              No snapshots yet. Snapshots are created on save, document switch, and every 5 minutes.
            </div>
          ) : (
            snapshots.map((s) => (
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
            ))
          )}
        </div>
      )}
    </div>
  )
}

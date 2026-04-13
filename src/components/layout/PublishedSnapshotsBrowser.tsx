import { useState, useEffect, useRef } from 'react'
import { RotateCw, Trash2 } from 'lucide-react'
import type { PublishedSnapshot } from '../../types'
import {
  getPublishedSnapshots,
  createPublishedSnapshot,
  deletePublishedSnapshot,
} from '../../stores/publishedSnapshotStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { formatTime } from '../../lib/formatTime'
import { countWords } from '../../lib/words'

interface Props {
  open: boolean
  onClose: () => void
}

export function PublishedSnapshotsBrowser({ open, onClose }: Props) {
  const [snapshots, setSnapshots] = useState<PublishedSnapshot[]>([])
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const activeStoryletId = useStoryletStore((s) => s.activeStoryletId)
  const setStoryletPublishedMeta = useStoryletStore((s) => s.setStoryletPublishedMeta)

  useEffect(() => {
    if (!open || !activeStoryletId) return
    let cancelled = false
    getPublishedSnapshots(activeStoryletId)
      .then((snaps) => {
        if (cancelled) return
        setSnapshots(snaps)
        setDeleteConfirmId(null)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open, activeStoryletId])

  // Close on Escape
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (deleteConfirmId !== null) {
          setDeleteConfirmId(null)
        } else {
          e.preventDefault()
          onClose()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, deleteConfirmId])

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

  async function handleDelete(snapshotId: string) {
    if (!activeStoryletId) return
    if (deleteConfirmId !== snapshotId) {
      setDeleteConfirmId(snapshotId)
      return
    }
    await deletePublishedSnapshot(activeStoryletId, snapshotId)
    const updated = await getPublishedSnapshots(activeStoryletId)
    setSnapshots(updated)
    setDeleteConfirmId(null)
  }

  async function handleRepublish(entry: PublishedSnapshot) {
    if (!activeStoryletId) return
    useStoryletStore.getState()._flushContentUpdate()
    const storylet = useStoryletStore
      .getState()
      .book?.storylets.find((s) => s.id === activeStoryletId)
    const content = storylet?.content ?? ''
    const snapshot = await createPublishedSnapshot(activeStoryletId, content, {
      name: entry.name,
      ...(entry.version !== undefined ? { version: entry.version } : {}),
      ...(entry.label !== undefined ? { label: entry.label } : {}),
    })
    setStoryletPublishedMeta(activeStoryletId, {
      lastPublishedAt: snapshot.publishedAt,
      lastPublishedSnapshotId: snapshot.id,
    })
    const updated = await getPublishedSnapshots(activeStoryletId)
    setSnapshots(updated)
  }

  if (!open) return null

  return (
    <div
      ref={panelRef}
      className="fixed right-0 top-0 bottom-0 z-50 w-[380px] max-w-[90vw] bg-gray-900 border-l border-gray-700 shadow-2xl flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <span className="text-sm font-medium text-gray-200">Published</span>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-300 text-xs"
        >
          Close
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {snapshots.length === 0 ? (
          <div className="px-4 py-8 text-center text-gray-500 text-sm">
            No published versions yet.
          </div>
        ) : (
          snapshots.map((entry) => {
            const isConfirming = deleteConfirmId === entry.id
            const wc = countWords(entry.content)
            return (
              <div
                key={entry.id}
                className="group px-4 py-2.5 border-b border-gray-800 hover:bg-gray-800 transition-colors"
                onClick={() => {
                  if (isConfirming) setDeleteConfirmId(null)
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-gray-200 truncate">
                    {entry.name}
                  </span>
                  {entry.version && (
                    <span className="shrink-0 text-[10px] text-gray-500 bg-gray-800 group-hover:bg-gray-700 px-1.5 py-0.5 rounded font-mono">
                      {entry.version}
                    </span>
                  )}
                </div>

                {entry.label && (
                  <div className="text-xs text-gray-500 mt-0.5">{entry.label}</div>
                )}

                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-gray-500">
                    {formatTime(entry.publishedAt)} &middot; {wc.toLocaleString()} words
                  </span>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        void handleRepublish(entry)
                      }}
                      className="p-1 text-gray-500 hover:text-gray-200 transition-colors"
                      title="Re-publish with current content"
                    >
                      <RotateCw size={13} />
                    </button>

                    {isConfirming ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleDelete(entry.id)
                        }}
                        className="px-1.5 py-0.5 text-[11px] font-medium text-red-400 hover:text-red-300 border border-red-700 hover:border-red-500 rounded transition-colors"
                        title="Confirm delete"
                      >
                        Confirm
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleDelete(entry.id)
                        }}
                        className="p-1 text-gray-500 hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

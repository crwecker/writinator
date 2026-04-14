import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, Copy, RotateCw, Send, Trash2 } from 'lucide-react'
import type { PublishedSnapshot, Snapshot } from '../../types'
import {
  getPublishedSnapshots,
  createPublishedSnapshot,
  deletePublishedSnapshot,
} from '../../stores/publishedSnapshotStore'
import { getSnapshots } from '../../stores/snapshotStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { usePublishSyncStore } from '../../stores/publishSyncStore'
import { formatTime } from '../../lib/formatTime'
import { countWords } from '../../lib/words'
import { computeDiff } from '../../lib/diff'
import { DiffView } from './DiffView'
import { renderStoryletAsMarkdown, renderStoryletAsHtml } from '../../lib/render'
import { inlineDocumentStyles } from '../../lib/export'

const snapshotTriggerLabel: Record<Snapshot['trigger'], string> = {
  manual: 'save',
  switch: 'switch',
  auto: 'auto',
  closeBook: 'close',
  bulkReplace: 'replace',
}

interface Props {
  onOpenPublishModal: () => void
  onRestoreSnapshot: (content: string) => void
  onClose: () => void
}

type CopyFormat = 'markdown' | 'html'
type CopiedFrom = `list-${string}` | 'preview' | null

function computeWordDelta(
  oldText: string,
  newText: string,
): { insertedWords: number; deletedWords: number } {
  const segments = computeDiff(oldText, newText)
  let insertedWords = 0
  let deletedWords = 0
  for (const seg of segments) {
    if (seg.op === 'insert') insertedWords += countWords(seg.text)
    else if (seg.op === 'delete') deletedWords += countWords(seg.text)
  }
  return { insertedWords, deletedWords }
}

export function PublishedSnapshotsBrowser({ onOpenPublishModal, onRestoreSnapshot, onClose }: Props) {
  const [snapshots, setSnapshots] = useState<PublishedSnapshot[]>([])
  const [autoSnapshots, setAutoSnapshots] = useState<Snapshot[]>([])
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [snapshotPreviewId, setSnapshotPreviewId] = useState<string | null>(null)
  const [copyFormat, setCopyFormat] = useState<CopyFormat>('markdown')
  const [copiedFrom, setCopiedFrom] = useState<CopiedFrom>(null)
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeStoryletId = useStoryletStore((s) => s.activeStoryletId)
  const setStoryletPublishedMeta = useStoryletStore((s) => s.setStoryletPublishedMeta)
  // Subscribe to lastPublishedSnapshotId so we refresh the list when the user publishes via the modal
  const lastPublishedSnapshotId = useStoryletStore((s) => {
    if (!s.activeStoryletId) return undefined
    return s.book?.storylets.find((st) => st.id === s.activeStoryletId)?.lastPublishedSnapshotId
  })
  // Read current storylet content directly from the store (subscribe so it stays fresh)
  const currentContent = useStoryletStore((s) => {
    if (!s.activeStoryletId) return ''
    return s.book?.storylets.find((st) => st.id === s.activeStoryletId)?.content ?? ''
  })

  // Load snapshots whenever the active storylet changes or a new version is published
  useEffect(() => {
    if (!activeStoryletId) return
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
  }, [activeStoryletId, lastPublishedSnapshotId])

  // Load auto-snapshots whenever the active storylet changes
  useEffect(() => {
    if (!activeStoryletId) return
    let cancelled = false
    getSnapshots(activeStoryletId)
      .then((snaps) => {
        if (cancelled) return
        setAutoSnapshots(snaps)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [activeStoryletId, lastPublishedSnapshotId])

  // Reset preview when switching storylets
  useEffect(() => {
    setPreviewId(null)
    setSnapshotPreviewId(null)
  }, [activeStoryletId])

  // Flush pending editor content when entering preview so the diff is current
  useEffect(() => {
    if (!activeStoryletId || previewId === null) return
    useStoryletStore.getState()._flushContentUpdate()
  }, [activeStoryletId, previewId])

  // Clean up the copied-feedback timer on unmount
  useEffect(() => {
    return () => {
      if (copiedTimerRef.current !== null) {
        clearTimeout(copiedTimerRef.current)
      }
    }
  }, [])

  // Escape navigates within the panel (preview → list, confirm → cancel). Does not close the panel.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (previewId !== null) {
        e.preventDefault()
        e.stopPropagation()
        setPreviewId(null)
      } else if (snapshotPreviewId !== null) {
        e.preventDefault()
        e.stopPropagation()
        setSnapshotPreviewId(null)
      } else if (deleteConfirmId !== null) {
        setDeleteConfirmId(null)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [deleteConfirmId, previewId, snapshotPreviewId])

  async function handleDelete(snapshotId: string) {
    if (!activeStoryletId) return
    if (deleteConfirmId !== snapshotId) {
      setDeleteConfirmId(snapshotId)
      return
    }

    // Check if we're deleting the snapshot that is marked as the latest published one.
    // If so, evict the cache so the AppShell effect re-resolves on next book change.
    const storylet = useStoryletStore
      .getState()
      .book?.storylets.find((s) => s.id === activeStoryletId)
    if (storylet?.lastPublishedSnapshotId === snapshotId) {
      const { evictLastPublishedContent, setNeedsSync } = usePublishSyncStore.getState()
      evictLastPublishedContent(activeStoryletId)
      setNeedsSync(activeStoryletId, false)
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

    // Update sync cache so the dot clears immediately.
    const { setLastPublishedContent, setNeedsSync } = usePublishSyncStore.getState()
    setLastPublishedContent(activeStoryletId, content)
    setNeedsSync(activeStoryletId, false)

    const updated = await getPublishedSnapshots(activeStoryletId)
    setSnapshots(updated)
  }

  function showCopiedFeedback(from: CopiedFrom) {
    if (copiedTimerRef.current !== null) {
      clearTimeout(copiedTimerRef.current)
    }
    setCopiedFrom(from)
    copiedTimerRef.current = setTimeout(() => {
      setCopiedFrom(null)
      copiedTimerRef.current = null
    }, 1500)
  }

  async function handleCopy(from: CopiedFrom) {
    if (!activeStoryletId) return
    useStoryletStore.getState()._flushContentUpdate()
    const state = useStoryletStore.getState()
    const book = state.book
    const storylet = book?.storylets.find((s) => s.id === activeStoryletId)
    if (!storylet || !book) return

    const documentStyles = state.globalSettings.documentStyles
    const text =
      copyFormat === 'html'
        ? inlineDocumentStyles(renderStoryletAsHtml(storylet, book), documentStyles)
        : renderStoryletAsMarkdown(storylet, book)

    try {
      await navigator.clipboard.writeText(text)
      showCopiedFeedback(from)
    } catch {
      // Fallback for environments where clipboard API is unavailable
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.focus()
      ta.select()
      try {
        document.execCommand('copy')
        showCopiedFeedback(from)
      } finally {
        document.body.removeChild(ta)
      }
    }
  }

  const previewEntry = previewId ? snapshots.find((s) => s.id === previewId) ?? null : null
  const snapshotPreviewEntry = snapshotPreviewId
    ? autoSnapshots.find((s) => s.id === snapshotPreviewId) ?? null
    : null

  return (
    <div className="flex flex-col bg-gray-900 border-l border-gray-700 h-full w-[380px] shrink-0 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        {previewEntry ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPreviewId(null)}
              className="flex items-center gap-1.5 text-gray-400 hover:text-gray-200 text-xs transition-colors"
            >
              <ArrowLeft size={13} />
              Back
            </button>
            <div className="flex items-center">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  void handleCopy('preview')
                }}
                disabled={!activeStoryletId}
                className="flex items-center gap-1 p-1 text-gray-500 hover:text-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                title="Copy current content to clipboard"
              >
                <Copy size={13} />
                <span className="text-xs">Copy</span>
              </button>
              {copiedFrom === 'preview' && (
                <span className="text-emerald-400 text-xs ml-2">Copied!</span>
              )}
            </div>
          </div>
        ) : snapshotPreviewEntry ? (
          <button
            onClick={() => setSnapshotPreviewId(null)}
            className="flex items-center gap-1.5 text-gray-400 hover:text-gray-200 text-xs transition-colors"
          >
            <ArrowLeft size={13} />
            Back
          </button>
        ) : (
          <span className="text-sm font-medium text-gray-200">History</span>
        )}
        {previewEntry ? (
          <button
            onClick={() => setPreviewId(null)}
            className="text-gray-500 hover:text-gray-300 text-xs"
          >
            List
          </button>
        ) : snapshotPreviewEntry ? (
          <button
            onClick={() => {
              onRestoreSnapshot(snapshotPreviewEntry.content)
              setSnapshotPreviewId(null)
            }}
            className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-600 text-white rounded text-xs font-medium"
          >
            Restore
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={onOpenPublishModal}
              disabled={!activeStoryletId}
              className="flex items-center gap-1 px-2 py-0.5 text-xs text-emerald-300 hover:text-emerald-200 border border-emerald-700 hover:border-emerald-500 rounded disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="Publish current storylet content"
            >
              <Send size={12} />
              Publish
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-300 text-xs"
            >
              Close
            </button>
          </div>
        )}
      </div>

      {/* Format toggle — hidden when viewing a snapshot preview */}
      {!snapshotPreviewEntry && (
      <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-800">
        <span className="text-[11px] text-gray-500 shrink-0">Copy format:</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCopyFormat('markdown')}
            className={`px-2 py-0.5 text-[11px] rounded-full transition-colors ${
              copyFormat === 'markdown'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            MD
          </button>
          <button
            onClick={() => setCopyFormat('html')}
            className={`px-2 py-0.5 text-[11px] rounded-full transition-colors ${
              copyFormat === 'html'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-gray-200'
            }`}
          >
            HTML
          </button>
        </div>
      </div>
      )}

      {snapshotPreviewEntry ? (
        /* ── Snapshot preview view ── */
        <div className="flex-1 flex flex-col min-h-0">
          <div className="px-4 py-2 border-b border-gray-800 text-xs text-gray-400">
            {formatTime(snapshotPreviewEntry.timestamp)} &middot; {snapshotPreviewEntry.wordCount.toLocaleString()} words
          </div>
          <pre className="flex-1 overflow-auto px-4 py-3 text-sm text-gray-300 whitespace-pre-wrap font-serif leading-relaxed">
            {snapshotPreviewEntry.content}
          </pre>
        </div>
      ) : previewEntry ? (
        /* ── Preview / diff view ── */
        <div className="flex-1 flex flex-col min-h-0">
          {/* Snapshot metadata */}
          <div className="px-4 py-2.5 border-b border-gray-800">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-200 truncate">
                {previewEntry.name}
              </span>
              {previewEntry.version && (
                <span className="shrink-0 text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded font-mono">
                  {previewEntry.version}
                </span>
              )}
            </div>
            {previewEntry.label && (
              <div className="text-xs text-gray-500 mt-0.5">{previewEntry.label}</div>
            )}
            <div className="text-xs text-gray-500 mt-0.5">
              {formatTime(previewEntry.publishedAt)}
            </div>
            {/* Word-count delta */}
            <WordDeltaLine
              oldText={previewEntry.content}
              newText={currentContent}
            />
          </div>

          {/* Diff body */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            <DiffView
              oldText={previewEntry.content}
              newText={currentContent}
            />
          </div>
        </div>
      ) : (
        /* ── List view ── */
        <div className="flex-1 overflow-y-auto">
          <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-gray-500 bg-gray-950/40 border-b border-gray-800">
            Published
          </div>
          {snapshots.length === 0 ? (
            <div className="px-4 py-6 text-center text-gray-500 text-sm">
              No published versions yet.
            </div>
          ) : (
            snapshots.map((entry) => {
              const isConfirming = deleteConfirmId === entry.id
              const wc = countWords(entry.content)
              const listCopiedKey: CopiedFrom = `list-${entry.id}`
              const isCopied = copiedFrom === listCopiedKey
              return (
                <div
                  key={entry.id}
                  className="group px-4 py-2.5 border-b border-gray-800 hover:bg-gray-800 transition-colors cursor-pointer"
                  onClick={() => {
                    if (isConfirming) {
                      setDeleteConfirmId(null)
                      return
                    }
                    setPreviewId(entry.id)
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
                      {isCopied && (
                        <span className="text-emerald-400 text-xs mr-1">Copied!</span>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          void handleCopy(listCopiedKey)
                        }}
                        disabled={!activeStoryletId}
                        className="p-1 text-gray-500 hover:text-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Copy current content to clipboard"
                      >
                        <Copy size={13} />
                      </button>

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

          <div className="px-4 py-1.5 text-[10px] uppercase tracking-wider text-gray-500 bg-gray-950/40 border-y border-gray-800">
            Snapshots
          </div>
          {autoSnapshots.length === 0 ? (
            <div className="px-4 py-6 text-center text-gray-500 text-sm">
              No snapshots yet. Snapshots are created on save, storylet switch, and every 5 minutes.
            </div>
          ) : (
            autoSnapshots.map((s) => (
              <button
                key={s.id}
                onClick={() => setSnapshotPreviewId(s.id)}
                className="w-full text-left px-4 py-2.5 hover:bg-gray-800 border-b border-gray-800 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-300">{formatTime(s.timestamp)}</span>
                  <span className="text-[10px] text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded font-mono">
                    {snapshotTriggerLabel[s.trigger]}
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

// ── Small helper component so the word-delta computation is isolated ──
interface WordDeltaLineProps {
  oldText: string
  newText: string
}

function WordDeltaLine({ oldText, newText }: WordDeltaLineProps) {
  const { insertedWords, deletedWords } = computeWordDelta(oldText, newText)

  if (insertedWords === 0 && deletedWords === 0) {
    return (
      <p className="text-[11px] text-gray-600 mt-1">No word changes.</p>
    )
  }

  return (
    <p className="text-[11px] text-gray-500 mt-1">
      {insertedWords > 0 && (
        <span className="text-emerald-400">+{insertedWords.toLocaleString()} words</span>
      )}
      {insertedWords > 0 && deletedWords > 0 && (
        <span className="mx-1 text-gray-600">/</span>
      )}
      {deletedWords > 0 && (
        <span className="text-red-400">−{deletedWords.toLocaleString()} words</span>
      )}
    </p>
  )
}

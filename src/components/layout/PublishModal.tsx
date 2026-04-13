import { useState, useEffect, useRef, useCallback } from 'react'
import { useStoryletStore } from '../../stores/storyletStore'
import { createPublishedSnapshot } from '../../stores/publishedSnapshotStore'
import { usePublishSyncStore } from '../../stores/publishSyncStore'

interface Props {
  open: boolean
  onClose: () => void
}

export function PublishModal({ open, onClose }: Props) {
  const activeStoryletId = useStoryletStore((s) => s.activeStoryletId)
  const activeStorylet = useStoryletStore((s) =>
    s.book?.storylets.find((sl) => sl.id === s.activeStoryletId) ?? null
  )
  const setStoryletPublishedMeta = useStoryletStore((s) => s.setStoryletPublishedMeta)

  const [name, setName] = useState('')
  const [version, setVersion] = useState('')
  const [label, setLabel] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const overlayRef = useRef<HTMLDivElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Prefill name when modal opens
  useEffect(() => {
    if (open && activeStorylet) {
      setName(activeStorylet.name)
      setVersion('')
      setLabel('')
      setSubmitting(false)
    }
  }, [open, activeStorylet])

  // Focus name input on open
  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => {
        nameInputRef.current?.focus()
        nameInputRef.current?.select()
      })
      return () => cancelAnimationFrame(frame)
    }
  }, [open])

  // Escape closes
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === overlayRef.current) onClose()
    },
    [onClose]
  )

  const handleSubmit = useCallback(async () => {
    const trimmedName = name.trim()
    if (!trimmedName || !activeStoryletId || submitting) return

    setSubmitting(true)
    try {
      // Flush any pending debounced content update
      useStoryletStore.getState()._flushContentUpdate()

      // Read content from store after flush
      const storylet = useStoryletStore
        .getState()
        .book?.storylets.find((s) => s.id === activeStoryletId)
      const content = storylet?.content ?? ''

      const snapshot = await createPublishedSnapshot(activeStoryletId, content, {
        name: trimmedName,
        ...(version.trim() ? { version: version.trim() } : {}),
        ...(label.trim() ? { label: label.trim() } : {}),
      })

      setStoryletPublishedMeta(activeStoryletId, {
        lastPublishedAt: snapshot.publishedAt,
        lastPublishedSnapshotId: snapshot.id,
      })

      // Immediately zero out the sync indicator for this storylet.
      const { setLastPublishedContent, setNeedsSync } = usePublishSyncStore.getState()
      setLastPublishedContent(activeStoryletId, content)
      setNeedsSync(activeStoryletId, false)

      onClose()
    } finally {
      setSubmitting(false)
    }
  }, [name, version, label, activeStoryletId, submitting, setStoryletPublishedMeta, onClose])

  if (!open) return null

  const canSubmit = name.trim().length > 0 && !submitting

  const inputClass =
    'bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-white outline-none focus:border-blue-500 w-full'

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={handleOverlayClick}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[420px] max-w-[calc(100vw-2rem)] p-5 flex flex-col gap-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-gray-200">Publish Storylet</h2>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400" htmlFor="publish-name">
              Name <span className="text-gray-600">(required)</span>
            </label>
            <input
              id="publish-name"
              ref={nameInputRef}
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canSubmit) {
                  e.preventDefault()
                  void handleSubmit()
                }
              }}
              placeholder="Snapshot name"
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400" htmlFor="publish-version">
              Version <span className="text-gray-600">(optional)</span>
            </label>
            <input
              id="publish-version"
              className={inputClass}
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              placeholder="e.g. 1.0, draft-2"
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-gray-400" htmlFor="publish-label">
              Label <span className="text-gray-600">(optional)</span>
            </label>
            <input
              id="publish-label"
              className={inputClass}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. beta, final, for-review"
              autoComplete="off"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors rounded"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
          >
            {submitting ? 'Publishing…' : 'Publish'}
          </button>
        </div>
      </div>
    </div>
  )
}

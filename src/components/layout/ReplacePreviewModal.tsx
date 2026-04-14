import { useEffect, useRef, useCallback } from 'react'
import type { ReplacePreview, ReplacePreviewMatch } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  previews: ReplacePreview[]
  submitting?: boolean
}

export function ReplacePreviewModal({
  open,
  onClose,
  onConfirm,
  previews,
  submitting = false,
}: Props) {
  const overlayRef = useRef<HTMLDivElement>(null)

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

  if (!open) return null

  const totalMatches = previews.reduce((sum, p) => sum + p.matches.length, 0)
  const storyletCount = previews.length
  const noChanges = totalMatches === 0

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60"
      onMouseDown={handleOverlayClick}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[640px] max-w-[calc(100vw-2rem)] max-h-[80vh] flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-200">
            {noChanges
              ? 'No matches to replace'
              : `Replace ${totalMatches} ${totalMatches === 1 ? 'match' : 'matches'} in ${storyletCount} ${storyletCount === 1 ? 'storylet' : 'storylets'}`}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-xs"
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-5">
          {noChanges ? (
            <div className="text-sm text-gray-500 text-center py-8">
              The current search matches no content in the selected scope.
            </div>
          ) : (
            previews.map((preview) => (
              <PreviewSection key={preview.storyletId} preview={preview} />
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-700 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200 transition-colors rounded"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={noChanges || submitting}
            className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded text-sm font-medium transition-colors"
          >
            {submitting ? 'Replacing…' : 'Replace & snapshot'}
          </button>
        </div>
      </div>
    </div>
  )
}

interface PreviewSectionProps {
  preview: ReplacePreview
}

function PreviewSection({ preview }: PreviewSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-medium text-gray-400 uppercase tracking-wider flex items-center gap-2">
        <span>{preview.storyletName}</span>
        <span className="text-gray-600 normal-case tracking-normal">
          {preview.matches.length} {preview.matches.length === 1 ? 'change' : 'changes'}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {preview.matches.map((m, idx) => (
          <DiffRow key={`${m.start}-${idx}`} match={m} />
        ))}
      </div>
    </div>
  )
}

function DiffRow({ match }: { match: ReplacePreviewMatch }) {
  const [bi, bj] = match.beforeMatchRange
  const beforeBefore = match.beforeSnippet.slice(0, bi)
  const beforeHit = match.beforeSnippet.slice(bi, bj)
  const beforeAfter = match.beforeSnippet.slice(bj)

  const [ai, aj] = match.afterReplacementRange
  const afterBefore = match.afterSnippet.slice(0, ai)
  const afterHit = match.afterSnippet.slice(ai, aj)
  const afterAfter = match.afterSnippet.slice(aj)

  return (
    <div className="bg-gray-800/50 border border-gray-800 rounded px-3 py-2 font-mono text-xs flex flex-col gap-1">
      <div className="flex items-start gap-2 whitespace-pre-wrap break-words">
        <span className="text-red-400 select-none">−</span>
        <div className="flex-1">
          <span className="text-gray-500">{beforeBefore}</span>
          <span className="bg-red-500/20 text-red-200 line-through rounded px-0.5">{beforeHit}</span>
          <span className="text-gray-500">{beforeAfter}</span>
        </div>
      </div>
      <div className="flex items-start gap-2 whitespace-pre-wrap break-words">
        <span className="text-emerald-400 select-none">+</span>
        <div className="flex-1">
          <span className="text-gray-500">{afterBefore}</span>
          <span className="bg-emerald-500/20 text-emerald-200 rounded px-0.5">{afterHit}</span>
          <span className="text-gray-500">{afterAfter}</span>
        </div>
      </div>
    </div>
  )
}

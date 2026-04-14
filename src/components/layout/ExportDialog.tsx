import { useState, useEffect, useRef, useCallback } from 'react'
import { useStoryletStore } from '../../stores/storyletStore'
import {
  exportAsMarkdown,
  exportAsPlainText,
  exportAsHtml,
  exportAsRtf,
  exportAsDocx,
  exportAsPdf,
  exportAsEpub,
  exportAsZip,
} from '../../lib/export'
import type { Book, DocumentStyles } from '../../types'

type ExportFn = (book: Book, documentStyles?: DocumentStyles) => void | Promise<void>

const formats: { label: string; sub: string; action: ExportFn }[] = [
  { label: 'Markdown', sub: '.md', action: exportAsMarkdown },
  { label: 'Plain text', sub: '.txt', action: exportAsPlainText },
  { label: 'HTML', sub: '.html', action: exportAsHtml },
  { label: 'RTF', sub: '.rtf', action: exportAsRtf },
  { label: 'Word', sub: '.docx', action: exportAsDocx },
  { label: 'PDF', sub: '.pdf', action: exportAsPdf },
  { label: 'EPUB', sub: '.epub', action: exportAsEpub },
]

const zipFormats: { label: string; sub: string; format: 'md' | 'txt' | 'html' }[] = [
  { label: 'Zip (Markdown)', sub: '.zip', format: 'md' },
  { label: 'Zip (Plain Text)', sub: '.zip', format: 'txt' },
  { label: 'Zip (HTML)', sub: '.zip', format: 'html' },
]

interface Props {
  open: boolean
  onClose: () => void
}

export function ExportDialog({ open, onClose }: Props) {
  const [exporting, setExporting] = useState<string | null>(null)
  const overlayRef = useRef<HTMLDivElement>(null)

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
    [onClose],
  )

  const runExport = useCallback(async (label: string, fn: ExportFn) => {
    const book = useStoryletStore.getState().book
    if (!book) return
    useStoryletStore.getState()._flushContentUpdate()
    const currentBook = useStoryletStore.getState().book!
    const docStyles = useStoryletStore.getState().globalSettings.documentStyles
    setExporting(label)
    try {
      await fn(currentBook, docStyles)
    } finally {
      setExporting(null)
      onClose()
    }
  }, [onClose])

  if (!open) return null

  const cellClass =
    'flex flex-col items-start gap-0.5 px-3 py-2 text-left bg-gray-800 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed rounded text-sm text-gray-200 transition-colors'

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={handleOverlayClick}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-[480px] max-w-[calc(100vw-2rem)] p-5 flex flex-col gap-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-200">Export Book</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 text-xs"
          >
            Close
          </button>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Single file</div>
            <div className="grid grid-cols-3 gap-2">
              {formats.map((fmt) => (
                <button
                  key={fmt.label}
                  disabled={exporting !== null}
                  onClick={() => void runExport(fmt.label, fmt.action)}
                  className={cellClass}
                >
                  <span className="font-medium">{exporting === fmt.label ? 'Exporting…' : fmt.label}</span>
                  <span className="text-[10px] text-gray-500 font-mono">{fmt.sub}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Zip archive (per storylet)</div>
            <div className="grid grid-cols-3 gap-2">
              {zipFormats.map((fmt) => (
                <button
                  key={fmt.label}
                  disabled={exporting !== null}
                  onClick={() => void runExport(fmt.label, (book, styles) => exportAsZip(book, fmt.format, styles))}
                  className={cellClass}
                >
                  <span className="font-medium">{exporting === fmt.label ? 'Exporting…' : fmt.label}</span>
                  <span className="text-[10px] text-gray-500 font-mono">{fmt.sub}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

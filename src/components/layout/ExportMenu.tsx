import { useState, useEffect, useRef } from 'react'
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
import type { Book } from '../../types'

type ExportFn = (book: Book) => void | Promise<void>

const formats: { label: string; action: ExportFn }[] = [
  { label: 'Markdown (.md)', action: exportAsMarkdown },
  { label: 'Plain text (.txt)', action: exportAsPlainText },
  { label: 'HTML (.html)', action: exportAsHtml },
  { label: 'RTF (.rtf)', action: exportAsRtf },
  { label: 'Word (.docx)', action: exportAsDocx },
  { label: 'PDF (.pdf)', action: exportAsPdf },
  { label: 'EPUB (.epub)', action: exportAsEpub },
]

const zipFormats: { label: string; format: 'md' | 'txt' | 'html' }[] = [
  { label: 'Zip (Markdown)', format: 'md' },
  { label: 'Zip (Plain Text)', format: 'txt' },
  { label: 'Zip (HTML)', format: 'html' },
]

export function ExportMenu() {
  const [open, setOpen] = useState(false)
  const [exporting, setExporting] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => setOpen((prev) => !prev)}
        className="text-gray-500 hover:text-gray-300 transition-colors px-2 py-0.5 text-xs"
        title="Export book"
      >
        Export
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute top-full right-0 mt-1 z-50 w-[180px] bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-1"
        >
          {formats.map((fmt) => (
            <button
              key={fmt.label}
              disabled={exporting !== null}
              onClick={async () => {
                const book = useStoryletStore.getState().book
                if (!book) return
                useStoryletStore.getState()._flushContentUpdate()
                const currentBook = useStoryletStore.getState().book!
                setExporting(fmt.label)
                try {
                  await fmt.action(currentBook)
                } finally {
                  setExporting(null)
                  setOpen(false)
                }
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors disabled:opacity-50"
            >
              {exporting === fmt.label ? 'Exporting...' : fmt.label}
            </button>
          ))}
          <div className="border-t border-gray-700 my-1" />
          <div className="px-3 py-1 text-xs text-gray-500 uppercase tracking-wider">Zip Archive</div>
          {zipFormats.map((fmt) => (
            <button
              key={fmt.label}
              disabled={exporting !== null}
              onClick={async () => {
                const book = useStoryletStore.getState().book
                if (!book) return
                useStoryletStore.getState()._flushContentUpdate()
                const currentBook = useStoryletStore.getState().book!
                setExporting(fmt.label)
                try {
                  await exportAsZip(currentBook, fmt.format)
                } finally {
                  setExporting(null)
                  setOpen(false)
                }
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors disabled:opacity-50"
            >
              {exporting === fmt.label ? 'Exporting...' : fmt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

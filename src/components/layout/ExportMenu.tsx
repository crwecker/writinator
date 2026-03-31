import { useState, useEffect, useRef } from 'react'
import { useDocumentStore } from '../../stores/documentStore'
import { exportAsMarkdown, exportAsPlainText, exportAsHtml } from '../../lib/export'

const formats = [
  { label: 'Markdown (.md)', action: exportAsMarkdown },
  { label: 'Plain text (.txt)', action: exportAsPlainText },
  { label: 'HTML (.html)', action: exportAsHtml },
] as const

export function ExportMenu() {
  const [open, setOpen] = useState(false)
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
              onClick={() => {
                const book = useDocumentStore.getState().book
                if (book) {
                  useDocumentStore.getState()._flushContentUpdate()
                  fmt.action(useDocumentStore.getState().book!)
                }
                setOpen(false)
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 hover:text-gray-100 transition-colors"
            >
              {fmt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

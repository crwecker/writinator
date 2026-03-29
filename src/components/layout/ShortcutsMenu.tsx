import { useState, useEffect, useRef } from 'react'

const isMac = navigator.platform.toUpperCase().includes('MAC')
const mod = isMac ? '⌘' : 'Ctrl'

const shortcuts = [
  { keys: `${mod}+Shift+F`, action: 'Toggle typewriter mode' },
  { keys: `${mod}+B`, action: 'Toggle file tree' },
  { keys: `${mod}+S`, action: 'Save to disk' },
  { keys: `${mod}+O`, action: 'Open from disk' },
  { section: 'VIM' },
  { keys: 'i', action: 'Enter insert mode' },
  { keys: 'Esc / kj', action: 'Enter normal mode' },
  { keys: 'v', action: 'Visual mode' },
  { keys: '/', action: 'Search' },
  { keys: 'u', action: 'Undo' },
  { keys: 'Ctrl+R', action: 'Redo' },
] as const

type ShortcutItem = { keys: string; action: string } | { section: string }

export function ShortcutsMenu() {
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
        title="Keyboard shortcuts"
      >
        ?
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute top-full right-0 mt-1 z-50 w-[240px] bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-2 px-3"
        >
          <div className="text-gray-400 text-[11px] font-medium uppercase tracking-wider mb-2">
            Shortcuts
          </div>
          {(shortcuts as readonly ShortcutItem[]).map((item, i) => {
            if ('section' in item) {
              return (
                <div key={i} className="text-gray-400 text-[11px] font-medium uppercase tracking-wider mt-3 mb-1 pt-2 border-t border-gray-700">
                  {item.section}
                </div>
              )
            }
            return (
              <div key={i} className="flex items-center justify-between py-1 text-xs">
                <span className="text-gray-400">{item.action}</span>
                <kbd className="text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded text-[10px] font-mono">
                  {item.keys}
                </kbd>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import {
  useKeybindingStore,
  comboToString,
  comboFromEvent,
  ACTION_LABELS,
  type ActionName,
} from '../../stores/keybindingStore'

const actionOrder: ActionName[] = [
  'toggleTypewriter',
  'toggleFileTree',
  'toggleRenderMode',
  'saveToDisk',
  'openFromDisk',
  'snapshotHistory',
]

const vimShortcuts = [
  { keys: 'i', action: 'Enter insert mode' },
  { keys: 'Esc / kj', action: 'Enter normal mode' },
  { keys: 'v', action: 'Visual mode' },
  { keys: '/', action: 'Search' },
  { keys: 'u', action: 'Undo' },
  { keys: 'Ctrl+R', action: 'Redo' },
]

export function ShortcutsMenu() {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ActionName | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const keymap = useKeybindingStore((s) => s.keymap)
  const setBinding = useKeybindingStore((s) => s.setBinding)
  const resetAll = useKeybindingStore((s) => s.resetAll)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
        setEditing(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  // Capture key when editing a binding
  useEffect(() => {
    if (!editing) return
    function onKey(e: KeyboardEvent) {
      e.preventDefault()
      e.stopPropagation()
      const combo = comboFromEvent(e)
      if (!combo) return // bare modifier, keep waiting
      setBinding(editing!, combo)
      setEditing(null)
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [editing, setBinding])

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        onClick={() => { setOpen((prev) => !prev); setEditing(null) }}
        className="text-gray-500 hover:text-gray-300 transition-colors px-2 py-0.5 text-xs"
        title="Keyboard shortcuts"
      >
        ?
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute top-full right-0 mt-1 z-50 w-[270px] bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-2 px-3"
        >
          <div className="text-gray-400 text-[11px] font-medium uppercase tracking-wider mb-2">
            Shortcuts
            <button
              onClick={resetAll}
              className="float-right text-gray-600 hover:text-gray-400 normal-case tracking-normal"
            >
              Reset
            </button>
          </div>

          {actionOrder.map((action) => (
            <div key={action} className="flex items-center justify-between py-1 text-xs">
              <span className="text-gray-400">{ACTION_LABELS[action]}</span>
              <button
                onClick={() => setEditing(editing === action ? null : action)}
                className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                  editing === action
                    ? 'bg-emerald-800 text-emerald-200 animate-pulse'
                    : 'text-gray-500 bg-gray-800 hover:bg-gray-700 hover:text-gray-300'
                }`}
                title="Click to rebind"
              >
                {editing === action ? 'Press key...' : comboToString(keymap[action])}
              </button>
            </div>
          ))}

          <div className="text-gray-400 text-[11px] font-medium uppercase tracking-wider mt-3 mb-1 pt-2 border-t border-gray-700">
            VIM
          </div>
          {vimShortcuts.map((item, i) => (
            <div key={i} className="flex items-center justify-between py-1 text-xs">
              <span className="text-gray-400">{item.action}</span>
              <kbd className="text-gray-500 bg-gray-800 px-1.5 py-0.5 rounded text-[10px] font-mono">
                {item.keys}
              </kbd>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

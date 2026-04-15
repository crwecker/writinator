import { useState, useEffect, useRef } from 'react'
import { Menu } from 'lucide-react'
import {
  useKeybindingStore,
  comboToString,
  comboFromEvent,
  type ActionName,
} from '../../stores/keybindingStore'

export interface MenuAction {
  action: ActionName
  label: string
  onSelect: () => void
}

interface Props {
  items: MenuAction[]
}

export function HamburgerMenu({ items }: Props) {
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<ActionName | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const keymap = useKeybindingStore((s) => s.keymap)
  const setBinding = useKeybindingStore((s) => s.setBinding)
  const resetAll = useKeybindingStore((s) => s.resetAll)

  useEffect(() => {
    if (!open) return
    function onClickOutside(e: MouseEvent) {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
        setEditing(null)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !editing) setOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, editing])

  // Capture next key when editing a binding
  useEffect(() => {
    if (!editing) return
    function onKey(e: KeyboardEvent) {
      e.preventDefault()
      e.stopPropagation()
      const combo = comboFromEvent(e)
      if (!combo) return
      if (e.key === 'Escape') {
        setEditing(null)
        return
      }
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
        className="text-gray-500 hover:text-gray-300 transition-colors px-1.5 py-0.5"
        title="Menu"
      >
        <Menu size={14} />
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute top-full right-0 mt-1 z-50 w-[280px] bg-gray-900 border border-gray-700 rounded-lg shadow-xl py-2 px-2"
        >
          <div className="flex items-center justify-between text-gray-400 text-[11px] font-medium uppercase tracking-wider px-1 mb-1">
            <span>Menu</span>
            <button
              onClick={resetAll}
              className="text-gray-600 hover:text-gray-400 normal-case tracking-normal text-[10px]"
              title="Reset all shortcuts to defaults"
            >
              Reset
            </button>
          </div>

          {items.map((item) => {
            const isEditing = editing === item.action
            return (
              <div
                key={item.action}
                className="flex items-center justify-between gap-2 rounded hover:bg-gray-800 transition-colors"
              >
                <button
                  onClick={() => {
                    item.onSelect()
                    setOpen(false)
                    setEditing(null)
                  }}
                  className="flex-1 text-left px-2 py-1.5 text-xs text-gray-300 hover:text-gray-100"
                >
                  {item.label}
                </button>
                <button
                  onClick={() => setEditing(isEditing ? null : item.action)}
                  className={`mr-1 px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors ${
                    isEditing
                      ? 'bg-emerald-800 text-emerald-200 animate-pulse'
                      : 'text-gray-500 bg-gray-800 hover:bg-gray-700 hover:text-gray-300'
                  }`}
                  title="Click to rebind"
                >
                  {isEditing ? 'Press key…' : (keymap[item.action] ? comboToString(keymap[item.action]!) : '—')}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

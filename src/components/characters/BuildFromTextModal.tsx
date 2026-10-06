import { useEffect, useMemo, useRef, useState } from 'react'
import { useCharacterStore } from '../../stores/characterStore'
import { mergeStatusIntoCharacter, parseStatusWindow } from '../../lib/statusWindowParser'
import { createCharacterFromPreset } from '../../lib/characterPresets'
import { PANEL_VALUE_FORMAT, formatStatValue } from '../../lib/statFormat'
import { nextCharacterColor } from './characterColors'
import type { Character } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
  /** Update this character; null creates a new one. */
  target: Character | null
  onApplied?: (characterId: string) => void
}

const EXAMPLE = 'HP: 40/50, MP 10/20, STR 12 DEX 9, Level 3, Inventory: Healing Potion x2, Rope'

/** Paste a status window, preview what it reads, then create or update a sheet. */
export function BuildFromTextModal({ open, onClose, target, onApplied }: Props) {
  const [text, setText] = useState('')
  const areaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (open) areaRef.current?.focus()
  }, [open])

  const parsed = useMemo(() => parseStatusWindow(text), [text])
  const merge = useMemo(
    () => (target ? mergeStatusIntoCharacter(target, parsed) : null),
    [target, parsed],
  )

  if (!open) return null

  const empty = parsed.entries.length === 0

  function apply() {
    const store = useCharacterStore.getState()
    if (target) {
      const current = store.characters.find((c) => c.id === target.id)
      if (!current) return
      const result = mergeStatusIntoCharacter(current, parsed)
      store.updateCharacter(current.id, { stats: result.stats, baseValues: result.baseValues })
      onApplied?.(current.id)
    } else {
      const base = createCharacterFromPreset('blank', parsed.name ?? 'New Character', nextCharacterColor(store.characters.length))
      const result = mergeStatusIntoCharacter(base, parsed)
      store.addCharacter({ ...base, stats: result.stats, baseValues: result.baseValues })
      onApplied?.(base.id)
    }
    setText('')
    onClose()
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          onClose()
        }
      }}
    >
      <div
        data-testid="build-from-text-modal"
        className="w-[min(92vw,560px)] max-h-[85vh] flex flex-col bg-gray-900 border border-gray-700 rounded-lg shadow-2xl"
      >
        <div className="px-4 py-3 border-b border-gray-700 text-sm text-gray-200">
          {target ? `Update ${target.name} from text` : 'Build a character from text'}
        </div>
        <div className="p-4 space-y-3 overflow-y-auto">
          <p className="text-xs text-gray-500">
            Paste a status window. Numbers like “HP 40/50”, attributes like “STR 12”, and lists like
            “Inventory: Potion x2, Rope” are recognised.
          </p>
          <textarea
            ref={areaRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={EXAMPLE}
            className="w-full resize-y rounded border border-gray-700 bg-gray-800 px-2 py-1.5 font-mono text-xs text-gray-200 placeholder:text-gray-600 focus:border-gray-500 focus:outline-none"
          />
          {!empty && (
            <div className="rounded border border-gray-800 bg-gray-800/40 px-3 py-2 text-xs">
              {parsed.name && !target && (
                <div className="mb-1 text-gray-300">Name: <span className="text-gray-100">{parsed.name}</span></div>
              )}
              <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                {parsed.entries.map((e) => (
                  <div key={e.label} className="contents">
                    <span className="text-gray-400">{e.label}</span>
                    <span className="font-mono text-gray-200 truncate">{formatStatValue(e.value, { ...PANEL_VALUE_FORMAT, structuredItems: 'names' })}</span>
                  </div>
                ))}
              </div>
              {merge && (
                <div className="mt-2 text-[11px] text-gray-500">
                  {merge.updated.length > 0 && <div>Updates: {merge.updated.join(', ')}</div>}
                  {merge.added.length > 0 && <div>Adds: {merge.added.join(', ')}</div>}
                </div>
              )}
            </div>
          )}
          {text.trim() && empty && <p className="text-xs text-amber-400/80">Nothing recognised yet.</p>}
        </div>
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-gray-700">
          <button onClick={onClose} className="px-3 py-1 text-xs text-gray-400 hover:text-gray-200">
            Cancel
          </button>
          <button
            onClick={apply}
            disabled={empty}
            className="px-3 py-1 text-xs rounded bg-gray-700 text-gray-100 hover:bg-gray-600 disabled:opacity-40 disabled:hover:bg-gray-700"
          >
            {target ? `Update ${target.name}` : 'Create character'}
          </button>
        </div>
      </div>
    </div>
  )
}

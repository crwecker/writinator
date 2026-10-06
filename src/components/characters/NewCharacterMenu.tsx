import { useEffect, useRef, useState } from 'react'
import { useCharacterStore } from '../../stores/characterStore'
import { CHARACTER_PRESETS, createCharacterFromPreset, type CharacterPresetId } from '../../lib/characterPresets'
import { duplicateCharacter } from '../../lib/duplicateCharacter'
import { nextCharacterColor } from './characterColors'
import { BuildFromTextModal } from './BuildFromTextModal'
import type { Character } from '../../types'

interface Props {
  /** The sheet currently open — offered for copying / updating from text. */
  selected: Character | null
  onCreated: (id: string) => void
}

/** "+ New Character" with presets, copy-the-selected, and build-from-text. */
export function NewCharacterMenu({ selected, onCreated }: Props) {
  const [open, setOpen] = useState(false)
  const [textTarget, setTextTarget] = useState<'new' | 'selected' | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  function fromPreset(id: CharacterPresetId) {
    const store = useCharacterStore.getState()
    const c = createCharacterFromPreset(id, 'New Character', nextCharacterColor(store.characters.length))
    store.addCharacter(c)
    setOpen(false)
    onCreated(c.id)
  }

  function copySelected() {
    if (!selected) return
    const store = useCharacterStore.getState()
    const source = store.characters.find((c) => c.id === selected.id) ?? selected
    const copy = duplicateCharacter(source, store.characters.map((c) => c.name), nextCharacterColor(store.characters.length))
    store.addCharacter(copy)
    setOpen(false)
    onCreated(copy.id)
  }

  const item = 'w-full text-left px-3 py-1.5 hover:bg-gray-700/70 transition-colors'

  return (
    <div ref={rootRef} className="relative m-2">
      <button
        data-testid="new-character"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full text-sm text-gray-200 bg-gray-700 hover:bg-gray-600 transition-colors rounded px-2 py-1.5"
      >
        + New Character
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-10 w-64 rounded-md border border-gray-700 bg-gray-800 py-1 shadow-xl text-xs">
          {CHARACTER_PRESETS.map((p) => (
            <button key={p.id} onClick={() => fromPreset(p.id)} className={item}>
              <div className="text-gray-200">{p.label}</div>
              <div className="text-[10px] text-gray-500">{p.description}</div>
            </button>
          ))}
          <div className="my-1 border-t border-gray-700" />
          <button onClick={() => { setOpen(false); setTextTarget('new') }} className={`${item} text-gray-200`}>
            Build from text…
          </button>
          {selected && (
            <>
              <button onClick={() => { setOpen(false); setTextTarget('selected') }} className={`${item} text-gray-200`}>
                Update {selected.name} from text…
              </button>
              <button onClick={copySelected} className={`${item} text-gray-200`}>
                Copy {selected.name}
                <div className="text-[10px] text-gray-500">Same stats, no story changes</div>
              </button>
            </>
          )}
        </div>
      )}
      <BuildFromTextModal
        open={textTarget !== null}
        onClose={() => setTextTarget(null)}
        target={textTarget === 'selected' ? selected : null}
        onApplied={onCreated}
      />
    </div>
  )
}

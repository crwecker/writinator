import { useEffect, useRef, useState } from 'react'
import { useCharacterStore, DEFAULT_RANK_TIERS } from '../../stores/characterStore'
import { StatFieldEditor } from './StatFieldEditor'
import type { StatDefinition, StatType, StatValue } from '../../types'

interface Props {
  open: boolean
  onClose: () => void
}

const PRESET_COLORS = [
  '#f87171', // red
  '#fb923c', // orange
  '#facc15', // yellow
  '#4ade80', // green
  '#22d3ee', // cyan
  '#60a5fa', // blue
  '#a78bfa', // violet
  '#f472b6', // pink
]

function defaultValueFor(
  type: StatType,
  attributeKeys?: string[],
  rankTiers?: string[],
): StatValue {
  switch (type) {
    case 'number':
      return { kind: 'number', value: 0 }
    case 'numberWithMax':
      return { kind: 'numberWithMax', value: 0, max: 0 }
    case 'list':
      return { kind: 'list', items: [] }
    case 'text':
      return { kind: 'text', value: '' }
    case 'attributeSet':
      return {
        kind: 'attributeSet',
        values: Object.fromEntries((attributeKeys ?? []).map((k) => [k, 0])),
      }
    case 'rank': {
      const tiers = rankTiers && rankTiers.length > 0 ? rankTiers : DEFAULT_RANK_TIERS
      return { kind: 'rank', tier: tiers[0] }
    }
  }
}

export function CharacterSheetModal({ open, onClose }: Props) {
  const panelRef = useRef<HTMLDivElement>(null)

  const characters = useCharacterStore((s) => s.characters)
  const createCharacter = useCharacterStore((s) => s.createCharacter)
  const updateCharacter = useCharacterStore((s) => s.updateCharacter)
  const removeCharacter = useCharacterStore((s) => s.removeCharacter)
  const setBaseValue = useCharacterStore((s) => s.setBaseValue)
  const addStat = useCharacterStore((s) => s.addStat)
  const removeStat = useCharacterStore((s) => s.removeStat)
  const updateStat = useCharacterStore((s) => s.updateStat)
  const reorderStats = useCharacterStore((s) => s.reorderStats)
  const setEquipmentSlots = useCharacterStore((s) => s.setEquipmentSlots)

  const [explicitSelectedId, setExplicitSelectedId] = useState<string | null>(null)
  const explicitMatches = explicitSelectedId
    ? characters.some((c) => c.id === explicitSelectedId)
    : false
  const selectedId = explicitMatches ? explicitSelectedId : characters[0]?.id ?? null
  const selected = characters.find((c) => c.id === selectedId) ?? null
  const setSelectedId = setExplicitSelectedId

  // Escape-to-close
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

  // Click-outside-to-close
  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open, onClose])

  if (!open) return null

  function handleNewCharacter() {
    const id = createCharacter('New Character')
    setSelectedId(id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        ref={panelRef}
        data-testid="character-sheet-modal"
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[min(90vw,960px)] max-w-4xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <span className="text-sm font-medium text-gray-200">Characters</span>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-xs"
          >
            Close
          </button>
        </div>

        {/* Body: list + sheet */}
        <div className="flex flex-1 min-h-0">
          {/* Character list */}
          <div className="w-56 shrink-0 border-r border-gray-700 bg-gray-800/50 flex flex-col">
            <button
              data-testid="new-character"
              onClick={handleNewCharacter}
              className="text-sm text-gray-200 bg-gray-700 hover:bg-gray-600 transition-colors m-2 rounded px-2 py-1.5"
            >
              + New Character
            </button>
            <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
              {characters.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left text-sm transition-colors ${
                    c.id === selectedId
                      ? 'bg-gray-700 text-gray-100'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: c.color }}
                  />
                  <span className="truncate">{c.name}</span>
                </button>
              ))}
              {characters.length === 0 && (
                <p className="text-xs text-gray-600 italic px-2 py-2">
                  No characters yet.
                </p>
              )}
            </div>
          </div>

          {/* Sheet editor */}
          <div className="flex-1 min-w-0 overflow-y-auto p-5">
            {selected ? (
              <CharacterSheet
                key={selected.id}
                character={selected}
                onRename={(name) => updateCharacter(selected.id, { name })}
                onColorChange={(color) => updateCharacter(selected.id, { color })}
                onDelete={() => {
                  removeCharacter(selected.id)
                  setSelectedId(null)
                }}
                onBaseValueChange={(statId, v) => setBaseValue(selected.id, statId, v)}
                onAddStat={(stat, def) => addStat(selected.id, stat, def)}
                onRemoveStat={(statId) => removeStat(selected.id, statId)}
                onRenameStat={(statId, name) => updateStat(selected.id, statId, { name })}
                onReorderStats={(statIds) => reorderStats(selected.id, statIds)}
                onEquipmentSlotsChange={(slots) => setEquipmentSlots(selected.id, slots)}
              />
            ) : (
              <div className="text-sm text-gray-500 italic">
                Select or create a character to begin.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Character sheet panel
// ---------------------------------------------------------------------------

interface SheetProps {
  character: {
    id: string
    name: string
    color: string
    stats: StatDefinition[]
    baseValues: Record<string, StatValue>
    equipmentSlots: string[]
  }
  onRename: (name: string) => void
  onColorChange: (color: string) => void
  onDelete: () => void
  onBaseValueChange: (statId: string, value: StatValue) => void
  onAddStat: (stat: StatDefinition, defaultValue: StatValue) => void
  onRemoveStat: (statId: string) => void
  onRenameStat: (statId: string, name: string) => void
  onReorderStats: (statIds: string[]) => void
  onEquipmentSlotsChange: (slots: string[]) => void
}

function CharacterSheet({
  character,
  onRename,
  onColorChange,
  onDelete,
  onBaseValueChange,
  onAddStat,
  onRemoveStat,
  onRenameStat,
  onReorderStats,
  onEquipmentSlotsChange,
}: SheetProps) {
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newSlot, setNewSlot] = useState('')
  const [addingStat, setAddingStat] = useState(false)
  const [newStatName, setNewStatName] = useState('')
  const [newStatType, setNewStatType] = useState<StatType>('number')
  const [newStatTiers, setNewStatTiers] = useState('F,E,D,C,B,A,S')
  const [newStatAttrs, setNewStatAttrs] = useState('STR,DEX,CON,INT,WIS,CHA')
  const [renamingStatId, setRenamingStatId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  function commitNewStat() {
    const name = newStatName.trim()
    if (!name) return
    const id = crypto.randomUUID()
    let stat: StatDefinition
    let defValue: StatValue
    if (newStatType === 'rank') {
      const tiers = newStatTiers
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      stat = { id, name, type: 'rank', rankTiers: tiers.length > 0 ? tiers : DEFAULT_RANK_TIERS }
      defValue = defaultValueFor('rank', undefined, stat.rankTiers)
    } else if (newStatType === 'attributeSet') {
      const keys = newStatAttrs
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
      stat = { id, name, type: 'attributeSet', attributeKeys: keys }
      defValue = defaultValueFor('attributeSet', keys)
    } else {
      stat = { id, name, type: newStatType }
      defValue = defaultValueFor(newStatType)
    }
    onAddStat(stat, defValue)
    setAddingStat(false)
    setNewStatName('')
    setNewStatType('number')
    setNewStatTiers('F,E,D,C,B,A,S')
    setNewStatAttrs('STR,DEX,CON,INT,WIS,CHA')
  }

  function moveStat(statId: string, dir: -1 | 1) {
    const ids = character.stats.map((s) => s.id)
    const i = ids.indexOf(statId)
    const j = i + dir
    if (i < 0 || j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    onReorderStats(ids)
  }

  function addSlot() {
    const v = newSlot.trim()
    if (!v) return
    onEquipmentSlotsChange([...character.equipmentSlots, v])
    setNewSlot('')
  }

  function renameSlot(index: number, next: string) {
    const slots = character.equipmentSlots.map((s, i) => (i === index ? next : s))
    onEquipmentSlotsChange(slots)
  }

  function removeSlot(index: number) {
    onEquipmentSlotsChange(character.equipmentSlots.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-6">
      {/* Name + color */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Name</label>
            <input
              data-testid="character-name"
              type="text"
              value={character.name}
              onChange={(e) => onRename(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1.5 text-sm text-gray-100 outline-none focus:border-blue-500 w-full max-w-xs"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1">Color</label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {PRESET_COLORS.map((c) => (
                <button
                  key={c}
                  onClick={() => onColorChange(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-transform ${
                    character.color === c
                      ? 'border-gray-200 scale-110'
                      : 'border-gray-700 hover:border-gray-500'
                  }`}
                  style={{ backgroundColor: c }}
                  title={c}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Delete */}
        <div>
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              className="text-xs text-red-400 hover:text-red-300 border border-red-900/50 hover:border-red-700 rounded px-2 py-1"
            >
              Delete
            </button>
          ) : (
            <div className="flex flex-col items-end gap-1">
              <span className="text-xs text-gray-400">Delete this character?</span>
              <div className="flex gap-1">
                <button
                  onClick={onDelete}
                  className="text-xs bg-red-900 hover:bg-red-800 text-red-200 rounded px-2 py-1"
                >
                  Yes
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-2 py-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Equipment slots */}
      <section>
        <h3 className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
          Equipment Slots
        </h3>
        <div className="space-y-1.5">
          {character.equipmentSlots.map((slot, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="text"
                value={slot}
                onChange={(e) => renameSlot(i, e.target.value)}
                className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 outline-none focus:border-blue-500 flex-1 max-w-xs"
              />
              <button
                onClick={() => removeSlot(i)}
                className="text-xs text-gray-500 hover:text-red-400"
                title="Remove slot"
              >
                &#x2715;
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newSlot}
              placeholder="Add slot (e.g., Amulet)"
              onChange={(e) => setNewSlot(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addSlot()
                }
              }}
              className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 outline-none focus:border-blue-500 flex-1 max-w-xs"
            />
            <button
              onClick={addSlot}
              className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded px-2 py-1"
            >
              Add Slot
            </button>
          </div>
        </div>
      </section>

      {/* Stats */}
      <section>
        <h3 className="text-xs font-medium text-gray-400 mb-2 uppercase tracking-wide">
          Stats
        </h3>
        <div className="space-y-2" data-testid="stat-list">
          {character.stats.map((stat, idx) => {
            const value = character.baseValues[stat.id]
            const isRenaming = renamingStatId === stat.id
            return (
              <div
                key={stat.id}
                data-testid={`stat-row-${stat.id}`}
                className="bg-gray-800 border border-gray-700 rounded px-3 py-2"
              >
                <div className="flex items-start justify-between gap-3 mb-2">
                  {isRenaming ? (
                    <input
                      autoFocus
                      type="text"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={() => {
                        const trimmed = renameDraft.trim()
                        if (trimmed && trimmed !== stat.name) onRenameStat(stat.id, trimmed)
                        setRenamingStatId(null)
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          const trimmed = renameDraft.trim()
                          if (trimmed && trimmed !== stat.name) onRenameStat(stat.id, trimmed)
                          setRenamingStatId(null)
                        } else if (e.key === 'Escape') {
                          setRenamingStatId(null)
                        }
                      }}
                      className="bg-gray-900 border border-blue-500 rounded px-1.5 py-0.5 text-sm text-gray-100 outline-none"
                    />
                  ) : (
                    <div className="flex flex-col min-w-0">
                      <span className="text-sm text-gray-200 font-medium truncate">
                        {stat.name}
                      </span>
                      <span className="text-[10px] text-gray-500 uppercase tracking-wide">
                        {stat.type}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => moveStat(stat.id, -1)}
                      disabled={idx === 0}
                      className="text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed px-1"
                      title="Move up"
                    >
                      &#9650;
                    </button>
                    <button
                      onClick={() => moveStat(stat.id, 1)}
                      disabled={idx === character.stats.length - 1}
                      className="text-xs text-gray-500 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed px-1"
                      title="Move down"
                    >
                      &#9660;
                    </button>
                    <button
                      onClick={() => {
                        setRenamingStatId(stat.id)
                        setRenameDraft(stat.name)
                      }}
                      className="text-xs text-gray-500 hover:text-gray-300 px-1"
                      title="Rename"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => onRemoveStat(stat.id)}
                      className="text-xs text-gray-500 hover:text-red-400 px-1"
                      title="Remove stat"
                    >
                      &#x2715;
                    </button>
                  </div>
                </div>
                {value && (
                  <StatFieldEditor
                    definition={stat}
                    value={value}
                    onChange={(next) => onBaseValueChange(stat.id, next)}
                  />
                )}
              </div>
            )
          })}
          {character.stats.length === 0 && (
            <p className="text-xs text-gray-600 italic">No stats defined.</p>
          )}
        </div>

        {/* Add custom stat */}
        <div className="mt-3">
          {!addingStat ? (
            <button
              data-testid="add-stat"
              onClick={() => setAddingStat(true)}
              className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded px-2 py-1"
            >
              + Add custom stat
            </button>
          ) : (
            <div className="bg-gray-800 border border-gray-700 rounded p-3 space-y-2">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  data-testid="new-stat-name"
                  type="text"
                  value={newStatName}
                  placeholder="Stat name"
                  autoFocus
                  onChange={(e) => setNewStatName(e.target.value)}
                  className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 outline-none focus:border-blue-500 flex-1"
                />
                <select
                  data-testid="new-stat-type"
                  value={newStatType}
                  onChange={(e) => setNewStatType(e.target.value as StatType)}
                  className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 outline-none focus:border-blue-500"
                >
                  <option value="number">number</option>
                  <option value="numberWithMax">numberWithMax</option>
                  <option value="list">list</option>
                  <option value="text">text</option>
                  <option value="attributeSet">attributeSet</option>
                  <option value="rank">rank</option>
                </select>
              </div>
              {newStatType === 'rank' && (
                <input
                  data-testid="new-stat-tiers"
                  type="text"
                  value={newStatTiers}
                  placeholder="Tiers (comma-separated, low→high)"
                  onChange={(e) => setNewStatTiers(e.target.value)}
                  className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 outline-none focus:border-blue-500 w-full"
                />
              )}
              {newStatType === 'attributeSet' && (
                <input
                  type="text"
                  value={newStatAttrs}
                  placeholder="Attribute keys (comma-separated)"
                  onChange={(e) => setNewStatAttrs(e.target.value)}
                  className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 outline-none focus:border-blue-500 w-full"
                />
              )}
              <div className="flex gap-2">
                <button
                  data-testid="confirm-new-stat"
                  onClick={commitNewStat}
                  className="text-xs bg-blue-600 hover:bg-blue-500 text-white rounded px-2 py-1"
                >
                  Add
                </button>
                <button
                  onClick={() => setAddingStat(false)}
                  className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded px-2 py-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

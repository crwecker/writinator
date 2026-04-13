import { useEffect, useMemo, useRef, useState } from 'react'
import type { EditorView } from '@codemirror/view'
import { useCharacterStore } from '../../stores/characterStore'
import { StatFieldEditor } from './StatFieldEditor'
import type {
  Character,
  StatDefinition,
  StatDelta,
  StatDeltaOp,
  StatModifier,
  StatValue,
} from '../../types'
import { STAT_MARKER_REGEX } from '../../lib/markerUtils'

type OpKind = StatDeltaOp['kind']

const OP_KINDS: OpKind[] = [
  'adjust',
  'maxAdjust',
  'set',
  'listAdd',
  'listRemove',
  'equip',
  'unequip',
  'buffApply',
  'buffRemove',
  'rankChange',
]

const OP_KIND_LABELS: Record<OpKind, string> = {
  adjust: 'adjust',
  maxAdjust: 'adjust max',
  set: 'set',
  listAdd: 'list add',
  listRemove: 'list remove',
  equip: 'equip',
  unequip: 'unequip',
  buffApply: 'apply buff',
  buffRemove: 'remove buff',
  rankChange: 'rank change',
}

interface Props {
  open: boolean
  onClose: () => void
  markerId: string | null
  mode: 'create' | 'edit'
  editorView: EditorView | null
}

const INPUT_CLS =
  'bg-gray-900 border border-gray-700 rounded px-2 py-1 text-sm text-gray-200 outline-none focus:border-blue-500'

function newDeltaId(): string {
  return crypto.randomUUID()
}

function defaultValueFor(def: StatDefinition): StatValue {
  switch (def.type) {
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
        values: Object.fromEntries((def.attributeKeys ?? []).map((k) => [k, 0])),
      }
    case 'rank': {
      const tiers = def.rankTiers ?? []
      return { kind: 'rank', tier: tiers[0] ?? '' }
    }
  }
}

function firstStatOfType(
  character: Character | undefined,
  types: StatDefinition['type'][]
): StatDefinition | undefined {
  return character?.stats.find((s) => types.includes(s.type))
}

function firstSlot(character: Character | undefined): string {
  return character?.equipmentSlots[0] ?? ''
}

function defaultOpFor(kind: OpKind, character: Character | undefined): StatDeltaOp {
  switch (kind) {
    case 'adjust': {
      const s = firstStatOfType(character, ['number', 'numberWithMax', 'attributeSet'])
      const attributeKey =
        s?.type === 'attributeSet' ? s.attributeKeys?.[0] : undefined
      return { kind: 'adjust', statId: s?.id ?? '', delta: 0, attributeKey }
    }
    case 'set': {
      const s = character?.stats[0]
      return {
        kind: 'set',
        statId: s?.id ?? '',
        value: s ? defaultValueFor(s) : { kind: 'number', value: 0 },
      }
    }
    case 'maxAdjust': {
      const s = firstStatOfType(character, ['numberWithMax'])
      return { kind: 'maxAdjust', statId: s?.id ?? '', delta: 0 }
    }
    case 'listAdd': {
      const s = firstStatOfType(character, ['list'])
      return { kind: 'listAdd', statId: s?.id ?? '', items: [] }
    }
    case 'listRemove': {
      const s = firstStatOfType(character, ['list'])
      return { kind: 'listRemove', statId: s?.id ?? '', items: [] }
    }
    case 'equip':
      return {
        kind: 'equip',
        slot: firstSlot(character),
        itemId: '',
        modifiers: [],
      }
    case 'unequip':
      return { kind: 'unequip', slot: firstSlot(character) }
    case 'buffApply':
      return { kind: 'buffApply', buffId: '', modifiers: [] }
    case 'buffRemove':
      return { kind: 'buffRemove', buffId: '' }
    case 'rankChange': {
      const s = firstStatOfType(character, ['rank'])
      return { kind: 'rankChange', statId: s?.id ?? '', direction: 'up' }
    }
  }
}

function numberOr(v: string, fallback: number): number {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}

export function DeltaEditorModal({
  open,
  onClose,
  markerId,
  mode,
  editorView,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null)
  const characters = useCharacterStore((s) => s.characters)
  const markers = useCharacterStore((s) => s.markers)
  const setMarker = useCharacterStore((s) => s.setMarker)
  const removeMarker = useCharacterStore((s) => s.removeMarker)

  const [drafts, setDrafts] = useState<StatDelta[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Initialize/reset drafts when opened.
  useEffect(() => {
    if (!open) return
    setConfirmDelete(false)
    const existing = markerId ? markers[markerId] : undefined
    if (existing && existing.length > 0) {
      setDrafts(
        existing.map((d) => {
          const op = d.op
          if (op.kind === 'adjust' && !op.attributeKey) {
            const char = characters.find((c) => c.id === d.characterId)
            const stat = char?.stats.find((s) => s.id === op.statId)
            if (stat?.type === 'attributeSet') {
              return {
                ...d,
                op: { ...op, attributeKey: stat.attributeKeys?.[0] },
              }
            }
          }
          return { ...d }
        }),
      )
    } else {
      const firstChar = characters[0]
      setDrafts([
        {
          id: newDeltaId(),
          characterId: firstChar?.id ?? '',
          op: defaultOpFor('adjust', firstChar),
          note: '',
        },
      ])
    }
    // Only recompute when opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, markerId])

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

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Defer registration by one tick so the same native event that opened the
    // modal doesn't immediately fire the outside-click handler.
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0)
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, onClose])

  const firstCharacterName = useMemo(() => {
    const ids = new Set(drafts.map((d) => d.characterId))
    const names = characters
      .filter((c) => ids.has(c.id))
      .map((c) => c.name)
    return names.join(', ')
  }, [drafts, characters])

  if (!open || !markerId) return null

  function updateDraft(idx: number, next: StatDelta) {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? next : d)))
  }

  function removeDraft(idx: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== idx))
  }

  function addDraft() {
    const firstChar = characters[0]
    setDrafts((prev) => [
      ...prev,
      {
        id: newDeltaId(),
        characterId: firstChar?.id ?? '',
        op: defaultOpFor('adjust', firstChar),
        note: '',
      },
    ])
  }

  function handleSave() {
    if (!markerId) return
    setMarker(markerId, drafts)
    onClose()
  }

  function handleDeleteMarker() {
    if (!markerId) return
    // Remove the <!-- stat:uuid --> comment from the current editor doc.
    if (editorView) {
      const doc = editorView.state.doc.toString()
      const re = new RegExp(STAT_MARKER_REGEX.source, 'g')
      let m: RegExpExecArray | null
      while ((m = re.exec(doc)) !== null) {
        if (m[1] === markerId) {
          editorView.dispatch({
            changes: { from: m.index, to: m.index + m[0].length, insert: '' },
          })
          break
        }
      }
    }
    removeMarker(markerId)
    onClose()
  }

  const shortId = markerId.slice(0, 8)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div
        ref={panelRef}
        data-testid="delta-editor-modal"
        className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[min(92vw,820px)] max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-gray-200">
              {mode === 'create' ? 'New Stat Change' : 'Edit Stat Change'}
            </span>
            <span className="text-[11px] text-gray-500 font-mono">
              {shortId}
              {firstCharacterName && (
                <span className="ml-2 text-gray-400 font-sans">
                  {firstCharacterName}
                </span>
              )}
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300 transition-colors text-xs"
          >
            Close
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-4">
          {drafts.map((draft, idx) => (
            <DeltaRow
              key={draft.id}
              draft={draft}
              characters={characters}
              onChange={(next) => updateDraft(idx, next)}
              onRemove={() => removeDraft(idx)}
              canRemove={drafts.length > 1}
            />
          ))}
          {drafts.length === 0 && (
            <p className="text-xs text-gray-600 italic">No deltas. Add one below.</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-gray-700 px-5 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <button
              data-testid="delta-add"
              onClick={addDraft}
              className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded px-2 py-1"
            >
              + Add delta
            </button>
            {mode === 'edit' && (
              confirmDelete ? (
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-400">Delete marker?</span>
                  <button
                    onClick={handleDeleteMarker}
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
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="text-xs text-red-400 hover:text-red-300 border border-red-900/50 hover:border-red-700 rounded px-2 py-1"
                >
                  Delete marker
                </button>
              )
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded px-2 py-1"
            >
              Cancel
            </button>
            <button
              data-testid="delta-save"
              onClick={handleSave}
              className="text-xs bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Delta row
// ---------------------------------------------------------------------------

interface DeltaRowProps {
  draft: StatDelta
  characters: Character[]
  onChange: (next: StatDelta) => void
  onRemove: () => void
  canRemove: boolean
}

function DeltaRow({ draft, characters, onChange, onRemove, canRemove }: DeltaRowProps) {
  const character = characters.find((c) => c.id === draft.characterId)

  function setCharacterId(id: string) {
    const nextChar = characters.find((c) => c.id === id)
    // Reset op defaults relative to new character to keep refs valid.
    onChange({
      ...draft,
      characterId: id,
      op: defaultOpFor(draft.op.kind, nextChar),
    })
  }

  function setOpKind(kind: OpKind) {
    onChange({ ...draft, op: defaultOpFor(kind, character) })
  }

  function setOp(op: StatDeltaOp) {
    onChange({ ...draft, op })
  }

  function setNote(note: string) {
    onChange({ ...draft, note })
  }

  return (
    <div
      data-testid="delta-row"
      className="bg-gray-800 border border-gray-700 rounded p-3 space-y-3"
    >
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Character</span>
          <select
            data-testid="delta-character"
            value={draft.characterId}
            onChange={(e) => setCharacterId(e.target.value)}
            className={INPUT_CLS}
          >
            {characters.length === 0 && <option value="">(none)</option>}
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Op</span>
          <select
            data-testid="delta-op-kind"
            value={draft.op.kind}
            onChange={(e) => setOpKind(e.target.value as OpKind)}
            className={INPUT_CLS}
          >
            {OP_KINDS.map((k) => (
              <option key={k} value={k}>
                {OP_KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
        {canRemove && (
          <button
            onClick={onRemove}
            className="ml-auto text-xs text-gray-500 hover:text-red-400"
            title="Remove delta"
          >
            &#x2715;
          </button>
        )}
      </div>

      <OpParams op={draft.op} character={character} onChange={setOp} />

      <div>
        <label className="block text-xs text-gray-400 mb-1">Note</label>
        <input
          type="text"
          value={draft.note ?? ''}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional context"
          className={`${INPUT_CLS} w-full`}
          data-testid="delta-note"
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Op parameter panel — discriminated-union narrowing
// ---------------------------------------------------------------------------

interface OpParamsProps {
  op: StatDeltaOp
  character: Character | undefined
  onChange: (op: StatDeltaOp) => void
}

function OpParams({ op, character, onChange }: OpParamsProps) {
  switch (op.kind) {
    case 'adjust':
      return (
        <AdjustParams
          op={op}
          character={character}
          statTypes={['number', 'numberWithMax', 'attributeSet']}
          onChange={onChange}
        />
      )
    case 'maxAdjust':
      return (
        <AdjustParams
          op={op}
          character={character}
          statTypes={['numberWithMax']}
          onChange={onChange}
        />
      )
    case 'set':
      return <SetParams op={op} character={character} onChange={onChange} />
    case 'listAdd':
    case 'listRemove':
      return <ListParams op={op} character={character} onChange={onChange} />
    case 'equip':
      return <EquipParams op={op} character={character} onChange={onChange} />
    case 'unequip':
      return <UnequipParams op={op} character={character} onChange={onChange} />
    case 'buffApply':
      return <BuffApplyParams op={op} character={character} onChange={onChange} />
    case 'buffRemove':
      return <BuffRemoveParams op={op} onChange={onChange} />
    case 'rankChange':
      return <RankChangeParams op={op} character={character} onChange={onChange} />
  }
}

// adjust + maxAdjust share the same UI signature.
function AdjustParams({
  op,
  character,
  statTypes,
  onChange,
}: {
  op: Extract<StatDeltaOp, { kind: 'adjust' | 'maxAdjust' }>
  character: Character | undefined
  statTypes: StatDefinition['type'][]
  onChange: (op: StatDeltaOp) => void
}) {
  const stats = (character?.stats ?? []).filter((s) => statTypes.includes(s.type))
  const currentStat = stats.find((s) => s.id === op.statId)
  const showAttrKey = op.kind === 'adjust' && currentStat?.type === 'attributeSet'
  const attrKeys = currentStat?.attributeKeys ?? []

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5">
        <span className="text-xs text-gray-400">Stat</span>
        <select
          data-testid="delta-stat"
          value={op.statId}
          onChange={(e) => {
            if (op.kind === 'adjust') {
              const nextStat = stats.find((s) => s.id === e.target.value)
              const nextAttrKey =
                nextStat?.type === 'attributeSet'
                  ? nextStat.attributeKeys?.[0]
                  : undefined
              onChange({ ...op, statId: e.target.value, attributeKey: nextAttrKey })
            } else {
              onChange({ ...op, statId: e.target.value })
            }
          }}
          className={INPUT_CLS}
        >
          {stats.length === 0 && <option value="">(none)</option>}
          {stats.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {showAttrKey && op.kind === 'adjust' && (
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Key</span>
          <select
            value={op.attributeKey ?? attrKeys[0] ?? ''}
            onChange={(e) => onChange({ ...op, attributeKey: e.target.value })}
            className={INPUT_CLS}
          >
            {attrKeys.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="flex items-center gap-1.5">
        <span className="text-xs text-gray-400">Delta</span>
        <input
          type="number"
          data-testid="delta-amount"
          value={op.delta}
          onChange={(e) => onChange({ ...op, delta: numberOr(e.target.value, 0) })}
          className={`${INPUT_CLS} w-24`}
        />
      </label>
    </div>
  )
}

function SetParams({
  op,
  character,
  onChange,
}: {
  op: Extract<StatDeltaOp, { kind: 'set' }>
  character: Character | undefined
  onChange: (op: StatDeltaOp) => void
}) {
  const stats = character?.stats ?? []
  const currentStat = stats.find((s) => s.id === op.statId)

  return (
    <div className="space-y-2">
      <label className="flex items-center gap-1.5">
        <span className="text-xs text-gray-400">Stat</span>
        <select
          value={op.statId}
          onChange={(e) => {
            const next = stats.find((s) => s.id === e.target.value)
            onChange({
              kind: 'set',
              statId: e.target.value,
              value: next ? defaultValueFor(next) : op.value,
            })
          }}
          className={INPUT_CLS}
        >
          {stats.length === 0 && <option value="">(none)</option>}
          {stats.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {currentStat && (
        <StatFieldEditor
          definition={currentStat}
          value={op.value}
          onChange={(v) => onChange({ ...op, value: v })}
        />
      )}
    </div>
  )
}

function ListParams({
  op,
  character,
  onChange,
}: {
  op: Extract<StatDeltaOp, { kind: 'listAdd' | 'listRemove' }>
  character: Character | undefined
  onChange: (op: StatDeltaOp) => void
}) {
  const stats = (character?.stats ?? []).filter((s) => s.type === 'list')
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <label className="flex items-center gap-1.5">
        <span className="text-xs text-gray-400">Stat</span>
        <select
          value={op.statId}
          onChange={(e) => onChange({ ...op, statId: e.target.value })}
          className={INPUT_CLS}
        >
          {stats.length === 0 && <option value="">(none)</option>}
          {stats.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <ListItemsInput op={op} onChange={onChange} />
    </div>
  )
}

function ListItemsInput({
  op,
  onChange,
}: {
  op: Extract<StatDeltaOp, { kind: 'listAdd' | 'listRemove' }>
  onChange: (op: StatDeltaOp) => void
}) {
  const [text, setText] = useState(() => op.items.join(', '))
  const opRef = useRef(op)
  opRef.current = op

  // Re-sync local text when external items change AND the user isn't mid-edit (change came from elsewhere)
  useEffect(() => {
    const parsed = text
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    const matches =
      parsed.length === op.items.length && parsed.every((s, i) => s === op.items[i])
    if (!matches) setText(op.items.join(', '))
    // intentionally only react to op.items — not `text`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [op.items.join('\u0000')])

  function commit(value: string) {
    const items = value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    onChange({ ...opRef.current, items })
  }

  return (
    <label className="flex items-center gap-1.5 flex-1">
      <span className="text-xs text-gray-400">Items</span>
      <input
        type="text"
        value={text}
        placeholder="comma, separated, items"
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        className={`${INPUT_CLS} flex-1`}
      />
    </label>
  )
}

function ModifierListEditor({
  character,
  modifiers,
  onChange,
}: {
  character: Character | undefined
  modifiers: StatModifier[]
  onChange: (mods: StatModifier[]) => void
}) {
  const stats = character?.stats ?? []

  function update(i: number, patch: Partial<StatModifier>) {
    onChange(modifiers.map((m, idx) => (idx === i ? { ...m, ...patch } : m)))
  }
  function add() {
    onChange([
      ...modifiers,
      { statId: stats[0]?.id ?? '', kind: 'flat', amount: 0 },
    ])
  }
  function remove(i: number) {
    onChange(modifiers.filter((_, idx) => idx !== i))
  }

  return (
    <div className="space-y-2">
      <span className="block text-xs text-gray-400">Modifiers</span>
      {modifiers.map((m, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <select
            value={m.statId}
            onChange={(e) => update(i, { statId: e.target.value })}
            className={INPUT_CLS}
          >
            {stats.length === 0 && <option value="">(none)</option>}
            {stats.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={m.kind}
            onChange={(e) =>
              update(i, { kind: e.target.value === 'maxFlat' ? 'maxFlat' : 'flat' })
            }
            className={INPUT_CLS}
          >
            <option value="flat">flat</option>
            <option value="maxFlat">maxFlat</option>
          </select>
          <input
            type="number"
            value={m.amount}
            onChange={(e) => update(i, { amount: numberOr(e.target.value, 0) })}
            className={`${INPUT_CLS} w-24`}
          />
          <button
            onClick={() => remove(i)}
            className="text-xs text-gray-500 hover:text-red-400"
          >
            &#x2715;
          </button>
        </div>
      ))}
      <button
        onClick={add}
        className="text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded px-2 py-1"
      >
        + Modifier
      </button>
    </div>
  )
}

function EquipParams({
  op,
  character,
  onChange,
}: {
  op: Extract<StatDeltaOp, { kind: 'equip' }>
  character: Character | undefined
  onChange: (op: StatDeltaOp) => void
}) {
  const slots = character?.equipmentSlots ?? []
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Slot</span>
          <select
            value={op.slot}
            onChange={(e) => onChange({ ...op, slot: e.target.value })}
            className={INPUT_CLS}
          >
            {slots.length === 0 && <option value="">(none)</option>}
            {slots.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Item</span>
          <input
            type="text"
            value={op.itemId}
            onChange={(e) => onChange({ ...op, itemId: e.target.value })}
            placeholder="item id"
            className={INPUT_CLS}
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Name</span>
          <input
            type="text"
            value={op.itemName ?? ''}
            onChange={(e) => onChange({ ...op, itemName: e.target.value })}
            placeholder="display name"
            className={INPUT_CLS}
          />
        </label>
      </div>
      <ModifierListEditor
        character={character}
        modifiers={op.modifiers}
        onChange={(mods) => onChange({ ...op, modifiers: mods })}
      />
    </div>
  )
}

function UnequipParams({
  op,
  character,
  onChange,
}: {
  op: Extract<StatDeltaOp, { kind: 'unequip' }>
  character: Character | undefined
  onChange: (op: StatDeltaOp) => void
}) {
  const slots = character?.equipmentSlots ?? []
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-xs text-gray-400">Slot</span>
      <select
        value={op.slot}
        onChange={(e) => onChange({ ...op, slot: e.target.value })}
        className={INPUT_CLS}
      >
        {slots.length === 0 && <option value="">(none)</option>}
        {slots.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  )
}

function BuffApplyParams({
  op,
  character,
  onChange,
}: {
  op: Extract<StatDeltaOp, { kind: 'buffApply' }>
  character: Character | undefined
  onChange: (op: StatDeltaOp) => void
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Buff id</span>
          <input
            type="text"
            value={op.buffId}
            onChange={(e) => onChange({ ...op, buffId: e.target.value })}
            className={INPUT_CLS}
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Name</span>
          <input
            type="text"
            value={op.buffName ?? ''}
            onChange={(e) => onChange({ ...op, buffName: e.target.value })}
            className={INPUT_CLS}
          />
        </label>
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Expires after</span>
          <input
            type="number"
            value={op.expiresAfter ?? ''}
            onChange={(e) => {
              const v = e.target.value
              if (v === '') onChange({ ...op, expiresAfter: undefined })
              else onChange({ ...op, expiresAfter: numberOr(v, 0) })
            }}
            className={`${INPUT_CLS} w-24`}
            placeholder="persistent"
          />
        </label>
      </div>
      <ModifierListEditor
        character={character}
        modifiers={op.modifiers}
        onChange={(mods) => onChange({ ...op, modifiers: mods })}
      />
    </div>
  )
}

function BuffRemoveParams({
  op,
  onChange,
}: {
  op: Extract<StatDeltaOp, { kind: 'buffRemove' }>
  onChange: (op: StatDeltaOp) => void
}) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-xs text-gray-400">Buff id</span>
      <input
        type="text"
        value={op.buffId}
        onChange={(e) => onChange({ ...op, buffId: e.target.value })}
        className={INPUT_CLS}
      />
    </label>
  )
}

function RankChangeParams({
  op,
  character,
  onChange,
}: {
  op: Extract<StatDeltaOp, { kind: 'rankChange' }>
  character: Character | undefined
  onChange: (op: StatDeltaOp) => void
}) {
  const rankStats = (character?.stats ?? []).filter((s) => s.type === 'rank')
  const currentStat = rankStats.find((s) => s.id === op.statId)
  const tiers = currentStat?.rankTiers ?? []
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5">
        <span className="text-xs text-gray-400">Stat</span>
        <select
          value={op.statId}
          onChange={(e) => onChange({ ...op, statId: e.target.value })}
          className={INPUT_CLS}
        >
          {rankStats.length === 0 && <option value="">(none)</option>}
          {rankStats.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5">
        <span className="text-xs text-gray-400">Direction</span>
        <select
          value={op.direction}
          onChange={(e) => {
            const dir = e.target.value as 'up' | 'down' | 'set'
            if (dir === 'set') {
              onChange({ ...op, direction: dir, value: tiers[0] ?? '' })
            } else {
              onChange({ ...op, direction: dir, value: undefined })
            }
          }}
          className={INPUT_CLS}
        >
          <option value="up">up</option>
          <option value="down">down</option>
          <option value="set">set</option>
        </select>
      </label>
      {op.direction === 'set' && (
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-gray-400">Tier</span>
          <select
            value={op.value ?? ''}
            onChange={(e) => onChange({ ...op, value: e.target.value })}
            className={INPUT_CLS}
          >
            {tiers.length === 0 && <option value="">(none)</option>}
            {tiers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  )
}

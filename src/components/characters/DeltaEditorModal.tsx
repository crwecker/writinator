import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { EditorView } from '@codemirror/view'
import { useCharacterStore } from '../../stores/characterStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { StatFieldEditor } from './StatFieldEditor'
import type {
  Character,
  StatDelta,
  StatDeltaOp,
  StatModifier,
} from '../../types'
import { STAT_MARKER_REGEX } from '../../lib/markerUtils'
import { LIST_STAT_FIELDS } from '../../lib/listStatFields'
import { findDocStatMarkers } from '../../lib/insertStatDelta'
import { previewDeltas, type OpPreview } from '../../lib/statPreview'
import {
  VERB_LABELS,
  amountForVerb,
  opForVerb,
  signedForVerb,
  targetForOp,
  targetKey,
  verbForOp,
  verbsForTarget,
  type DeltaTarget,
  type DeltaVerb,
} from '../../lib/deltaVerbs'
import { liveBookFor, stateLookupAt } from './statEntryContext'
import { CatalogItemOptions } from './CatalogItemOptions'
import { useItemCatalogStore } from '../../stores/itemCatalogStore'
import { equipFromCatalog } from '../../lib/itemCatalog'

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

/** Targets a row can point at, in menu order: the character's stats, then equipment and buffs. */
function targetsFor(character: Character | undefined): DeltaTarget[] {
  return [
    ...(character?.stats ?? []).map((s): DeltaTarget => ({ kind: 'stat', statId: s.id })),
    { kind: 'equipment' },
    { kind: 'buffs' },
  ]
}

function targetLabel(t: DeltaTarget, character: Character | undefined): string {
  if (t.kind === 'equipment') return 'Equipment'
  if (t.kind === 'buffs') return 'Buffs'
  return character?.stats.find((s) => s.id === t.statId)?.name ?? `(missing: ${t.statId})`
}

/** A fresh row: the character's first stat with its first verb. */
function newDraftOp(character: Character | undefined): StatDeltaOp {
  const target = targetsFor(character)[0]
  const verb = verbsForTarget(target, character)[0] ?? 'applyBuff'
  return opForVerb(verb, target, character)
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

  const book = useStoryletStore((s) => s.book)
  const storyletId = useStoryletStore((s) => s.activeStoryletId)
  const [drafts, setDrafts] = useState<StatDelta[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{
    startX: number
    startY: number
    baseX: number
    baseY: number
  } | null>(null)

  // Initialize/reset drafts when opened.
  useEffect(() => {
    if (!open) return
    setConfirmDelete(false)
    setDragOffset({ x: 0, y: 0 })
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
          op: newDraftOp(firstChar),
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

  const firstCharacterName = useMemo(() => {
    const ids = new Set(drafts.map((d) => d.characterId))
    const names = characters
      .filter((c) => ids.has(c.id))
      .map((c) => c.name)
    return names.join(', ')
  }, [drafts, characters])

  // Each character's state just before this marker, then each row applied in order.
  const previews = useMemo(() => {
    const text = editorView?.state.doc.toString() ?? ''
    const at = markerId ? findDocStatMarkers(text).find((m) => m.id === markerId) : undefined
    const offset = at?.from ?? editorView?.state.selection.main.head ?? 0
    const stateBefore = stateLookupAt({
      book: liveBookFor(editorView, book, storyletId),
      storyletId,
      characters,
      markers,
      offset,
    })
    return previewDeltas(drafts, characters, stateBefore)
  }, [drafts, characters, markers, book, storyletId, editorView, markerId])

  if (!open || !markerId) return null

  function updateDraft(idx: number, next: StatDelta) {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? next : d)))
  }

  function removeDraft(idx: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== idx))
  }

  function moveDraft(idx: number, dir: -1 | 1) {
    setDrafts((prev) => {
      const next = idx + dir
      if (next < 0 || next >= prev.length) return prev
      const copy = [...prev]
      ;[copy[idx], copy[next]] = [copy[next], copy[idx]]
      return copy
    })
  }

  // Drag the dialog by its header so it can be moved off content being referenced.
  function startDrag(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: dragOffset.x,
      baseY: dragOffset.y,
    }
    function onMove(ev: globalThis.MouseEvent) {
      const d = dragRef.current
      if (!d) return
      setDragOffset({
        x: d.baseX + (ev.clientX - d.startX),
        y: d.baseY + (ev.clientY - d.startY),
      })
    }
    function onUp() {
      dragRef.current = null
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function addDraft() {
    const firstChar = characters[0]
    setDrafts((prev) => [
      ...prev,
      {
        id: newDeltaId(),
        characterId: firstChar?.id ?? '',
        op: newDraftOp(firstChar),
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
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
      <div
        ref={panelRef}
        data-testid="delta-editor-modal"
        style={{ transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)` }}
        className="pointer-events-auto bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-[min(92vw,820px)] max-h-[90vh] flex flex-col"
      >
        <div
          onMouseDown={startDrag}
          className="flex items-center justify-between px-5 py-3 border-b border-gray-700 shrink-0 cursor-move select-none"
        >
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
              idx={idx}
              characters={characters}
              preview={previews[idx]}
              onChange={(next) => updateDraft(idx, next)}
              onRemove={() => removeDraft(idx)}
              canRemove={drafts.length > 1}
              onMoveUp={() => moveDraft(idx, -1)}
              onMoveDown={() => moveDraft(idx, 1)}
              canMoveUp={idx > 0}
              canMoveDown={idx < drafts.length - 1}
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
// Delta row: Character → Stat → Verb → details, with a before → after line
// ---------------------------------------------------------------------------

interface DeltaRowProps {
  draft: StatDelta
  idx: number
  characters: Character[]
  preview: OpPreview | null
  onChange: (next: StatDelta) => void
  onRemove: () => void
  canRemove: boolean
  onMoveUp: () => void
  onMoveDown: () => void
  canMoveUp: boolean
  canMoveDown: boolean
}

function DeltaRow({
  draft,
  idx,
  characters,
  preview,
  onChange,
  onRemove,
  canRemove,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: DeltaRowProps) {
  const character = characters.find((c) => c.id === draft.characterId)
  const target = targetForOp(draft.op)
  // The verb is UI state: "Damage 0" and "Heal 0" are the same op.
  const [verb, setVerbState] = useState<DeltaVerb>(() => verbForOp(draft.op, character))
  const offered = verbsForTarget(target, character)
  const verbs = offered.includes(verb) ? offered : [verb, ...offered]
  const targets = targetsFor(character)
  if (!targets.some((t) => targetKey(t) === targetKey(target))) targets.unshift(target)

  function setCharacterId(id: string) {
    const nextChar = characters.find((c) => c.id === id)
    const keep = targetsFor(nextChar).find((t) => targetKey(t) === targetKey(target))
    const nextTarget = keep ?? targetsFor(nextChar)[0]
    const nextVerbs = verbsForTarget(nextTarget, nextChar)
    const nextVerb = nextVerbs.includes(verb) ? verb : nextVerbs[0] ?? verb
    setVerbState(nextVerb)
    onChange({ ...draft, characterId: id, op: opForVerb(nextVerb, nextTarget, nextChar, draft.op) })
  }

  function setTarget(key: string) {
    const next = targetsFor(character).find((t) => targetKey(t) === key)
    if (!next) return
    const nextVerbs = verbsForTarget(next, character)
    const nextVerb = nextVerbs.includes(verb) ? verb : nextVerbs[0] ?? verb
    setVerbState(nextVerb)
    onChange({ ...draft, op: opForVerb(nextVerb, next, character, draft.op) })
  }

  function setVerb(v: DeltaVerb) {
    setVerbState(v)
    onChange({ ...draft, op: opForVerb(v, target, character, draft.op) })
  }

  return (
    <div data-testid="delta-row" className="bg-gray-800 border border-gray-700 rounded p-3 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select
          data-testid="delta-character"
          aria-label="Character"
          value={draft.characterId}
          onChange={(e) => setCharacterId(e.target.value)}
          className={INPUT_CLS}
          style={character ? { color: character.color } : undefined}
        >
          {characters.length === 0 && <option value="">(none)</option>}
          {characters.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select
          data-testid="delta-target"
          aria-label="Stat"
          value={targetKey(target)}
          onChange={(e) => setTarget(e.target.value)}
          className={INPUT_CLS}
        >
          {targets.map((t) => (
            <option key={targetKey(t)} value={targetKey(t)}>
              {targetLabel(t, character)}
            </option>
          ))}
        </select>
        <select
          data-testid="delta-verb"
          aria-label="Change"
          value={verb}
          onChange={(e) => setVerb(e.target.value as DeltaVerb)}
          className={INPUT_CLS}
        >
          {verbs.map((v) => (
            <option key={v} value={v}>
              {VERB_LABELS[v]}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1">
          <button
            data-testid={`delta-move-up-${idx}`}
            onClick={onMoveUp}
            disabled={!canMoveUp}
            className="text-xs text-gray-500 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed px-1"
            title="Move up"
          >
            &#x25B2;
          </button>
          <button
            data-testid={`delta-move-down-${idx}`}
            onClick={onMoveDown}
            disabled={!canMoveDown}
            className="text-xs text-gray-500 hover:text-gray-200 disabled:opacity-30 disabled:cursor-not-allowed px-1"
            title="Move down"
          >
            &#x25BC;
          </button>
          {canRemove && (
            <button onClick={onRemove} className="text-xs text-gray-500 hover:text-red-400 px-1" title="Remove">
              &#x2715;
            </button>
          )}
        </div>
      </div>

      <VerbParams verb={verb} op={draft.op} character={character} onChange={(op) => onChange({ ...draft, op })} />

      {preview && (
        <div data-testid="delta-preview" className="text-xs text-gray-400 tabular-nums">
          {preview.text}
          {preview.warning && <span className="ml-2 text-amber-300/90">⚠ {preview.warning}</span>}
        </div>
      )}

      <input
        type="text"
        value={draft.note ?? ''}
        onChange={(e) => onChange({ ...draft, note: e.target.value })}
        placeholder="Note (optional)"
        className={`${INPUT_CLS} w-full`}
        data-testid="delta-note"
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Details per verb — discriminated-union narrowing on the op
// ---------------------------------------------------------------------------

interface VerbParamsProps {
  verb: DeltaVerb
  op: StatDeltaOp
  character: Character | undefined
  onChange: (op: StatDeltaOp) => void
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-1.5">
      <span className="text-xs text-gray-400">{label}</span>
      {children}
    </label>
  )
}

function VerbParams({ verb, op, character, onChange }: VerbParamsProps) {
  switch (op.kind) {
    case 'adjust':
    case 'maxAdjust': {
      const def = character?.stats.find((s) => s.id === op.statId)
      const keys = def?.type === 'attributeSet' ? def.attributeKeys ?? [] : []
      return (
        <div className="flex flex-wrap items-center gap-2">
          {op.kind === 'adjust' && keys.length > 0 && (
            <Field label="Attribute">
              <select
                value={op.attributeKey ?? keys[0]}
                onChange={(e) => onChange({ ...op, attributeKey: e.target.value })}
                className={INPUT_CLS}
              >
                {keys.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label={verb === 'change' ? 'By (±)' : 'Amount'}>
            <input
              type="number"
              data-testid="delta-amount"
              min={verb === 'change' ? undefined : 0}
              value={amountForVerb(verb, op.delta)}
              onChange={(e) => onChange({ ...op, delta: signedForVerb(verb, numberOr(e.target.value, 0)) })}
              className={`${INPUT_CLS} w-24`}
            />
          </Field>
        </div>
      )
    }
    case 'set': {
      const def = character?.stats.find((s) => s.id === op.statId)
      if (!def) return null
      return <StatFieldEditor definition={def} value={op.value} onChange={(v) => onChange({ ...op, value: v })} />
    }
    case 'fill':
      return <p className="text-xs text-gray-500">Back to full.</p>
    case 'listAdd':
    case 'listRemove':
      return <ListItemsInput op={op} onChange={onChange} />
    case 'itemAdd':
    case 'itemRemove':
    case 'itemFieldAdjust': {
      const def = character?.stats.find((s) => s.id === op.statId)
      const kind = def && (def.type === 'inventory' || def.type === 'spellList' || def.type === 'skillList') ? def.type : null
      const noun = kind === 'spellList' ? 'Spell' : kind === 'skillList' ? 'Skill' : 'Item'
      return (
        <div className="flex flex-wrap items-center gap-2">
          <Field label={noun}>
            <input
              type="text"
              value={op.name}
              list={kind === 'inventory' ? 'delta-catalog-items' : undefined}
              onChange={(e) => onChange({ ...op, name: e.target.value })}
              placeholder={`${noun.toLowerCase()} name`}
              className={INPUT_CLS}
            />
            {kind === 'inventory' && <CatalogItemOptions id="delta-catalog-items" />}
          </Field>
          {op.kind === 'itemAdd' && kind === 'inventory' && (
            <Field label="Qty">
              <input
                type="number"
                min={1}
                value={op.fields.qty ?? 1}
                onChange={(e) => onChange({ ...op, fields: { ...op.fields, qty: numberOr(e.target.value, 1) } })}
                className={`${INPUT_CLS} w-20`}
              />
            </Field>
          )}
          {op.kind === 'itemFieldAdjust' && kind && verb !== 'changeQty' && (
            <Field label="Field">
              <select value={op.field} onChange={(e) => onChange({ ...op, field: e.target.value })} className={INPUT_CLS}>
                {LIST_STAT_FIELDS[kind].map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {op.kind === 'itemFieldAdjust' && (
            <Field label="By (±)">
              <input
                type="number"
                data-testid="delta-amount"
                value={op.delta}
                onChange={(e) => onChange({ ...op, delta: numberOr(e.target.value, 0) })}
                className={`${INPUT_CLS} w-24`}
              />
            </Field>
          )}
        </div>
      )
    }
    case 'rankChange': {
      if (op.direction !== 'set') return null
      const tiers = character?.stats.find((s) => s.id === op.statId)?.rankTiers ?? []
      return (
        <Field label="Tier">
          <select value={op.value ?? ''} onChange={(e) => onChange({ ...op, value: e.target.value })} className={INPUT_CLS}>
            {tiers.length === 0 && <option value="">(none)</option>}
            {tiers.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      )
    }
    case 'equip':
      return <EquipParams op={op} character={character} onChange={onChange} />
    case 'unequip':
      return <UnequipParams op={op} character={character} onChange={onChange} />
    case 'buffApply':
      return <BuffApplyParams op={op} character={character} onChange={onChange} />
    case 'buffRemove':
      return <BuffRemoveParams op={op} onChange={onChange} />
  }
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
      <CatalogItemOptions id="delta-catalog-equip-items" />
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
            list="delta-catalog-equip-items"
            // A catalog item brings its slot and stat bonuses along.
            onChange={(e) =>
              onChange(equipFromCatalog(op, e.target.value, character, useItemCatalogStore.getState().items))
            }
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


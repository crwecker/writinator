import type {
  Character,
  CharacterState,
  StatDefinition,
  StatDelta,
  StatDeltaOp,
  StatValue,
} from '../types'
import { applyDeltaOpWithDefs, computeEffective, parseQty } from './characterState'
import { LIST_STAT_FIELDS } from './listStatFields'
import { PANEL_VALUE_FORMAT, formatStatValue } from './statFormat'

/** One before → after row describing what an op does to a character. */
export interface OpPreview {
  characterId: string
  characterName: string
  /** e.g. "HP 40 → 25", "+Wolf Pelt ×1", "Weapon: — → Iron Sword". */
  text: string
  warning?: string
  /** The op adds an item the character didn't have (helps spot typos). */
  isNew?: boolean
}

const MINUS = '−'

type ListItemsValue = Extract<StatValue, { kind: 'inventory' | 'spellList' | 'skillList' }>

function isItemList(v: StatValue | undefined): v is ListItemsValue {
  return !!v && (v.kind === 'inventory' || v.kind === 'spellList' || v.kind === 'skillList')
}

function findItem(v: StatValue | undefined, name: string) {
  if (!isItemList(v)) return undefined
  const key = name.toLowerCase()
  return v.items.find((it) => it.name.toLowerCase() === key)
}

function plainListQty(v: StatValue | undefined, name: string): number {
  if (!v || v.kind !== 'list') return 0
  const key = name.toLowerCase()
  for (const raw of v.items) {
    const p = parseQty(raw)
    if (p.name.toLowerCase() === key) return p.qty
  }
  return 0
}

/** Value text for one stat in a preview: numberWithMax reads as its value unless the max moved. */
function scalar(v: StatValue | undefined, showMax: boolean): string {
  if (!v) return '—'
  if (v.kind === 'numberWithMax') return showMax ? `${v.value}/${v.max}` : String(v.value)
  return formatStatValue(v, PANEL_VALUE_FORMAT)
}

function boundsWarning(def: StatDefinition | undefined, v: StatValue | undefined): string | undefined {
  if (!def || !v || v.kind !== 'numberWithMax') return undefined
  if (v.value < 0) return `${def.name} below 0`
  if (v.value > v.max) return `${def.name} above max (${v.max})`
  return undefined
}

/**
 * Describe what `op` does to `character` starting from `before`, and return
 * the state after it. Values are effective (base + equipment + buffs), the
 * way the character panel shows them. Buff counters don't tick here: a
 * preview covers the ops of one marker.
 */
export function previewOp(
  character: Character,
  before: CharacterState,
  op: StatDeltaOp,
): { row: OpPreview; after: CharacterState } {
  const after = applyDeltaOpWithDefs(before, op, character.stats)
  const effB = computeEffective(before, character.stats)
  const effA = computeEffective(after, character.stats)
  const defOf = (id: string) => character.stats.find((s) => s.id === id)
  const nameOf = (id: string) => defOf(id)?.name ?? id
  const row: OpPreview = { characterId: character.id, characterName: character.name, text: '' }
  const who = character.name

  switch (op.kind) {
    case 'adjust': {
      const b = effB[op.statId]
      const a = effA[op.statId]
      if (op.attributeKey && b?.kind === 'attributeSet' && a?.kind === 'attributeSet') {
        row.text = `${op.attributeKey} ${b.values[op.attributeKey] ?? 0} → ${a.values[op.attributeKey] ?? 0}`
      } else {
        row.text = `${nameOf(op.statId)} ${scalar(b, false)} → ${scalar(a, false)}`
        row.warning = boundsWarning(defOf(op.statId), a)
      }
      break
    }
    case 'set': {
      const b = effB[op.statId]
      const a = effA[op.statId]
      if (b?.kind === 'attributeSet' && a?.kind === 'attributeSet') {
        const changed = Object.keys(a.values).filter((k) => a.values[k] !== b.values[k])
        row.text =
          changed.length > 0
            ? changed.map((k) => `${k} ${b.values[k] ?? 0} → ${a.values[k]}`).join(', ')
            : `${nameOf(op.statId)} unchanged`
      } else {
        const showMax = b?.kind === 'numberWithMax' && a?.kind === 'numberWithMax' && b.max !== a.max
        row.text = `${nameOf(op.statId)} ${scalar(b, showMax)} → ${scalar(a, showMax)}`
        row.warning = boundsWarning(defOf(op.statId), a)
      }
      break
    }
    case 'maxAdjust': {
      const b = effB[op.statId]
      const a = effA[op.statId]
      const bm = b?.kind === 'numberWithMax' ? b.max : '—'
      const am = a?.kind === 'numberWithMax' ? a.max : '—'
      row.text = `${nameOf(op.statId)} max ${bm} → ${am}`
      row.warning = boundsWarning(defOf(op.statId), a)
      break
    }
    case 'fill':
      row.text = `${nameOf(op.statId)} ${scalar(effB[op.statId], false)} → ${scalar(effA[op.statId], false)}`
      break
    case 'rankChange': {
      const b = effB[op.statId]
      const a = effA[op.statId]
      const bt = b?.kind === 'rank' ? b.tier : '—'
      const at = a?.kind === 'rank' ? a.tier : '—'
      row.text = `${nameOf(op.statId)} ${bt} → ${at}`
      if (bt === at && op.direction !== 'set') {
        row.warning = op.direction === 'up' ? 'Already at the top tier' : 'Already at the bottom tier'
      }
      break
    }
    case 'itemAdd': {
      const v = before.base[op.statId]
      const existing = findItem(v, op.name)
      if (existing) {
        row.text = `+${op.name}`
        row.warning = v?.kind === 'inventory' ? `${who} already has ${existing.name}` : `${who} already knows ${existing.name}`
      } else if (v?.kind === 'inventory') {
        row.text = `+${op.name} ×${op.fields.qty ?? 1}`
        row.isNew = true
      } else {
        row.text = `+${op.name} (${nameOf(op.statId)})`
        row.isNew = true
      }
      break
    }
    case 'itemRemove': {
      const existing = findItem(before.base[op.statId], op.name)
      row.text = `${MINUS}${existing?.name ?? op.name}`
      if (!existing) row.warning = `${who} doesn’t have ${op.name}`
      break
    }
    case 'itemFieldAdjust': {
      const b = findItem(before.base[op.statId], op.name)
      const a = findItem(after.base[op.statId], op.name)
      if (!b) {
        row.text = `${op.name} ${op.field} ${op.delta >= 0 ? '+' : MINUS}${Math.abs(op.delta)}`
        row.warning = `${who} doesn’t have ${op.name}`
      } else if (op.field === 'qty') {
        row.text = `${b.name} ×${b.fields.qty ?? 1} → ×${a?.fields.qty ?? 0}`
      } else {
        const v = before.base[op.statId]
        const label = isItemList(v)
          ? LIST_STAT_FIELDS[v.kind].find((f) => f.key === op.field)?.label ?? op.field
          : op.field
        row.text = `${b.name} ${label} ${b.fields[op.field] ?? 0} → ${a?.fields[op.field] ?? 0}`
      }
      break
    }
    case 'listAdd': {
      const v = before.base[op.statId]
      row.text = `+${op.items.join(', ')}`
      row.isNew = op.items.some((raw) => plainListQty(v, parseQty(raw).name) === 0)
      break
    }
    case 'listRemove': {
      const v = before.base[op.statId]
      row.text = `${MINUS}${op.items.join(', ')}`
      const missing = op.items.map((raw) => parseQty(raw).name).filter((n) => plainListQty(v, n) === 0)
      if (missing.length > 0) row.warning = `${who} doesn’t have ${missing.join(', ')}`
      break
    }
    case 'equip': {
      const cur = before.equipped[op.slot]
      row.text = `${op.slot}: ${cur ? cur.itemName ?? cur.itemId : '—'} → ${op.itemName ?? op.itemId}`
      if (!character.equipmentSlots.includes(op.slot)) row.warning = `${who} has no ${op.slot} slot`
      break
    }
    case 'unequip': {
      const cur = before.equipped[op.slot]
      row.text = `${op.slot}: ${cur ? cur.itemName ?? cur.itemId : '—'} → —`
      if (!cur) row.warning = `${op.slot} is already empty`
      break
    }
    case 'buffApply':
      row.text = `+${op.buffName ?? op.buffId}${op.expiresAfter ? ` (${op.expiresAfter} markers)` : ''}`
      break
    case 'buffRemove': {
      const cur = before.activeBuffs.find((b) => b.buffId === op.buffId)
      row.text = `${MINUS}${cur?.buffName ?? op.buffId}`
      if (!cur) row.warning = `${op.buffId} isn’t active`
      break
    }
  }

  return { row, after }
}

/**
 * Before → after rows for a marker's deltas, applied in order on top of
 * `stateFor` (each character's state just before the marker). Null for a
 * delta whose character no longer exists.
 */
export function previewDeltas(
  deltas: StatDelta[],
  characters: Character[],
  stateFor: (characterId: string) => CharacterState | undefined,
): Array<OpPreview | null> {
  const working = new Map<string, CharacterState>()
  return deltas.map((d) => {
    const character = characters.find((c) => c.id === d.characterId)
    if (!character) return null
    const before = working.get(character.id) ?? stateFor(character.id)
    if (!before) return null
    const { row, after } = previewOp(character, before, d.op)
    working.set(character.id, after)
    return row
  })
}

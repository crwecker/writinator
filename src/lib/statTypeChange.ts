import type {
  Book,
  Character,
  CharacterState,
  StatDefinition,
  StatDelta,
  StatDeltaOp,
  StatType,
  StatValue,
} from '../types'
import { DEFAULT_RANK_TIERS } from '../stores/characterStore'
import { applyDeltaOp, formatQty, getStoryletTreeOrder, parseQty } from './characterState'
import { coerceStatValue } from './coerceStatValue'
import { extractMarkers } from './markerUtils'
import { defaultItemFields } from './listStatFields'
import { migrateStatDeltaOp } from './migrateStatDeltaOp'

export interface StatTypeChangePlan {
  defPatch: Partial<Omit<StatDefinition, 'id'>>
  baseValue: StatValue
  /** Only the markers whose deltas changed. */
  markers: Record<string, StatDelta[]>
}

export type StatTypeChangeCharacter = Pick<Character, 'id' | 'stats' | 'baseValues'>

type ItemListType = 'inventory' | 'spellList' | 'skillList'
const ITEM_LIST_TYPES: readonly StatType[] = ['inventory', 'spellList', 'skillList']
const isItemList = (t: StatType): t is ItemListType => ITEM_LIST_TYPES.includes(t)

/** Current quantity of `name` in a list-like value, 0 when absent. */
function quantityOf(value: StatValue | undefined, name: string): number {
  if (!value) return 0
  const key = name.toLowerCase()
  if (value.kind === 'list') {
    const hit = value.items.map(parseQty).find((it) => it.name.toLowerCase() === key)
    return hit ? hit.qty : 0
  }
  if (value.kind === 'inventory' || value.kind === 'spellList' || value.kind === 'skillList') {
    const hit = value.items.find((it) => it.name.toLowerCase() === key)
    return hit ? (hit.fields.qty ?? 1) : 0
  }
  return 0
}

/**
 * Rewrite one list ↔ item-list op so that, applied to the converted value, it
 * has the same effect it had on the old value. Plain lists and counted lists
 * behave differently for repeats (a list adds quantities; `itemAdd` ignores an
 * item that's already there), so this needs the value just before the op.
 */
function migrateListOp(op: StatDeltaOp, before: StatValue | undefined, newType: StatType): StatDeltaOp[] {
  if (op.kind === 'listAdd' && isItemList(newType)) {
    // Track quantities within this op too, in case it names an item twice.
    const added = new Map<string, number>()
    return op.items.flatMap((raw): StatDeltaOp[] => {
      const { name, qty } = parseQty(raw)
      const key = name.toLowerCase()
      const have = (added.get(key) ?? 0) + quantityOf(before, name)
      added.set(key, (added.get(key) ?? 0) + qty)
      if (have === 0) {
        const fields = newType === 'inventory' ? { qty } : defaultItemFields(newType)
        return [{ kind: 'itemAdd', statId: op.statId, name, fields }]
      }
      return newType === 'inventory'
        ? [{ kind: 'itemFieldAdjust', statId: op.statId, name, field: 'qty', delta: qty }]
        : []
    })
  }
  if (op.kind === 'listRemove' && isItemList(newType)) {
    return op.items.flatMap((raw): StatDeltaOp[] => {
      const { name, qty } = parseQty(raw)
      const have = quantityOf(before, name)
      if (have === 0) return []
      if (qty >= have) return [{ kind: 'itemRemove', statId: op.statId, name }]
      return newType === 'inventory'
        ? [{ kind: 'itemFieldAdjust', statId: op.statId, name, field: 'qty', delta: -qty }]
        : []
    })
  }
  if (newType === 'list') {
    if (op.kind === 'itemAdd') {
      if (quantityOf(before, op.name) > 0) return []
      return [{ kind: 'listAdd', statId: op.statId, items: [formatQty(op.name, op.fields.qty ?? 1)] }]
    }
    if (op.kind === 'itemRemove') {
      const have = quantityOf(before, op.name)
      return have > 0 ? [{ kind: 'listRemove', statId: op.statId, items: [formatQty(op.name, have)] }] : []
    }
    if (op.kind === 'itemFieldAdjust') {
      if (op.field !== 'qty' || op.delta === 0 || quantityOf(before, op.name) === 0) return []
      const items = [formatQty(op.name, Math.abs(op.delta))]
      return [op.delta > 0 ? { kind: 'listAdd', statId: op.statId, items } : { kind: 'listRemove', statId: op.statId, items }]
    }
  }
  return []
}

function rebuildDeltas(
  deltas: StatDelta[],
  matches: (delta: StatDelta) => boolean,
  migrate: (op: StatDeltaOp) => StatDeltaOp[],
): StatDelta[] | null {
  let changed = false
  const next: StatDelta[] = []
  for (const delta of deltas) {
    if (!matches(delta)) {
      next.push(delta)
      continue
    }
    const migrated = migrate(delta.op)
    if (migrated.length === 1 && migrated[0] === delta.op) {
      next.push(delta)
      continue
    }
    changed = true
    if (migrated.length === 1) {
      next.push({ ...delta, op: migrated[0] })
    } else {
      for (const op of migrated) {
        next.push({
          id: crypto.randomUUID(),
          characterId: delta.characterId,
          op,
          ...(delta.note !== undefined ? { note: delta.note } : {}),
        })
      }
    }
  }
  return changed ? next : null
}

/**
 * Work out everything that changes when one of a character's stats changes
 * type: the definition patch, the coerced base value, and the migrated
 * marker deltas. Pure — the caller writes the results to the stores.
 */
export function planStatTypeChange(
  character: StatTypeChangeCharacter,
  book: Book | null,
  markers: Record<string, StatDelta[]>,
  statId: string,
  newType: StatType,
): StatTypeChangePlan | null {
  const def = character.stats.find((s) => s.id === statId)
  if (!def || def.type === newType) return null
  const oldType = def.type
  const currentValue = character.baseValues[statId]
  if (!currentValue) return null

  const defPatch: Partial<Omit<StatDefinition, 'id'>> = { type: newType }
  if (def.type === 'spellList' && newType !== 'spellList') defPatch.manaStatId = undefined
  // Rank up/down needs tiers to move through.
  if (newType === 'rank' && !(def.rankTiers && def.rankTiers.length > 0)) defPatch.rankTiers = [...DEFAULT_RANK_TIERS]

  const targetsStat = (delta: StatDelta) =>
    delta.characterId === character.id && 'statId' in delta.op && delta.op.statId === statId

  const changedMarkers: Record<string, StatDelta[]> = {}
  const listConversion =
    (oldType === 'list' && isItemList(newType)) || (isItemList(oldType) && newType === 'list')

  if (listConversion && book) {
    // Replay this stat's changes in book order so each op is rewritten
    // against the value it actually applied to.
    let state: CharacterState = { base: { [statId]: currentValue }, equipped: {}, activeBuffs: [] }
    const seen = new Set<string>()
    for (const storylet of getStoryletTreeOrder(book)) {
      for (const marker of extractMarkers(storylet.content ?? '')) {
        if (marker.kind !== 'delta' || seen.has(marker.id)) continue
        seen.add(marker.id)
        const deltas = markers[marker.id]
        if (!deltas) continue
        const next = rebuildDeltas(deltas, targetsStat, (op) => {
          const before = state.base[statId]
          const migrated =
            op.kind === 'listAdd' || op.kind === 'listRemove' || op.kind === 'itemAdd' ||
            op.kind === 'itemRemove' || op.kind === 'itemFieldAdjust'
              ? migrateListOp(op, before, newType)
              : migrateStatDeltaOp(op, oldType, newType)
          state = applyDeltaOp(state, op)
          return migrated
        })
        if (next) changedMarkers[marker.id] = next
      }
    }
    // Markers not found in the text can't be replayed; migrate them on their own.
    for (const [markerId, deltas] of Object.entries(markers)) {
      if (seen.has(markerId)) continue
      const next = rebuildDeltas(deltas, targetsStat, (op) => migrateStatDeltaOp(op, oldType, newType))
      if (next) changedMarkers[markerId] = next
    }
  } else {
    for (const [markerId, deltas] of Object.entries(markers)) {
      const next = rebuildDeltas(deltas, targetsStat, (op) => migrateStatDeltaOp(op, oldType, newType))
      if (next) changedMarkers[markerId] = next
    }
  }

  return {
    defPatch,
    baseValue: coerceStatValue(currentValue, newType),
    markers: changedMarkers,
  }
}

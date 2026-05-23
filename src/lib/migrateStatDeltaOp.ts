import type { StatDeltaOp, StatType } from '../types'
import { defaultItemFields, type ListStatKind } from './listStatFields'
import { parseQty, parseQtyLoose, formatQty } from './characterState'
import { coerceStatValue } from './coerceStatValue'

const STRUCTURED_KINDS: readonly ListStatKind[] = ['inventory', 'spellList', 'skillList']
function isStructured(t: StatType): t is ListStatKind {
  return (STRUCTURED_KINDS as readonly StatType[]).includes(t)
}

/**
 * Transform one stat-delta op when its target stat changes type. Returns the
 * replacement op list (0 = drop, 1 = swap, N = expand). The op is assumed to
 * already reference the renamed stat — the caller filters by `op.statId`.
 *
 * Pure: no store access. Mirrors `coerceStatValue` for the base-value side.
 */
export function migrateStatDeltaOp(
  op: StatDeltaOp,
  oldType: StatType,
  newType: StatType,
): StatDeltaOp[] {
  if (oldType === newType) return [op]
  switch (op.kind) {
    case 'adjust':
      if (newType === 'number' || newType === 'numberWithMax') {
        return op.attributeKey === undefined ? [op] : []
      }
      if (newType === 'attributeSet') {
        return op.attributeKey !== undefined ? [op] : []
      }
      return []
    case 'maxAdjust':
    case 'fill':
      return newType === 'numberWithMax' ? [op] : []
    case 'rankChange':
      return newType === 'rank' ? [op] : []
    case 'set':
      return [{ kind: 'set', statId: op.statId, value: coerceStatValue(op.value, newType) }]
    case 'listAdd':
      if (newType === 'list') return [op]
      if (isStructured(newType)) {
        return op.items.map((s) => {
          // Loose qty parsing only when targeting inventory; spell/skill discard qty.
          const parsed = newType === 'inventory' ? parseQtyLoose(s) : parseQty(s)
          return {
            kind: 'itemAdd' as const,
            statId: op.statId,
            name: parsed.name,
            fields:
              newType === 'inventory'
                ? { qty: parsed.qty }
                : defaultItemFields(newType),
          }
        })
      }
      return []
    case 'listRemove':
      if (newType === 'list') return [op]
      if (isStructured(newType)) {
        return op.items.map((s) => ({
          kind: 'itemRemove' as const,
          statId: op.statId,
          name: (newType === 'inventory' ? parseQtyLoose(s) : parseQty(s)).name,
        }))
      }
      return []
    case 'itemAdd':
      if (isStructured(newType)) {
        return [{
          kind: 'itemAdd',
          statId: op.statId,
          name: op.name,
          fields:
            newType === 'inventory' && op.fields.qty !== undefined
              ? { qty: op.fields.qty }
              : defaultItemFields(newType),
        }]
      }
      if (newType === 'list') {
        const str =
          oldType === 'inventory' && op.fields.qty !== undefined
            ? formatQty(op.name, op.fields.qty)
            : op.name
        return [{ kind: 'listAdd', statId: op.statId, items: [str] }]
      }
      return []
    case 'itemRemove':
      if (isStructured(newType)) return [op]
      if (newType === 'list') {
        return [{ kind: 'listRemove', statId: op.statId, items: [op.name] }]
      }
      return []
    case 'itemFieldAdjust':
      if (isStructured(newType)) {
        const allowed = new Set(Object.keys(defaultItemFields(newType)))
        return allowed.has(op.field) ? [op] : []
      }
      return []
    default:
      return [op]
  }
}

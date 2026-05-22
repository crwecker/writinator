import type { StatType, StatValue } from '../types'
import { parseQty, formatQty } from './characterState'
import { defaultItemFields } from './listStatFields'
import type { ListStatKind } from './listStatFields'

function defaultFor(targetType: StatType): StatValue {
  switch (targetType) {
    case 'number': return { kind: 'number', value: 0 }
    case 'numberWithMax': return { kind: 'numberWithMax', value: 0, max: 10 }
    case 'text': return { kind: 'text', value: '' }
    case 'rank': return { kind: 'rank', tier: 'F' }
    case 'attributeSet': return { kind: 'attributeSet', values: {} }
    case 'list': return { kind: 'list', items: [] }
    case 'inventory': return { kind: 'inventory', items: [] }
    case 'spellList': return { kind: 'spellList', items: [] }
    case 'skillList': return { kind: 'skillList', items: [] }
  }
}

function structuredItems(
  items: Array<{ name: string; fields: Record<string, number> }>,
  kind: ListStatKind,
): StatValue {
  const mapped = items.map((it) => ({ name: it.name, fields: defaultItemFields(kind) }))
  if (kind === 'inventory') return { kind: 'inventory', items: mapped }
  if (kind === 'spellList') return { kind: 'spellList', items: mapped }
  return { kind: 'skillList', items: mapped }
}

export function coerceStatValue(current: StatValue, targetType: StatType): StatValue {
  if (current.kind === targetType) return current

  // list → structured
  if (current.kind === 'list') {
    if (targetType === 'inventory') {
      return {
        kind: 'inventory',
        items: current.items.map((s) => {
          const { name, qty } = parseQty(s)
          return { name, fields: { qty } }
        }),
      }
    }
    if (targetType === 'spellList' || targetType === 'skillList') {
      const kind = targetType as ListStatKind
      return {
        kind: targetType,
        items: current.items.map((s) => ({
          name: parseQty(s).name,
          fields: defaultItemFields(kind),
        })),
      } as StatValue
    }
  }

  // structured → list
  if (current.kind === 'inventory' && targetType === 'list') {
    return { kind: 'list', items: current.items.map((it) => formatQty(it.name, it.fields.qty ?? 1)) }
  }
  if ((current.kind === 'spellList' || current.kind === 'skillList') && targetType === 'list') {
    return { kind: 'list', items: current.items.map((it) => it.name) }
  }

  // structured → structured (keep names, replace fields)
  if (
    current.kind === 'inventory' &&
    (targetType === 'spellList' || targetType === 'skillList')
  ) {
    return structuredItems(current.items, targetType)
  }
  if (
    current.kind === 'spellList' &&
    (targetType === 'inventory' || targetType === 'skillList')
  ) {
    return structuredItems(current.items, targetType)
  }
  if (
    current.kind === 'skillList' &&
    (targetType === 'inventory' || targetType === 'spellList')
  ) {
    return structuredItems(current.items, targetType)
  }

  // Everything else: fall back to a clean default for the target type
  return defaultFor(targetType)
}

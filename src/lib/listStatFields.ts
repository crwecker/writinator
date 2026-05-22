import type { StatListItem } from '../types'

/** Stat kinds whose value is a structured list of items. */
export type ListStatKind = 'inventory' | 'spellList' | 'skillList'

/** Schema for one numeric field on a structured-list item. */
export interface ListStatFieldDef {
  key: string
  label: string
  default: number
  /** Inline -/+ controls and editors must not push the value below this. */
  min: number
}

/**
 * Per-kind field schema for structured-list stats. Single source of truth:
 * the engine validates `itemFieldAdjust` against these keys, and every UI
 * (panel, DeltaEditorModal, StatFieldEditor) drives its field pickers off it.
 */
export const LIST_STAT_FIELDS: Record<ListStatKind, ListStatFieldDef[]> = {
  inventory: [{ key: 'qty', label: 'Qty', default: 1, min: 0 }],
  spellList: [
    { key: 'level', label: 'Level', default: 1, min: 0 },
    { key: 'mana', label: 'Mana', default: 0, min: 0 },
  ],
  skillList: [{ key: 'level', label: 'Level', default: 1, min: 0 }],
}

/** Allowed field keys per kind — what the engine validates `itemFieldAdjust` against. */
export const LIST_STAT_FIELD_KEYS: Record<ListStatKind, string[]> = {
  inventory: LIST_STAT_FIELDS.inventory.map((f) => f.key),
  spellList: LIST_STAT_FIELDS.spellList.map((f) => f.key),
  skillList: LIST_STAT_FIELDS.skillList.map((f) => f.key),
}

/** Default `fields` object for a new item of the given kind (e.g. inventory → { qty: 1 }). */
export function defaultItemFields(kind: ListStatKind): Record<string, number> {
  const out: Record<string, number> = {}
  for (const f of LIST_STAT_FIELDS[kind]) out[f.key] = f.default
  return out
}

/** Create a new list item with default fields for the given kind. */
export function makeListItem(kind: ListStatKind, name: string): StatListItem {
  return { name, fields: defaultItemFields(kind) }
}

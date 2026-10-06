import { useCharacterStore } from '../../stores/characterStore'
import { formatQty, parseQty } from '../../lib/characterState'
import type { Character, StatDelta } from '../../types'

/**
 * Rename a list-stat item across the character's base value AND any stat-delta
 * markers that reference the item by name. This is an authoring-time edit —
 * the rename takes effect from the BEGINNING of the book, not as a delta —
 * which keeps prose stable: existing `+Bandage` markers continue to make
 * sense after `Bandage` becomes `Gauze`.
 *
 * Supports both structured list kinds (inventory/spellList/skillList — items
 * with a `name` field) and plain `list` (items are bare strings that may carry
 * an inline `xN` quantity). Names match case-insensitively, as the state
 * engine does, and plain-list entries keep their own quantity: `oldName` may
 * be the effective string the panel shows ("Potion x3").
 */
export function renameListItem(
  character: Character,
  statId: string,
  oldName: string,
  newName: string,
): boolean {
  const cs = useCharacterStore.getState()
  const current = cs.characters.find((c) => c.id === character.id) ?? character
  const def = current.stats.find((s) => s.id === statId)
  if (!def) return false
  const plain = def.type === 'list'
  const structured = def.type === 'inventory' || def.type === 'spellList' || def.type === 'skillList'
  if (!plain && !structured) return false

  const nameOf = (raw: string) => (plain ? parseQty(raw).name : raw).trim()
  const from = nameOf(oldName)
  const to = nameOf(newName)
  const fromKey = from.toLowerCase()
  const toKey = to.toLowerCase()
  if (!to || to === from) return false
  const matches = (raw: string) => nameOf(raw).toLowerCase() === fromKey
  const renamePlain = (raw: string) => (matches(raw) ? formatQty(to, parseQty(raw).qty) : raw)

  const base = current.baseValues[statId]
  if (base) {
    if (plain && base.kind === 'list') {
      const clash = base.items.some((s) => !matches(s) && nameOf(s).toLowerCase() === toKey)
      if (clash) return false
      if (base.items.some(matches)) {
        cs.setBaseValue(current.id, statId, { kind: 'list', items: base.items.map(renamePlain) })
      }
    } else if (
      structured &&
      (base.kind === 'inventory' || base.kind === 'spellList' || base.kind === 'skillList')
    ) {
      const clash = base.items.some((it) => !matches(it.name) && it.name.toLowerCase() === toKey)
      if (clash) return false
      if (base.items.some((it) => matches(it.name))) {
        cs.setBaseValue(current.id, statId, {
          ...base,
          items: base.items.map((it) => (matches(it.name) ? { ...it, name: to } : it)),
        })
      }
    }
  }

  for (const [markerId, deltas] of Object.entries(cs.markers)) {
    let changed = false
    const next = deltas.map((d): StatDelta => {
      if (d.characterId !== current.id) return d
      const op = d.op
      if (!('statId' in op) || op.statId !== statId) return d
      if (
        (op.kind === 'itemAdd' || op.kind === 'itemRemove' || op.kind === 'itemFieldAdjust') &&
        matches(op.name)
      ) {
        changed = true
        return { ...d, op: { ...op, name: to } }
      }
      if ((op.kind === 'listAdd' || op.kind === 'listRemove') && op.items.some(matches)) {
        changed = true
        return { ...d, op: { ...op, items: op.items.map(renamePlain) } }
      }
      return d
    })
    if (changed) cs.setMarker(markerId, next)
  }
  return true
}

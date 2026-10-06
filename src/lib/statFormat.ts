import type { Character, StatDefinition, StatDelta, StatDeltaOp, StatValue } from '../types'
import { formatQty } from './characterState'
import { currencyUnitValue, formatCoins, isCurrencyStat } from './itemCatalog'
import { useItemCatalogStore } from '../stores/itemCatalogStore'

// ---------------------------------------------------------------------------
// Stat values
// ---------------------------------------------------------------------------

/**
 * How a stat value reads as one line of text. The surfaces differ on purpose:
 * the panel is cramped (item counts, "(empty)"), statblocks and exports read
 * like a game status screen ("(none)", "•"), and export lists item names
 * because a printed page can't expand a count.
 */
export interface StatValueFormat {
  /** Shown for an empty list of any kind. */
  emptyList: string
  /** Between `KEY n` pairs of an attribute set. */
  attributeSeparator: string
  /** Structured lists (inventory / spells / skills) as "N items" or their names. */
  structuredItems: 'count' | 'names'
}

/** Character panel stat rows and the Changes tab. */
export const PANEL_VALUE_FORMAT: StatValueFormat = {
  emptyList: '(empty)',
  attributeSeparator: '  ',
  structuredItems: 'count',
}

/** Scalar rows of the in-editor statblock widget. */
export const STATBLOCK_VALUE_FORMAT: StatValueFormat = {
  emptyList: '(none)',
  attributeSeparator: ' • ',
  structuredItems: 'count',
}

/** Statblocks in exported files. */
export const EXPORT_VALUE_FORMAT: StatValueFormat = {
  emptyList: '(none)',
  attributeSeparator: ' • ',
  structuredItems: 'names',
}

/** One-line text for a stat value. Missing values and empty text read "—". */
/** A number stat that is currency, as coins ("2g 50s"); null for anything else. */
function asCoins(v: StatValue, def: StatDefinition | undefined): string | null {
  if (v.kind !== 'number' || !def) return null
  const cfg = useItemCatalogStore.getState().currency
  if (!isCurrencyStat(def, cfg)) return null
  return formatCoins(v.value * currencyUnitValue(def, cfg), cfg)
}

export function formatStatValue(v: StatValue | undefined, format: StatValueFormat, def?: StatDefinition): string {
  if (!v) return '—'
  const coins = asCoins(v, def)
  if (coins !== null) return coins
  switch (v.kind) {
    case 'number':
      return String(v.value)
    case 'numberWithMax':
      return `${v.value}/${v.max}`
    case 'text':
      return v.value || '—'
    case 'list':
      return v.items.length === 0 ? format.emptyList : v.items.join(', ')
    case 'attributeSet':
      return Object.entries(v.values)
        .map(([k, n]) => `${k} ${n}`)
        .join(format.attributeSeparator)
    case 'rank':
      return v.tier
    case 'inventory':
    case 'spellList':
    case 'skillList':
      if (v.items.length === 0) return format.emptyList
      return format.structuredItems === 'count'
        ? `${v.items.length} items`
        : v.items.map((it) => it.name).join(', ')
  }
}

/**
 * Render a stat value for inline use in prose (`{HP}` refs). Prefers the most
 * natural single-token reading per kind:
 *  - numberWithMax: just the value (HP "12", not "12/10"). Pass subkey
 *    `'max'` for the max, `'value'` for explicit form.
 *  - attributeSet: pass subkey to pluck a single attribute (e.g. "STR").
 *    Without a subkey, joins all attributes ("STR 10 DEX 14 ...").
 *  - list / inventory: one item per line (inventory keeps qty via "Name xN")
 *  - text: the string (empty string when unset — caller decides whether to
 *    fall back to the raw `{...}` token)
 *
 * Returns '' for unsupported subkeys so the caller can fall back to the raw
 * token (helps authors spot typos like `{HP.maxx}`).
 */
export function formatStatValueInline(
  v: StatValue,
  subkey: string | null = null,
  def?: StatDefinition,
): string {
  if (!subkey) {
    const coins = asCoins(v, def)
    if (coins !== null) return coins
  }
  const key = subkey ? subkey.toLowerCase() : null
  switch (v.kind) {
    case 'number':
      return String(v.value)
    case 'numberWithMax':
      if (key === 'max') return String(v.max)
      if (key && key !== 'value') return ''
      return String(v.value)
    case 'text':
      return v.value
    case 'rank':
      return v.tier
    case 'list':
      return v.items.join('<br/>')
    case 'attributeSet': {
      if (!key) {
        return Object.entries(v.values)
          .map(([k, n]) => `${k} ${n}`)
          .join(' ')
      }
      for (const [k, n] of Object.entries(v.values)) {
        if (k.toLowerCase() === key) return String(n)
      }
      return ''
    }
    case 'inventory':
      return v.items
        .map((it) => formatQty(it.name, it.fields.qty ?? 1))
        .join('<br/>')
    case 'spellList':
      return v.items
        .map((it) => {
          const lv = it.fields.level ?? 1
          const cost = it.fields.mana ?? 0
          return `${it.name} · Lv ${lv} · Cost ${cost}`
        })
        .join('<br/>')
    case 'skillList':
      return v.items
        .map((it) => `${it.name} · Lv ${it.fields.level ?? 1}`)
        .join('<br/>')
  }
}

// ---------------------------------------------------------------------------
// Delta ops
// ---------------------------------------------------------------------------

/** Stat-id → display-name lookup for one character (falls back to the id). */
export function statNameLookup(character: Character | undefined): (statId: string) => string {
  return (statId) => character?.stats.find((s) => s.id === statId)?.name ?? statId
}

function signed(n: number): string {
  return `${n >= 0 ? '+' : ''}${n}`
}

function capitalize(s: string): string {
  return s.length > 0 ? s[0].toUpperCase() + s.slice(1) : s
}

/**
 * Terse op wording for the marker-dot tooltip, which reads like a change log
 * line ("+Rope → Inventory", "maxHP +2").
 */
export function formatOpTooltip(op: StatDeltaOp, statName: (id: string) => string): string {
  switch (op.kind) {
    case 'adjust': {
      const label = op.attributeKey
        ? `${statName(op.statId)}.${op.attributeKey}`
        : statName(op.statId)
      return `${label} ${signed(op.delta)}`
    }
    case 'set':
      return `set ${statName(op.statId)}`
    case 'maxAdjust':
      return `max${capitalize(statName(op.statId))} ${signed(op.delta)}`
    case 'listAdd':
      return `+${op.items.join(', ')} → ${statName(op.statId)}`
    case 'listRemove':
      return `-${op.items.join(', ')} from ${statName(op.statId)}`
    case 'equip':
      return `equip ${op.itemName ?? op.itemId} (${op.slot})`
    case 'unequip':
      return `unequip ${op.slot}`
    case 'buffApply':
      return `buff ${op.buffName ?? op.buffId}`
    case 'buffRemove':
      return `-buff ${op.buffId}`
    case 'rankChange':
      if (op.direction === 'set') {
        return `${statName(op.statId)} → ${op.value ?? '?'}`
      }
      return `${statName(op.statId)} rank ${op.direction}`
    case 'fill':
      return `${statName(op.statId)} → max`
    case 'itemAdd':
      return `+${op.name} → ${statName(op.statId)}`
    case 'itemRemove':
      return `-${op.name} from ${statName(op.statId)}`
    case 'itemFieldAdjust':
      return `${op.name}.${op.field} ${signed(op.delta)}`
  }
}

/**
 * Op wording for the panel's Changes tab, which leads with the stat name so
 * rows scan as a column and shows `set` values in full.
 */
export function formatOpSummary(op: StatDeltaOp, statName: (id: string) => string): string {
  switch (op.kind) {
    case 'adjust': {
      const attr = op.attributeKey ? ` ${op.attributeKey}` : ''
      return `${statName(op.statId)}${attr} ${signed(op.delta)}`
    }
    case 'set':
      return `${statName(op.statId)} = ${formatStatValue(op.value, PANEL_VALUE_FORMAT)}`
    case 'maxAdjust':
      return `${statName(op.statId)} max ${signed(op.delta)}`
    case 'listAdd':
      return `${statName(op.statId)} + ${op.items.join(', ') || '(none)'}`
    case 'listRemove':
      return `${statName(op.statId)} − ${op.items.join(', ') || '(none)'}`
    case 'equip':
      return `Equip ${op.slot}: ${op.itemName ?? (op.itemId || '(item)')}`
    case 'unequip':
      return `Unequip ${op.slot}`
    case 'buffApply':
      return `Buff + ${op.buffName ?? op.buffId}`
    case 'buffRemove':
      return `Buff − ${op.buffId}`
    case 'rankChange':
      return op.direction === 'set'
        ? `${statName(op.statId)} = ${op.value ?? ''}`
        : `${statName(op.statId)} rank ${op.direction}`
    case 'fill':
      return `${statName(op.statId)} → max`
    case 'itemAdd':
      return `${statName(op.statId)} + ${op.name}`
    case 'itemRemove':
      return `${statName(op.statId)} − ${op.name}`
    case 'itemFieldAdjust':
      return `${op.name} ${op.field} ${signed(op.delta)}`
  }
}

// ---------------------------------------------------------------------------
// Inline change chips
// ---------------------------------------------------------------------------

/** One character's slice of a chip: "Kael · HP −15 · +Wolf Pelt". */
export interface MarkerChipGroup {
  characterId: string
  name: string
  color: string
  parts: string[]
}

export interface MarkerChip {
  groups: MarkerChipGroup[]
  /** Ops left out of `groups` to keep the chip short. */
  more: number
  /** Plain-text rendering of the whole chip. */
  text: string
}

export const CHIP_NEUTRAL_COLOR = '#6b7280'

/** Compact wording for one op inside a chip ("HP −15", "+3 Arrows", "Rank ↑"). */
const MINUS = '\u2212'

function signedChip(n: number): string {
  return n < 0 ? `${MINUS}${Math.abs(n)}` : `+${n}`
}

function chipValue(v: StatValue): string {
  return v.kind === 'attributeSet'
    ? Object.entries(v.values).map(([k, n]) => `${k} ${n}`).join(' ')
    : formatStatValue(v, PANEL_VALUE_FORMAT)
}

export function formatOpChip(
  op: StatDeltaOp,
  statName: (id: string) => string,
  character?: Character,
): string {
  const typeOf = (id: string) => character?.stats.find((s) => s.id === id)?.type
  const isAbility = (id: string) => {
    const t = typeOf(id)
    return t === 'spellList' || t === 'skillList'
  }
  switch (op.kind) {
    case 'adjust': {
      // Currency stats read as coins: "Gold +2g 50s".
      const def = character?.stats.find((s) => s.id === op.statId)
      const cfg = useItemCatalogStore.getState().currency
      if (def && !op.attributeKey && isCurrencyStat(def, cfg)) {
        const coins = formatCoins(Math.abs(op.delta) * currencyUnitValue(def, cfg), cfg)
        return `${statName(op.statId)} ${op.delta < 0 ? MINUS : '+'}${coins}`
      }
      return `${op.attributeKey ?? statName(op.statId)} ${signedChip(op.delta)}`
    }
    case 'maxAdjust':
      return `max ${statName(op.statId)} ${signedChip(op.delta)}`
    case 'set':
      return `${statName(op.statId)} = ${chipValue(op.value)}`
    case 'fill':
      return `${statName(op.statId)} full`
    case 'listAdd':
      return `+${op.items.join(', ')}`
    case 'listRemove':
      return `${MINUS}${op.items.join(', ')}`
    case 'itemAdd': {
      if (isAbility(op.statId)) return `learns ${op.name}`
      const qty = op.fields.qty ?? 1
      return qty > 1 ? `+${qty} ${op.name}` : `+${op.name}`
    }
    case 'itemRemove':
      return isAbility(op.statId) ? `forgets ${op.name}` : `${MINUS}${op.name}`
    case 'itemFieldAdjust':
      return op.field === 'qty'
        ? `${signedChip(op.delta)} ${op.name}`
        : `${op.name} ${op.field} ${signedChip(op.delta)}`
    case 'equip':
      return `equips ${op.itemName || op.itemId}`
    case 'unequip':
      return `unequips ${op.slot}`
    case 'buffApply':
      return `+${op.buffName || op.buffId}${op.expiresAfter ? ` (${op.expiresAfter})` : ''}`
    case 'buffRemove':
      return `${MINUS}${op.buffId}`
    case 'rankChange':
      if (op.direction === 'set') return `${statName(op.statId)} = ${op.value ?? '?'}`
      return `${statName(op.statId)} ${op.direction === 'up' ? '\u2191' : '\u2193'}`
  }
}

/**
 * The chip for a marker: ops grouped by character (first-appearance order),
 * at most `maxParts` ops shown, the rest counted in `more`.
 */
export function buildMarkerChip(
  deltas: StatDelta[],
  charactersById: Map<string, Character>,
  maxParts = 3,
): MarkerChip {
  const groups: MarkerChipGroup[] = []
  let shown = 0
  let more = 0
  for (const d of deltas) {
    if (shown >= maxParts) {
      more++
      continue
    }
    const character = charactersById.get(d.characterId)
    let group = groups.find((g) => g.characterId === d.characterId)
    if (!group) {
      group = {
        characterId: d.characterId,
        name: character?.name ?? 'Unknown',
        color: character?.color ?? CHIP_NEUTRAL_COLOR,
        parts: [],
      }
      groups.push(group)
    }
    group.parts.push(formatOpChip(d.op, statNameLookup(character), character))
    shown++
  }
  const text =
    groups.map((g) => [g.name, ...g.parts].join(' · ')).join('  ') + (more > 0 ? ` · +${more} more` : '')
  return { groups, more, text }
}

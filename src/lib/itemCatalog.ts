import type {
  CatalogItem,
  Character,
  CurrencyConfig,
  CurrencyDenomination,
  StatDefinition,
  StatDelta,
  StatDeltaOp,
  StatModifier,
  StatValue,
} from '../types'

// ---------------------------------------------------------------------------
// Item catalog, currency and carry weight — pure helpers. The catalog is
// book-level (one list of items for every character); stats stay per
// character, so catalog modifiers name stats and are resolved per character.
// ---------------------------------------------------------------------------

/** 1g = 100s = 10000c. */
export const DEFAULT_CURRENCY: CurrencyConfig = {
  denominations: [
    { name: 'gold', abbr: 'g', value: 10000 },
    { name: 'silver', abbr: 's', value: 100 },
    { name: 'copper', abbr: 'c', value: 1 },
  ],
}

/** Denominations largest first, ignoring unusable rows. */
function denominations(cfg: CurrencyConfig): CurrencyDenomination[] {
  const usable = cfg.denominations.filter((d) => d.value > 0 && (d.abbr.trim() || d.name.trim()))
  const list = usable.length > 0 ? usable : DEFAULT_CURRENCY.denominations
  return [...list].sort((a, b) => b.value - a.value)
}

/** Round away float noise from unit conversions (0.1 + 0.2 and friends). */
export function roundAmount(n: number): number {
  return Math.round(n * 1e9) / 1e9
}

/** "2g 50s" for 25000 smallest units (rounded to whole units). Zero reads "0g". */
export function formatCoins(units: number, cfg: CurrencyConfig): string {
  const denoms = denominations(cfg)
  let rest = Math.round(Math.abs(units))
  const parts: string[] = []
  for (const d of denoms) {
    const n = Math.floor(rest / d.value)
    if (n > 0) {
      parts.push(`${n}${d.abbr || ` ${d.name}`}`)
      rest -= n * d.value
    }
  }
  if (parts.length === 0) return `0${denoms[0].abbr || ` ${denoms[0].name}`}`
  return `${units < 0 ? '-' : ''}${parts.join(' ')}`
}

function denominationFor(word: string, cfg: CurrencyConfig): CurrencyDenomination | undefined {
  const w = word.toLowerCase()
  return denominations(cfg).find((d) => {
    const name = d.name.toLowerCase()
    const abbr = d.abbr.toLowerCase()
    return (abbr && w === abbr) || (name && (w === name || w === `${name}s` || w === `${name} coins` || w === `${name} pieces`))
  })
}

/**
 * Smallest-unit amount for "2g 50s", "3 silver 4 copper", "1 gold". Null when
 * the text isn't entirely coin amounts.
 */
export function parseCoins(text: string, cfg: CurrencyConfig): number | null {
  const s = text.trim()
  if (!s) return null
  const re = /(\d+(?:\.\d+)?)\s*([\p{L}]+(?:\s+(?:coins|pieces))?)\s*/uy
  let total = 0
  let pos = 0
  while (pos < s.length) {
    re.lastIndex = pos
    const m = re.exec(s)
    if (!m) return null
    const d = denominationFor(m[2], cfg)
    if (!d) return null
    total += Number(m[1]) * d.value
    pos = re.lastIndex
  }
  return roundAmount(total)
}

/** The denomination a currency stat counts in: the one its name matches, else the largest. */
export function currencyUnitValue(def: StatDefinition, cfg: CurrencyConfig): number {
  return denominationFor(def.name.trim(), cfg)?.value ?? denominations(cfg)[0].value
}

/** Whether a number stat is named for a coin ("Gold", "Silver Pieces"). */
function namedForCoin(def: StatDefinition, cfg: CurrencyConfig): boolean {
  return def.type === 'number' && !!denominationFor(def.name.trim(), cfg)
}

/**
 * Whether a stat reads as coins: a number stat flagged `currency`, or one
 * named for a coin ("Gold") unless currency was switched off for it.
 */
export function isCurrencyStat(def: StatDefinition | undefined, cfg: CurrencyConfig): boolean {
  if (!def || def.type !== 'number') return false
  return def.currency === true || (def.currency !== false && namedForCoin(def, cfg))
}

/** Where coins go: the first stat flagged currency, else the first number stat named for a coin. */
export function currencyStatOf(c: Character, cfg: CurrencyConfig): StatDefinition | undefined {
  return (
    c.stats.find((s) => s.type === 'number' && s.currency === true) ??
    c.stats.find((s) => s.currency !== false && namedForCoin(s, cfg))
  )
}

/** Coins text for a currency stat's value (see `isCurrencyStat`); null for any other stat. */
export function formatStatValueWithCurrency(
  v: StatValue | undefined,
  def: StatDefinition | undefined,
  cfg: CurrencyConfig,
): string | null {
  if (!v || !def || !isCurrencyStat(def, cfg) || v.kind !== 'number') return null
  return formatCoins(v.value * currencyUnitValue(def, cfg), cfg)
}

/** Amount in `def`'s unit for `units` smallest units. */
export function unitsToStatAmount(units: number, def: StatDefinition, cfg: CurrencyConfig): number {
  return roundAmount(units / currencyUnitValue(def, cfg))
}

// ---------------------------------------------------------------------------
// Catalog lookups
// ---------------------------------------------------------------------------

export function findCatalogItem(catalog: CatalogItem[] | undefined, name: string): CatalogItem | undefined {
  if (!catalog) return undefined
  const n = name.trim().toLowerCase()
  return catalog.find((it) => it.name.toLowerCase() === n)
}

/** Catalog modifiers as engine modifiers for `c`; ones naming a stat `c` lacks are dropped. */
export function resolveCatalogModifiers(it: CatalogItem, c: Character): StatModifier[] {
  const out: StatModifier[] = []
  for (const m of it.modifiers ?? []) {
    if (!Number.isFinite(m.amount) || m.amount === 0) continue
    const n = m.stat.trim().toLowerCase()
    const def = c.stats.find((s) => s.name.toLowerCase() === n || s.id.toLowerCase() === n)
    if (def && (def.type === 'number' || def.type === 'numberWithMax')) {
      out.push({ statId: def.id, kind: m.max && def.type === 'numberWithMax' ? 'maxFlat' : 'flat', amount: m.amount })
      continue
    }
    for (const s of c.stats) {
      if (s.type !== 'attributeSet') continue
      const key = (s.attributeKeys ?? []).find((k) => k.toLowerCase() === n)
      if (key) {
        out.push({ statId: s.id, kind: 'flat', amount: m.amount, attributeKey: key })
        break
      }
    }
  }
  return out
}

/** Total catalog weight of everything in `c`'s inventories (items without a weight count 0). */
export function carriedWeight(c: Character, base: Record<string, StatValue>, catalog: CatalogItem[] | undefined): number {
  if (!catalog || catalog.length === 0) return 0
  let total = 0
  for (const def of c.stats) {
    const v = base[def.id]
    if (!v || v.kind !== 'inventory') continue
    for (const it of v.items) {
      const w = findCatalogItem(catalog, it.name)?.weight
      if (w) total += w * (it.fields.qty ?? 1)
    }
  }
  return roundAmount(total)
}

const CAPACITY_NAME = /^(?:carry(?:ing)?\s+)?capacity$|^carry\s+(?:weight|limit)$|^max(?:imum)?\s+load$/i

/** The capacity stat, if `c` has one ("Capacity", "Carry Capacity", "Max Load"). */
export function capacityStatOf(c: Character): StatDefinition | undefined {
  return c.stats.find((s) => (s.type === 'number' || s.type === 'numberWithMax') && CAPACITY_NAME.test(s.name.trim()))
}

/** Carry capacity from `values` (effective values preferred), or null when `c` doesn't track one. */
export function capacityOf(c: Character, values: Record<string, StatValue>): number | null {
  const def = capacityStatOf(c)
  if (!def) return null
  const v = values[def.id]
  if (v?.kind === 'number') return v.value
  if (v?.kind === 'numberWithMax') return v.max
  return null
}

/** "Over capacity: 45 / 10" when carrying more than the capacity, else undefined. */
export function overCapacityWarning(weight: number, capacity: number | null): string | undefined {
  if (capacity === null || weight <= capacity) return undefined
  return `Over capacity: ${weight} / ${capacity}`
}

// ---------------------------------------------------------------------------
// Auto-catalog: every item name in use, so the catalog builds itself
// ---------------------------------------------------------------------------

/**
 * Inventory item names used anywhere — base values, item ops in markers, and
 * equipped items — in first-seen order, deduped case-insensitively. Spells,
 * skills and plain lists (status effects) aren't items.
 */
export function collectUsedItemNames(characters: Character[], markers: Record<string, StatDelta[]>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  const add = (name: string | undefined) => {
    const n = name?.trim()
    if (!n || seen.has(n.toLowerCase())) return
    seen.add(n.toLowerCase())
    out.push(n)
  }
  const byId = new Map(characters.map((c) => [c.id, c]))
  for (const c of characters) {
    for (const def of c.stats) {
      const v = c.baseValues[def.id]
      if (v?.kind === 'inventory') v.items.forEach((it) => add(it.name))
    }
  }
  for (const deltas of Object.values(markers)) {
    for (const d of deltas) {
      const c = byId.get(d.characterId)
      if (!c) continue
      const op = d.op
      if (op.kind === 'itemAdd' && c.stats.find((s) => s.id === op.statId)?.type === 'inventory') add(op.name)
      else if (op.kind === 'equip') add(op.itemName ?? op.itemId)
    }
  }
  return out
}

type EquipOp = Extract<StatDeltaOp, { kind: 'equip' }>

/**
 * The equip op after typing `name` as its item: a catalog item fills in its
 * canonical name, its slot (when `c` has it) and its modifiers; any other
 * name only sets the item id.
 */
export function equipFromCatalog(op: EquipOp, name: string, c: Character | undefined, catalog: CatalogItem[]): EquipOp {
  const cat = findCatalogItem(catalog, name)
  if (!cat || !c) return { ...op, itemId: name }
  const want = cat.slot?.trim().toLowerCase()
  const slot = (want && c.equipmentSlots.find((s) => s.toLowerCase() === want)) || op.slot
  return { ...op, slot, itemId: cat.name, itemName: cat.name, modifiers: resolveCatalogModifiers(cat, c) }
}

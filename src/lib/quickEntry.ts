import type {
  CatalogItem,
  Character,
  CharacterState,
  CurrencyConfig,
  QuickMacro,
  StatDefinition,
  StatDeltaOp,
  StatType,
  StatValue,
} from '../types'
import { applyDeltaOpWithDefs, formatQty, parseQty } from './characterState'
import {
  DEFAULT_CURRENCY,
  currencyStatOf,
  findCatalogItem,
  parseCoins,
  resolveCatalogModifiers,
  unitsToStatAmount,
} from './itemCatalog'
import { PARTY_NAME_RE, partyOf } from './party'
import { defaultItemFields } from './listStatFields'
import { previewOp, type OpPreview } from './statPreview'
import { DEFAULT_RANK_TIERS, createDefaultCharacter } from '../stores/characterStore'

// ---------------------------------------------------------------------------
// Quick entry: one line of shorthand ("Kael -15 HP, +Wolf Pelt") → delta ops.
//
// Grammar (case-insensitive; comma-separated clauses; a clause may start with
// a character name, which carries over to the following clauses):
//
//   ±N <stat|attribute>      <stat|attribute> ±N      ±N <item> / <item> ±N
//   <stat> = <value>         set <stat> to <value>    (HP = 30 or 30/50; rank = C)
//   max <stat> ±N            ±N max <stat>            fill|refill|restore <stat>
//   <rank stat|rank> up|down
//   +<item>  -<item>         <list stat> ±[N] <item>  (inventory / plain lists)
//   learns [spell|skill] <name>                      forgets <name>
//   equips|wields|wears|dons <item> [as|in|to|on <slot>]   unequips <slot|item>
//   buff <name> [[for] N]    +buff <name>            lose|remove|end buff <name>, -buff <name>
//   gives <character> [N] <item|number stat|coins>
//   takes [N] <item|coins> from <character|party>     stashes [N] <item|coins>
//   ±<coins> (e.g. +2g 50s → the character's currency stat)
//   <macro name>  (a user-defined shortcut, expanded as quick-entry text)
//
// The parser is pure: it reads the characters and their state at the
// insertion point, and applies each clause's ops to a working copy so later
// clauses (and the preview) see earlier ones. New clause shapes (macros) slot
// into `BODY_RULES`.
// ---------------------------------------------------------------------------

export interface QuickEntryContext {
  characters: Character[]
  /** Each character's state at the insertion point, before the new ops. */
  stateFor: (characterId: string) => CharacterState | undefined
  /** Character used by clauses that don't name one (e.g. "HP +5"). */
  defaultCharacterId?: string | null
  /** Book item catalog: equip slots/modifiers, weights, completions. */
  catalog?: CatalogItem[]
  /** User-defined shortcuts ("level up"). */
  macros?: QuickMacro[]
  /** Coin denominations for "+2g 50s" (default 1g = 100s = 10000c). */
  currency?: CurrencyConfig
}

export interface QuickEntryOp {
  characterId: string
  op: StatDeltaOp
}

export type CreateSuggestion =
  | { kind: 'character'; name: string }
  | { kind: 'party'; name: string }
  | { kind: 'stat'; characterId: string; name: string; type: StatType; currency?: boolean }

export interface ParsedClause {
  text: string
  from: number
  to: number
  ops: QuickEntryOp[]
  preview: OpPreview[]
  error?: string
  create?: CreateSuggestion
}

export interface QuickEntryResult {
  clauses: ParsedClause[]
  ops: QuickEntryOp[]
  /** True when there is at least one op and no clause has an error. */
  ok: boolean
  /** Character the last clause referred to (carries into the next entry). */
  lastCharacterId: string | null
}

// ---------------------------------------------------------------------------
// Lookups
// ---------------------------------------------------------------------------

const ITEM_LIST_TYPES: StatType[] = ['inventory', 'list', 'spellList', 'skillList']

interface Env {
  characters: Character[]
  stateOf: (c: Character) => CharacterState
  catalog: CatalogItem[]
  macros: QuickMacro[]
  currency: CurrencyConfig
  /** Macro nesting depth (guards self-referencing macros). */
  depth: number
}

interface ResolvedStat {
  def: StatDefinition
  attributeKey?: string
}

function lower(s: string): string {
  return s.trim().toLowerCase()
}

/** Stat by name or id, then attribute key; "rank" falls back to the first rank stat. */
function resolveStat(c: Character, name: string): ResolvedStat | null {
  const n = lower(name)
  const def = c.stats.find((s) => s.name.toLowerCase() === n) ?? c.stats.find((s) => s.id.toLowerCase() === n)
  if (def) return { def }
  if (n === 'rank' || n === 'ranks') {
    const rank = c.stats.find((s) => s.type === 'rank')
    if (rank) return { def: rank }
  }
  for (const s of c.stats) {
    if (s.type !== 'attributeSet') continue
    const key = (s.attributeKeys ?? []).find((k) => k.toLowerCase() === n)
    if (key) return { def: s, attributeKey: key }
  }
  return null
}

interface OwnedItem {
  def: StatDefinition
  name: string
  qty: number
}

function itemsOf(v: StatValue | undefined): Array<{ name: string; qty: number }> {
  if (!v) return []
  if (v.kind === 'list') return v.items.map((raw) => parseQty(raw))
  if (v.kind === 'inventory' || v.kind === 'spellList' || v.kind === 'skillList') {
    return v.items.map((it) => ({ name: it.name, qty: it.fields.qty ?? 1 }))
  }
  return []
}

function findOwned(c: Character, state: CharacterState, name: string, types: StatType[] = ITEM_LIST_TYPES): OwnedItem | null {
  const n = lower(name)
  for (const def of c.stats) {
    if (!types.includes(def.type)) continue
    const hit = itemsOf(state.base[def.id]).find((it) => it.name.toLowerCase() === n)
    if (hit) return { def, name: hit.name, qty: hit.qty }
  }
  return null
}

function firstOfType(c: Character, ...types: StatType[]): StatDefinition | undefined {
  for (const t of types) {
    const def = c.stats.find((s) => s.type === t)
    if (def) return def
  }
  return undefined
}

function matchCharacterPrefix(characters: Character[], text: string): { character: Character; rest: string } | null {
  const sorted = [...characters].sort((a, b) => b.name.length - a.name.length)
  const t = text.toLowerCase()
  for (const c of sorted) {
    const n = c.name.toLowerCase()
    if (!n || !t.startsWith(n)) continue
    const next = text.charAt(n.length)
    if (next === '' || /\s/.test(next)) return { character: c, rest: text.slice(n.length).trim() }
  }
  return null
}

// ---------------------------------------------------------------------------
// Clause bodies
// ---------------------------------------------------------------------------

interface BodyResult {
  ops: QuickEntryOp[]
  /** Parser-level warnings by op index (override the generic preview warning). */
  warnings?: Array<string | undefined>
  error?: string
  create?: CreateSuggestion
}

const fail = (error: string, create?: CreateSuggestion): BodyResult => ({ ops: [], error, create })
const one = (c: Character, op: StatDeltaOp, warning?: string): BodyResult => ({
  ops: [{ characterId: c.id, op }],
  warnings: [warning],
})

function noStat(c: Character, name: string, type: StatType): BodyResult {
  return fail(`${c.name} has no stat “${name}”`, { kind: 'stat', characterId: c.id, name, type })
}

function noItemHome(c: Character): BodyResult {
  return fail(`${c.name} has no inventory`, { kind: 'stat', characterId: c.id, name: 'Inventory', type: 'inventory' })
}

/** Where an item op lands: the list already holding it, else `only`, else the first inventory/list. */
function itemHome(c: Character, state: CharacterState, name: string, only?: StatDefinition) {
  const owned = findOwned(only ? { ...c, stats: [only] } : c, state, name)
  return { owned, def: only ?? owned?.def ?? firstOfType(c, 'inventory', 'list') }
}

/** Gain `n` of an item: raise an owned stack, else add it to the first inventory/list. */
function gainItem(c: Character, state: CharacterState, name: string, n: number, only?: StatDefinition): BodyResult {
  const { owned, def } = itemHome(c, state, name, only)
  if (!def) return noItemHome(c)
  const itemName = owned?.name ?? name.trim()
  if (def.type === 'list') return one(c, { kind: 'listAdd', statId: def.id, items: [formatQty(itemName, n)] })
  if (owned && def.type === 'inventory') {
    return one(c, { kind: 'itemFieldAdjust', statId: def.id, name: itemName, field: 'qty', delta: n })
  }
  if (def.type === 'inventory' || def.type === 'spellList' || def.type === 'skillList') {
    const fields = defaultItemFields(def.type)
    if (def.type === 'inventory') fields.qty = n
    return one(c, { kind: 'itemAdd', statId: def.id, name: itemName, fields })
  }
  return noItemHome(c)
}

/** Lose `n` of an item: lower the stack while some remain, else remove it. */
function loseItem(c: Character, state: CharacterState, name: string, n: number, only?: StatDefinition): BodyResult {
  const { owned, def } = itemHome(c, state, name, only)
  if (!def) return noItemHome(c)
  const itemName = owned?.name ?? name.trim()
  if (def.type === 'list') return one(c, { kind: 'listRemove', statId: def.id, items: [formatQty(itemName, n)] })
  const short = owned && n > owned.qty ? `${c.name} only has ${owned.qty} ${owned.name}` : undefined
  if (owned && def.type === 'inventory' && owned.qty > n) {
    return one(c, { kind: 'itemFieldAdjust', statId: def.id, name: itemName, field: 'qty', delta: -n })
  }
  return one(c, { kind: 'itemRemove', statId: def.id, name: itemName }, short)
}

function adjustStat(c: Character, r: ResolvedStat, delta: number, label: string): BodyResult {
  const { def, attributeKey } = r
  if (attributeKey) return one(c, { kind: 'adjust', statId: def.id, delta, attributeKey })
  if (def.type === 'number' || def.type === 'numberWithMax') return one(c, { kind: 'adjust', statId: def.id, delta })
  return fail(`${def.name} isn’t a number — try “+${label}” or “${def.name} = …”`)
}

const NUM = '(\\d+(?:\\.\\d+)?)'

function setStat(c: Character, state: CharacterState, name: string, raw: string): BodyResult {
  const value = raw.trim()
  const r = resolveStat(c, name)
  if (!r) return noStat(c, name.trim(), /^-?\d+(\.\d+)?$/.test(value) ? 'number' : 'text')
  const { def, attributeKey } = r
  const num = Number(value)
  const notNumber = fail(`“${value}” isn’t a number`)
  if (attributeKey) {
    if (!Number.isFinite(num) || value === '') return notNumber
    const cur = state.base[def.id]
    const values = cur?.kind === 'attributeSet' ? { ...cur.values } : {}
    values[attributeKey] = num
    return one(c, { kind: 'set', statId: def.id, value: { kind: 'attributeSet', values } })
  }
  switch (def.type) {
    case 'number':
      if (!Number.isFinite(num) || value === '') return notNumber
      return one(c, { kind: 'set', statId: def.id, value: { kind: 'number', value: num } })
    case 'numberWithMax': {
      const m = value.match(new RegExp(`^(-?\\d+(?:\\.\\d+)?)(?:\\s*/\\s*${NUM})?$`))
      if (!m) return notNumber
      const cur = state.base[def.id]
      const max = m[2] !== undefined ? Number(m[2]) : cur?.kind === 'numberWithMax' ? cur.max : Number(m[1])
      return one(c, { kind: 'set', statId: def.id, value: { kind: 'numberWithMax', value: Number(m[1]), max } })
    }
    case 'text':
      return one(c, { kind: 'set', statId: def.id, value: { kind: 'text', value } })
    case 'rank': {
      const tiers = def.rankTiers ?? []
      const tier = tiers.find((t) => t.toLowerCase() === value.toLowerCase())
      if (!tier) return fail(`“${value}” isn’t a ${def.name} tier (${tiers.join(', ')})`)
      return one(c, { kind: 'rankChange', statId: def.id, direction: 'set', value: tier })
    }
    default:
      return fail(`Use +item / -item to change ${def.name}`)
  }
}

const SLOT_HINTS: Array<{ slot: RegExp; words: string[] }> = [
  {
    slot: /weapon|hand/,
    words: ['sword', 'blade', 'axe', 'bow', 'crossbow', 'dagger', 'knife', 'spear', 'staff', 'mace', 'hammer', 'club',
      'wand', 'rapier', 'scimitar', 'halberd', 'whip', 'sling', 'katana', 'glaive', 'pike', 'flail', 'saber', 'sabre'],
  },
  {
    slot: /armou?r|body|chest/,
    words: ['armor', 'armour', 'mail', 'plate', 'robe', 'robes', 'cloak', 'tunic', 'jerkin', 'vest', 'coat',
      'breastplate', 'shield', 'helm', 'helmet', 'gauntlets', 'boots', 'leathers'],
  },
  {
    slot: /accessor|ring|neck|trinket|jewel/,
    words: ['ring', 'amulet', 'necklace', 'pendant', 'charm', 'talisman', 'bracelet', 'earring', 'brooch', 'circlet',
      'trinket'],
  },
]

/** Slot for an item: a slot whose hint words appear in the name, else the first empty slot, else the first. */
function guessSlot(c: Character, state: CharacterState, itemName: string): string | undefined {
  const words = itemName.toLowerCase().split(/\s+/)
  for (const slot of c.equipmentSlots) {
    const hint = SLOT_HINTS.find((h) => h.slot.test(slot.toLowerCase()))
    if (hint && words.some((w) => hint.words.includes(w))) return slot
  }
  return c.equipmentSlots.find((s) => !state.equipped[s]) ?? c.equipmentSlots[0]
}

interface BodyRule {
  re: RegExp
  run: (m: RegExpMatchArray, c: Character, env: Env) => BodyResult | null
}

/** Ordered clause shapes; a rule returning null passes to the next one. */
const BODY_RULES: BodyRule[] = [
  {
    re: /^(?:gives?|hands?)\s+(.+)$/i,
    run: (m, giver, env) => {
      const target = matchCharacterPrefix(env.characters, m[1])
      if (!target) {
        const name = m[1].split(/\s+/)[0]
        return fail(`Unknown character “${name}”`, { kind: 'character', name })
      }
      const receiver = target.character
      if (!target.rest) return fail(`What does ${giver.name} give ${receiver.name}?`)
      return transfer(giver, receiver, target.rest, env)
    },
  },
  {
    re: /^(?:takes?|grabs?|withdraws?|retrieves?)\s+(.+?)\s+from\s+(.+)$/i,
    run: (m, receiver, env) => {
      const holder = findHolder(env, m[2])
      if ('error' in holder) return holder.error
      if (holder.character.id === receiver.id) return fail(`${receiver.name} can’t take from themself`)
      return transfer(holder.character, receiver, m[1], env)
    },
  },
  {
    re: /^(?:stash(?:es)?|stows?|deposits?)\s+(.+?)(?:\s+(?:in|into|with)\s+(?:the\s+)?(?:party|stash)(?:\s+stash)?)?$/i,
    run: (m, giver, env) => {
      const party = partyOf(env.characters)
      if (!party) return fail('No party stash yet', { kind: 'party', name: 'Party' })
      if (party.id === giver.id) return fail(`${giver.name} is the stash`)
      return transfer(giver, party, m[1], env)
    },
  },
  {
    re: /^(learns?|forgets?)\s+(?:(spell|skill)\s+)?(.+)$/i,
    run: (m, c, env) => {
      const state = env.stateOf(c)
      const name = m[3].trim()
      const kind = m[2]?.toLowerCase()
      const types: StatType[] = kind === 'skill' ? ['skillList'] : kind === 'spell' ? ['spellList'] : ['spellList', 'skillList']
      const owned = findOwned(c, state, name, types)
      if (m[1].toLowerCase().startsWith('forget')) {
        const def = owned?.def ?? firstOfType(c, ...types)
        if (!def) return fail(`${c.name} has no spells or skills`)
        return one(c, { kind: 'itemRemove', statId: def.id, name: owned?.name ?? name })
      }
      const def = owned?.def ?? firstOfType(c, ...types)
      if (!def || (def.type !== 'spellList' && def.type !== 'skillList')) {
        const skill = kind === 'skill'
        return fail(`${c.name} has no ${skill ? 'skill' : 'spell'} list`, {
          kind: 'stat',
          characterId: c.id,
          name: skill ? 'Skills' : 'Spells',
          type: skill ? 'skillList' : 'spellList',
        })
      }
      return one(c, { kind: 'itemAdd', statId: def.id, name: owned?.name ?? name, fields: defaultItemFields(def.type) })
    },
  },
  {
    re: /^unequips?\s+(.+)$/i,
    run: (m, c, env) => {
      const arg = lower(m[1])
      const slot = c.equipmentSlots.find((s) => s.toLowerCase() === arg)
      if (slot) return one(c, { kind: 'unequip', slot })
      const equipped = env.stateOf(c).equipped
      const bySlot = Object.keys(equipped).find((s) => {
        const it = equipped[s]
        return (it.itemName ?? '').toLowerCase() === arg || it.itemId.toLowerCase() === arg
      })
      if (bySlot) return one(c, { kind: 'unequip', slot: bySlot })
      return fail(`${c.name} has no slot or equipped item “${m[1].trim()}”`)
    },
  },
  {
    re: /^(?:equips?|wields?|wears?|dons?)\s+(.+)$/i,
    run: (m, c, env) => {
      if (c.equipmentSlots.length === 0) return fail(`${c.name} has no equipment slots`)
      let name = m[1].trim()
      let slot: string | undefined
      const explicit = name.match(/^(.+?)\s+(?:as|in|to|on|into)\s+(?:the\s+|a\s+|my\s+|his\s+|her\s+|their\s+)?(.+?)(?:\s+slot)?$/i)
      if (explicit) {
        const s = c.equipmentSlots.find((x) => x.toLowerCase() === lower(explicit[2]))
        if (s) {
          slot = s
          name = explicit[1].trim()
        }
      }
      const cat = findCatalogItem(env.catalog, name)
      if (cat) {
        name = cat.name
        const catSlot = cat.slot?.trim().toLowerCase()
        if (!slot && catSlot) slot = c.equipmentSlots.find((x) => x.toLowerCase() === catSlot)
      }
      slot ??= guessSlot(c, env.stateOf(c), name)
      if (!slot) return fail(`${c.name} has no equipment slots`)
      const modifiers = cat ? resolveCatalogModifiers(cat, c) : []
      return one(c, { kind: 'equip', slot, itemId: name, itemName: name, modifiers })
    },
  },
  {
    re: /^(?:(?:loses?|removes?|ends?|drops?)\s+buff|-\s*buff)\s+(.+)$/i,
    run: (m, c, env) => {
      const n = lower(m[1])
      const active = env.stateOf(c).activeBuffs.find(
        (b) => (b.buffName ?? '').toLowerCase() === n || b.buffId.toLowerCase() === n,
      )
      return one(c, { kind: 'buffRemove', buffId: active?.buffId ?? m[1].trim() })
    },
  },
  {
    re: /^(?:buff|gains?\s+buff|\+\s*buff)\s+(.+?)(?:\s+(?:for\s+)?(\d+)(?:\s+markers?)?)?$/i,
    run: (m, c, env) => {
      const name = m[1].trim()
      const active = env.stateOf(c).activeBuffs.find((b) => (b.buffName ?? b.buffId).toLowerCase() === name.toLowerCase())
      const op: StatDeltaOp = { kind: 'buffApply', buffId: active?.buffId ?? name, buffName: name, modifiers: [] }
      if (m[2]) op.expiresAfter = Number(m[2])
      return one(c, op)
    },
  },
  {
    re: /^(?:fill|fills|refill|refills|restore|restores)\s+(.+)$/i,
    run: (m, c) => {
      const r = resolveStat(c, m[1])
      if (!r) return noStat(c, m[1].trim(), 'numberWithMax')
      if (r.def.type !== 'numberWithMax') return fail(`${r.def.name} has no max to fill to`)
      return one(c, { kind: 'fill', statId: r.def.id })
    },
  },
  {
    re: /^(?:set\s+)?(.+?)\s*=\s*(.+)$/i,
    run: (m, c, env) => setStat(c, env.stateOf(c), m[1], m[2]),
  },
  {
    re: /^set\s+(.+?)\s+to\s+(.+)$/i,
    run: (m, c, env) => setStat(c, env.stateOf(c), m[1], m[2]),
  },
  {
    re: new RegExp(`^max\\s+(.+?)\\s*([+-])\\s*${NUM}$`, 'i'),
    run: (m, c) => maxAdjust(c, m[1], (m[2] === '-' ? -1 : 1) * Number(m[3])),
  },
  {
    re: new RegExp(`^([+-])\\s*${NUM}\\s+max\\s+(.+)$`, 'i'),
    run: (m, c) => maxAdjust(c, m[3], (m[1] === '-' ? -1 : 1) * Number(m[2])),
  },
  {
    // ±<coins> ("+2g 50s", "-30 copper") — unless the words name a stat ("+200 Gold")
    re: /^([+-])\s*(\d.*)$/,
    run: (m, c, env) => {
      const named = m[2].match(new RegExp(`^${NUM}\\s+(.+)$`))
      if (named && resolveStat(c, named[2])) return null
      const units = parseCoins(m[2], env.currency)
      if (units === null) return null
      const def = currencyStatOf(c, env.currency)
      if (!def) return noCoinHome(c)
      return one(c, { kind: 'adjust', statId: def.id, delta: (m[1] === '-' ? -1 : 1) * unitsToStatAmount(units, def, env.currency) })
    },
  },
  {
    // ±N <stat | attribute | item>
    re: new RegExp(`^([+-])\\s*${NUM}\\s+(.+)$`),
    run: (m, c, env) => {
      const n = Number(m[2])
      const sign = m[1] === '-' ? -1 : 1
      const r = resolveStat(c, m[3])
      if (r) return adjustStat(c, r, sign * n, m[3].trim())
      const state = env.stateOf(c)
      return sign < 0 ? loseItem(c, state, m[3], n) : gainItem(c, state, m[3], n)
    },
  },
  {
    // <stat | attribute | owned item> ±N
    re: new RegExp(`^(.+?)\\s*([+-])\\s*${NUM}$`),
    run: (m, c, env) => {
      const sign = m[2] === '-' ? -1 : 1
      const n = Number(m[3])
      const r = resolveStat(c, m[1])
      if (r) return adjustStat(c, r, sign * n, m[1].trim())
      const state = env.stateOf(c)
      if (findOwned(c, state, m[1])) return sign < 0 ? loseItem(c, state, m[1], n) : gainItem(c, state, m[1], n)
      return noStat(c, m[1].trim(), 'number')
    },
  },
  {
    re: /^(.+?)\s+(up|down)$/i,
    run: (m, c) => {
      const name = lower(m[1])
      const direction = m[2].toLowerCase() === 'up' ? 'up' : 'down'
      const r = resolveStat(c, m[1])
      if (r && r.def.type === 'rank') return one(c, { kind: 'rankChange', statId: r.def.id, direction })
      if (name === 'rank' || name === 'ranks') {
        return fail(`${c.name} has no rank`, { kind: 'stat', characterId: c.id, name: 'Rank', type: 'rank' })
      }
      return null
    },
  },
  {
    // <list stat> ±[N] <item> — names the list explicitly ("Status Effects +Poisoned")
    re: new RegExp(`^(.+?)\\s+([+-])\\s*(?:${NUM}\\s+)?(\\D.*)$`),
    run: (m, c, env) => {
      const r = resolveStat(c, m[1])
      if (!r || r.attributeKey || !ITEM_LIST_TYPES.includes(r.def.type)) return null
      const n = m[3] ? Number(m[3]) : 1
      const state = env.stateOf(c)
      return m[2] === '-' ? loseItem(c, state, m[4], n, r.def) : gainItem(c, state, m[4], n, r.def)
    },
  },
  {
    re: /^([+-])\s*(.+)$/,
    run: (m, c, env) => {
      const name = m[2].trim()
      const r = resolveStat(c, name)
      if (r && !ITEM_LIST_TYPES.includes(r.def.type)) return fail(`Say how much: “${m[1]}5 ${r.attributeKey ?? r.def.name}”`)
      const state = env.stateOf(c)
      return m[1] === '-' ? loseItem(c, state, name, 1) : gainItem(c, state, name, 1)
    },
  },
]

function noCoinHome(c: Character): BodyResult {
  return fail(`${c.name} has nowhere to keep coins`, {
    kind: 'stat',
    characterId: c.id,
    name: 'Coins',
    type: 'number',
    currency: true,
  })
}

/** Slot holding an item called `name` (case-insensitive), if equipped. */
function equippedSlotOf(state: CharacterState, name: string): { slot: string; name: string } | null {
  const n = lower(name)
  for (const [slot, it] of Object.entries(state.equipped)) {
    const label = it.itemName ?? it.itemId
    if (label.toLowerCase() === n || it.itemId.toLowerCase() === n) return { slot, name: label }
  }
  return null
}

/** A character named exactly `name`, or the party stash for "party" / "stash". */
function findHolder(env: Env, raw: string): { character: Character } | { error: BodyResult } {
  const name = raw.trim()
  const n = name.toLowerCase()
  const exact = env.characters.find((c) => c.name.toLowerCase() === n)
  if (exact) return { character: exact }
  if (PARTY_NAME_RE.test(name)) {
    const party = partyOf(env.characters)
    if (party) return { character: party }
    return { error: fail('No party stash yet', { kind: 'party', name: 'Party' }) }
  }
  return { error: fail(`Unknown character “${name}”`, { kind: 'character', name }) }
}

/**
 * Move `[N] <thing>` from giver to receiver: a number stat, coins, or an
 * item. Giving away the last of an equipped item unequips it first.
 */
function transfer(giver: Character, receiver: Character, rest: string, env: Env): BodyResult {
  const counted = rest.match(new RegExp(`^${NUM}\\s+(.+)$`))
  const n = counted ? Number(counted[1]) : 1
  const thing = counted ? counted[2] : rest
  const stat = resolveStat(giver, thing)
  if (stat && !stat.attributeKey && (stat.def.type === 'number' || stat.def.type === 'numberWithMax')) {
    const theirs = resolveStat(receiver, thing)
    if (!theirs || theirs.attributeKey || (theirs.def.type !== 'number' && theirs.def.type !== 'numberWithMax')) {
      return noStat(receiver, stat.def.name, 'number')
    }
    return {
      ops: [
        { characterId: giver.id, op: { kind: 'adjust', statId: stat.def.id, delta: -n } },
        { characterId: receiver.id, op: { kind: 'adjust', statId: theirs.def.id, delta: n } },
      ],
    }
  }
  const units = stat ? null : parseCoins(rest, env.currency)
  if (units !== null) {
    const from = currencyStatOf(giver, env.currency)
    if (!from) return noCoinHome(giver)
    const to = currencyStatOf(receiver, env.currency)
    if (!to) return noCoinHome(receiver)
    return {
      ops: [
        { characterId: giver.id, op: { kind: 'adjust', statId: from.id, delta: -unitsToStatAmount(units, from, env.currency) } },
        { characterId: receiver.id, op: { kind: 'adjust', statId: to.id, delta: unitsToStatAmount(units, to, env.currency) } },
      ],
    }
  }
  const state = env.stateOf(giver)
  const owned = findOwned(giver, state, thing)
  const equipped = equippedSlotOf(state, owned?.name ?? thing)
  const itemName = owned?.name ?? equipped?.name ?? thing.trim()
  const ops: QuickEntryOp[] = []
  const warnings: Array<string | undefined> = []
  if (equipped && (!owned || owned.qty <= n)) {
    ops.push({ characterId: giver.id, op: { kind: 'unequip', slot: equipped.slot } })
    warnings.push(undefined)
  }
  if (owned || !equipped) {
    const loss = loseItem(giver, state, itemName, n)
    if (loss.error) return loss
    ops.push(...loss.ops)
    warnings.push(...(loss.warnings ?? loss.ops.map(() => undefined)))
  }
  const gain = gainItem(receiver, env.stateOf(receiver), itemName, n)
  if (gain.error) return gain
  ops.push(...gain.ops)
  warnings.push(...(gain.warnings ?? gain.ops.map(() => undefined)))
  return { ops, warnings }
}

const MAX_MACRO_DEPTH = 4

/** The macro `text` names for `c`: the character's own first, else a global one. */
function findMacro(env: Env, c: Character, text: string): QuickMacro | undefined {
  const n = lower(text)
  const named = env.macros.filter((m) => lower(m.name) === n && m.body.trim())
  return named.find((m) => m.characterId === c.id) ?? named.find((m) => !m.characterId)
}

/** Run a macro's clauses for `c`, each seeing the ones before it. */
function expandMacro(macro: QuickMacro, c: Character, env: Env): BodyResult {
  if (env.depth >= MAX_MACRO_DEPTH) return fail(`“${macro.name}” calls itself too many times`)
  const overlay = new Map<string, CharacterState>()
  const sub: Env = {
    ...env,
    depth: env.depth + 1,
    stateOf: (ch) => overlay.get(ch.id) ?? env.stateOf(ch),
  }
  const ops: QuickEntryOp[] = []
  const warnings: Array<string | undefined> = []
  let current = c
  for (const { text: raw } of splitClauses(normalizeDashes(macro.body))) {
    const text = raw.replace(/\s+/g, ' ')
    const named = matchCharacterPrefix(env.characters, text)
    if (named) current = named.character
    const res = parseBody(named ? named.rest : text, current, sub)
    if (res.error) return fail(`In “${macro.name}”: ${res.error}`)
    res.ops.forEach((entry, i) => {
      const ch = env.characters.find((x) => x.id === entry.characterId)
      if (ch) overlay.set(ch.id, applyDeltaOpWithDefs(sub.stateOf(ch), entry.op, ch.stats))
      ops.push(entry)
      warnings.push(res.warnings?.[i])
    })
  }
  if (ops.length === 0) return fail(`“${macro.name}” is empty`)
  return { ops, warnings }
}

function maxAdjust(c: Character, name: string, delta: number): BodyResult {
  const r = resolveStat(c, name)
  if (!r) return noStat(c, name.trim(), 'numberWithMax')
  if (r.def.type !== 'numberWithMax') return fail(`${r.def.name} has no max`)
  return one(c, { kind: 'maxAdjust', statId: r.def.id, delta })
}

function parseBody(body: string, c: Character, env: Env): BodyResult {
  const text = body.replace(/\s+/g, ' ').trim()
  if (!text) return fail(`What happened to ${c.name}?`)
  const macro = findMacro(env, c, text)
  if (macro) return expandMacro(macro, c, env)
  for (const rule of BODY_RULES) {
    const m = text.match(rule.re)
    if (!m) continue
    const res = rule.run(m, c, env)
    if (res) return res
  }
  return fail(`Can’t read “${text}”`)
}

/**
 * Does `text` read as "<unknown name> <valid clause>"? Tried against a
 * hypothetical default character so "Bob -15 HP" is recognised as a new
 * character rather than an unreadable clause.
 */
function unknownCharacterSplit(text: string, env: Env): string | null {
  const words = text.split(/\s+/)
  for (let k = 1; k <= Math.min(3, words.length - 1); k++) {
    const name = words.slice(0, k).join(' ')
    if (!/^[\p{L}]/u.test(name)) return null
    const ghost = createDefaultCharacter(name)
    const ghostState: CharacterState = { base: ghost.baseValues, equipped: {}, activeBuffs: [] }
    const res = parseBody(words.slice(k).join(' '), ghost, {
      ...env,
      stateOf: (ch) => (ch.id === ghost.id ? ghostState : env.stateOf(ch)),
    })
    if (!res.error) return name
  }
  return null
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/** Clause ranges of `input`, split on commas, trimmed, empties dropped. */
function splitClauses(input: string): Array<{ text: string; from: number; to: number }> {
  const out: Array<{ text: string; from: number; to: number }> = []
  let start = 0
  for (let i = 0; i <= input.length; i++) {
    if (i < input.length && input[i] !== ',') continue
    const raw = input.slice(start, i)
    const lead = raw.length - raw.trimStart().length
    const text = raw.trim()
    if (text) out.push({ text, from: start + lead, to: start + lead + text.length })
    start = i + 1
  }
  return out
}

/** Unicode minus and dashes read as "-"; same length so offsets hold. */
function normalizeDashes(s: string): string {
  return s.replace(/[−–—]/g, '-')
}

export function parseQuickEntry(input: string, ctx: QuickEntryContext): QuickEntryResult {
  const working = new Map<string, CharacterState>()
  const empty: CharacterState = { base: {}, equipped: {}, activeBuffs: [] }
  const env: Env = {
    characters: ctx.characters,
    catalog: ctx.catalog ?? [],
    macros: ctx.macros ?? [],
    currency: ctx.currency ?? DEFAULT_CURRENCY,
    depth: 0,
    stateOf: (c) => {
      let s = working.get(c.id)
      if (!s) {
        s = ctx.stateFor(c.id) ?? { ...empty, base: c.baseValues }
        working.set(c.id, s)
      }
      return s
    },
  }
  const byId = new Map(ctx.characters.map((c) => [c.id, c]))
  let current: Character | null = (ctx.defaultCharacterId && byId.get(ctx.defaultCharacterId)) || null

  const clauses: ParsedClause[] = []
  const allOps: QuickEntryOp[] = []
  for (const { text: rawText, from, to } of splitClauses(normalizeDashes(input))) {
    const text = rawText.replace(/\s+/g, ' ')
    const clause: ParsedClause = { text: input.slice(from, to), from, to, ops: [], preview: [] }
    clauses.push(clause)

    let res: BodyResult
    const named = matchCharacterPrefix(ctx.characters, text)
    if (named) {
      current = named.character
      res = parseBody(named.rest, current, env)
    } else {
      const attempt = current ? parseBody(text, current, env) : null
      if (attempt && !attempt.error) {
        res = attempt
      } else {
        const unknown = unknownCharacterSplit(text, env)
        if (unknown && PARTY_NAME_RE.test(unknown)) res = fail('No party stash yet', { kind: 'party', name: unknown })
        else if (unknown) res = fail(`Unknown character “${unknown}”`, { kind: 'character', name: unknown })
        else if (attempt) res = attempt
        else res = fail(`Start with a character name, e.g. “${ctx.characters[0]?.name ?? 'Kael'} ${text}”`)
      }
    }

    if (res.error) {
      clause.error = res.error
      clause.create = res.create
      continue
    }
    res.ops.forEach((entry, i) => {
      const character = byId.get(entry.characterId)
      if (!character) return
      const { row, after } = previewOp(character, env.stateOf(character), entry.op, {
        catalog: env.catalog,
        currency: env.currency,
      })
      const extra = res.warnings?.[i]
      if (extra) row.warning = extra
      working.set(character.id, after)
      clause.preview.push(row)
    })
    clause.ops = res.ops
    allOps.push(...res.ops)
  }

  return {
    clauses,
    ops: allOps,
    ok: allOps.length > 0 && clauses.every((c) => !c.error),
    lastCharacterId: current?.id ?? null,
  }
}

// ---------------------------------------------------------------------------
// Autocomplete
// ---------------------------------------------------------------------------

export interface QuickEntryCompletion {
  from: number
  to: number
  options: string[]
}

const VERBS = ['learns', 'forgets', 'equips', 'unequips', 'buff', 'lose buff', 'gives', 'takes', 'stashes', 'fill', 'rank up', 'rank down', 'max']
const MAX_OPTIONS = 8

/**
 * Completions for the phrase ending at `caret`: character names, the current
 * character's stats / attribute keys / slots / buffs, items anyone owns, and
 * clause verbs. The longest trailing run of words (up to 4) that prefixes a
 * candidate wins, so multi-word item names complete as a whole.
 */
export function quickEntryCompletions(
  input: string,
  caret: number,
  ctx: QuickEntryContext,
): QuickEntryCompletion | null {
  const before = normalizeDashes(input.slice(0, caret))
  const clauseStart = before.lastIndexOf(',') + 1
  const clause = before.slice(clauseStart)
  if (!clause.trim() || /\s$/.test(clause)) return null

  // Character in scope: named at the start of this clause, else carried over.
  const prior = parseQuickEntry(input.slice(0, clauseStart), ctx).lastCharacterId ?? ctx.defaultCharacterId ?? null
  const named = matchCharacterPrefix(ctx.characters, clause.trimStart())
  const character = named?.character ?? ctx.characters.find((c) => c.id === prior)

  const pool: string[] = []
  const add = (s: string) => {
    if (s && !pool.some((p) => p.toLowerCase() === s.toLowerCase())) pool.push(s)
  }
  ctx.characters.forEach((c) => add(c.name))
  if (character) {
    const state = ctx.stateFor(character.id)
    for (const s of character.stats) {
      add(s.name)
      if (s.type === 'attributeSet') (s.attributeKeys ?? []).forEach(add)
    }
    character.equipmentSlots.forEach(add)
    state?.activeBuffs.forEach((b) => add(b.buffName ?? b.buffId))
  }
  for (const c of ctx.characters) {
    const state = ctx.stateFor(c.id)
    if (!state) continue
    for (const s of c.stats) {
      if (ITEM_LIST_TYPES.includes(s.type)) itemsOf(state.base[s.id]).forEach((it) => add(it.name))
    }
  }
  ;(ctx.catalog ?? []).forEach((it) => add(it.name))
  for (const m of ctx.macros ?? []) {
    if (!m.characterId || m.characterId === character?.id) add(m.name)
  }
  VERBS.forEach(add)

  // Word starts within the clause (a leading +/- or count isn't part of a name).
  const starts: number[] = []
  const wordRe = /\S+/g
  let m: RegExpExecArray | null
  while ((m = wordRe.exec(clause)) !== null) {
    const lead = m[0].match(/^[+-]?(?:\d+(?:\.\d+)?)?/)?.[0].length ?? 0
    starts.push(m.index + (lead < m[0].length ? lead : 0))
  }
  for (let k = Math.min(4, starts.length); k >= 1; k--) {
    const start = starts[starts.length - k]
    const tail = clause.slice(start).toLowerCase()
    if (!tail || /^[+-]?\d/.test(tail)) continue
    const options = pool.filter((p) => p.toLowerCase().startsWith(tail) && p.toLowerCase() !== tail)
    if (options.length > 0) {
      return { from: clauseStart + start, to: caret, options: options.slice(0, MAX_OPTIONS) }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Create-on-mention and op → text (for editing a recorded op as quick entry)
// ---------------------------------------------------------------------------

/** Definition + starting value for a stat created from a "Create …" suggestion. */
export function statForSuggestion(
  name: string,
  type: StatType,
  existingIds: string[],
): { def: StatDefinition; value: StatValue } {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'stat'
  let id = slug
  for (let i = 2; existingIds.includes(id); i++) id = `${slug}_${i}`
  const def: StatDefinition = { id, name, type }
  switch (type) {
    case 'number':
      return { def, value: { kind: 'number', value: 0 } }
    case 'numberWithMax':
      return { def, value: { kind: 'numberWithMax', value: 10, max: 10 } }
    case 'text':
      return { def, value: { kind: 'text', value: '' } }
    case 'list':
      return { def, value: { kind: 'list', items: [] } }
    case 'attributeSet':
      return { def: { ...def, attributeKeys: [] }, value: { kind: 'attributeSet', values: {} } }
    case 'rank':
      return { def: { ...def, rankTiers: [...DEFAULT_RANK_TIERS] }, value: { kind: 'rank', tier: DEFAULT_RANK_TIERS[0] } }
    case 'inventory':
    case 'spellList':
    case 'skillList':
      return { def, value: { kind: type, items: [] } }
  }
}

function signedText(n: number): string {
  return n < 0 ? `-${Math.abs(n)}` : `+${n}`
}

function sameFields(a: Record<string, number>, b: Record<string, number>): boolean {
  const ak = Object.keys(a)
  return ak.length === Object.keys(b).length && ak.every((k) => a[k] === b[k])
}

/**
 * Quick-entry text that parses back to `op` against `state` (the character's
 * state just before the op), or null when the op carries detail the grammar
 * can't express (modifiers, custom ids, whole attribute sets).
 */
export function opToQuickEntry(
  op: StatDeltaOp,
  character: Character,
  state: CharacterState,
  catalog?: CatalogItem[],
): string | null {
  const who = character.name
  const def = (id: string) => character.stats.find((s) => s.id === id)
  const stat = (id: string) => def(id)?.name ?? id
  const text = (body: string | null) => (body === null || /,/.test(body) || /,/.test(who) ? null : `${who} ${body}`)
  switch (op.kind) {
    case 'adjust':
      return text(`${signedText(op.delta)} ${op.attributeKey ?? stat(op.statId)}`)
    case 'maxAdjust':
      return text(`max ${stat(op.statId)} ${signedText(op.delta)}`)
    case 'fill':
      return text(`fill ${stat(op.statId)}`)
    case 'set': {
      const v = op.value
      if (v.kind === 'number') return text(`${stat(op.statId)} = ${v.value}`)
      if (v.kind === 'numberWithMax') return text(`${stat(op.statId)} = ${v.value}/${v.max}`)
      if (v.kind === 'text' && v.value.trim() === v.value && v.value) return text(`${stat(op.statId)} = ${v.value}`)
      if (v.kind === 'rank') return text(`${stat(op.statId)} = ${v.tier}`)
      return null
    }
    case 'rankChange':
      return op.direction === 'set'
        ? text(`${stat(op.statId)} = ${op.value ?? ''}`)
        : text(`${stat(op.statId)} ${op.direction}`)
    case 'listAdd':
    case 'listRemove': {
      if (op.items.length === 0) return null
      const sign = op.kind === 'listAdd' ? '+' : '-'
      const body = op.items
        .map((raw) => {
          const { name, qty } = parseQty(raw)
          return `${stat(op.statId)} ${sign}${qty > 1 ? `${qty} ` : ''}${name}`
        })
        .join(', ')
      return text(body)
    }
    case 'itemAdd': {
      const d = def(op.statId)
      if (!d) return null
      if (d.type === 'spellList' || d.type === 'skillList') {
        if (!sameFields(op.fields, defaultItemFields(d.type))) return null
        const kind = firstOfType(character, 'spellList', 'skillList')?.id === d.id ? '' : d.type === 'skillList' ? 'skill ' : 'spell '
        return text(`learns ${kind}${op.name}`)
      }
      if (d.type !== 'inventory' || Object.keys(op.fields).some((k) => k !== 'qty')) return null
      if (findOwned(character, state, op.name)) return null
      const qty = op.fields.qty ?? 1
      return text(`${stat(op.statId)} +${qty > 1 ? `${qty} ` : ''}${op.name}`)
    }
    case 'itemRemove': {
      const d = def(op.statId)
      if (!d) return null
      if (d.type === 'spellList' || d.type === 'skillList') return text(`forgets ${op.name}`)
      const owned = findOwned({ ...character, stats: [d] }, state, op.name)
      const qty = owned?.qty ?? 1
      return text(`${stat(op.statId)} -${qty > 1 ? `${qty} ` : ''}${op.name}`)
    }
    case 'itemFieldAdjust': {
      const d = def(op.statId)
      if (d?.type !== 'inventory' || op.field !== 'qty') return null
      const owned = findOwned({ ...character, stats: [d] }, state, op.name)
      if (!owned || (op.delta < 0 && owned.qty <= -op.delta)) return null
      return text(`${stat(op.statId)} ${signedText(op.delta)} ${op.name}`)
    }
    case 'equip': {
      if ((op.itemName ?? op.itemId) !== op.itemId) return null
      // Re-parsing pulls modifiers from the catalog, so they must match it exactly.
      const cat = findCatalogItem(catalog, op.itemId)
      if (cat && cat.name !== op.itemId) return null
      const fromCatalog = cat ? resolveCatalogModifiers(cat, character) : []
      if (JSON.stringify(op.modifiers) !== JSON.stringify(fromCatalog)) return null
      return text(`equips ${op.itemId} as ${op.slot}`)
    }
    case 'unequip':
      return text(`unequips ${op.slot}`)
    case 'buffApply': {
      const name = op.buffName ?? op.buffId
      if (op.modifiers.length > 0 || name !== op.buffId) return null
      const clash = state.activeBuffs.some((b) => (b.buffName ?? b.buffId).toLowerCase() === name.toLowerCase() && b.buffId !== op.buffId)
      if (clash) return null
      return text(`buff ${name}${op.expiresAfter ? ` ${op.expiresAfter}` : ''}`)
    }
    case 'buffRemove': {
      const active = state.activeBuffs.find((b) => b.buffId === op.buffId)
      const name = active?.buffName ?? op.buffId
      const resolves = state.activeBuffs.find((b) => (b.buffName ?? '').toLowerCase() === name.toLowerCase() || b.buffId.toLowerCase() === name.toLowerCase())
      return text(`lose buff ${resolves?.buffId === op.buffId || !resolves ? name : op.buffId}`)
    }
  }
}

import type { Character, StatDefinition, StatListItem, StatType, StatValue } from '../types'
import { formatQty, parseQty, parseQtyLoose } from './characterState'

/**
 * Parse a pasted LitRPG status window ("HP: 40/50, MP 10/20, STR 12 DEX 9,
 * Level 3, Inventory: Healing Potion x2, Rope") into typed stats, then merge
 * it into a character sheet. Pure; no store access.
 */

export interface ParsedStatEntry {
  /** Canonical display label ("HP", "Level", "Inventory", or as typed). */
  label: string
  def: Omit<StatDefinition, 'id'>
  value: StatValue
}

export interface ParsedStatusWindow {
  /** From a "Name: …" line. */
  name?: string
  entries: ParsedStatEntry[]
}

const DEFAULT_TIERS = ['F', 'E', 'D', 'C', 'B', 'A', 'S']

/** Number-stat aliases → canonical label. */
const SCALAR_ALIASES: Record<string, string> = {
  hp: 'HP', health: 'HP', 'hit points': 'HP', life: 'HP',
  mp: 'MP', mana: 'MP', 'magic points': 'MP',
  sp: 'Stamina', stamina: 'Stamina', stam: 'Stamina',
  level: 'Level', lv: 'Level', lvl: 'Level',
  xp: 'XP', exp: 'XP', experience: 'XP',
  gold: 'Gold', coins: 'Gold', money: 'Gold',
}

/** Attribute words and abbreviations → attribute key. */
const ATTRIBUTE_ALIASES: Record<string, string> = {
  strength: 'STR', dexterity: 'DEX', constitution: 'CON', intelligence: 'INT', wisdom: 'WIS',
  charisma: 'CHA', agility: 'AGI', vitality: 'VIT', endurance: 'END', perception: 'PER',
  luck: 'LUCK', speed: 'SPD', willpower: 'WIL', spirit: 'SPI',
}
const NOT_ATTRIBUTES = new Set(['HP', 'MP', 'SP', 'XP', 'EXP', 'LV', 'LVL', 'AC'])

/** List labels → canonical label and stat type. */
const LIST_LABELS: Record<string, { label: string; type: StatType }> = {
  inventory: { label: 'Inventory', type: 'inventory' },
  items: { label: 'Inventory', type: 'inventory' },
  bag: { label: 'Inventory', type: 'inventory' },
  backpack: { label: 'Inventory', type: 'inventory' },
  loot: { label: 'Inventory', type: 'inventory' },
  skills: { label: 'Skills', type: 'skillList' },
  abilities: { label: 'Skills', type: 'skillList' },
  spells: { label: 'Spells', type: 'spellList' },
  'status effects': { label: 'Status Effects', type: 'list' },
  status: { label: 'Status Effects', type: 'list' },
  effects: { label: 'Status Effects', type: 'list' },
  conditions: { label: 'Status Effects', type: 'list' },
  buffs: { label: 'Status Effects', type: 'list' },
  titles: { label: 'Titles', type: 'list' },
  traits: { label: 'Traits', type: 'list' },
  perks: { label: 'Perks', type: 'list' },
  equipment: { label: 'Equipment', type: 'list' },
}
const RANK_LABELS = new Set(['rank', 'grade', 'tier'])

const LIST_LABEL_SOURCE = Object.keys(LIST_LABELS)
  .sort((a, b) => b.length - a.length)
  .map((k) => k.replace(' ', '\\s+'))
  .join('|')
const LIST_LABEL_RE = new RegExp(`(^|[,;|]\\s*)(${LIST_LABEL_SOURCE})\\s*:`, 'i')
/** Where a list value stops: `;`, `|`, or a comma before another `Label:`. */
const LIST_END_RE = /[;|]|,(?=\s*[A-Za-z][A-Za-z ]{0,24}:)/

function cleanLabel(raw: string): string {
  return raw.replace(/[.]+$/, '').replace(/\s+/g, ' ').trim()
}

function attributeKey(label: string): string | undefined {
  const alias = ATTRIBUTE_ALIASES[label.toLowerCase()]
  if (alias) return alias
  if (/^[A-Z]{2,4}$/.test(label) && !NOT_ATTRIBUTES.has(label)) return label
  return undefined
}

function splitTopLevel(value: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of value) {
    if (ch === '(' || ch === '[') depth++
    if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) { out.push(cur); cur = '' } else cur += ch
  }
  out.push(cur)
  return out.map((s) => s.replace(/^\s*[-•*·]\s+/, '').trim()).filter(Boolean)
}

/** "Fireball (Lv 2, 10 MP)" → name + level/mana fields. */
function abilityItem(raw: string, withCost: boolean): StatListItem {
  const paren = raw.match(/^(.*?)\s*\((.*)\)\s*$/)
  let name = paren ? paren[1] : raw
  const details = paren ? paren[2] : ''
  let level = 1
  let mana = 0
  const lvInName = name.match(/^(.*?)\s+(?:lv\.?|lvl\.?|level)\s*(\d+)$/i)
  if (lvInName) { name = lvInName[1]; level = parseInt(lvInName[2], 10) }
  const lv = details.match(/(?:lv\.?|lvl\.?|level)\s*(\d+)/i)
  if (lv) level = parseInt(lv[1], 10)
  const cost = details.match(/(\d+)\s*(?:mp|mana)\b/i) ?? details.match(/cost\s*:?\s*(\d+)/i)
  if (cost) mana = parseInt(cost[1], 10)
  return { name: name.trim(), fields: withCost ? { level, mana } : { level } }
}

function listValue(type: StatType, items: string[]): StatValue {
  switch (type) {
    case 'inventory':
      return { kind: 'inventory', items: items.map((raw) => { const p = parseQtyLoose(raw); return { name: p.name, fields: { qty: p.qty } } }) }
    case 'spellList':
      return { kind: 'spellList', items: items.map((raw) => abilityItem(raw, true)) }
    case 'skillList':
      return { kind: 'skillList', items: items.map((raw) => abilityItem(raw, false)) }
    default:
      return { kind: 'list', items }
  }
}

class Collector {
  name?: string
  entries: ParsedStatEntry[] = []
  private listItems = new Map<string, string[]>()

  private put(entry: ParsedStatEntry): void {
    const i = this.entries.findIndex((e) => e.label === entry.label)
    if (i >= 0) this.entries[i] = entry
    else this.entries.push(entry)
  }

  addList(label: string, type: StatType, items: string[]): void {
    const all = [...(this.listItems.get(label) ?? []), ...items]
    this.listItems.set(label, all)
    this.put({ label, def: { name: label, type }, value: listValue(type, all) })
  }

  addAttribute(key: string, n: number): void {
    const existing = this.entries.find((e) => e.label === 'Attributes')
    const values = existing?.value.kind === 'attributeSet' ? { ...existing.value.values } : {}
    values[key] = n
    const entry: ParsedStatEntry = {
      label: 'Attributes',
      def: { name: 'Attributes', type: 'attributeSet', attributeKeys: Object.keys(values) },
      value: { kind: 'attributeSet', values },
    }
    this.put(entry)
  }

  addNumber(rawLabel: string, n: number, max: number | undefined): void {
    const label = cleanLabel(rawLabel)
    if (!label || label.split(' ').length > 3) return
    const attr = attributeKey(label)
    if (attr && max === undefined) { this.addAttribute(attr, n); return }
    const canonical = SCALAR_ALIASES[label.toLowerCase()] ?? label
    this.put(
      max === undefined
        ? { label: canonical, def: { name: canonical, type: 'number' }, value: { kind: 'number', value: n } }
        : { label: canonical, def: { name: canonical, type: 'numberWithMax' }, value: { kind: 'numberWithMax', value: n, max } },
    )
  }

  addText(rawLabel: string, value: string): void {
    const label = cleanLabel(rawLabel)
    const key = label.toLowerCase()
    if (!label || label.split(' ').length > 3) return
    if (key === 'name') { this.name = value; return }
    if (RANK_LABELS.has(key) && value.length <= 3) {
      const tiers = DEFAULT_TIERS.includes(value) ? [...DEFAULT_TIERS] : [...DEFAULT_TIERS, value]
      this.put({ label, def: { name: label, type: 'rank', rankTiers: tiers }, value: { kind: 'rank', tier: value } })
      return
    }
    this.put({ label, def: { name: label, type: 'text' }, value: { kind: 'text', value } })
  }
}

const PAIR_RE = /([A-Za-z][A-Za-z.'_ ]*?)\s*[:=]?\s*(-?\d+(?:\.\d+)?)(?:\s*\/\s*(-?\d+(?:\.\d+)?))?(?![\w/])/g

function parseScalars(text: string, out: Collector): void {
  for (const piece of text.split(/[,;|]/)) {
    const p = piece.trim()
    if (!p) continue
    const textMatch = p.match(/^([A-Za-z][A-Za-z .'_-]*?)\s*:\s*([^\d\s-].*)$/)
    if (textMatch && !/\d/.test(textMatch[2])) {
      out.addText(textMatch[1], textMatch[2].trim())
      continue
    }
    PAIR_RE.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = PAIR_RE.exec(p)) !== null) {
      out.addNumber(m[1], Number(m[2]), m[3] === undefined ? undefined : Number(m[3]))
    }
  }
}

function normalizeLine(line: string): string {
  return line
    .replace(/[─-╿【】「」『』]/g, ' ')
    .replace(/[[\]]/g, ' ')
    .replace(/(\d),(\d{3})(?!\d)/g, '$1$2')
    .trim()
}

export function parseStatusWindow(text: string): ParsedStatusWindow {
  const out = new Collector()
  let pending: { label: string; type: StatType } | null = null
  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = normalizeLine(rawLine)
    if (!line) { pending = null; continue }
    const bullet = line.match(/^[-•*·]\s+(.*)$/)
    if (pending && bullet) {
      out.addList(pending.label, pending.type, [bullet[1].trim()])
      continue
    }
    pending = null
    let rest = bullet ? bullet[1] : line
    for (;;) {
      const m = rest.match(LIST_LABEL_RE)
      if (!m || m.index === undefined) { parseScalars(rest, out); break }
      parseScalars(rest.slice(0, m.index), out)
      const info = LIST_LABELS[m[2].toLowerCase().replace(/\s+/g, ' ')]
      const after = rest.slice(m.index + m[0].length)
      const end = after.search(LIST_END_RE)
      const value = end === -1 ? after : after.slice(0, end)
      rest = end === -1 ? '' : after.slice(end + 1)
      const items = splitTopLevel(value)
      if (items.length === 0 && end === -1) pending = info
      out.addList(info.label, info.type, items)
    }
  }
  return { name: out.name, entries: out.entries }
}

// ---------------------------------------------------------------------------
// Merge into a character
// ---------------------------------------------------------------------------

export interface StatusMergeResult {
  stats: StatDefinition[]
  baseValues: Record<string, StatValue>
  /** Names of stats created. */
  added: string[]
  /** Names of existing stats whose base value changed. */
  updated: string[]
}

function canonicalName(name: string): string {
  const key = cleanLabel(name).toLowerCase()
  return (SCALAR_ALIASES[key] ?? LIST_LABELS[key]?.label ?? cleanLabel(name)).toLowerCase()
}

function slug(label: string, taken: Set<string>): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'stat'
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}_${n}`
  taken.add(id)
  return id
}

function itemNames(v: StatValue): Array<{ name: string; qty: number }> {
  switch (v.kind) {
    case 'list':
      return v.items.map((raw) => parseQty(raw))
    case 'inventory':
      return v.items.map((it) => ({ name: it.name, qty: it.fields.qty ?? 1 }))
    case 'spellList':
    case 'skillList':
      return v.items.map((it) => ({ name: it.name, qty: 1 }))
    default:
      return []
  }
}

/** The parsed value reshaped to fit an existing stat's type (null when it can't). */
function coerce(def: StatDefinition, current: StatValue | undefined, parsed: StatValue): { value: StatValue; tiers?: string[] } | null {
  if (def.type === parsed.kind) return { value: parsed }
  const scalar = parsed.kind === 'number' || parsed.kind === 'numberWithMax' ? parsed.value : undefined
  switch (def.type) {
    case 'numberWithMax':
      if (scalar === undefined) return null
      return { value: { kind: 'numberWithMax', value: scalar, max: current?.kind === 'numberWithMax' ? Math.max(current.max, scalar) : scalar } }
    case 'number':
      return scalar === undefined ? null : { value: { kind: 'number', value: scalar } }
    case 'text':
      if (scalar !== undefined) return { value: { kind: 'text', value: String(scalar) } }
      return parsed.kind === 'rank' ? { value: { kind: 'text', value: parsed.tier } } : null
    case 'rank': {
      const tier = parsed.kind === 'text' ? parsed.value : scalar !== undefined ? String(scalar) : undefined
      if (tier === undefined) return null
      const tiers = def.rankTiers ?? DEFAULT_TIERS
      return { value: { kind: 'rank', tier }, tiers: tiers.includes(tier) ? undefined : [...tiers, tier] }
    }
    case 'list':
      return { value: { kind: 'list', items: itemNames(parsed).map((it) => formatQty(it.name, it.qty)) } }
    case 'inventory':
      return { value: { kind: 'inventory', items: itemNames(parsed).map((it) => ({ name: it.name, fields: { qty: it.qty } })) } }
    case 'spellList':
      return { value: { kind: 'spellList', items: itemNames(parsed).map((it) => ({ name: it.name, fields: { level: 1, mana: 0 } })) } }
    case 'skillList':
      return { value: { kind: 'skillList', items: itemNames(parsed).map((it) => ({ name: it.name, fields: { level: 1 } })) } }
    default:
      return null
  }
}

const ATTR_EQUIV: Record<string, string> = { LUK: 'LUCK', LUCK: 'LUK' }

/**
 * Apply a parsed status window to a character's sheet: stats matched by name
 * (or a known alias, e.g. "Health" → HP) get new base values, attribute keys
 * merge into the existing attribute set, everything else becomes a new stat.
 */
export function mergeStatusIntoCharacter(
  character: Pick<Character, 'stats' | 'baseValues'>,
  parsed: ParsedStatusWindow,
): StatusMergeResult {
  const stats = character.stats.map((s) => ({ ...s }))
  const baseValues: Record<string, StatValue> = { ...character.baseValues }
  const taken = new Set(stats.map((s) => s.id))
  const added: string[] = []
  const updated: string[] = []
  const note = (list: string[], name: string) => { if (!list.includes(name)) list.push(name) }

  for (const entry of parsed.entries) {
    if (entry.value.kind === 'attributeSet') {
      const target =
        stats.find((s) => s.type === 'attributeSet' && s.name.toLowerCase() === 'attributes') ??
        stats.find((s) => s.type === 'attributeSet')
      if (target) {
        const cur = baseValues[target.id]
        const values = cur?.kind === 'attributeSet' ? { ...cur.values } : {}
        const keys = [...(target.attributeKeys ?? Object.keys(values))]
        for (const [rawKey, n] of Object.entries(entry.value.values)) {
          const key =
            keys.find((k) => k.toLowerCase() === rawKey.toLowerCase()) ??
            keys.find((k) => k === ATTR_EQUIV[rawKey.toUpperCase()]) ??
            rawKey
          if (!keys.includes(key)) keys.push(key)
          values[key] = n
        }
        target.attributeKeys = keys
        baseValues[target.id] = { kind: 'attributeSet', values }
        note(updated, target.name)
        continue
      }
    }
    const wanted = canonicalName(entry.label)
    const existing = stats.find((s) => canonicalName(s.name) === wanted || s.id.toLowerCase() === wanted)
    if (existing) {
      const fit = coerce(existing, baseValues[existing.id], entry.value)
      if (!fit) continue
      if (fit.tiers) existing.rankTiers = fit.tiers
      baseValues[existing.id] = fit.value
      note(updated, existing.name)
      continue
    }
    const def: StatDefinition = { id: slug(entry.label, taken), ...structuredClone(entry.def) }
    stats.push(def)
    baseValues[def.id] = structuredClone(entry.value)
    note(added, def.name)
  }
  return { stats, baseValues, added, updated }
}

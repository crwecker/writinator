import type { Book, Character, CharacterState, StatDefinition, StatDelta, StatValue } from '../types'
import { computeStateAt, parseQty } from './characterState'
import { extractMarkers } from './markerUtils'

/** One character's net change across a chapter. */
export interface ChapterCharacterSummary {
  characterId: string
  name: string
  color: string
  /** Readable pieces, e.g. "HP −15 (40 → 25)", "+2 items", "Level 3 → 4". */
  parts: string[]
}

const MINUS = '−'
const LEVEL_LIKE = /^(level|lvl|lv)$/i

function signed(n: number): string {
  return n < 0 ? `${MINUS}${Math.abs(n)}` : `+${n}`
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/** Item name → quantity for any list-shaped value. */
function quantities(v: StatValue | undefined): Map<string, { name: string; qty: number }> {
  const out = new Map<string, { name: string; qty: number }>()
  if (!v) return out
  const add = (name: string, qty: number) => {
    const key = name.toLowerCase()
    const cur = out.get(key)
    out.set(key, { name: cur?.name ?? name, qty: (cur?.qty ?? 0) + qty })
  }
  if (v.kind === 'list') for (const raw of v.items) { const p = parseQty(raw); add(p.name, p.qty) }
  if (v.kind === 'inventory') for (const it of v.items) add(it.name, it.fields.qty ?? 1)
  if (v.kind === 'spellList' || v.kind === 'skillList') for (const it of v.items) add(it.name, 1)
  return out
}

function listDiff(before: StatValue | undefined, after: StatValue | undefined) {
  const b = quantities(before)
  const a = quantities(after)
  const gained: string[] = []
  const lost: string[] = []
  let gainedQty = 0
  let lostQty = 0
  for (const [key, it] of a) {
    const d = it.qty - (b.get(key)?.qty ?? 0)
    if (d > 0) { gained.push(it.name); gainedQty += d }
  }
  for (const [key, it] of b) {
    const d = it.qty - (a.get(key)?.qty ?? 0)
    if (d > 0) { lost.push(it.name); lostQty += d }
  }
  return { gained, lost, gainedQty, lostQty }
}

/** How one stat moved between two values, or [] when it didn't. */
function statParts(def: StatDefinition, b: StatValue | undefined, a: StatValue | undefined): string[] {
  if (!a) return []
  const name = def.name
  if ((a.kind === 'number' || a.kind === 'numberWithMax') && (b?.kind === a.kind || !b)) {
    const bv = b && (b.kind === 'number' || b.kind === 'numberWithMax') ? b.value : 0
    const out: string[] = []
    if (a.value !== bv) {
      out.push(LEVEL_LIKE.test(name) ? `${name} ${bv} → ${a.value}` : `${name} ${signed(a.value - bv)} (${bv} → ${a.value})`)
    }
    if (a.kind === 'numberWithMax' && b?.kind === 'numberWithMax' && a.max !== b.max) {
      out.push(`max ${name} ${signed(a.max - b.max)} (${b.max} → ${a.max})`)
    }
    return out
  }
  if (a.kind === 'attributeSet') {
    const bvals = b?.kind === 'attributeSet' ? b.values : {}
    const out: string[] = []
    for (const [k, n] of Object.entries(a.values)) {
      const prev = bvals[k] ?? 0
      if (n !== prev) out.push(`${k} ${signed(n - prev)} (${prev} → ${n})`)
    }
    return out
  }
  if (a.kind === 'rank') {
    const bt = b?.kind === 'rank' ? b.tier : '—'
    return bt === a.tier ? [] : [`${name} ${bt} → ${a.tier}`]
  }
  if (a.kind === 'text') {
    const bt = b?.kind === 'text' ? b.value : ''
    return bt === a.value ? [] : [`${name} ${bt || '—'} → ${a.value || '—'}`]
  }
  const { gained, lost, gainedQty, lostQty } = listDiff(b, a)
  const out: string[] = []
  if (a.kind === 'inventory') {
    if (gainedQty > 0) out.push(`+${plural(gainedQty, 'item')}`)
    if (lostQty > 0) out.push(`${MINUS}${plural(lostQty, 'item')}`)
  } else if (a.kind === 'spellList' || a.kind === 'skillList') {
    for (const n of gained) out.push(`learns ${n}`)
    for (const n of lost) out.push(`forgets ${n}`)
  } else {
    for (const n of gained) out.push(`+${n}`)
    for (const n of lost) out.push(`${MINUS}${n}`)
  }
  return out
}

function equipmentParts(b: CharacterState, a: CharacterState): string[] {
  const out: string[] = []
  const slots = new Set([...Object.keys(b.equipped), ...Object.keys(a.equipped)])
  for (const slot of slots) {
    const before = b.equipped[slot]
    const after = a.equipped[slot]
    if (after && (!before || before.itemId !== after.itemId)) out.push(`equips ${after.itemName ?? after.itemId}`)
    else if (!after && before) out.push(`unequips ${slot}`)
  }
  return out
}

function buffParts(b: CharacterState, a: CharacterState): string[] {
  const had = new Set(b.activeBuffs.map((x) => x.buffId))
  return a.activeBuffs.filter((x) => !had.has(x.buffId)).map((x) => `+${x.buffName ?? x.buffId}`)
}

/**
 * Net change per character across one storylet: the state as the chapter
 * opens versus as it closes. Only characters with a change marker in the
 * chapter appear; an empty result means the chapter has no stat changes.
 */
export function summarizeChapter(
  book: Book,
  storyletId: string,
  characters: Character[],
  markers: Record<string, StatDelta[]>,
): ChapterCharacterSummary[] {
  const storylet = book.storylets.find((s) => s.id === storyletId)
  if (!storylet) return []
  const touched = new Set<string>()
  for (const marker of extractMarkers(storylet.content ?? '')) {
    if (marker.kind !== 'delta') continue
    for (const d of markers[marker.id] ?? []) touched.add(d.characterId)
  }
  const out: ChapterCharacterSummary[] = []
  for (const c of characters) {
    if (!touched.has(c.id)) continue
    const start = computeStateAt(c, book, markers, { storyletId, offset: 0 })
    const end = computeStateAt(c, book, markers, { storyletId, offset: Number.MAX_SAFE_INTEGER })
    const parts: string[] = []
    for (const def of c.stats) {
      const isList = def.type === 'list' || def.type === 'inventory' || def.type === 'spellList' || def.type === 'skillList'
      const src = isList ? 'state' : 'effective'
      const b = src === 'state' ? start.state.base[def.id] : start.effective[def.id]
      const a = src === 'state' ? end.state.base[def.id] : end.effective[def.id]
      parts.push(...statParts(def, b, a))
    }
    parts.push(...equipmentParts(start.state, end.state), ...buffParts(start.state, end.state))
    out.push({ characterId: c.id, name: c.name, color: c.color, parts: parts.length > 0 ? parts : ['no net change'] })
  }
  return out
}

/** "Kael HP −15 (40 → 25), +2 items · Mira Rank D → C". */
export function formatChapterSummary(list: ChapterCharacterSummary[]): string {
  return list.map((s) => `${s.name} ${s.parts.join(', ')}`).join(' · ')
}

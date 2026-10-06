import type { Book, Character, CharacterState, StatDelta, StatDeltaOp, StatValue } from '../types'
import { computeEffective, computeStateAt, parseQty } from './characterState'
import { extractMarkers } from './markerUtils'
import { previewOp } from './statPreview'

/** A one-click repair: rewrite the marker's deltas, or give the character a missing slot. */
export type MarkerWarningFix =
  | { kind: 'replaceDeltas'; label: string; deltas: StatDelta[] }
  | { kind: 'addSlot'; label: string; characterId: string; slot: string }

/** A change marker whose op produces an impossible value or targets something that isn't there. */
export interface MarkerWarning {
  markerId: string
  deltaId: string
  characterId: string
  message: string
  fixes: MarkerWarningFix[]
}

const MINUS = '−'

function num(n: number): string {
  return n < 0 ? `${MINUS}${Math.abs(n)}` : String(n)
}

function opStatId(op: StatDeltaOp): string | undefined {
  return 'statId' in op ? op.statId : undefined
}

function levenshtein(a: string, b: string): number {
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0]
    prev[0] = i
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j]
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1))
      diag = tmp
    }
  }
  return prev[b.length]
}

/** The owned name closest to `wanted` (typo, plural, case), or undefined when nothing is close. */
export function closestName(wanted: string, owned: string[]): string | undefined {
  const w = wanted.trim().toLowerCase()
  let best: { name: string; score: number } | undefined
  for (const name of owned) {
    const n = name.toLowerCase()
    const contains = n.includes(w) || w.includes(n)
    const dist = levenshtein(w, n)
    const score = contains ? Math.min(dist, 1) : dist
    if (score > Math.max(2, Math.floor(Math.max(w.length, n.length) * 0.4))) continue
    if (!best || score < best.score) best = { name, score }
  }
  return best?.name
}

function ownedNames(v: StatValue | undefined): string[] {
  if (!v) return []
  if (v.kind === 'list') return v.items.map((raw) => parseQty(raw).name)
  if (v.kind === 'inventory' || v.kind === 'spellList' || v.kind === 'skillList') return v.items.map((it) => it.name)
  return []
}

function replaceOp(deltas: StatDelta[], deltaId: string, op: StatDeltaOp): StatDelta[] {
  return deltas.map((d) => (d.id === deltaId ? { ...d, op } : d))
}

function warningsForDelta(
  character: Character,
  before: CharacterState,
  delta: StatDelta,
  deltas: StatDelta[],
  markerId: string,
): { warning?: MarkerWarning; after: CharacterState } {
  const op = delta.op
  const base = { markerId, deltaId: delta.id, characterId: character.id }
  const deleteFix: MarkerWarningFix = {
    kind: 'replaceDeltas',
    label: 'Delete this change',
    deltas: deltas.filter((d) => d.id !== delta.id),
  }

  const statId = opStatId(op)
  if (statId !== undefined && !character.stats.some((s) => s.id === statId)) {
    const key = statId.toLowerCase()
    const match = character.stats.find((s) => s.id.toLowerCase() === key || s.name.toLowerCase() === key)
    const fixes: MarkerWarningFix[] = []
    if (match) {
      fixes.push({
        kind: 'replaceDeltas',
        label: `Use ${match.name}`,
        deltas: replaceOp(deltas, delta.id, { ...op, statId: match.id } as StatDeltaOp),
      })
    }
    fixes.push(deleteFix)
    return { warning: { ...base, message: `${character.name} has no stat “${statId}”`, fixes }, after: before }
  }

  const { row, after } = previewOp(character, before, op)

  if (op.kind === 'adjust' || op.kind === 'set' || op.kind === 'maxAdjust') {
    const effB = computeEffective(before, character.stats)[op.statId]
    const effA = computeEffective(after, character.stats)[op.statId]
    if (effA?.kind !== 'numberWithMax') return { after }
    const wasOk = effB?.kind === 'numberWithMax' && effB.value >= 0 && effB.value <= effB.max
    const over = effA.value > effA.max
    const under = effA.value < 0
    if (!wasOk || (!over && !under)) return { after }
    const name = character.stats.find((s) => s.id === op.statId)?.name ?? op.statId
    const message = `${name} would be ${num(effA.value)}/${effA.max} — ${over ? 'above max' : 'below 0'}`
    const target = over ? effA.max : 0
    const shift = target - effA.value
    const fixes: MarkerWarningFix[] = []
    if (op.kind === 'adjust' && !op.attributeKey) {
      fixes.push({
        kind: 'replaceDeltas',
        label: `Clamp to ${target}`,
        deltas: replaceOp(deltas, delta.id, { ...op, delta: op.delta + shift }),
      })
    } else if (op.kind === 'set' && op.value.kind === 'numberWithMax') {
      fixes.push({
        kind: 'replaceDeltas',
        label: `Clamp to ${target}`,
        deltas: replaceOp(deltas, delta.id, { ...op, value: { ...op.value, value: op.value.value + shift } }),
      })
    }
    fixes.push(deleteFix)
    return { warning: { ...base, message, fixes }, after }
  }

  if (!row.warning) return { after }
  const fixes: MarkerWarningFix[] = []
  switch (op.kind) {
    case 'itemRemove':
    case 'itemFieldAdjust': {
      const owned = closestName(op.name, ownedNames(before.base[op.statId]))
      if (owned) {
        fixes.push({
          kind: 'replaceDeltas',
          label: op.kind === 'itemRemove' ? `Remove ${owned} instead` : `Use ${owned} instead`,
          deltas: replaceOp(deltas, delta.id, { ...op, name: owned }),
        })
      }
      break
    }
    case 'listRemove': {
      const owned = ownedNames(before.base[op.statId])
      const items = op.items.map((raw) => {
        const p = parseQty(raw)
        const name = owned.some((o) => o.toLowerCase() === p.name.toLowerCase()) ? p.name : closestName(p.name, owned)
        return name ? (p.qty > 1 ? `${name} x${p.qty}` : name) : null
      })
      if (items.every((x): x is string => x !== null)) {
        fixes.push({
          kind: 'replaceDeltas',
          label: `Remove ${items.join(', ')} instead`,
          deltas: replaceOp(deltas, delta.id, { ...op, items }),
        })
      }
      break
    }
    case 'itemAdd': {
      if (before.base[op.statId]?.kind === 'inventory') {
        fixes.push({
          kind: 'replaceDeltas',
          label: 'Add to the quantity instead',
          deltas: replaceOp(deltas, delta.id, {
            kind: 'itemFieldAdjust', statId: op.statId, name: op.name, field: 'qty', delta: op.fields.qty ?? 1,
          }),
        })
      }
      break
    }
    case 'equip':
      fixes.push({ kind: 'addSlot', label: `Add a ${op.slot} slot`, characterId: character.id, slot: op.slot })
      break
    case 'rankChange':
      return { warning: { ...base, message: row.warning, fixes: [] }, after }
    default:
      break
  }
  fixes.push(deleteFix)
  return { warning: { ...base, message: row.warning, fixes }, after }
}

function compute(
  book: Book,
  storyletId: string,
  characters: Character[],
  markers: Record<string, StatDelta[]>,
): Map<string, MarkerWarning[]> {
  const out = new Map<string, MarkerWarning[]>()
  const storylet = book.storylets.find((s) => s.id === storyletId)
  if (!storylet) return out
  const byId = new Map(characters.map((c) => [c.id, c]))
  for (const marker of extractMarkers(storylet.content ?? '')) {
    if (marker.kind !== 'delta') continue
    const deltas = markers[marker.id]
    if (!deltas || deltas.length === 0) continue
    const working = new Map<string, CharacterState>()
    const list: MarkerWarning[] = []
    for (const d of deltas) {
      const c = byId.get(d.characterId)
      if (!c) continue
      const before =
        working.get(c.id) ?? computeStateAt(c, book, markers, { storyletId, offset: marker.offset }).state
      const { warning, after } = warningsForDelta(c, before, d, deltas, marker.id)
      working.set(c.id, after)
      if (warning) list.push(warning)
    }
    if (list.length > 0) out.set(marker.id, list)
  }
  return out
}

// Per (book, markers, characters, storylet). Inputs are replaced, never mutated.
const cache = new WeakMap<Book, WeakMap<Record<string, StatDelta[]>, WeakMap<Character[], Map<string, Map<string, MarkerWarning[]>>>>>()

/**
 * Warnings for each change marker in one storylet, keyed by marker id:
 * values pushed out of bounds (only by the change that crossed the line),
 * items removed that aren't owned, empty slots unequipped, unknown stats.
 * Each warning carries one-click fixes. Cached per book/markers/characters.
 */
export function computeMarkerWarnings(
  book: Book,
  storyletId: string,
  characters: Character[],
  markers: Record<string, StatDelta[]>,
): Map<string, MarkerWarning[]> {
  let byMarkers = cache.get(book)
  if (!byMarkers) { byMarkers = new WeakMap(); cache.set(book, byMarkers) }
  let byChars = byMarkers.get(markers)
  if (!byChars) { byChars = new WeakMap(); byMarkers.set(markers, byChars) }
  let byStorylet = byChars.get(characters)
  if (!byStorylet) { byStorylet = new Map(); byChars.set(characters, byStorylet) }
  let result = byStorylet.get(storyletId)
  if (!result) {
    result = compute(book, storyletId, characters, markers)
    byStorylet.set(storyletId, result)
  }
  return result
}

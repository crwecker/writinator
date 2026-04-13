import type {
  ActiveBuff,
  Book,
  Character,
  CharacterState,
  ConsistencyIssue,
  Document,
  EquippedItem,
  HistorySample,
  StatDefinition,
  StatDelta,
  StatDeltaOp,
  StatModifier,
  StatValue,
} from '../types'
import { extractMarkers } from './markerUtils'

/** Deep-clone a StatValue (each tagged variant). */
function cloneStatValue(v: StatValue): StatValue {
  switch (v.kind) {
    case 'number':
      return { kind: 'number', value: v.value }
    case 'numberWithMax':
      return { kind: 'numberWithMax', value: v.value, max: v.max }
    case 'list':
      return { kind: 'list', items: [...v.items] }
    case 'text':
      return { kind: 'text', value: v.value }
    case 'attributeSet':
      return { kind: 'attributeSet', values: { ...v.values } }
    case 'rank':
      return { kind: 'rank', tier: v.tier }
  }
}

// Inline-encoded list-item quantity: "Name xN" where N is an integer >= 1.
// Missing suffix = 1. Used by inventory-style lists; harmless on plain lists.
const QTY_RE = /\s+x(\d+)$/i

function parseQty(raw: string): { name: string; qty: number } {
  const m = raw.match(QTY_RE)
  if (!m || m.index === undefined) return { name: raw, qty: 1 }
  const qty = parseInt(m[1], 10)
  if (!Number.isFinite(qty) || qty < 1) return { name: raw, qty: 1 }
  return { name: raw.slice(0, m.index).trimEnd(), qty }
}

function formatQty(name: string, qty: number): string {
  return qty > 1 ? `${name} x${qty}` : name
}

export function applyListAdd(current: string[], toAdd: string[]): string[] {
  const out = [...current]
  for (const raw of toAdd) {
    const { name, qty } = parseQty(raw)
    const key = name.toLowerCase()
    const idx = out.findIndex((it) => parseQty(it).name.toLowerCase() === key)
    if (idx >= 0) {
      const cur = parseQty(out[idx])
      out[idx] = formatQty(cur.name, cur.qty + qty)
    } else {
      out.push(formatQty(name, qty))
    }
  }
  return out
}

export function applyListRemove(current: string[], toRemove: string[]): string[] {
  const out = [...current]
  for (const raw of toRemove) {
    const { name, qty } = parseQty(raw)
    const key = name.toLowerCase()
    const idx = out.findIndex((it) => parseQty(it).name.toLowerCase() === key)
    if (idx < 0) continue
    const cur = parseQty(out[idx])
    const nextQty = cur.qty - qty
    if (nextQty <= 0) {
      out.splice(idx, 1)
    } else {
      out[idx] = formatQty(cur.name, nextQty)
    }
  }
  return out
}

function cloneBase(base: Record<string, StatValue>): Record<string, StatValue> {
  const out: Record<string, StatValue> = {}
  for (const k of Object.keys(base)) {
    out[k] = cloneStatValue(base[k])
  }
  return out
}

function cloneEquipped(
  equipped: Record<string, EquippedItem>
): Record<string, EquippedItem> {
  const out: Record<string, EquippedItem> = {}
  for (const slot of Object.keys(equipped)) {
    const item = equipped[slot]
    out[slot] = {
      itemId: item.itemId,
      itemName: item.itemName,
      modifiers: item.modifiers.map((m) => ({ ...m })),
    }
  }
  return out
}

function cloneBuffs(buffs: ActiveBuff[]): ActiveBuff[] {
  return buffs.map((b) => ({
    buffId: b.buffId,
    buffName: b.buffName,
    modifiers: b.modifiers.map((m) => ({ ...m })),
    remaining: b.remaining,
  }))
}

function cloneState(state: CharacterState): CharacterState {
  return {
    base: cloneBase(state.base),
    equipped: cloneEquipped(state.equipped),
    activeBuffs: cloneBuffs(state.activeBuffs),
  }
}

/**
 * Apply a single delta op to a character state, returning a new state.
 * Pure. Unknown stat ids are tolerated (op becomes a no-op) so orphaned ops
 * never crash the walk — Phase 8 surfaces them as consistency warnings.
 */
export function applyDeltaOp(
  state: CharacterState,
  op: StatDeltaOp
): CharacterState {
  const next = cloneState(state)

  switch (op.kind) {
    case 'adjust': {
      const cur = next.base[op.statId]
      if (!cur) break
      if (cur.kind === 'number') {
        next.base[op.statId] = { kind: 'number', value: cur.value + op.delta }
      } else if (cur.kind === 'numberWithMax') {
        next.base[op.statId] = {
          kind: 'numberWithMax',
          value: cur.value + op.delta,
          max: cur.max,
        }
      } else if (cur.kind === 'attributeSet' && op.attributeKey) {
        const values = { ...cur.values }
        values[op.attributeKey] = (values[op.attributeKey] ?? 0) + op.delta
        next.base[op.statId] = { kind: 'attributeSet', values }
      }
      break
    }
    case 'set': {
      next.base[op.statId] = cloneStatValue(op.value)
      break
    }
    case 'maxAdjust': {
      const cur = next.base[op.statId]
      if (cur && cur.kind === 'numberWithMax') {
        next.base[op.statId] = {
          kind: 'numberWithMax',
          value: cur.value,
          max: cur.max + op.delta,
        }
      }
      break
    }
    case 'listAdd': {
      const cur = next.base[op.statId]
      if (cur && cur.kind === 'list') {
        next.base[op.statId] = {
          kind: 'list',
          items: applyListAdd(cur.items, op.items),
        }
      }
      break
    }
    case 'listRemove': {
      const cur = next.base[op.statId]
      if (cur && cur.kind === 'list') {
        next.base[op.statId] = {
          kind: 'list',
          items: applyListRemove(cur.items, op.items),
        }
      }
      break
    }
    case 'equip': {
      next.equipped[op.slot] = {
        itemId: op.itemId,
        itemName: op.itemName,
        modifiers: op.modifiers.map((m) => ({ ...m })),
      }
      break
    }
    case 'unequip': {
      delete next.equipped[op.slot]
      break
    }
    case 'buffApply': {
      next.activeBuffs = [
        ...next.activeBuffs.filter((b) => b.buffId !== op.buffId),
        {
          buffId: op.buffId,
          buffName: op.buffName,
          modifiers: op.modifiers.map((m) => ({ ...m })),
          remaining: op.expiresAfter,
        },
      ]
      break
    }
    case 'buffRemove': {
      next.activeBuffs = next.activeBuffs.filter((b) => b.buffId !== op.buffId)
      break
    }
    case 'rankChange': {
      const cur = next.base[op.statId]
      if (!cur || cur.kind !== 'rank') break
      if (op.direction === 'set' && typeof op.value === 'string') {
        next.base[op.statId] = { kind: 'rank', tier: op.value }
      }
      // For 'up' / 'down' we need the definition's rankTiers — handled by
      // computeStateAt, which passes `character` through. Here we fall back to
      // no-op when direction is up/down since applyDeltaOp doesn't know tiers.
      break
    }
  }

  return next
}

/** Variant that knows the character's stat definitions, so `rankChange: up/down` can traverse tiers. */
function applyDeltaOpWithDefs(
  state: CharacterState,
  op: StatDeltaOp,
  definitions: StatDefinition[]
): CharacterState {
  if (op.kind !== 'rankChange' || op.direction === 'set') {
    return applyDeltaOp(state, op)
  }
  const def = definitions.find((d) => d.id === op.statId)
  const tiers = def?.rankTiers
  const cur = state.base[op.statId]
  if (!def || !tiers || tiers.length === 0 || !cur || cur.kind !== 'rank') {
    return state
  }
  const idx = tiers.indexOf(cur.tier)
  if (idx === -1) return state
  const nextIdx =
    op.direction === 'up'
      ? Math.min(tiers.length - 1, idx + 1)
      : Math.max(0, idx - 1)
  if (nextIdx === idx) return state
  const next = cloneState(state)
  next.base[op.statId] = { kind: 'rank', tier: tiers[nextIdx] }
  return next
}

/** Decrement buff counters and drop expired ones. Called after each marker's ops applied. */
function tickBuffs(state: CharacterState): CharacterState {
  if (state.activeBuffs.length === 0) return state
  const nextBuffs: ActiveBuff[] = []
  let changed = false
  for (const buff of state.activeBuffs) {
    if (buff.remaining === undefined) {
      nextBuffs.push(buff)
      continue
    }
    const r = buff.remaining - 1
    if (r <= 0) {
      changed = true
      continue
    }
    if (r !== buff.remaining) changed = true
    nextBuffs.push({ ...buff, remaining: r })
  }
  if (!changed && nextBuffs.length === state.activeBuffs.length) return state
  return { ...state, activeBuffs: nextBuffs }
}

/**
 * Compute the effective stat values given a layered state.
 * Layering: base + equipped modifiers + active-buff modifiers.
 * Only `number`, `numberWithMax`, and `attributeSet` honor modifiers;
 * `list`, `text`, and `rank` pass through as-is.
 */
export function computeEffective(
  state: CharacterState,
  definitions: StatDefinition[]
): Record<string, StatValue> {
  const effective = cloneBase(state.base)

  const applyModifier = (mod: StatModifier) => {
    const target = effective[mod.statId]
    if (!target) return
    if (target.kind === 'number') {
      if (mod.kind === 'flat') {
        effective[mod.statId] = { kind: 'number', value: target.value + mod.amount }
      }
    } else if (target.kind === 'numberWithMax') {
      if (mod.kind === 'flat') {
        effective[mod.statId] = {
          kind: 'numberWithMax',
          value: target.value + mod.amount,
          max: target.max,
        }
      } else if (mod.kind === 'maxFlat') {
        effective[mod.statId] = {
          kind: 'numberWithMax',
          value: target.value,
          max: target.max + mod.amount,
        }
      }
    } else if (target.kind === 'attributeSet' && mod.attributeKey) {
      const def = definitions.find((d) => d.id === mod.statId)
      const keys = def?.attributeKeys
      if (!keys || !keys.includes(mod.attributeKey)) return
      if (mod.kind === 'flat') {
        const values = { ...target.values }
        values[mod.attributeKey] = (values[mod.attributeKey] ?? 0) + mod.amount
        effective[mod.statId] = { kind: 'attributeSet', values }
      }
    }
  }

  for (const slot of Object.keys(state.equipped)) {
    for (const mod of state.equipped[slot].modifiers) applyModifier(mod)
  }
  for (const buff of state.activeBuffs) {
    for (const mod of buff.modifiers) applyModifier(mod)
  }

  return effective
}

/**
 * Depth-first flatten of the book's document tree: parents precede children,
 * siblings preserve their array order in `book.documents`. Matches the
 * Sidebar's `flattenTree` minus collapse filtering (state computation must
 * consider every document).
 */
export function getDocumentTreeOrder(book: Book): Document[] {
  const docs = book.documents ?? []
  const childrenByParent = new Map<string | undefined, Document[]>()
  for (const doc of docs) {
    const key = doc.parentId
    const list = childrenByParent.get(key) ?? []
    list.push(doc)
    childrenByParent.set(key, list)
  }
  const result: Document[] = []
  const walk = (parentId: string | undefined) => {
    const kids = childrenByParent.get(parentId)
    if (!kids) return
    for (const doc of kids) {
      result.push(doc)
      walk(doc.id)
    }
  }
  walk(undefined)
  return result
}

export interface ComputeStopAt {
  documentId: string
  offset: number
}

export interface ComputedCharacterState {
  state: CharacterState
  effective: Record<string, StatValue>
}

/**
 * Walk every document in tree order, extract markers, and apply every delta
 * op in order up to an optional `stopAt` point (inclusive of markers whose
 * offset is strictly less than `stopAt.offset` within that document).
 *
 * - Starts from `character.baseValues` (cloned).
 * - Only deltas whose `characterId` matches `character.id` are applied.
 * - Unknown marker ids (present in text but missing from `markers`) are skipped.
 * - Buff counters decrement once per marker that produced at least one applied op.
 */
export function computeStateAt(
  character: Character,
  book: Book,
  markers: Record<string, StatDelta[]>,
  stopAt?: ComputeStopAt
): ComputedCharacterState {
  let state: CharacterState = {
    base: cloneBase(character.baseValues),
    equipped: {},
    activeBuffs: [],
  }

  const order = getDocumentTreeOrder(book)
  for (const doc of order) {
    const content = doc.content ?? ''
    const extracted = extractMarkers(content)
    const isStopDoc = stopAt?.documentId === doc.id

    for (const marker of extracted) {
      if (isStopDoc && marker.offset >= stopAt!.offset) {
        return { state, effective: computeEffective(state, character.stats) }
      }
      if (marker.kind !== 'delta') continue
      const deltas = markers[marker.id]
      if (!deltas || deltas.length === 0) continue
      let appliedAny = false
      for (const delta of deltas) {
        if (delta.characterId !== character.id) continue
        state = applyDeltaOpWithDefs(state, delta.op, character.stats)
        appliedAny = true
      }
      if (appliedAny) {
        state = tickBuffs(state)
      }
    }

    if (isStopDoc) {
      // Stop offset was past every marker in this doc; finish here.
      return { state, effective: computeEffective(state, character.stats) }
    }
  }

  return { state, effective: computeEffective(state, character.stats) }
}

/** Approximate word-count in a slice of text. Used for history X-axis hints. */
function countWords(text: string): number {
  if (!text) return 0
  // Strip stat/statblock HTML comments to avoid counting marker tokens.
  const cleaned = text.replace(/<!--[\s\S]*?-->/g, ' ')
  const trimmed = cleaned.trim()
  if (!trimmed) return 0
  return trimmed.split(/\s+/).length
}

/**
 * Walk the whole book in tree order and sample `character`'s effective state
 * at the start of the book, then after each applied marker. Sample 0 is the
 * character's base state anchored at the first document (offset 0).
 * Pure. No React, no side effects.
 */
export function computeHistory(
  character: Character,
  book: Book,
  markers: Record<string, StatDelta[]>
): HistorySample[] {
  const order = getDocumentTreeOrder(book)
  const samples: HistorySample[] = []

  let state: CharacterState = {
    base: cloneBase(character.baseValues),
    equipped: {},
    activeBuffs: [],
  }

  const firstDoc = order[0]
  const baseSample: HistorySample = {
    markerIndex: 0,
    offset: 0,
    documentId: firstDoc?.id ?? '',
    documentName: firstDoc?.name ?? '',
    effective: computeEffective(state, character.stats),
    wordIndex: 0,
  }
  samples.push(baseSample)

  let markerIndex = 0
  let cumulativeWords = 0

  for (const doc of order) {
    const content = doc.content ?? ''
    const extracted = extractMarkers(content)

    let prevOffset = 0
    for (const marker of extracted) {
      if (marker.kind !== 'delta') continue
      const deltas = markers[marker.id]
      if (!deltas || deltas.length === 0) continue
      const applicable = deltas.filter((d) => d.characterId === character.id)
      if (applicable.length === 0) continue

      // Count words from prevOffset up to this marker's offset.
      cumulativeWords += countWords(content.slice(prevOffset, marker.offset))
      prevOffset = marker.offset

      for (const delta of applicable) {
        state = applyDeltaOpWithDefs(state, delta.op, character.stats)
      }
      state = tickBuffs(state)
      markerIndex += 1
      samples.push({
        markerIndex,
        offset: marker.offset,
        documentId: doc.id,
        documentName: doc.name,
        effective: computeEffective(state, character.stats),
        wordIndex: cumulativeWords,
      })
    }
    // Add trailing words of this doc so cross-doc word counts progress.
    cumulativeWords += countWords(content.slice(prevOffset))
  }

  return samples
}

/**
 * Scan the book + store for inconsistencies. Pure.
 *
 * - orphanMarker: UUID found in text but missing from `markers` store.
 * - inverseOrphan: store entry whose UUID appears in no document.
 * - impossibleValue: computed effective value violates invariants (e.g.,
 *   numberWithMax `value > max`, HP/MP-like `value < 0`).
 * - missingSlot: equip op references a slot not declared on the character.
 * - unequipEmpty: unequip op references a slot that is currently empty.
 */
export function checkConsistency(
  book: Book,
  characters: Character[],
  markers: Record<string, StatDelta[]>
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  const order = getDocumentTreeOrder(book)
  const charactersById = new Map(characters.map((c) => [c.id, c]))
  const seenMarkerIds = new Set<string>()

  // Pass 1: walk each document, collect orphanMarker + run per-character
  // simulations to detect impossibleValue / missingSlot / unequipEmpty.
  const simStates = new Map<string, CharacterState>()
  for (const c of characters) {
    simStates.set(c.id, {
      base: cloneBase(c.baseValues),
      equipped: {},
      activeBuffs: [],
    })
  }

  const checkImpossible = (
    c: Character,
    state: CharacterState,
    documentId: string,
    offset: number
  ) => {
    const eff = computeEffective(state, c.stats)
    for (const def of c.stats) {
      const v = eff[def.id]
      if (!v) continue
      if (v.kind === 'numberWithMax') {
        if (v.value > v.max) {
          issues.push({
            kind: 'impossibleValue',
            characterId: c.id,
            statId: def.id,
            reason: `${def.name} ${v.value}/${v.max} — current exceeds max`,
            documentId,
            offset,
          })
        }
        if (v.value < 0) {
          issues.push({
            kind: 'impossibleValue',
            characterId: c.id,
            statId: def.id,
            reason: `${def.name} ${v.value}/${v.max} — negative value`,
            documentId,
            offset,
          })
        }
      }
    }
  }

  for (const doc of order) {
    const content = doc.content ?? ''
    const extracted = extractMarkers(content)
    for (const marker of extracted) {
      if (marker.kind !== 'delta') continue
      seenMarkerIds.add(marker.id)
      const deltas = markers[marker.id]
      if (!deltas) {
        issues.push({
          kind: 'orphanMarker',
          markerId: marker.id,
          documentId: doc.id,
          offset: marker.offset,
        })
        continue
      }
      for (const delta of deltas) {
        const c = charactersById.get(delta.characterId)
        if (!c) continue
        const state = simStates.get(c.id)
        if (!state) continue
        const op = delta.op
        if (op.kind === 'equip') {
          if (!c.equipmentSlots.includes(op.slot)) {
            issues.push({
              kind: 'missingSlot',
              characterId: c.id,
              slot: op.slot,
              markerId: marker.id,
            })
          }
        } else if (op.kind === 'unequip') {
          if (!state.equipped[op.slot]) {
            issues.push({
              kind: 'unequipEmpty',
              characterId: c.id,
              slot: op.slot,
              markerId: marker.id,
            })
          }
        }
        const nextState = applyDeltaOpWithDefs(state, op, c.stats)
        simStates.set(c.id, nextState)
      }
      // After applying, tick buffs and check invariants for each affected char.
      const touched = new Set<string>()
      for (const delta of deltas) touched.add(delta.characterId)
      for (const cid of touched) {
        const c = charactersById.get(cid)
        const state = simStates.get(cid)
        if (!c || !state) continue
        const ticked = tickBuffs(state)
        simStates.set(cid, ticked)
        checkImpossible(c, ticked, doc.id, marker.offset)
      }
    }
  }

  // Pass 2: inverse orphans — store entries with no text reference.
  for (const id of Object.keys(markers)) {
    if (!seenMarkerIds.has(id)) {
      issues.push({ kind: 'inverseOrphan', markerId: id })
    }
  }

  return issues
}

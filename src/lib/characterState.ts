import type {
  ActiveBuff,
  Book,
  Character,
  CharacterState,
  ConsistencyIssue,
  Storylet,
  EquippedItem,
  HistorySample,
  StatDefinition,
  StatDelta,
  StatDeltaOp,
  StatListItem,
  StatModifier,
  StatValue,
} from '../types'
import { extractMarkers } from './markerUtils'
import { LIST_STAT_FIELD_KEYS } from './listStatFields'

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
    case 'inventory':
      return { kind: 'inventory', items: v.items.map((it) => ({ name: it.name, fields: { ...it.fields } })) }
    case 'spellList':
      return { kind: 'spellList', items: v.items.map((it) => ({ name: it.name, fields: { ...it.fields } })) }
    case 'skillList':
      return { kind: 'skillList', items: v.items.map((it) => ({ name: it.name, fields: { ...it.fields } })) }
  }
}

// Inline-encoded list-item quantity: "Name xN" where N is an integer >= 1.
// Missing suffix = 1. Used by inventory-style lists; harmless on plain lists.
const QTY_RE = /\s+x(\d+)$/i

export function parseQty(raw: string): { name: string; qty: number } {
  const m = raw.match(QTY_RE)
  if (!m || m.index === undefined) return { name: raw, qty: 1 }
  const qty = parseInt(m[1], 10)
  if (!Number.isFinite(qty) || qty < 1) return { name: raw, qty: 1 }
  return { name: raw.slice(0, m.index).trimEnd(), qty }
}

// Like parseQty but also accepts a leading "N Name" form (e.g. "29 Darts").
// Used only for list → counted-list conversion — the strict parseQty stays in
// place for the plain-list dedupe engine so item names like "3 Coins" aren't
// accidentally split.
const QTY_PREFIX_RE = /^(\d+)\s+(\S.*)$/
export function parseQtyLoose(raw: string): { name: string; qty: number } {
  const trimmed = raw.trim()
  const suffix = parseQty(trimmed)
  if (suffix.qty !== 1 || suffix.name !== trimmed) return suffix
  const m = trimmed.match(QTY_PREFIX_RE)
  if (!m) return suffix
  const qty = parseInt(m[1], 10)
  if (!Number.isFinite(qty) || qty < 1) return suffix
  return { name: m[2].trim(), qty }
}

export function formatQty(name: string, qty: number): string {
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

// ---------------------------------------------------------------------------
// Pure item helpers — never mutate inputs
// ---------------------------------------------------------------------------

function itemAdd(items: StatListItem[], name: string, fields: Record<string, number>): StatListItem[] {
  const key = name.toLowerCase()
  const exists = items.some((it) => it.name.toLowerCase() === key)
  if (exists) return items
  return [...items, { name, fields: { ...fields } }]
}

function itemRemove(items: StatListItem[], name: string): StatListItem[] {
  const key = name.toLowerCase()
  return items.filter((it) => it.name.toLowerCase() !== key)
}

function itemFieldAdjust(
  items: StatListItem[],
  name: string,
  field: string,
  delta: number
): StatListItem[] {
  const key = name.toLowerCase()
  const idx = items.findIndex((it) => it.name.toLowerCase() === key)
  if (idx === -1) return items
  return items.map((it, i) => {
    if (i !== idx) return it
    return { name: it.name, fields: { ...it.fields, [field]: (it.fields[field] ?? 0) + delta } }
  })
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
    case 'fill': {
      const cur = next.base[op.statId]
      if (!cur || cur.kind !== 'numberWithMax') break
      next.base[op.statId] = { kind: 'numberWithMax', value: cur.max, max: cur.max }
      break
    }
    case 'itemAdd': {
      const cur = next.base[op.statId]
      if (!cur) break
      if (cur.kind !== 'inventory' && cur.kind !== 'spellList' && cur.kind !== 'skillList') break
      next.base[op.statId] = { ...cur, items: itemAdd(cur.items, op.name, op.fields) }
      break
    }
    case 'itemRemove': {
      const cur = next.base[op.statId]
      if (!cur) break
      if (cur.kind !== 'inventory' && cur.kind !== 'spellList' && cur.kind !== 'skillList') break
      next.base[op.statId] = { ...cur, items: itemRemove(cur.items, op.name) }
      break
    }
    case 'itemFieldAdjust': {
      const cur = next.base[op.statId]
      if (!cur) break
      if (cur.kind !== 'inventory' && cur.kind !== 'spellList' && cur.kind !== 'skillList') break
      const allowed = LIST_STAT_FIELD_KEYS[cur.kind]
      if (!allowed.includes(op.field)) break
      next.base[op.statId] = { ...cur, items: itemFieldAdjust(cur.items, op.name, op.field, op.delta) }
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

/**
 * Decrement buff counters and drop expired ones. Buffs in `fresh` were
 * (re)applied by the marker being processed and don't tick on it.
 */
function tickBuffs(state: CharacterState, fresh: ReadonlySet<string>): CharacterState {
  if (state.activeBuffs.length === 0) return state
  const nextBuffs: ActiveBuff[] = []
  let changed = false
  for (const buff of state.activeBuffs) {
    if (buff.remaining === undefined || fresh.has(buff.buffId)) {
      nextBuffs.push(buff)
      continue
    }
    const r = buff.remaining - 1
    changed = true
    if (r <= 0) continue
    nextBuffs.push({ ...buff, remaining: r })
  }
  if (!changed) return state
  return { ...state, activeBuffs: nextBuffs }
}

/**
 * Apply one marker's ops for a single character, then advance buff counters.
 * The one place every book walk (state lookups, history, consistency) steps a
 * character through a marker, so they all agree on buff expiry: a buff with
 * `expiresAfter: N` stays active for the next N markers affecting the
 * character after the one that applied it. `beforeOp` sees the state each op
 * is about to be applied to.
 */
function applyMarkerOps(
  state: CharacterState,
  ops: StatDeltaOp[],
  definitions: StatDefinition[],
  beforeOp?: (state: CharacterState, op: StatDeltaOp) => void
): CharacterState {
  const fresh = new Set<string>()
  for (const op of ops) {
    beforeOp?.(state, op)
    state = applyDeltaOpWithDefs(state, op, definitions)
    if (op.kind === 'buffApply') fresh.add(op.buffId)
  }
  return tickBuffs(state, fresh)
}

/** The ops of `deltas` that belong to `characterId`, in marker order. */
function opsFor(deltas: StatDelta[], characterId: string): StatDeltaOp[] {
  const ops: StatDeltaOp[] = []
  for (const d of deltas) if (d.characterId === characterId) ops.push(d.op)
  return ops
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
 * Depth-first flatten of the book's storylet tree: parents precede children,
 * siblings preserve their array order in `book.storylets`. Matches the
 * Sidebar's `flattenTree` minus collapse filtering (state computation must
 * consider every storylet).
 */
export function getStoryletTreeOrder(book: Book): Storylet[] {
  const storylets = book.storylets ?? []
  const childrenByParent = new Map<string | undefined, Storylet[]>()
  for (const storylet of storylets) {
    const key = storylet.parentId
    const list = childrenByParent.get(key) ?? []
    list.push(storylet)
    childrenByParent.set(key, list)
  }
  const result: Storylet[] = []
  const walk = (parentId: string | undefined) => {
    const kids = childrenByParent.get(parentId)
    if (!kids) return
    for (const storylet of kids) {
      result.push(storylet)
      walk(storylet.id)
    }
  }
  walk(undefined)
  return result
}

export interface ComputeStopAt {
  storyletId: string
  offset: number
}

export interface ComputedCharacterState {
  state: CharacterState
  effective: Record<string, StatValue>
}

/** State after each marker that changed the character, in book order. */
interface StateTimeline {
  orderIndex: Map<string, number>
  initial: CharacterState
  /** Sorted by (storylet order, offset). `state` is the state after the marker. */
  checkpoints: Array<{ order: number; offset: number; state: CharacterState }>
}

// One timeline per (book, markers, character). All three are replaced, not
// mutated, when they change, so object identity is a safe cache key.
const timelineCache = new WeakMap<
  Book,
  WeakMap<Record<string, StatDelta[]>, WeakMap<Character, StateTimeline>>
>()

function buildTimeline(character: Character, book: Book, markers: Record<string, StatDelta[]>): StateTimeline {
  const initial: CharacterState = { base: cloneBase(character.baseValues), equipped: {}, activeBuffs: [] }
  const orderIndex = new Map<string, number>()
  const checkpoints: StateTimeline['checkpoints'] = []
  let state = initial
  getStoryletTreeOrder(book).forEach((storylet, order) => {
    orderIndex.set(storylet.id, order)
    for (const marker of extractMarkers(storylet.content ?? '')) {
      if (marker.kind !== 'delta') continue
      const deltas = markers[marker.id]
      if (!deltas || deltas.length === 0) continue
      const ops = opsFor(deltas, character.id)
      if (ops.length === 0) continue
      state = applyMarkerOps(state, ops, character.stats)
      checkpoints.push({ order, offset: marker.offset, state })
    }
  })
  return { orderIndex, initial, checkpoints }
}

function getTimeline(character: Character, book: Book, markers: Record<string, StatDelta[]>): StateTimeline {
  let byMarkers = timelineCache.get(book)
  if (!byMarkers) {
    byMarkers = new WeakMap()
    timelineCache.set(book, byMarkers)
  }
  let byCharacter = byMarkers.get(markers)
  if (!byCharacter) {
    byCharacter = new WeakMap()
    byMarkers.set(markers, byCharacter)
  }
  let timeline = byCharacter.get(character)
  if (!timeline) {
    timeline = buildTimeline(character, book, markers)
    byCharacter.set(character, timeline)
  }
  return timeline
}

/**
 * Character state at a point in the book: every delta op in tree order up to
 * an optional `stopAt` point (markers whose offset is strictly less than
 * `stopAt.offset` within that document). Without `stopAt`, or when its
 * storylet isn't in the book, the state at the end of the book.
 *
 * - Starts from `character.baseValues` (cloned).
 * - Only deltas whose `characterId` matches `character.id` are applied.
 * - Unknown marker ids (present in text but missing from `markers`) are skipped.
 * - Buff counters decrement once per later marker that affects the character
 *   (see `applyMarkerOps`).
 *
 * The walk over the book is cached per (book, markers, character), so
 * repeated lookups (every `{HP}` ref, every statblock) are a binary search.
 * The returned `state` is shared — treat it as read-only.
 */
export function computeStateAt(
  character: Character,
  book: Book,
  markers: Record<string, StatDelta[]>,
  stopAt?: ComputeStopAt
): ComputedCharacterState {
  const { orderIndex, initial, checkpoints } = getTimeline(character, book, markers)
  const stopOrder = stopAt ? orderIndex.get(stopAt.storyletId) : undefined
  let state = checkpoints.length > 0 ? checkpoints[checkpoints.length - 1].state : initial
  if (stopAt && stopOrder !== undefined) {
    // Last checkpoint strictly before (stopOrder, stopAt.offset).
    let lo = 0
    let hi = checkpoints.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      const cp = checkpoints[mid]
      const before = cp.order < stopOrder || (cp.order === stopOrder && cp.offset < stopAt.offset)
      if (before) lo = mid + 1
      else hi = mid
    }
    state = lo > 0 ? checkpoints[lo - 1].state : initial
  }
  return { state, effective: computeEffective(state, character.stats) }
}

let liveBookMemo: { book: Book; storyletId: string; content: string; result: Book } | null = null

/**
 * `book` with one storylet's content replaced by `content` — the editor's live
 * text for the open storylet, which the store's copy trails by up to 1.5s.
 * Memoized on (book, storyletId, content) so every consumer of the same live
 * text (stat refs, statblocks, the panel) gets the same Book object and so
 * shares one cached timeline per character.
 */
export function withLiveStorylet(book: Book, storyletId: string, content: string): Book {
  const memo = liveBookMemo
  if (memo && memo.book === book && memo.storyletId === storyletId && memo.content === content) {
    return memo.result
  }
  const current = book.storylets.find((s) => s.id === storyletId)
  const result =
    !current || (current.content ?? '') === content
      ? book
      : {
          ...book,
          storylets: book.storylets.map((s) => (s.id === storyletId ? { ...s, content } : s)),
        }
  liveBookMemo = { book, storyletId, content, result }
  return result
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
  const order = getStoryletTreeOrder(book)
  const samples: HistorySample[] = []

  let state: CharacterState = {
    base: cloneBase(character.baseValues),
    equipped: {},
    activeBuffs: [],
  }

  const firstStorylet = order[0]
  const baseSample: HistorySample = {
    markerIndex: 0,
    offset: 0,
    storyletId: firstStorylet?.id ?? '',
    storyletName: firstStorylet?.name ?? '',
    effective: computeEffective(state, character.stats),
    wordIndex: 0,
  }
  samples.push(baseSample)

  let markerIndex = 0
  let cumulativeWords = 0

  for (const storylet of order) {
    const content = storylet.content ?? ''
    const extracted = extractMarkers(content)

    let prevOffset = 0
    for (const marker of extracted) {
      if (marker.kind !== 'delta') continue
      const deltas = markers[marker.id]
      if (!deltas || deltas.length === 0) continue
      const ops = opsFor(deltas, character.id)
      if (ops.length === 0) continue

      // Count words from prevOffset up to this marker's offset.
      cumulativeWords += countWords(content.slice(prevOffset, marker.offset))
      prevOffset = marker.offset

      state = applyMarkerOps(state, ops, character.stats)
      markerIndex += 1
      samples.push({
        markerIndex,
        offset: marker.offset,
        storyletId: storylet.id,
        storyletName: storylet.name,
        effective: computeEffective(state, character.stats),
        wordIndex: cumulativeWords,
      })
    }
    // Add trailing words of this storylet so cross-storylet word counts progress.
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
  const order = getStoryletTreeOrder(book)
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
    storyletId: string,
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
            storyletId,
            offset,
          })
        }
        if (v.value < 0) {
          issues.push({
            kind: 'impossibleValue',
            characterId: c.id,
            statId: def.id,
            reason: `${def.name} ${v.value}/${v.max} — negative value`,
            storyletId,
            offset,
          })
        }
      }
    }
  }

  for (const storylet of order) {
    const content = storylet.content ?? ''
    const extracted = extractMarkers(content)
    for (const marker of extracted) {
      if (marker.kind !== 'delta') continue
      seenMarkerIds.add(marker.id)
      const deltas = markers[marker.id]
      if (!deltas) {
        issues.push({
          kind: 'orphanMarker',
          markerId: marker.id,
          storyletId: storylet.id,
          offset: marker.offset,
        })
        continue
      }
      // Step each affected character through the marker. Characters are
      // independent, so grouping a compound marker's ops per character keeps
      // each one's op order intact.
      const touched = new Set<string>()
      for (const delta of deltas) touched.add(delta.characterId)
      for (const cid of touched) {
        const c = charactersById.get(cid)
        const state = simStates.get(cid)
        if (!c || !state) continue
        const next = applyMarkerOps(state, opsFor(deltas, cid), c.stats, (before, op) => {
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
            if (!before.equipped[op.slot]) {
              issues.push({
                kind: 'unequipEmpty',
                characterId: c.id,
                slot: op.slot,
                markerId: marker.id,
              })
            }
          }
        })
        simStates.set(cid, next)
        checkImpossible(c, next, storylet.id, marker.offset)
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

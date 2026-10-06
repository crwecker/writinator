import type { Character, StatDefinition, StatDeltaOp, StatValue } from '../types'
import { LIST_STAT_FIELDS, defaultItemFields, type ListStatKind } from './listStatFields'

/** Plain-language verbs the delta editor offers in place of engine op kinds. */
export type DeltaVerb =
  | 'damage'
  | 'heal'
  | 'change'
  | 'set'
  | 'raiseMax'
  | 'lowerMax'
  | 'refill'
  | 'gainItem'
  | 'loseItem'
  | 'changeQty'
  | 'learn'
  | 'forget'
  | 'adjustField'
  | 'rankUp'
  | 'rankDown'
  | 'setRank'
  | 'equip'
  | 'unequip'
  | 'applyBuff'
  | 'removeBuff'

/** What a delta row points at: a stat, the equipment slots, or buffs. */
export type DeltaTarget = { kind: 'stat'; statId: string } | { kind: 'equipment' } | { kind: 'buffs' }

export const VERB_LABELS: Record<DeltaVerb, string> = {
  damage: 'Damage',
  heal: 'Heal',
  change: 'Change',
  set: 'Set to',
  raiseMax: 'Raise max',
  lowerMax: 'Lower max',
  refill: 'Refill',
  gainItem: 'Gain item',
  loseItem: 'Lose item',
  changeQty: 'Change quantity',
  learn: 'Learn',
  forget: 'Forget',
  adjustField: 'Change level / cost',
  rankUp: 'Rank up',
  rankDown: 'Rank down',
  setRank: 'Set rank',
  equip: 'Equip',
  unequip: 'Unequip',
  applyBuff: 'Apply buff',
  removeBuff: 'Remove buff',
}

export function targetKey(t: DeltaTarget): string {
  return t.kind === 'stat' ? `stat:${t.statId}` : t.kind
}

const SIGNED_VERBS: Partial<Record<DeltaVerb, 1 | -1>> = { damage: -1, heal: 1, raiseMax: 1, lowerMax: -1 }

/** The number the amount field shows: unsigned for verbs that carry their own sign. */
export function amountForVerb(verb: DeltaVerb, delta: number): number {
  return SIGNED_VERBS[verb] ? Math.abs(delta) : delta
}

/** The op's delta for an amount typed under `verb`. */
export function signedForVerb(verb: DeltaVerb, amount: number): number {
  const sign = SIGNED_VERBS[verb]
  return sign ? sign * Math.abs(amount) + 0 : amount
}

export function targetForOp(op: StatDeltaOp): DeltaTarget {
  switch (op.kind) {
    case 'equip':
    case 'unequip':
      return { kind: 'equipment' }
    case 'buffApply':
    case 'buffRemove':
      return { kind: 'buffs' }
    default:
      return { kind: 'stat', statId: op.statId }
  }
}

function statDef(character: Character | undefined, statId: string): StatDefinition | undefined {
  return character?.stats.find((s) => s.id === statId)
}

export function verbsForTarget(target: DeltaTarget, character: Character | undefined): DeltaVerb[] {
  if (target.kind === 'equipment') return ['equip', 'unequip']
  if (target.kind === 'buffs') return ['applyBuff', 'removeBuff']
  const def = statDef(character, target.statId)
  if (!def) return []
  switch (def.type) {
    case 'numberWithMax':
      return ['damage', 'heal', 'set', 'raiseMax', 'lowerMax', 'refill']
    case 'number':
    case 'attributeSet':
      return ['change', 'set']
    case 'text':
      return ['set']
    case 'list':
      return ['gainItem', 'loseItem', 'set']
    case 'inventory':
      return ['gainItem', 'loseItem', 'changeQty', 'set']
    case 'spellList':
    case 'skillList':
      return ['learn', 'forget', 'adjustField', 'set']
    case 'rank':
      return ['rankUp', 'rankDown', 'setRank']
  }
}

export function verbForOp(op: StatDeltaOp, character: Character | undefined): DeltaVerb {
  const typeOf = (id: string) => statDef(character, id)?.type
  const isAbility = (id: string) => {
    const t = typeOf(id)
    return t === 'spellList' || t === 'skillList'
  }
  switch (op.kind) {
    case 'adjust':
      return typeOf(op.statId) === 'numberWithMax' ? (op.delta < 0 ? 'damage' : 'heal') : 'change'
    case 'set':
      return 'set'
    case 'maxAdjust':
      return op.delta < 0 ? 'lowerMax' : 'raiseMax'
    case 'fill':
      return 'refill'
    case 'listAdd':
      return 'gainItem'
    case 'listRemove':
      return 'loseItem'
    case 'itemAdd':
      return isAbility(op.statId) ? 'learn' : 'gainItem'
    case 'itemRemove':
      return isAbility(op.statId) ? 'forget' : 'loseItem'
    case 'itemFieldAdjust':
      return typeOf(op.statId) === 'inventory' && op.field === 'qty' ? 'changeQty' : 'adjustField'
    case 'rankChange':
      return op.direction === 'up' ? 'rankUp' : op.direction === 'down' ? 'rankDown' : 'setRank'
    case 'equip':
      return 'equip'
    case 'unequip':
      return 'unequip'
    case 'buffApply':
      return 'applyBuff'
    case 'buffRemove':
      return 'removeBuff'
  }
}

function blankValue(def: StatDefinition): StatValue {
  switch (def.type) {
    case 'number':
      return { kind: 'number', value: 0 }
    case 'numberWithMax':
      return { kind: 'numberWithMax', value: 0, max: 0 }
    case 'list':
      return { kind: 'list', items: [] }
    case 'text':
      return { kind: 'text', value: '' }
    case 'attributeSet':
      return { kind: 'attributeSet', values: Object.fromEntries((def.attributeKeys ?? []).map((k) => [k, 0])) }
    case 'rank':
      return { kind: 'rank', tier: def.rankTiers?.[0] ?? '' }
    case 'inventory':
    case 'spellList':
    case 'skillList':
      return { kind: def.type, items: [] }
  }
}

function prevAmount(prev: StatDeltaOp | undefined): number {
  if (!prev) return 0
  if (prev.kind === 'adjust' || prev.kind === 'maxAdjust' || prev.kind === 'itemFieldAdjust') return Math.abs(prev.delta)
  return 0
}

function prevItemName(prev: StatDeltaOp | undefined): string {
  if (!prev) return ''
  if (prev.kind === 'itemAdd' || prev.kind === 'itemRemove' || prev.kind === 'itemFieldAdjust') return prev.name
  if (prev.kind === 'listAdd' || prev.kind === 'listRemove') return prev.items[0] ?? ''
  return ''
}

/**
 * The op a verb produces on a target. Switching verbs keeps what carries over
 * (the amount between damage/heal/max, the item name between item verbs).
 */
export function opForVerb(
  verb: DeltaVerb,
  target: DeltaTarget,
  character: Character | undefined,
  prev?: StatDeltaOp,
): StatDeltaOp {
  const slot = character?.equipmentSlots[0] ?? ''
  switch (verb) {
    case 'equip':
      return { kind: 'equip', slot, itemId: '', modifiers: [] }
    case 'unequip':
      return { kind: 'unequip', slot }
    case 'applyBuff':
      return { kind: 'buffApply', buffId: '', modifiers: [] }
    case 'removeBuff':
      return { kind: 'buffRemove', buffId: '' }
  }
  const statId = target.kind === 'stat' ? target.statId : ''
  const def = statDef(character, statId)
  const amount = prevAmount(prev)
  const name = prevItemName(prev)
  const listKind: ListStatKind | null =
    def && (def.type === 'inventory' || def.type === 'spellList' || def.type === 'skillList') ? def.type : null
  switch (verb) {
    case 'damage':
    case 'heal':
      return { kind: 'adjust', statId, delta: signedForVerb(verb, amount) }
    case 'change': {
      const delta = prev?.kind === 'adjust' ? prev.delta : 0
      if (def?.type === 'attributeSet') {
        const key = prev?.kind === 'adjust' && prev.attributeKey ? prev.attributeKey : def.attributeKeys?.[0]
        return { kind: 'adjust', statId, delta, attributeKey: key }
      }
      return { kind: 'adjust', statId, delta }
    }
    case 'set': {
      const base = character?.baseValues[statId]
      const value = base ? structuredClone(base) : def ? blankValue(def) : { kind: 'number' as const, value: 0 }
      return { kind: 'set', statId, value }
    }
    case 'raiseMax':
    case 'lowerMax':
      return { kind: 'maxAdjust', statId, delta: signedForVerb(verb, amount) }
    case 'refill':
      return { kind: 'fill', statId }
    case 'gainItem':
    case 'learn':
      if (def?.type === 'list') return { kind: 'listAdd', statId, items: name ? [name] : [] }
      return { kind: 'itemAdd', statId, name, fields: listKind ? defaultItemFields(listKind) : {} }
    case 'loseItem':
    case 'forget':
      if (def?.type === 'list') return { kind: 'listRemove', statId, items: name ? [name] : [] }
      return { kind: 'itemRemove', statId, name }
    case 'changeQty':
    case 'adjustField': {
      const field = verb === 'changeQty' ? 'qty' : listKind ? LIST_STAT_FIELDS[listKind][0]?.key ?? '' : ''
      const delta = prev?.kind === 'itemFieldAdjust' ? prev.delta : 0
      return { kind: 'itemFieldAdjust', statId, name, field, delta }
    }
    case 'rankUp':
      return { kind: 'rankChange', statId, direction: 'up' }
    case 'rankDown':
      return { kind: 'rankChange', statId, direction: 'down' }
    case 'setRank': {
      const base = character?.baseValues[statId]
      const tier = base?.kind === 'rank' ? base.tier : def?.rankTiers?.[0] ?? ''
      return { kind: 'rankChange', statId, direction: 'set', value: tier }
    }
  }
}

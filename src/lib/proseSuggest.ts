import type { Character, CharacterState, StatDefinition, StatType, StatValue } from '../types'
import { parseQuickEntry } from './quickEntry'

// ---------------------------------------------------------------------------
// Prose → stat-change suggestions. Local pattern matching only: given the one
// sentence the writer just finished, recognise common LitRPG phrasings tied to
// a known character ("Kael picked up a dagger", "took 15 damage", "[+1 STR]")
// and turn them into a quick-entry line ("Kael +Dagger") that the editor can
// offer as a ghost chip. Deliberately conservative: negations, hedges,
// questions, dialogue, recollections and ambiguous pronouns yield nothing.
// Every candidate is checked with the quick-entry parser before it's offered.
// ---------------------------------------------------------------------------

export interface ProseSuggestContext {
  characters: Character[]
  /** Character state at the sentence end (inventory lookups); defaults to base values. */
  stateFor?: (characterId: string) => CharacterState | undefined
  /** Item names known outside inventories (a catalog, earlier markers). */
  knownItems?: string[]
  /** Pattern keys the writer asked never to suggest again. */
  muted?: ReadonlySet<string>
}

export interface SentenceInput {
  /** The finished sentence, as written (quotes, brackets, markdown and all). */
  sentence: string
  /** Paragraph text before the sentence (pronoun resolution). */
  before: string
  /** Text of the preceding paragraphs (who a system message is about). */
  recent?: string
}

export interface ProseSuggestion {
  /** Quick-entry line, e.g. "Kael -15 HP, -Iron Sword". */
  text: string
  /** Chip label, e.g. "Kael · -15 HP, -Iron Sword". */
  label: string
  characterIds: string[]
  /** Pattern keys of the clauses (for "don't suggest this again"). */
  keys: string[]
}

// ---------------------------------------------------------------------------
// Sentence location (pure, for the editor extension)
// ---------------------------------------------------------------------------

export interface SentenceSpan {
  from: number
  /** Just past the sentence's terminator / closing quote — where a marker goes. */
  to: number
  text: string
  /** Paragraph (line) text before the sentence. */
  before: string
  /** A stat marker already sits right after the sentence. */
  markerAfter: boolean
}

const CLOSERS = /["”’')\]*_]/
const TERMINATORS = /[.!?]/

/**
 * The sentence that ends at `pos` (allowing trailing spaces and closing
 * quotes/brackets), or null when `pos` isn't at a sentence end. A line that
 * opens with "[" and closes with "]" is one sentence (a system message).
 */
export function findSentenceBefore(doc: string, pos: number): SentenceSpan | null {
  let to = Math.min(pos, doc.length)
  while (to > 0 && (doc[to - 1] === ' ' || doc[to - 1] === '\t')) to--
  if (to === 0) return null
  const lineStart = doc.lastIndexOf('\n', to - 1) + 1
  const line = doc.slice(lineStart, to)
  const markerAfter = /^[ \t]*<!--\s*stat:/.test(doc.slice(to))

  let from: number
  if (/^\s*(?:>\s*)?["“]?\[/.test(line) && /\]["”]?$/.test(line)) {
    from = lineStart
  } else {
    let k = to
    while (k > lineStart && CLOSERS.test(doc[k - 1])) k--
    if (k === lineStart || !TERMINATORS.test(doc[k - 1])) return null
    // Last boundary (terminator + closers + whitespace) before the terminator.
    const head = doc.slice(lineStart, k - 1)
    const re = /[.!?]["”’')\]*_]*\s+/g
    let start = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(head)) !== null) start = m.index + m[0].length
    from = lineStart + start
  }
  return { from, to, text: doc.slice(from, to), before: doc.slice(lineStart, from), markerAfter }
}

// ---------------------------------------------------------------------------
// Lexicons
// ---------------------------------------------------------------------------

const WEAPONS = new Set(
  ('sword blade axe bow crossbow dagger knife spear staff mace hammer club wand rapier scimitar halberd whip sling ' +
    'katana glaive pike flail saber sabre longsword shortsword greatsword dirk stiletto cudgel trident lance javelin ' +
    'warhammer greataxe hatchet cleaver').split(' '),
)
const CONSUMABLES = new Set(
  ('potion elixir scroll salve bandage ration draught tonic bomb flask vial antidote philter phial brew remedy ' +
    'poultice pill tincture').split(' '),
)
const ITEM_NOUNS = new Set([
  ...WEAPONS,
  ...CONSUMABLES,
  ...(
    'armor armour mail chainmail plate robe cloak tunic jerkin vest coat breastplate shield buckler helm helmet ' +
    'gauntlet glove boot greave bracer leathers ring amulet necklace pendant charm talisman bracelet earring brooch ' +
    'circlet crown trinket key gem jewel ruby emerald sapphire diamond pearl pelt hide fang claw horn tusk core ' +
    'crystal shard ore ingot herb map book tome lantern torch rope pouch purse bag satchel backpack lockpick arrow ' +
    'bolt quiver rune stone feather egg relic artifact artefact idol token badge seal sigil orb trophy coin chest ' +
    'box scale skull bone heart eye essence dust powder bottle letter note journal compass whetstone tool kit ' +
    'pickaxe shovel spellbook grimoire codex manual totem fetish banner'
  ).split(' '),
])
/** Nouns that read as idiom, body or scenery rather than loot ("picked up the pace"). */
const STOP_NOUNS = new Set(
  ('pace way courage nerve breath time moment chance opportunity temper balance footing consciousness hope track ' +
    'sight patience control count mind voice gaze guard attention interest step look glance nod smile grin sigh ' +
    'trail scent slack signal rhythm speed strength resolve will truth answer word place seat lead initiative ' +
    'lesson news message impression feeling sense idea thought side hand arm shoulder wrist collar throat head face ' +
    'neck leg foot knee door handle rail railing ledge edge wall floor ground himself herself themselves itself ' +
    'nothing something everything anything it them hug kiss shrug wink glare frown laugh hint clue reason fight ' +
    'battle chase silence courage strength').split(' '),
)
const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  twenty: 20, fifty: 50, hundred: 100,
}
/** Attribute full names → their usual short keys. */
const ATTRIBUTE_ALIASES: Record<string, string[]> = {
  strength: ['STR'], dexterity: ['DEX'], constitution: ['CON'], intelligence: ['INT'], wisdom: ['WIS'],
  charisma: ['CHA'], luck: ['LUCK', 'LCK', 'LUK'], agility: ['AGI'], vitality: ['VIT'], endurance: ['END'],
  perception: ['PER'], willpower: ['WIL'], spirit: ['SPI'],
}
const HP_NAMES = ['hp', 'health', 'hit points', 'hitpoints']
const MP_NAMES = ['mp', 'mana', 'mana points']
const GOLD_NAMES = ['gold', 'coins', 'coin', 'money', 'gp']
const XP_NAMES = ['xp', 'exp', 'experience']
const LEVEL_NAMES = ['level', 'lvl']

const SYSTEM_PREFIX = /^(?:system|notification|alert|ding|announcement)\s*[:!-]\s*/i
const SENTENCE_GUARD =
  /\b(?:if|unless|whether|remember(?:ed|s|ing)?|recall(?:ed|s|ing)?|imagin(?:ed|es|ing)|dream(?:ed|t|s)|wish(?:ed|es)|pretend(?:ed|s)|plann?(?:ed|s)|wonder(?:ed|s)|ago|yesterday|used to|back when|last (?:week|month|year|night|time))\b/i
const NEGATION =
  /\b(?:not|never|no|almost|nearly|barely|hardly|had|would|could|should|might|must|will|shall|can|cannot|may|tried|tries|try|wanted|wants|refused|refuses|failed|fails|about|going|meant|hoped)\b|n['’]t\b/i
const DIRECT_GAP =
  /^\s+(?:(?:[a-z]+ly|then|also|just|now|finally|instead|immediately|soon|still|has|have|eventually|swiftly)\s+)*$/i
const CONNECTOR_TAIL = /(?:\band\b|,|\bthen\b|\bbut\b|;)\s*(?:(?:then|also|just|now|finally|[a-z]+ly)\s+)*$/i
const CLAUSE_START =
  /(?:^|[,;:!.]|\b(?:and|but|then|as|when|while|so|before|after|once|until|because|since|now))\s*$/i
const NP_STOP = new Set(
  ('from off and or but with to into onto in on at for before after while then as that which who whom under behind ' +
    'near beside inside out over through across toward towards by back away again up down when so if because ' +
    'the a an his her their its my your this these those he she they it was is were are had has have').split(' '),
)
const DETERMINER =
  /^\s+(a\s+(?:pair|set|handful|couple|dozen)(?:\s+of)?|a|an|the|some|his|her|their|its|your|my|another|several)\s+/i
const COUNT = /^(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|fifty|hundred)\s+/i

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function singular(word: string): string {
  const w = word.toLowerCase()
  if (w.length > 4 && w.endsWith('ies')) return `${w.slice(0, -3)}y`
  if (/(?:s|x|ch|sh)es$/.test(w)) return w.slice(0, -2)
  if (w.length > 3 && w.endsWith('s') && !w.endsWith('ss')) return w.slice(0, -1)
  return w
}

function titleCase(words: string[]): string {
  return words
    .map((w, i) => (i > 0 && /^(?:of|the|and)$/i.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ')
}

function numberOf(raw: string): number {
  const n = Number(raw)
  return Number.isFinite(n) ? n : NUMBER_WORDS[raw.toLowerCase()] ?? 1
}

function statNamed(c: Character, names: string[], types?: StatType[]): StatDefinition | undefined {
  return c.stats.find((s) => names.includes(s.name.toLowerCase()) && (!types || types.includes(s.type)))
}

function itemNamesOf(v: StatValue | undefined): string[] {
  if (!v) return []
  if (v.kind === 'list') return v.items.map((raw) => raw.replace(/\s*[x×]\s*\d+$/i, '').trim())
  if (v.kind === 'inventory' || v.kind === 'spellList' || v.kind === 'skillList') return v.items.map((it) => it.name)
  return []
}

/** The name to write for a numeric stat / attribute `word` on `c` ("Strength" → "STR"). */
function numericStatName(c: Character, word: string): string | null {
  const w = word.trim().toLowerCase()
  for (const s of c.stats) {
    if (s.type !== 'attributeSet') continue
    const keys = s.attributeKeys ?? []
    const direct = keys.find((k) => k.toLowerCase() === w)
    if (direct) return direct
    const alias = (ATTRIBUTE_ALIASES[w] ?? []).find((a) => keys.some((k) => k.toLowerCase() === a.toLowerCase()))
    if (alias) return keys.find((k) => k.toLowerCase() === alias.toLowerCase()) ?? alias
  }
  const def = c.stats.find(
    (s) => (s.type === 'number' || s.type === 'numberWithMax') && (s.name.toLowerCase() === w || s.id.toLowerCase() === w),
  )
  if (def) return def.name
  for (const names of [HP_NAMES, MP_NAMES, GOLD_NAMES, XP_NAMES, LEVEL_NAMES]) {
    if (names.includes(w)) return statNamed(c, names, ['number', 'numberWithMax'])?.name ?? null
  }
  return null
}

// ---------------------------------------------------------------------------
// Mentions and subjects
// ---------------------------------------------------------------------------

interface Mention {
  start: number
  end: number
  character: Character | null
  pronoun: 'he' | 'she' | 'they' | 'you' | null
  possessive: boolean
}

interface NameMatcher {
  character: Character
  re: RegExp
}

function nameMatchers(characters: Character[]): NameMatcher[] {
  const out: NameMatcher[] = []
  const firsts = new Map<string, number>()
  for (const c of characters) {
    const first = c.name.trim().split(/\s+/)[0]
    firsts.set(first, (firsts.get(first) ?? 0) + 1)
  }
  for (const c of characters) {
    const name = c.name.trim()
    if (!name || !/^\p{Lu}/u.test(name)) continue
    const alts = [escapeRe(name)]
    const first = name.split(/\s+/)[0]
    if (first !== name && first.length >= 3 && firsts.get(first) === 1) alts.push(escapeRe(first))
    out.push({ character: c, re: new RegExp(`(?<![\\p{L}\\d_])(?:${alts.join('|')})(?![\\p{L}\\d_])`, 'gu') })
  }
  return out
}

function findMentions(s: string, matchers: NameMatcher[], system: boolean): Mention[] {
  const out: Mention[] = []
  for (const { character, re } of matchers) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(s)) !== null) {
      const end = m.index + m[0].length
      out.push({ start: m.index, end, character, pronoun: null, possessive: /^['’]s\b/.test(s.slice(end)) })
    }
  }
  const pro = system ? /\b(he|she|they|you)\b/gi : /\b(he|she|they)\b/gi
  let m: RegExpExecArray | null
  while ((m = pro.exec(s)) !== null) {
    const p = m[1].toLowerCase() as Mention['pronoun']
    out.push({ start: m.index, end: m.index + m[0].length, character: null, pronoun: p, possessive: false })
  }
  return out.sort((a, b) => a.start - b.start)
}

function namedIn(text: string, matchers: NameMatcher[]): Character[] {
  const hits: Array<{ at: number; c: Character }> = []
  for (const { character, re } of matchers) {
    re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(text)) !== null) hits.push({ at: m.index, c: character })
  }
  return hits.sort((a, b) => a.at - b.at).map((h) => h.c)
}

// ---------------------------------------------------------------------------
// Noun phrases and items
// ---------------------------------------------------------------------------

interface NounPhrase {
  qty: number
  /** "the / his / her / their / its / your / my" — may name something already owned. */
  definite: boolean
  words: string[]
  /** Characters of the input consumed (from its start). */
  length: number
}

/** "a rusty key", "three arrows", "his sword" at the start of `rest` (leading space required). */
function parseNounPhrase(rest: string, matchers: NameMatcher[]): NounPhrase | null {
  let i = 0
  let qty = 1
  let counted = false
  let definite = false
  const det = rest.match(DETERMINER)
  if (det) {
    definite = /^(?:the|his|her|their|its|your|my)$/i.test(det[1])
    i += det[0].length
    const d = det[1].toLowerCase()
    if (/couple/.test(d)) qty = 2
    if (/dozen/.test(d)) qty = 12
    counted = true
  } else if (/^\s+/.test(rest)) {
    i += rest.match(/^\s+/)?.[0].length ?? 0
  } else {
    return null
  }
  const count = rest.slice(i).match(COUNT)
  if (count) {
    qty = numberOf(count[1])
    i += count[0].length
    counted = true
  }
  if (!counted) return null
  const words: string[] = []
  const tokenRe = /([\p{L}][\p{L}'’-]*)(\s+|$)?/uy
  while (words.length < 4) {
    tokenRe.lastIndex = i
    const t = tokenRe.exec(rest)
    if (!t) break
    const word = t[1]
    const lowerWord = word.toLowerCase()
    if (/['’]s$/.test(word)) return null // "Mira's arm", "the goblin's ear"
    if (matchers.some((nm) => nm.character.name.split(/\s+/)[0] === word)) {
      if (words.length === 0) return null
      break
    }
    if (lowerWord === 'of') {
      const next = rest.slice(i + t[0].length).match(/^([\p{L}]+)/u)?.[1]?.toLowerCase()
      if (!next || NP_STOP.has(next) || words.length === 0 || words.length > 2) break
    } else if (NP_STOP.has(lowerWord)) {
      break
    } else if (words.length > 0 && /ly$/.test(lowerWord) && lowerWord.length > 4) {
      break
    }
    words.push(word)
    i += t[1].length
    if (!t[2]) break
    if (words.length < 4) i += t[2].length
  }
  // Never end on "of".
  while (words.length && words[words.length - 1].toLowerCase() === 'of') words.pop()
  if (words.length === 0) return null
  // Consumed length ends at the last kept word.
  const lastWord = words[words.length - 1]
  const at = rest.lastIndexOf(lastWord, i)
  const length = at >= 0 ? at + lastWord.length : i
  return { qty, definite, words, length }
}

/** Noun phrases joined by "and" / commas ("the dagger and the shield"), at most three. */
function parseNounPhrases(rest: string, matchers: NameMatcher[]): { phrases: NounPhrase[]; length: number } {
  const phrases: NounPhrase[] = []
  let offset = 0
  let input = rest
  while (phrases.length < 3) {
    const np = parseNounPhrase(input, matchers)
    if (!np) break
    phrases.push(np)
    offset += np.length
    const tail = rest.slice(offset)
    const join = tail.match(/^\s*(?:,\s*(?:and\s+)?|\s+and\s+)/)
    if (!join) break
    const after = tail.slice(join[0].length - 1)
    if (!DETERMINER.test(after) && !COUNT.test(after.trimStart())) break
    offset += join[0].length - 1
    input = rest.slice(offset)
  }
  return { phrases, length: offset }
}

interface ResolvedItem {
  name: string
  head: string
  owned: boolean
  known: boolean
}

type ItemMode = 'loose' | 'strict' | 'consume' | 'use' | 'weapon'

// ---------------------------------------------------------------------------
// Rules
// ---------------------------------------------------------------------------

interface Clause {
  character: Character
  body: string
  key: string
}

interface Env {
  ctx: ProseSuggestContext
  matchers: NameMatcher[]
  stateOf: (c: Character) => CharacterState
  knownItems: string[]
  systemTarget: () => Character | null
  resolveName: (text: string) => Character | null
  /** Resolve the possessive before a stat ("Kael's", "his", "your") — undefined when none. */
  possessor: (s: string, at: number) => Character | null | undefined
}

interface Rule {
  id: string
  re: RegExp
  /** Required-subject rules start their match at the verb; the subject precedes it. */
  subject: boolean
  build: (m: RegExpExecArray, who: Character | null, env: Env, s: string) => { clauses: Clause[]; length?: number } | null
}

function ownedItems(c: Character, env: Env): string[] {
  return ownedItemsPlain(c.stats, env.stateOf(c).base)
}

/**
 * Canonical item for a noun phrase: an owned or known item of the same name,
 * else (for "the sword" / "his sword" when `byHead`) the one owned item with
 * that head noun, else the phrase title-cased.
 */
function resolveItem(np: NounPhrase, who: Character, env: Env, byHead = false): ResolvedItem {
  const phrase = np.words.join(' ').toLowerCase()
  const head = singular(np.words[np.words.length - 1])
  const owned = ownedItems(who, env)
  const variants = new Set([phrase, singular(phrase), `${phrase}s`])
  const same = (name: string) => variants.has(name.toLowerCase()) || singular(name) === singular(phrase)
  const ownedHit = owned.find(same)
  if (ownedHit) return { name: ownedHit, head: singular(ownedHit.split(/\s+/).pop() ?? ownedHit), owned: true, known: true }
  const knownHit = env.knownItems.find(same) ?? env.knownItems.find((k) => phrase.endsWith(` ${k.toLowerCase()}`))
  if (knownHit) return { name: knownHit, head: singular(knownHit.split(/\s+/).pop() ?? knownHit), owned: false, known: true }
  const sameHead = owned.filter((o) => singular(o.split(/\s+/).pop() ?? o) === head)
  if (byHead && np.definite && np.words.length === 1 && sameHead.length === 1) {
    return { name: sameHead[0], head, owned: true, known: true }
  }
  return { name: titleCase(np.words), head, owned: false, known: false }
}

function acceptItem(item: ResolvedItem, mode: ItemMode): boolean {
  if (!item.known && STOP_NOUNS.has(item.head)) return false
  switch (mode) {
    case 'loose':
      return true
    case 'strict':
      return item.known || ITEM_NOUNS.has(item.head)
    case 'consume':
      return item.owned || CONSUMABLES.has(item.head)
    case 'use':
      return CONSUMABLES.has(item.head)
    case 'weapon':
      return item.known || WEAPONS.has(item.head)
  }
}

function currencyStat(c: Character, word: string): StatDefinition | undefined {
  const w = word.toLowerCase().replace(/\s+(?:coins?|pieces?)$/, '')
  return statNamed(c, [w], ['number']) ?? (GOLD_NAMES.includes(w) || /^coins?$/.test(word.toLowerCase()) ? statNamed(c, GOLD_NAMES, ['number']) : undefined)
}

function signed(n: number, sign: 1 | -1): string {
  return `${sign < 0 ? '-' : '+'}${n}`
}

/** Item gain/loss clauses for the noun phrases at the start of `rest`. */
function itemRule(sign: 1 | -1, mode: ItemMode): Rule['build'] {
  return (m, who, env, s) => {
    if (!who) return null
    const rest = s.slice(m.index + m[0].length)
    const { phrases, length } = parseNounPhrases(rest, env.matchers)
    if (phrases.length === 0) return null
    const clauses: Clause[] = []
    for (const np of phrases) {
      const head = singular(np.words[np.words.length - 1])
      if (head === 'coin' || head === 'gold') {
        const def = statNamed(who, GOLD_NAMES, ['number'])
        if (def) {
          clauses.push({ character: who, body: `${signed(np.qty, sign)} ${def.name}`, key: `gold:${def.name.toLowerCase()}` })
          continue
        }
      }
      const it = resolveItem(np, who, env, sign < 0)
      if (!acceptItem(it, mode)) return null
      const body = np.qty > 1 ? `${signed(np.qty, sign)} ${it.name}` : `${sign < 0 ? '-' : '+'}${it.name}`
      clauses.push({ character: who, body, key: `item-${sign < 0 ? 'lose' : 'gain'}:${it.name.toLowerCase()}` })
    }
    return { clauses, length: m[0].length + length }
  }
}

function statClause(who: Character, names: string[], body: (name: string) => string, key: string): Clause[] | null {
  const def = statNamed(who, names, ['number', 'numberWithMax'])
  if (!def) return null
  return [{ character: who, body: body(def.name), key: `${key}:${def.name.toLowerCase()}` }]
}

const V = (forms: string) => `\\b(?:${forms})\\b`
const NUM = '(\\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|fifty|hundred)'
const STAT_WORD = '([A-Za-z]+(?:\\s+[A-Za-z]+)?)'
const CAP_NAME = "(\\[[^\\]]+\\]|\\p{Lu}[\\p{L}'’-]*(?:\\s+(?:of\\s+|the\\s+)?\\p{Lu}[\\p{L}'’-]*){0,3})"

const RULES: Rule[] = [
  // --- HP / MP ---------------------------------------------------------
  {
    id: 'damage',
    re: new RegExp(`${V('took|takes|suffered|suffers|sustained|sustains|received|receives')}\\s+${NUM}\\s+(?:points?\\s+of\\s+)?(?:[a-z]+\\s+)?damage\\b`, 'gi'),
    subject: true,
    build: (m, who) => (who ? wrap(statClause(who, HP_NAMES, (n) => `-${numberOf(m[1])} ${n}`, 'damage')) : null),
  },
  {
    id: 'damage',
    re: new RegExp(`\\b(?:was|is|got|gets)\\s+(?:hit|struck|slashed|stabbed|burned|clawed|bitten)\\s+for\\s+${NUM}(?:\\s+(?:points?\\s+of\\s+)?(?:[a-z]+\\s+)?damage)?\\b`, 'gi'),
    subject: true,
    build: (m, who) => (who ? wrap(statClause(who, HP_NAMES, (n) => `-${numberOf(m[1])} ${n}`, 'damage')) : null),
  },
  {
    id: 'damage',
    re: new RegExp(`\\b(?:dealt|deals|did|does|inflicted|inflicts)\\s+${NUM}\\s+(?:points?\\s+of\\s+)?(?:[a-z]+\\s+)?damage\\s+to\\s+${CAP_NAME}`, 'giu'),
    subject: false,
    build: (m, _who, env, s) => {
      const target = env.resolveName(m[2])
      if (!target || NEGATION.test(s.slice(0, m.index))) return null
      return wrap(statClause(target, HP_NAMES, (n) => `-${numberOf(m[1])} ${n}`, 'damage'))
    },
  },
  {
    id: 'hp-loss',
    re: new RegExp(`${V('lost|loses|spent|spends|used|uses|burned|burns|expended|expends|channell?ed|drained')}\\s+${NUM}\\s+(hp|health|hit\\s?points?|mp|mana(?:\\s+points)?)\\b`, 'gi'),
    subject: true,
    build: (m, who) => {
      if (!who) return null
      const mp = /^(?:mp|mana)/i.test(m[2])
      if (!mp && !/^(?:lost|loses)/i.test(m[0])) return null
      return wrap(statClause(who, mp ? MP_NAMES : HP_NAMES, (n) => `-${numberOf(m[1])} ${n}`, 'hp-loss'))
    },
  },
  {
    id: 'heal-other',
    re: new RegExp(`${V('healed|heals|restored|restores')}\\s+${CAP_NAME}\\s+for\\s+${NUM}(?:\\s+(?:hp|health|hit\\s?points?))?`, 'giu'),
    subject: true,
    build: (m, who, env) => {
      if (!who) return null
      const target = env.resolveName(m[1])
      return target ? wrap(statClause(target, HP_NAMES, (n) => `+${numberOf(m[2])} ${n}`, 'heal')) : null
    },
  },
  {
    id: 'heal',
    re: new RegExp(`${V('healed|heals|recovered|recovers|regained|regains|restored|restores|regenerated|regenerates')}\\s+(?:for\\s+)?${NUM}(?:\\s+(hp|health|hit\\s?points?|mp|mana(?:\\s+points)?))?\\b`, 'gi'),
    subject: true,
    build: (m, who) => {
      if (!who) return null
      if (!m[2] && !/^heal/i.test(m[0])) return null
      const mp = m[2] ? /^(?:mp|mana)/i.test(m[2]) : false
      return wrap(statClause(who, mp ? MP_NAMES : HP_NAMES, (n) => `+${numberOf(m[1])} ${n}`, 'heal'))
    },
  },
  // --- Level / XP / rank -----------------------------------------------
  {
    id: 'level-up',
    re: new RegExp(`${V('gained|gains|earned|earns')}\\s+(a|one|${NUM.slice(1, -1)})\\s+levels?\\b`, 'gi'),
    subject: true,
    build: (m, who) => (who ? wrap(statClause(who, LEVEL_NAMES, (n) => `+${numberOf(m[1])} ${n}`, 'level-up')) : null),
  },
  {
    id: 'level-up',
    re: /\b(?:level(?:l)?ed|levels)\s+up\b/gi,
    subject: true,
    build: (_m, who) => (who ? wrap(statClause(who, LEVEL_NAMES, (n) => `+1 ${n}`, 'level-up')) : null),
  },
  {
    id: 'level-set',
    re: /\b(?:reached|reaches|hit|hits|advanced to|advances to|rose to|rises to|(?:is|was|are|were) now)\s+level\s+(\d+)\b/gi,
    subject: true,
    build: (m, who) => (who ? wrap(statClause(who, LEVEL_NAMES, (n) => `${n} = ${m[1]}`, 'level-set')) : null),
  },
  {
    id: 'xp',
    re: new RegExp(`${V('gained|gains|earned|earns|received|receives|got|gets|collected|collects')}\\s+${NUM}\\s+(?:xp|exp|experience)(?:\\s+points?)?\\b`, 'gi'),
    subject: true,
    build: (m, who) => (who ? wrap(statClause(who, XP_NAMES, (n) => `+${numberOf(m[1])} ${n}`, 'xp')) : null),
  },
  {
    id: 'rank-up',
    re: /\b(?:ranked|ranks)\s+(up|down)\b/gi,
    subject: true,
    build: (m, who) => {
      if (!who || !who.stats.some((s) => s.type === 'rank')) return null
      return { clauses: [{ character: who, body: `rank ${m[1].toLowerCase()}`, key: `rank-${m[1].toLowerCase()}` }] }
    },
  },
  {
    id: 'rank-set',
    re: /\b(?:reached|reaches|advanced to|advances to|rose to|rises to|(?:is|was|are|were) now)\s+rank\s+([A-Z][\w+-]*)/g,
    subject: true,
    build: (m, who) => {
      const def = who?.stats.find((s) => s.type === 'rank')
      if (!who || !def) return null
      return { clauses: [{ character: who, body: `${def.name} = ${m[1]}`, key: `rank-set:${def.name.toLowerCase()}` }] }
    },
  },
  // --- Currency --------------------------------------------------------
  {
    id: 'gold-gain',
    re: new RegExp(`${V('earned|earns|gained|gains|received|receives|found|finds|looted|loots|collected|collects|won|wins|pocketed|pockets|got|gets|made|makes')}\\s+${NUM}\\s+(gold(?:\\s+(?:coins?|pieces?))?|silver(?:\\s+(?:coins?|pieces?))?|copper(?:\\s+(?:coins?|pieces?))?|coins?|gp|crowns|credits)\\b`, 'gi'),
    subject: true,
    build: (m, who) => {
      const def = who ? currencyStat(who, m[2]) : undefined
      if (!who || !def) return null
      return { clauses: [{ character: who, body: `+${numberOf(m[1])} ${def.name}`, key: `gold:${def.name.toLowerCase()}` }] }
    },
  },
  {
    id: 'gold-loss',
    re: new RegExp(`${V('spent|spends|paid|pays|lost|loses|gambled away|squandered')}\\s+${NUM}\\s+(gold(?:\\s+(?:coins?|pieces?))?|silver(?:\\s+(?:coins?|pieces?))?|copper(?:\\s+(?:coins?|pieces?))?|coins?|gp|crowns|credits)\\b`, 'gi'),
    subject: true,
    build: (m, who) => {
      const def = who ? currencyStat(who, m[2]) : undefined
      if (!who || !def) return null
      return { clauses: [{ character: who, body: `-${numberOf(m[1])} ${def.name}`, key: `gold:${def.name.toLowerCase()}` }] }
    },
  },
  // --- Spells / skills -------------------------------------------------
  {
    id: 'learn',
    re: new RegExp(`\\b(?:learned|learnt|learns|mastered|masters|unlocked|unlocks)\\s+(?:the\\s+)?(?:(?:new\\s+)?(?:spell|skill|ability|technique)\\s+)?${CAP_NAME}`, 'gu'),
    subject: true,
    build: (m, who, env) => {
      if (!who) return null
      const name = m[1].replace(/^\[|\]$/g, '').trim()
      if (!name || env.resolveName(name) || /^(?:I|You|He|She|They|It|The)$/.test(name)) return null
      return { clauses: [{ character: who, body: `learns ${name}`, key: `learn:${name.toLowerCase()}` }] }
    },
  },
  {
    id: 'learn',
    re: /\b(?:new\s+(?:skill|spell|ability)|(?:skill|spell|ability)\s+(?:learned|acquired|unlocked|gained|obtained))\s*:\s*\[?([^\]]+?)\]?\s*[.!]?$/gi,
    subject: false,
    build: (m, _who, env, s) => {
      const target = env.possessor(s, m.index) ?? env.systemTarget()
      const name = m[1].trim()
      if (!target || !name) return null
      return { clauses: [{ character: target, body: `learns ${name}`, key: `learn:${name.toLowerCase()}` }] }
    },
  },
  // --- Equipment -------------------------------------------------------
  {
    id: 'equip',
    re: /\b(?:equipped|equips|donned|dons|wielded|wields|strapped on|straps on|put on|puts on|buckled on|buckles on|slipped on|slips on)\b/gi,
    subject: true,
    build: (m, who, env, s) => equipBuild(m, who, env, s, 'loose'),
  },
  {
    id: 'equip',
    re: /\b(?:drew|draws|unsheathed|unsheathes|readied|readies|hefted|hefts)\b/gi,
    subject: true,
    build: (m, who, env, s) => equipBuild(m, who, env, s, 'weapon'),
  },
  // --- Transfers -------------------------------------------------------
  {
    id: 'give',
    re: new RegExp(`\\b(?:gave|gives|handed|hands|tossed|tosses|passed|passes|threw|throws|offered|offers|paid|pays)\\s+${CAP_NAME}(?=\\s)`, 'gu'),
    subject: true,
    build: (m, who, env, s) => {
      const receiver = env.resolveName(m[1])
      if (!who || !receiver || receiver.id === who.id) return null
      const rest = s.slice(m.index + m[0].length)
      const cur = rest.match(new RegExp(`^\\s+${NUM}\\s+(gold(?:\\s+(?:coins?|pieces?))?|silver|copper|coins?|gp|crowns|credits)\\b`, 'i'))
      if (cur) {
        const def = currencyStat(who, cur[2])
        if (!def) return null
        return give(who, receiver, `${numberOf(cur[1])} ${def.name}`, m[0].length + cur[0].length)
      }
      const np = parseNounPhrase(rest, env.matchers)
      if (!np) return null
      const it = resolveItem(np, who, env, true)
      if (!acceptItem(it, 'strict')) return null
      return give(who, receiver, np.qty > 1 ? `${np.qty} ${it.name}` : it.name, m[0].length + np.length)
    },
  },
  {
    id: 'give',
    re: /\b(?:gave|gives|handed|hands|tossed|tosses|passed|passes|threw|throws|offered|offers)\b/gi,
    subject: true,
    build: (m, who, env, s) => {
      if (!who) return null
      const rest = s.slice(m.index + m[0].length)
      const np = parseNounPhrase(rest, env.matchers)
      if (!np) return null
      const to = rest.slice(np.length).match(new RegExp(`^\\s+to\\s+${CAP_NAME}`, 'u'))
      const receiver = to ? env.resolveName(to[1]) : null
      if (!to || !receiver || receiver.id === who.id) return null
      const it = resolveItem(np, who, env, true)
      if (!acceptItem(it, 'strict')) return null
      return give(who, receiver, np.qty > 1 ? `${np.qty} ${it.name}` : it.name, m[0].length + np.length + to[0].length)
    },
  },
  // --- Items -----------------------------------------------------------
  {
    id: 'item-gain',
    re: /\b(?:picked up|picks up|looted|loots|bought|buys|purchased|purchases|pocketed|pockets|collected|collects|obtained|obtains|acquired|acquires|scavenged|scavenges|salvaged|salvages|harvested|harvests|scooped up|scoops up|retrieved|retrieves)\b/gi,
    subject: true,
    build: itemRule(1, 'loose'),
  },
  {
    id: 'item-gain',
    re: /\b(?:found|finds|grabbed|grabs|snatched|snatches|received|receives|took|takes|claimed|claims)\b/gi,
    subject: true,
    build: itemRule(1, 'strict'),
  },
  {
    id: 'item-lose',
    re: /\b(?:sold|sells|discarded|discards|threw away|throws away|tossed away|tosses away|pawned|pawns)\b/gi,
    subject: true,
    build: itemRule(-1, 'loose'),
  },
  {
    id: 'item-lose',
    re: /\b(?:dropped|drops|lost|loses)\b/gi,
    subject: true,
    build: itemRule(-1, 'strict'),
  },
  {
    id: 'item-lose',
    re: /\b(?:drank|drinks|quaffed|quaffs|ate|eats|consumed|consumes|downed|downs|gulped|gulps|swallowed|swallows)\b/gi,
    subject: true,
    build: itemRule(-1, 'consume'),
  },
  {
    id: 'item-lose',
    re: /\b(?:used|uses|applied|applies|read|reads)\b/gi,
    subject: true,
    build: itemRule(-1, 'use'),
  },
  // --- Attributes / numeric stats (system-message style) ---------------
  {
    id: 'stat',
    re: new RegExp(`(?<![\\w])([+-])\\s?(\\d+)\\s+${STAT_WORD}`, 'g'),
    subject: false,
    build: (m, _who, env, s) => {
      const target = env.possessor(s, m.index) ?? env.systemTarget()
      if (!target) return null
      const one = numericStatName(target, m[3].split(/\s+/)[0])
      const two = numericStatName(target, m[3])
      const name = two ?? one
      if (!name) return null
      const sign = m[1] === '-' ? -1 : 1
      return {
        clauses: [{ character: target, body: `${signed(Number(m[2]), sign)} ${name}`, key: `stat:${name.toLowerCase()}` }],
      }
    },
  },
  {
    id: 'stat',
    re: /\b([A-Za-z]+)\s?([+-])\s?(\d+)\b/g,
    subject: false,
    build: (m, _who, env, s) => {
      const target = env.possessor(s, m.index) ?? env.systemTarget()
      const name = target ? numericStatName(target, m[1]) : null
      if (!target || !name) return null
      const sign = m[2] === '-' ? -1 : 1
      return {
        clauses: [{ character: target, body: `${signed(Number(m[3]), sign)} ${name}`, key: `stat:${name.toLowerCase()}` }],
      }
    },
  },
  {
    id: 'stat',
    re: /\b([A-Za-z]+)\s+(?:has\s+|have\s+)?(increased|rose|risen|went up|gone up|improved|grew|grown|decreased|dropped|fell|fallen|went down|gone down|declined)\s+(by|to)\s+(\d+)\b/gi,
    subject: false,
    build: (m, _who, env, s) => {
      const target = env.possessor(s, m.index) ?? env.systemTarget()
      const name = target ? numericStatName(target, m[1]) : null
      if (!target || !name) return null
      const sign = /^(?:decreased|dropped|fell|fallen|went down|gone down|declined)$/i.test(m[2]) ? -1 : 1
      const body = m[3].toLowerCase() === 'to' ? `${name} = ${m[4]}` : `${signed(Number(m[4]), sign)} ${name}`
      return { clauses: [{ character: target, body, key: `stat:${name.toLowerCase()}` }] }
    },
  },
  {
    id: 'level-up',
    re: /^\s*level\s*up\s*!*\s*$/gi,
    subject: false,
    build: (_m, _who, env) => {
      const target = env.systemTarget()
      return target ? wrap(statClause(target, LEVEL_NAMES, (n) => `+1 ${n}`, 'level-up')) : null
    },
  },
]

function wrap(clauses: Clause[] | null): { clauses: Clause[] } | null {
  return clauses ? { clauses } : null
}

function give(giver: Character, receiver: Character, what: string, length: number): { clauses: Clause[]; length: number } {
  return {
    clauses: [{ character: giver, body: `gives ${receiver.name} ${what}`, key: `give:${what.replace(/^\d+\s+/, '').toLowerCase()}` }],
    length,
  }
}

function equipBuild(m: RegExpExecArray, who: Character | null, env: Env, s: string, mode: ItemMode) {
  if (!who || who.equipmentSlots.length === 0) return null
  const rest = s.slice(m.index + m[0].length)
  const np = parseNounPhrase(rest, env.matchers)
  if (!np) return null
  const it = resolveItem(np, who, env, true)
  if (!acceptItem(it, mode)) return null
  return {
    clauses: [{ character: who, body: `equips ${it.name}`, key: `equip:${it.name.toLowerCase()}` }],
    length: m[0].length + np.length,
  }
}

// ---------------------------------------------------------------------------
// Sentence cleanup
// ---------------------------------------------------------------------------

interface Cleaned {
  text: string
  system: boolean
}

function countQuotes(s: string): number {
  return (s.match(/["“”]/g) ?? []).length
}

/** Strip markup and dialogue; detect system messages. Null when nothing is left to read. */
function cleanSentence(input: SentenceInput): Cleaned | null {
  let s = input.sentence
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/[*_`]+/g, '')
    .replace(/[’‘]/g, "'")
    .replace(/[−–—]/g, ' - ')
    .replace(/^\s*(?:>\s*)+/, '')
    .replace(/^\s*#+\s*/, '')
    .trim()
  if (!s) return null

  // A bracketed system message reads even when quoted.
  const unquoted = s.replace(/^["“]\s*/, '').replace(/\s*["”]$/, '')
  const bracket = unquoted.match(/^\[([\s\S]*)\]\s*[.!]?$/)
  if (bracket) {
    const inner = bracket[1].replace(SYSTEM_PREFIX, '').replace(/^system\]\s*/i, '').trim()
    return inner ? { text: inner, system: true } : null
  }
  if (/^\[system\]\s*/i.test(s)) return { text: s.replace(/^\[system\]\s*/i, '').trim(), system: true }
  if (SYSTEM_PREFIX.test(s) && /^(?:system|notification|alert|announcement)\b/i.test(s)) {
    return { text: s.replace(SYSTEM_PREFIX, '').trim(), system: true }
  }

  // Questions are never statements of fact.
  if (/\?["”')\]]*\s*$/.test(s)) return null

  // Dialogue: a sentence that opens inside a quote loses everything up to the close.
  if (countQuotes(input.before) % 2 === 1) {
    const close = s.search(/["”]/)
    s = close >= 0 ? s.slice(close + 1) : ''
  }
  s = s.replace(/“[^”]*”?/g, ' ').replace(/"[^"]*"?/g, ' ').replace(/”/g, ' ')
  s = s.replace(/\s+/g, ' ').trim()
  if (!s) return null

  // Bare stat lines ("+2 DEX.", "STR +1") read like system messages.
  const bare = /^(?:[+-]\s?\d+\s+[A-Za-z]+|[A-Za-z]+\s?[+-]\s?\d+)[.!]?$/.test(s)
  return { text: s, system: bare }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

function overlaps(a: [number, number], ranges: Array<[number, number]>): boolean {
  return ranges.some(([f, t]) => a[0] < t && f < a[1])
}

export function suggestFromSentence(input: SentenceInput, ctx: ProseSuggestContext): ProseSuggestion | null {
  if (ctx.characters.length === 0) return null
  if (/<!--\s*stat:/.test(input.sentence)) return null
  const cleaned = cleanSentence(input)
  if (!cleaned) return null
  const s = cleaned.text
  if (!cleaned.system && SENTENCE_GUARD.test(s)) return null

  const matchers = nameMatchers(ctx.characters)
  const stateCache = new Map<string, CharacterState>()
  const stateOf = (c: Character): CharacterState => {
    let st = stateCache.get(c.id)
    if (!st) {
      st = ctx.stateFor?.(c.id) ?? { base: c.baseValues, equipped: {}, activeBuffs: [] }
      stateCache.set(c.id, st)
    }
    return st
  }
  const knownItems = new Set<string>(ctx.knownItems ?? [])
  // Base values only — state at the cursor is computed lazily, for the subject alone.
  for (const c of ctx.characters) for (const n of ownedItemsPlain(c.stats, c.baseValues)) knownItems.add(n)

  const mentions = findMentions(s, matchers, cleaned.system)
  const resolveName = (text: string): Character | null => {
    const t = text.replace(/^\[|\]$/g, '').trim()
    const hit = matchers.find(({ re }) => {
      re.lastIndex = 0
      const m = re.exec(t)
      return m !== null && m.index === 0 && m[0].length === t.length
    })
    return hit?.character ?? null
  }
  const onlyNamed = (text: string): Character | null => {
    const named = namedIn(text, matchers)
    const distinct = new Set(named.map((c) => c.id))
    return distinct.size === 1 ? named[0] : null
  }
  const systemTarget = (): Character | null => {
    const inSentence = namedIn(s, matchers)
    if (inSentence.length) return new Set(inSentence.map((c) => c.id)).size === 1 ? inSentence[0] : null
    const inBefore = namedIn(input.before, matchers)
    if (inBefore.length) return new Set(inBefore.map((c) => c.id)).size === 1 ? inBefore[0] : null
    const inRecent = namedIn(input.recent ?? '', matchers)
    if (inRecent.length) return inRecent[inRecent.length - 1]
    return ctx.characters.length === 1 ? ctx.characters[0] : null
  }
  const resolveMention = (m: Mention): Character | null => {
    if (m.character) return m.character
    if (m.pronoun === 'you') return systemTarget()
    return onlyNamed(`${input.before} ${s.slice(0, m.start)}`)
  }
  const possessor = (text: string, at: number): Character | null | undefined => {
    const lead = text.slice(0, at)
    const pm = lead.match(/(\S+)\s+$/)
    if (!pm) return undefined
    const word = pm[1]
    const named = word.match(/^(.+?)['’]s$/)
    if (named) return resolveName(named[1]) ?? null
    if (/^(?:his|her|their)$/i.test(word)) return onlyNamed(`${input.before} ${lead}`)
    if (/^your$/i.test(word)) return cleaned.system ? systemTarget() : null
    return undefined
  }
  const subjectAt = (verbStart: number): Character | null => {
    const prior = mentions.filter((m) => m.end <= verbStart)
    const last = prior[prior.length - 1]
    if (!last) return null
    const gap = s.slice(last.end, verbStart)
    if (!last.possessive && DIRECT_GAP.test(gap) && !NEGATION.test(gap)) return resolveMention(last)
    for (let i = prior.length - 1; i >= 0; i--) {
      const m = prior[i]
      if (m.possessive || !CLAUSE_START.test(s.slice(0, m.start))) continue
      const tail = s.slice(m.end, verbStart).match(CONNECTOR_TAIL)
      if (!tail || NEGATION.test(tail[0])) return null
      return resolveMention(m)
    }
    return null
  }

  const env: Env = {
    ctx,
    matchers,
    stateOf,
    knownItems: [...knownItems],
    systemTarget,
    resolveName,
    possessor,
  }

  const used: Array<[number, number]> = []
  const found: Array<{ at: number; clause: Clause; rule: string }> = []
  for (const rule of RULES) {
    rule.re.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = rule.re.exec(s)) !== null) {
      if (m[0].length === 0) {
        rule.re.lastIndex++
        continue
      }
      const span: [number, number] = [m.index, m.index + m[0].length]
      if (overlaps(span, used)) continue
      let who: Character | null = null
      if (rule.subject) {
        who = subjectAt(m.index)
        if (!who) continue
      }
      const res = rule.build(m, who, env, s)
      if (!res || res.clauses.length === 0) continue
      used.push([m.index, m.index + (res.length ?? m[0].length)])
      for (const clause of res.clauses) found.push({ at: m.index, clause, rule: rule.id })
    }
  }
  if (found.length === 0) return null
  found.sort((a, b) => a.at - b.at)

  // Drop muted clauses and any the quick-entry parser can't record.
  const quickCtx = { characters: ctx.characters, stateFor: (id: string) => {
    const c = ctx.characters.find((ch) => ch.id === id)
    return c ? stateOf(c) : undefined
  } }
  const clauses = found
    .map((f) => f.clause)
    .filter((c) => !ctx.muted?.has(c.key))
    .filter((c) => parseQuickEntry(`${c.character.name} ${c.body}`, quickCtx).ok)
  if (clauses.length === 0) return null

  // Group consecutive clauses by character: "Kael -15 HP, -Iron Sword".
  const groups: Array<{ character: Character; bodies: string[] }> = []
  for (const c of clauses) {
    const last = groups[groups.length - 1]
    if (last && last.character.id === c.character.id) last.bodies.push(c.body)
    else groups.push({ character: c.character, bodies: [c.body] })
  }
  const text = groups.map((g) => `${g.character.name} ${g.bodies.join(', ')}`).join(', ')
  if (!parseQuickEntry(text, quickCtx).ok) return null
  return {
    text,
    label: groups.map((g) => `${g.character.name} · ${g.bodies.join(', ')}`).join('  '),
    characterIds: [...new Set(groups.map((g) => g.character.id))],
    keys: [...new Set(clauses.map((c) => c.key))],
  }
}

function ownedItemsPlain(stats: StatDefinition[], values: Record<string, StatValue>): string[] {
  const out: string[] = []
  for (const def of stats) {
    if (def.type === 'inventory' || def.type === 'list') out.push(...itemNamesOf(values[def.id]))
  }
  return out
}

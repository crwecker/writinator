export interface Document {
  id: string
  name: string
  content: string | null
  parentId?: string
  icon?: string       // Lucide icon name
  color?: string      // hex color
  createdAt: string
  updatedAt: string
}

export interface Book {
  id: string
  title: string
  documents: Document[]
  createdAt: string
  updatedAt: string
}

export interface UnsplashImage {
  id: string
  url: string
  width: number
  height: number
  photographer: string
  photographerUrl: string
  downloadLocationUrl: string
}

// RPG / Quest types — declared before ImageRevealSession because it references them

export type QuestDifficulty = 'easy' | 'medium' | 'hard' | 'epic'
export type QuestResult = 'success' | 'failure' | 'abandoned'

export interface ActiveEffect {
  type: string
  remainingValue: number
}

export interface ImageRevealSession {
  id: string
  unsplashId?: string
  imageUrl: string
  imageWidth: number
  imageHeight: number
  wordGoal: number
  wordsWritten: number
  currentLevel: number  // index into PIXEL_LEVELS array
  completed: boolean
  completedAt?: string
  startedAt: string
  photographer?: string
  photographerUrl?: string
  // Optional timer modifier — when set, quest is timed
  timeMinutes?: number
  pausedDuration?: number   // default 0, only for timed quests
  result?: QuestResult      // success/failure/abandoned — only for timed quests
  coinsEarned?: number      // recorded at completion
}

export interface Snapshot {
  id: string
  documentId: string
  content: string
  wordCount: number
  timestamp: string
  trigger: 'manual' | 'switch' | 'auto' | 'closeBook'
}

export interface TextStyle {
  fontFamily?: string        // CSS font-family value
  fontSize?: number          // px
  lineHeight?: number        // unitless multiplier (e.g. 1.75)
  color?: string             // CSS color
  letterSpacing?: string     // CSS letter-spacing (e.g. '0.02em')
}

export interface HeadingStyle extends TextStyle {
  fontWeight?: string        // e.g. '700', '600'
}

export interface NamedStyle extends TextStyle {
  fontWeight?: string
  fontStyle?: string           // 'italic' | 'normal'
  textDecoration?: string      // 'underline' | 'line-through'
  backgroundColor?: string     // for highlights
}

export interface DocumentStyles {
  body?: TextStyle
  h1?: HeadingStyle
  h2?: HeadingStyle
  h3?: HeadingStyle
  blockquote?: TextStyle
  code?: TextStyle
  namedStyles?: Record<string, NamedStyle>
}

export interface EditorPreferences {
  vimMode: boolean
  fontFamily: 'serif' | 'sans' | 'mono'
  fontSize: number
  distractionFree: boolean
  renderMode: 'source' | 'rendered'
  sidebarOpen: boolean
  collapsedDocumentIds: string[]
}

export interface GlobalSettings {
  documentStyles?: DocumentStyles
}

export interface WritinatorFile {
  version: 3
  book: Book
  snapshots: Record<string, Snapshot[]>  // keyed by document ID
  globalSettings: GlobalSettings
  characters: Character[]
  markers: Record<string, StatDelta[]>   // keyed by marker UUID
}

// ---------------------------------------------------------------------------
// Character Tracker
// ---------------------------------------------------------------------------

export type StatType =
  | 'number'
  | 'numberWithMax'
  | 'list'
  | 'text'
  | 'attributeSet'
  | 'rank'

export interface StatDefinition {
  id: string                 // stable id within the character
  name: string               // display name (e.g., "HP", "Favor")
  type: StatType
  // Optional configuration per stat type
  attributeKeys?: string[]   // for attributeSet — ordered keys (e.g., ['STR','DEX',...])
  rankTiers?: string[]       // for rank — ordered tiers (e.g., ['F','E','D','C','B','A','S'])
}

// Value shapes, one per StatType
export interface NumberStatValue {
  kind: 'number'
  value: number
}
export interface NumberWithMaxStatValue {
  kind: 'numberWithMax'
  value: number
  max: number
}
export interface ListStatValue {
  kind: 'list'
  items: string[]
}
export interface TextStatValue {
  kind: 'text'
  value: string
}
export interface AttributeSetStatValue {
  kind: 'attributeSet'
  values: Record<string, number>
}
export interface RankStatValue {
  kind: 'rank'
  tier: string               // must be one of StatDefinition.rankTiers
}

export type StatValue =
  | NumberStatValue
  | NumberWithMaxStatValue
  | ListStatValue
  | TextStatValue
  | AttributeSetStatValue
  | RankStatValue

export interface StatModifier {
  statId: string
  kind: 'flat' | 'maxFlat'
  amount: number
  // Optional — for attributeSet modifiers; when set, applies to a specific key
  attributeKey?: string
}

export type StatDeltaOp =
  | { kind: 'adjust'; statId: string; delta: number; attributeKey?: string }
  | { kind: 'set'; statId: string; value: StatValue }
  | { kind: 'maxAdjust'; statId: string; delta: number }
  | { kind: 'listAdd'; statId: string; items: string[] }
  | { kind: 'listRemove'; statId: string; items: string[] }
  | { kind: 'equip'; slot: string; itemId: string; itemName?: string; modifiers: StatModifier[] }
  | { kind: 'unequip'; slot: string }
  | {
      kind: 'buffApply'
      buffId: string
      buffName?: string
      modifiers: StatModifier[]
      expiresAfter?: number   // optional: number of subsequent markers before auto-expiry
    }
  | { kind: 'buffRemove'; buffId: string }
  | {
      kind: 'rankChange'
      statId: string
      direction: 'up' | 'down' | 'set'
      value?: string           // required when direction === 'set'
    }

export interface StatDelta {
  id: string                  // uuid — matches one entry in the ops list of a marker
  characterId: string
  op: StatDeltaOp
  note?: string
}

export interface Character {
  id: string
  name: string
  color: string               // hex (e.g., '#f87171')
  stats: StatDefinition[]     // ordered; defines what this character tracks
  baseValues: Record<string, StatValue>   // keyed by StatDefinition.id
  equipmentSlots: string[]    // named slots (e.g., 'Weapon', 'Armor', 'Accessory')
  createdAt: string
  updatedAt: string
}

export interface MarkerEntry {
  id: string                  // uuid — matches `<!-- stat:uuid -->`
  deltas: StatDelta[]         // compound deltas allowed (e.g., level-up bundles)
}

// ---------------------------------------------------------------------------
// Layered runtime state used by the state-computation engine (Phase 2+)
// ---------------------------------------------------------------------------

export interface EquippedItem {
  itemId: string
  itemName?: string
  modifiers: StatModifier[]
}

export interface ActiveBuff {
  buffId: string
  buffName?: string
  modifiers: StatModifier[]
  /** Remaining number of markers before auto-expiry. Undefined = persistent. */
  remaining?: number
}

/**
 * Layered character state as computed by `computeStateAt`.
 * `base` is mutated by most delta ops. Equipment and buffs are tracked
 * separately so unequip / buff-expire do not need counter-deltas.
 */
export interface CharacterState {
  base: Record<string, StatValue>
  equipped: Record<string, EquippedItem>       // keyed by slot name
  activeBuffs: ActiveBuff[]
}

/** Delta-marker reference discovered by extracting markers from document content. */
export interface DeltaMarkerRef {
  kind: 'delta'
  id: string
  offset: number
}

/** Statblock-marker reference discovered by extracting markers from document content. */
export interface StatblockMarkerRef {
  kind: 'statblock'
  characterId: string
  offset: number
  options: Record<string, string>
}

export type ExtractedMarker = DeltaMarkerRef | StatblockMarkerRef

// ---------------------------------------------------------------------------
// Phase 8 — History sampling + consistency checking
// ---------------------------------------------------------------------------

/** A single sample of a character's effective state at a point in the book. */
export interface HistorySample {
  /** Marker index within the walk (0 = base/initial sample). */
  markerIndex: number
  /** Offset inside the document where the marker lives. 0 for the base sample. */
  offset: number
  /** Document id where the marker lives (first document for the base sample). */
  documentId: string
  /** Document display name (denormalized for rendering). */
  documentName: string
  /** Effective stat values at this point. */
  effective: Record<string, StatValue>
  /** Word index (approximate) within the book tree prefix. */
  wordIndex: number
}

export type ConsistencyIssue =
  | {
      kind: 'orphanMarker'
      markerId: string
      documentId: string
      offset: number
    }
  | {
      kind: 'inverseOrphan'
      markerId: string
    }
  | {
      kind: 'impossibleValue'
      characterId: string
      statId: string
      reason: string
      documentId?: string
      offset?: number
    }
  | {
      kind: 'missingSlot'
      characterId: string
      slot: string
      markerId: string
    }
  | {
      kind: 'unequipEmpty'
      characterId: string
      slot: string
      markerId: string
    }

export interface RecentFile {
  handle: FileSystemFileHandle
  name: string
  lastOpenedAt: number
}

export type ItemCategory = 'weapon' | 'armor' | 'consumable'
export type ItemRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary'

export interface BaseItem {
  id: string
  name: string
  description: string
  category: ItemCategory
  rarity: ItemRarity
  price: number
  icon: string
}

export interface WeaponItem extends BaseItem {
  category: 'weapon'
  wordMultiplier: number
}

export interface ArmorItem extends BaseItem {
  category: 'armor'
  timeBonus: number
}

export interface ConsumableItem extends BaseItem {
  category: 'consumable'
  effect: string
  effectValue: number
}

export type Item = WeaponItem | ArmorItem | ConsumableItem

export interface EquipmentSlots {
  weapon: string
  armor: string
}

export interface PlayerStats {
  totalCompleted: number
  totalWords: number
  totalCoins: number
}

// Writeathon types
export type BoardQuestType = 'permanent' | 'daily' | 'villager'
export type MilestoneTier = 'apprentice' | 'journeyman' | 'master' | 'legendary'

export interface WriteathonConfig {
  id: string
  startDate: string
  startingWordCount: number
  targetWordCount: number
  totalBlocks: number
  wordsPerBlock: number
  active: boolean
  completedAt?: string
  paused?: boolean
}

export interface WriteathonMilestone {
  blockNumber: number
  targetWordCount: number
  completed: boolean
  completedAt?: string
  coinsAwarded: number
  tier: MilestoneTier
}

export interface BoardQuest {
  id: string
  type: BoardQuestType
  wordGoal: number
  timeMinutes?: number
  title: string
  description: string
  coinReward: number
  bonusCoins?: number
  accepted: boolean
  acceptedAt?: string
  imageRevealSessionId?: string
  createdAt: string
  completedAt?: string
}

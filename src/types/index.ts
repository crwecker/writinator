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
  version: 2
  book: Book
  snapshots: Record<string, Snapshot[]>  // keyed by document ID
  globalSettings: GlobalSettings
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

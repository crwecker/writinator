export interface Chapter {
  id: string
  name: string
  content: string | null
  parentId?: string
  createdAt: string
  updatedAt: string
}

export interface Book {
  id: string
  title: string
  chapters: Chapter[]
  documentStyles?: DocumentStyles
  createdAt: string
  updatedAt: string
}

// Quest system
export interface Quest {
  id: string
  title: string
  description: string
  image: string          // URL or path to the quest reward image
  wordsToWin: number
  winningMessage: string
}

export interface QuestArc {
  id: string
  title: string
  description: string
  quests: Quest[]
}

export interface QuestProgress {
  questId: string
  arcId: string
  wordsAtStart: number   // total word count when quest was started
  wordsWritten: number   // words written toward this quest
  completed: boolean
  completedAt?: string
}

export interface UnsplashImage {
  url: string
  width: number
  height: number
  photographer: string
  photographerUrl: string
  downloadLocationUrl: string
}

export interface ImageRevealSession {
  id: string
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
}

export interface Snapshot {
  id: string
  chapterId: string
  content: string
  wordCount: number
  timestamp: string
  trigger: 'manual' | 'switch' | 'auto'
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
}

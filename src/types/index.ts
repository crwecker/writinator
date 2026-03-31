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

export interface Snapshot {
  id: string
  chapterId: string
  content: string
  wordCount: number
  timestamp: string
  trigger: 'manual' | 'switch' | 'auto'
}

export interface EditorPreferences {
  vimMode: boolean
  fontFamily: 'serif' | 'sans' | 'mono'
  fontSize: number
  distractionFree: boolean
}

export interface Chapter {
  id: string
  name: string
  content: string | null
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

export interface Snapshot {
  id: string
  content: string
  wordCount: number
  timestamp: string
}

export interface EditorPreferences {
  vimMode: boolean
  fontFamily: 'serif' | 'sans' | 'mono'
  fontSize: number
  distractionFree: boolean
}

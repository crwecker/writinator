import type { Book, Document, Snapshot, WritinatorFile, GlobalSettings, DocumentStyles } from '../types'

// Shape of the old format (pre-v2): a plain Book with `chapters` instead of `documents`
interface OldChapter {
  id: string
  name: string
  content: string | null
  parentId?: string
  createdAt: string
  updatedAt: string
}

interface OldBook {
  id: string
  title: string
  chapters: OldChapter[]
  documentStyles?: DocumentStyles
  createdAt: string
  updatedAt: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isOldFormat(data: Record<string, unknown>): data is Record<string, unknown> & OldBook {
  return (
    !('version' in data) &&
    typeof data.id === 'string' &&
    typeof data.title === 'string' &&
    Array.isArray(data.chapters)
  )
}

function isWritinatorFile(data: Record<string, unknown>): data is Record<string, unknown> & WritinatorFile {
  return (
    data.version === 2 &&
    isRecord(data.book) &&
    typeof (data.book as Record<string, unknown>).id === 'string' &&
    typeof (data.book as Record<string, unknown>).title === 'string' &&
    Array.isArray((data.book as Record<string, unknown>).documents)
  )
}

function migrateOldBook(old: OldBook): WritinatorFile {
  const documents: Document[] = old.chapters.map((ch) => ({
    id: ch.id,
    name: ch.name,
    content: ch.content,
    ...(ch.parentId ? { parentId: ch.parentId } : {}),
    createdAt: ch.createdAt,
    updatedAt: ch.updatedAt,
  }))

  const globalSettings: GlobalSettings = {}
  if (old.documentStyles) {
    globalSettings.documentStyles = old.documentStyles
  }

  const book: Book = {
    id: old.id,
    title: old.title,
    documents,
    createdAt: old.createdAt,
    updatedAt: old.updatedAt,
  }

  return {
    version: 2,
    book,
    snapshots: {},
    globalSettings,
  }
}

/**
 * Migrate any file data (old or new format) into a WritinatorFile.
 * - Old format: plain Book JSON with `chapters` array, no `version` field
 * - New format: WritinatorFile envelope with `version: 2`
 */
export function migrateFile(data: unknown): WritinatorFile {
  if (!isRecord(data)) {
    throw new Error('Invalid file: expected a JSON object')
  }

  // Already v2 format
  if (isWritinatorFile(data)) {
    return {
      version: 2,
      book: data.book as Book,
      snapshots: (data.snapshots ?? {}) as Record<string, Snapshot[]>,
      globalSettings: (data.globalSettings ?? {}) as GlobalSettings,
    }
  }

  // Old format: bare Book with chapters
  if (isOldFormat(data)) {
    return migrateOldBook(data as OldBook)
  }

  throw new Error('Invalid file: unrecognized format')
}

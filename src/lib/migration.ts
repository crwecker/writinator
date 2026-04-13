import type {
  Book,
  Character,
  Storylet,
  DocumentStyles,
  GlobalSettings,
  NamedStyle,
  Snapshot,
  StatDelta,
  WritinatorFile,
} from '../types'

/**
 * Flatten old DocumentStyles shape (body/h1/.../namedStyles) into flat Record<string, NamedStyle>.
 */
function flattenDocumentStyles(raw: unknown): DocumentStyles | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const obj = raw as Record<string, unknown>
  if (!('namedStyles' in obj)) return obj as DocumentStyles
  const { namedStyles, ...rest } = obj as { namedStyles?: Record<string, NamedStyle> } & Record<string, NamedStyle>
  return { ...(rest as Record<string, NamedStyle>), ...(namedStyles ?? {}) }
}

function flattenGlobalSettings(gs: GlobalSettings | undefined): GlobalSettings {
  if (!gs) return {}
  return gs.documentStyles
    ? { ...gs, documentStyles: flattenDocumentStyles(gs.documentStyles) }
    : gs
}

// Shape of the old format (pre-v2): a plain Book with `chapters` instead of `storylets`
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

// v3 book shape (used `documents` instead of `storylets`)
interface LegacyV3Book {
  id: string
  title: string
  documents: Storylet[]
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

function isV2File(data: Record<string, unknown>): boolean {
  return (
    data.version === 2 &&
    isRecord(data.book) &&
    typeof (data.book as Record<string, unknown>).id === 'string' &&
    typeof (data.book as Record<string, unknown>).title === 'string' &&
    Array.isArray((data.book as Record<string, unknown>).documents)
  )
}

function isV3File(data: Record<string, unknown>): boolean {
  return (
    data.version === 3 &&
    isRecord(data.book) &&
    typeof (data.book as Record<string, unknown>).id === 'string' &&
    typeof (data.book as Record<string, unknown>).title === 'string' &&
    Array.isArray((data.book as Record<string, unknown>).documents)
  )
}

function isV4File(data: Record<string, unknown>): boolean {
  return (
    data.version === 4 &&
    isRecord(data.book) &&
    typeof (data.book as Record<string, unknown>).id === 'string' &&
    typeof (data.book as Record<string, unknown>).title === 'string' &&
    Array.isArray((data.book as Record<string, unknown>).storylets)
  )
}

function v3BookToV4(book: LegacyV3Book): Book {
  return {
    id: book.id,
    title: book.title,
    storylets: book.documents,
    createdAt: book.createdAt,
    updatedAt: book.updatedAt,
  }
}

function migrateOldBook(old: OldBook): WritinatorFile {
  const storylets: Storylet[] = old.chapters.map((ch) => ({
    id: ch.id,
    name: ch.name,
    content: ch.content,
    ...(ch.parentId ? { parentId: ch.parentId } : {}),
    createdAt: ch.createdAt,
    updatedAt: ch.updatedAt,
  }))

  const globalSettings: GlobalSettings = {}
  if (old.documentStyles) {
    globalSettings.documentStyles = flattenDocumentStyles(old.documentStyles)
  }

  const book: Book = {
    id: old.id,
    title: old.title,
    storylets,
    createdAt: old.createdAt,
    updatedAt: old.updatedAt,
  }

  return {
    version: 4,
    book,
    snapshots: {},
    globalSettings,
    characters: [],
    markers: {},
  }
}

/**
 * Migrate any file data (old/v2/v3/v4) into a v4 WritinatorFile.
 */
export function migrateFile(data: unknown): WritinatorFile {
  if (!isRecord(data)) {
    throw new Error('Invalid file: expected a JSON object')
  }

  // v4 — already current
  if (isV4File(data)) {
    return {
      version: 4,
      book: data.book as Book,
      snapshots: (data.snapshots ?? {}) as Record<string, Snapshot[]>,
      globalSettings: flattenGlobalSettings(data.globalSettings as GlobalSettings | undefined),
      characters: (data.characters ?? []) as Character[],
      markers: (data.markers ?? {}) as Record<string, StatDelta[]>,
    }
  }

  // v3 → v4: rename book.documents → book.storylets
  if (isV3File(data)) {
    const legacyBook = data.book as unknown as LegacyV3Book
    return {
      version: 4,
      book: v3BookToV4(legacyBook),
      snapshots: (data.snapshots ?? {}) as Record<string, Snapshot[]>,
      globalSettings: flattenGlobalSettings(data.globalSettings as GlobalSettings | undefined),
      characters: (data.characters ?? []) as Character[],
      markers: (data.markers ?? {}) as Record<string, StatDelta[]>,
    }
  }

  // v2 → v4: add empty characters + markers, rename documents → storylets
  if (isV2File(data)) {
    const legacyBook = data.book as unknown as LegacyV3Book
    return {
      version: 4,
      book: v3BookToV4(legacyBook),
      snapshots: (data.snapshots ?? {}) as Record<string, Snapshot[]>,
      globalSettings: flattenGlobalSettings(data.globalSettings as GlobalSettings | undefined),
      characters: [],
      markers: {},
    }
  }

  // Old format: bare Book with chapters
  if (isOldFormat(data)) {
    return migrateOldBook(data as OldBook)
  }

  throw new Error('Invalid file: unrecognized format')
}

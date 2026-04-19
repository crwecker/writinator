import type {
  Book,
  Character,
  Storylet,
  DocumentStyles,
  GlobalSettings,
  ImageRevealFileData,
  MetricsFileData,
  NamedStyle,
  NotesFileData,
  PlayerFileData,
  PublishedSnapshot,
  Snapshot,
  StatDelta,
  WritinatorFile,
  WriteathonFileData,
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

function isV5File(data: Record<string, unknown>): boolean {
  return (
    data.version === 5 &&
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

type V4File = Omit<WritinatorFile, 'version' | 'publishedSnapshots' | 'saveCounter' | 'player' | 'quests' | 'writeathon' | 'metrics' | 'notes'> & { version: 4 }
type V5File = Omit<WritinatorFile, 'version' | 'saveCounter' | 'player' | 'quests' | 'writeathon' | 'metrics' | 'notes'> & { version: 5 }
type V6File = Omit<WritinatorFile, 'version' | 'notes'> & { version: 6 }
type V7File = Omit<WritinatorFile, 'version' | 'notes'> & { version: 7 }

function migrateOldBook(old: OldBook): V4File {
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

function migrateToV5(v4: V4File): V5File {
  return {
    version: 5,
    book: v4.book,
    snapshots: v4.snapshots,
    publishedSnapshots: {},
    globalSettings: v4.globalSettings,
    characters: v4.characters,
    markers: v4.markers,
  }
}

function isV6File(data: Record<string, unknown>): boolean {
  return (
    data.version === 6 &&
    typeof data.saveCounter === 'number' &&
    isRecord(data.book) &&
    typeof (data.book as Record<string, unknown>).id === 'string' &&
    typeof (data.book as Record<string, unknown>).title === 'string' &&
    Array.isArray((data.book as Record<string, unknown>).storylets)
  )
}

function migrateToV6(v5: V5File): V6File {
  return {
    version: 6,
    book: v5.book,
    snapshots: v5.snapshots,
    publishedSnapshots: v5.publishedSnapshots,
    globalSettings: v5.globalSettings,
    characters: v5.characters,
    markers: v5.markers,
    saveCounter: 0,
  }
}

function isV7File(data: Record<string, unknown>): boolean {
  return (
    data.version === 7 &&
    typeof data.saveCounter === 'number' &&
    isRecord(data.book) &&
    typeof (data.book as Record<string, unknown>).id === 'string' &&
    typeof (data.book as Record<string, unknown>).title === 'string' &&
    Array.isArray((data.book as Record<string, unknown>).storylets)
  )
}

function migrateToV7(v6: V6File): V7File {
  return {
    version: 7,
    book: v6.book,
    snapshots: v6.snapshots,
    publishedSnapshots: v6.publishedSnapshots,
    globalSettings: v6.globalSettings,
    characters: v6.characters,
    markers: v6.markers,
    saveCounter: v6.saveCounter,
    // cross-store sections absent → hydrate no-ops on load
  }
}

function isV8File(data: Record<string, unknown>): boolean {
  return (
    data.version === 8 &&
    typeof data.saveCounter === 'number' &&
    isRecord(data.book) &&
    typeof (data.book as Record<string, unknown>).id === 'string' &&
    typeof (data.book as Record<string, unknown>).title === 'string' &&
    Array.isArray((data.book as Record<string, unknown>).storylets)
  )
}

function migrateToV8(v7: V7File): WritinatorFile {
  return {
    version: 8,
    book: v7.book,
    snapshots: v7.snapshots,
    publishedSnapshots: v7.publishedSnapshots,
    globalSettings: v7.globalSettings,
    characters: v7.characters,
    markers: v7.markers,
    saveCounter: v7.saveCounter,
    player: v7.player,
    quests: v7.quests,
    writeathon: v7.writeathon,
    metrics: v7.metrics,
    // notes absent → hydrate no-op on load, preserving localforage state
  }
}

/**
 * Extract cross-store sections from a raw parsed file object.
 * Returns undefined for each absent/invalid section to allow hydrate no-ops.
 */
function extractExternalSections(data: Record<string, unknown>): Pick<WritinatorFile, 'player' | 'quests' | 'writeathon' | 'metrics' | 'notes'> {
  return {
    player: isRecord(data.player) ? (data.player as unknown as PlayerFileData) : undefined,
    quests: isRecord(data.quests) ? (data.quests as unknown as ImageRevealFileData) : undefined,
    writeathon: isRecord(data.writeathon) ? (data.writeathon as unknown as WriteathonFileData) : undefined,
    metrics: isRecord(data.metrics) ? (data.metrics as unknown as MetricsFileData) : undefined,
    notes: isRecord(data.notes) ? (data.notes as unknown as NotesFileData) : undefined,
  }
}

/**
 * Migrate any file data (old/v2/v3/v4/v5/v6/v7/v8+) into a v8 WritinatorFile.
 */
export function migrateFile(data: unknown): WritinatorFile {
  if (!isRecord(data)) {
    throw new Error('Invalid file: expected a JSON object')
  }

  // v8 — already current (or future: permissive on version > 8)
  if (isV8File(data) || (typeof data.version === 'number' && data.version > 8)) {
    if (typeof data.version === 'number' && data.version > 8) {
      console.warn(`[migrateFile] file version ${data.version} is newer than expected (8); attempting to load`)
    }
    return {
      version: 8,
      book: data.book as Book,
      snapshots: (data.snapshots ?? {}) as Record<string, Snapshot[]>,
      publishedSnapshots: (data.publishedSnapshots ?? {}) as Record<string, PublishedSnapshot[]>,
      globalSettings: flattenGlobalSettings(data.globalSettings as GlobalSettings | undefined),
      characters: (data.characters ?? []) as Character[],
      markers: (data.markers ?? {}) as Record<string, StatDelta[]>,
      saveCounter: typeof data.saveCounter === 'number' ? data.saveCounter : 0,
      ...extractExternalSections(data),
    }
  }

  // v7 → v8: promote to v8 (notes section absent = hydrate no-op)
  if (isV7File(data)) {
    const v7: V7File = {
      version: 7,
      book: data.book as Book,
      snapshots: (data.snapshots ?? {}) as Record<string, Snapshot[]>,
      publishedSnapshots: (data.publishedSnapshots ?? {}) as Record<string, PublishedSnapshot[]>,
      globalSettings: flattenGlobalSettings(data.globalSettings as GlobalSettings | undefined),
      characters: (data.characters ?? []) as Character[],
      markers: (data.markers ?? {}) as Record<string, StatDelta[]>,
      saveCounter: data.saveCounter as number,
      player: isRecord(data.player) ? (data.player as unknown as PlayerFileData) : undefined,
      quests: isRecord(data.quests) ? (data.quests as unknown as ImageRevealFileData) : undefined,
      writeathon: isRecord(data.writeathon) ? (data.writeathon as unknown as WriteathonFileData) : undefined,
      metrics: isRecord(data.metrics) ? (data.metrics as unknown as MetricsFileData) : undefined,
    }
    return migrateToV8(v7)
  }

  // v6 → v7 → v8: promote to v8 (cross-store sections absent = hydrate no-ops)
  if (isV6File(data)) {
    const v6: V6File = {
      version: 6,
      book: data.book as Book,
      snapshots: (data.snapshots ?? {}) as Record<string, Snapshot[]>,
      publishedSnapshots: (data.publishedSnapshots ?? {}) as Record<string, PublishedSnapshot[]>,
      globalSettings: flattenGlobalSettings(data.globalSettings as GlobalSettings | undefined),
      characters: (data.characters ?? []) as Character[],
      markers: (data.markers ?? {}) as Record<string, StatDelta[]>,
      saveCounter: data.saveCounter as number,
    }
    return migrateToV8(migrateToV7(v6))
  }

  // v5 → v6 → v7 → v8: add saveCounter
  if (isV5File(data)) {
    return migrateToV8(migrateToV7(migrateToV6({
      version: 5,
      book: data.book as Book,
      snapshots: (data.snapshots ?? {}) as Record<string, Snapshot[]>,
      publishedSnapshots: (data.publishedSnapshots ?? {}) as Record<string, PublishedSnapshot[]>,
      globalSettings: flattenGlobalSettings(data.globalSettings as GlobalSettings | undefined),
      characters: (data.characters ?? []) as Character[],
      markers: (data.markers ?? {}) as Record<string, StatDelta[]>,
    })))
  }

  // v4 → v5 → v6 → v7 → v8: add publishedSnapshots + saveCounter
  if (isV4File(data)) {
    return migrateToV8(migrateToV7(migrateToV6(migrateToV5({
      version: 4,
      book: data.book as Book,
      snapshots: (data.snapshots ?? {}) as Record<string, Snapshot[]>,
      globalSettings: flattenGlobalSettings(data.globalSettings as GlobalSettings | undefined),
      characters: (data.characters ?? []) as Character[],
      markers: (data.markers ?? {}) as Record<string, StatDelta[]>,
    }))))
  }

  // v3 → v4 → v5 → v6 → v7 → v8: rename book.documents → book.storylets
  if (isV3File(data)) {
    const legacyBook = data.book as unknown as LegacyV3Book
    return migrateToV8(migrateToV7(migrateToV6(migrateToV5({
      version: 4,
      book: v3BookToV4(legacyBook),
      snapshots: (data.snapshots ?? {}) as Record<string, Snapshot[]>,
      globalSettings: flattenGlobalSettings(data.globalSettings as GlobalSettings | undefined),
      characters: (data.characters ?? []) as Character[],
      markers: (data.markers ?? {}) as Record<string, StatDelta[]>,
    }))))
  }

  // v2 → v4 → v5 → v6 → v7 → v8: add empty characters + markers, rename documents → storylets
  if (isV2File(data)) {
    const legacyBook = data.book as unknown as LegacyV3Book
    return migrateToV8(migrateToV7(migrateToV6(migrateToV5({
      version: 4,
      book: v3BookToV4(legacyBook),
      snapshots: (data.snapshots ?? {}) as Record<string, Snapshot[]>,
      globalSettings: flattenGlobalSettings(data.globalSettings as GlobalSettings | undefined),
      characters: [],
      markers: {},
    }))))
  }

  // Old format: bare Book with chapters → v4 → v5 → v6 → v7 → v8
  if (isOldFormat(data)) {
    const v4 = migrateOldBook(data as OldBook)
    return migrateToV8(migrateToV7(migrateToV6(migrateToV5(v4))))
  }

  throw new Error('Invalid file: unrecognized format')
}

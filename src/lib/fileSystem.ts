import type { Book, GlobalSettings, WritinatorFile } from '../types'
import { migrateFile } from './migration'
import { getAllSnapshots } from '../stores/snapshotStore'
import { snapshotBook } from '../stores/snapshotStore'
import { getAllPublishedSnapshots } from '../stores/publishedSnapshotStore'
import { useRecentFilesStore } from '../stores/recentFilesStore'
import { useCharacterStore } from '../stores/characterStore'
import { useStoryletStore } from '../stores/storyletStore'
import { serializePlayer, hydratePlayer } from '../stores/playerStore'
import { serializeImageReveal, hydrateImageReveal } from '../stores/imageRevealStore'
import { serializeWriteathon, hydrateWriteathon } from '../stores/writeathonStore'
import { serializeMetrics, hydrateMetrics } from '../stores/metricsStore'
import { serializeNotes, hydrateNotes } from '../stores/notesStore'
import {
  isTauri,
  readTauriTextFile,
  showTauriOpenDialog,
  showTauriSaveDialog,
  stripWritinatorExt,
  tauriBasename,
  tauriFileExists,
  tauriFileMtime,
  writeTauriTextFile,
} from './tauri'

// ---------------------------------------------------------------------------
// Section registry — add/remove cross-store sections here
// ---------------------------------------------------------------------------

interface FileSection<K extends keyof WritinatorFile> {
  key: K
  serialize: () => NonNullable<WritinatorFile[K]>
  hydrate: (data: WritinatorFile[K]) => void
}

// Using a typed tuple so each element retains its specific key type
const EXTERNAL_SECTIONS: [
  FileSection<'player'>,
  FileSection<'quests'>,
  FileSection<'writeathon'>,
  FileSection<'metrics'>,
  FileSection<'notes'>,
] = [
  { key: 'player',     serialize: serializePlayer,     hydrate: hydratePlayer },
  { key: 'quests',     serialize: serializeImageReveal, hydrate: hydrateImageReveal },
  { key: 'writeathon', serialize: serializeWriteathon,  hydrate: hydrateWriteathon },
  { key: 'metrics',    serialize: serializeMetrics,     hydrate: hydrateMetrics },
  { key: 'notes',      serialize: serializeNotes,       hydrate: hydrateNotes },
]

// queryPermission is not yet in TypeScript lib types for File System Access API
interface FileSystemHandleWithQueryPermission extends FileSystemFileHandle {
  queryPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

const FILE_EXTENSION = '.writinator'
const MIME_TYPE = 'application/json'

let storedFileHandle: FileSystemFileHandle | null = null
let storedFilePath: string | null = null
let lastLocalWriteAt = 0

export function getLastLocalWriteAt(): number {
  return lastLocalWriteAt
}

// ---------------------------------------------------------------------------
// Handle state observable
// ---------------------------------------------------------------------------

export type HandleState = {
  hasHandle: boolean
  name: string | null
  permission: 'granted' | 'prompt' | 'denied' | 'unknown'
}

let handleState: HandleState = { hasHandle: false, name: null, permission: 'unknown' }
const handleListeners = new Set<() => void>()

export function subscribeHandle(fn: () => void): () => void {
  handleListeners.add(fn)
  return () => handleListeners.delete(fn)
}

export function getHandleState(): HandleState {
  return handleState
}

function notifyHandleChange(): void {
  if (storedFilePath) {
    // Tauri path tether — permission is always granted, no async query needed.
    handleState = {
      hasHandle: true,
      name: tauriBasename(storedFilePath),
      permission: 'granted',
    }
    for (const fn of handleListeners) fn()
    return
  }

  if (!storedFileHandle) {
    handleState = { hasHandle: false, name: null, permission: 'unknown' }
    for (const fn of handleListeners) fn()
    return
  }

  // Snapshot synchronous fields immediately so subscribers see hasHandle/name right away
  handleState = { hasHandle: true, name: storedFileHandle.name, permission: 'unknown' }
  for (const fn of handleListeners) fn()

  // Resolve permission asynchronously (fire-and-forget)
  const handle = storedFileHandle
  ;(handle as FileSystemHandleWithQueryPermission)
    .queryPermission({ mode: 'readwrite' })
    .then((perm) => {
      // Only update if handle hasn't changed since the async call began
      if (storedFileHandle === handle) {
        handleState = { ...handleState, permission: perm as HandleState['permission'] }
        for (const fn of handleListeners) fn()
      }
    })
    .catch(() => {
      // queryPermission not supported — leave as 'unknown'
    })
}

/**
 * Whether the browser supports the File System Access API
 * (Chrome, Edge, Opera — not Firefox or Safari as of 2025)
 */
export function supportsFileSystemAccess(): boolean {
  return 'showSaveFilePicker' in window && 'showOpenFilePicker' in window
}

/**
 * Whether the runtime can tether to a real file (FSA in supported browsers,
 * native filesystem in Tauri). Drives the "file lock" gating: on platforms
 * with no tethering, localforage is the source of truth and edits are free.
 */
export function hasFileTetherCapability(): boolean {
  return isTauri() || supportsFileSystemAccess()
}

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

/**
 * Builds the full WritinatorFile object from current store state.
 * Exported so tests and visual QA can call it without triggering a file picker.
 */
export async function buildWritinatorFile(
  book: Book,
  globalSettings: GlobalSettings,
  saveCounter: number
): Promise<WritinatorFile> {
  const snapshots = await getAllSnapshots()
  const publishedSnapshots = await getAllPublishedSnapshots()
  const { characters, markers } = useCharacterStore.getState()
  const file: WritinatorFile = {
    version: 8,
    book,
    snapshots,
    publishedSnapshots,
    globalSettings,
    characters,
    markers,
    saveCounter,
  }
  for (const section of EXTERNAL_SECTIONS) {
    // Cast required: TypeScript can't narrow the generic K assignment through the loop
    ;(file[section.key] as WritinatorFile[typeof section.key]) = section.serialize()
  }
  return file
}

export async function saveFile(
  book: Book,
  globalSettings: GlobalSettings
): Promise<void> {
  const currentCounter = useStoryletStore.getState().lastSavedCounter
  const file = await buildWritinatorFile(book, globalSettings, currentCounter + 1)
  const json = JSON.stringify(file, null, 2)

  if (isTauri()) {
    await saveWithTauri(json, book.title)
  } else if (supportsFileSystemAccess()) {
    await saveWithFileSystemAccess(json, book.title)
  } else {
    saveWithDownload(json, book.title)
  }
  useStoryletStore.getState().setLastSaved(currentCounter + 1, Date.now())
}

/**
 * Downloads the full project state as a .writinator file. Always uses the
 * browser download path (never the FSA picker), so it works as a "save a copy"
 * / backup action on every browser — this is the only way Safari/Firefox users
 * can get their .writinator file onto disk. Does NOT tether a handle or advance
 * save state: it's a copy, parallel to the other Export formats. Passing the
 * current counter through unchanged keeps reconcile.ts honest for any tethered
 * file on browsers that have one.
 */
export async function exportWritinatorFile(
  book: Book,
  globalSettings: GlobalSettings
): Promise<void> {
  const currentCounter = useStoryletStore.getState().lastSavedCounter
  const file = await buildWritinatorFile(book, globalSettings, currentCounter)
  const json = JSON.stringify(file, null, 2)
  saveWithDownload(json, book.title)
}

export async function quickSave(
  book: Book,
  globalSettings: GlobalSettings
): Promise<boolean> {
  if (!storedFileHandle && !storedFilePath) return false

  const currentCounter = useStoryletStore.getState().lastSavedCounter
  const file = await buildWritinatorFile(book, globalSettings, currentCounter + 1)
  const json = JSON.stringify(file, null, 2)

  if (storedFilePath) {
    await writeTauriTextFile(storedFilePath, json)
  } else if (storedFileHandle) {
    const writable = await storedFileHandle.createWritable()
    await writable.write(json)
    await writable.close()
  }
  lastLocalWriteAt = Date.now()
  useStoryletStore.getState().setLastSaved(currentCounter + 1, Date.now())
  return true
}

/**
 * Opens the save picker. If the picked file already contains a valid
 * WritinatorFile, does NOT overwrite — instead orphan-snapshots the current
 * book and loads the file's content. Returns 'saved' if the file was written
 * or 'loaded' if the file's content was loaded instead of overwritten, or
 * 'cancelled' if the user cancelled. Null return for unsupported browsers.
 */
export async function saveAsNewFile(
  book: Book,
  globalSettings: GlobalSettings
): Promise<'saved' | 'loaded' | 'cancelled' | null> {
  if (isTauri()) {
    return await saveAsNewFileTauri(book, globalSettings)
  }

  if (!supportsFileSystemAccess()) {
    storedFileHandle = null
    notifyHandleChange()
    await saveFile(book, globalSettings)
    return 'saved'
  }

  let handle: FileSystemFileHandle
  try {
    handle = await window.showSaveFilePicker({
      suggestedName: `${sanitizeFilename(book.title)}${FILE_EXTENSION}`,
      types: [
        {
          description: 'Writinator Book',
          accept: { [MIME_TYPE]: [FILE_EXTENSION] },
        },
      ],
    })
  } catch {
    return 'cancelled'
  }

  // Check if the picked file already contains a valid WritinatorFile.
  // If so, prefer loading over clobbering.
  try {
    const existing = await handle.getFile()
    if (existing.size > 0) {
      const text = await existing.text()
      const parsed = parseFileJSON(text)
      if (parsed) {
        const currentBook = useStoryletStore.getState().book
        if (currentBook) {
          await snapshotBook(currentBook, 'orphan')
        }
        storedFileHandle = handle
        notifyHandleChange()
        useRecentFilesStore.getState().addRecent({
          handle,
          name: handle.name,
          lastOpenedAt: Date.now(),
        })
        await useStoryletStore.getState().loadFile(parsed)
        useStoryletStore.getState().setLastSaved(parsed.saveCounter, Date.now())
        return 'loaded'
      }
    }
  } catch (err) {
    console.warn('saveAsNewFile: could not inspect existing file, proceeding with save:', err)
  }

  // File is empty or not a Writinator file — safe to write.
  storedFileHandle = handle
  notifyHandleChange()
  useRecentFilesStore.getState().addRecent({
    handle,
    name: handle.name,
    lastOpenedAt: Date.now(),
  })
  await saveFile(book, globalSettings)
  return 'saved'
}

/**
 * "Create new book" flow: opens the save picker FIRST (synchronously from the
 * click handler, so transient user activation is preserved), then either:
 *   - 'loaded':    the picked file already contains a valid book → load it
 *   - 'created':   the file is empty/new → create a book using the filename
 *                  (sans extension) as the book title and write it to disk
 *   - 'cancelled': user dismissed the picker → no state change
 *
 * Returns null on unsupported browsers (caller should fall back to a download
 * flow). On 'created', current book (if any) is orphan-snapshotted first.
 */
export async function createBookWithFile(
  suggestedTitle: string
): Promise<'created' | 'loaded' | 'cancelled' | null> {
  if (isTauri()) {
    return await createBookWithFileTauri(suggestedTitle)
  }

  if (!supportsFileSystemAccess()) return null

  let handle: FileSystemFileHandle
  try {
    handle = await window.showSaveFilePicker({
      suggestedName: `${sanitizeFilename(suggestedTitle)}${FILE_EXTENSION}`,
      types: [
        {
          description: 'Writinator Book',
          accept: { [MIME_TYPE]: [FILE_EXTENSION] },
        },
      ],
    })
  } catch {
    return 'cancelled'
  }

  // If the picked file already holds a valid Writinator book, prefer loading
  // over clobbering — user almost certainly meant to "Open" that file.
  try {
    const existing = await handle.getFile()
    if (existing.size > 0) {
      const text = await existing.text()
      const parsed = parseFileJSON(text)
      if (parsed) {
        const currentBook = useStoryletStore.getState().book
        if (currentBook) {
          await snapshotBook(currentBook, 'orphan')
        }
        storedFileHandle = handle
        notifyHandleChange()
        useRecentFilesStore.getState().addRecent({
          handle,
          name: handle.name,
          lastOpenedAt: Date.now(),
        })
        await useStoryletStore.getState().loadFile(parsed)
        useStoryletStore.getState().setLastSaved(parsed.saveCounter, Date.now())
        return 'loaded'
      }
    }
  } catch (err) {
    console.warn('createBookWithFile: could not inspect existing file, proceeding with create:', err)
  }

  // Derive the book title from the chosen filename (strip extension). Falls
  // back to suggestedTitle if the user typed something nonsensical.
  const filenameTitle = handle.name.replace(new RegExp(`${FILE_EXTENSION}$`), '').trim()
  const title = filenameTitle || suggestedTitle

  await useStoryletStore.getState().createBook(title)
  storedFileHandle = handle
  notifyHandleChange()
  useRecentFilesStore.getState().addRecent({
    handle,
    name: handle.name,
    lastOpenedAt: Date.now(),
  })

  const book = useStoryletStore.getState().book
  const globalSettings = useStoryletStore.getState().globalSettings
  if (book) {
    await saveFile(book, globalSettings)
  }
  return 'created'
}

// ---------------------------------------------------------------------------
// Open
// ---------------------------------------------------------------------------

export async function openFile(): Promise<WritinatorFile | null> {
  if (isTauri()) {
    return openWithTauri()
  }
  if (supportsFileSystemAccess()) {
    return openWithFileSystemAccess()
  }
  return openWithFileInput()
}

async function openWithFileSystemAccess(): Promise<WritinatorFile | null> {
  const [handle] = await window.showOpenFilePicker({
    types: [
      {
        description: 'Writinator Book',
        accept: { [MIME_TYPE]: [FILE_EXTENSION] },
      },
    ],
    multiple: false,
  })

  // Open picker grants read-only. Request readwrite immediately while user
  // activation is still live, so future saves don't trigger a second dialog.
  try {
    const h = handle as FileSystemHandleWithQueryPermission & {
      requestPermission(d: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
    }
    const perm = await h.requestPermission({ mode: 'readwrite' })
    if (perm !== 'granted') {
      console.warn('readwrite permission not granted after open picker')
    }
  } catch {
    // requestPermission not supported — fall back to being prompted on first write
  }

  // Orphan-snapshot the current book before replacing it
  const currentBook = useStoryletStore.getState().book
  if (currentBook) {
    await snapshotBook(currentBook, 'orphan')
  }

  storedFileHandle = handle
  notifyHandleChange()
  useRecentFilesStore.getState().addRecent({
    handle,
    name: handle.name,
    lastOpenedAt: Date.now(),
  })
  const file = await handle.getFile()
  const text = await file.text()
  return parseFileJSON(text)
}

function openWithFileInput(): Promise<WritinatorFile | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = FILE_EXTENSION
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) {
        resolve(null)
        return
      }
      // Orphan-snapshot the current book before replacing it
      const currentBook = useStoryletStore.getState().book
      if (currentBook) {
        await snapshotBook(currentBook, 'orphan')
      }
      const text = await file.text()
      resolve(parseFileJSON(text))
    }
    input.click()
  })
}

// ---------------------------------------------------------------------------
// Handle management
// ---------------------------------------------------------------------------

export function clearFileHandle(): void {
  storedFileHandle = null
  storedFilePath = null
  notifyHandleChange()
}

export function hasFileHandle(): boolean {
  return storedFileHandle !== null || storedFilePath !== null
}

export function setStoredFileHandle(handle: FileSystemFileHandle | null): void {
  storedFileHandle = handle
  if (handle) storedFilePath = null
  notifyHandleChange()
}

export function getStoredFileHandle(): FileSystemFileHandle | null {
  return storedFileHandle
}

export function setStoredFilePath(path: string | null): void {
  storedFilePath = path
  if (path) storedFileHandle = null
  notifyHandleChange()
}

export function getStoredFilePath(): string | null {
  return storedFilePath
}

/**
 * Reads the contents of whatever is currently tethered (Tauri path or FSA handle).
 * Returns null if nothing is tethered, or on read failure.
 */
export async function readStoredFile(): Promise<{ text: string; mtime: number } | null> {
  if (storedFilePath) {
    try {
      const text = await readTauriTextFile(storedFilePath)
      const mtime = (await tauriFileMtime(storedFilePath)) ?? Date.now()
      return { text, mtime }
    } catch {
      return null
    }
  }
  if (storedFileHandle) {
    try {
      const f = await storedFileHandle.getFile()
      return { text: await f.text(), mtime: f.lastModified }
    } catch {
      return null
    }
  }
  return null
}

/**
 * Checks the most-recent entry in recentFilesStore. If a Tauri path entry, it's
 * restored when the file still exists. Otherwise, an FSA handle is restored only
 * if it already has 'granted' readwrite permission (no user gesture required).
 */
export async function restoreStoredFileHandleFromRecents(): Promise<boolean> {
  const { recentFiles } = useRecentFilesStore.getState()
  if (recentFiles.length === 0) return false
  const mostRecent = recentFiles[0]

  if (mostRecent.path && isTauri()) {
    if (await tauriFileExists(mostRecent.path)) {
      storedFilePath = mostRecent.path
      storedFileHandle = null
      notifyHandleChange()
      return true
    }
    return false
  }

  if (!mostRecent.handle) return false
  try {
    const handleWithQuery = mostRecent.handle as FileSystemHandleWithQueryPermission
    const permission = await handleWithQuery.queryPermission({ mode: 'readwrite' })
    if (permission === 'granted') {
      storedFileHandle = mostRecent.handle
      storedFilePath = null
      notifyHandleChange()
      return true
    }
    return false
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function saveWithFileSystemAccess(
  json: string,
  title: string
): Promise<void> {
  if (!storedFileHandle) {
    storedFileHandle = await window.showSaveFilePicker({
      suggestedName: `${sanitizeFilename(title)}${FILE_EXTENSION}`,
      types: [
        {
          description: 'Writinator Book',
          accept: { [MIME_TYPE]: [FILE_EXTENSION] },
        },
      ],
    })
    notifyHandleChange()
    useRecentFilesStore.getState().addRecent({
      handle: storedFileHandle,
      name: storedFileHandle.name,
      lastOpenedAt: Date.now(),
    })
  }

  const writable = await storedFileHandle!.createWritable()
  await writable.write(json)
  await writable.close()
  lastLocalWriteAt = Date.now()
}

function saveWithDownload(json: string, title: string): void {
  const blob = new Blob([json], { type: MIME_TYPE })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${sanitizeFilename(title)}${FILE_EXTENSION}`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function parseFileJSON(text: string): WritinatorFile | null {
  try {
    const data = JSON.parse(text)
    return migrateFile(data)
  } catch {
    return null
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'untitled'
}

// ---------------------------------------------------------------------------
// Tauri implementations (parallel to FSA helpers above)
// ---------------------------------------------------------------------------

async function saveWithTauri(json: string, title: string): Promise<void> {
  if (!storedFilePath) {
    const picked = await showTauriSaveDialog({
      suggestedName: `${sanitizeFilename(title)}${FILE_EXTENSION}`,
    })
    if (!picked) return
    storedFilePath = picked
    storedFileHandle = null
    notifyHandleChange()
    useRecentFilesStore.getState().addRecent({
      path: picked,
      name: tauriBasename(picked),
      lastOpenedAt: Date.now(),
    })
  }
  await writeTauriTextFile(storedFilePath!, json)
  lastLocalWriteAt = Date.now()
}

async function saveAsNewFileTauri(
  book: Book,
  globalSettings: GlobalSettings
): Promise<'saved' | 'loaded' | 'cancelled'> {
  const picked = await showTauriSaveDialog({
    suggestedName: `${sanitizeFilename(book.title)}${FILE_EXTENSION}`,
  })
  if (!picked) return 'cancelled'

  // If the picked file already holds a valid Writinator book, prefer loading
  // over clobbering — matches the FSA flow.
  if (await tauriFileExists(picked)) {
    try {
      const existing = await readTauriTextFile(picked)
      if (existing.length > 0) {
        const parsed = parseFileJSON(existing)
        if (parsed) {
          const currentBook = useStoryletStore.getState().book
          if (currentBook) await snapshotBook(currentBook, 'orphan')
          storedFilePath = picked
          storedFileHandle = null
          notifyHandleChange()
          useRecentFilesStore.getState().addRecent({
            path: picked,
            name: tauriBasename(picked),
            lastOpenedAt: Date.now(),
          })
          await useStoryletStore.getState().loadFile(parsed)
          useStoryletStore.getState().setLastSaved(parsed.saveCounter, Date.now())
          return 'loaded'
        }
      }
    } catch (err) {
      console.warn('saveAsNewFileTauri: could not inspect existing file:', err)
    }
  }

  storedFilePath = picked
  storedFileHandle = null
  notifyHandleChange()
  useRecentFilesStore.getState().addRecent({
    path: picked,
    name: tauriBasename(picked),
    lastOpenedAt: Date.now(),
  })
  await saveFile(book, globalSettings)
  return 'saved'
}

async function createBookWithFileTauri(
  suggestedTitle: string
): Promise<'created' | 'loaded' | 'cancelled'> {
  const picked = await showTauriSaveDialog({
    suggestedName: `${sanitizeFilename(suggestedTitle)}${FILE_EXTENSION}`,
  })
  if (!picked) return 'cancelled'

  if (await tauriFileExists(picked)) {
    try {
      const existing = await readTauriTextFile(picked)
      if (existing.length > 0) {
        const parsed = parseFileJSON(existing)
        if (parsed) {
          const currentBook = useStoryletStore.getState().book
          if (currentBook) await snapshotBook(currentBook, 'orphan')
          storedFilePath = picked
          storedFileHandle = null
          notifyHandleChange()
          useRecentFilesStore.getState().addRecent({
            path: picked,
            name: tauriBasename(picked),
            lastOpenedAt: Date.now(),
          })
          await useStoryletStore.getState().loadFile(parsed)
          useStoryletStore.getState().setLastSaved(parsed.saveCounter, Date.now())
          return 'loaded'
        }
      }
    } catch (err) {
      console.warn('createBookWithFileTauri: could not inspect existing file:', err)
    }
  }

  const filenameTitle = stripWritinatorExt(tauriBasename(picked)).trim()
  const title = filenameTitle || suggestedTitle

  await useStoryletStore.getState().createBook(title)
  storedFilePath = picked
  storedFileHandle = null
  notifyHandleChange()
  useRecentFilesStore.getState().addRecent({
    path: picked,
    name: tauriBasename(picked),
    lastOpenedAt: Date.now(),
  })
  const newBook = useStoryletStore.getState().book
  const settings = useStoryletStore.getState().globalSettings
  if (newBook) await saveFile(newBook, settings)
  return 'created'
}

async function openWithTauri(): Promise<WritinatorFile | null> {
  const picked = await showTauriOpenDialog()
  if (!picked) return null

  const currentBook = useStoryletStore.getState().book
  if (currentBook) await snapshotBook(currentBook, 'orphan')

  const text = await readTauriTextFile(picked)
  const parsed = parseFileJSON(text)
  if (!parsed) return null

  storedFilePath = picked
  storedFileHandle = null
  notifyHandleChange()
  useRecentFilesStore.getState().addRecent({
    path: picked,
    name: tauriBasename(picked),
    lastOpenedAt: Date.now(),
  })
  return parsed
}

if (import.meta.env.DEV) {
  ;(globalThis as unknown as { __buildWritinatorFile?: unknown }).__buildWritinatorFile =
    buildWritinatorFile
}

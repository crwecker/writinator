import type { Book, GlobalSettings, WritinatorFile } from '../types'
import { CURRENT_FILE_VERSION, migrateFile } from './migration'
import { getAllSnapshots } from '../stores/snapshotStore'
import { getAllPublishedSnapshots } from '../stores/publishedSnapshotStore'
import { showToast } from '../stores/genericToastStore'
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

/** Keep only the entries that belong to one of `storyletIds`. */
function pickStorylets<T>(all: Record<string, T>, storyletIds: Set<string>): Record<string, T> {
  return Object.fromEntries(Object.entries(all).filter(([id]) => storyletIds.has(id)))
}

/**
 * Builds the full WritinatorFile object from current store state.
 * Exported so tests and visual QA can call it without triggering a file picker.
 */
export async function buildWritinatorFile(
  book: Book,
  globalSettings: GlobalSettings,
  saveCounter: number,
  saveId?: string
): Promise<WritinatorFile> {
  // Browser storage holds history for every book opened here; the file only
  // carries this book's.
  const storyletIds = new Set(book.storylets.map((s) => s.id))
  const snapshots = pickStorylets(await getAllSnapshots(), storyletIds)
  const publishedSnapshots = pickStorylets(await getAllPublishedSnapshots(), storyletIds)
  const { characters, markers } = useCharacterStore.getState()
  const file: WritinatorFile = {
    version: CURRENT_FILE_VERSION,
    book,
    snapshots,
    publishedSnapshots,
    globalSettings,
    characters,
    markers,
    saveCounter,
    ...(saveId ? { saveId } : {}),
  }
  for (const section of EXTERNAL_SECTIONS) {
    // Cast required: TypeScript can't narrow the generic K assignment through the loop
    ;(file[section.key] as WritinatorFile[typeof section.key]) = section.serialize()
  }
  return file
}

/** Writes a new save of the book to the connected file (or, with nothing
 *  connected, downloads it) and records it as the last save. */
async function saveFile(
  book: Book,
  globalSettings: GlobalSettings
): Promise<void> {
  const currentCounter = useStoryletStore.getState().lastSavedCounter
  const saveId = crypto.randomUUID()
  const file = await buildWritinatorFile(book, globalSettings, currentCounter + 1, saveId)
  const json = JSON.stringify(file, null, 2)

  if (!(await writeToStoredFile(json))) {
    saveWithDownload(json, book.title)
  }
  useStoryletStore.getState().setLastSaved(currentCounter + 1, Date.now(), { saveId, book })
}

/**
 * Whether the file on disk was written by someone else (another device, tab
 * or app) since this app last saved or loaded it. Files from older versions
 * have no `saveId`, so only the counter can be compared for them.
 */
export function fileChangedSinceLastSync(file: WritinatorFile): boolean {
  const { lastSavedCounter, lastSavedId } = useStoryletStore.getState()
  if (file.saveCounter !== lastSavedCounter) return true
  return !!file.saveId && !!lastSavedId && file.saveId !== lastSavedId
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
  const { lastSavedCounter: currentCounter, lastSavedId } = useStoryletStore.getState()
  const file = await buildWritinatorFile(book, globalSettings, currentCounter, lastSavedId ?? undefined)
  const json = JSON.stringify(file, null, 2)
  saveWithDownload(json, book.title)
}

export async function quickSave(
  book: Book,
  globalSettings: GlobalSettings
): Promise<boolean> {
  if (!storedFileHandle && !storedFilePath) return false

  const onDisk = await readStoredFile()
  if (onDisk && isNewerFileVersion(onDisk.text)) {
    // Saving would downgrade it and drop whatever the newer app stored.
    showToast('Not saved: the file was last saved by a newer version of Writinator. Update the app to keep working on it.', 'error')
    return true
  }

  // Never overwrite a version of the file this app hasn't seen. Reconcile
  // instead: it reloads the file, or keeps local edits and files the disk
  // version in History, after which the next save goes through.
  const diskFile = onDisk ? parseFileJSON(onDisk.text) : null
  if (diskFile && fileChangedSinceLastSync(diskFile)) {
    const { reconcileWithFile } = await import('./reconcile')
    await reconcileWithFile()
    return true
  }

  await saveFile(book, globalSettings)
  return true
}

// ---------------------------------------------------------------------------
// Picking a file (shared by Save As, New Book and Open)
// ---------------------------------------------------------------------------

/** A file the book can be connected to: a File System Access handle in the
 *  browser, or a filesystem path in the desktop app. */
type FileTarget =
  | { handle: FileSystemFileHandle; path?: undefined }
  | { path: string; handle?: undefined }

const PICKER_TYPES = [
  {
    description: 'Writinator Book',
    accept: { [MIME_TYPE]: [FILE_EXTENSION] },
  },
]

function targetName(target: FileTarget): string {
  return target.handle ? target.handle.name : tauriBasename(target.path)
}

/** Connect the book to `target` and list it in Recent Files. */
function tetherTo(target: FileTarget): void {
  storedFilePath = target.path ?? null
  storedFileHandle = target.handle ?? null
  notifyHandleChange()
  useRecentFilesStore.getState().addRecent(
    target.handle
      ? { handle: target.handle, name: targetName(target), lastOpenedAt: Date.now() }
      : { path: target.path, name: targetName(target), lastOpenedAt: Date.now() }
  )
}

async function readTarget(target: FileTarget): Promise<string> {
  if (!target.handle) return readTauriTextFile(target.path)
  const file = await target.handle.getFile()
  return file.text()
}

/** Show the save picker. Null when the user cancels. */
async function pickSaveTarget(suggestedTitle: string): Promise<FileTarget | null> {
  const suggestedName = `${sanitizeFilename(suggestedTitle)}${FILE_EXTENSION}`
  if (isTauri()) {
    const path = await showTauriSaveDialog({ suggestedName })
    return path ? { path } : null
  }
  try {
    return { handle: await window.showSaveFilePicker({ suggestedName, types: PICKER_TYPES }) }
  } catch {
    return null
  }
}

/** Show the open picker. Null when the user cancels. */
async function pickOpenTarget(): Promise<FileTarget | null> {
  if (isTauri()) {
    const path = await showTauriOpenDialog()
    return path ? { path } : null
  }
  let handle: FileSystemFileHandle
  try {
    ;[handle] = await window.showOpenFilePicker({ types: PICKER_TYPES, multiple: false })
  } catch {
    return null
  }
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
  return { handle }
}

/**
 * For a file picked in a save dialog: if it already holds a book, load that
 * instead of overwriting it ('loaded'); if it holds anything else, leave it
 * alone ('refused'). 'empty' means the file is new or empty and safe to write.
 */
async function claimPickedFile(target: FileTarget): Promise<'loaded' | 'refused' | 'empty'> {
  let text: string
  try {
    if (!target.handle && !(await tauriFileExists(target.path))) return 'empty'
    text = await readTarget(target)
  } catch (err) {
    console.warn('could not inspect the picked file, treating it as new:', err)
    return 'empty'
  }
  if (text.trim() === '') return 'empty'

  const parsed = parseFile(text)
  if ('error' in parsed) {
    showToast(`Didn't overwrite “${targetName(target)}”. ${parsed.error}`, 'warning')
    return 'refused'
  }
  await useStoryletStore.getState().loadFile(parsed.file)
  tetherTo(target)
  useStoryletStore.getState().setLastSaved(parsed.file.saveCounter, Date.now())
  return 'loaded'
}

/**
 * Opens the save picker and writes the book to the chosen file. If that file
 * already contains a book, loads it instead of overwriting (the current book
 * is kept in History as an orphan snapshot); if it contains anything else,
 * leaves it untouched. On browsers without file access, downloads a copy.
 */
export async function saveAsNewFile(
  book: Book,
  globalSettings: GlobalSettings
): Promise<'saved' | 'loaded' | 'refused' | 'cancelled'> {
  if (!hasFileTetherCapability()) {
    clearFileHandle()
    await saveFile(book, globalSettings)
    return 'saved'
  }

  const target = await pickSaveTarget(book.title)
  if (!target) return 'cancelled'
  const claimed = await claimPickedFile(target)
  if (claimed !== 'empty') return claimed

  tetherTo(target)
  await saveFile(book, globalSettings)
  return 'saved'
}

/**
 * "Create new book" flow: opens the save picker FIRST (synchronously from the
 * click handler, so transient user activation is preserved), then either:
 *   - 'loaded':    the picked file already contains a valid book → load it
 *   - 'refused':   the picked file holds something else → left untouched
 *   - 'created':   the file is empty/new → create a book using the filename
 *                  (sans extension) as the book title and write it to disk
 *   - 'cancelled': user dismissed the picker → no state change
 *
 * Returns null on unsupported browsers (caller should fall back to a download
 * flow). On 'created', current book (if any) is orphan-snapshotted first.
 */
export async function createBookWithFile(
  suggestedTitle: string
): Promise<'created' | 'loaded' | 'refused' | 'cancelled' | null> {
  if (!hasFileTetherCapability()) return null

  const target = await pickSaveTarget(suggestedTitle)
  if (!target) return 'cancelled'
  const claimed = await claimPickedFile(target)
  if (claimed !== 'empty') return claimed

  // Derive the book title from the chosen filename. Falls back to
  // suggestedTitle if the user typed something nonsensical.
  const title = stripWritinatorExt(targetName(target)).trim() || suggestedTitle
  await useStoryletStore.getState().createBook(title)
  tetherTo(target)
  const { book, globalSettings } = useStoryletStore.getState()
  if (book) await saveFile(book, globalSettings)
  return 'created'
}

// ---------------------------------------------------------------------------
// Open
// ---------------------------------------------------------------------------

/**
 * Picks a file and parses it. The book is connected to the file only when it
 * parses; otherwise the reason is shown and null returned. The caller loads
 * the returned file into the store (which keeps the current book in History).
 */
export async function openFile(): Promise<WritinatorFile | null> {
  if (!hasFileTetherCapability()) return openWithFileInput()

  const target = await pickOpenTarget()
  if (!target) return null
  const parsed = parseFile(await readTarget(target))
  if ('error' in parsed) {
    showToast(`Couldn't open “${targetName(target)}”. ${parsed.error}`, 'error')
    return null
  }
  tetherTo(target)
  return parsed.file
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
      const parsed = parseFile(await file.text())
      if ('error' in parsed) {
        showToast(`Couldn't open “${file.name}”. ${parsed.error}`, 'error')
        resolve(null)
        return
      }
      resolve(parsed.file)
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

/** Writes `json` to the connected file. False when nothing is connected. */
async function writeToStoredFile(json: string): Promise<boolean> {
  if (storedFilePath) {
    await writeTauriTextFile(storedFilePath, json)
  } else if (storedFileHandle) {
    const writable = await storedFileHandle.createWritable()
    await writable.write(json)
    await writable.close()
  } else {
    return false
  }
  lastLocalWriteAt = Date.now()
  return true
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

/** Parse file text as a book, or say (in words fit for the user) why not. */
export function parseFile(text: string): { file: WritinatorFile } | { error: string } {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return { error: 'It isn’t a Writinator book file.' }
  }
  try {
    return { file: migrateFile(data) }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'It isn’t a Writinator book file.' }
  }
}

export function parseFileJSON(text: string): WritinatorFile | null {
  const parsed = parseFile(text)
  return 'file' in parsed ? parsed.file : null
}

/** Whether `text` is a book file written by a newer version of the app. */
function isNewerFileVersion(text: string): boolean {
  try {
    const data: unknown = JSON.parse(text)
    return (
      typeof data === 'object' && data !== null &&
      typeof (data as { version?: unknown }).version === 'number' &&
      (data as { version: number }).version > CURRENT_FILE_VERSION
    )
  } catch {
    return false
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'untitled'
}

if (import.meta.env.DEV) {
  ;(globalThis as unknown as { __buildWritinatorFile?: unknown }).__buildWritinatorFile =
    buildWritinatorFile
}

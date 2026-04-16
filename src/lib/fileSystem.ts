import type { Book, GlobalSettings, WritinatorFile } from '../types'
import { migrateFile } from './migration'
import { getAllSnapshots } from '../stores/snapshotStore'
import { snapshotBook } from '../stores/snapshotStore'
import { getAllPublishedSnapshots } from '../stores/publishedSnapshotStore'
import { useRecentFilesStore } from '../stores/recentFilesStore'
import { useCharacterStore } from '../stores/characterStore'
import { useStoryletStore } from '../stores/storyletStore'

// queryPermission is not yet in TypeScript lib types for File System Access API
interface FileSystemHandleWithQueryPermission extends FileSystemFileHandle {
  queryPermission(descriptor: { mode: 'read' | 'readwrite' }): Promise<PermissionState>
}

const FILE_EXTENSION = '.writinator'
const MIME_TYPE = 'application/json'

let storedFileHandle: FileSystemFileHandle | null = null
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

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

export async function saveFile(
  book: Book,
  globalSettings: GlobalSettings
): Promise<void> {
  const snapshots = await getAllSnapshots()
  const publishedSnapshots = await getAllPublishedSnapshots()
  const { characters, markers } = useCharacterStore.getState()
  const currentCounter = useStoryletStore.getState().lastSavedCounter
  const file: WritinatorFile = {
    version: 6,
    book,
    snapshots,
    publishedSnapshots,
    globalSettings,
    characters,
    markers,
    saveCounter: currentCounter + 1,
  }
  const json = JSON.stringify(file, null, 2)

  if (supportsFileSystemAccess()) {
    await saveWithFileSystemAccess(json, book.title)
  } else {
    saveWithDownload(json, book.title)
  }
  useStoryletStore.getState().setLastSaved(currentCounter + 1, Date.now())
}

export async function quickSave(
  book: Book,
  globalSettings: GlobalSettings
): Promise<boolean> {
  if (!storedFileHandle) return false

  const snapshots = await getAllSnapshots()
  const publishedSnapshots = await getAllPublishedSnapshots()
  const { characters, markers } = useCharacterStore.getState()
  const currentCounter = useStoryletStore.getState().lastSavedCounter
  const file: WritinatorFile = {
    version: 6,
    book,
    snapshots,
    publishedSnapshots,
    globalSettings,
    characters,
    markers,
    saveCounter: currentCounter + 1,
  }
  const json = JSON.stringify(file, null, 2)

  const writable = await storedFileHandle.createWritable()
  await writable.write(json)
  await writable.close()
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

// ---------------------------------------------------------------------------
// Open
// ---------------------------------------------------------------------------

export async function openFile(): Promise<WritinatorFile | null> {
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
  notifyHandleChange()
}

export function hasFileHandle(): boolean {
  return storedFileHandle !== null
}

export function setStoredFileHandle(handle: FileSystemFileHandle | null): void {
  storedFileHandle = handle
  notifyHandleChange()
}

export function getStoredFileHandle(): FileSystemFileHandle | null {
  return storedFileHandle
}

/**
 * Checks the most-recent entry in recentFilesStore. If the handle already has
 * 'granted' readwrite permission (no user gesture required), sets storedFileHandle
 * and returns true. Does NOT call requestPermission — that requires a user gesture.
 */
export async function restoreStoredFileHandleFromRecents(): Promise<boolean> {
  const { recentFiles } = useRecentFilesStore.getState()
  if (recentFiles.length === 0) return false
  const mostRecent = recentFiles[0]
  if (!mostRecent.handle) return false
  try {
    const handleWithQuery = mostRecent.handle as FileSystemHandleWithQueryPermission
    const permission = await handleWithQuery.queryPermission({ mode: 'readwrite' })
    if (permission === 'granted') {
      storedFileHandle = mostRecent.handle
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

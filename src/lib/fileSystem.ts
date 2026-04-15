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
  useStoryletStore.getState().setLastSaved(currentCounter + 1, Date.now())
  return true
}

export async function saveAsNewFile(
  book: Book,
  globalSettings: GlobalSettings
): Promise<void> {
  storedFileHandle = null
  await saveFile(book, globalSettings)
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

  // Orphan-snapshot the current book before replacing it
  const currentBook = useStoryletStore.getState().book
  if (currentBook) {
    await snapshotBook(currentBook, 'orphan')
  }

  storedFileHandle = handle
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
}

export function hasFileHandle(): boolean {
  return storedFileHandle !== null
}

export function setStoredFileHandle(handle: FileSystemFileHandle | null): void {
  storedFileHandle = handle
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
    useRecentFilesStore.getState().addRecent({
      handle: storedFileHandle,
      name: storedFileHandle.name,
      lastOpenedAt: Date.now(),
    })
  }

  const writable = await storedFileHandle!.createWritable()
  await writable.write(json)
  await writable.close()
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

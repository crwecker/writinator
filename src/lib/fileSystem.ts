import type { Book } from '../types'

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

export async function saveBook(book: Book): Promise<void> {
  const json = JSON.stringify(book, null, 2)

  if (supportsFileSystemAccess()) {
    await saveWithFileSystemAccess(json, book.title)
  } else {
    saveWithDownload(json, book.title)
  }
}

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

// ---------------------------------------------------------------------------
// Open
// ---------------------------------------------------------------------------

export async function openBook(): Promise<Book | null> {
  if (supportsFileSystemAccess()) {
    return openWithFileSystemAccess()
  }
  return openWithFileInput()
}

async function openWithFileSystemAccess(): Promise<Book | null> {
  const [handle] = await window.showOpenFilePicker({
    types: [
      {
        description: 'Writinator Book',
        accept: { [MIME_TYPE]: [FILE_EXTENSION] },
      },
    ],
    multiple: false,
  })
  storedFileHandle = handle
  const file = await handle.getFile()
  const text = await file.text()
  return parseBookJSON(text)
}

function openWithFileInput(): Promise<Book | null> {
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
      const text = await file.text()
      resolve(parseBookJSON(text))
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseBookJSON(text: string): Book | null {
  try {
    const data = JSON.parse(text)
    if (!data.id || !data.title || !Array.isArray(data.chapters)) {
      return null
    }
    return data as Book
  } catch {
    return null
  }
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'untitled'
}

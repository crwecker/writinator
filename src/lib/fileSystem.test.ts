import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  buildWritinatorFile,
  clearFileHandle,
  createBookWithFile,
  getStoredFileHandle,
  hasFileHandle,
  openFile,
  quickSave,
  saveAsNewFile,
  setStoredFileHandle,
} from './fileSystem'
import { useStoryletStore } from '../stores/storyletStore'
import { createSnapshot } from '../stores/snapshotStore'
import { createPublishedSnapshot } from '../stores/publishedSnapshotStore'
import type { WritinatorFile } from '../types'
import { makeBook, makeFile, makeStorylet, seedStore, storyletContent } from '../test/fixtures'

/** A fake File System Access handle backed by a string. Methods live on the
 *  prototype so the recent-files store can structured-clone it. */
class FakeHandle {
  kind = 'file'
  text: string
  name: string
  constructor(text: string, name: string) {
    this.text = text
    this.name = name
  }
  async getFile() {
    const text = this.text
    return { size: text.length, text: async () => text, lastModified: Date.now() }
  }
  async createWritable() {
    return {
      write: async (data: string) => {
        this.text = data
      },
      close: async () => {},
    }
  }
  async queryPermission() {
    return 'granted'
  }
  async requestPermission() {
    return 'granted'
  }
}

function fakeHandle(initial: string, name = 'picked.writinator') {
  const fake = new FakeHandle(initial, name)
  return { handle: fake as unknown as FileSystemFileHandle, text: () => fake.text }
}

/** Make the File System Access pickers return `handle`. */
function stubPickers(handle: FileSystemFileHandle): void {
  const w = window as unknown as Record<string, unknown>
  w.showOpenFilePicker = async () => [handle]
  w.showSaveFilePicker = async () => handle
}

const store = () => useStoryletStore.getState()

beforeEach(() => {
  seedStore(makeBook([makeStorylet('a', 'current book text')]), 'a')
})

afterEach(() => {
  clearFileHandle()
  const w = window as unknown as Record<string, unknown>
  delete w.showOpenFilePicker
  delete w.showSaveFilePicker
})

describe('opening a file that cannot be read as a book', () => {
  it('does not connect the current book to that file', async () => {
    const disk = fakeHandle('this is not a writinator file')
    stubPickers(disk.handle)

    expect(await openFile()).toBeNull()
    expect(hasFileHandle()).toBe(false)
    expect(storyletContent('a')).toBe('current book text')
  })

  it('does not connect to a file saved by a newer version of the app', async () => {
    const newer = { ...makeFile(makeBook([makeStorylet('a', 'from the future')])), version: 9 }
    stubPickers(fakeHandle(JSON.stringify(newer)).handle)

    expect(await openFile()).toBeNull()
    expect(hasFileHandle()).toBe(false)
  })
})

describe('Save As onto an existing file', () => {
  it('refuses to overwrite a non-empty file it does not recognise', async () => {
    const disk = fakeHandle('{"some": "other app data"}')
    stubPickers(disk.handle)

    const result = await saveAsNewFile(store().book!, store().globalSettings)

    expect(disk.text()).toBe('{"some": "other app data"}')
    expect(result).toBe('refused')
    expect(hasFileHandle()).toBe(false)
  })

  it('writes the book to an empty file and connects to it', async () => {
    const disk = fakeHandle('')
    stubPickers(disk.handle)

    expect(await saveAsNewFile(store().book!, store().globalSettings)).toBe('saved')
    expect((JSON.parse(disk.text()) as WritinatorFile).book.storylets[0].content).toBe('current book text')
    expect(getStoredFileHandle()).toBe(disk.handle)
  })

  it('loads a file that already holds a book instead of overwriting it', async () => {
    const existing = makeFile(makeBook([makeStorylet('x', 'book on disk')], 'book-2'), { saveCounter: 5 })
    const disk = fakeHandle(JSON.stringify(existing))
    stubPickers(disk.handle)

    expect(await saveAsNewFile(store().book!, store().globalSettings)).toBe('loaded')
    expect(storyletContent('x')).toBe('book on disk')
    expect(store().lastSavedCounter).toBe(5)
    expect(getStoredFileHandle()).toBe(disk.handle)
  })
})

describe('creating a book with a file', () => {
  it('names the book after the file and writes it', async () => {
    const disk = fakeHandle('', 'My Novel.writinator')
    stubPickers(disk.handle)

    expect(await createBookWithFile('Untitled Book')).toBe('created')
    expect(store().book?.title).toBe('My Novel')
    expect((JSON.parse(disk.text()) as WritinatorFile).book.title).toBe('My Novel')
  })
})

describe('Cmd+S onto a file from a newer app version', () => {
  it('does not overwrite it', async () => {
    const newer = JSON.stringify({ ...makeFile(makeBook([makeStorylet('a', 'future')])), version: 9 })
    const disk = fakeHandle(newer)
    setStoredFileHandle(disk.handle)

    await quickSave(store().book!, store().globalSettings)

    expect(disk.text()).toBe(newer)
  })
})

describe('what a saved file contains', () => {
  it('only includes history for this book’s storylets', async () => {
    await createSnapshot('a', 'history of this book', 'manual')
    await createSnapshot('other-book-storylet', 'history of another book', 'manual')
    await createPublishedSnapshot('a', 'published here', { name: 'A' })
    await createPublishedSnapshot('other-book-storylet', 'published elsewhere', { name: 'B' })

    const file = await buildWritinatorFile(store().book!, store().globalSettings, 1)

    expect(Object.keys(file.snapshots)).toEqual(['a'])
    expect(Object.keys(file.publishedSnapshots ?? {})).toEqual(['a'])
  })
})

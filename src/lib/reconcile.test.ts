import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { reconcileWithFile } from './reconcile'
import { clearFileHandle, quickSave, setStoredFileHandle } from './fileSystem'
import { useStoryletStore } from '../stores/storyletStore'
import { useCharacterStore } from '../stores/characterStore'
import { getSnapshots } from '../stores/snapshotStore'
import { createPublishedSnapshot, getPublishedSnapshots } from '../stores/publishedSnapshotStore'
import type { WritinatorFile } from '../types'
import { delta, makeBook, makeCharacter, makeFile, makeStorylet, seedStore, storyletContent } from '../test/fixtures'

/** A fake File System Access handle backed by a string. */
function fakeDisk(initial: WritinatorFile) {
  let text = JSON.stringify(initial)
  const handle = {
    kind: 'file',
    name: 'book.writinator',
    getFile: async () => ({ text: async () => text, lastModified: Date.now() }),
    createWritable: async () => ({
      write: async (data: string) => {
        text = data
      },
      close: async () => {},
    }),
    queryPermission: async () => 'granted',
  }
  setStoredFileHandle(handle as unknown as FileSystemFileHandle)
  return {
    read: (): WritinatorFile => JSON.parse(text) as WritinatorFile,
    replace: (file: WritinatorFile) => {
      text = JSON.stringify(file)
    },
  }
}

const store = () => useStoryletStore.getState()

/** Open a file the way the app does (load, then record the save point). */
async function openFile(file: WritinatorFile): Promise<void> {
  await store().loadFile(file)
  store().setLastSaved(file.saveCounter, Date.now())
}

function bookWith(text: string) {
  return makeBook([makeStorylet('a', text)])
}

beforeEach(() => {
  seedStore(bookWith('start'), 'a')
})

afterEach(() => {
  clearFileHandle()
})

describe('reconcile with the file on disk', () => {
  it('reloads a file that another device saved with the same save counter', async () => {
    const mine = makeFile(bookWith('version from this device'), { saveCounter: 3, saveId: 'save-mine' })
    const disk = fakeDisk(mine)
    await openFile(mine)

    disk.replace(makeFile(bookWith('version from the other device'), { saveCounter: 3, saveId: 'save-theirs' }))
    const result = await reconcileWithFile()

    expect(result.kind).toBe('hot-reload')
    expect(storyletContent('a')).toBe('version from the other device')
  })

  it('keeps unsaved local edits when the file changed on disk, and keeps the file version in history', async () => {
    const mine = makeFile(bookWith('saved text'), { saveCounter: 3, saveId: 'save-mine' })
    const disk = fakeDisk(mine)
    await openFile(mine)
    store().updateStoryletContent('saved text plus unsaved local edits')
    store()._flushContentUpdate()

    disk.replace(makeFile(bookWith('newer text from disk'), { saveCounter: 4, saveId: 'save-theirs' }))
    const result = await reconcileWithFile()

    expect(result.kind).toBe('diverged')
    expect(storyletContent('a')).toBe('saved text plus unsaved local edits')
    const history = await getSnapshots('a')
    expect(history.some((s) => s.content === 'newer text from disk')).toBe(true)
  })

  it('reloads a newer file when there are no local edits', async () => {
    const mine = makeFile(bookWith('saved text'), { saveCounter: 3, saveId: 'save-mine' })
    const disk = fakeDisk(mine)
    await openFile(mine)

    disk.replace(makeFile(bookWith('newer text from disk'), { saveCounter: 4, saveId: 'save-theirs' }))
    const result = await reconcileWithFile()

    expect(result.kind).toBe('hot-reload')
    expect(storyletContent('a')).toBe('newer text from disk')
  })

  it('is in sync right after opening a file', async () => {
    const mine = makeFile(bookWith('saved text'), { saveCounter: 3, saveId: 'save-mine' })
    fakeDisk(mine)
    await openFile(mine)

    expect((await reconcileWithFile()).kind).toBe('in-sync')
  })
})

describe('saving over a file that changed on disk', () => {
  it('Cmd+S does not overwrite a file another device saved since we opened it', async () => {
    const mine = makeFile(bookWith('saved text'), { saveCounter: 3, saveId: 'save-mine' })
    const disk = fakeDisk(mine)
    await openFile(mine)
    store().updateStoryletContent('my edits')
    store()._flushContentUpdate()

    disk.replace(makeFile(bookWith('the other device'), { saveCounter: 3, saveId: 'save-theirs' }))
    await quickSave(store().book!, store().globalSettings)

    expect(disk.read().book.storylets[0].content).toBe('the other device')
    expect(storyletContent('a')).toBe('my edits')
  })

  it('a normal save goes through and a second save does too', async () => {
    const mine = makeFile(bookWith('saved text'), { saveCounter: 3, saveId: 'save-mine' })
    const disk = fakeDisk(mine)
    await openFile(mine)

    store().updateStoryletContent('edit one')
    store()._flushContentUpdate()
    await quickSave(store().book!, store().globalSettings)
    expect(disk.read().book.storylets[0].content).toBe('edit one')

    store().updateStoryletContent('edit two')
    store()._flushContentUpdate()
    await quickSave(store().book!, store().globalSettings)
    expect(disk.read().book.storylets[0].content).toBe('edit two')
    expect((await reconcileWithFile()).kind).toBe('in-sync')
  })
})

describe('published snapshot history', () => {
  it('opening a file keeps publishes that were never saved to that file', async () => {
    await createPublishedSnapshot('a', 'Published chapter text', { name: 'Chapter 1' })

    await store().loadFile(makeFile(bookWith('from file')))

    const published = await getPublishedSnapshots('a')
    expect(published.map((p) => p.content)).toContain('Published chapter text')
  })
})

describe('diverged: things that exist only on disk', () => {
  it('are merged into the local book so the next save keeps them', async () => {
    const mine = makeFile(bookWith('saved text'), { saveCounter: 3, saveId: 'save-mine' })
    const disk = fakeDisk(mine)
    await openFile(mine)
    useCharacterStore.setState({
      characters: [makeCharacter('hero', [], {})],
      markers: { m1: [delta('hero', { kind: 'adjust', statId: 'hp', delta: 1 }, '0000-local-d-0-0')] },
    })
    store().updateStoryletContent('my unsaved edits')
    store()._flushContentUpdate()

    const diskBook = makeBook([
      makeStorylet('a', 'their edit of a'),
      makeStorylet('b', 'a chapter added on the other device'),
      makeStorylet('c', 'child of b', { parentId: 'b' }),
    ])
    disk.replace(makeFile(diskBook, {
      saveCounter: 4,
      saveId: 'save-theirs',
      characters: [makeCharacter('hero', [], {}), makeCharacter('villain', [], {})],
      markers: {
        m1: [delta('hero', { kind: 'adjust', statId: 'hp', delta: 99 }, '0000-disk-d-0-0')],
        m2: [delta('villain', { kind: 'adjust', statId: 'hp', delta: 2 }, '0000-disk-d2-0-0')],
      },
    }))
    const result = await reconcileWithFile()

    expect(result.kind).toBe('diverged')
    const storylets = store().book!.storylets
    expect(storylets.map((s) => s.id)).toEqual(['a', 'b', 'c'])
    expect(storyletContent('a')).toBe('my unsaved edits')
    expect(storylets[1].name).toBe('b (from disk)')
    expect(storylets[1].content).toBe('a chapter added on the other device')
    expect(storylets[2].parentId).toBe('b')
    const chars = useCharacterStore.getState()
    expect(chars.characters.map((c) => c.id)).toEqual(['hero', 'villain'])
    expect(chars.markers.m1[0].id).toBe('0000-local-d-0-0')
    expect(chars.markers.m2[0].id).toBe('0000-disk-d2-0-0')

    await quickSave(store().book!, store().globalSettings)
    expect(disk.read().book.storylets.map((s) => s.id)).toEqual(['a', 'b', 'c'])
  })
})

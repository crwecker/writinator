import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { insertNoteAtCursor, saveToDisk } from './shellActions'
import { useNotesStore } from '../../stores/notesStore'
import { makeBook, makeStorylet, seedStore } from '../../test/fixtures'
import { isFileLockedNow } from '../../lib/fileLock'
import { quickSave, saveAsNewFile, hasFileTetherCapability } from '../../lib/fileSystem'
import { showToast } from '../../stores/genericToastStore'

vi.mock('../../lib/fileLock', () => ({ isFileLockedNow: vi.fn(() => false), useIsFileLocked: () => false }))
vi.mock('../../lib/fileSystem', () => ({
  quickSave: vi.fn(),
  saveAsNewFile: vi.fn(),
  hasFileTetherCapability: vi.fn(() => true),
}))
vi.mock('../../stores/genericToastStore', () => ({ showToast: vi.fn() }))

let view: EditorView | null = null

beforeEach(() => {
  useNotesStore.setState({ positionNotes: {}, storyletNotes: {} })
  seedStore(makeBook([makeStorylet('s1', 'hello')]))
})

afterEach(() => {
  view?.destroy()
  view = null
})

describe('insertNoteAtCursor', () => {
  it('does nothing while the file is locked (no orphan note)', () => {
    vi.mocked(isFileLockedNow).mockReturnValue(true)
    view = new EditorView({ state: EditorState.create({ doc: 'hello' }) })
    const id = insertNoteAtCursor(view)
    expect(id).toBeNull()
    expect(Object.keys(useNotesStore.getState().positionNotes)).toHaveLength(0)
    expect(view.state.doc.toString()).toBe('hello')
  })

  it('inserts the anchor and creates the note when unlocked', () => {
    vi.mocked(isFileLockedNow).mockReturnValue(false)
    view = new EditorView({ state: EditorState.create({ doc: 'hello' }) })
    const id = insertNoteAtCursor(view)
    expect(id).not.toBeNull()
    expect(useNotesStore.getState().positionNotes[id!]).toBeDefined()
    expect(view.state.doc.toString()).toContain(`<!-- note:${id} -->`)
  })
})

describe('saveToDisk', () => {
  it('shows an error toast and logs when the save fails', async () => {
    vi.mocked(hasFileTetherCapability).mockReturnValue(true)
    vi.mocked(quickSave).mockRejectedValue(new Error('disk full'))
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    await saveToDisk().catch(() => {})
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/save failed/i), 'error')
    expect(err).toHaveBeenCalled()
  })

  it('reports a failure from the save-as fallback too', async () => {
    vi.mocked(hasFileTetherCapability).mockReturnValue(true)
    vi.mocked(quickSave).mockResolvedValue(false)
    vi.mocked(saveAsNewFile).mockRejectedValue(new Error('denied'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await saveToDisk().catch(() => {})
    expect(showToast).toHaveBeenCalledWith(expect.stringMatching(/save failed/i), 'error')
  })
})

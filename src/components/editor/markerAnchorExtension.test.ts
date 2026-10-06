import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { ANCHOR_DEBOUNCE_MS, markerAnchorExtension } from './markerAnchorExtension'
import { useCharacterStore } from '../../stores/characterStore'
import { delta, makeBook, makeStorylet, seedCharacters, seedStore } from '../../test/fixtures'

const lock = vi.hoisted(() => ({ locked: false }))
vi.mock('../../lib/fileLock', () => ({ isFileLockedNow: () => lock.locked }))

let view: EditorView | null = null

function setup(doc: string, stored: string) {
  seedStore(makeBook([makeStorylet('c1', stored)]), 'c1')
  seedCharacters([], { m1: [delta('hero', { kind: 'adjust', statId: 'hp', delta: -3 })] })
  view = new EditorView({
    state: EditorState.create({ doc, extensions: [markerAnchorExtension()] }),
    parent: document.body.appendChild(document.createElement('div')),
  })
  return view
}

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  lock.locked = false
  view?.destroy()
  view = null
  vi.useRealTimers()
})

describe('marker anchors', () => {
  it('records where each change sits once the editor is idle', () => {
    const doc = 'The wolf bit him. <!-- stat:m1 --> Ouch.'
    setup(doc, doc)
    expect(useCharacterStore.getState().markers.m1[0].anchor).toBeUndefined()
    vi.advanceTimersByTime(ANCHOR_DEBOUNCE_MS + 10)
    expect(useCharacterStore.getState().markers.m1[0].anchor).toEqual({ storyletId: 'c1', excerpt: 'The wolf bit him.' })
  })

  it('refreshes after edits move the marker to new prose', () => {
    const doc = 'The wolf bit him. <!-- stat:m1 -->'
    const v = setup(doc, doc)
    vi.advanceTimersByTime(ANCHOR_DEBOUNCE_MS + 10)
    v.dispatch({ changes: { from: 0, to: 17, insert: 'A bear mauled him.' } })
    vi.advanceTimersByTime(ANCHOR_DEBOUNCE_MS + 10)
    expect(useCharacterStore.getState().markers.m1[0].anchor?.excerpt).toBe('A bear mauled him.')
  })

  it('does nothing while the editor shows a different storylet than the store', () => {
    setup('Other text <!-- stat:m1 -->', 'Unrelated prose without markers')
    vi.advanceTimersByTime(ANCHOR_DEBOUNCE_MS + 10)
    expect(useCharacterStore.getState().markers.m1[0].anchor).toBeUndefined()
  })

  it('does nothing while the file is locked (read-only tab)', () => {
    lock.locked = true
    const doc = 'The wolf bit him. <!-- stat:m1 -->'
    setup(doc, doc)
    vi.advanceTimersByTime(ANCHOR_DEBOUNCE_MS + 10)
    expect(useCharacterStore.getState().markers.m1[0].anchor).toBeUndefined()
  })
})

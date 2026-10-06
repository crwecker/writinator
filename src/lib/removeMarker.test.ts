import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorView } from '@codemirror/view'
import { markerCommentRegex, removeMarkerFromStorylet } from './removeMarker'
import { useStoryletStore } from '../stores/storyletStore'
import { makeBook, makeStorylet, seedStore, storyletContent } from '../test/fixtures'

const NOTE_ID = '9f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f'
const NOTE = `<!-- note:${NOTE_ID} -->`

let view: EditorView

beforeEach(() => {
  vi.useFakeTimers()
  seedStore(
    makeBook([
      makeStorylet('a', `Hello ${NOTE} world`),
      makeStorylet('b', `Second chapter ${NOTE} here`),
    ]),
    'a',
  )
  view = new EditorView({ doc: `Hello ${NOTE} world` })
})

afterEach(() => {
  view.destroy()
  vi.useRealTimers()
})

describe('removing a marker from the text', () => {
  it('removes the marker from the live editor text, not a stale saved copy', () => {
    // The user typed at the start; the store copy is up to 1.5s behind.
    view.dispatch({ changes: { from: 0, insert: 'And then ' } })

    removeMarkerFromStorylet({
      book: useStoryletStore.getState().book!,
      storyletId: 'a',
      activeStoryletId: 'a',
      view,
      pattern: markerCommentRegex('note', NOTE_ID),
    })

    expect(view.state.doc.toString()).toBe('And then Hello  world')
  })

  it('removes a marker from another storylet without switching to it', () => {
    removeMarkerFromStorylet({
      book: useStoryletStore.getState().book!,
      storyletId: 'b',
      activeStoryletId: 'a',
      view,
      pattern: markerCommentRegex('note', NOTE_ID),
    })
    vi.advanceTimersByTime(100)

    expect(useStoryletStore.getState().activeStoryletId).toBe('a')
    expect(storyletContent('b')).toBe('Second chapter  here')
    expect(view.state.doc.toString()).toBe(`Hello ${NOTE} world`)
  })
})

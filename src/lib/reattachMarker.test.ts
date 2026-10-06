import { afterEach, describe, expect, it } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { insertMarkerIntoStorylet } from './reattachMarker'
import { makeBook, makeStorylet, seedStore, storyletContent } from '../test/fixtures'

let view: EditorView | null = null
afterEach(() => { view?.destroy(); view = null })

describe('insertMarkerIntoStorylet', () => {
  it('writes the marker into a storylet that is not open', () => {
    const book = makeBook([makeStorylet('c1', 'He fell. Then rose.'), makeStorylet('c2', 'x')])
    seedStore(book, 'c2')
    expect(insertMarkerIntoStorylet({ book, storyletId: 'c1', activeStoryletId: 'c2', view: null, offset: 8, markerId: 'm1' })).toBe(true)
    expect(storyletContent('c1')).toBe('He fell. <!-- stat:m1 --> Then rose.')
  })

  it('edits the open storylet through the editor', () => {
    const book = makeBook([makeStorylet('c1', 'He fell.')])
    seedStore(book, 'c1')
    view = new EditorView({ state: EditorState.create({ doc: 'He fell. Live text.' }) })
    expect(insertMarkerIntoStorylet({ book, storyletId: 'c1', activeStoryletId: 'c1', view, offset: 19, markerId: 'm1' })).toBe(true)
    expect(view.state.doc.toString()).toBe('He fell. Live text. <!-- stat:m1 -->')
  })

  it('refuses a missing storylet', () => {
    const book = makeBook([makeStorylet('c1', 'x')])
    seedStore(book, 'c1')
    expect(insertMarkerIntoStorylet({ book, storyletId: 'zz', activeStoryletId: 'c1', view: null, offset: 0, markerId: 'm' })).toBe(false)
  })
})

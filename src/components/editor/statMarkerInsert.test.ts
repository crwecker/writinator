import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { insertStatMarkerAtSelection } from './statMarkerInsert'
import { delta, seedCharacters } from '../../test/fixtures'

const ID_A = '11111111-1111-1111-1111-111111111111'

let view: EditorView | null = null
afterEach(() => {
  view?.destroy()
  view = null
})

function makeView(doc: string, anchor: number, head = anchor): EditorView {
  view = new EditorView({ state: EditorState.create({ doc, selection: { anchor, head } }) })
  return view
}

describe('bubble toolbar "Stat Change"', () => {
  it('opens the marker that already ends at the selection instead of adding a duplicate', () => {
    seedCharacters([], { [ID_A]: [delta('c1', { kind: 'adjust', statId: 'hp', delta: -1 })] })
    const doc = `He fell<!-- stat:${ID_A} --> hard.`
    const v = makeView(doc, 3, doc.indexOf(' hard'))
    const onInsert = vi.fn()

    insertStatMarkerAtSelection(v, onInsert)

    expect(v.state.doc.toString()).toBe(doc)
    expect(onInsert).toHaveBeenCalledWith(ID_A)
  })

  it('opens the marker that begins right at the selection end', () => {
    seedCharacters([], { [ID_A]: [delta('c1', { kind: 'adjust', statId: 'hp', delta: -1 })] })
    const doc = `He fell<!-- stat:${ID_A} --> hard.`
    const v = makeView(doc, 3, 7)
    const onInsert = vi.fn()

    insertStatMarkerAtSelection(v, onInsert)

    expect(v.state.doc.toString()).toBe(doc)
    expect(onInsert).toHaveBeenCalledWith(ID_A)
  })

  it('ignores an orphan marker (no stored deltas) and inserts a new one', () => {
    seedCharacters([], {})
    const doc = `He fell<!-- stat:${ID_A} --> hard.`
    const v = makeView(doc, 3, 7)
    const onInsert = vi.fn()

    insertStatMarkerAtSelection(v, onInsert)

    const newId = onInsert.mock.calls[0][0] as string
    expect(newId).not.toBe(ID_A)
    expect(v.state.doc.toString()).toBe(`He fell<!-- stat:${newId} --><!-- stat:${ID_A} --> hard.`)
  })

  it('inserts a new marker after the selection when none abuts it', () => {
    seedCharacters([], {})
    const v = makeView('He fell hard.', 3, 7)
    const onInsert = vi.fn()

    insertStatMarkerAtSelection(v, onInsert)

    const newId = onInsert.mock.calls[0][0] as string
    expect(v.state.doc.toString()).toBe(`He fell<!-- stat:${newId} --> hard.`)
  })
})

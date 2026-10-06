import { afterEach, describe, expect, it } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import {
  decideStatDeltasMerge,
  findDocStatMarkers,
  insertStatDeltas,
  insertionStopOffset,
  mergeEntriesIntoDeltas,
} from './insertStatDelta'
import { delta, seedCharacters } from '../test/fixtures'
import { useCharacterStore } from '../stores/characterStore'

const ID_A = '11111111-1111-1111-1111-111111111111'
let n = 0
const nextId = () => `d${++n}`

let view: EditorView | null = null
afterEach(() => {
  view?.destroy()
  view = null
  n = 0
})

describe('mergeEntriesIntoDeltas', () => {
  it('sums combinable ops and appends the rest in order', () => {
    const existing = [delta('kael', { kind: 'adjust', statId: 'hp', delta: -5 }, 'e1')]
    const out = mergeEntriesIntoDeltas(
      existing,
      [
        { characterId: 'kael', op: { kind: 'adjust', statId: 'hp', delta: -10 } },
        { characterId: 'mira', op: { kind: 'adjust', statId: 'hp', delta: 3 } },
        { characterId: 'kael', op: { kind: 'fill', statId: 'mp' } },
      ],
      nextId,
    )
    expect(out).toEqual([
      { id: 'e1', characterId: 'kael', op: { kind: 'adjust', statId: 'hp', delta: -15 } },
      { id: 'd1', characterId: 'mira', op: { kind: 'adjust', statId: 'hp', delta: 3 } },
      { id: 'd2', characterId: 'kael', op: { kind: 'fill', statId: 'mp' } },
    ])
  })
})

describe('decideStatDeltasMerge', () => {
  it('merges into a marker ending at the cursor', () => {
    const doc = `Hit<!-- stat:${ID_A} --> him.`
    const markers = { [ID_A]: [delta('kael', { kind: 'fill', statId: 'hp' }, 'e1')] }
    const d = decideStatDeltasMerge({
      cursor: doc.indexOf(' him'),
      docMarkers: findDocStatMarkers(doc),
      markers,
      entries: [{ characterId: 'kael', op: { kind: 'adjust', statId: 'hp', delta: -1 } }],
      newDeltaId: nextId,
    })
    expect(d).toEqual({
      kind: 'merge',
      markerId: ID_A,
      deltas: [markers[ID_A][0], { id: 'd1', characterId: 'kael', op: { kind: 'adjust', statId: 'hp', delta: -1 } }],
    })
  })

  it('creates when nothing abuts', () => {
    const d = decideStatDeltasMerge({
      cursor: 2,
      docMarkers: [],
      markers: {},
      entries: [{ characterId: 'kael', op: { kind: 'fill', statId: 'hp' } }],
      newDeltaId: nextId,
    })
    expect(d).toEqual({ kind: 'create', deltas: [{ id: 'd1', characterId: 'kael', op: { kind: 'fill', statId: 'hp' } }] })
  })
})

describe('insertionStopOffset', () => {
  const doc = `Hit<!-- stat:${ID_A} --> him.`
  const docMarkers = findDocStatMarkers(doc)
  const markers = { [ID_A]: [delta('kael', { kind: 'fill', statId: 'hp' })] }

  it('stays at the cursor when the merge target ends there (already counted)', () => {
    expect(insertionStopOffset(doc.indexOf(' him'), docMarkers, markers)).toBe(doc.indexOf(' him'))
  })

  it('moves past a marker that begins at the cursor', () => {
    expect(insertionStopOffset(3, docMarkers, markers)).toBe(4)
  })

  it('ignores orphan markers', () => {
    expect(insertionStopOffset(3, docMarkers, {})).toBe(3)
  })
})

describe('insertStatDeltas', () => {
  it('inserts one marker holding every entry, in one undoable change', () => {
    seedCharacters([], {})
    view = new EditorView({ state: EditorState.create({ doc: 'He fell hard.', selection: { anchor: 7 } }) })
    const id = insertStatDeltas(view, [
      { characterId: 'kael', op: { kind: 'itemRemove', statId: 'inventory', name: 'Iron Sword' } },
      { characterId: 'mira', op: { kind: 'itemAdd', statId: 'inventory', name: 'Iron Sword', fields: { qty: 1 } } },
    ])
    expect(id).not.toBeNull()
    expect(view.state.doc.toString()).toBe(`He fell<!-- stat:${id} --> hard.`)
    expect(useCharacterStore.getState().markers[id!].map((d) => d.characterId)).toEqual(['kael', 'mira'])
    expect(view.state.selection.main.head).toBe(`He fell<!-- stat:${id} -->`.length)
  })

  it('inserts at an explicit position', () => {
    seedCharacters([], {})
    view = new EditorView({ state: EditorState.create({ doc: 'He fell hard.', selection: { anchor: 0 } }) })
    const id = insertStatDeltas(view, [{ characterId: 'kael', op: { kind: 'fill', statId: 'hp' } }], 2)
    expect(view.state.doc.toString()).toBe(`He<!-- stat:${id} --> fell hard.`)
  })

  it('merges into an abutting marker without touching the text', () => {
    const doc = `He fell<!-- stat:${ID_A} --> hard.`
    seedCharacters([], { [ID_A]: [delta('kael', { kind: 'adjust', statId: 'hp', delta: -1 })] })
    view = new EditorView({ state: EditorState.create({ doc, selection: { anchor: doc.indexOf(' hard') } }) })
    expect(insertStatDeltas(view, [{ characterId: 'kael', op: { kind: 'adjust', statId: 'hp', delta: -2 } }])).toBe(ID_A)
    expect(view.state.doc.toString()).toBe(doc)
    expect(useCharacterStore.getState().markers[ID_A][0].op).toEqual({ kind: 'adjust', statId: 'hp', delta: -3 })
  })

  it('does nothing for an empty batch', () => {
    seedCharacters([], {})
    view = new EditorView({ state: EditorState.create({ doc: 'x' }) })
    expect(insertStatDeltas(view, [])).toBeNull()
    expect(view.state.doc.toString()).toBe('x')
  })
})

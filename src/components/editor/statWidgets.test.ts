import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import * as characterState from '../../lib/characterState'
import { renderModeField, setRenderModeEffect, type RenderMode } from './renderMode'
import { characterSnapshotField, dispatchCharacterSnapshot } from './statMarkerExtension'
import { dispatchStatRefStoryletContext, statRefExtension } from './statRefExtension'
import { dispatchStatblockActiveStorylet, statblockMarkerExtension } from './statblockMarkerExtension'
import { useEditorStore } from '../../stores/editorStore'
import { delta, makeBook, makeCharacter, makeStorylet, seedCharacters, seedStore } from '../../test/fixtures'
import type { Book, StatDelta } from '../../types'

vi.mock('../../lib/characterState', async (importOriginal) => {
  const actual = await importOriginal<typeof characterState>()
  return { ...actual, computeStateAt: vi.fn(actual.computeStateAt) }
})

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const hero = makeCharacter('hero', [{ id: 'hp', name: 'HP', type: 'numberWithMax' }], {
  hp: { kind: 'numberWithMax', value: 10, max: 10 },
})
const markers: Record<string, StatDelta[]> = {
  m1: [delta('hero', { kind: 'adjust', statId: 'hp', delta: -3 })],
}

let view: EditorView | null = null

/**
 * An editor on storylet c1 whose store copy is `stored` while the editor
 * already shows `live` — the store trails the editor by up to 1.5s.
 */
function setup(stored: string, live: string, mode: RenderMode = 'rendered'): { view: EditorView; book: Book } {
  useEditorStore.setState({ renderMode: mode })
  const book = makeBook([makeStorylet('c1', stored)])
  seedStore(book, 'c1')
  seedCharacters([hero], markers)
  let created!: EditorView
  act(() => {
    created = new EditorView({
      state: EditorState.create({
        doc: live,
        extensions: [renderModeField, characterSnapshotField, statRefExtension(), statblockMarkerExtension()],
      }),
      parent: document.body.appendChild(document.createElement('div')),
    })
  })
  const v = created
  view = v
  act(() => {
    v.dispatch({ effects: setRenderModeEffect.of(mode) })
    dispatchCharacterSnapshot(v, { characters: [hero], markers })
    dispatchStatblockActiveStorylet(v, 'c1')
    dispatchStatRefStoryletContext(v, { book, storyletId: 'c1', documentStyles: undefined, snippets: undefined })
  })
  return { view: v, book }
}

beforeEach(() => {
  vi.mocked(characterState.computeStateAt).mockClear()
})

afterEach(() => {
  act(() => view?.destroy())
  view = null
  document.body.innerHTML = ''
})

const refText = (v: EditorView) => Array.from(v.dom.querySelectorAll('.cm-stat-ref')).map((el) => el.textContent)

describe('stat ref widgets', () => {
  it('read the live editor text, not the stale store copy', () => {
    const { view: v } = setup('Intro\nHP is {HP}', 'Intro\n<!-- stat:m1 -->HP is {HP}')
    expect(refText(v)).toEqual(['7'])
  })

  it('do not recompute when the cursor moves within a line', () => {
    const { view: v } = setup('Intro line\nHP is {HP}', 'Intro line\nHP is {HP}')
    vi.mocked(characterState.computeStateAt).mockClear()
    act(() => v.dispatch({ selection: { anchor: 3 } }))
    act(() => v.dispatch({ selection: { anchor: 5 } }))
    expect(characterState.computeStateAt).not.toHaveBeenCalled()
  })

  it('still reveal the raw token when the cursor moves onto its line', () => {
    const { view: v } = setup('Intro line\nHP is {HP}', 'Intro line\nHP is {HP}')
    expect(refText(v)).toEqual(['10'])
    act(() => v.dispatch({ selection: { anchor: v.state.doc.length } }))
    expect(refText(v)).toEqual([])
  })
})

describe('statblock widgets', () => {
  const block = '<!-- statblock:hero:fields=hp -->'

  it('read the live editor text, not the stale store copy', () => {
    const { view: v } = setup(`Intro\n${block}`, `Intro <!-- stat:m1 -->\n${block}`, 'preview')
    expect(v.dom.querySelector('.cm-statblock-widget')?.textContent).toContain('7/10')
  })

  it('keep their DOM and update in place when text above them changes', async () => {
    const { view: v } = setup(`Intro\n${block}`, `Intro\n${block}`, 'preview')
    const before = v.dom.querySelector('.cm-statblock-widget')
    expect(before?.textContent).toContain('10/10')
    act(() => v.dispatch({ changes: { from: 0, insert: '<!-- stat:m1 -->' } }))
    // Let any deferred unmount run: the reused root must stay mounted.
    await act(async () => {})
    const after = v.dom.querySelector('.cm-statblock-widget')
    expect(after).toBe(before)
    expect(after?.textContent).toContain('7/10')
    act(() => v.dispatch({ changes: { from: 0, insert: '<!-- stat:m1 -->' } }))
    await act(async () => {})
    expect(v.dom.querySelector('.cm-statblock-widget')).toBe(before)
    expect(before?.textContent).toContain('4/10')
  })
})

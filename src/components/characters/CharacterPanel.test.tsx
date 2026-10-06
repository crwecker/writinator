import { afterEach, describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { CharacterPanel } from './CharacterPanel'
import { useEditorStore } from '../../stores/editorStore'
import { delta, makeBook, makeCharacter, makeStorylet, seedCharacters, seedStore } from '../../test/fixtures'
import { render, type Rendered } from '../../test/render'

const hero = makeCharacter('hero', [{ id: 'hp', name: 'HP', type: 'numberWithMax' }], {
  hp: { kind: 'numberWithMax', value: 10, max: 10 },
})

let rendered: Rendered | null = null
let view: EditorView | null = null

afterEach(() => {
  rendered?.unmount()
  view?.destroy()
  rendered = null
  view = null
})

describe('character panel', () => {
  it('computes against the live editor text, not the stale store copy', () => {
    // The store hasn't caught up with the marker the author just inserted.
    seedStore(makeBook([makeStorylet('c1', 'Intro. Later.')]), 'c1')
    seedCharacters([hero], { m1: [delta('hero', { kind: 'adjust', statId: 'hp', delta: -3 })] })
    const live = 'Intro. <!-- stat:m1 -->Later.'
    view = new EditorView({ state: EditorState.create({ doc: live }) })
    useEditorStore.setState({ cursorOffset: live.length })

    rendered = render(createElement(CharacterPanel, { open: true, onClose: () => {}, editorView: view }))

    const hp = rendered.container.querySelector('[data-testid="character-panel-effective-hero-hp"]')
    expect(hp?.textContent).toBe('7/10')
  })
})

import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { renderModeField, setRenderModeEffect, type RenderMode } from './renderMode'
import { dispatchCharacterSnapshot, statMarkerExtension } from './statMarkerExtension'
import { useEditorStore, type StatChipMode } from '../../stores/editorStore'
import { delta } from '../../test/fixtures'
import { makeHero } from '../../test/characterFixtures'
import type { StatDelta } from '../../types'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const kael = makeHero('kael', { color: '#f87171' })
const markers: Record<string, StatDelta[]> = {
  m1: [
    delta('kael', { kind: 'adjust', statId: 'hp', delta: -15 }),
    delta('kael', { kind: 'itemAdd', statId: 'inventory', name: 'Wolf Pelt', fields: { qty: 1 } }),
  ],
}
const DOC = 'He fell.<!-- stat:m1 --> Then rose.'

let view: EditorView | null = null
afterEach(() => {
  act(() => view?.destroy())
  view = null
  document.body.innerHTML = ''
})

function setup(chipMode: StatChipMode, renderMode: RenderMode = 'rendered'): EditorView {
  useEditorStore.setState({ renderMode, statChipMode: chipMode })
  act(() => {
    view = new EditorView({
      state: EditorState.create({ doc: DOC, extensions: [renderModeField, statMarkerExtension()] }),
      parent: document.body.appendChild(document.createElement('div')),
    })
  })
  const v = view!
  act(() => {
    v.dispatch({ effects: setRenderModeEffect.of(renderMode) })
    dispatchCharacterSnapshot(v, { characters: [kael], markers })
  })
  return v
}

describe('stat change chips', () => {
  it('render the marker as a readable chip in the character colour', () => {
    const v = setup('chips')
    const chip = v.dom.querySelector<HTMLElement>('.cm-stat-chip')
    expect(chip?.textContent).toBe('Kael · HP −15 · +Wolf Pelt')
    expect(chip?.getAttribute('data-marker-id')).toBe('m1')
    expect(chip?.style.getPropertyValue('--chip-accent')).toBe('#f87171')
    expect(v.dom.querySelector('.cm-stat-marker-dot')).toBeNull()
  })

  it('fall back to dots when set to dots', () => {
    const v = setup('dots')
    expect(v.dom.querySelector('.cm-stat-chip')).toBeNull()
    expect(v.dom.querySelector('.cm-stat-marker-dot')?.getAttribute('data-marker-id')).toBe('m1')
  })

  it('hide the marker entirely when hidden', () => {
    const v = setup('hidden')
    expect(v.dom.querySelector('.cm-stat-chip, .cm-stat-marker-dot')).toBeNull()
    expect(v.contentDOM.textContent).toBe('He fell. Then rose.')
  })

  it('show the raw comment in source mode', () => {
    const v = setup('chips', 'source')
    expect(v.dom.querySelector('.cm-stat-chip')).toBeNull()
    expect(v.contentDOM.textContent).toContain('<!-- stat:m1 -->')
  })

  it('follow the setting when it changes', () => {
    const v = setup('chips')
    act(() => useEditorStore.getState().cycleStatChipMode())
    expect(useEditorStore.getState().statChipMode).toBe('dots')
    expect(v.dom.querySelector('.cm-stat-chip')).toBeNull()
    expect(v.dom.querySelector('.cm-stat-marker-dot')).not.toBeNull()
  })
})

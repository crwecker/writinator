import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { cosmeticLookCompartment, editorCosmeticsExtension, syncEditorCosmetics } from './editorCosmetics'
import { useCosmeticsStore } from '../stores/cosmeticsStore'

let view: EditorView
let stop: () => void

const fontLinks = () => [...document.head.querySelectorAll('link[data-cosmetic-font]')].map((l) => l.getAttribute('href') ?? '')

beforeEach(() => {
  useCosmeticsStore.setState(useCosmeticsStore.getInitialState(), true)
  document.head.querySelectorAll('link[data-cosmetic-font]').forEach((l) => l.remove())
  view = new EditorView({ state: EditorState.create({ doc: 'hello', extensions: [editorCosmeticsExtension()] }), parent: document.body })
  stop = syncEditorCosmetics(() => view)
})

afterEach(() => {
  stop()
  view.destroy()
})

describe('editor cosmetics', () => {
  it('switching to an owned theme reconfigures the editor', () => {
    // The default look carries the One Dark base (dark), a light theme drops it.
    expect(view.state.facet(EditorView.darkTheme)).toBe(true)
    const before = cosmeticLookCompartment.get(view.state)
    useCosmeticsStore.setState({ owned: ['theme-parchment'] })
    useCosmeticsStore.getState().select('theme-parchment')
    expect(cosmeticLookCompartment.get(view.state)).not.toBe(before)
    expect(view.state.facet(EditorView.darkTheme)).toBe(false)
    useCosmeticsStore.setState({ owned: ['theme-parchment', 'theme-forest'] })
    useCosmeticsStore.getState().select('theme-forest')
    expect(view.state.facet(EditorView.darkTheme)).toBe(true)
  })

  it('a cursor style reconfigures the editor too', () => {
    const before = cosmeticLookCompartment.get(view.state)
    useCosmeticsStore.setState({ owned: ['cursor-glow'] })
    useCosmeticsStore.getState().select('cursor-glow')
    expect(cosmeticLookCompartment.get(view.state)).not.toBe(before)
  })

  it('loads a Google font only once it is owned and chosen', () => {
    useCosmeticsStore.setState({ owned: ['font-eb-garamond'] })
    expect(fontLinks()).toEqual([])
    useCosmeticsStore.getState().select('font-eb-garamond')
    expect(fontLinks()).toHaveLength(1)
    expect(fontLinks()[0]).toContain('https://fonts.googleapis.com/css2?family=EB+Garamond')
    useCosmeticsStore.getState().clearFont()
    useCosmeticsStore.getState().select('font-eb-garamond')
    expect(fontLinks()).toHaveLength(1)
  })
})

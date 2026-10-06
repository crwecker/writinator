import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { QuickEntryPopover } from './QuickEntryPopover'
import { useCharacterStore } from '../../stores/characterStore'
import { delta, makeBook, makeStorylet, seedCharacters, seedStore } from '../../test/fixtures'
import { item, makeHero } from '../../test/characterFixtures'
import { keyDown, typeInto } from '../../test/domEvents'
import { render, type Rendered } from '../../test/render'

const kael = makeHero('kael', { hp: [40, 40], inventory: [item('Arrows', 5)] })
const DOC = 'The ogre hit him.'

let rendered: Rendered | null = null
let view: EditorView | null = null
const onClose = vi.fn()
const onOpenFullEditor = vi.fn()

beforeEach(() => {
  onClose.mockReset()
  onOpenFullEditor.mockReset()
})
afterEach(() => {
  rendered?.unmount()
  view?.destroy()
  rendered = null
  view = null
})

function setup(doc = DOC, cursor = doc.length, markers = {}) {
  seedStore(makeBook([makeStorylet('c1', doc)]), 'c1')
  seedCharacters([kael], markers)
  view = new EditorView({ state: EditorState.create({ doc, selection: { anchor: cursor } }) })
  rendered = render(createElement(QuickEntryPopover, { open: true, onClose, editorView: view, onOpenFullEditor }))
  const input = rendered.container.querySelector<HTMLInputElement>('[data-testid="quick-entry-input"]')
  expect(input).not.toBeNull()
  return { input: input!, container: rendered.container }
}

const rows = (container: HTMLElement) =>
  Array.from(container.querySelectorAll('[data-testid="quick-entry-preview"]')).map((el) => el.textContent)

describe('quick entry popover', () => {
  it('previews before → after at the cursor and saves one marker on Enter', () => {
    const { input, container } = setup()
    typeInto(input, 'Kael -15 HP, +Wolf Pelt')
    expect(rows(container)).toEqual(['Kael · HP 40 → 25', 'Kael · +Wolf Pelt ×1new'])

    keyDown(input, 'Enter')

    const markers = useCharacterStore.getState().markers
    const [id] = Object.keys(markers)
    expect(view!.state.doc.toString()).toBe(`${DOC}<!-- stat:${id} -->`)
    expect(markers[id].map((d) => d.op.kind)).toEqual(['adjust', 'itemAdd'])
    expect(onClose).toHaveBeenCalled()
  })

  it('computes "before" from the marker it will merge into', () => {
    const id = '11111111-1111-1111-1111-111111111111'
    const doc = `The ogre hit him.<!-- stat:${id} -->`
    const { input, container } = setup(doc, DOC.length, {
      [id]: [delta('kael', { kind: 'adjust', statId: 'hp', delta: -10 })],
    })
    typeInto(input, 'Kael -5 HP')
    expect(rows(container)).toEqual(['Kael · HP 30 → 25'])
    keyDown(input, 'Enter')
    expect(useCharacterStore.getState().markers[id][0].op).toEqual({ kind: 'adjust', statId: 'hp', delta: -15 })
  })

  it('uses the character of the nearest earlier marker when none is named', () => {
    const id = '11111111-1111-1111-1111-111111111111'
    const doc = `Hit<!-- stat:${id} --> him.`
    const { input, container } = setup(doc, doc.length, { [id]: [delta('kael', { kind: 'adjust', statId: 'hp', delta: -1 })] })
    typeInto(input, 'HP -1')
    expect(rows(container)).toEqual(['Kael · HP 39 → 38'])
  })

  it('does not save while a clause has an error, and offers to create the character', () => {
    const { input, container } = setup()
    typeInto(input, 'Bob -3 HP')
    expect(container.textContent).toContain('Unknown character “Bob”')
    keyDown(input, 'Enter')
    expect(view!.state.doc.toString()).toBe(DOC)

    const create = container.querySelector<HTMLButtonElement>('[data-testid="quick-entry-create"]')
    expect(create?.textContent).toBe('Create Bob')
    act(() => create!.click())
    expect(useCharacterStore.getState().characters.map((c) => c.name)).toEqual(['Kael', 'Bob'])
    expect(rows(container)).toEqual(['Bob · HP 10 → 7'])
  })

  it('offers to add an unknown stat to the character', () => {
    const { input, container } = setup()
    typeInto(input, 'Kael Sanity -2')
    const create = container.querySelector<HTMLButtonElement>('[data-testid="quick-entry-create"]')
    expect(create?.textContent).toBe('Add “Sanity” to Kael')
    act(() => create!.click())
    expect(useCharacterStore.getState().characters[0].stats.some((s) => s.name === 'Sanity' && s.type === 'number')).toBe(true)
    expect(rows(container)).toEqual(['Kael · Sanity 0 → -2'])
  })

  it('shows warnings', () => {
    const { input, container } = setup()
    typeInto(input, 'Kael -9 Arrows')
    expect(container.querySelector('[data-testid="quick-entry-warning"]')?.textContent).toBe('Kael only has 5 Arrows')
  })

  it('completes names with Tab', () => {
    const { input } = setup()
    typeInto(input, 'Kael -2 Arr')
    keyDown(input, 'Tab')
    expect(input.value).toBe('Kael -2 Arrows')
  })

  it('cancels on Escape without touching the text', () => {
    const { input } = setup()
    typeInto(input, 'Kael -15 HP')
    keyDown(input, 'Escape')
    expect(onClose).toHaveBeenCalled()
    expect(view!.state.doc.toString()).toBe(DOC)
  })

  it('links to the full editor', () => {
    const { container } = setup()
    act(() => container.querySelector<HTMLButtonElement>('[data-testid="quick-entry-full-editor"]')!.click())
    expect(onOpenFullEditor).toHaveBeenCalled()
  })
})

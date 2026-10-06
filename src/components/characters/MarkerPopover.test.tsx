import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, createElement } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { MarkerPopover } from './MarkerPopover'
import { useCharacterStore } from '../../stores/characterStore'
import { delta, makeBook, makeStorylet, seedCharacters, seedStore } from '../../test/fixtures'
import { makeHero } from '../../test/characterFixtures'
import { keyDown, typeInto } from '../../test/domEvents'
import { render, type Rendered } from '../../test/render'

const kael = makeHero('kael', { hp: [40, 40] })
const M = '22222222-2222-2222-2222-222222222222'
const DOC = `He was hit<!-- stat:${M} --> hard.`

let rendered: Rendered | null = null
let view: EditorView | null = null
const onClose = vi.fn()
const onOpenFullEditor = vi.fn()

beforeEach(() => {
  onClose.mockReset()
  onOpenFullEditor.mockReset()
  seedStore(makeBook([makeStorylet('c1', DOC)]), 'c1')
  seedCharacters([kael], {
    [M]: [
      delta('kael', { kind: 'adjust', statId: 'hp', delta: -10 }, 'd1'),
      delta('kael', { kind: 'itemAdd', statId: 'inventory', name: 'Wolf Pelt', fields: { qty: 1 } }, 'd2'),
    ],
  })
  view = new EditorView({ state: EditorState.create({ doc: DOC }) })
  rendered = render(createElement(MarkerPopover, { open: true, onClose, editorView: view, markerId: M, onOpenFullEditor }))
})
afterEach(() => {
  rendered?.unmount()
  view?.destroy()
  rendered = null
  view = null
})

const qa = (sel: string) => Array.from(rendered!.container.querySelectorAll<HTMLElement>(sel))
/** The nth element with a test id, asserting it is there. */
function nth(testId: string, i = 0): HTMLElement {
  const el = qa(`[data-testid="${testId}"]`)[i]
  expect(el, testId).toBeDefined()
  return el
}
const stored = () => useCharacterStore.getState().markers[M]

describe('marker popover', () => {
  it('lists each change as before → after', () => {
    expect(qa('[data-testid="marker-op"]').map((el) => el.textContent)).toEqual(['Kael · HP 40 → 30', 'Kael · +Wolf Pelt ×1'])
  })

  it('deletes one change', () => {
    act(() => nth('marker-op-delete', 1).click())
    expect(stored().map((d) => d.id)).toEqual(['d1'])
  })

  it('removes the marker from text and store when the last change is deleted', () => {
    act(() => nth('marker-op-delete', 1).click())
    act(() => nth('marker-op-delete', 0).click())
    expect(stored()).toBeUndefined()
    expect(view!.state.doc.toString()).toBe('He was hit hard.')
    expect(onClose).toHaveBeenCalled()
  })

  it('edits a change in place through the quick-entry grammar', () => {
    act(() => nth('marker-op-edit', 0).click())
    const input = nth('marker-edit-input') as HTMLInputElement
    expect(input.value).toBe('Kael -10 HP')
    typeInto(input, 'Kael -12 HP')
    keyDown(input, 'Enter')
    expect(stored()[0]).toEqual({ id: 'd1', characterId: 'kael', op: { kind: 'adjust', statId: 'hp', delta: -12 } })
    expect(stored()).toHaveLength(2)
  })

  it('adds changes with the quick-entry parser', () => {
    const input = nth('marker-add-input') as HTMLInputElement
    typeInto(input, '+1 Level')
    keyDown(input, 'Enter')
    expect(stored().map((d) => d.op.kind)).toEqual(['adjust', 'itemAdd', 'adjust'])
    expect(stored()[2]).toMatchObject({ characterId: 'kael', op: { statId: 'level', delta: 1 } })
    expect(input.value).toBe('')
  })

  it('opens the full editor', () => {
    act(() => nth('marker-full-editor').click())
    expect(onOpenFullEditor).toHaveBeenCalledWith(M)
  })
})

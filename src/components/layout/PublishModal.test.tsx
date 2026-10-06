import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { PublishModal } from './PublishModal'
import { useStoryletStore } from '../../stores/storyletStore'
import { makeBook, makeStorylet, seedStore } from '../../test/fixtures'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

function typeInto(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

const input = (placeholder: string) =>
  container.querySelector<HTMLInputElement>(`input[placeholder="${placeholder}"]`)!

beforeEach(() => {
  seedStore(makeBook([makeStorylet('a', 'Chapter text', { name: 'Chapter One' })]), 'a')
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('PublishModal', () => {
  it('keeps what the user typed when the storylet’s text is saved in the background', () => {
    act(() => root.render(<PublishModal open onClose={() => {}} />))
    expect(input('Snapshot name').value).toBe('Chapter One')

    act(() => {
      typeInto(input('Snapshot name'), 'My release')
      typeInto(input('e.g. 1.0, draft-2'), '2.0')
    })
    // A debounced flush replaces the storylet object.
    act(() => {
      useStoryletStore.getState().setStoryletContent('a', 'Chapter text, edited')
    })

    expect(input('Snapshot name').value).toBe('My release')
    expect(input('e.g. 1.0, draft-2').value).toBe('2.0')
  })
})

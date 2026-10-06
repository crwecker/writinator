import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import BubbleToolbar from './BubbleToolbar'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let root: Root | null = null
let container: HTMLDivElement | null = null
let view: EditorView | null = null

afterEach(async () => {
  if (root) await act(async () => root?.unmount())
  container?.remove()
  view?.destroy()
  root = container = view = null
})

async function mountToolbar(): Promise<EditorView> {
  view = new EditorView({ state: EditorState.create({ doc: 'Some text to select here.' }), parent: document.body })
  // jsdom has no layout; give every position a fixed on-screen rect.
  vi.spyOn(view, 'coordsAtPos').mockReturnValue({ left: 300, right: 300, top: 200, bottom: 216 })
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  const v = view
  await act(async () => root?.render(<BubbleToolbar editorView={v} />))
  return v
}

const nextFrame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())))

describe('BubbleToolbar', () => {
  it('does not poll', async () => {
    const spy = vi.spyOn(globalThis, 'setInterval')
    await mountToolbar()
    // jsdom drives requestAnimationFrame with a 60fps interval; ignore that one.
    expect(spy.mock.calls.filter((c) => c[1] !== 1000 / 60)).toEqual([])
  })

  it('appears on the next frame when the selection changes without mouse/keyboard (e.g. VIM visual mode)', async () => {
    const v = await mountToolbar()
    expect(container?.querySelector('[title="Bold"]')).toBeNull()
    act(() => v.dispatch({ selection: { anchor: 0, head: 4 } }))
    await nextFrame()
    expect(container?.querySelector('[title="Bold"]')).not.toBeNull()
    act(() => v.dispatch({ selection: { anchor: 2 } }))
    await nextFrame()
    expect(container?.querySelector('[title="Bold"]')).toBeNull()
  })
})

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { EditorView } from '@codemirror/view'
import Editor from './Editor'
import { makeBook, makeStorylet, seedStore } from '../../test/fixtures'
import { useStoryletStore } from '../../stores/storyletStore'
import { useMetricsStore } from '../../stores/metricsStore'
import { useEditorStore } from '../../stores/editorStore'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has no layout; CodeMirror measures text ranges when scrolling the cursor into view.
const emptyRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList
Range.prototype.getClientRects ??= emptyRects
Range.prototype.getBoundingClientRect ??= () => new DOMRect()

type UpdateContent = (content: string, storyletId?: string, options?: { countAsWriting?: boolean }) => void
let container: HTMLDivElement
let root: Root
let view: EditorView | null = null
let updateContent: ReturnType<typeof vi.fn<UpdateContent>>
let recordWpm: ReturnType<typeof vi.fn<(delta: number, timestamp: number) => void>>

const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(' ')

async function mount(): Promise<EditorView> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(<Editor onEditorView={(v) => { view = v }} />)
  })
  if (!view) throw new Error('editor did not mount')
  return view
}

function paste(v: EditorView, text: string) {
  const end = v.state.doc.length
  v.dispatch({ changes: { from: end, insert: text }, userEvent: 'input.paste' })
}

beforeEach(() => {
  seedStore(makeBook([makeStorylet('s1', 'Existing words here')]))
  updateContent = vi.fn<UpdateContent>()
  recordWpm = vi.fn<(delta: number, timestamp: number) => void>()
  useStoryletStore.setState({ updateStoryletContent: updateContent })
  useMetricsStore.setState({ recordWpmSample: recordWpm })
  useEditorStore.setState({ vimMode: false })
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  view = null
})

describe('Editor paste accounting', () => {
  it('a paste of more than 50 words does not count as writing', async () => {
    const v = await mount()
    paste(v, ` ${words(60)}`)
    await act(async () => {})
    expect(updateContent).toHaveBeenLastCalledWith(expect.any(String), 's1', { countAsWriting: false })
    expect(recordWpm).not.toHaveBeenCalled()
  })

  it('a short paste still counts', async () => {
    const v = await mount()
    paste(v, ` ${words(10)}`)
    await act(async () => {})
    expect(updateContent).toHaveBeenLastCalledWith(expect.any(String), 's1', { countAsWriting: true })
    expect(recordWpm).toHaveBeenCalledWith(10, expect.any(Number))
  })
})

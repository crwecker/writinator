import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import type { EditorView } from '@codemirror/view'
import { isolateHistory, undo } from '@codemirror/commands'
import { getCM, Vim } from '@replit/codemirror-vim'
import Editor from './Editor'
import type { VimMode } from './VimStatusLine'
import { makeBook, makeStorylet, seedStore } from '../../test/fixtures'
import { useStoryletStore } from '../../stores/storyletStore'
import { useMetricsStore } from '../../stores/metricsStore'
import { useEditorStore } from '../../stores/editorStore'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// jsdom has no layout; CodeMirror measures text ranges when scrolling the cursor into view.
const emptyRects = () => Object.assign([], { item: () => null }) as unknown as DOMRectList
Range.prototype.getClientRects ??= emptyRects
Range.prototype.getBoundingClientRect ??= () => new DOMRect()

let container: HTMLDivElement
let root: Root
let view: EditorView | null = null
type UpdateContent = (content: string, storyletId?: string, options?: { countAsWriting?: boolean }) => void
let updateContent: ReturnType<typeof vi.fn<UpdateContent>>
let recordWpm: ReturnType<typeof vi.fn<(delta: number, timestamp: number) => void>>
let vimModes: VimMode[]

async function mount(): Promise<EditorView> {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  await act(async () => {
    root.render(
      <Editor
        onEditorView={(v) => {
          view = v
        }}
        onVimModeChange={(m) => vimModes.push(m)}
      />,
    )
  })
  if (!view) throw new Error('editor did not mount')
  return view
}

const flush = () => act(async () => {})

beforeEach(() => {
  seedStore(makeBook([makeStorylet('s1', 'Existing words here')]))
  updateContent = vi.fn<UpdateContent>()
  recordWpm = vi.fn<(delta: number, timestamp: number) => void>()
  vimModes = []
  // The editor captures these at mount, so install the spies first.
  useStoryletStore.setState({ updateStoryletContent: updateContent })
  useMetricsStore.setState({ recordWpmSample: recordWpm })
  useEditorStore.setState({ vimMode: false })
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  view = null
})

function typeAtEnd(v: EditorView, text: string) {
  const end = v.state.doc.length
  v.dispatch({ changes: { from: end, insert: text }, userEvent: 'input.type' })
}

describe('Editor word accounting', () => {
  it('counts typing as writing', async () => {
    const v = await mount()
    typeAtEnd(v, ' two more')
    await flush()
    expect(updateContent).toHaveBeenLastCalledWith('Existing words here two more', 's1', { countAsWriting: true })
    expect(recordWpm).toHaveBeenCalledWith(2, expect.any(Number))
  })

  it('does not count undo as writing (and records no WPM for it)', async () => {
    const v = await mount()
    typeAtEnd(v, ' two more')
    await flush()
    // Delete the typed text, then undo the deletion: words come back, but nobody wrote them.
    v.dispatch({
      changes: { from: 19, to: v.state.doc.length },
      userEvent: 'delete',
      annotations: isolateHistory.of('full'),
    })
    await flush()
    recordWpm.mockClear()
    undo(v)
    await flush()
    expect(v.state.doc.toString()).toBe('Existing words here two more')
    expect(updateContent).toHaveBeenLastCalledWith('Existing words here two more', 's1', { countAsWriting: false })
    expect(recordWpm).not.toHaveBeenCalled()
  })

  it('does not count programmatic changes (snapshot restore, markers) as writing', async () => {
    const v = await mount()
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: 'Restored snapshot with many more words' } })
    await flush()
    expect(updateContent).toHaveBeenLastCalledWith('Restored snapshot with many more words', 's1', {
      countAsWriting: false,
    })
    expect(recordWpm).not.toHaveBeenCalled()
  })

  it('keeps the word count baseline across non-writing changes', async () => {
    const v = await mount()
    v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: 'one two three four five six' } })
    await flush()
    typeAtEnd(v, ' seven')
    await flush()
    expect(recordWpm).toHaveBeenCalledTimes(1)
    expect(recordWpm).toHaveBeenCalledWith(1, expect.any(Number))
  })
})

describe('Editor VIM mode reporting', () => {
  it('does not poll when VIM is off', async () => {
    const spy = vi.spyOn(globalThis, 'setInterval')
    await mount()
    // jsdom drives requestAnimationFrame with a 60fps interval; ignore that one.
    const intervals = spy.mock.calls.filter((c) => c[1] !== 1000 / 60)
    expect(intervals).toEqual([])
  })

  it('reports mode changes as they happen, including linewise/blockwise visual', async () => {
    useEditorStore.setState({ vimMode: true })
    const v = await mount()
    const cm = getCM(v)
    if (!cm) throw new Error('vim not active')
    vimModes = []
    Vim.handleKey(cm, 'i', 'user')
    expect(vimModes.at(-1)).toBe('INSERT')
    Vim.handleKey(cm, '<Esc>', 'user')
    expect(vimModes.at(-1)).toBe('NORMAL')
    Vim.handleKey(cm, 'V', 'user')
    expect(vimModes.at(-1)).toBe('VISUAL')
    Vim.handleKey(cm, '<Esc>', 'user')
    Vim.handleKey(cm, '<C-v>', 'user')
    expect(vimModes.at(-1)).toBe('VISUAL')
    Vim.handleKey(cm, '<Esc>', 'user')
    Vim.handleKey(cm, 'R', 'user')
    expect(vimModes.at(-1)).toBe('REPLACE')
  })

  it('keeps reporting after VIM is toggled off and back on', async () => {
    useEditorStore.setState({ vimMode: true })
    const v = await mount()
    await act(async () => useEditorStore.setState({ vimMode: false }))
    await act(async () => useEditorStore.setState({ vimMode: true }))
    const cm = getCM(v)
    if (!cm) throw new Error('vim not active')
    vimModes = []
    Vim.handleKey(cm, 'i', 'user')
    expect(vimModes.at(-1)).toBe('INSERT')
  })
})

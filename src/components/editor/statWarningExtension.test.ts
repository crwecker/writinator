import { afterEach, describe, expect, it, vi } from 'vitest'
import { act } from 'react'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { renderModeField, setRenderModeEffect, type RenderMode } from './renderMode'
import { dispatchCharacterSnapshot, statMarkerExtension } from './statMarkerExtension'
import { dispatchStatRefStoryletContext, statRefExtension } from './statRefExtension'
import { dispatchStatblockActiveStorylet, statblockMarkerExtension } from './statblockMarkerExtension'
import { applyMarkerWarningFix, statWarningExtension } from './statWarningExtension'
import { useEditorStore } from '../../stores/editorStore'
import { useCharacterStore } from '../../stores/characterStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { delta, makeBook, makeCharacter, makeStorylet, seedCharacters, seedStore } from '../../test/fixtures'
import type { StatblockTheme, StatDelta } from '../../types'


const lock = vi.hoisted(() => ({ locked: false }))
vi.mock('../../lib/fileLock', () => ({ isFileLockedNow: () => lock.locked }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const hero = makeCharacter('hero', [{ id: 'hp', name: 'HP', type: 'numberWithMax' }], {
  hp: { kind: 'numberWithMax', value: 10, max: 10 },
})

let view: EditorView | null = null

function setup(doc: string, markers: Record<string, StatDelta[]>, mode: RenderMode = 'rendered', theme?: StatblockTheme) {
  useEditorStore.setState({ renderMode: mode, statChipMode: 'chips' })
  const book = makeBook([makeStorylet('c1', doc)])
  seedStore(book, 'c1')
  if (theme) useStoryletStore.setState({ globalSettings: { statblockTheme: theme } })
  seedCharacters([hero], markers)
  let created!: EditorView
  act(() => {
    created = new EditorView({
      state: EditorState.create({
        doc,
        extensions: [renderModeField, statMarkerExtension(), statRefExtension(), statblockMarkerExtension(), statWarningExtension()],
      }),
      parent: document.body.appendChild(document.createElement('div')),
    })
  })
  const v = created
  view = v
  act(() => {
    v.dispatch({ effects: setRenderModeEffect.of(mode) })
    dispatchStatblockActiveStorylet(v, 'c1')
    dispatchStatRefStoryletContext(v, { book, storyletId: 'c1', documentStyles: undefined, snippets: undefined })
    dispatchCharacterSnapshot(v, { characters: [hero], markers })
  })
  return v
}

afterEach(() => {
  lock.locked = false
  act(() => view?.destroy())
  view = null
  document.body.innerHTML = ''
})

const over = () => ({ m1: [delta('hero', { kind: 'adjust', statId: 'hp', delta: 5 }, 'd1')] })

describe('stat warning badges', () => {
  it('mark a change that pushes HP over max', () => {
    const v = setup('He drank. <!-- stat:m1 --> Done.', over())
    const badges = v.dom.querySelectorAll('.cm-stat-warning-badge')
    expect(badges).toHaveLength(1)
    expect(badges[0].getAttribute('title')).toContain('HP would be 15/10 — above max')
  })

  it('stay away from valid changes', () => {
    const v = setup('Ouch <!-- stat:m1 -->', { m1: [delta('hero', { kind: 'adjust', statId: 'hp', delta: -5 })] })
    expect(v.dom.querySelectorAll('.cm-stat-warning-badge')).toHaveLength(0)
  })

  it('underline the raw marker in source mode and hide in clean mode', () => {
    const v = setup('x <!-- stat:m1 -->', over(), 'source')
    expect(v.dom.querySelectorAll('.cm-stat-warning-underline').length).toBeGreaterThan(0)
    act(() => v.dispatch({ effects: setRenderModeEffect.of('clean') }))
    expect(v.dom.querySelectorAll('.cm-stat-warning-badge, .cm-stat-warning-underline')).toHaveLength(0)
  })

  it('go away once a fix is applied', () => {
    const v = setup('x <!-- stat:m1 -->', over())
    applyMarkerWarningFix('m1', {
      kind: 'replaceDeltas',
      label: 'Clamp to 10',
      deltas: [delta('hero', { kind: 'adjust', statId: 'hp', delta: 0 }, 'd1')],
    })
    expect(useCharacterStore.getState().markers.m1[0].op).toEqual({ kind: 'adjust', statId: 'hp', delta: 0 })
    const { characters, markers } = useCharacterStore.getState()
    act(() => dispatchCharacterSnapshot(v, { characters, markers }))
    expect(v.dom.querySelectorAll('.cm-stat-warning-badge')).toHaveLength(0)
  })

  it('leave a locked (read-only) book untouched', () => {
    setup('x <!-- stat:m1 -->', over())
    lock.locked = true
    applyMarkerWarningFix('m1', { kind: 'replaceDeltas', label: 'Delete this change', deltas: [] })
    expect(useCharacterStore.getState().markers.m1).toHaveLength(1)
  })

  it('can add a missing equipment slot', () => {
    setup('x', {})
    applyMarkerWarningFix('m1', { kind: 'addSlot', label: 'Add a Ring slot', characterId: 'hero', slot: 'Ring' })
    expect(useCharacterStore.getState().characters[0].equipmentSlots).toEqual(['Ring'])
  })
})

describe('themed statblocks in the editor', () => {
  it('follow the book’s status-window theme', () => {
    const v = setup('Intro\n<!-- statblock:hero:fields=hp -->', {}, 'preview', 'minimal')
    const el = v.dom.querySelector('.cm-statblock-widget')
    expect(el?.textContent).toBe('hero — HP 10/10')
  })

  it('switch to the system window look', () => {
    const v = setup('Intro\n<!-- statblock:hero:fields=hp -->', {}, 'preview', 'system')
    const el = v.dom.querySelector('.cm-statblock-widget')
    expect(el?.querySelector('[data-statblock-theme="system"]')).not.toBeNull()
    expect(el?.textContent).toContain('STATUS')
  })
})

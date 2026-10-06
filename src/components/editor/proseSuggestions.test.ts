import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { getCM, vim } from '@replit/codemirror-vim'
import {
  proseSuggestions,
  proseSuggestionField,
  showProseSuggestion,
} from './proseSuggestions'
import { useCharacterStore } from '../../stores/characterStore'
import { useEditorStore } from '../../stores/editorStore'
import { useItemCatalogStore } from '../../stores/itemCatalogStore'
import { makeBook, makeStorylet, seedCharacters, seedStore } from '../../test/fixtures'
import { item, makeHero } from '../../test/characterFixtures'

const kael = makeHero('kael', { inventory: [item('Healing Potion', 2)] })
const mira = makeHero('mira')

let view: EditorView | null = null

beforeEach(() => {
  vi.useFakeTimers()
  seedCharacters([kael, mira], {})
  seedStore(makeBook([makeStorylet('s1', '')]), 's1')
  useEditorStore.setState({ statSuggestions: true, mutedStatSuggestions: [], vimMode: false })
})

afterEach(() => {
  useItemCatalogStore.getState().reset()
  view?.destroy()
  view = null
  vi.useRealTimers()
})

function makeView(doc = '', withVim = false): EditorView {
  const parent = document.createElement('div')
  document.body.append(parent)
  view = new EditorView({
    state: EditorState.create({
      doc,
      selection: { anchor: doc.length },
      extensions: [withVim ? vim() : [], proseSuggestions()],
    }),
    parent,
  })
  return view
}

/** Type `text` one character at a time, as the user would. */
function type(v: EditorView, text: string): void {
  for (const ch of text) {
    const head = v.state.selection.main.head
    v.dispatch({ changes: { from: head, insert: ch }, selection: { anchor: head + 1 }, userEvent: 'input.type' })
  }
  vi.advanceTimersByTime(0)
}

function key(v: EditorView, k: string): KeyboardEvent {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })
  v.contentDOM.dispatchEvent(e)
  return e
}

function active(v: EditorView) {
  return v.state.field(proseSuggestionField)
}

function ghost(v: EditorView): HTMLElement | null {
  return v.dom.querySelector('.cm-prose-suggest')
}

describe('prose suggestions', () => {
  it('offers a ghost chip when a sentence that describes a change is finished', () => {
    const v = makeView()
    type(v, 'Kael picked up a dagger.')
    expect(active(v)?.suggestion.text).toBe('Kael +Dagger')
    expect(ghost(v)?.textContent).toContain('Kael · +Dagger')
    expect(ghost(v)?.textContent).toContain('Tab')
  })

  it('offers nothing mid-sentence or for plain prose', () => {
    const v = makeView()
    type(v, 'Kael picked up a dagger')
    expect(active(v)).toBeNull()
    type(v, ' and smiled at the rain? ')
    expect(active(v)).toBeNull()
  })

  it('Tab records the change as a marker at the sentence end', () => {
    const v = makeView()
    type(v, 'Kael took 15 damage.')
    const e = key(v, 'Tab')
    expect(e.defaultPrevented).toBe(true)
    const doc = v.state.doc.toString()
    const m = doc.match(/^Kael took 15 damage\.<!-- stat:([0-9a-f-]+) -->$/)
    expect(m).not.toBeNull()
    const deltas = useCharacterStore.getState().markers[m![1]]
    expect(deltas).toHaveLength(1)
    expect(deltas[0]).toMatchObject({ characterId: 'kael', op: { kind: 'adjust', statId: 'hp', delta: -15 } })
    expect(active(v)).toBeNull()
    expect(v.state.selection.main.head).toBe(doc.length)
  })

  it('keeps the chip across trailing spaces and puts the marker before them', () => {
    const v = makeView()
    type(v, 'Kael picked up a dagger.  ')
    expect(active(v)).not.toBeNull()
    key(v, 'Tab')
    const doc = v.state.doc.toString()
    expect(doc).toMatch(/^Kael picked up a dagger\.<!-- stat:[0-9a-f-]+ --> {2}$/)
    expect(v.state.selection.main.head).toBe(doc.length)
  })

  it('clicking the chip accepts it', () => {
    const v = makeView()
    type(v, 'Kael drank the healing potion.')
    ghost(v)!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    const id = v.state.doc.toString().match(/<!-- stat:([0-9a-f-]+) -->/)?.[1]
    expect(id).toBeDefined()
    expect(useCharacterStore.getState().markers[id!][0].op).toMatchObject({ kind: 'itemFieldAdjust', name: 'Healing Potion', delta: -1 })
  })

  it('continuing to type dismisses it', () => {
    const v = makeView()
    type(v, 'Kael picked up a dagger. ')
    expect(active(v)).not.toBeNull()
    type(v, 'T')
    expect(active(v)).toBeNull()
    expect(ghost(v)).toBeNull()
  })

  it('Escape dismisses it without swallowing the key', () => {
    const v = makeView()
    type(v, 'Kael picked up a dagger.')
    const e = key(v, 'Escape')
    expect(active(v)).toBeNull()
    expect(e.defaultPrevented).toBe(false)
  })

  it('does not re-offer a dismissed sentence after a pause', () => {
    const v = makeView()
    type(v, 'Kael picked up a dagger.')
    key(v, 'Escape')
    vi.advanceTimersByTime(3000)
    expect(active(v)).toBeNull()
  })

  it('offers after a pause when the sentence ends in a closing mark', () => {
    const v = makeView()
    type(v, '*Kael gained a level.*')
    expect(active(v)).toBeNull()
    vi.advanceTimersByTime(1600)
    expect(active(v)?.suggestion.text).toBe('Kael +1 Level')
  })

  it('× mutes that pattern', () => {
    const v = makeView()
    type(v, 'Kael grabbed the shield.')
    const mute = v.dom.querySelector('.cm-prose-suggest-mute')
    expect(mute).not.toBeNull()
    mute!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(active(v)).toBeNull()
    expect(useEditorStore.getState().mutedStatSuggestions).toContain('item-gain:shield')
    expect(v.state.doc.toString()).not.toContain('<!--')
    type(v, ' Mira grabbed the shield.')
    expect(active(v)).toBeNull()
  })

  it('recognises catalog items that no lexicon knows', () => {
    const v = makeView()
    type(v, 'Kael found a Moonblade.')
    expect(active(v)).toBeNull()
    useItemCatalogStore.getState().addItem('Moonblade')
    type(v, ' Kael found the Moonblade.')
    expect(active(v)?.suggestion.text).toBe('Kael +Moonblade')
  })

  it('Tab passes through when no suggestion is showing', () => {
    const v = makeView('Kael ran.')
    const e = key(v, 'Tab')
    expect(e.defaultPrevented).toBe(false)
    expect(v.state.doc.toString()).toBe('Kael ran.')
  })

  it('skips a sentence that already has a stat marker right after it', () => {
    const id = '11111111-1111-1111-1111-111111111111'
    const v = makeView(`Kael picked up a dagger<!-- stat:${id} -->`)
    v.dispatch({ selection: { anchor: 'Kael picked up a dagger'.length } })
    type(v, '.')
    expect(active(v)).toBeNull()
  })

  it('offers nothing when the setting is off, and clears a visible chip when turned off', () => {
    const v = makeView()
    type(v, 'Kael picked up a dagger.')
    expect(active(v)).not.toBeNull()
    useEditorStore.getState().toggleStatSuggestions()
    expect(active(v)).toBeNull()
    type(v, ' Kael picked up a shield.')
    expect(active(v)).toBeNull()
  })

  function showDagger(v: EditorView): void {
    v.dispatch({
      effects: showProseSuggestion.of({
        from: 0,
        at: 'Kael picked up a dagger.'.length,
        text: 'Kael picked up a dagger.',
        suggestion: { text: 'Kael +Dagger', label: 'Kael · +Dagger', characterIds: ['kael'], keys: ['item-gain:dagger'] },
      }),
    })
  }

  it('accepts on Tab in VIM insert mode', () => {
    const v = makeView('Kael picked up a dagger.', true)
    key(v, 'i')
    v.dispatch({ selection: { anchor: v.state.doc.length } })
    expect(getCM(v)?.state.vim?.insertMode).toBe(true)
    showDagger(v)
    const e = key(v, 'Tab')
    expect(e.defaultPrevented).toBe(true)
    expect(v.state.doc.toString()).toMatch(/^Kael picked up a dagger\.<!-- stat:[0-9a-f-]+ -->$/)
    expect(v.state.doc.toString()).not.toContain('\t')
  })

  it('Escape in VIM insert mode dismisses and still leaves insert mode', () => {
    const v = makeView('Kael picked up a dagger.', true)
    key(v, 'i')
    v.dispatch({ selection: { anchor: v.state.doc.length } })
    showDagger(v)
    key(v, 'Escape')
    expect(active(v)).toBeNull()
    expect(getCM(v)?.state.vim?.insertMode).toBe(false)
  })

  it('Escape cancels a pending pause check', () => {
    const v = makeView()
    type(v, '*Kael gained a level.*')
    key(v, 'Escape')
    vi.advanceTimersByTime(3000)
    expect(active(v)).toBeNull()
  })

  it('leaves Tab to VIM in normal mode', () => {
    const v = makeView('Kael picked up a dagger.', true)
    v.dispatch({
      effects: showProseSuggestion.of({
        from: 0,
        at: v.state.doc.length,
        text: 'Kael picked up a dagger.',
        suggestion: { text: 'Kael +Dagger', label: 'Kael · +Dagger', characterIds: ['kael'], keys: ['item-gain:dagger'] },
      }),
    })
    key(v, 'Tab')
    expect(v.state.doc.toString()).toBe('Kael picked up a dagger.')
    expect(Object.keys(useCharacterStore.getState().markers)).toHaveLength(0)
  })
})

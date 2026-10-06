import { describe, expect, it } from 'vitest'
import { DEFAULT_KEYMAP, comboFromEvent, matchesEvent, shouldSkipGlobalShortcut } from './keybindingStore'

function keyEvent(init: KeyboardEventInit): KeyboardEvent {
  return new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init })
}

describe('matchesEvent — primary modifier is platform-aware', () => {
  const closeBook = DEFAULT_KEYMAP.closeBook!

  it('on mac, Cmd-O matches and Ctrl-O (VIM jump back) does not', () => {
    expect(matchesEvent(closeBook, keyEvent({ key: 'o', code: 'KeyO', metaKey: true }), true)).toBe(true)
    expect(matchesEvent(closeBook, keyEvent({ key: 'o', code: 'KeyO', ctrlKey: true }), true)).toBe(false)
  })

  it('elsewhere, Ctrl-O matches and Meta-O does not', () => {
    expect(matchesEvent(closeBook, keyEvent({ key: 'o', code: 'KeyO', ctrlKey: true }), false)).toBe(true)
    expect(matchesEvent(closeBook, keyEvent({ key: 'o', code: 'KeyO', metaKey: true }), false)).toBe(false)
  })
})

describe('matchesEvent — shifted punctuation and option-mangled keys', () => {
  it('matches the default insertStatMarker binding when Shift turns "." into ">"', () => {
    const e = keyEvent({ key: '>', code: 'Period', ctrlKey: true, shiftKey: true })
    expect(matchesEvent(DEFAULT_KEYMAP.insertStatMarker!, e, false)).toBe(true)
  })

  it('matches Cmd-Opt-V on mac even though Option makes e.key "√"', () => {
    const e = keyEvent({ key: '√', code: 'KeyV', metaKey: true, altKey: true })
    expect(matchesEvent(DEFAULT_KEYMAP.toggleVim!, e, true)).toBe(true)
  })
})

describe('comboFromEvent', () => {
  it('records the unshifted key and the primary modifier', () => {
    const e = keyEvent({ key: '>', code: 'Period', metaKey: true, shiftKey: true })
    expect(comboFromEvent(e, true)).toEqual({ key: '.', ctrl: true, shift: true })
  })

  it('ignores the non-primary control key', () => {
    expect(comboFromEvent(keyEvent({ key: 'o', code: 'KeyO', ctrlKey: true }), true)).toBeNull()
  })
})

describe('shouldSkipGlobalShortcut', () => {
  it('skips events already handled by the editor', () => {
    const e = keyEvent({ key: 's', code: 'KeyS', ctrlKey: true })
    e.preventDefault()
    expect(shouldSkipGlobalShortcut(e, { vimMode: false, inEditor: true })).toBe(true)
  })

  it('skips Ctrl-only combos in the editor while VIM is on', () => {
    const e = keyEvent({ key: 'b', code: 'KeyB', ctrlKey: true })
    expect(shouldSkipGlobalShortcut(e, { vimMode: true, inEditor: true })).toBe(true)
    expect(shouldSkipGlobalShortcut(e, { vimMode: true, inEditor: false })).toBe(false)
    expect(shouldSkipGlobalShortcut(e, { vimMode: false, inEditor: true })).toBe(false)
  })

  it('lets Ctrl-Shift combos through in VIM mode', () => {
    const e = keyEvent({ key: 'F', code: 'KeyF', ctrlKey: true, shiftKey: true })
    expect(shouldSkipGlobalShortcut(e, { vimMode: true, inEditor: true })).toBe(false)
  })
})

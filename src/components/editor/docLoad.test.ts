import { describe, expect, it } from 'vitest'
import { EditorState, type Extension, type TransactionSpec } from '@codemirror/state'
import { undo } from '@codemirror/commands'
import { editorHistory, loadContentIntoView, makeLockExt, needsEditorReload, type DocTarget } from './docLoad'

/** Minimal stand-in for an EditorView: holds state, applies transactions. */
function makeTarget(extensions: Extension[]): DocTarget & { state: EditorState } {
  const target = {
    state: EditorState.create({ doc: '', extensions }),
    dispatch(...specs: TransactionSpec[]) {
      target.state = target.state.update(...specs).state
    },
  }
  return target
}

function type(target: DocTarget, text: string): void {
  const end = target.state.doc.length
  target.dispatch({ changes: { from: end, insert: text }, userEvent: 'input.type' })
}

function runUndo(target: DocTarget): void {
  undo({ state: target.state, dispatch: (tr) => target.dispatch(tr) })
}

describe('editor storylet loading', () => {
  it("undo after switching storylets does not bring back the previous storylet's text", () => {
    const target = makeTarget([editorHistory()])
    loadContentIntoView(target, 'Chapter A')
    type(target, ' — edited')
    loadContentIntoView(target, 'Chapter B')

    runUndo(target)

    expect(target.state.doc.toString()).toBe('Chapter B')
  })

  it('undo right after the initial load does not empty the storylet', () => {
    const target = makeTarget([editorHistory()])
    loadContentIntoView(target, 'Existing chapter text')

    runUndo(target)

    expect(target.state.doc.toString()).toBe('Existing chapter text')
  })

  it("undo still works for the user's own typing after a load", () => {
    const target = makeTarget([editorHistory()])
    loadContentIntoView(target, 'Chapter B')
    type(target, ' and more')

    runUndo(target)

    expect(target.state.doc.toString()).toBe('Chapter B')
  })

  it('switching storylets while the book is locked shows the new storylet', () => {
    const target = makeTarget([editorHistory(), makeLockExt(true)])
    loadContentIntoView(target, 'Chapter A')
    loadContentIntoView(target, 'Chapter B')

    expect(target.state.doc.toString()).toBe('Chapter B')
  })

  it('the lock still blocks ordinary edits', () => {
    const target = makeTarget([editorHistory(), makeLockExt(true)])
    loadContentIntoView(target, 'Chapter A')
    type(target, ' typed while locked')

    expect(target.state.doc.toString()).toBe('Chapter A')
  })

  it('reloads the same storylet when a new file has been loaded', () => {
    const loaded = { id: 'a', version: 0, loadNonce: 1 }
    expect(needsEditorReload(loaded, { id: 'a', docVersion: 0 }, 2)).toBe(true)
    expect(needsEditorReload(loaded, { id: 'a', docVersion: 0 }, 1)).toBe(false)
  })
})

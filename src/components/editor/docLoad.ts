import {
  Annotation,
  Compartment,
  EditorState,
  Transaction,
  type Extension,
  type TransactionSpec,
} from '@codemirror/state'
import { history } from '@codemirror/commands'

/** Anything that holds an EditorState and accepts transactions — an
 *  EditorView in the app, a bare `{ state, dispatch }` pair in tests. */
export interface DocTarget {
  readonly state: EditorState
  dispatch(...specs: TransactionSpec[]): void
}

/** Which storylet (and which revision of it) the editor currently shows. */
export interface LoadedDoc {
  id: string
  version: number
  /** `bookLoadNonce` at the time of loading — changes when a file is (re)opened. */
  loadNonce: number
}

/** Marks a transaction that swaps in a storylet's text, as opposed to an edit. */
export const programmaticLoad = Annotation.define<boolean>()

export function isProgrammaticLoad(tr: Transaction): boolean {
  return tr.annotation(programmaticLoad) === true
}

export function needsEditorReload(
  loaded: LoadedDoc | null,
  storylet: { id: string; docVersion?: number },
  loadNonce: number,
): boolean {
  if (!loaded) return true
  return (
    loaded.id !== storylet.id ||
    loaded.version !== (storylet.docVersion ?? 0) ||
    loaded.loadNonce !== loadNonce
  )
}

// Undo history lives in a compartment so loading a storylet can start it
// fresh. Reconfiguring history() → history() would keep the old entries; going
// through [] drops the history state field so it is recreated empty.
const historyCompartment = new Compartment()

/** Undo history for the storylet editor. */
export function editorHistory(): Extension {
  return historyCompartment.of(history())
}

/** Replace the editor's whole document with a storylet's content, with a
 *  fresh undo history so undo can never reach another storylet's text. */
export function loadContentIntoView(target: DocTarget, content: string): void {
  target.dispatch({
    changes: { from: 0, to: target.state.doc.length, insert: content },
    selection: { anchor: 0 },
    annotations: [programmaticLoad.of(true), Transaction.addToHistory.of(false)],
  })
  target.dispatch({ effects: historyCompartment.reconfigure([]) })
  target.dispatch({ effects: historyCompartment.reconfigure(history()) })
}

// Blocks edits when the book is not connected to a granted file handle.
// EditorState.readOnly stops user input; the transaction filter cancels
// programmatic doc changes (bubble toolbar, stat markers, rich paste).
// Loading a storylet's text is not an edit, so it is let through.
export function makeLockExt(locked: boolean): Extension {
  if (!locked) return []
  return [
    EditorState.readOnly.of(true),
    EditorState.transactionFilter.of((tr) => (tr.docChanged && !isProgrammaticLoad(tr) ? [] : tr)),
  ]
}

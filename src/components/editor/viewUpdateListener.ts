import { Compartment, StateEffect } from '@codemirror/state'
import { EditorView, type ViewUpdate } from '@codemirror/view'

/**
 * Attach an update listener to an existing view from outside its extension
 * list (e.g. from a React component that only receives the view). Returns a
 * function that detaches it. The listener lives in its own compartment so
 * detaching is just reconfiguring that compartment to nothing.
 */
export function addViewUpdateListener(
  view: EditorView,
  listener: (update: ViewUpdate) => void
): () => void {
  const compartment = new Compartment()
  view.dispatch({
    effects: StateEffect.appendConfig.of(compartment.of(EditorView.updateListener.of(listener))),
  })
  return () => view.dispatch({ effects: compartment.reconfigure([]) })
}

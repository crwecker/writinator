import { StateEffect, StateField } from '@codemirror/state'
import { useEditorStore } from '../../stores/editorStore'

// Four presentation modes for the editor:
// - source:   show every hidden thing (raw markdown markers, raw HTML tags,
//             raw marker syntax like `<!-- stat:uuid -->`). Editing mode.
// - rendered: hide markdown/HTML markup except on the cursor line; widgets
//             render as dots/squares/statblocks. The common typing experience.
// - preview:  hide all markdown/HTML markup regardless of cursor line; widgets
//             still render. Clean reading view with inline chrome.
// - clean:    like preview, but widgets also collapse to nothing. Zero chrome.
export type RenderMode = 'source' | 'rendered' | 'preview' | 'clean'

export const setRenderModeEffect = StateEffect.define<RenderMode>()

export const renderModeField = StateField.define<RenderMode>({
  create: () => useEditorStore.getState().renderMode,
  update(value, tr) {
    for (const e of tr.effects) {
      if (e.is(setRenderModeEffect)) return e.value
    }
    return value
  },
})

// Should a markdown delimiter / HTML tag on this line be hidden right now?
// Markdown delimiters respect the cursor-line exception in `rendered` mode so
// the user can edit markup by navigating to the line.
export function shouldHideMarkdown(mode: RenderMode, isCursorLine: boolean): boolean {
  if (mode === 'source') return false
  if (mode === 'rendered') return !isCursorLine
  return true // preview + clean
}

// Convenience for extensions deciding what to do with a marker range:
// - 'raw':    emit no decoration; the raw marker text stays in place.
// - 'widget': replace the range with the widget.
// - 'empty':  replace the range with nothing (hidden, no widget).
export function markerPresentation(mode: RenderMode): 'raw' | 'widget' | 'empty' {
  if (mode === 'source') return 'raw'
  if (mode === 'clean') return 'empty'
  return 'widget'
}

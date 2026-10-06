import { useCallback } from 'react'
import type { EditorView } from '@codemirror/view'
import { insertStatMarkerAtSelection } from '../editor/statMarkerInsert'
import { useStatEntryStore } from './statEntryStore'
import { QuickEntryPopover } from './QuickEntryPopover'
import { MarkerPopover } from './MarkerPopover'

interface Props {
  editorView: EditorView | null
  /** Open the full DeltaEditorModal for a marker. */
  onOpenDeltaEditor: (markerId: string) => void
}

/** Mounts the quick-entry line and the chip popover; state lives in useStatEntryStore. */
export function StatEntryHost({ editorView, onOpenDeltaEditor }: Props) {
  const quickEntryOpen = useStatEntryStore((s) => s.quickEntryOpen)
  const popoverMarkerId = useStatEntryStore((s) => s.popoverMarkerId)
  const close = useStatEntryStore((s) => s.close)

  // "Open full editor" from quick entry: the old shortcut behaviour — reuse
  // the abutting marker or insert one, then open the modal on it.
  const openFullAtCursor = useCallback(() => {
    if (editorView) insertStatMarkerAtSelection(editorView, onOpenDeltaEditor)
  }, [editorView, onOpenDeltaEditor])

  return (
    <>
      {quickEntryOpen && (
        <QuickEntryPopover open onClose={close} editorView={editorView} onOpenFullEditor={openFullAtCursor} />
      )}
      {popoverMarkerId && (
        <MarkerPopover
          key={popoverMarkerId}
          open
          onClose={close}
          editorView={editorView}
          markerId={popoverMarkerId}
          onOpenFullEditor={onOpenDeltaEditor}
        />
      )}
    </>
  )
}

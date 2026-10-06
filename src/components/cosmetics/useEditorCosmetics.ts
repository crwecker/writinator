import { useEffect, type RefObject } from 'react'
import type { EditorView } from '@codemirror/view'
import { syncEditorCosmetics } from '../../lib/editorCosmetics'
import { syncAmbient } from '../../lib/sound'

/**
 * Keeps the editor's bought theme, caret and font in step with the Armory,
 * and plays the chosen soundscape while the editor is mounted.
 */
export function useEditorCosmetics(viewRef: RefObject<EditorView | null>): void {
  useEffect(() => {
    const offCosmetics = syncEditorCosmetics(() => viewRef.current)
    const offAmbient = syncAmbient()
    return () => {
      offCosmetics()
      offAmbient()
    }
  }, [viewRef])
}

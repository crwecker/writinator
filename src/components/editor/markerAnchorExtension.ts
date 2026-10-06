import { ViewPlugin, type EditorView, type ViewUpdate } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { extractMarkers } from '../../lib/markerUtils'
import { applyAnchorUpdates, computeAnchorUpdates } from '../../lib/relink'
import { isFileLockedNow } from '../../lib/fileLock'
import { useCharacterStore } from '../../stores/characterStore'
import { useStoryletStore } from '../../stores/storyletStore'

/**
 * Remembers where each change marker sits (its storylet and the prose just
 * before it) so a change whose marker later vanishes — e.g. the file was
 * edited in another app — can be re-attached from the Issues tab. Runs when
 * the editor goes idle and only writes anchors that are missing or stale, so
 * typing doesn't churn the marker store.
 */

export const ANCHOR_DEBOUNCE_MS = 2500

function deltaIds(content: string): string {
  return extractMarkers(content)
    .filter((m) => m.kind === 'delta')
    .map((m) => (m.kind === 'delta' ? m.id : ''))
    .sort()
    .join(',')
}

function captureAnchors(view: EditorView): void {
  // A read-only tab must not write markers behind the owning tab's back.
  if (isFileLockedNow()) return
  const { book, activeStoryletId } = useStoryletStore.getState()
  if (!book || !activeStoryletId) return
  const stored = book.storylets.find((s) => s.id === activeStoryletId)?.content ?? ''
  const doc = view.state.doc.toString()
  // The editor may still show the previous storylet mid-switch; only trust
  // the doc when it carries the same markers as the store's copy.
  if (deltaIds(doc) !== deltaIds(stored)) return
  const { markers } = useCharacterStore.getState()
  const updates = computeAnchorUpdates(activeStoryletId, doc, markers)
  const next = applyAnchorUpdates(markers, updates)
  if (next !== markers) useCharacterStore.setState({ markers: next })
}

const anchorPlugin = ViewPlugin.fromClass(
  class {
    private timer: ReturnType<typeof setTimeout> | null = null
    private unsubscribe: () => void
    private view: EditorView

    constructor(view: EditorView) {
      this.view = view
      this.schedule()
      this.unsubscribe = useStoryletStore.subscribe((state, prev) => {
        if (state.activeStoryletId !== prev.activeStoryletId) this.schedule()
      })
    }

    update(update: ViewUpdate): void {
      if (update.docChanged) this.schedule()
    }

    schedule(): void {
      if (this.timer) clearTimeout(this.timer)
      this.timer = setTimeout(() => {
        this.timer = null
        captureAnchors(this.view)
      }, ANCHOR_DEBOUNCE_MS)
    }

    destroy(): void {
      if (this.timer) clearTimeout(this.timer)
      this.unsubscribe()
    }
  },
)

export function markerAnchorExtension(): Extension {
  return anchorPlugin
}

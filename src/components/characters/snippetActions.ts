import { useStoryletStore } from '../../stores/storyletStore'
import { STAT_REF_REGEX } from '../../lib/statRefs'

/**
 * True when `name` collides with an existing snippet other than `except`.
 * Case-insensitive, matching how `{Name}` refs resolve.
 */
export function snippetNameTaken(
  snippets: Record<string, string>,
  name: string,
  except?: string,
): boolean {
  const key = name.trim().toLowerCase()
  return Object.keys(snippets).some((k) => k !== except && k.toLowerCase() === key)
}

/** Rewrite `{oldName}` refs (case-insensitive, whitespace-tolerant) to `{newName}`. */
function renameRefs(text: string, oldName: string, newName: string): string {
  const key = oldName.toLowerCase()
  return text.replace(new RegExp(STAT_REF_REGEX.source, 'g'), (match, inner: string) =>
    inner.trim().toLowerCase() === key ? `{${newName}}` : match,
  )
}

/**
 * Rename a snippet and every `{OldName}` ref to it — in all storylets and in
 * other snippets' templates — so prose that used the snippet keeps using it.
 * Returns false for an empty, unchanged, or clashing name.
 */
export function renameSnippet(oldName: string, nextName: string): boolean {
  const store = useStoryletStore.getState()
  const snippets = store.globalSettings.snippets ?? {}
  const trimmed = nextName.trim()
  if (!trimmed || trimmed === oldName || snippets[oldName] === undefined) return false
  if (snippetNameTaken(snippets, trimmed, oldName)) return false

  const next: Record<string, string> = {}
  for (const [k, v] of Object.entries(snippets)) {
    next[k === oldName ? trimmed : k] = renameRefs(v, oldName, trimmed)
  }
  store.updateGlobalSettings({ snippets: next })

  // Flush pending typing so the rewrite sees the latest text of the open
  // storylet; setStoryletContent bumps docVersion so its editor reloads.
  store._flushContentUpdate()
  const book = useStoryletStore.getState().book
  if (book) {
    for (const storylet of book.storylets) {
      const content = storylet.content
      if (!content) continue
      const updated = renameRefs(content, oldName, trimmed)
      if (updated !== content) store.setStoryletContent(storylet.id, updated)
    }
  }
  return true
}

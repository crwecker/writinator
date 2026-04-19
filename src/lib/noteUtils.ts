/**
 * Matches note anchors of the form `<!-- note:<uuid> -->`.
 * Id portion allows any alphanumeric run with dashes (UUIDs satisfy this),
 * mirroring STAT_MARKER_REGEX in markerUtils.ts.
 */
export const NOTE_MARKER_REGEX = /<!--\s*note:([A-Za-z0-9-]+)\s*-->/g

export interface ExtractedNote {
  id: string
  offset: number
}

/**
 * Extract every note anchor in `content` in occurrence order.
 * `offset` is the byte offset of the anchor's `<` in the content string.
 */
export function extractNotes(content: string): ExtractedNote[] {
  if (!content) return []
  const results: ExtractedNote[] = []

  // Reset lastIndex defensively (shared global regex).
  NOTE_MARKER_REGEX.lastIndex = 0

  let m: RegExpExecArray | null
  while ((m = NOTE_MARKER_REGEX.exec(content)) !== null) {
    results.push({ id: m[1], offset: m.index })
  }

  return results
}

/** Insert a note anchor at `pos` returning the new content. */
export function insertNoteMarker(content: string, pos: number, id: string): string {
  const clamped = Math.max(0, Math.min(pos, content.length))
  const marker = `<!-- note:${id} -->`
  return content.slice(0, clamped) + marker + content.slice(clamped)
}

/**
 * Remove the first note anchor whose identifier matches `id`.
 */
export function removeNoteMarker(content: string, id: string): string {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`<!--\\s*note:${escaped}\\s*-->`)
  const match = content.match(re)
  if (match && typeof match.index === 'number') {
    return content.slice(0, match.index) + content.slice(match.index + match[0].length)
  }
  return content
}

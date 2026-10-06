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

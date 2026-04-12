import type { ExtractedMarker } from '../types'

/**
 * Matches delta markers of the form `<!-- stat:<uuid> -->`.
 * The id portion allows any non-whitespace, non `-` run (UUIDs satisfy this),
 * to stay tolerant of casing and hyphenation while still rejecting arbitrary HTML.
 */
export const STAT_MARKER_REGEX = /<!--\s*stat:([A-Za-z0-9-]+)\s*-->/g

/**
 * Matches statblock markers of the form
 * `<!-- statblock:<characterId>[:key=value[,key=value]*] -->`.
 * Group 1: character id. Group 2 (optional): raw options string.
 */
export const STATBLOCK_MARKER_REGEX =
  /<!--\s*statblock:([A-Za-z0-9-]+)(?::([^\s>][^>]*?))?\s*-->/g

function parseOptions(raw: string | undefined): Record<string, string> {
  if (!raw) return {}
  const out: Record<string, string> = {}
  const pairs = raw.split(',')
  for (const pair of pairs) {
    const trimmed = pair.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) {
      // bare flag — treat as boolean-style key with empty string value
      out[trimmed] = ''
    } else {
      const key = trimmed.slice(0, eq).trim()
      const value = trimmed.slice(eq + 1).trim()
      if (key) out[key] = value
    }
  }
  return out
}

/**
 * Extract every stat and statblock marker in `content` in occurrence order.
 * `offset` is the byte offset of the marker's `<` in the content string.
 */
export function extractMarkers(content: string): ExtractedMarker[] {
  if (!content) return []
  const results: ExtractedMarker[] = []

  // Reset lastIndex defensively (shared global regexes).
  STAT_MARKER_REGEX.lastIndex = 0
  STATBLOCK_MARKER_REGEX.lastIndex = 0

  let m: RegExpExecArray | null
  while ((m = STAT_MARKER_REGEX.exec(content)) !== null) {
    results.push({ kind: 'delta', id: m[1], offset: m.index })
  }
  while ((m = STATBLOCK_MARKER_REGEX.exec(content)) !== null) {
    results.push({
      kind: 'statblock',
      characterId: m[1],
      offset: m.index,
      options: parseOptions(m[2]),
    })
  }

  results.sort((a, b) => a.offset - b.offset)
  return results
}

/** Insert a delta marker at `pos` returning the new content. */
export function insertStatMarker(content: string, pos: number, id: string): string {
  const clamped = Math.max(0, Math.min(pos, content.length))
  const marker = `<!-- stat:${id} -->`
  return content.slice(0, clamped) + marker + content.slice(clamped)
}

/** Insert a statblock marker at `pos` returning the new content. */
export function insertStatblockMarker(
  content: string,
  pos: number,
  characterId: string,
  options?: Record<string, string>
): string {
  const clamped = Math.max(0, Math.min(pos, content.length))
  let suffix = ''
  if (options && Object.keys(options).length > 0) {
    const parts = Object.entries(options).map(([k, v]) =>
      v === '' ? k : `${k}=${v}`
    )
    suffix = `:${parts.join(',')}`
  }
  const marker = `<!-- statblock:${characterId}${suffix} -->`
  return content.slice(0, clamped) + marker + content.slice(clamped)
}

/**
 * Remove the first marker whose identifier matches `id`. Works for both kinds:
 * - delta markers are matched by the stat-marker uuid
 * - statblock markers are matched by their characterId
 *
 * Because a single character may have many statblocks, callers that want to
 * remove a specific statblock should instead rewrite content themselves; this
 * helper targets the first occurrence and is intended for delta-marker cleanup
 * (the common case) plus simple statblock deletion.
 */
export function removeMarker(content: string, id: string): string {
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const statRe = new RegExp(`<!--\\s*stat:${escaped}\\s*-->`)
  const statblockRe = new RegExp(
    `<!--\\s*statblock:${escaped}(?::[^>]*?)?\\s*-->`
  )
  const statMatch = content.match(statRe)
  if (statMatch && typeof statMatch.index === 'number') {
    return content.slice(0, statMatch.index) + content.slice(statMatch.index + statMatch[0].length)
  }
  const sbMatch = content.match(statblockRe)
  if (sbMatch && typeof sbMatch.index === 'number') {
    return content.slice(0, sbMatch.index) + content.slice(sbMatch.index + sbMatch[0].length)
  }
  return content
}

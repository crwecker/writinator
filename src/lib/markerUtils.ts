import type { Character, ExtractedMarker, StatDefinition } from '../types'
import { escapeRegExp } from './regex'

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

/**
 * Parse a statblock marker's options (`key=value,key=value`). The only key in
 * use is `fields`, whose list the toolbar used to write comma-separated
 * (`fields=hp,mp,level`), so bare segments after `fields=` are read as more
 * fields rather than as flags.
 */
export function parseStatblockOptions(raw: string | undefined): Record<string, string> {
  if (!raw) return {}
  const out: Record<string, string> = {}
  let lastKey: string | null = null
  for (const segment of raw.split(',')) {
    const trimmed = segment.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) {
      if (lastKey === 'fields') {
        out.fields = out.fields ? `${out.fields}|${trimmed}` : trimmed
      } else {
        // bare flag — treat as boolean-style key with empty string value
        out[trimmed] = ''
        lastKey = trimmed
      }
    } else {
      const key = trimmed.slice(0, eq).trim()
      const value = trimmed.slice(eq + 1).trim()
      if (key) {
        out[key] = value
        lastKey = key
      }
    }
  }
  return out
}

/** The stat keys a statblock asks for, or undefined for the default set. */
export function statblockFields(options: Record<string, string>): string[] | undefined {
  const raw = options.fields
  if (!raw) return undefined
  const fields = raw.split(/[|,]/).map((s) => s.trim()).filter(Boolean)
  return fields.length > 0 ? fields : undefined
}

const DEFAULT_STATBLOCK_FIELD_KEYS = ['hp', 'mp', 'level', 'xp', 'attributes']

/**
 * The stat definitions a statblock shows, in order: each requested key
 * matched by stat id, then case-insensitively by name. No `fields` means the
 * default set; when nothing matches, every stat.
 */
export function resolveStatblockDefinitions(
  character: Character,
  fields: string[] | undefined
): StatDefinition[] {
  const wanted = fields && fields.length > 0 ? fields : DEFAULT_STATBLOCK_FIELD_KEYS
  const byId = new Map(character.stats.map((s) => [s.id, s]))
  const byName = new Map(character.stats.map((s) => [s.name.toLowerCase(), s]))
  const resolved: StatDefinition[] = []
  const seen = new Set<string>()
  for (const key of wanted) {
    const def = byId.get(key) ?? byName.get(key.toLowerCase())
    if (def && !seen.has(def.id)) {
      resolved.push(def)
      seen.add(def.id)
    }
  }
  return resolved.length > 0 ? resolved : [...character.stats]
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
      options: parseStatblockOptions(m[2]),
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
  const escaped = escapeRegExp(id)
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

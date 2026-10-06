import type { Character, StatDefinition } from '../types'

// Inline value formatting lives with the other stat formatters; re-exported
// here because every `{...}` consumer reaches for it alongside expandRefs.
export { formatStatValueInline } from './statFormat'

/**
 * Inline stat reference token. `{HP}` in prose resolves to the current value
 * of the character's HP stat at that document offset.
 *
 * Single-line only — never spans a newline. Matches one `{ ... }` pair with
 * no nested braces. Author-friendly: the inner text is matched against stat
 * NAMES first (case-insensitive), then IDs. Reserved directive tokens
 * (`{align:center}`, `{group}`, `{/group}`) never resolve and stay raw.
 */
export const STAT_REF_REGEX = /\{([^{}\n]+)\}/g

export interface StatRefHit {
  character: Character
  def: StatDefinition
  /**
   * Optional dotted sub-accessor. For `numberWithMax` this picks `value` or
   * `max`; for `attributeSet` this picks the named attribute key (e.g.
   * `Attributes.STR`). null when the ref has no `.subkey`.
   */
  subkey: string | null
}

/**
 * A `{...}` ref can resolve to a stat (computed from character state), a
 * snippet (a named template string), or a literal character property
 * (currently just `.name` — the author-facing name of a character).
 */
export type RefHit =
  | { kind: 'stat'; hit: StatRefHit }
  | { kind: 'snippet'; name: string; template: string }
  | { kind: 'characterProperty'; character: Character; property: 'name' }

/**
 * Resolve a `{...}` ref to a snippet if the inner text matches a snippet name
 * exactly (case-insensitive). Snippets win over stats when names collide so
 * authors can override built-in stat names with their own templates if they
 * really want to.
 */
function resolveSnippet(
  ref: string,
  snippets: Record<string, string> | undefined,
): RefHit | null {
  if (!snippets) return null
  const trimmed = ref.trim()
  if (!trimmed) return null
  const lower = trimmed.toLowerCase()
  for (const [name, template] of Object.entries(snippets)) {
    if (name.toLowerCase() === lower) return { kind: 'snippet', name, template }
  }
  return null
}

/**
 * Resolve `{<ref>}` against the given characters. Supports a flexible dotted
 * syntax:
 *
 *   {HP}                → HP of the first character that has it
 *   {HP.max}            → max field of HP (numberWithMax)
 *   {STR}               → STR attribute (attributeSet fallback)
 *   {Bob.HP}            → HP of character Bob
 *   {Bob.HP.max}        → max of Bob's HP
 *   {Bob.STR}           → Bob's STR attribute
 *   {Attributes.STR}    → STR field on an attributeSet stat (no character)
 *
 * Disambiguation: the first segment is treated as a character name/id only if
 * it actually matches one. Otherwise the whole ref is interpreted as
 * stat[.subkey], so author intent for `{HP.max}` is preserved even if a
 * character happens to be named "HP". Matching is case-insensitive everywhere.
 *
 * Pure: no store access. Reserved markdown directives are rejected early so
 * authors can keep using `{align:center}` etc. without collision.
 */
export function resolveStatRef(
  ref: string,
  characters: Character[],
): StatRefHit | null {
  const trimmed = ref.trim()
  if (!trimmed) return null
  if (/^\/?group(:|$)/i.test(trimmed)) return null
  if (/^align:/i.test(trimmed)) return null
  const segments = trimmed.split('.').map((s) => s.trim()).filter(Boolean)
  if (segments.length === 0) return null

  // Optionally peel off a character prefix when segment[0] matches a character.
  const firstLower = segments[0].toLowerCase()
  const characterMatch = characters.find(
    (c) => c.name.toLowerCase() === firstLower || c.id.toLowerCase() === firstLower,
  )
  const scope = characterMatch ? [characterMatch] : characters
  const rest = characterMatch ? segments.slice(1) : segments
  if (rest.length === 0) return null // bare character name without a stat

  const statPart = rest[0]
  const subkey = rest.length > 1 ? rest.slice(1).join('.') : null
  const lower = statPart.toLowerCase()
  for (const c of scope) {
    for (const def of c.stats) {
      if (def.name.toLowerCase() === lower) return { character: c, def, subkey }
    }
  }
  for (const c of scope) {
    for (const def of c.stats) {
      if (def.id.toLowerCase() === lower) return { character: c, def, subkey }
    }
  }
  // Attribute fallback: bare `{STR}` / `{Bob.STR}` lands on the first
  // attributeSet stat in scope whose key matches. Only when no stat matched
  // and no explicit subkey was given, so `{HP.foo}` still fails loud.
  if (subkey === null) {
    for (const c of scope) {
      for (const def of c.stats) {
        if (def.type !== 'attributeSet') continue
        const base = c.baseValues[def.id]
        if (!base || base.kind !== 'attributeSet') continue
        for (const key of Object.keys(base.values)) {
          if (key.toLowerCase() === lower) {
            return { character: c, def, subkey: key }
          }
        }
      }
    }
  }
  return null
}

/**
 * Resolve a `{...}` token to a snippet (first) or a stat (second). Returns
 * null when nothing matched — caller should preserve the raw `{...}` text.
 */
export function resolveRef(
  ref: string,
  characters: Character[],
  snippets: Record<string, string> | undefined,
): RefHit | null {
  const trimmed = ref.trim()
  if (!trimmed) return null
  if (/^\/?group(:|$)/i.test(trimmed)) return null
  if (/^align:/i.test(trimmed)) return null
  const snippet = resolveSnippet(trimmed, snippets)
  if (snippet) return snippet
  // Built-in character property: `{Bob.name}` returns Bob's display name.
  // Checked BEFORE stat lookup so an author who has a stat literally named
  // "name" still gets the friendly property; if they need the stat they can
  // rename it.
  const dotIdx = trimmed.indexOf('.')
  if (dotIdx !== -1) {
    const prefix = trimmed.slice(0, dotIdx).trim().toLowerCase()
    const tail = trimmed.slice(dotIdx + 1).trim().toLowerCase()
    if (tail === 'name') {
      const c = characters.find(
        (ch) => ch.name.toLowerCase() === prefix || ch.id.toLowerCase() === prefix,
      )
      if (c) return { kind: 'characterProperty', character: c, property: 'name' }
    }
  }
  const hit = resolveStatRef(trimmed, characters)
  return hit ? { kind: 'stat', hit } : null
}

const MAX_SNIPPET_DEPTH = 4

export interface ExpandContext {
  characters: Character[]
  snippets: Record<string, string> | undefined
  /**
   * Per-stat-hit formatter. Used so the editor and export pipelines can plug
   * in their own state-at-offset resolution without coupling this pure module
   * to `computeStateAt`.
   */
  formatStat: (hit: StatRefHit, offset: number) => string | null
}

/**
 * Expand `{...}` tokens in `content` to their resolved values. Snippets are
 * recursively expanded (with a depth limit and a visited set so authors who
 * accidentally write `{A}` that references `{B}` that references `{A}` see a
 * loop-breaker raw token instead of a stack overflow).
 *
 * `formatStat` gets the document offset of the token being resolved. Refs
 * inside a snippet resolve at the offset of the snippet's own token in the
 * document — the template's internal offsets mean nothing there. Pass
 * `anchorOffset` when `content` isn't the document itself (e.g. a snippet
 * template rendered for a token at that offset) to resolve every ref there.
 *
 * Pure — does not touch any store. Caller supplies `formatStat` which is the
 * only place runtime state-at-offset lives.
 */
export function expandRefs(content: string, ctx: ExpandContext, anchorOffset?: number): string {
  return expandRefsInner(content, ctx, 0, new Set(), anchorOffset)
}

function expandRefsInner(
  content: string,
  ctx: ExpandContext,
  depth: number,
  visiting: Set<string>,
  anchorOffset: number | undefined,
): string {
  if (depth > MAX_SNIPPET_DEPTH) return content
  return content.replace(
    new RegExp(STAT_REF_REGEX.source, 'g'),
    (match, ref: string, offset: number) => {
      const hit = resolveRef(ref, ctx.characters, ctx.snippets)
      if (!hit) return match
      const docOffset = anchorOffset ?? offset
      if (hit.kind === 'snippet') {
        const key = hit.name.toLowerCase()
        if (visiting.has(key)) return match // cycle — keep raw to flag the loop
        visiting.add(key)
        const expanded = expandRefsInner(hit.template, ctx, depth + 1, visiting, docOffset)
        visiting.delete(key)
        return expanded
      }
      if (hit.kind === 'characterProperty') {
        return hit.character.name || match
      }
      const formatted = ctx.formatStat(hit.hit, docOffset)
      return formatted === null || formatted === '' ? match : formatted
    },
  )
}

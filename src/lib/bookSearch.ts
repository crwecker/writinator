import type {
  Book,
  SearchMatch,
  SearchOptions,
  Storylet,
  StoryletSearchResult,
} from '../types'
import { getStoryletTreeOrder } from './characterState'

/** Maximum number of matches collected per storylet to guard against pathological regexes. */
export const MAX_MATCHES_PER_STORYLET = 500

/** Approximate context window around each match when building snippets. */
const SNIPPET_CONTEXT_CHARS = 40

/** Result of compiling a user query into a regex (or the error message). */
export type CompileQueryResult =
  | { regex: RegExp }
  | { error: string }

/**
 * Compile user search options into a global regex. Handles:
 * - regex vs literal mode (literal escapes special chars)
 * - case sensitivity (sets the `i` flag when off)
 * - whole-word wrapping (`\b…\b`)
 *
 * Returns a tagged error object on compile failure (invalid regex syntax)
 * or empty queries — callers should display the error inline.
 */
export function compileQuery(options: SearchOptions): CompileQueryResult {
  const { query, caseSensitive, wholeWord, regex } = options
  if (query.length === 0) {
    return { error: 'Enter a search query' }
  }
  let pattern = regex ? query : escapeRegex(query)
  if (wholeWord) {
    pattern = `\\b(?:${pattern})\\b`
  }
  const flags = caseSensitive ? 'g' : 'gi'
  try {
    return { regex: new RegExp(pattern, flags) }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid regular expression'
    return { error: message }
  }
}

/** Escape a literal string so it can be embedded safely in a RegExp source. */
function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Collect every match in `content` for the given regex, capped at
 * MAX_MATCHES_PER_STORYLET. Guards against zero-width matches by advancing
 * `lastIndex` manually when a match consumes no characters.
 */
function collectMatchesInContent(
  storyletId: string,
  content: string,
  regex: RegExp,
): SearchMatch[] {
  // Defensive: clone the regex so callers can reuse it across storylets without
  // stale `lastIndex` state and to ensure the global flag is set.
  const flags = regex.flags.includes('g') ? regex.flags : `${regex.flags}g`
  const scanner = new RegExp(regex.source, flags)
  const matches: SearchMatch[] = []
  let m: RegExpExecArray | null
  while ((m = scanner.exec(content)) !== null) {
    const start = m.index
    const end = start + m[0].length
    matches.push({
      storyletId,
      start,
      end,
      ...buildSnippet(content, start, end),
    })
    if (matches.length >= MAX_MATCHES_PER_STORYLET) break
    // Avoid infinite loops on zero-width matches (e.g. /\b/g).
    if (m[0].length === 0) {
      scanner.lastIndex = scanner.lastIndex + 1
    }
  }
  return matches
}

/**
 * Extract a human-readable snippet around a match: ~SNIPPET_CONTEXT_CHARS on
 * each side, trimmed to the enclosing line(s) so we never bleed into unrelated
 * lines. Returns the snippet text and the [start,end) match offset *within the
 * snippet* so callers can highlight it without re-searching.
 */
function buildSnippet(
  content: string,
  matchStart: number,
  matchEnd: number,
): { lineSnippet: string; matchIndexInSnippet: [number, number] } {
  // Find enclosing line boundaries.
  const lineStart = (() => {
    const idx = content.lastIndexOf('\n', matchStart - 1)
    return idx === -1 ? 0 : idx + 1
  })()
  const lineEndRaw = content.indexOf('\n', matchEnd)
  const lineEnd = lineEndRaw === -1 ? content.length : lineEndRaw

  // Then clamp to ±SNIPPET_CONTEXT_CHARS, but never escape the enclosing line.
  const snippetStart = Math.max(lineStart, matchStart - SNIPPET_CONTEXT_CHARS)
  const snippetEnd = Math.min(lineEnd, matchEnd + SNIPPET_CONTEXT_CHARS)

  const lineSnippet = content.slice(snippetStart, snippetEnd)
  const matchIndexInSnippet: [number, number] = [
    matchStart - snippetStart,
    matchEnd - snippetStart,
  ]
  return { lineSnippet, matchIndexInSnippet }
}

/**
 * Search a single storylet for matches. Used by phase 3's storylet-scoped
 * replace path.
 */
export function searchStorylet(
  storylet: Storylet,
  options: SearchOptions,
): SearchMatch[] {
  const compiled = compileQuery(options)
  if ('error' in compiled) return []
  if (!storylet.content) return []
  return collectMatchesInContent(storylet.id, storylet.content, compiled.regex)
}

/**
 * Search every storylet in the book in tree (depth-first) order. Storylets
 * with no matches are omitted from the result.
 */
export function searchBook(
  book: Book,
  options: SearchOptions,
): StoryletSearchResult[] {
  const compiled = compileQuery(options)
  if ('error' in compiled) return []
  const results: StoryletSearchResult[] = []
  for (const storylet of getStoryletTreeOrder(book)) {
    if (!storylet.content) continue
    const matches = collectMatchesInContent(storylet.id, storylet.content, compiled.regex)
    if (matches.length === 0) continue
    results.push({
      storyletId: storylet.id,
      storyletName: storylet.name,
      matches,
    })
  }
  return results
}

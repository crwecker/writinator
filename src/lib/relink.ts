import type { Book, MarkerAnchor, StatDelta } from '../types'
import { extractMarkers } from './markerUtils'
import { getStoryletTreeOrder } from './characterState'

/** Text with HTML comments removed and whitespace runs collapsed to one space. */
function normalize(text: string): string {
  return text.replace(/<!--[\s\S]*?-->/g, ' ').replace(/\s+/g, ' ')
}

/**
 * Up to `maxLen` chars of prose just before `offset`: markers and other
 * comments stripped, whitespace collapsed, cut at a word boundary.
 */
export function excerptBefore(content: string, offset: number, maxLen = 60): string {
  let raw = content.slice(Math.max(0, offset - maxLen * 4), offset)
  // The window may start inside a comment; drop its tail.
  const close = raw.indexOf('-->')
  if (close >= 0 && (raw.indexOf('<!--') === -1 || raw.indexOf('<!--') > close)) raw = raw.slice(close + 3)
  const window = normalize(raw).trim()
  if (window.length <= maxLen) return window
  const tail = window.slice(window.length - maxLen)
  const space = tail.indexOf(' ')
  return space >= 0 && space < tail.length - 1 ? tail.slice(space + 1) : tail
}

/** The anchor recorded on a marker's deltas, if any. */
export function anchorOf(deltas: StatDelta[] | undefined): MarkerAnchor | undefined {
  return deltas?.find((d) => d.anchor)?.anchor
}

/** Normalized text plus, for each of its chars, the raw index it came from. */
function normalizedWithMap(content: string): { text: string; map: number[] } {
  let text = ''
  const map: number[] = []
  let i = 0
  while (i < content.length) {
    if (content.startsWith('<!--', i)) {
      const end = content.indexOf('-->', i + 4)
      if (!text.endsWith(' ')) { text += ' '; map.push(i) }
      i = end === -1 ? content.length : end + 3
      continue
    }
    const ch = content[i]
    if (/\s/.test(ch)) {
      if (!text.endsWith(' ')) { text += ' '; map.push(i) }
    } else {
      text += ch
      map.push(i)
    }
    i++
  }
  return { text, map }
}

function occurrences(haystack: string, needle: string): number[] {
  const out: number[] = []
  let at = haystack.indexOf(needle)
  while (at !== -1 && out.length < 2) {
    out.push(at)
    at = haystack.indexOf(needle, at + 1)
  }
  return out
}

/**
 * Raw offset just after where `excerpt` appears in `content`, ignoring
 * comments and whitespace differences. When the full excerpt isn't there,
 * its trailing words are tried (down to three words). Null when nothing
 * matches or a match is ambiguous.
 */
export function findExcerptOffset(content: string, excerpt: string): number | null {
  const wanted = normalize(excerpt).trim()
  if (!wanted) return 0
  const { text, map } = normalizedWithMap(content)
  const words = wanted.split(' ')
  for (let k = words.length; k >= Math.min(3, words.length); k--) {
    const candidate = words.slice(words.length - k).join(' ')
    if (k < words.length && candidate.length < 12) break
    const hits = occurrences(text, candidate)
    if (hits.length > 1) return null
    if (hits.length === 1) return map[hits[0] + candidate.length - 1] + 1
  }
  return null
}

/**
 * Anchors to record for the change markers in one storylet: markers with no
 * anchor yet, ones that moved from another storylet, and ones whose stored
 * excerpt no longer appears in the text. Fresh anchors are left alone so
 * typing doesn't rewrite the marker store.
 */
export function computeAnchorUpdates(
  storyletId: string,
  content: string,
  markers: Record<string, StatDelta[]>,
): Record<string, MarkerAnchor> {
  const updates: Record<string, MarkerAnchor> = {}
  for (const marker of extractMarkers(content)) {
    if (marker.kind !== 'delta') continue
    const deltas = markers[marker.id]
    if (!deltas || deltas.length === 0) continue
    const current = anchorOf(deltas)
    const excerpt = excerptBefore(content, marker.offset)
    const stale =
      !current ||
      current.storyletId !== storyletId ||
      (current.excerpt !== excerpt && findExcerptOffset(content, current.excerpt) === null)
    if (stale && (current?.excerpt !== excerpt || current?.storyletId !== storyletId)) {
      updates[marker.id] = { storyletId, excerpt }
    }
  }
  return updates
}

/** `markers` with the given anchors written onto each delta (same object when there are none). */
export function applyAnchorUpdates(
  markers: Record<string, StatDelta[]>,
  updates: Record<string, MarkerAnchor>,
): Record<string, StatDelta[]> {
  const ids = Object.keys(updates).filter((id) => markers[id])
  if (ids.length === 0) return markers
  const next = { ...markers }
  for (const id of ids) next[id] = markers[id].map((d) => ({ ...d, anchor: updates[id] }))
  return next
}

export interface ReattachSuggestion {
  storyletId: string
  offset: number
  /** 'excerpt': right after the prose it followed; 'end': end of the storylet it was last seen in. */
  reason: 'excerpt' | 'end'
}

/** Where a change whose marker vanished most likely belongs, from its anchor. */
export function suggestReattach(book: Book, deltas: StatDelta[]): ReattachSuggestion | null {
  const anchor = anchorOf(deltas)
  if (!anchor) return null
  const storylet = book.storylets.find((s) => s.id === anchor.storyletId)
  if (!storylet) return null
  const content = storylet.content ?? ''
  const offset = findExcerptOffset(content, anchor.excerpt)
  return offset === null
    ? { storyletId: storylet.id, offset: content.length, reason: 'end' }
    : { storyletId: storylet.id, offset, reason: 'excerpt' }
}

export interface OrphanLink {
  /** Marker in the text with no stored change. */
  textMarkerId: string
  /** Stored change whose marker is missing from the text. */
  storeMarkerId: string
  storyletId: string
}

/**
 * Pair markers that lost their change with changes that lost their marker,
 * when both belong to the same storylet — what happens when another app
 * rewrites a marker id. Prefers an exact excerpt match; otherwise pairs only
 * when the storylet has a single candidate.
 */
export function suggestOrphanLinks(book: Book, markers: Record<string, StatDelta[]>): OrphanLink[] {
  const seen = new Set<string>()
  const textOrphans: Array<{ id: string; storyletId: string; excerpt: string }> = []
  for (const storylet of getStoryletTreeOrder(book)) {
    const content = storylet.content ?? ''
    for (const marker of extractMarkers(content)) {
      if (marker.kind !== 'delta') continue
      seen.add(marker.id)
      if (!markers[marker.id]) {
        textOrphans.push({ id: marker.id, storyletId: storylet.id, excerpt: excerptBefore(content, marker.offset) })
      }
    }
  }
  const storeOrphans = Object.keys(markers)
    .filter((id) => !seen.has(id))
    .map((id) => ({ id, anchor: anchorOf(markers[id]) }))
    .filter((o): o is { id: string; anchor: MarkerAnchor } => !!o.anchor)
  const used = new Set<string>()
  const links: OrphanLink[] = []
  for (const t of textOrphans) {
    const candidates = storeOrphans.filter((s) => !used.has(s.id) && s.anchor.storyletId === t.storyletId)
    const pick = candidates.find((s) => s.anchor.excerpt === t.excerpt) ?? (candidates.length === 1 ? candidates[0] : undefined)
    if (!pick) continue
    used.add(pick.id)
    links.push({ textMarkerId: t.id, storeMarkerId: pick.id, storyletId: t.storyletId })
  }
  return links
}

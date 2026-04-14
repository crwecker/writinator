import type { Book, Storylet } from '../types'
import {
  getDepth,
  getCharacterMarkerContext,
  processCharacterMarkers,
  stripPasteArtifacts,
  ensureBlockSeparation,
  escapeHtml,
  applyAlignmentMarkers,
  astToHtml,
} from './export'
import { parseMarkdown } from './ast'

export function renderStoryletAsMarkdown(
  storylet: Storylet,
  book: Book,
  options?: { preserveStatMarkers?: boolean }
): string {
  const depth = getDepth(storylet, book.storylets)
  const hashes = '#'.repeat(Math.min(depth + 2, 6))
  const heading = `${hashes} ${storylet.name}`
  if (!storylet.content) return `${heading}\n`
  const ctx = getCharacterMarkerContext(book, storylet.id)
  const processed = processCharacterMarkers(storylet.content, ctx, 'markdown', options)
  const stripped = stripPasteArtifacts(processed)
  return `${heading}\n\n${stripped}`
}

export function renderStoryletAsHtml(storylet: Storylet, book: Book): string {
  const depth = getDepth(storylet, book.storylets)
  const level = Math.min(depth + 2, 6)
  const heading = `<h${level}>${escapeHtml(storylet.name)}</h${level}>`
  const ctx = getCharacterMarkerContext(book, storylet.id)
  const processed = storylet.content
    ? processCharacterMarkers(storylet.content, ctx, 'html')
    : ''
  const content = processed
    ? applyAlignmentMarkers(astToHtml(parseMarkdown(ensureBlockSeparation(stripPasteArtifacts(processed)))))
    : ''
  return `${heading}\n${content}`
}

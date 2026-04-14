export function countWords(text: string | null): number {
  if (!text || text.trim() === '') return 0
  return text.trim().split(/\s+/).length
}

/**
 * Extract a normalized sequence of word tokens for content comparison.
 * Ignores whitespace, punctuation, and markdown formatting symbols so that
 * cosmetic edits (bold/italics, spacing, list markers) don't register as
 * meaningful changes.
 */
export function extractWords(text: string | null | undefined): string {
  if (!text) return ''
  const stripped = text.replace(/<!--\s*stat:[A-Za-z0-9-]+\s*-->/g, '')
  const matches = stripped.toLowerCase().match(/[\p{L}\p{N}']+/gu)
  return matches ? matches.join(' ') : ''
}

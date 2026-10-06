// Exactly the characters JavaScript's `\s` matches (and `trim()` strips).
function isSpace(c: number): boolean {
  if (c <= 32) return c === 32 || (c >= 9 && c <= 13)
  if (c < 160) return false
  return (
    c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) ||
    c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f ||
    c === 0x3000 || c === 0xfeff
  )
}

/** Number of whitespace-separated words. Same result as
 *  `text.trim().split(/\s+/).length` (0 for blank text), but allocation-free
 *  since it runs on every keystroke. */
export function countWords(text: string | null): number {
  if (!text) return 0
  let n = 0
  let inWord = false
  for (let i = 0; i < text.length; i++) {
    if (isSpace(text.charCodeAt(i))) inWord = false
    else if (!inWord) {
      inWord = true
      n++
    }
  }
  return n
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

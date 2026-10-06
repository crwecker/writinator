/** Prose of `text` with markers, HTML, directives and markdown syntax removed, whitespace collapsed. */
function plainProse(text: string): string {
  return text
    // A window may start inside a comment: drop a dangling "… -->" prefix.
    .replace(/^(?:(?!<!--)[\s\S])*?-->/, ' ')
    .replace(/<!--[\s\S]*?(?:-->|$)/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\{(?:align:[a-z]+|\/?group)\}/gi, ' ')
    .replace(/^\s{0,3}(?:#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * "At cursor · Chapter 3, after “staggered back”" — where the Stats tab's
 * values are computed. `text` is the open storylet's live text. The quote is
 * the last ~`maxChars` characters of prose before `offset`, widened to start
 * on a word.
 */
export function describeCursorPosition(storyletName: string, text: string, offset: number, maxChars = 30): string {
  const prose = plainProse(text.slice(0, Math.max(0, offset)))
  if (!prose) return `At cursor · ${storyletName}, at the start`
  if (prose.length <= maxChars) return `At cursor · ${storyletName}, after “${prose}”`
  let start = prose.length - maxChars
  if (prose[start - 1] !== ' ') {
    const back = prose.lastIndexOf(' ', start)
    const fwd = prose.indexOf(' ', start)
    start = back >= 0 && start - back <= 15 ? back + 1 : fwd >= 0 ? fwd + 1 : start
  }
  return `At cursor · ${storyletName}, after “…${prose.slice(start)}”`
}

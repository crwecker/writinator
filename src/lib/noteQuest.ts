/** Turning a note into a villager request. */

const MAX_TITLE = 60

/** A quest title from a note: its first non-blank line, without markdown markers. */
export function noteQuestTitle(body: string): string {
  const line = body
    .split('\n')
    .map((l) => l.replace(/^\s*(#{1,6}\s+|[-*+]\s+|>\s*|\d+\.\s+)/, '').replace(/[*_`~]/g, '').trim())
    .find((l) => l.length > 0)
  if (!line) return 'A note to self'
  return line.length > MAX_TITLE ? `${line.slice(0, MAX_TITLE - 1).trimEnd()}…` : line
}

export function noteQuestDescription(body: string): string {
  const text = body.replace(/\s+/g, ' ').trim()
  return text.length > 200 ? `${text.slice(0, 199)}…` : text
}

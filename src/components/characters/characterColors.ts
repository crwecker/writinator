/** Round-robin palette for new characters (matches the store's defaults). */
export const CHARACTER_COLORS = [
  '#f87171', '#fb923c', '#facc15', '#4ade80', '#22d3ee', '#60a5fa', '#a78bfa', '#f472b6',
]

export function nextCharacterColor(existingCount: number): string {
  return CHARACTER_COLORS[existingCount % CHARACTER_COLORS.length]
}

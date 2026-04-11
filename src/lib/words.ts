export function countWords(text: string | null): number {
  if (!text || text.trim() === '') return 0
  return text.trim().split(/\s+/).length
}

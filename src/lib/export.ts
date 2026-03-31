import type { Book, Chapter } from '../types'

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'untitled'
}

function download(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function getDepth(chapter: Chapter, chapters: Chapter[]): number {
  let depth = 0
  let current = chapter
  while (current.parentId) {
    depth++
    const parent = chapters.find((ch) => ch.id === current.parentId)
    if (!parent) break
    current = parent
  }
  return depth
}

function bookToMarkdown(book: Book): string {
  const parts: string[] = [`# ${book.title}\n`]
  for (const ch of book.chapters) {
    const depth = getDepth(ch, book.chapters)
    const hashes = '#'.repeat(Math.min(depth + 2, 6))
    parts.push(`${hashes} ${ch.name}\n`)
    if (ch.content) {
      parts.push(ch.content)
    }
    parts.push('')
  }
  return parts.join('\n')
}

function stripMarkdown(text: string): string {
  return text
    // Remove inline HTML spans
    .replace(/<span[^>]*>(.*?)<\/span>/g, '$1')
    // Bold/italic
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '$1')
    // Strikethrough
    .replace(/~~(.+?)~~/g, '$1')
    // Inline code
    .replace(/`([^`]+)`/g, '$1')
    // Headings — keep the text, drop the #
    .replace(/^#{1,6}\s+/gm, '')
}

function bookToPlainText(book: Book): string {
  const parts: string[] = [book.title, '']
  for (const ch of book.chapters) {
    const depth = getDepth(ch, book.chapters)
    const indent = '  '.repeat(depth)
    parts.push(`${indent}${ch.name}`)
    parts.push('')
    if (ch.content) {
      parts.push(stripMarkdown(ch.content))
    }
    parts.push('')
  }
  return parts.join('\n')
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function markdownToHtml(text: string): string {
  let html = text
    // Inline HTML spans — pass through as-is (already HTML)
    // Process them before escaping by extracting, then reinserting
  const spans: string[] = []
  html = html.replace(/<span[^>]*>.*?<\/span>/g, (match) => {
    spans.push(match)
    return `__SPAN_${spans.length - 1}__`
  })

  html = escapeHtml(html)

  // Restore spans
  html = html.replace(/__SPAN_(\d+)__/g, (_, i) => spans[Number(i)])

  // Block-level: headings
  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>')

  // Inline: bold, italic, strikethrough, code
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>')
  html = html.replace(/~~(.+?)~~/g, '<del>$1</del>')
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Paragraphs: double newlines
  html = html
    .split(/\n{2,}/)
    .map((block) => {
      const trimmed = block.trim()
      if (!trimmed) return ''
      if (/^<h[1-3]>/.test(trimmed)) return trimmed
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`
    })
    .join('\n')

  return html
}

function bookToHtml(book: Book): string {
  const body = book.chapters
    .map((ch) => {
      const depth = getDepth(ch, book.chapters)
      const level = Math.min(depth + 2, 6)
      const heading = `<h${level}>${escapeHtml(ch.name)}</h${level}>`
      const content = ch.content ? markdownToHtml(ch.content) : ''
      return `${heading}\n${content}`
    })
    .join('\n\n')

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(book.title)}</title>
<style>
  body { max-width: 800px; margin: 2rem auto; padding: 0 1rem; font-family: 'Georgia', serif; line-height: 1.8; color: #222; }
  h1 { text-align: center; margin-bottom: 2rem; }
  h2 { margin-top: 3rem; border-bottom: 1px solid #ddd; padding-bottom: 0.3rem; }
  code { background: #f4f4f4; padding: 0.15em 0.4em; border-radius: 3px; font-size: 0.9em; }
  del { color: #999; }
</style>
</head>
<body>
<h1>${escapeHtml(book.title)}</h1>
${body}
</body>
</html>`
}

export function exportAsMarkdown(book: Book): void {
  download(bookToMarkdown(book), `${sanitizeFilename(book.title)}.md`, 'text/markdown')
}

export function exportAsPlainText(book: Book): void {
  download(bookToPlainText(book), `${sanitizeFilename(book.title)}.txt`, 'text/plain')
}

export function exportAsHtml(book: Book): void {
  download(bookToHtml(book), `${sanitizeFilename(book.title)}.html`, 'text/html')
}

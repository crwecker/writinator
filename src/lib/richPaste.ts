/**
 * Converts rich HTML (from Scrivener, Word, etc.) to Markdown.
 * Handles inline-CSS-styled spans (Scrivener's format) and semantic tags.
 */
import TurndownService from 'turndown'
import type { DocumentStyles, TextStyle } from '../types'

let service: TurndownService | null = null

function getService(): TurndownService {
  if (service) return service

  service = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
  })

  // Scrivener uses <span style="font-weight: bold/600/700"> for bold
  service.addRule('spanBold', {
    filter: (node) =>
      node.nodeName === 'SPAN' &&
      /font-weight:\s*(bold|[6-9]\d\d)/i.test(node.getAttribute('style') || ''),
    replacement: (content, node) => {
      if (!content.trim()) return content
      // Check if also italic
      const style = (node as HTMLElement).getAttribute('style') || ''
      if (/font-style:\s*italic/i.test(style)) {
        return `***${content.trim()}***`
      }
      return `**${content.trim()}**`
    },
  })

  // Scrivener uses <span style="font-style: italic"> for italic
  service.addRule('spanItalic', {
    filter: (node) => {
      if (node.nodeName !== 'SPAN') return false
      const style = node.getAttribute('style') || ''
      // Italic but NOT bold (bold+italic handled above)
      return /font-style:\s*italic/i.test(style) &&
        !/font-weight:\s*(bold|[6-9]\d\d)/i.test(style)
    },
    replacement: (content) => {
      if (!content.trim()) return content
      return `*${content.trim()}*`
    },
  })

  // Scrivener uses <span style="text-decoration: line-through"> for strikethrough
  service.addRule('spanStrike', {
    filter: (node) =>
      node.nodeName === 'SPAN' &&
      /text-decoration[^:]*:\s*line-through/i.test(node.getAttribute('style') || ''),
    replacement: (content) => {
      if (!content.trim()) return content
      return `~~${content.trim()}~~`
    },
  })

  // Monospace font → inline code
  service.addRule('spanMono', {
    filter: (node) => {
      if (node.nodeName !== 'SPAN') return false
      const style = node.getAttribute('style') || ''
      return /font-family:\s*['"]?(Courier|Menlo|Monaco|Consolas|monospace)/i.test(style)
    },
    replacement: (content) => {
      if (!content.trim()) return content
      // If it contains newlines, use a code block
      if (content.includes('\n')) {
        return '\n```\n' + content.trim() + '\n```\n'
      }
      return '`' + content.trim() + '`'
    },
  })

  // Font size — preserve as inline HTML span for large text that might be headings
  service.addRule('spanFontSize', {
    filter: (node) => {
      if (node.nodeName !== 'SPAN') return false
      const style = node.getAttribute('style') || ''
      // Only capture non-default font sizes (skip body text sizes like 12-14pt)
      const match = style.match(/font-size:\s*(\d+(?:\.\d+)?)\s*pt/i)
      if (!match) return false
      const pt = parseFloat(match[1])
      return pt > 16 || pt < 10 // Only non-body sizes
    },
    replacement: (content, node) => {
      if (!content.trim()) return content
      const style = (node as HTMLElement).getAttribute('style') || ''
      const match = style.match(/font-size:\s*(\d+(?:\.\d+)?)\s*pt/i)
      if (!match) return content
      const pt = parseFloat(match[1])
      // Large text → heading
      if (pt >= 24) return `# ${content.trim()}\n`
      if (pt >= 18) return `## ${content.trim()}\n`
      if (pt >= 16) return `### ${content.trim()}\n`
      // Small text → preserve as span
      return `<span style="font-size: ${pt}pt">${content.trim()}</span>`
    },
  })

  // Non-standard font family — preserve as inline HTML span
  service.addRule('spanFontFamily', {
    filter: (node) => {
      if (node.nodeName !== 'SPAN') return false
      const style = node.getAttribute('style') || ''
      // Skip monospace (handled above) and common body fonts
      if (/font-family:\s*['"]?(Courier|Menlo|Monaco|Consolas|monospace)/i.test(style)) return false
      // Only match if there's a non-trivial font-family that differs from default
      const match = style.match(/font-family:\s*['"]?([^;'"]+)/i)
      if (!match) return false
      const font = match[1].trim().toLowerCase()
      // Skip common default/body fonts
      const defaults = ['georgia', 'times', 'times new roman', 'serif', 'system-ui', 'arial', 'helvetica', 'sans-serif']
      return !defaults.some((d) => font.startsWith(d))
    },
    replacement: (content, node) => {
      if (!content.trim()) return content
      const style = (node as HTMLElement).getAttribute('style') || ''
      const match = style.match(/font-family:\s*['"]?([^;'"]+)/i)
      if (!match) return content
      return `<span style="font-family: ${match[1].trim()}">${content.trim()}</span>`
    },
  })

  // Handle <b> and <strong> (some apps use these)
  // turndown handles these by default, but ensure they work

  // Strip empty spans and divs that Scrivener sometimes adds
  service.addRule('emptySpan', {
    filter: (node) =>
      (node.nodeName === 'SPAN' || node.nodeName === 'DIV') &&
      !node.textContent?.trim(),
    replacement: () => '',
  })

  // Handle <p> tags (Scrivener wraps paragraphs in <p>)
  // turndown handles this by default

  return service
}

/**
 * Convert rich HTML to Markdown, preserving bold, italic, fonts, and sizes.
 */
export function htmlToMarkdown(html: string): string {
  // Strip <style>, <head>, <meta>, and <script> blocks before turndown processes them
  // Scrivener includes CSS rules like `p.p1 { font: 16px 'Times New Roman' }` which
  // turndown converts to visible text instead of stripping
  let cleaned = html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '')
    .replace(/<meta[^>]*\/?>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<link[^>]*\/?>/gi, '')

  const td = getService()
  let md = td.turndown(cleaned)

  // Clean up excessive blank lines
  md = md.replace(/\n{3,}/g, '\n\n')

  return md.trim()
}

/**
 * Parse Scrivener's embedded <style> blocks into DocumentStyles.
 * Scrivener pastes include CSS rules like:
 *   p.p1 {margin: 0.0px 0.0px 16.0px 0.0px; font: 16.0px 'Times New Roman'}
 * We extract font family, size, line-height, color, and letter-spacing.
 */
export function parseScrivenerStyles(html: string): DocumentStyles | null {
  const styleBlocks: string[] = []
  const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi
  let match
  while ((match = styleRegex.exec(html)) !== null) {
    styleBlocks.push(match[1])
  }
  if (styleBlocks.length === 0) return null

  const css = styleBlocks.join('\n')
  const styles: DocumentStyles = {}

  // Parse CSS rules
  const ruleRegex = /([^{]+)\{([^}]+)\}/g
  const bodyStyles: TextStyle[] = []

  while ((match = ruleRegex.exec(css)) !== null) {
    const declarations = match[2]
    const textStyle: TextStyle = {}

    // font shorthand: font: 16.0px 'Times New Roman'
    // also handles: font: italic 16.0px 'Times New Roman'
    const fontShorthand = declarations.match(
      /font:\s*(?:italic\s+|bold\s+|normal\s+)*(\d+(?:\.\d+)?)\s*px\s+['"]?([^;'"]+)/i
    )
    if (fontShorthand) {
      textStyle.fontSize = parseFloat(fontShorthand[1])
      textStyle.fontFamily = fontShorthand[2].trim().replace(/['"]$/, '')
    }

    // Explicit font-family
    const fontFamily = declarations.match(/font-family:\s*['"]?([^;'"]+)/i)
    if (fontFamily) textStyle.fontFamily = fontFamily[1].trim()

    // Explicit font-size
    const fontSize = declarations.match(/font-size:\s*(\d+(?:\.\d+)?)\s*px/i)
    if (fontSize) textStyle.fontSize = parseFloat(fontSize[1])

    // Line height
    const lineHeight = declarations.match(/line-height:\s*([\d.]+)/i)
    if (lineHeight) textStyle.lineHeight = parseFloat(lineHeight[1])

    // Color
    const color = declarations.match(/(?:^|[;\s])color:\s*([^;]+)/i)
    if (color) textStyle.color = color[1].trim()

    // Letter spacing
    const letterSpacing = declarations.match(/letter-spacing:\s*([^;]+)/i)
    if (letterSpacing) textStyle.letterSpacing = letterSpacing[1].trim()

    if (Object.keys(textStyle).length > 0) {
      bodyStyles.push(textStyle)
    }
  }

  if (bodyStyles.length === 0) return null

  // Use the first/most common style as body defaults
  // Scrivener's p.p1 is typically the main body style
  styles.body = bodyStyles[0]

  return styles
}

/**
 * Convert HTML to Markdown and extract any Scrivener document styles.
 */
export function htmlToMarkdownWithStyles(html: string): {
  markdown: string
  styles: DocumentStyles | null
} {
  const styles = parseScrivenerStyles(html)
  const markdown = htmlToMarkdown(html)
  return { markdown, styles }
}

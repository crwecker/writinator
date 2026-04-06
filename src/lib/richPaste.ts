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

  // Monospace font → preserve with a placeholder that we convert back after turndown
  service.addRule('spanMono', {
    filter: (node) => {
      if (node.nodeName !== 'SPAN') return false
      const style = node.getAttribute('style') || ''
      return /font-family:\s*['"]?(Courier|JetBrains Mono|Menlo|Monaco|Consolas|monospace)/i.test(style)
    },
    replacement: (content) => {
      if (!content.trim()) return content
      return `%%MONO_START%%${content.trim()}%%MONO_END%%`
    },
  })

  // Unified inline style rule — preserves font-family, font-size, and color
  // in a single pass so properties don't get lost when multiple are present.
  service.addRule('spanInlineStyle', {
    filter: (node) => {
      if (node.nodeName !== 'SPAN') return false
      const style = node.getAttribute('style') || ''
      // Skip monospace (handled by spanMono above)
      if (/font-family:\s*['"]?(Courier|JetBrains Mono|Menlo|Monaco|Consolas|monospace)/i.test(style)) return false
      // Skip if already matched by bold/italic/strikethrough rules
      if (/font-weight:\s*(bold|[6-9]\d\d)/i.test(style)) return false
      if (/font-style:\s*italic/i.test(style)) return false
      if (/text-decoration[^:]*:\s*line-through/i.test(style)) return false

      // Match if any of: non-default font-family, font-size, or non-trivial color
      const hasFont = (() => {
        const match = style.match(/font-family:\s*['"]?([^;'"]+)/i)
        if (!match) return false
        const font = match[1].trim().toLowerCase()
        const defaults = ['georgia', 'times', 'times new roman', 'serif', 'system-ui']
        return !defaults.some((d) => font.startsWith(d))
      })()
      const hasSize = /font-size:\s*[\d.]+\s*(px|pt|em|rem)/i.test(style)
      const hasColor = (() => {
        const colorMatch = style.match(/(?:^|;\s*)color\s*:\s*([^;]+)/i)
        if (!colorMatch) return false
        const color = colorMatch[1].trim().toLowerCase()
        const hexMatch = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/)
        if (hexMatch) {
          const [r, g, b] = hexMatch.slice(1).map((h) => parseInt(h, 16))
          if (r <= 50 && g <= 50 && b <= 50) return false
          if (r >= 200 && g >= 200 && b >= 200) return false
        }
        if (/^(#000|black|rgb\(0,\s*0,\s*0\))$/.test(color)) return false
        if (/^(#fff|white|rgb\(255,\s*255,\s*255\))$/.test(color)) return false
        return true
      })()

      return hasFont || hasSize || hasColor
    },
    replacement: (content, node) => {
      if (!content.trim()) return content
      const style = (node as HTMLElement).getAttribute('style') || ''

      // Collect all relevant CSS properties
      const props: string[] = []

      const fontMatch = style.match(/font-family:\s*['"]?([^;'"]+)/i)
      if (fontMatch) {
        const font = fontMatch[1].trim().toLowerCase()
        const defaults = ['georgia', 'times', 'times new roman', 'serif', 'system-ui']
        if (!defaults.some((d) => font.startsWith(d))) {
          props.push(`font-family: '${fontMatch[1].trim().replace(/'/g, '')}'`)
        }
      }

      const sizeMatch = style.match(/font-size:\s*([\d.]+\s*(?:px|pt|em|rem))/i)
      if (sizeMatch) props.push(`font-size: ${sizeMatch[1]}`)

      const colorMatch = style.match(/(?:^|;\s*)color\s*:\s*([^;]+)/i)
      if (colorMatch) {
        const color = colorMatch[1].trim().toLowerCase()
        let skip = false
        const hexMatch = color.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/)
        if (hexMatch) {
          const [r, g, b] = hexMatch.slice(1).map((h) => parseInt(h, 16))
          if ((r <= 50 && g <= 50 && b <= 50) || (r >= 200 && g >= 200 && b >= 200)) skip = true
        }
        if (/^(#000|black|rgb\(0,\s*0,\s*0\)|#fff|white|rgb\(255,\s*255,\s*255\))$/.test(color)) skip = true
        if (!skip) props.push(`color: ${colorMatch[1].trim()}`)
      }

      if (props.length === 0) return content.trim()
      return `%%STYLE_START:${props.join('; ')}%%${content.trim()}%%STYLE_END%%`
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
 * Parse CSS rules from <style> blocks and inline them onto matching elements.
 * Scrivener uses class-based styles (p.p1, span.s1) rather than inline styles,
 * so we need to resolve these before turndown can see them.
 */
function inlineClassStyles(doc: Document): void {
  // Collect all <style> blocks
  const styleEls = doc.querySelectorAll('style')
  if (styleEls.length === 0) return

  const css = Array.from(styleEls).map((el) => el.textContent || '').join('\n')

  // Parse CSS rules: selector { declarations }
  const ruleRegex = /([^{]+)\{([^}]+)\}/g
  let match
  while ((match = ruleRegex.exec(css)) !== null) {
    const selector = match[1].trim()
    const declarations = match[2].trim()

    // Try to query matching elements — skip if selector is invalid
    try {
      const els = doc.querySelectorAll(selector)
      for (const el of els) {
        const existing = el.getAttribute('style') || ''
        // Existing inline styles take precedence (appended last)
        el.setAttribute('style', existing ? `${declarations}; ${existing}` : declarations)
      }
    } catch {
      // Skip selectors the browser can't handle
    }
  }

  // Propagate inheritable properties (color) from parent to child elements
  // that don't define their own. Scrivener puts color on <p> but children
  // (spans) inherit it without an explicit declaration.
  const inheritableProps = ['color']
  for (const prop of inheritableProps) {
    const propRegex = new RegExp(`(?:^|;\\s*)${prop}\\s*:\\s*([^;]+)`, 'i')
    const parents = doc.querySelectorAll('[style]')
    for (const parent of parents) {
      const parentStyle = parent.getAttribute('style') || ''
      const parentMatch = parentStyle.match(propRegex)
      if (!parentMatch) continue
      const value = parentMatch[1].trim()
      // Skip near-black values — no point propagating
      if (/^(#000|black|rgb\(0,\s*0,\s*0\))$/i.test(value)) continue
      const hexProp = value.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
      if (hexProp && hexProp.slice(1).every((h) => parseInt(h, 16) <= 50)) continue
      for (const child of parent.querySelectorAll('span, p, div')) {
        const childStyle = child.getAttribute('style') || ''
        if (propRegex.test(childStyle)) continue // child has its own value
        const updated = childStyle ? `${childStyle}; ${prop}: ${value}` : `${prop}: ${value}`
        child.setAttribute('style', updated)
      }
    }
  }
}

/** Check if an element's inlined style indicates a monospace font */
function isMono(el: Element): boolean {
  const style = el.getAttribute('style') || ''
  return /font-family:\s*['"]?(Courier|Menlo|Monaco|Consolas|monospace)/i.test(style) ||
    /font:\s*[\d.]+\s*px\s+['"]?(Courier|Menlo|Monaco|Consolas)/i.test(style)
}

/** Extract the font family from an element's inlined style */
function getFontFamily(el: Element): string | null {
  const style = el.getAttribute('style') || ''
  // Try font-family first
  const familyMatch = style.match(/font-family:\s*['"]?([^;'"]+)/i)
  if (familyMatch) return familyMatch[1].trim()
  // Try font shorthand: font: 16px 'Times New Roman'
  const shorthandMatch = style.match(/font:\s*[\d.]+\s*px\s+['"]?([^;'"]+)/i)
  if (shorthandMatch) return shorthandMatch[1].trim()
  return null
}

/** Extract the font size (in px) from an element's inlined style */
function getFontSize(el: Element): number | null {
  const style = el.getAttribute('style') || ''
  // Try font-size first
  const sizeMatch = style.match(/font-size:\s*([\d.]+)\s*px/i)
  if (sizeMatch) return parseFloat(sizeMatch[1])
  // Try font shorthand: font: 16px 'Times New Roman'
  const shorthandMatch = style.match(/font:\s*([\d.]+)\s*px/i)
  if (shorthandMatch) return parseFloat(shorthandMatch[1])
  return null
}

interface BodyDefaults {
  font: string | null
  size: number | null
}

/**
 * Detect the body font and size. Scrivener's body paragraphs typically have non-zero
 * bottom margin while special formatting (centered, monospace) uses margin 0.
 * Fall back to the most common non-special font by paragraph count.
 */
function detectBodyDefaults(doc: Document): BodyDefaults {
  const nonZeroMargin = /margin:\s*[\d.]+px\s+[\d.]+px\s+(?!0(\.0)?px)[\d.]+px/i

  // First: look for paragraphs with non-zero bottom margin (likely body text)
  for (const p of doc.body?.querySelectorAll('p') ?? []) {
    const style = p.getAttribute('style') || ''
    if (!nonZeroMargin.test(style)) continue
    if (isMono(p)) continue
    const font = getFontFamily(p)
    if (font) return { font: font.toLowerCase(), size: getFontSize(p) }
  }

  // Fallback: most common non-mono, non-emoji font by paragraph count
  const counts = new Map<string, { count: number; size: number | null }>()
  for (const p of doc.body?.querySelectorAll('p') ?? []) {
    if (isMono(p)) continue
    const font = getFontFamily(p)
    if (!font) continue
    const key = font.toLowerCase()
    if (key.includes('emoji')) continue
    const existing = counts.get(key)
    if (existing) {
      existing.count++
    } else {
      counts.set(key, { count: 1, size: getFontSize(p) })
    }
  }
  if (counts.size === 0) return { font: null, size: null }
  let maxFont = ''
  let maxCount = 0
  let maxSize: number | null = null
  for (const [font, { count, size }] of counts) {
    if (count > maxCount) { maxFont = font; maxCount = count; maxSize = size }
  }
  return { font: maxFont, size: maxSize }
}

/**
 * Detect text-align on <p> elements and prepend {align:X} markers.
 * Must run after inlineClassStyles so class-based alignment is resolved.
 */
function inlineAlignment(doc: Document): void {
  const alignRegex = /text-align:\s*(center|right)/i

  for (const p of doc.body?.querySelectorAll('p') ?? []) {
    const style = p.getAttribute('style') || ''
    const match = style.match(alignRegex)
    if (!match) continue
    const alignment = match[1].toLowerCase()
    const marker = doc.createTextNode(`{align:${alignment}} `)
    p.insertBefore(marker, p.firstChild)
  }
}

/**
 * Wrap a paragraph's children in a style span if the <p> has a font or size
 * that differs from the body defaults. Monospace gets mapped to JetBrains Mono.
 */
function wrapFontChildren(p: Element, doc: Document, body: BodyDefaults): void {
  const font = getFontFamily(p)
  const size = getFontSize(p)

  const fontDiffers = font && !(body.font && font.toLowerCase() === body.font)
  const sizeDiffers = size && !(body.size && size === body.size)

  if (!fontDiffers && !sizeDiffers) return

  // Build the CSS style parts
  const styleParts: string[] = []
  if (fontDiffers) {
    if (isMono(p)) {
      styleParts.push("font-family: 'JetBrains Mono', monospace")
    } else {
      styleParts.push(`font-family: '${font!.replace(/'/g, '')}'`)
    }
  }
  if (sizeDiffers) {
    styleParts.push(`font-size: ${size}px`)
  }

  // Check if first child is an {align:X} marker — keep it outside the span
  const first = p.firstChild
  const hasAlignMarker = first?.nodeType === 3 &&
    /^\{align:(center|right|left)\}\s/.test(first.textContent || '')

  const span = doc.createElement('span')
  span.setAttribute('style', styleParts.join('; '))

  if (hasAlignMarker) {
    while (first.nextSibling) span.appendChild(first.nextSibling)
    p.appendChild(span)
  } else {
    while (p.firstChild) span.appendChild(p.firstChild)
    p.appendChild(span)
  }
}

/**
 * Mark zero-bottom-margin paragraphs so turndown produces single line breaks
 * instead of double. Scrivener uses margin: 0 for tightly-spaced lines.
 * We convert them to <br>-separated content within a wrapper div.
 * Also wraps non-body-font paragraph content in inline font spans.
 */
function collapseTightParagraphs(doc: Document, bodyDefaults: BodyDefaults): void {
  const zeroBottomMargin = /margin:\s*[\d.]+px\s+[\d.]+px\s+0(?:\.0)?px/i

  const docBody = doc.body
  if (!docBody) return

  const paragraphs = Array.from(docBody.querySelectorAll('p'))
  let i = 0
  while (i < paragraphs.length) {
    const p = paragraphs[i]
    const style = p.getAttribute('style') || ''
    if (!zeroBottomMargin.test(style)) {
      // Still wrap non-body fonts/sizes even if not zero-margin
      wrapFontChildren(p, doc, bodyDefaults)
      i++
      continue
    }

    // Collect consecutive zero-margin paragraphs
    const group = [p]
    let j = i + 1
    while (j < paragraphs.length) {
      const next = paragraphs[j]
      const nextStyle = next.getAttribute('style') || ''
      if (!zeroBottomMargin.test(nextStyle)) break
      if (next.previousElementSibling !== group[group.length - 1]) break
      group.push(next)
      j++
    }

    // Wrap non-body font/size children before merging
    group.forEach((el) => wrapFontChildren(el, doc, bodyDefaults))

    if (group.length > 1) {
      // Merge into a single block with <br> between lines
      const wrapper = doc.createElement('div')
      group.forEach((el, idx) => {
        while (el.firstChild) wrapper.appendChild(el.firstChild)
        if (idx < group.length - 1) wrapper.appendChild(doc.createElement('br'))
      })
      group[0].replaceWith(wrapper)
      for (let k = 1; k < group.length; k++) group[k].remove()
    }

    i = j
  }
}

/**
 * Convert rich HTML to Markdown, preserving bold, italic, fonts, and sizes.
 * Returns the markdown and the detected body font family (lowercase).
 */
export function htmlToMarkdown(html: string): { markdown: string; bodyFont: string | null } {
  // Parse into a DOM so we can inline class-based styles before turndown
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, 'text/html')

  // Inline CSS class styles onto elements
  inlineClassStyles(doc)

  // Detect the body (most common) font/size so we only wrap differences in spans
  const body = detectBodyDefaults(doc)

  // Preserve text alignment as {align:X} markers (before font wrapping)
  inlineAlignment(doc)

  // Collapse zero-margin paragraphs into single-spaced lines + wrap non-body fonts/sizes
  collapseTightParagraphs(doc, body)

  // Remove <style>, <head>, <meta>, <script>, <link> so turndown doesn't render them as text
  doc.querySelectorAll('style, meta, script, link').forEach((el) => el.remove())
  if (doc.head) doc.head.remove()

  const cleaned = doc.body?.innerHTML || ''

  const td = getService()
  let md = td.turndown(cleaned)

  // Restore style spans from placeholders
  md = md.replace(/%%MONO_START%%(.*?)%%MONO_END%%/g,
    (_, content) => `<span style="font-family: 'JetBrains Mono', monospace">${content}</span>`)
  md = md.replace(/%%STYLE_START:([^%]+)%%(.*?)%%STYLE_END%%/g,
    (_, style, content) => `<span style="${style}">${content}</span>`)

  // Clean up excessive blank lines
  md = md.replace(/\n{3,}/g, '\n\n')

  return { markdown: md.trim(), bodyFont: body.font }
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
 * Returns the detected body font so the caller can handle font conflicts.
 */
export function htmlToMarkdownWithStyles(html: string): {
  markdown: string
  styles: DocumentStyles | null
  pastedBodyFont: string | null
} {
  const styles = parseScrivenerStyles(html)
  const { markdown, bodyFont } = htmlToMarkdown(html)
  return { markdown, styles, pastedBodyFont: bodyFont }
}

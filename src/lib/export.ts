import type {
  ActiveBuff,
  Book,
  Character,
  CharacterState,
  Storylet,
  EquippedItem,
  StatDelta,
  StatDefinition,
  StatValue,
} from '../types'
import type { Root, Content, PhrasingContent } from 'mdast'
import JSZip from 'jszip'
import { parseMarkdown } from './ast'
import { useCharacterStore } from '../stores/characterStore'
import { computeStateAt } from './characterState'
import {
  STAT_MARKER_REGEX,
  STATBLOCK_MARKER_REGEX,
} from './markerUtils'

// ─── Helpers ────────────────────────────────────────────

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'untitled'
}

/** Clean paste artifacts from content. Converts {align:X} markers to HTML
 *  comments that survive markdown parsing, then post-processing converts
 *  them to styled elements. */
function stripPasteArtifacts(content: string): string {
  return content.replace(/\{align:(\w+)\}\s*/g, '<!--align:$1-->')
}

// ─── Character marker processing ────────────────────────

export type StatblockExportFormat = 'markdown' | 'html' | 'docx' | 'epub' | 'plain'

function parseStatblockOptions(raw: string | undefined): Record<string, string> {
  if (!raw) return {}
  const out: Record<string, string> = {}
  for (const pair of raw.split(',')) {
    const trimmed = pair.trim()
    if (!trimmed) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) {
      out[trimmed] = ''
    } else {
      out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim()
    }
  }
  return out
}

function formatStatValueForExport(v: StatValue): string {
  switch (v.kind) {
    case 'number':
      return String(v.value)
    case 'numberWithMax':
      return `${v.value}/${v.max}`
    case 'text':
      return v.value || '—'
    case 'list':
      return v.items.length === 0 ? '(none)' : v.items.join(', ')
    case 'attributeSet':
      return Object.entries(v.values)
        .map(([k, n]) => `${k} ${n}`)
        .join(' • ')
    case 'rank':
      return v.tier
  }
}

const DEFAULT_STATBLOCK_FIELD_KEYS = ['hp', 'mp', 'level', 'xp', 'attributes']

function resolveStatblockDefinitions(
  character: Character,
  fields: string[] | undefined
): StatDefinition[] {
  const wanted = fields && fields.length > 0 ? fields : DEFAULT_STATBLOCK_FIELD_KEYS
  const byId = new Map(character.stats.map((s) => [s.id, s]))
  const byName = new Map(character.stats.map((s) => [s.name.toLowerCase(), s]))
  const resolved: StatDefinition[] = []
  const seen = new Set<string>()
  for (const key of wanted) {
    const def = byId.get(key) ?? byName.get(key.toLowerCase())
    if (def && !seen.has(def.id)) {
      resolved.push(def)
      seen.add(def.id)
    }
  }
  if (resolved.length === 0) {
    for (const def of character.stats) {
      if (!seen.has(def.id)) {
        resolved.push(def)
        seen.add(def.id)
      }
    }
  }
  return resolved
}

/**
 * Render a statblock as format-appropriate text. Returns the rendered text
 * that will replace the `<!-- statblock:... -->` marker in document content.
 */
export function renderStatblockText(
  character: Character,
  state: CharacterState,
  effective: Record<string, StatValue>,
  fields: string[] | undefined,
  format: StatblockExportFormat
): string {
  const defs = resolveStatblockDefinitions(character, fields)
  const lines: Array<{ label: string; value: string }> = []
  for (const def of defs) {
    const v = effective[def.id]
    if (!v) continue
    lines.push({ label: def.name, value: formatStatValueForExport(v) })
  }
  const equippedEntries: [string, EquippedItem][] = Object.entries(state.equipped)
  const buffs: ActiveBuff[] = state.activeBuffs

  if (format === 'markdown' || format === 'plain') {
    const parts: string[] = []
    parts.push(`> **${character.name} — Status**`)
    for (const l of lines) {
      parts.push(`> ${l.label}: ${l.value}`)
    }
    if (equippedEntries.length > 0) {
      parts.push(
        `> Equipped: ${equippedEntries
          .map(([slot, it]) => `${slot}: ${it.itemName ?? it.itemId}`)
          .join('; ')}`
      )
    }
    if (buffs.length > 0) {
      parts.push(
        `> Buffs: ${buffs.map((b) => b.buffName ?? b.buffId).join(', ')}`
      )
    }
    return parts.join('\n')
  }

  // HTML / DOCX / EPUB — render as a styled <div>. DOCX/EPUB may strip styles
  // but the plain text will still be readable.
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const rowsHtml = lines
    .map(
      (l) =>
        `<div><span style="color:#888;text-transform:uppercase;font-size:11px;letter-spacing:0.05em;">${esc(
          l.label
        )}:</span> <span style="font-family:monospace;">${esc(l.value)}</span></div>`
    )
    .join('')
  const equippedHtml =
    equippedEntries.length > 0
      ? `<div style="margin-top:6px;font-size:12px;color:#888;">Equipped: ${equippedEntries
          .map(([slot, it]) => esc(`${slot}: ${it.itemName ?? it.itemId}`))
          .join('; ')}</div>`
      : ''
  const buffsHtml =
    buffs.length > 0
      ? `<div style="margin-top:4px;font-size:12px;color:#888;">Buffs: ${buffs
          .map((b) => esc(b.buffName ?? b.buffId))
          .join(', ')}</div>`
      : ''
  return `<div class="writinator-statblock" style="border:1px solid #444;border-radius:6px;padding:10px 14px;margin:12px 0;background:#f5f5f5;"><div style="font-weight:600;margin-bottom:6px;">${esc(
    character.name
  )} — Status</div>${rowsHtml}${equippedHtml}${buffsHtml}</div>`
}

interface CharacterMarkerContext {
  book: Book
  storyletId: string
  characters: Character[]
  markers: Record<string, StatDelta[]>
}

function getCharacterMarkerContext(
  book: Book,
  storyletId: string
): CharacterMarkerContext {
  const store = useCharacterStore.getState()
  return {
    book,
    storyletId,
    characters: store.characters,
    markers: store.markers,
  }
}

/**
 * Remove stat-delta markers (`<!-- stat:uuid -->`) and replace statblock
 * markers (`<!-- statblock:characterId[:fields=...] -->`) with format-specific
 * rendered text. Operates on raw document content before any markdown parsing.
 */
function processCharacterMarkers(
  content: string,
  ctx: CharacterMarkerContext,
  format: StatblockExportFormat,
  options?: { preserveStatMarkers?: boolean }
): string {
  if (!content) return content
  let out = content

  // 1) Strip stat-delta markers (unless MD preserve flag is set).
  if (!options?.preserveStatMarkers) {
    out = out.replace(new RegExp(STAT_MARKER_REGEX.source, 'g'), '')
  }

  // 2) Replace statblock markers with rendered blocks.
  out = out.replace(
    new RegExp(STATBLOCK_MARKER_REGEX.source, 'g'),
    (_match, charId: string, rawOptions: string | undefined, matchOffset: number) => {
      // matchOffset from replace is the 3rd param when using a regex with groups,
      // but the signature is (match, ...groups, offset, string). To be safe,
      // rely on index lookup via the original content. Use indexOf fallback.
      const actualOffset = typeof matchOffset === 'number' ? matchOffset : out.indexOf(_match)
      const character = ctx.characters.find((c) => c.id === charId)
      if (!character) {
        if (format === 'markdown' || format === 'plain') {
          return `> *[missing character: ${charId}]*`
        }
        return `<div class="writinator-statblock-missing">[missing character: ${charId}]</div>`
      }
      const opts = parseStatblockOptions(rawOptions)
      const fieldsRaw = opts.fields
      const fields = fieldsRaw
        ? fieldsRaw
            .split('|')
            .flatMap((s) => s.split(','))
            .map((s) => s.trim())
            .filter(Boolean)
        : undefined
      const computed = computeStateAt(character, ctx.book, ctx.markers, {
        storyletId: ctx.storyletId,
        offset: actualOffset,
      })
      const rendered = renderStatblockText(
        character,
        computed.state,
        computed.effective,
        fields,
        format
      )
      // Bracket with blank lines so it becomes its own block in markdown/html.
      if (format === 'markdown' || format === 'plain') {
        return `\n\n${rendered}\n\n`
      }
      return `\n\n${rendered}\n\n`
    }
  )

  return out
}

/** Preprocess content for EPUB: convert styled HTML spans to semantic markup,
 *  strip remaining known HTML tags (keeping text content), convert {align:X}
 *  to markers. Preserves <<text>> and bare < since those aren't matched. */
function preprocessForEpub(content: string): string {
  return content
    .replace(/\{align:(\w+)\}\s*/g, '%%ALIGN:$1%%\n')
    // Convert monospace spans to backtick-wrapped inline code
    .replace(/<span\s+style="[^"]*(?:monospace|Courier|JetBrains Mono)[^"]*">([\s\S]*?)<\/span>/gi,
      (_m, text: string) => '`' + text + '`')
    // Strip all remaining known HTML tags
    .replace(/<\/?(span|div|font|center|a|b|i|u|em|strong|sup|sub|s|br|hr|img|table|tr|td|th|thead|tbody|tfoot|col|colgroup|caption|ul|ol|li|dl|dt|dd|p|pre|code|blockquote|section|article|header|footer|nav|main|aside|details|summary|figure|figcaption|mark|abbr|cite|small|big|ruby|rt|wbr|iframe|object|embed|source|audio|video|picture|svg|path|rect|circle|g)\b[^>]*\/?>/gi, '\n')
}

/** Convert <!--align:X--> comments into styled wrappers on the next element */
function applyAlignmentMarkers(html: string): string {
  return html.replace(/<!--align:(\w+)-->\s*(<[a-zA-Z][^>]*>)/g, (_m, align: string, tag: string) => {
    if (tag.includes('style="')) {
      return tag.replace('style="', `style="text-align: ${align}; `)
    }
    return tag.replace(/>$/, ` style="text-align: ${align};">`)
  })
}


function download(content: string | Blob, filename: string, mimeType: string): void {
  const blob = content instanceof Blob
    ? content
    : new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function getDepth(storylet: Storylet, storylets: Storylet[]): number {
  let depth = 0
  let current = storylet
  while (current.parentId) {
    depth++
    const parent = storylets.find((s) => s.id === current.parentId)
    if (!parent) break
    current = parent
  }
  return depth
}

/** Get the full book as a single markdown string with storylet headings */
function bookToMarkdown(
  book: Book,
  options?: { preserveStatMarkers?: boolean }
): string {
  const parts: string[] = [`# ${book.title}\n`]
  for (const doc of book.storylets) {
    const depth = getDepth(doc, book.storylets)
    const hashes = '#'.repeat(Math.min(depth + 2, 6))
    parts.push(`${hashes} ${doc.name}\n`)
    if (doc.content) {
      const ctx = getCharacterMarkerContext(book, doc.id)
      parts.push(
        processCharacterMarkers(doc.content, ctx, 'markdown', options)
      )
    }
    parts.push('')
  }
  return parts.join('\n')
}

// ─── AST Utilities ──────────────────────────────────────

/** Extract plain text from phrasing content nodes */
function phrasingToText(nodes: PhrasingContent[]): string {
  return nodes.map((n) => {
    if (n.type === 'text') return n.value
    if (n.type === 'inlineCode') return n.value
    if ('children' in n) return phrasingToText(n.children as PhrasingContent[])
    return ''
  }).join('')
}

function hasPhrasingChildren(node: unknown): node is { children: PhrasingContent[] } {
  if (typeof node !== 'object' || node === null || !('children' in node)) return false
  const candidate = (node as { children?: unknown }).children
  return Array.isArray(candidate)
}

function hasStringValue(node: unknown): node is { value: string } {
  if (typeof node !== 'object' || node === null || !('value' in node)) return false
  return typeof (node as { value?: unknown }).value === 'string'
}

// ─── Markdown Export ────────────────────────────────────

export function exportAsMarkdown(
  book: Book,
  options?: { preserveStatMarkers?: boolean }
): void {
  download(
    bookToMarkdown(book, options),
    `${sanitizeFilename(book.title)}.md`,
    'text/markdown'
  )
}

/** In-memory variant: returns the Markdown string instead of triggering a download. */
export function renderBookAsMarkdown(
  book: Book,
  options?: { preserveStatMarkers?: boolean }
): string {
  return bookToMarkdown(book, options)
}

// ─── Plain Text Export ──────────────────────────────────

function astToPlainText(tree: Root): string {
  const lines: string[] = []
  for (const node of tree.children) {
    switch (node.type) {
      case 'heading':
        lines.push(phrasingToText(node.children))
        lines.push('')
        break
      case 'paragraph':
        lines.push(phrasingToText(node.children))
        lines.push('')
        break
      case 'blockquote':
        for (const child of node.children) {
          if (child.type === 'paragraph') {
            lines.push('  ' + phrasingToText(child.children))
          }
        }
        lines.push('')
        break
      case 'code':
        lines.push(node.value)
        lines.push('')
        break
      case 'list':
        for (const item of node.children) {
          if (item.type === 'listItem') {
            const prefix = node.ordered ? `${node.children.indexOf(item) + (node.start ?? 1)}. ` : '- '
            for (const child of item.children) {
              if (child.type === 'paragraph') {
                lines.push(prefix + phrasingToText(child.children))
              }
            }
          }
        }
        lines.push('')
        break
      case 'thematicBreak':
        lines.push('---')
        lines.push('')
        break
      default:
        break
    }
  }
  return lines.join('\n')
}

export function exportAsPlainText(book: Book): void {
  const parts: string[] = [book.title, '']
  for (const doc of book.storylets) {
    const depth = getDepth(doc, book.storylets)
    const indent = '  '.repeat(depth)
    parts.push(`${indent}${doc.name}`)
    parts.push('')
    if (doc.content) {
      const ctx = getCharacterMarkerContext(book, doc.id)
      const processed = processCharacterMarkers(doc.content, ctx, 'plain')
      parts.push(astToPlainText(parseMarkdown(stripPasteArtifacts(processed))))
    }
  }
  download(parts.join('\n'), `${sanitizeFilename(book.title)}.txt`, 'text/plain')
}

// ─── HTML Export (via AST) ──────────────────────────────

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function phrasingToHtml(nodes: PhrasingContent[]): string {
  return nodes.map((n) => {
    switch (n.type) {
      case 'text': return escapeHtml(n.value)
      case 'strong': return `<strong>${phrasingToHtml(n.children)}</strong>`
      case 'emphasis': return `<em>${phrasingToHtml(n.children)}</em>`
      case 'delete': return `<del>${phrasingToHtml(n.children)}</del>`
      case 'inlineCode': return `<code>${escapeHtml(n.value)}</code>`
      case 'html': return (n as unknown as { value: string }).value
      case 'break': return '<br>'
      default:
        if (hasPhrasingChildren(n)) return phrasingToHtml(n.children)
        if (hasStringValue(n)) return escapeHtml(n.value)
        return ''
    }
  }).join('')
}

function astToHtml(tree: Root): string {
  return tree.children.map((node) => blockToHtml(node)).join('\n')
}

function blockToHtml(node: Content): string {
  switch (node.type) {
    case 'heading':
      return `<h${node.depth}>${phrasingToHtml(node.children)}</h${node.depth}>`
    case 'paragraph':
      return `<p>${phrasingToHtml(node.children)}</p>`
    case 'blockquote':
      return `<blockquote>${node.children.map(blockToHtml).join('\n')}</blockquote>`
    case 'code':
      return `<pre><code>${escapeHtml(node.value)}</code></pre>`
    case 'list': {
      const tag = node.ordered ? 'ol' : 'ul'
      const items = node.children.map((item) =>
        `<li>${item.children.map(blockToHtml).join('')}</li>`
      ).join('\n')
      return `<${tag}>\n${items}\n</${tag}>`
    }
    case 'html':
      return (node as unknown as { value: string }).value
    case 'thematicBreak':
      return '<hr>'
    default:
      return ''
  }
}

export function exportAsHtml(book: Book): void {
  const body = book.storylets
    .map((doc) => {
      const depth = getDepth(doc, book.storylets)
      const level = Math.min(depth + 2, 6)
      const heading = `<h${level}>${escapeHtml(doc.name)}</h${level}>`
      const ctx = getCharacterMarkerContext(book, doc.id)
      const processed = doc.content
        ? processCharacterMarkers(doc.content, ctx, 'html')
        : ''
      const content = processed
        ? applyAlignmentMarkers(astToHtml(parseMarkdown(stripPasteArtifacts(processed))))
        : ''
      return `${heading}\n${content}`
    })
    .join('\n\n')

  const html = `<!DOCTYPE html>
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
  pre { background: #f4f4f4; padding: 1rem; border-radius: 6px; overflow-x: auto; }
  blockquote { border-left: 3px solid #ddd; margin-left: 0; padding-left: 1rem; color: #555; }
  del { color: #999; }
</style>
</head>
<body>
<h1>${escapeHtml(book.title)}</h1>
${body}
</body>
</html>`

  download(html, `${sanitizeFilename(book.title)}.html`, 'text/html')
}

// ─── RTF Export (hand-rolled from AST) ──────────────────

function phrasingToRtf(nodes: PhrasingContent[]): string {
  return nodes.map((n) => {
    switch (n.type) {
      case 'text': return rtfEscape(n.value)
      case 'strong': return `{\\b ${phrasingToRtf(n.children)}}`
      case 'emphasis': return `{\\i ${phrasingToRtf(n.children)}}`
      case 'delete': return `{\\strike ${phrasingToRtf(n.children)}}`
      case 'inlineCode': return `{\\f1\\fs20 ${rtfEscape(n.value)}}`
      case 'break': return '\\line '
      default:
        if (hasPhrasingChildren(n)) return phrasingToRtf(n.children)
        if (hasStringValue(n)) return rtfEscape(n.value)
        return ''
    }
  }).join('')
}

function rtfEscape(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/\{/g, '\\{')
    .replace(/\}/g, '\\}')
    .replace(/[\u0080-\uFFFF]/g, (ch) => `\\u${ch.charCodeAt(0)}?`)
}

function astToRtf(tree: Root): string {
  const blocks: string[] = []
  for (const node of tree.children) {
    blocks.push(blockToRtf(node))
  }
  return blocks.join('\n')
}

function blockToRtf(node: Content): string {
  switch (node.type) {
    case 'heading': {
      const sizes = [48, 40, 32, 28, 26, 24] // half-points (RTF uses half-points)
      const size = sizes[Math.min(node.depth - 1, 5)]
      return `{\\pard\\fs${size}\\b ${phrasingToRtf(node.children)}\\b0\\par}`
    }
    case 'paragraph':
      return `{\\pard ${phrasingToRtf(node.children)}\\par}`
    case 'blockquote': {
      const inner = node.children.map(blockToRtf).join('\n')
      return `{\\pard\\li720 ${inner}\\par}`
    }
    case 'code':
      return `{\\pard\\f1\\fs20 ${rtfEscape(node.value)}\\par}`
    case 'list': {
      return node.children.map((item, i) => {
        const prefix = node.ordered ? `${i + (node.start ?? 1)}.` : '\\bullet'
        const content = item.children.map((child) => {
          if (child.type === 'paragraph') return phrasingToRtf(child.children)
          return blockToRtf(child)
        }).join('')
        return `{\\pard\\li360\\fi-360 ${prefix}\\tab ${content}\\par}`
      }).join('\n')
    }
    case 'thematicBreak':
      return `{\\pard\\brdrb\\brdrs\\brdrw10\\brsp20 \\par}`
    default:
      return ''
  }
}

export function exportAsRtf(book: Book): void {
  const header = `{\\rtf1\\ansi\\deff0\n{\\fonttbl{\\f0 Georgia;}{\\f1 Courier New;}}\n\\fs24\n`

  // Title
  let body = `{\\pard\\qc\\fs48\\b ${rtfEscape(book.title)}\\b0\\par}\n\\par\n`

  for (const doc of book.storylets) {
    const depth = getDepth(doc, book.storylets)
    const sizes = [40, 32, 28, 26, 24]
    const size = sizes[Math.min(depth, 4)]
    // Page break before each top-level document (except first)
    if (book.storylets.indexOf(doc) > 0 && depth === 0) {
      body += '\\page\n'
    }
    body += `{\\pard\\fs${size}\\b ${rtfEscape(doc.name)}\\b0\\par}\n\\par\n`
    if (doc.content) {
      const ctx = getCharacterMarkerContext(book, doc.id)
      const processed = processCharacterMarkers(doc.content, ctx, 'plain')
      body += astToRtf(parseMarkdown(stripPasteArtifacts(processed))) + '\n\\par\n'
    }
  }

  const rtf = header + body + '}'
  download(rtf, `${sanitizeFilename(book.title)}.rtf`, 'application/rtf')
}

// ─── DOCX Export (AST → docx package) ───────────────────

export async function exportAsDocx(book: Book): Promise<void> {
  const { Document: DocxDocument, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, LevelFormat } =
    await import('docx')

  function phrasingToRuns(nodes: PhrasingContent[], opts: { bold?: boolean; italics?: boolean; strike?: boolean } = {}): InstanceType<typeof TextRun>[] {
    const runs: InstanceType<typeof TextRun>[] = []
    for (const n of nodes) {
      switch (n.type) {
        case 'text':
          runs.push(new TextRun({ text: n.value, bold: opts.bold, italics: opts.italics, strike: opts.strike }))
          break
        case 'strong':
          runs.push(...phrasingToRuns(n.children, { ...opts, bold: true }))
          break
        case 'emphasis':
          runs.push(...phrasingToRuns(n.children, { ...opts, italics: true }))
          break
        case 'delete':
          runs.push(...phrasingToRuns(n.children, { ...opts, strike: true }))
          break
        case 'inlineCode':
          runs.push(new TextRun({ text: n.value, font: 'Courier New', size: 20, bold: opts.bold, italics: opts.italics }))
          break
        case 'break':
          runs.push(new TextRun({ break: 1 }))
          break
        default:
          if (hasPhrasingChildren(n)) runs.push(...phrasingToRuns(n.children, opts))
          else if (hasStringValue(n)) runs.push(new TextRun({ text: n.value, ...opts }))
          break
      }
    }
    return runs
  }

  const headingLevels = [
    HeadingLevel.HEADING_1,
    HeadingLevel.HEADING_2,
    HeadingLevel.HEADING_3,
    HeadingLevel.HEADING_4,
    HeadingLevel.HEADING_5,
    HeadingLevel.HEADING_6,
  ]

  function astToDocxChildren(tree: Root): InstanceType<typeof Paragraph>[] {
    const children: InstanceType<typeof Paragraph>[] = []
    for (const node of tree.children) {
      children.push(...blockToDocx(node))
    }
    return children
  }

  function blockToDocx(node: Content): InstanceType<typeof Paragraph>[] {
    switch (node.type) {
      case 'heading':
        return [new Paragraph({
          children: phrasingToRuns(node.children),
          heading: headingLevels[Math.min(node.depth - 1, 5)],
        })]
      case 'paragraph':
        return [new Paragraph({ children: phrasingToRuns(node.children), spacing: { after: 200 } })]
      case 'blockquote':
        return node.children.flatMap((child) => {
          const paras = blockToDocx(child)
          return paras.map((p) => new Paragraph({
            ...p,
            indent: { left: 720 },
            children: phrasingToRuns(child.type === 'paragraph' ? child.children : []),
          }))
        })
      case 'code':
        return [new Paragraph({
          children: [new TextRun({ text: node.value, font: 'Courier New', size: 20 })],
          spacing: { after: 200 },
        })]
      case 'list':
        return node.children.flatMap((item) => {
          return item.children.flatMap((child) => {
            if (child.type === 'paragraph') {
              return [new Paragraph({
                children: phrasingToRuns(child.children),
                numbering: node.ordered
                  ? { reference: 'ordered-list', level: 0 }
                  : { reference: 'bullet-list', level: 0 },
                spacing: { after: 100 },
              })]
            }
            return blockToDocx(child)
          })
        })
      case 'thematicBreak':
        return [new Paragraph({ children: [new TextRun({ text: '───────────' })] })]
      default:
        return []
    }
  }

  // Build document sections with page breaks
  const sectionChildren: InstanceType<typeof Paragraph>[] = []

  // Title page
  sectionChildren.push(new Paragraph({
    children: [new TextRun({ text: book.title, bold: true, size: 56 })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 4000, after: 800 },
  }))
  sectionChildren.push(new Paragraph({
    children: [new TextRun({ text: '', break: 1 })],
    pageBreakBefore: true,
  }))

  for (let i = 0; i < book.storylets.length; i++) {
    const doc = book.storylets[i]
    const depth = getDepth(doc, book.storylets)

    // Page break before top-level documents (not first)
    if (depth === 0 && i > 0) {
      sectionChildren.push(new Paragraph({
        children: [],
        pageBreakBefore: true,
      }))
    }

    // Storylet heading
    const level = Math.min(depth, 5)
    sectionChildren.push(new Paragraph({
      children: phrasingToRuns([{ type: 'text', value: doc.name }]),
      heading: headingLevels[level],
      spacing: { before: depth === 0 ? 600 : 400, after: 200 },
    }))

    // Storylet content
    if (doc.content) {
      const ctx = getCharacterMarkerContext(book, doc.id)
      const processed = processCharacterMarkers(doc.content, ctx, 'docx')
      sectionChildren.push(...astToDocxChildren(parseMarkdown(stripPasteArtifacts(processed))))
    }
  }

  const docxDoc = new DocxDocument({
    numbering: {
      config: [
        {
          reference: 'bullet-list',
          levels: [{ level: 0, format: LevelFormat.BULLET, text: '\u2022', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
        },
        {
          reference: 'ordered-list',
          levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
        },
      ],
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      headers: {
        default: {
          options: {
            children: [new Paragraph({
              children: [new TextRun({ text: book.title, italics: true, size: 18, color: '999999' })],
              alignment: AlignmentType.RIGHT,
            })],
          },
        },
      },
      children: sectionChildren,
    }],
  })

  const blob = await Packer.toBlob(docxDoc)
  download(blob, `${sanitizeFilename(book.title)}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
}

// ─── PDF Export (AST → pdfmake) ─────────────────────────

export async function exportAsPdf(book: Book): Promise<void> {
  type PdfValue = string | number | boolean | null | PdfObject | PdfValue[] | ((currentPage: number, pageCount?: number) => unknown)
  interface PdfObject { [key: string]: PdfValue }
  interface PdfMakeApi {
    vfs?: unknown
    createPdf: (definition: PdfObject) => { download: (filename: string) => void }
  }
  interface PdfFontsModule {
    pdfMake?: { vfs?: unknown }
    default?: { pdfMake?: { vfs?: unknown } }
  }

  const pdfMakeModule = await import('pdfmake/build/pdfmake') as unknown as (PdfMakeApi & { default?: PdfMakeApi })
  const pdfMake = pdfMakeModule.default || pdfMakeModule
  const pdfFonts = await import('pdfmake/build/vfs_fonts') as unknown as PdfFontsModule
  const vfs = pdfFonts?.pdfMake?.vfs ?? pdfFonts?.default?.pdfMake?.vfs ?? pdfFonts?.default
  if (vfs) pdfMake.vfs = vfs

  type PdfContent = PdfObject

  function phrasingToPdf(nodes: PhrasingContent[], style: PdfObject = {}): PdfContent[] {
    const result: PdfContent[] = []
    for (const n of nodes) {
      switch (n.type) {
        case 'text':
          result.push({ text: n.value, ...style })
          break
        case 'strong':
          result.push(...phrasingToPdf(n.children, { ...style, bold: true }))
          break
        case 'emphasis':
          result.push(...phrasingToPdf(n.children, { ...style, italics: true }))
          break
        case 'delete':
          result.push(...phrasingToPdf(n.children, { ...style, decoration: 'lineThrough' }))
          break
        case 'inlineCode':
          result.push({ text: n.value, font: 'Courier', fontSize: 10, background: '#f0f0f0', ...style })
          break
        default:
          if (hasPhrasingChildren(n)) result.push(...phrasingToPdf(n.children, style))
          else if (hasStringValue(n)) result.push({ text: n.value, ...style })
          break
      }
    }
    return result
  }

  function astToPdfContent(tree: Root): PdfContent[] {
    const content: PdfContent[] = []
    for (const node of tree.children) {
      content.push(...blockToPdf(node))
    }
    return content
  }

  function blockToPdf(node: Content): PdfContent[] {
    switch (node.type) {
      case 'heading': {
        const sizes = [24, 20, 16, 14, 13, 12]
        return [{
          text: phrasingToPdf(node.children),
          fontSize: sizes[Math.min(node.depth - 1, 5)],
          bold: true,
          margin: [0, node.depth <= 2 ? 20 : 10, 0, 6] as [number, number, number, number],
        }]
      }
      case 'paragraph':
        return [{ text: phrasingToPdf(node.children), margin: [0, 0, 0, 10] as [number, number, number, number] }]
      case 'blockquote': {
        const inner = node.children.flatMap((child) => blockToPdf(child))
        return [{
          stack: inner,
          margin: [20, 0, 0, 10] as [number, number, number, number],
          color: '#555555',
          italics: true,
        }]
      }
      case 'code':
        return [{
          text: node.value,
          font: 'Courier',
          fontSize: 10,
          background: '#f4f4f4',
          margin: [0, 4, 0, 10] as [number, number, number, number],
        }]
      case 'list': {
        const items = node.children.map((item) => {
          const texts = item.children.flatMap((child) => {
            if (child.type === 'paragraph') return [{ text: phrasingToPdf(child.children) }]
            return blockToPdf(child)
          })
          return texts.length === 1 ? texts[0] : { stack: texts }
        })
        return [node.ordered
          ? { ol: items, margin: [0, 0, 0, 10] as [number, number, number, number] }
          : { ul: items, margin: [0, 0, 0, 10] as [number, number, number, number] }
        ]
      }
      case 'thematicBreak':
        return [{ canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }], margin: [0, 10, 0, 10] as [number, number, number, number] }]
      default:
        return []
    }
  }

  // Build PDF content
  const content: PdfContent[] = []

  // Title page
  content.push({
    text: book.title,
    fontSize: 36,
    bold: true,
    alignment: 'center',
    margin: [0, 200, 0, 0] as [number, number, number, number],
  })
  content.push({ text: '', pageBreak: 'after' })

  // Table of contents
  content.push({
    text: 'Table of Contents',
    fontSize: 20,
    bold: true,
    margin: [0, 0, 0, 20] as [number, number, number, number],
  })
  for (const doc of book.storylets) {
    const depth = getDepth(doc, book.storylets)
    content.push({
      text: doc.name,
      margin: [depth * 20, 2, 0, 2] as [number, number, number, number],
      fontSize: depth === 0 ? 12 : 11,
      bold: depth === 0,
      color: '#333333',
    })
  }
  content.push({ text: '', pageBreak: 'after' })

  // Documents
  for (let i = 0; i < book.storylets.length; i++) {
    const doc = book.storylets[i]
    const depth = getDepth(doc, book.storylets)

    // Page break before top-level documents
    if (depth === 0 && i > 0) {
      content.push({ text: '', pageBreak: 'before' })
    }

    // Storylet heading
    const sizes = [24, 20, 16, 14]
    content.push({
      text: doc.name,
      fontSize: sizes[Math.min(depth, 3)],
      bold: true,
      margin: [0, depth === 0 ? 40 : 20, 0, 12] as [number, number, number, number],
    })

    // Storylet content
    if (doc.content) {
      const ctx = getCharacterMarkerContext(book, doc.id)
      const processed = processCharacterMarkers(doc.content, ctx, 'plain')
      content.push(...astToPdfContent(parseMarkdown(stripPasteArtifacts(processed))))
    }
  }

  const docDefinition = {
    content,
    defaultStyle: {
      font: 'Roboto',
      fontSize: 12,
      lineHeight: 1.6,
    },
    pageMargins: [72, 72, 72, 72] as [number, number, number, number],
    header: (currentPage: number) => {
      if (currentPage <= 2) return null // Skip title and TOC pages
      return {
        text: book.title,
        alignment: 'right' as const,
        margin: [0, 20, 40, 0] as [number, number, number, number],
        fontSize: 9,
        italics: true,
        color: '#999999',
      }
    },
    footer: (currentPage: number) => {
      if (currentPage <= 1) return null // Skip title page
      return {
        text: `${currentPage}`,
        alignment: 'center' as const,
        margin: [0, 0, 0, 20] as [number, number, number, number],
        fontSize: 9,
        color: '#999999',
      }
    },
  }

  pdfMake.createPdf(docDefinition).download(`${sanitizeFilename(book.title)}.pdf`)
}

// ─── EPUB Export (JSZip-based) ─────────────────────────

export async function exportAsEpub(book: Book): Promise<void> {
  const zip = new JSZip()

  // mimetype must be first file, uncompressed
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })

  // META-INF/container.xml
  zip.file('META-INF/container.xml', `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`)

  const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  /** Convert %%ALIGN:X%% markers to styled elements in XHTML output */
  function applyEpubAlignment(html: string): string {
    return html.replace(/(?:<p>)?%%ALIGN:(\w+)%%(?:<\/p>)?\s*(<[a-zA-Z][^>]*>)/g, (_m, align: string, tag: string) => {
      if (tag.includes('style="')) {
        return tag.replace('style="', `style="text-align: ${align}; `)
      }
      return tag.replace(/>$/, ` style="text-align: ${align};">`)
    })
  }

  function contentToXhtml(doc: Storylet): string {
    if (!doc.content) return ''
    const ctx = getCharacterMarkerContext(book, doc.id)
    const processed = processCharacterMarkers(doc.content, ctx, 'epub')
    const cleaned = preprocessForEpub(processed)
    const tree = parseMarkdown(cleaned)
    // Use standard HTML converters but escape any remaining html AST nodes
    // by temporarily replacing the html passthrough
    let html = tree.children.map((node) => {
      if (node.type === 'html') return `<p>${escapeHtml(node.value)}</p>`
      return blockToHtml(node)
    }).join('\n')
    // Make XHTML-safe: self-close void elements
    html = html.replace(/<br>/g, '<br/>').replace(/<hr>/g, '<hr/>')
    // Escape any < that isn't part of a valid XHTML tag or closing tag
    html = html.replace(/<(?!\/?(?:p|h[1-6]|strong|em|del|code|pre|ol|ul|li|blockquote|hr|br|div)\b[^>]*\/?>)/g, '&lt;')
    html = applyEpubAlignment(html)
    return html
  }

  // Group documents into chapters (top-level docs with their descendants)
  interface Chapter { id: string; title: string; xhtml: string }
  const chapters: Chapter[] = []

  for (let i = 0; i < book.storylets.length; i++) {
    const doc = book.storylets[i]
    const depth = getDepth(doc, book.storylets)
    const level = Math.min(depth + 2, 6)
    const heading = `<h${level}>${escapeHtml(doc.name)}</h${level}>`
    const body = contentToXhtml(doc)

    if (depth === 0) {
      chapters.push({ id: `chapter-${chapters.length}`, title: doc.name, xhtml: heading + '\n' + body })
    } else if (chapters.length > 0) {
      chapters[chapters.length - 1].xhtml += '\n' + heading + '\n' + body
    }
  }

  // Stylesheet
  const css = `body { max-width: 100%; margin: 1em; font-family: Georgia, serif; line-height: 1.8; color: #222; }
h1 { text-align: center; margin-bottom: 2em; }
h2 { margin-top: 2em; border-bottom: 1px solid #ddd; padding-bottom: 0.3em; }
h3, h4, h5, h6 { margin-top: 1.5em; }
code { background: #f4f4f4; padding: 0.15em 0.4em; font-size: 0.9em; }
pre { background: #f4f4f4; padding: 1em; overflow-x: auto; }
blockquote { border-left: 3px solid #ddd; margin-left: 0; padding-left: 1em; color: #555; }
del { color: #999; }`
  zip.file('OEBPS/style.css', css)

  // Title page
  const titleXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escXml(book.title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
<h1 style="margin-top: 40%; text-align: center;">${escapeHtml(book.title)}</h1>
</body>
</html>`
  zip.file('OEBPS/title.xhtml', titleXhtml)

  // Chapter files
  for (const ch of chapters) {
    const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escXml(ch.title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
${ch.xhtml}
</body>
</html>`
    zip.file(`OEBPS/${ch.id}.xhtml`, xhtml)
  }

  // EPUB3 Navigation document
  const navItems = chapters.map(ch => `    <li><a href="${ch.id}.xhtml">${escXml(ch.title)}</a></li>`).join('\n')
  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Table of Contents</title></head>
<body>
<nav epub:type="toc">
  <h1>Table of Contents</h1>
  <ol>
${navItems}
  </ol>
</nav>
</body>
</html>`
  zip.file('OEBPS/nav.xhtml', navXhtml)

  // NCX (EPUB2 compat)
  const bookId = `urn:writinator:${Date.now()}`
  const ncxPoints = chapters.map((ch, i) => `  <navPoint id="navpoint-${i}" playOrder="${i + 1}">
    <navLabel><text>${escXml(ch.title)}</text></navLabel>
    <content src="${ch.id}.xhtml"/>
  </navPoint>`).join('\n')
  const ncx = `<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head>
    <meta name="dtb:uid" content="${bookId}"/>
  </head>
  <docTitle><text>${escXml(book.title)}</text></docTitle>
  <navMap>
${ncxPoints}
  </navMap>
</ncx>`
  zip.file('OEBPS/toc.ncx', ncx)

  // content.opf (package document)
  const manifestItems = [
    `    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>`,
    `    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>`,
    `    <item id="style" href="style.css" media-type="text/css"/>`,
    `    <item id="title-page" href="title.xhtml" media-type="application/xhtml+xml"/>`,
    ...chapters.map(ch => `    <item id="${ch.id}" href="${ch.id}.xhtml" media-type="application/xhtml+xml"/>`),
  ].join('\n')
  const spineItems = [
    `    <itemref idref="title-page"/>`,
    ...chapters.map(ch => `    <itemref idref="${ch.id}"/>`),
  ].join('\n')
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="book-id">${bookId}</dc:identifier>
    <dc:title>${escXml(book.title)}</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
${manifestItems}
  </manifest>
  <spine toc="ncx">
${spineItems}
  </spine>
</package>`
  zip.file('OEBPS/content.opf', opf)

  const blob = await zip.generateAsync({ type: 'blob', mimeType: 'application/epub+zip' })
  download(blob, `${sanitizeFilename(book.title)}.epub`, 'application/epub+zip')
}

// ─── ZIP Export ────────────────────────────────────────

function formatStoryletContent(doc: Storylet, format: 'md' | 'txt' | 'html'): string {
  const content = doc.content || ''
  if (format === 'html') {
    return `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${escapeHtml(doc.name)}</title></head><body><h1>${escapeHtml(doc.name)}</h1><pre>${escapeHtml(content)}</pre></body></html>`
  }
  return content
}

export async function exportAsZip(book: Book, format: 'md' | 'txt' | 'html'): Promise<void> {
  const zip = new JSZip()
  const rootFolder = zip.folder(sanitizeFilename(book.title))!

  const ext = format === 'md' ? '.md' : format === 'txt' ? '.txt' : '.html'
  const zipFormat: StatblockExportFormat = format === 'md' ? 'markdown' : format === 'txt' ? 'plain' : 'html'

  function addStorylets(parentId: string | undefined, folder: JSZip) {
    const children = book.storylets.filter(d => d.parentId === parentId)
    const usedNames = new Map<string, number>()

    for (const doc of children) {
      let name = sanitizeFilename(doc.name)
      const count = usedNames.get(name) || 0
      usedNames.set(name, count + 1)
      if (count > 0) name = `${name} (${count + 1})`

      const ctx = getCharacterMarkerContext(book, doc.id)
      const processedDoc: Storylet = {
        ...doc,
        content: doc.content ? processCharacterMarkers(doc.content, ctx, zipFormat) : '',
      }
      const content = formatStoryletContent(processedDoc, format)
      folder.file(name + ext, content)

      const hasChildren = book.storylets.some(d => d.parentId === doc.id)
      if (hasChildren) {
        const subFolder = folder.folder(name)!
        addStorylets(doc.id, subFolder)
      }
    }
  }

  addStorylets(undefined, rootFolder)

  const blob = await zip.generateAsync({ type: 'blob' })
  download(blob, `${sanitizeFilename(book.title)}-${format}-export.zip`, 'application/zip')
}

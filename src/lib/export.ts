import type { Book, Document } from '../types'
import type { Root, Content, PhrasingContent } from 'mdast'
import JSZip from 'jszip'
import { parseMarkdown } from './ast'

// ─── Helpers ────────────────────────────────────────────

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9_\- ]/g, '').trim() || 'untitled'
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

function getDepth(document: Document, documents: Document[]): number {
  let depth = 0
  let current = document
  while (current.parentId) {
    depth++
    const parent = documents.find((doc) => doc.id === current.parentId)
    if (!parent) break
    current = parent
  }
  return depth
}

/** Get the full book as a single markdown string with document headings */
function bookToMarkdown(book: Book): string {
  const parts: string[] = [`# ${book.title}\n`]
  for (const doc of book.documents) {
    const depth = getDepth(doc, book.documents)
    const hashes = '#'.repeat(Math.min(depth + 2, 6))
    parts.push(`${hashes} ${doc.name}\n`)
    if (doc.content) {
      parts.push(doc.content)
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

// ─── Markdown Export ────────────────────────────────────

export function exportAsMarkdown(book: Book): void {
  download(bookToMarkdown(book), `${sanitizeFilename(book.title)}.md`, 'text/markdown')
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
  for (const doc of book.documents) {
    const depth = getDepth(doc, book.documents)
    const indent = '  '.repeat(depth)
    parts.push(`${indent}${doc.name}`)
    parts.push('')
    if (doc.content) {
      parts.push(astToPlainText(parseMarkdown(doc.content)))
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
      case 'break': return '<br>'
      default:
        if ('children' in n) return phrasingToHtml((n as any).children)
        if ('value' in n) return escapeHtml((n as any).value)
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
    case 'thematicBreak':
      return '<hr>'
    default:
      return ''
  }
}

export function exportAsHtml(book: Book): void {
  const body = book.documents
    .map((doc) => {
      const depth = getDepth(doc, book.documents)
      const level = Math.min(depth + 2, 6)
      const heading = `<h${level}>${escapeHtml(doc.name)}</h${level}>`
      const content = doc.content ? astToHtml(parseMarkdown(doc.content)) : ''
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
        if ('children' in n) return phrasingToRtf((n as any).children)
        if ('value' in n) return rtfEscape((n as any).value)
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

  for (const doc of book.documents) {
    const depth = getDepth(doc, book.documents)
    const sizes = [40, 32, 28, 26, 24]
    const size = sizes[Math.min(depth, 4)]
    // Page break before each top-level document (except first)
    if (book.documents.indexOf(doc) > 0 && depth === 0) {
      body += '\\page\n'
    }
    body += `{\\pard\\fs${size}\\b ${rtfEscape(doc.name)}\\b0\\par}\n\\par\n`
    if (doc.content) {
      body += astToRtf(parseMarkdown(doc.content)) + '\n\\par\n'
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
          if ('children' in n) runs.push(...phrasingToRuns((n as any).children, opts))
          else if ('value' in n) runs.push(new TextRun({ text: (n as any).value, ...opts }))
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

  for (let i = 0; i < book.documents.length; i++) {
    const doc = book.documents[i]
    const depth = getDepth(doc, book.documents)

    // Page break before top-level documents (not first)
    if (depth === 0 && i > 0) {
      sectionChildren.push(new Paragraph({
        children: [],
        pageBreakBefore: true,
      }))
    }

    // Document heading
    const level = Math.min(depth, 5)
    sectionChildren.push(new Paragraph({
      children: phrasingToRuns([{ type: 'text', value: doc.name }]),
      heading: headingLevels[level],
      spacing: { before: depth === 0 ? 600 : 400, after: 200 },
    }))

    // Document content
    if (doc.content) {
      sectionChildren.push(...astToDocxChildren(parseMarkdown(doc.content)))
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
  const pdfMakeModule = await import('pdfmake/build/pdfmake') as any
  const pdfMake = pdfMakeModule.default || pdfMakeModule
  const pdfFonts = await import('pdfmake/build/vfs_fonts') as any
  const vfs = pdfFonts?.pdfMake?.vfs ?? pdfFonts?.default?.pdfMake?.vfs ?? pdfFonts?.default
  if (vfs) pdfMake.vfs = vfs

  type PdfContent = any // pdfmake's Content type is complex, use any for the builder

  function phrasingToPdf(nodes: PhrasingContent[], style: Record<string, any> = {}): PdfContent[] {
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
          if ('children' in n) result.push(...phrasingToPdf((n as any).children, style))
          else if ('value' in n) result.push({ text: (n as any).value, ...style })
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
  for (const doc of book.documents) {
    const depth = getDepth(doc, book.documents)
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
  for (let i = 0; i < book.documents.length; i++) {
    const doc = book.documents[i]
    const depth = getDepth(doc, book.documents)

    // Page break before top-level documents
    if (depth === 0 && i > 0) {
      content.push({ text: '', pageBreak: 'before' })
    }

    // Document heading
    const sizes = [24, 20, 16, 14]
    content.push({
      text: doc.name,
      fontSize: sizes[Math.min(depth, 3)],
      bold: true,
      margin: [0, depth === 0 ? 40 : 20, 0, 12] as [number, number, number, number],
    })

    // Document content
    if (doc.content) {
      content.push(...astToPdfContent(parseMarkdown(doc.content)))
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
    header: (currentPage: number, _pageCount: number) => {
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
    footer: (currentPage: number, _pageCount: number) => {
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

// ─── ZIP Export ────────────────────────────────────────

function formatDocumentContent(doc: Document, format: 'md' | 'txt' | 'html'): string {
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

  function addDocuments(parentId: string | undefined, folder: JSZip) {
    const children = book.documents.filter(d => d.parentId === parentId)
    const usedNames = new Map<string, number>()

    for (const doc of children) {
      let name = sanitizeFilename(doc.name)
      const count = usedNames.get(name) || 0
      usedNames.set(name, count + 1)
      if (count > 0) name = `${name} (${count + 1})`

      const content = formatDocumentContent(doc, format)
      folder.file(name + ext, content)

      const hasChildren = book.documents.some(d => d.parentId === doc.id)
      if (hasChildren) {
        const subFolder = folder.folder(name)!
        addDocuments(doc.id, subFolder)
      }
    }
  }

  addDocuments(undefined, rootFolder)

  const blob = await zip.generateAsync({ type: 'blob' })
  download(blob, `${sanitizeFilename(book.title)}-${format}-export.zip`, 'application/zip')
}

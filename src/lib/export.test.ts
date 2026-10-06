import { beforeEach, describe, expect, it } from 'vitest'
import JSZip from 'jszip'
import { Packer } from 'docx'
import {
  buildDocx,
  buildPdfDefinition,
  buildPlainText,
  buildRtf,
  renderStoryletForZip,
  storyletToEpubXhtml,
  type PdfObject,
} from './export'
import { renderStoryletAsHtml } from './render'
import type { Book } from '../types'
import { makeBook, makeCharacter, makeStorylet, seedCharacters, seedStore } from '../test/fixtures'

const CONTENT = [
  '{align:center} Chapter One',
  '',
  'A paragraph with <span class="Big">styled</span> words.',
  '',
  '{group:center}',
  'Line one',
  'Line two',
  '{/group}',
  '',
  'First line',
  'Second line',
  '',
  '<!-- statblock:hero -->',
].join('\n')

let book: Book

beforeEach(() => {
  book = makeBook([makeStorylet('ch1', CONTENT, { name: 'Opening' })])
  seedStore(book, 'ch1')
  const hero = makeCharacter('hero', [{ id: 'hp', name: 'HP', type: 'numberWithMax' }], {
    hp: { kind: 'numberWithMax', value: 7, max: 10 },
  })
  seedCharacters([hero], {})
})

/** Assertions every format must pass: nothing lost, no markup leaking. */
function expectCleanText(text: string): void {
  expect(text).toContain('Chapter One')
  expect(text).toContain('styled')
  expect(text).toContain('Line one')
  expect(text).toContain('Line two')
  expect(text).toContain('First line')
  expect(text).toContain('Second line')
  expect(text).toContain('hero — Status')
  expect(text).not.toMatch(/<\/?span/)
  expect(text).not.toContain('{group')
  expect(text).not.toContain('{/group}')
  expect(text).not.toContain('{align')
  expect(text).not.toContain('<!--')
}

describe('plain text export', () => {
  it('keeps every line and leaks no markup', () => {
    const txt = buildPlainText(book)
    expectCleanText(txt)
    expect(txt).not.toMatch(/First line\s?Second line/)
  })
})

describe('RTF export', () => {
  it('keeps every line, centres aligned paragraphs, leaks no markup', () => {
    const rtf = buildRtf(book)
    // RTF stores non-ASCII as \uN? escapes.
    expectCleanText(rtf.replace(/\\u(-?\d+)\?/g, (_m, n: string) => String.fromCharCode(Number(n))))
    expect(rtf).toMatch(/\\qc[^}]*Chapter One/)
    expect(rtf).toMatch(/Line one\\line\s?Line two/)
    expect(rtf).toMatch(/Status\}?\s*\\line\s?HP: 7\/10/)
    expect(rtf).not.toMatch(/First line\s?Second line/)
  })
})

describe('DOCX export', () => {
  async function paragraphs(): Promise<Array<{ xml: string; text: string }>> {
    const buffer = await Packer.toBuffer(await buildDocx(book))
    const zip = await JSZip.loadAsync(buffer)
    const xml = await zip.file('word/document.xml')!.async('string')
    return xml.split(/<w:p[ >]/).slice(1).map((p) => ({
      xml: p,
      text: [...p.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].map((m) => m[1]).join(''),
    }))
  }

  it('keeps every line, centres aligned paragraphs, leaks no markup', async () => {
    const paras = await paragraphs()
    const allText = paras.map((p) => p.text).join('\n').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    expectCleanText(allText)
    const title = paras.find((p) => p.text.includes('Chapter One'))
    expect(title?.xml).toContain('<w:jc w:val="center"/>')
    const group = paras.find((p) => p.text.includes('Line one'))
    expect(group?.text).toContain('Line two')
    expect(group?.xml).toContain('<w:br/>')
    expect(paras.some((p) => p.text.includes('First line') && p.text.includes('Second line'))).toBe(false)
    const statblock = paras.find((p) => p.text.includes('hero — Status'))
    expect(statblock?.xml).toMatch(/Status<\/w:t>.*<w:br\/>.*HP: 7\/10/)
  })
})

describe('PDF export', () => {
  function textOf(node: unknown): string {
    if (typeof node === 'string') return node
    if (Array.isArray(node)) return node.map(textOf).join('')
    if (node && typeof node === 'object') {
      const obj = node as PdfObject
      return ['text', 'stack', 'ul', 'ol'].map((k) => (k in obj ? textOf(obj[k]) : '')).join('')
    }
    return ''
  }

  it('keeps every line, centres aligned paragraphs, leaks no markup', () => {
    const def = buildPdfDefinition(book)
    const blocks = def.content as PdfObject[]
    expectCleanText(blocks.map(textOf).join('\n'))
    const title = blocks.find((b) => textOf(b) === 'Chapter One')
    expect(title?.alignment).toBe('center')
    expect(blocks.some((b) => textOf(b).includes('First line') && textOf(b).includes('Second line'))).toBe(false)
  })
})

describe('HTML export', () => {
  it('wraps aligned lines in an aligned paragraph', () => {
    const html = renderStoryletAsHtml(book.storylets[0], book)
    expect(html).toMatch(/<p style="text-align: center;">Chapter One<\/p>/)
    expect(html).not.toContain('{align')
    expect(html).not.toContain('<!--align')
    expect(html).not.toContain('{group')
  })

  it('zipped HTML export handles groups too', () => {
    const html = renderStoryletForZip(book.storylets[0], book, 'html', '')
    expect(html).not.toContain('{group')
    expect(html).toMatch(/<p style="text-align: center;">Chapter One<\/p>/)
  })
})

describe('EPUB export', () => {
  it('keeps every line, aligns paragraphs, leaks no editor markup', () => {
    const xhtml = storyletToEpubXhtml(book.storylets[0], book)
    const text = xhtml.replace(/<[^>]+>/g, '')
    expect(xhtml).toMatch(/<p style="text-align: center;">Chapter One<\/p>/)
    expect(text).toContain('styled')
    expect(xhtml).toMatch(/Line one<br\/>Line two/)
    expect(xhtml).not.toMatch(/First line\s?Second line/)
    expect(text).toContain('hero — Status')
    expect(xhtml).not.toContain('{group')
    expect(xhtml).not.toContain('{align')
    expect(xhtml).not.toContain('%%')
    expect(xhtml).not.toContain('&lt;')
  })
})

describe('RTF export of non-Latin text', () => {
  it('writes characters above U+7FFF as signed 16-bit values and emoji as surrogate pairs', () => {
    const rtf = buildRtf(makeBook([makeStorylet('ch1', '漢 😀', { name: 'Ch' })]))
    // 漢 is U+6F22 (28450); 😀 is U+1F600 → surrogates D83D DE00.
    expect(rtf).toContain('\\u28450?')
    expect(rtf).toContain('\\u-10179?\\u-8704?')
    const decoded = rtf.replace(/\\u(-?\d+)\?/g, (_m, n: string) => String.fromCharCode(Number(n)))
    expect(decoded).toContain('漢 😀')
    // U+FF01 (fullwidth !) is above U+7FFF.
    expect(buildRtf(makeBook([makeStorylet('ch1', '！', { name: 'Ch' })]))).toContain('\\u-255?')
  })
})

describe('DOCX export of block quotes', () => {
  it('keeps lists and nested quotes inside a quote', async () => {
    const quoted = ['> Intro line', '>', '> - first item', '> - second item', '>', '> > nested quote'].join('\n')
    const buffer = await Packer.toBuffer(await buildDocx(makeBook([makeStorylet('ch1', quoted, { name: 'Ch' })])))
    const zip = await JSZip.loadAsync(buffer)
    const xml = await zip.file('word/document.xml')!.async('string')
    expect(xml).toContain('Intro line')
    expect(xml).toContain('first item')
    expect(xml).toContain('second item')
    expect(xml).toContain('nested quote')
  })
})

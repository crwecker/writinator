import { describe, expect, it } from 'vitest'
import { htmlToMarkdown } from './richPaste'

function md(html: string): string {
  return htmlToMarkdown(html).markdown
}

describe('rich paste style placeholders', () => {
  it('a styled span containing <br> becomes one span per line, with no placeholder text', () => {
    const out = md('<p><span style="color: #ff0000">line one<br>line two</span></p>')
    expect(out).not.toContain('%%')
    const lines = out.split('\n')
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatch(/^<span style="color: #ff0000">line one\s*<\/span>\s*$/)
    expect(lines[1]).toBe('<span style="color: #ff0000">line two</span>')
  })

  it('nested styled spans keep both styles and leave no placeholder text', () => {
    const out = md(
      '<p><span style="color: #ff0000">outer <span style="color: #0000ff">inner</span> tail</span></p>',
    )
    expect(out).toBe(
      '<span style="color: #ff0000">outer <span style="color: #0000ff">inner</span> tail</span>',
    )
  })

  it('a monospace span inside a styled span nests correctly', () => {
    const out = md(
      '<p><span style="color: #ff0000">a <span style="font-family: Courier">code</span> b</span></p>',
    )
    expect(out).toBe(
      `<span style="color: #ff0000">a <span style="font-family: 'JetBrains Mono', monospace">code</span> b</span>`,
    )
  })

  it('a style value containing % (hsl color) is preserved', () => {
    const out = md('<p><span style="color: hsl(0, 100%, 50%)">red</span></p>')
    expect(out).toBe('<span style="color: hsl(0, 100%, 50%)">red</span>')
  })

  it('plain styled spans still convert as before', () => {
    expect(md('<p>Hi <span style="color: #ff0000">there</span>!</p>')).toBe(
      'Hi <span style="color: #ff0000">there</span>!',
    )
  })
})

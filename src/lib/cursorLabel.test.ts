import { describe, expect, it } from 'vitest'
import { describeCursorPosition } from './cursorLabel'

describe('describeCursorPosition', () => {
  it('quotes the ~30 characters before the cursor, cut at a word', () => {
    const text = 'The ogre swung its club and Kael staggered back. More text.'
    const offset = text.indexOf('. More')
    expect(describeCursorPosition('Chapter 3', text, offset)).toBe('At cursor · Chapter 3, after “…its club and Kael staggered back”')
  })

  it('quotes short text whole', () => {
    expect(describeCursorPosition('One', 'He fell.', 7)).toBe('At cursor · One, after “He fell”')
  })

  it('strips marker comments, markdown and directives', () => {
    const text = '# Title\n\n**Kael** <!-- stat:abc --> _fell_ {align:center}'
    expect(describeCursorPosition('One', text, text.length)).toBe('At cursor · One, after “Title Kael fell”')
  })

  it('says "at the start" with nothing before the cursor', () => {
    expect(describeCursorPosition('One', '<!-- stat:abc -->Hi', 0)).toBe('At cursor · One, at the start')
    expect(describeCursorPosition('One', '<!-- stat:abc -->Hi', 17)).toBe('At cursor · One, at the start')
  })

  it('ignores a comment cut off at the start of the text window', () => {
    expect(describeCursorPosition('One', 'stat:abc --> He fell', 20)).toBe('At cursor · One, after “He fell”')
  })
})

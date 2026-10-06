import type { NamedStyle } from '../types'

/**
 * Convert a NamedStyle to a CSS declaration list (no braces, no trailing `;`),
 * e.g. `font-family: Lora; font-size: 18px`. Returns '' for an empty style.
 *
 * The exact output matters: the bubble toolbar writes it into the document as
 * `<span style="…">`, and "save as named style" matches those spans
 * byte-for-byte, so keep the property order and separators stable.
 */
export function namedStyleToCss(style: NamedStyle): string {
  const props: string[] = []
  if (style.fontFamily) props.push(`font-family: ${style.fontFamily}`)
  if (style.fontSize) props.push(`font-size: ${style.fontSize}px`)
  if (style.lineHeight) props.push(`line-height: ${style.lineHeight}`)
  if (style.color) props.push(`color: ${style.color}`)
  if (style.letterSpacing) props.push(`letter-spacing: ${style.letterSpacing}`)
  if (style.fontWeight) props.push(`font-weight: ${style.fontWeight}`)
  if (style.fontStyle) props.push(`font-style: ${style.fontStyle}`)
  if (style.textDecoration) props.push(`text-decoration: ${style.textDecoration}`)
  if (style.backgroundColor) props.push(`background-color: ${style.backgroundColor}`)
  return props.join('; ')
}

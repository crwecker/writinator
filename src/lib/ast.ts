/**
 * Shared Markdown → AST parser.
 * All export formats consume the same mdast tree.
 */
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import type { Root } from 'mdast'

const parser = unified().use(remarkParse).use(remarkGfm)

export function parseMarkdown(markdown: string): Root {
  return parser.parse(markdown)
}

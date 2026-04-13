import DiffMatchPatch from 'diff-match-patch'

export type DiffOp = 'equal' | 'insert' | 'delete'

export interface DiffSegment {
  op: DiffOp
  text: string
}

export interface LineDiffRow {
  op: DiffOp
  text: string
  oldLineNumber?: number
  newLineNumber?: number
}

const DIFF_DELETE = -1
const DIFF_INSERT = 1
const DIFF_EQUAL = 0

function opFromCode(code: number): DiffOp {
  if (code === DIFF_INSERT) return 'insert'
  if (code === DIFF_DELETE) return 'delete'
  if (code === DIFF_EQUAL) return 'equal'
  throw new Error(`Unknown DMP op code: ${code}`)
}

/** Word/char-level diff with semantic cleanup. Good for prose. */
export function computeDiff(oldText: string, newText: string): DiffSegment[] {
  const dmp = new DiffMatchPatch()
  const diffs = dmp.diff_main(oldText, newText)
  dmp.diff_cleanupSemantic(diffs)
  return diffs.map(([code, text]) => ({ op: opFromCode(code), text }))
}

/** Line-level diff. Good for side-by-side or unified line rendering. */
export function computeLineDiff(oldText: string, newText: string): LineDiffRow[] {
  const dmp = new DiffMatchPatch()
  const { chars1, chars2, lineArray } = dmp.diff_linesToChars_(oldText, newText)
  const diffs = dmp.diff_main(chars1, chars2, false)
  dmp.diff_charsToLines_(diffs, lineArray)

  const rows: LineDiffRow[] = []
  let oldLine = 1
  let newLine = 1

  for (const [code, block] of diffs) {
    const op = opFromCode(code)
    const lines = block.endsWith('\n') ? block.slice(0, -1).split('\n') : block.split('\n')

    for (const text of lines) {
      if (op === 'equal') {
        rows.push({ op, text, oldLineNumber: oldLine++, newLineNumber: newLine++ })
      } else if (op === 'delete') {
        rows.push({ op, text, oldLineNumber: oldLine++ })
      } else {
        rows.push({ op, text, newLineNumber: newLine++ })
      }
    }
  }

  return rows
}

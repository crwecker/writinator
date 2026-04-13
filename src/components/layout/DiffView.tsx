import { useMemo } from 'react'
import { computeDiff } from '../../lib/diff'

interface DiffViewProps {
  oldText: string
  newText: string
}

export function DiffView({ oldText, newText }: DiffViewProps) {
  const segments = useMemo(() => computeDiff(oldText, newText), [oldText, newText])

  if (oldText === newText) {
    return (
      <p className="text-sm text-gray-500 italic">No changes.</p>
    )
  }

  return (
    <div className="whitespace-pre-wrap break-words text-sm leading-relaxed font-[inherit]">
      {segments.map((seg, i) => {
        if (seg.op === 'equal') {
          return (
            <span key={i} className="text-gray-300">
              {seg.text}
            </span>
          )
        }
        if (seg.op === 'insert') {
          return (
            <span key={i} className="bg-emerald-900/40 text-emerald-200">
              {seg.text}
            </span>
          )
        }
        // delete
        return (
          <span key={i} className="bg-red-900/40 text-red-200 line-through">
            {seg.text}
          </span>
        )
      })}
    </div>
  )
}

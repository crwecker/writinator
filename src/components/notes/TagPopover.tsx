import { useEffect, useRef } from 'react'
import { TagChipInput } from './TagChipInput'

interface Props {
  open: boolean
  onClose: () => void
  tags: string[]
  onChange: (tags: string[]) => void
  anchorRect: { top: number; left: number }
}

/**
 * Tiny popover wrapping `TagChipInput`. Used to edit a note's tags from a
 * dropdown trigger so the chip row no longer takes vertical space inline.
 */
export function TagPopover({
  open,
  onClose,
  tags,
  onChange,
  anchorRect,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const t = setTimeout(
      () => document.addEventListener('mousedown', onDown),
      0,
    )
    return () => {
      clearTimeout(t)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, onClose])

  if (!open) return null

  const width = 220
  const maxHeight = 160
  let top = anchorRect.top
  let left = anchorRect.left
  if (left + width > window.innerWidth - 8) left = window.innerWidth - width - 8
  if (top + maxHeight > window.innerHeight - 8)
    top = window.innerHeight - maxHeight - 8
  if (left < 8) left = 8
  if (top < 8) top = 8

  return (
    <div
      ref={ref}
      data-testid="note-tag-popover"
      className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-2"
      style={{ top, left, width }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
        Tags
      </div>
      <TagChipInput
        tags={tags}
        onChange={onChange}
        placeholder="Add tag…"
        size="sm"
      />
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { useEditorStore } from '../../stores/editorStore'

interface Props {
  open: boolean
  onClose: () => void
  currentColor?: string
  onSelect: (color: string | undefined) => void
  anchorRect: { top: number; left: number }
}

const PRESET_COLORS = [
  '#f87171', // red-400
  '#fb923c', // orange-400
  '#fbbf24', // amber-400
  '#facc15', // yellow-400
  '#a3e635', // lime-400
  '#4ade80', // green-400
  '#34d399', // emerald-400
  '#22d3ee', // cyan-400
  '#60a5fa', // blue-400
  '#818cf8', // indigo-400
  '#c084fc', // purple-400
  '#f472b6', // pink-400
]

/**
 * Small popover with preset palette + recentColors strip. Not an icon picker.
 * Calls `useEditorStore.pushRecentColor` whenever a color is selected so the
 * MRU list stays fresh across the app.
 */
export function ColorPickerPopover({
  open,
  onClose,
  currentColor,
  onSelect,
  anchorRect,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const recentColors = useEditorStore((s) => s.recentColors)
  const pushRecentColor = useEditorStore((s) => s.pushRecentColor)

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

  function handleSelect(color: string | undefined) {
    if (color) pushRecentColor(color)
    onSelect(color)
    onClose()
  }

  // Clamp to viewport.
  const width = 200
  const maxHeight = 220
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
      data-testid="note-color-popover"
      className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-2"
      style={{ top, left, width }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
        Preset
      </div>
      <div className="grid grid-cols-6 gap-1.5 mb-2">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            data-testid="note-color-swatch"
            data-color={color}
            className={`w-6 h-6 rounded transition-transform hover:scale-110 ${
              currentColor === color ? 'ring-2 ring-white' : ''
            }`}
            style={{ backgroundColor: color }}
            title={color}
            onClick={() => handleSelect(color)}
          />
        ))}
      </div>

      {recentColors.length > 0 && (
        <>
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">
            Recent
          </div>
          <div className="flex flex-wrap gap-1.5 mb-2">
            {recentColors.map((color) => (
              <button
                key={color}
                className={`w-5 h-5 rounded transition-transform hover:scale-110 ${
                  currentColor === color ? 'ring-2 ring-white' : ''
                }`}
                style={{ backgroundColor: color }}
                title={color}
                onClick={() => handleSelect(color)}
              />
            ))}
          </div>
        </>
      )}

      <button
        className="text-[11px] text-gray-400 hover:text-white px-1"
        onClick={() => handleSelect(undefined)}
      >
        Remove color
      </button>
    </div>
  )
}

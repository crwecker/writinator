import { useState, useEffect, useRef } from 'react'

interface ColorPickerProps {
  open: boolean
  onClose: () => void
  onSelect: (color: string | undefined) => void
  anchorRect: { top: number; left: number }
  currentColor?: string
}

const PRESET_COLORS = [
  '#ff8484', '#ffb86c', '#f1fa8c', '#50fa7b',
  '#8be9fd', '#6272a4', '#bd93f9', '#ff79c6',
  '#96c0b7', '#fad4c0', '#9d9b9a', '#e6e6e6',
]

const HEX_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export function ColorPicker({ open, onClose, onSelect, anchorRect, currentColor }: ColorPickerProps) {
  if (!open) return null

  return (
    <ColorPickerInner
      onClose={onClose}
      onSelect={onSelect}
      anchorRect={anchorRect}
      currentColor={currentColor}
    />
  )
}

function ColorPickerInner({
  onClose,
  onSelect,
  anchorRect,
  currentColor,
}: Omit<ColorPickerProps, 'open'>) {
  const [hexInput, setHexInput] = useState(currentColor ?? '')
  const ref = useRef<HTMLDivElement>(null)

  // Close on click outside
  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [onClose])

  // Compute position, keeping within viewport
  const pickerWidth = 200
  const pickerMaxHeight = 260
  let top = anchorRect.top
  let left = anchorRect.left

  if (left + pickerWidth > window.innerWidth - 8) {
    left = window.innerWidth - pickerWidth - 8
  }
  if (top + pickerMaxHeight > window.innerHeight - 8) {
    top = window.innerHeight - pickerMaxHeight - 8
  }
  if (left < 8) left = 8
  if (top < 8) top = 8

  function handleSelect(color: string | undefined) {
    onSelect(color)
    onClose()
  }

  function applyHexInput() {
    const value = hexInput.startsWith('#') ? hexInput : `#${hexInput}`
    if (HEX_REGEX.test(value)) {
      handleSelect(value)
    }
  }

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-3"
      style={{ top, left, width: pickerWidth }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Preset color grid */}
      <div className="grid grid-cols-4 gap-2 mb-3">
        {PRESET_COLORS.map((color) => (
          <button
            key={color}
            className={`w-6 h-6 rounded-full transition-transform hover:scale-110 ${
              currentColor === color ? 'ring-2 ring-white' : ''
            }`}
            style={{ backgroundColor: color }}
            title={color}
            onClick={() => handleSelect(color)}
          />
        ))}
      </div>

      {/* Hex input */}
      <div className="flex items-center gap-2 mb-2">
        {hexInput && HEX_REGEX.test(hexInput.startsWith('#') ? hexInput : `#${hexInput}`) && (
          <span
            className="shrink-0 w-5 h-5 rounded border border-gray-600"
            style={{ backgroundColor: hexInput.startsWith('#') ? hexInput : `#${hexInput}` }}
          />
        )}
        <input
          className="flex-1 bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200 placeholder-gray-500 outline-none focus:border-blue-400 min-w-0"
          placeholder="#hex"
          value={hexInput}
          onChange={(e) => setHexInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') applyHexInput()
          }}
          onBlur={applyHexInput}
        />
      </div>

      {/* Remove color button */}
      <button
        className="text-xs text-gray-400 hover:text-white px-1"
        onClick={() => handleSelect(undefined)}
      >
        Remove color
      </button>
    </div>
  )
}

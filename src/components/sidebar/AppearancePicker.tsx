import { createElement, useState, useEffect, useRef, useMemo } from 'react'
import { ICON_CATALOG, getIconComponent } from '../../lib/icons'

interface AppearancePickerProps {
  open: boolean
  onClose: () => void
  onSelectIcon: (iconName: string | undefined) => void
  onSelectColor: (color: string | undefined) => void
  anchorRect: { top: number; left: number }
  currentColor?: string
}

const PRESET_COLORS = [
  '#ff8484', '#ffb86c', '#f1fa8c', '#50fa7b',
  '#8be9fd', '#6272a4', '#bd93f9', '#ff79c6',
  '#96c0b7', '#fad4c0', '#9d9b9a', '#e6e6e6',
]

const HEX_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

export function AppearancePicker({ open, onClose, onSelectIcon, onSelectColor, anchorRect, currentColor }: AppearancePickerProps) {
  if (!open) return null

  return (
    <AppearancePickerInner
      onClose={onClose}
      onSelectIcon={onSelectIcon}
      onSelectColor={onSelectColor}
      anchorRect={anchorRect}
      currentColor={currentColor}
    />
  )
}

function AppearancePickerInner({
  onClose,
  onSelectIcon,
  onSelectColor,
  anchorRect,
  currentColor,
}: Omit<AppearancePickerProps, 'open'>) {
  const [search, setSearch] = useState('')
  const [hexInput, setHexInput] = useState(currentColor ?? '')
  const ref = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

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

  // Focus search on open
  useEffect(() => {
    requestAnimationFrame(() => {
      searchInputRef.current?.focus()
    })
  }, [])

  // Filter and group icons by category
  const grouped = useMemo(() => {
    const query = search.toLowerCase()
    const filtered = query
      ? ICON_CATALOG.filter((icon) => icon.name.toLowerCase().includes(query))
      : ICON_CATALOG

    const groups = new Map<string, typeof filtered>()
    for (const icon of filtered) {
      const existing = groups.get(icon.category)
      if (existing) {
        existing.push(icon)
      } else {
        groups.set(icon.category, [icon])
      }
    }
    return groups
  }, [search])

  // Compute position, keeping within viewport
  const pickerWidth = 380
  const pickerMaxHeight = 420
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

  function handleSelectIcon(iconName: string | undefined) {
    onSelectIcon(iconName)
    onClose()
  }

  function handleSelectColor(color: string | undefined) {
    onSelectColor(color)
    onClose()
  }

  function applyHexInput() {
    const value = hexInput.startsWith('#') ? hexInput : `#${hexInput}`
    if (HEX_REGEX.test(value)) {
      handleSelectColor(value)
    }
  }

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl"
      style={{ top, left, width: pickerWidth }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex">
        {/* Icon side */}
        <div className="flex-1 p-2 min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 px-1 mb-1">Icon</div>

          {/* Search input */}
          <input
            ref={searchInputRef}
            className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200 placeholder-gray-500 w-full outline-none focus:border-blue-400 mb-2"
            placeholder="Search icons..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {/* Remove icon button */}
          <button
            className="text-xs text-gray-400 hover:text-white mb-2 px-1"
            onClick={() => handleSelectIcon(undefined)}
          >
            Remove icon
          </button>

          {/* Categorized icon grid */}
          <div className="max-h-[300px] overflow-y-auto">
            {grouped.size === 0 && (
              <p className="text-xs text-gray-500 text-center py-4">No icons found</p>
            )}
            {Array.from(grouped.entries()).map(([category, icons]) => (
              <div key={category} className="mb-2">
                <div className="text-[10px] uppercase tracking-wider text-gray-500 px-1 mb-1">
                  {category}
                </div>
                <div className="grid grid-cols-6 gap-0.5">
                  {icons.map((icon) => (
                    <button
                      key={icon.name}
                      className="w-8 h-8 flex items-center justify-center rounded text-gray-400 hover:text-white hover:bg-gray-700"
                      title={icon.name}
                      onClick={() => handleSelectIcon(icon.name)}
                    >
                      {createElement(getIconComponent(icon.name), { size: 18 })}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div className="w-px bg-gray-700 shrink-0" />

        {/* Color side */}
        <div className="w-[120px] shrink-0 p-2">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 px-1 mb-1">Color</div>

          {/* Preset color grid */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            {PRESET_COLORS.map((color) => (
              <button
                key={color}
                className={`w-6 h-6 rounded-full transition-transform hover:scale-110 mx-auto ${
                  currentColor === color ? 'ring-2 ring-white' : ''
                }`}
                style={{ backgroundColor: color }}
                title={color}
                onClick={() => handleSelectColor(color)}
              />
            ))}
          </div>

          {/* Hex input */}
          <div className="flex items-center gap-1.5 mb-2">
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
            onClick={() => handleSelectColor(undefined)}
          >
            Remove color
          </button>
        </div>
      </div>
    </div>
  )
}

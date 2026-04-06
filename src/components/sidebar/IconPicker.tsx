import { createElement, useState, useEffect, useRef, useMemo } from 'react'
import { ICON_CATALOG, getIconComponent } from '../../lib/icons'

interface IconPickerProps {
  open: boolean
  onClose: () => void
  onSelect: (iconName: string | undefined) => void
  anchorRect: { top: number; left: number }
}

export function IconPicker({ open, onClose, onSelect, anchorRect }: IconPickerProps) {
  const [search, setSearch] = useState('')
  const ref = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    function handleMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open, onClose])

  // Focus search on open
  useEffect(() => {
    if (open) {
      setSearch('')
      // Small delay to ensure DOM is rendered
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

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

  if (!open) return null

  // Compute position, keeping within viewport
  const pickerWidth = 240
  const pickerMaxHeight = 380
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

  function handleSelect(iconName: string | undefined) {
    onSelect(iconName)
    onClose()
  }

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-gray-800 border border-gray-700 rounded-lg shadow-xl p-2"
      style={{ top, left, width: pickerWidth }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Search input */}
      <input
        ref={inputRef}
        className="bg-gray-900 border border-gray-600 rounded px-2 py-1 text-sm text-gray-200 placeholder-gray-500 w-full outline-none focus:border-blue-400 mb-2"
        placeholder="Search icons..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {/* Remove icon button */}
      <button
        className="text-xs text-gray-400 hover:text-white mb-2 px-1"
        onClick={() => handleSelect(undefined)}
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
                    onClick={() => handleSelect(icon.name)}
                  >
                    {createElement(getIconComponent(icon.name), { size: 18 })}
                  </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

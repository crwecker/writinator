import { createElement, useState, useRef, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { ChevronRight, MoreHorizontal, Plus } from 'lucide-react'
import { getIconComponent } from '../../lib/icons'
import { AppearancePicker } from './AppearancePicker'
import { useStoryletStore } from '../../stores/storyletStore'
import type { Storylet } from '../../types'

export type DropIndicator = 'insert-before' | 'insert-after' | 'reparent' | 'invalid' | null

interface TreeNodeProps {
  storylet: Storylet
  depth: number
  isActive: boolean
  hasChildren: boolean
  isCollapsed: boolean
  isDragSource: boolean
  dropIndicator: DropIndicator
  onToggleCollapse: () => void
  onClick: () => void
  onRename: (name: string) => void
  onDelete: () => void
  onAddSubStorylet: () => void
  isDeletable: boolean
  autoEdit?: boolean
  onAutoEditConsumed?: () => void
}

export function TreeNode({
  storylet,
  depth,
  isActive,
  hasChildren,
  isCollapsed,
  isDragSource,
  dropIndicator,
  onToggleCollapse,
  onClick,
  onRename,
  onDelete,
  onAddSubStorylet,
  isDeletable,
  autoEdit,
  onAutoEditConsumed,
}: TreeNodeProps) {
  const [isEditing, setIsEditing] = useState(autoEdit ?? false)
  const [editValue, setEditValue] = useState(storylet.name)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })
  const [showAppearancePicker, setShowAppearancePicker] = useState(false)
  const [appearancePickerRect, setAppearancePickerRect] = useState({ top: 0, left: 0 })
  const inputRef = useRef<HTMLInputElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useSortable({ id: storylet.id })

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  useEffect(() => {
    if (autoEdit) {
      onAutoEditConsumed?.()
    }
  }, [autoEdit, onAutoEditConsumed])

  useEffect(() => {
    if (!showContextMenu) return
    function handleClickOutside(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setShowContextMenu(false)
        setShowDeleteConfirm(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showContextMenu])

  function startEditing() {
    setEditValue(storylet.name)
    setIsEditing(true)
    setShowContextMenu(false)
  }

  function commitRename() {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== storylet.name) {
      onRename(trimmed)
    }
    setIsEditing(false)
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    setContextMenuPos({ x: e.clientX, y: e.clientY })
    setShowDeleteConfirm(false)
    setShowContextMenu(true)
  }

  function openContextMenuFromButton(e: React.MouseEvent) {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setContextMenuPos({ x: rect.left, y: rect.bottom + 2 })
    setShowDeleteConfirm(false)
    setShowContextMenu(true)
  }

  function handleDuplicate() {
    useStoryletStore.getState().duplicateStorylet(storylet.id)
    setShowContextMenu(false)
  }

  function getDescendantCount(): number {
    const book = useStoryletStore.getState().book
    if (!book) return 0
    const ids = new Set<string>([storylet.id])
    let changed = true
    while (changed) {
      changed = false
      for (const d of book.storylets ?? []) {
        if (d.parentId && ids.has(d.parentId) && !ids.has(d.id)) {
          ids.add(d.id)
          changed = true
        }
      }
    }
    return ids.size - 1
  }

  function openAppearancePicker(rect: { top: number; left: number }) {
    setAppearancePickerRect(rect)
    setShowAppearancePicker(true)
    setShowContextMenu(false)
  }

  function openAppearanceFromIconButton(e: React.MouseEvent) {
    e.stopPropagation()
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
    openAppearancePicker({ top: r.bottom + 4, left: r.left })
  }

  function handleIconSelect(iconName: string | undefined) {
    useStoryletStore.getState().setStoryletIcon(storylet.id, iconName)
    setShowAppearancePicker(false)
  }

  function handleColorSelect(color: string | undefined) {
    useStoryletStore.getState().setStoryletColor(storylet.id, color)
    setShowAppearancePicker(false)
  }

  const indicatorColor = dropIndicator === 'invalid' ? 'bg-red-500' : 'bg-blue-400'

  return (
    <div className="relative" ref={setNodeRef}>
      {/* Insert-before indicator line */}
      {dropIndicator === 'insert-before' && (
        <div
          className="absolute top-0 right-1 h-0.5 bg-blue-400 z-10 pointer-events-none"
          style={{ left: `${depth * 20 + 8}px` }}
        />
      )}

      {/* Main row */}
      <div
        style={{
          paddingLeft: `${depth * 20 + (storylet.color ? 6 : 0)}px`,
          borderLeft: storylet.color ? `2px solid ${storylet.color}` : '2px solid transparent',
        }}
        className={`group flex items-center gap-1 py-1 px-2 cursor-pointer select-none text-sm rounded-sm mx-1
          ${isActive ? 'bg-blue-300/20 text-white' : 'text-gray-300 hover:bg-gray-700/50'}
          ${isDragging || isDragSource ? 'opacity-20' : ''}
          ${dropIndicator === 'reparent' ? 'bg-blue-500/20' : ''}
          ${dropIndicator === 'invalid' ? 'bg-red-500/10' : ''}`}
        onClick={() => !isEditing && onClick()}
        onDoubleClick={startEditing}
        onContextMenu={handleContextMenu}
        {...attributes}
        {...listeners}
      >
        {/* Disclosure chevron (branches only) */}
        {hasChildren && (
          <button
            type="button"
            className="shrink-0 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-white"
            onClick={(e) => {
              e.stopPropagation()
              onToggleCollapse()
            }}
          >
            <ChevronRight
              size={14}
              className={`transition-transform duration-150 ${!isCollapsed ? 'rotate-90' : ''}`}
            />
          </button>
        )}

        {/* Icon — click to open icon picker */}
        <button
          type="button"
          className="shrink-0 w-4 h-4 flex items-center justify-center text-gray-400 hover:text-white"
          style={storylet.color ? { color: storylet.color } : undefined}
          onClick={openAppearanceFromIconButton}
        >
          {createElement(getIconComponent(storylet.icon ?? ''), { size: 16 })}
        </button>

        {/* Middle zone: name / rename input */}
        {isEditing ? (
          <input
            ref={inputRef}
            className="flex-1 bg-gray-800 border border-blue-300 rounded px-1 py-0 text-sm text-white outline-none min-w-0"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitRename()
              if (e.key === 'Escape') setIsEditing(false)
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="truncate flex-1" style={storylet.color ? { color: storylet.color } : undefined}>{storylet.name}</span>
        )}

        {/* Right zone: action buttons (visible on hover) */}
        {!isEditing && (
          <span className="shrink-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
            <button
              className="p-0.5 rounded text-gray-400 hover:text-white"
              onClick={openContextMenuFromButton}
            >
              <MoreHorizontal size={16} />
            </button>
            <button
              className="p-0.5 rounded text-gray-400 hover:text-white"
              onClick={(e) => {
                e.stopPropagation()
                onAddSubStorylet()
              }}
            >
              <Plus size={16} />
            </button>
          </span>
        )}

        {/* Context menu */}
        {showContextMenu && (
          <div
            ref={contextMenuRef}
            className="fixed z-50 bg-gray-800 border border-gray-700 rounded shadow-lg py-1 min-w-[140px]"
            style={{ left: contextMenuPos.x, top: contextMenuPos.y }}
          >
            {showDeleteConfirm ? (
              <div className="px-3 py-2">
                <p className="text-sm text-gray-200 mb-2">
                  {(() => {
                    const count = getDescendantCount()
                    return count > 0
                      ? `Delete '${storylet.name}' and ${count} sub-storylet${count > 1 ? 's' : ''}?`
                      : `Delete '${storylet.name}'?`
                  })()}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    className="text-sm text-gray-400 hover:text-white"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowContextMenu(false)
                      setShowDeleteConfirm(false)
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      setShowContextMenu(false)
                      setShowDeleteConfirm(false)
                      onDelete()
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  className="w-full text-left px-3 py-1 text-sm text-gray-200 hover:bg-gray-700"
                  onClick={(e) => {
                    e.stopPropagation()
                    startEditing()
                  }}
                >
                  Rename
                </button>
                <button
                  className="w-full text-left px-3 py-1 text-sm text-gray-200 hover:bg-gray-700"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDuplicate()
                  }}
                >
                  Duplicate
                </button>
                <div className="border-t border-gray-700 my-1" />
                <button
                  className="w-full text-left px-3 py-1 text-sm text-gray-200 hover:bg-gray-700"
                  onClick={(e) => {
                    e.stopPropagation()
                    openAppearancePicker({ top: contextMenuPos.y, left: contextMenuPos.x + 10 })
                  }}
                >
                  Appearance
                </button>
                <div className="border-t border-gray-700 my-1" />
                <button
                  className="w-full text-left px-3 py-1 text-sm text-gray-200 hover:bg-gray-700"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowContextMenu(false)
                    onAddSubStorylet()
                  }}
                >
                  Add sub-storylet
                </button>
                {isDeletable && (
                  <>
                    <div className="border-t border-gray-700 my-1" />
                    <button
                      className="w-full text-left px-3 py-1 text-sm text-coral-100 hover:bg-gray-700"
                      onClick={(e) => {
                        e.stopPropagation()
                        setShowDeleteConfirm(true)
                      }}
                    >
                      Delete
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Appearance picker (icon + color) */}
      <AppearancePicker
        open={showAppearancePicker}
        onClose={() => setShowAppearancePicker(false)}
        onSelectIcon={handleIconSelect}
        onSelectColor={handleColorSelect}
        anchorRect={appearancePickerRect}
        currentColor={storylet.color}
      />

      {/* Insert-after indicator line */}
      {dropIndicator === 'insert-after' && (
        <div
          className={`absolute bottom-0 right-1 h-0.5 ${indicatorColor} z-10 pointer-events-none`}
          style={{ left: `${depth * 20 + 8}px` }}
        />
      )}
    </div>
  )
}

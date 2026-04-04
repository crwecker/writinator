import { createElement, useState, useRef, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { ChevronRight, MoreHorizontal, Plus } from 'lucide-react'
import { getIconComponent } from '../../lib/icons'
import { IconPicker } from './IconPicker'
import { useDocumentStore } from '../../stores/documentStore'
import type { Document } from '../../types'

export type DropIndicator = 'insert-before' | 'insert-after' | 'reparent' | 'invalid' | null

interface TreeNodeProps {
  doc: Document
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
  onAddSubDocument: () => void
  isDeletable: boolean
}

export function TreeNode({
  doc,
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
  onAddSubDocument,
  isDeletable,
}: TreeNodeProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(doc.name)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })
  const [showIconPicker, setShowIconPicker] = useState(false)
  const [iconPickerRect, setIconPickerRect] = useState({ top: 0, left: 0 })
  const inputRef = useRef<HTMLInputElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    isDragging,
  } = useSortable({ id: doc.id })

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [isEditing])

  useEffect(() => {
    if (!showContextMenu) return
    function handleClickOutside(e: MouseEvent) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setShowContextMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showContextMenu])

  function startEditing() {
    setEditValue(doc.name)
    setIsEditing(true)
    setShowContextMenu(false)
  }

  function commitRename() {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== doc.name) {
      onRename(trimmed)
    }
    setIsEditing(false)
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    setContextMenuPos({ x: e.clientX, y: e.clientY })
    setShowContextMenu(true)
  }

  function openContextMenuFromButton(e: React.MouseEvent) {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setContextMenuPos({ x: rect.left, y: rect.bottom + 2 })
    setShowContextMenu(true)
  }

  function openIconPicker() {
    setIconPickerRect({ top: contextMenuPos.y, left: contextMenuPos.x + 10 })
    setShowIconPicker(true)
    setShowContextMenu(false)
  }

  function handleIconSelect(iconName: string | undefined) {
    useDocumentStore.getState().setDocumentIcon(doc.id, iconName)
    setShowIconPicker(false)
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
        style={{ paddingLeft: `${depth * 20}px` }}
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
        {/* Left zone: icon / chevron */}
        <span
          className="shrink-0 w-4 h-4 flex items-center justify-center"
          onClick={(e) => {
            if (hasChildren) {
              e.stopPropagation()
              onToggleCollapse()
            }
          }}
        >
          {hasChildren ? (
            <>
              {createElement(getIconComponent(doc.icon ?? ''), { size: 16, className: 'text-gray-400 group-hover:hidden' })}
              <ChevronRight
                size={16}
                className={`text-gray-400 hidden group-hover:block transition-transform duration-150 ${
                  !isCollapsed ? 'rotate-90' : ''
                }`}
              />
            </>
          ) : (
            createElement(getIconComponent(doc.icon ?? ''), { size: 16, className: 'text-gray-400' })
          )}
        </span>

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
          <span className="truncate flex-1">{doc.name}</span>
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
                onAddSubDocument()
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
                openIconPicker()
              }}
            >
              Change Icon
            </button>
            <button
              className="w-full text-left px-3 py-1 text-sm text-gray-200 hover:bg-gray-700"
              onClick={(e) => {
                e.stopPropagation()
                setShowContextMenu(false)
                onAddSubDocument()
              }}
            >
              Add sub-document
            </button>
            {isDeletable && (
              <>
                <div className="border-t border-gray-700 my-1" />
                <button
                  className="w-full text-left px-3 py-1 text-sm text-coral-100 hover:bg-gray-700"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowContextMenu(false)
                    onDelete()
                  }}
                >
                  Delete
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* Icon picker */}
      <IconPicker
        open={showIconPicker}
        onClose={() => setShowIconPicker(false)}
        onSelect={handleIconSelect}
        anchorRect={iconPickerRect}
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

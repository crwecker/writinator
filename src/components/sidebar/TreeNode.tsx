import { useState, useRef, useEffect } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { Chapter } from '../../types'

interface TreeNodeProps {
  chapter: Chapter
  depth: number
  isActive: boolean
  hasChildren: boolean
  isCollapsed: boolean
  onToggleCollapse: () => void
  onClick: () => void
  onRename: (name: string) => void
  onDelete: () => void
  onAddSubChapter: () => void
  onIndent: () => void
  onOutdent: () => void
  isDeletable: boolean
  canIndent: boolean
  canOutdent: boolean
}

export function TreeNode({
  chapter,
  depth,
  isActive,
  hasChildren,
  isCollapsed,
  onToggleCollapse,
  onClick,
  onRename,
  onDelete,
  onAddSubChapter,
  onIndent,
  onOutdent,
  isDeletable,
  canIndent,
  canOutdent,
}: TreeNodeProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(chapter.name)
  const [showContextMenu, setShowContextMenu] = useState(false)
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 })
  const inputRef = useRef<HTMLInputElement>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: chapter.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

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
    setEditValue(chapter.name)
    setIsEditing(true)
    setShowContextMenu(false)
  }

  function commitRename() {
    const trimmed = editValue.trim()
    if (trimmed && trimmed !== chapter.name) {
      onRename(trimmed)
    }
    setIsEditing(false)
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    setContextMenuPos({ x: e.clientX, y: e.clientY })
    setShowContextMenu(true)
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-1 py-1 cursor-pointer select-none text-sm
        ${isActive ? 'bg-blue-300/20 text-white' : 'text-gray-300 hover:bg-gray-700/50'}
        ${isDragging ? 'opacity-50' : ''}`}
      onClick={() => !isEditing && onClick()}
      onDoubleClick={startEditing}
      onContextMenu={handleContextMenu}
      {...attributes}
      {...listeners}
    >
      {/* Indentation */}
      <span style={{ width: `${12 + depth * 16}px` }} className="shrink-0" />

      {/* Collapse toggle */}
      <span
        className={`text-gray-500 text-xs shrink-0 w-3 text-center transition-transform ${
          hasChildren ? 'cursor-pointer' : 'invisible'
        } ${hasChildren && !isCollapsed ? 'rotate-90' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          if (hasChildren) onToggleCollapse()
        }}
      >
        &#9657;
      </span>

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
        <span className="truncate flex-1">{chapter.name}</span>
      )}

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
              setShowContextMenu(false)
              onAddSubChapter()
            }}
          >
            Add sub-chapter
          </button>
          {canIndent && (
            <button
              className="w-full text-left px-3 py-1 text-sm text-gray-200 hover:bg-gray-700"
              onClick={(e) => {
                e.stopPropagation()
                setShowContextMenu(false)
                onIndent()
              }}
            >
              Indent
            </button>
          )}
          {canOutdent && (
            <button
              className="w-full text-left px-3 py-1 text-sm text-gray-200 hover:bg-gray-700"
              onClick={(e) => {
                e.stopPropagation()
                setShowContextMenu(false)
                onOutdent()
              }}
            >
              Outdent
            </button>
          )}
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
  )
}

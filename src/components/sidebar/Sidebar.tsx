import { useState } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { useDocumentStore } from '../../stores/documentStore'
import { TreeNode } from './TreeNode'
import type { Chapter } from '../../types'

interface SidebarProps {
  collapsed?: boolean
  onChapterSelect?: () => void
}

function getChildren(chapters: Chapter[], parentId?: string): Chapter[] {
  return chapters.filter((ch) => ch.parentId === parentId)
}

export function Sidebar({ collapsed, onChapterSelect }: SidebarProps) {
  const book = useDocumentStore((s) => s.book)
  const activeChapterId = useDocumentStore((s) => s.activeChapterId)
  const setActiveChapter = useDocumentStore((s) => s.setActiveChapter)
  const addChapter = useDocumentStore((s) => s.addChapter)
  const renameBook = useDocumentStore((s) => s.renameBook)
  const renameChapter = useDocumentStore((s) => s.renameChapter)
  const deleteChapter = useDocumentStore((s) => s.deleteChapter)
  const reorderChapters = useDocumentStore((s) => s.reorderChapters)
  const indentChapter = useDocumentStore((s) => s.indentChapter)
  const outdentChapter = useDocumentStore((s) => s.outdentChapter)

  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [expanded, setExpanded] = useState(true)
  const [collapsedNodes, setCollapsedNodes] = useState<Set<string>>(new Set())

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  )

  if (!book) return null

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !book) return

    // Only reorder among siblings
    const draggedChapter = book.chapters.find((ch) => ch.id === active.id)
    const overChapter = book.chapters.find((ch) => ch.id === over.id)
    if (!draggedChapter || !overChapter) return
    if (draggedChapter.parentId !== overChapter.parentId) return

    const oldIndex = book.chapters.findIndex((ch) => ch.id === active.id)
    const newIndex = book.chapters.findIndex((ch) => ch.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const newOrder = arrayMove(
      book.chapters.map((ch) => ch.id),
      oldIndex,
      newIndex
    )
    reorderChapters(newOrder)
  }

  function startEditingTitle() {
    setTitleValue(book!.title)
    setIsEditingTitle(true)
  }

  function commitTitle() {
    const trimmed = titleValue.trim()
    if (trimmed && trimmed !== book!.title) {
      renameBook(trimmed)
    }
    setIsEditingTitle(false)
  }

  function toggleCollapsed(id: string) {
    setCollapsedNodes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function renderChapters(parentId?: string, depth = 0): React.ReactNode {
    const children = getChildren(book!.chapters, parentId)
    if (children.length === 0) return null

    return (
      <SortableContext
        items={children.map((ch) => ch.id)}
        strategy={verticalListSortingStrategy}
      >
        {children.map((chapter) => {
          const hasChildren = book!.chapters.some((ch) => ch.parentId === chapter.id)
          const isCollapsed = collapsedNodes.has(chapter.id)
          return (
            <div key={chapter.id}>
              <TreeNode
                chapter={chapter}
                depth={depth}
                isActive={chapter.id === activeChapterId}
                hasChildren={hasChildren}
                isCollapsed={isCollapsed}
                onToggleCollapse={() => toggleCollapsed(chapter.id)}
                onClick={() => {
                  setActiveChapter(chapter.id)
                  onChapterSelect?.()
                }}
                onRename={(name) => renameChapter(chapter.id, name)}
                onDelete={() => deleteChapter(chapter.id)}
                onAddSubChapter={() => addChapter(undefined, chapter.id)}
                onIndent={() => indentChapter(chapter.id)}
                onOutdent={() => outdentChapter(chapter.id)}
                isDeletable={book!.chapters.length > 1}
                canIndent={
                  getChildren(book!.chapters, chapter.parentId).findIndex((ch) => ch.id === chapter.id) > 0
                }
                canOutdent={!!chapter.parentId}
              />
              {hasChildren && !isCollapsed && renderChapters(chapter.id, depth + 1)}
            </div>
          )
        })}
      </SortableContext>
    )
  }

  const isDropdown = collapsed === undefined

  return (
    <div
      className={
        isDropdown
          ? 'flex flex-col'
          : `flex flex-col bg-gray-900 border-r border-gray-700 h-full overflow-hidden transition-[width] duration-200 ${
              collapsed ? 'w-0' : 'w-[250px]'
            }`
      }
    >
      <div className={isDropdown ? 'flex flex-col' : 'flex flex-col min-w-[250px]'}>
        {/* Book title / root node */}
        <div
          className="flex items-center gap-1.5 px-3 py-2 border-b border-gray-700 cursor-pointer select-none"
          onClick={() => setExpanded(!expanded)}
          onDoubleClick={(e) => {
            e.stopPropagation()
            startEditingTitle()
          }}
        >
          <span className={`text-gray-400 text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>
            &#9657;
          </span>
          {isEditingTitle ? (
            <input
              autoFocus
              className="flex-1 bg-gray-800 border border-blue-300 rounded px-1 py-0 text-sm text-white font-semibold outline-none"
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitTitle()
                if (e.key === 'Escape') setIsEditingTitle(false)
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="text-sm font-semibold text-gray-200 truncate">
              {book.title}
            </span>
          )}
        </div>

        {/* Chapter tree */}
        {expanded && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="flex-1 overflow-y-auto py-1">
              {renderChapters(undefined, 0)}
            </div>
          </DndContext>
        )}

        {/* Add chapter button */}
        <button
          className="mx-2 my-2 px-2 py-1 text-sm text-gray-400 hover:text-white hover:bg-gray-700/50 rounded border border-dashed border-gray-700 hover:border-gray-500 transition-colors"
          onClick={() => addChapter()}
        >
          + Add Chapter
        </button>
      </div>
    </div>
  )
}

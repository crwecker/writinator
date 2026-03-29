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

interface SidebarProps {
  collapsed?: boolean
  onChapterSelect?: () => void
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

  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [titleValue, setTitleValue] = useState('')
  const [expanded, setExpanded] = useState(true)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  )

  if (!book) return null

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !book) return

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

        {/* Chapter list */}
        {expanded && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={book.chapters.map((ch) => ch.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex-1 overflow-y-auto py-1">
                {book.chapters.map((chapter) => (
                  <TreeNode
                    key={chapter.id}
                    chapter={chapter}
                    isActive={chapter.id === activeChapterId}
                    onClick={() => {
                      setActiveChapter(chapter.id)
                      onChapterSelect?.()
                    }}
                    onRename={(name) => renameChapter(chapter.id, name)}
                    onDelete={() => deleteChapter(chapter.id)}
                    isDeletable={book.chapters.length > 1}
                  />
                ))}
              </div>
            </SortableContext>
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

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
import { useEditorStore } from '../../stores/editorStore'
import { TreeNode } from './TreeNode'
import type { Document } from '../../types'

function getChildren(documents: Document[], parentId?: string): Document[] {
  return documents.filter((doc) => doc.parentId === parentId)
}

export function Sidebar() {
  const book = useDocumentStore((s) => s.book)
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId)
  const setActiveDocument = useDocumentStore((s) => s.setActiveDocument)
  const addDocument = useDocumentStore((s) => s.addDocument)
  const renameBook = useDocumentStore((s) => s.renameBook)
  const renameDocument = useDocumentStore((s) => s.renameDocument)
  const deleteDocument = useDocumentStore((s) => s.deleteDocument)
  const reorderDocuments = useDocumentStore((s) => s.reorderDocuments)
  const indentDocument = useDocumentStore((s) => s.indentDocument)
  const outdentDocument = useDocumentStore((s) => s.outdentDocument)

  const collapsedDocumentIds = useEditorStore((s) => s.collapsedDocumentIds)
  const toggleDocumentCollapsed = useEditorStore((s) => s.toggleDocumentCollapsed)

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

    const draggedDocument = book.documents.find((doc) => doc.id === active.id)
    const overDocument = book.documents.find((doc) => doc.id === over.id)
    if (!draggedDocument || !overDocument) return
    if (draggedDocument.parentId !== overDocument.parentId) return

    const oldIndex = book.documents.findIndex((doc) => doc.id === active.id)
    const newIndex = book.documents.findIndex((doc) => doc.id === over.id)
    if (oldIndex === -1 || newIndex === -1) return

    const newOrder = arrayMove(
      book.documents.map((doc) => doc.id),
      oldIndex,
      newIndex
    )
    reorderDocuments(newOrder)
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

  function renderDocuments(parentId?: string, depth = 0): React.ReactNode {
    const children = getChildren(book!.documents, parentId)
    if (children.length === 0) return null

    return (
      <SortableContext
        items={children.map((doc) => doc.id)}
        strategy={verticalListSortingStrategy}
      >
        {children.map((document) => {
          const hasChildren = book!.documents.some((doc) => doc.parentId === document.id)
          const isCollapsed = collapsedDocumentIds.includes(document.id)
          return (
            <div key={document.id}>
              <TreeNode
                doc={document}
                depth={depth}
                isActive={document.id === activeDocumentId}
                hasChildren={hasChildren}
                isCollapsed={isCollapsed}
                onToggleCollapse={() => toggleDocumentCollapsed(document.id)}
                onClick={() => setActiveDocument(document.id)}
                onRename={(name) => renameDocument(document.id, name)}
                onDelete={() => deleteDocument(document.id)}
                onAddSubDocument={() => addDocument(undefined, document.id)}
                onIndent={() => indentDocument(document.id)}
                onOutdent={() => outdentDocument(document.id)}
                isDeletable={book!.documents.length > 1}
                canIndent={
                  getChildren(book!.documents, document.parentId).findIndex((doc) => doc.id === document.id) > 0
                }
                canOutdent={!!document.parentId}
              />
              {hasChildren && !isCollapsed && renderDocuments(document.id, depth + 1)}
            </div>
          )
        })}
      </SortableContext>
    )
  }

  return (
    <div className="flex flex-col bg-gray-900 border-r border-gray-700 h-full w-[260px] shrink-0 overflow-hidden">
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

      {/* Document tree */}
      {expanded && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <div className="flex-1 overflow-y-auto py-1">
            {renderDocuments(undefined, 0)}
          </div>
        </DndContext>
      )}

      {/* Add document button */}
      <button
        className="mx-2 my-2 px-2 py-1 text-sm text-gray-400 hover:text-white hover:bg-gray-700/50 rounded border border-dashed border-gray-700 hover:border-gray-500 transition-colors"
        onClick={() => addDocument()}
      >
        + New Document
      </button>
    </div>
  )
}

import { createElement, useState, useRef, useMemo, useCallback } from 'react'
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragMoveEvent,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { useDocumentStore } from '../../stores/documentStore'
import { useEditorStore } from '../../stores/editorStore'
import { TreeNode, type DropIndicator } from './TreeNode'
import { getIconComponent } from '../../lib/icons'
import type { Document } from '../../types'

const MAX_DEPTH = 4

type DropIntent = 'before' | 'after' | 'child'

interface FlatItem {
  doc: Document
  depth: number
}

function getChildren(documents: Document[], parentId?: string): Document[] {
  return documents.filter((doc) => doc.parentId === parentId)
}

function flattenTree(
  documents: Document[],
  collapsedIds: string[],
  parentId?: string,
  depth = 0
): FlatItem[] {
  const children = getChildren(documents, parentId)
  const result: FlatItem[] = []
  for (const child of children) {
    result.push({ doc: child, depth })
    if (!collapsedIds.includes(child.id)) {
      result.push(...flattenTree(documents, collapsedIds, child.id, depth + 1))
    }
  }
  return result
}

function isDescendantOf(documents: Document[], docId: string, ancestorId: string): boolean {
  let currentId: string | undefined = docId
  while (currentId) {
    const doc = documents.find((d) => d.id === currentId)
    if (!doc?.parentId) return false
    if (doc.parentId === ancestorId) return true
    currentId = doc.parentId
  }
  return false
}

function getDocumentDepth(documents: Document[], id: string | undefined): number {
  let depth = 0
  let currentId = id
  while (currentId) {
    const doc = documents.find((d) => d.id === currentId)
    if (!doc?.parentId) break
    depth++
    currentId = doc.parentId
  }
  return depth
}

function getSubtreeDepth(documents: Document[], id: string): number {
  const children = documents.filter((d) => d.parentId === id)
  if (children.length === 0) return 0
  return 1 + Math.max(...children.map((c) => getSubtreeDepth(documents, c.id)))
}

function wouldExceedMaxDepth(
  documents: Document[],
  draggedId: string,
  newParentId: string | undefined
): boolean {
  const newDepth = newParentId ? getDocumentDepth(documents, newParentId) + 1 : 0
  const subtreeDepth = getSubtreeDepth(documents, draggedId)
  return newDepth + subtreeDepth > MAX_DEPTH
}

export function Sidebar() {
  const book = useDocumentStore((s) => s.book)
  const activeDocumentId = useDocumentStore((s) => s.activeDocumentId)
  const setActiveDocument = useDocumentStore((s) => s.setActiveDocument)
  const addDocument = useDocumentStore((s) => s.addDocument)
  const renameDocument = useDocumentStore((s) => s.renameDocument)
  const deleteDocument = useDocumentStore((s) => s.deleteDocument)
  const moveDocument = useDocumentStore((s) => s.moveDocument)

  const collapsedDocumentIds = useEditorStore((s) => s.collapsedDocumentIds)
  const toggleDocumentCollapsed = useEditorStore((s) => s.toggleDocumentCollapsed)

  const [newlyCreatedId, setNewlyCreatedId] = useState<string | null>(null)

  const handleAddDocument = useCallback(
    (parentId?: string) => {
      const id = addDocument(undefined, parentId)
      if (id) setNewlyCreatedId(id)
    },
    [addDocument]
  )

  const clearNewlyCreatedId = useCallback(() => {
    setNewlyCreatedId(null)
  }, [])

  // DnD state
  const [activeId, setActiveId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const [dropIntent, setDropIntent] = useState<DropIntent | null>(null)
  const [isValidDrop, setIsValidDrop] = useState(true)
  const pointerYRef = useRef(0)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  )

  const flatItems = useMemo(() => {
    if (!book) return []
    return flattenTree(book.documents ?? [], collapsedDocumentIds)
  }, [book, collapsedDocumentIds])

  const flatItemIds = useMemo(() => flatItems.map((item) => item.doc.id), [flatItems])

  const flatItemMap = useMemo(() => {
    const map = new Map<string, FlatItem>()
    for (const item of flatItems) {
      map.set(item.doc.id, item)
    }
    return map
  }, [flatItems])

  const activeDocument = useMemo(() => {
    if (!activeId || !book) return null
    return book.documents?.find((d) => d.id === activeId) ?? null
  }, [activeId, book])

  const activeItemDepth = useMemo(() => {
    if (!activeId) return 0
    return flatItemMap.get(activeId)?.depth ?? 0
  }, [activeId, flatItemMap])

  const validateDrop = useCallback(
    (dragId: string, targetId: string, intent: DropIntent): boolean => {
      if (!book) return false
      if (dragId === targetId && intent === 'child') return false

      const targetDoc = book.documents?.find((d) => d.id === targetId)
      if (!targetDoc) return false

      // Can't drop into own descendants
      if (isDescendantOf(book.documents ?? [], targetId, dragId)) return false

      // Check depth
      const newParentId = intent === 'child' ? targetId : targetDoc.parentId
      if (wouldExceedMaxDepth(book.documents ?? [], dragId, newParentId)) return false

      return true
    },
    [book]
  )

  if (!book) return null

  function handleDragStart(event: DragStartEvent) {
    setActiveId(event.active.id as string)
    setOverId(null)
    setDropIntent(null)
    setIsValidDrop(true)
  }

  function handleDragMove(event: DragMoveEvent) {
    const { over, delta, activatorEvent } = event
    if (!over || !activeId || !book) {
      setOverId(null)
      setDropIntent(null)
      return
    }

    const currentOverId = over.id as string
    if (currentOverId === activeId) {
      setOverId(null)
      setDropIntent(null)
      return
    }

    // Calculate pointer Y from activator event + delta
    if (activatorEvent instanceof PointerEvent) {
      pointerYRef.current = activatorEvent.clientY + delta.y
    }

    // Determine zone based on pointer Y relative to over element rect
    const overRect = over.rect
    const relativeY = pointerYRef.current - overRect.top
    const height = overRect.height

    let intent: DropIntent
    if (relativeY < height / 3) {
      intent = 'before'
    } else if (relativeY > (height * 2) / 3) {
      intent = 'after'
    } else {
      intent = 'child'
    }

    const valid = validateDrop(activeId, currentOverId, intent)

    setOverId(currentOverId)
    setDropIntent(intent)
    setIsValidDrop(valid)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || !book || !dropIntent || !overId) {
      resetDragState()
      return
    }

    const dragId = active.id as string
    const targetId = over.id as string

    if (dragId === targetId || !isValidDrop) {
      resetDragState()
      return
    }

    const targetDoc = book.documents?.find((d) => d.id === targetId)
    if (!targetDoc) {
      resetDragState()
      return
    }

    if (dropIntent === 'child') {
      // Reparent: make first child of target
      moveDocument(dragId, targetId, 0)
    } else {
      // Insert before or after target, as sibling
      const siblings = getChildren(book.documents ?? [], targetDoc.parentId)
      const targetSiblingIndex = siblings.findIndex((d) => d.id === targetId)
      const insertIndex = dropIntent === 'before' ? targetSiblingIndex : targetSiblingIndex + 1
      moveDocument(dragId, targetDoc.parentId, insertIndex)
    }

    resetDragState()
  }

  function handleDragCancel() {
    resetDragState()
  }

  function resetDragState() {
    setActiveId(null)
    setOverId(null)
    setDropIntent(null)
    setIsValidDrop(true)
  }

  function getDropIndicator(docId: string): DropIndicator {
    if (!activeId || !overId || !dropIntent || docId !== overId) return null
    if (!isValidDrop) return 'invalid'
    if (dropIntent === 'before') return 'insert-before'
    if (dropIntent === 'after') return 'insert-after'
    return 'reparent'
  }

  return (
    <div className="flex flex-col bg-gray-900 border-r border-gray-700 h-full w-[260px] shrink-0 overflow-hidden">
      {/* Document tree */}
      <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragMove={handleDragMove}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
          <SortableContext
            items={flatItemIds}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex-1 overflow-y-auto py-1">
              {flatItems.map((item) => {
                const hasChildren = book.documents?.some((d) => d.parentId === item.doc.id)
                const isCollapsed = collapsedDocumentIds.includes(item.doc.id)
                return (
                  <TreeNode
                    key={item.doc.id}
                    doc={item.doc}
                    depth={item.depth}
                    isActive={item.doc.id === activeDocumentId}
                    hasChildren={hasChildren}
                    isCollapsed={isCollapsed}
                    isDragSource={item.doc.id === activeId}
                    dropIndicator={getDropIndicator(item.doc.id)}
                    onToggleCollapse={() => toggleDocumentCollapsed(item.doc.id)}
                    onClick={() => setActiveDocument(item.doc.id)}
                    onRename={(name) => renameDocument(item.doc.id, name)}
                    onDelete={() => deleteDocument(item.doc.id)}
                    onAddSubDocument={() => handleAddDocument(item.doc.id)}
                    isDeletable={(book.documents?.length ?? 0) > 1}
                    autoEdit={item.doc.id === newlyCreatedId}
                    onAutoEditConsumed={clearNewlyCreatedId}
                  />
                )
              })}
            </div>
          </SortableContext>

          {/* Drag overlay — floating ghost of the dragged item */}
          <DragOverlay dropAnimation={null}>
            {activeDocument ? (
              <div
                className="flex items-center gap-1 py-1 px-2 text-sm text-gray-200 bg-gray-800 border border-gray-600 rounded shadow-lg shadow-black/30 scale-[1.02] opacity-90"
                style={{ paddingLeft: `${activeItemDepth * 20}px` }}
              >
                {createElement(getIconComponent(activeDocument.icon ?? ''), { size: 16, className: 'text-gray-400 shrink-0' })}
                <span className="truncate">{activeDocument.name}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

      {/* Add document button */}
      <button
        className="mx-2 my-2 px-2 py-1 text-sm text-gray-400 hover:text-white hover:bg-gray-700/50 rounded border border-dashed border-gray-700 hover:border-gray-500 transition-colors"
        onClick={() => handleAddDocument()}
      >
        + New Document
      </button>
    </div>
  )
}

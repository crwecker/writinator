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
import { useStoryletStore } from '../../stores/storyletStore'
import { useEditorStore } from '../../stores/editorStore'
import { useIsFileLocked } from '../../lib/fileLock'
import { TreeNode, type DropIndicator } from './TreeNode'
import { getIconComponent } from '../../lib/icons'
import type { Storylet } from '../../types'

const MAX_DEPTH = 4

type DropIntent = 'before' | 'after' | 'child'

interface FlatItem {
  storylet: Storylet
  depth: number
}

function getChildren(storylets: Storylet[], parentId?: string): Storylet[] {
  return storylets.filter((storylet) => storylet.parentId === parentId)
}

function flattenTree(
  storylets: Storylet[],
  collapsedIds: string[],
  parentId?: string,
  depth = 0
): FlatItem[] {
  const children = getChildren(storylets, parentId)
  const result: FlatItem[] = []
  for (const child of children) {
    result.push({ storylet: child, depth })
    if (!collapsedIds.includes(child.id)) {
      result.push(...flattenTree(storylets, collapsedIds, child.id, depth + 1))
    }
  }
  return result
}

function isDescendantOf(storylets: Storylet[], docId: string, ancestorId: string): boolean {
  let currentId: string | undefined = docId
  while (currentId) {
    const storylet = storylets.find((d) => d.id === currentId)
    if (!storylet?.parentId) return false
    if (storylet.parentId === ancestorId) return true
    currentId = storylet.parentId
  }
  return false
}

function getStoryletDepth(storylets: Storylet[], id: string | undefined): number {
  let depth = 0
  let currentId = id
  while (currentId) {
    const storylet = storylets.find((d) => d.id === currentId)
    if (!storylet?.parentId) break
    depth++
    currentId = storylet.parentId
  }
  return depth
}

function getSubtreeDepth(storylets: Storylet[], id: string): number {
  const children = storylets.filter((d) => d.parentId === id)
  if (children.length === 0) return 0
  return 1 + Math.max(...children.map((c) => getSubtreeDepth(storylets, c.id)))
}

function wouldExceedMaxDepth(
  storylets: Storylet[],
  draggedId: string,
  newParentId: string | undefined
): boolean {
  const newDepth = newParentId ? getStoryletDepth(storylets, newParentId) + 1 : 0
  const subtreeDepth = getSubtreeDepth(storylets, draggedId)
  return newDepth + subtreeDepth > MAX_DEPTH
}

export function Sidebar() {
  const book = useStoryletStore((s) => s.book)
  const activeStoryletId = useStoryletStore((s) => s.activeStoryletId)
  const setActiveStorylet = useStoryletStore((s) => s.setActiveStorylet)
  const addStorylet = useStoryletStore((s) => s.addStorylet)
  const renameStorylet = useStoryletStore((s) => s.renameStorylet)
  const deleteStorylet = useStoryletStore((s) => s.deleteStorylet)
  const moveStorylet = useStoryletStore((s) => s.moveStorylet)

  const collapsedStoryletIds = useEditorStore((s) => s.collapsedStoryletIds)
  const toggleStoryletCollapsed = useEditorStore((s) => s.toggleStoryletCollapsed)

  const locked = useIsFileLocked()

  const [newlyCreatedId, setNewlyCreatedId] = useState<string | null>(null)

  const handleAddStorylet = useCallback(
    (parentId?: string) => {
      const id = addStorylet(undefined, parentId)
      if (id) setNewlyCreatedId(id)
    },
    [addStorylet]
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

  const activeSensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  )
  // Passing an empty sensor array to DndContext effectively disables drag while locked.
  const sensors = locked ? [] : activeSensors

  const flatItems = useMemo(() => {
    if (!book) return []
    return flattenTree(book.storylets ?? [], collapsedStoryletIds)
  }, [book, collapsedStoryletIds])

  const flatItemIds = useMemo(() => flatItems.map((item) => item.storylet.id), [flatItems])

  const flatItemMap = useMemo(() => {
    const map = new Map<string, FlatItem>()
    for (const item of flatItems) {
      map.set(item.storylet.id, item)
    }
    return map
  }, [flatItems])

  const activeStorylet = useMemo(() => {
    if (!activeId || !book) return null
    return book.storylets?.find((d) => d.id === activeId) ?? null
  }, [activeId, book])

  const activeItemDepth = useMemo(() => {
    if (!activeId) return 0
    return flatItemMap.get(activeId)?.depth ?? 0
  }, [activeId, flatItemMap])

  const validateDrop = useCallback(
    (dragId: string, targetId: string, intent: DropIntent): boolean => {
      if (!book) return false
      if (dragId === targetId && intent === 'child') return false

      const targetStorylet = book.storylets?.find((d) => d.id === targetId)
      if (!targetStorylet) return false

      // Can't drop into own descendants
      if (isDescendantOf(book.storylets ?? [], targetId, dragId)) return false

      // Check depth
      const newParentId = intent === 'child' ? targetId : targetStorylet.parentId
      if (wouldExceedMaxDepth(book.storylets ?? [], dragId, newParentId)) return false

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

    const targetStorylet = book.storylets?.find((d) => d.id === targetId)
    if (!targetStorylet) {
      resetDragState()
      return
    }

    if (dropIntent === 'child') {
      // Reparent: make first child of target
      moveStorylet(dragId, targetId, 0)
    } else {
      // Insert before or after target, as sibling
      const siblings = getChildren(book.storylets ?? [], targetStorylet.parentId)
      const targetSiblingIndex = siblings.findIndex((d) => d.id === targetId)
      const insertIndex = dropIntent === 'before' ? targetSiblingIndex : targetSiblingIndex + 1
      moveStorylet(dragId, targetStorylet.parentId, insertIndex)
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
      {/* Storylet tree */}
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
                const hasChildren = book.storylets?.some((d) => d.parentId === item.storylet.id)
                const isCollapsed = collapsedStoryletIds.includes(item.storylet.id)
                return (
                  <TreeNode
                    key={item.storylet.id}
                    storylet={item.storylet}
                    depth={item.depth}
                    isActive={item.storylet.id === activeStoryletId}
                    hasChildren={hasChildren}
                    isCollapsed={isCollapsed}
                    isDragSource={item.storylet.id === activeId}
                    dropIndicator={getDropIndicator(item.storylet.id)}
                    onToggleCollapse={() => toggleStoryletCollapsed(item.storylet.id)}
                    onClick={() => setActiveStorylet(item.storylet.id)}
                    onRename={(name) => renameStorylet(item.storylet.id, name)}
                    onDelete={() => deleteStorylet(item.storylet.id)}
                    onAddSubStorylet={() => handleAddStorylet(item.storylet.id)}
                    isDeletable={(book.storylets?.length ?? 0) > 1}
                    autoEdit={item.storylet.id === newlyCreatedId}
                    onAutoEditConsumed={clearNewlyCreatedId}
                    locked={locked}
                  />
                )
              })}
            </div>
          </SortableContext>

          {/* Drag overlay — floating ghost of the dragged item */}
          <DragOverlay dropAnimation={null}>
            {activeStorylet ? (
              <div
                className="flex items-center gap-1 py-1 px-2 text-sm text-gray-200 bg-gray-800 border border-gray-600 rounded shadow-lg shadow-black/30 scale-[1.02] opacity-90"
                style={{ paddingLeft: `${activeItemDepth * 20}px` }}
              >
                {createElement(getIconComponent(activeStorylet.icon ?? ''), { size: 16, className: 'text-gray-400 shrink-0' })}
                <span className="truncate">{activeStorylet.name}</span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

      {/* Add storylet button */}
      <button
        className="mx-2 my-2 px-2 py-1 text-sm text-gray-400 hover:text-white hover:bg-gray-700/50 rounded border border-dashed border-gray-700 hover:border-gray-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-gray-400 disabled:hover:bg-transparent disabled:hover:border-gray-700"
        onClick={() => handleAddStorylet()}
        disabled={locked}
        title={locked ? 'Connect to a file to edit' : undefined}
      >
        + New Storylet
      </button>
    </div>
  )
}

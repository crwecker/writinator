import { createElement } from 'react'
import { useStoryletStore } from '../../stores/storyletStore'
import { getIconComponent } from '../../lib/icons'

export function SubStoryletLinks() {
  const activeStoryletId = useStoryletStore((s) => s.activeStoryletId)
  const storylets = useStoryletStore((s) => s.book?.storylets)
  const setActiveStorylet = useStoryletStore((s) => s.setActiveStorylet)

  if (!activeStoryletId || !storylets) return null

  const children = storylets.filter((d) => d.parentId === activeStoryletId)
  if (children.length === 0) return null

  return (
    <div className="w-full max-w-[800px] mx-auto px-4 pb-6">
      <div className="border-t border-gray-700 pt-3 mt-2">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Sub-storylets</div>
        <div className="flex flex-col gap-1">
          {children.map((child) => (
            <button
              key={child.id}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-gray-200 py-1 px-2 rounded hover:bg-gray-700/50 text-left"
              onClick={() => setActiveStorylet(child.id)}
            >
              {createElement(getIconComponent(child.icon ?? ''), {
                size: 16,
                className: child.color ? '' : 'text-gray-400',
                ...(child.color ? { style: { color: child.color } } : {}),
              })}
              <span style={child.color ? { color: child.color } : undefined}>
                {child.name}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

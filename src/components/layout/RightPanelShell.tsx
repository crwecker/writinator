import { useMemo, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useEditorStore } from '../../stores/editorStore'
import type { RightPanelTab } from '../../types'

export interface RightPanel {
  key: RightPanelTab
  label: string
  open: boolean
  onClose: () => void
  content: ReactNode
}

interface Props {
  panels: RightPanel[]
}

/**
 * Unified right-side dock. When exactly one panel is open, renders it
 * full-bleed with no tab bar (preserves the pre-tab look). When >1 is open,
 * renders a tab bar across the top — one tab per open panel, active tab fills
 * the body. The active tab is persisted via editorStore.rightPanelActiveTab.
 */
export function RightPanelShell({ panels }: Props) {
  const activeTabPersisted = useEditorStore((s) => s.rightPanelActiveTab)
  const setRightPanelActiveTab = useEditorStore((s) => s.setRightPanelActiveTab)

  const openPanels = useMemo(() => panels.filter((p) => p.open), [panels])

  // Resolve which tab is active. Always falls back to an open panel so we
  // never render a "none selected" body. Purely derived — no state writes
  // during render or effects (avoid cross-component setState warnings).
  const activeKey: RightPanelTab | null = useMemo(() => {
    if (openPanels.length === 0) return null
    if (
      activeTabPersisted &&
      openPanels.some((p) => p.key === activeTabPersisted)
    ) {
      return activeTabPersisted
    }
    return openPanels[0].key
  }, [openPanels, activeTabPersisted])

  if (openPanels.length === 0) return null

  const activePanel = openPanels.find((p) => p.key === activeKey) ?? openPanels[0]
  const showTabs = openPanels.length > 1

  // Width matches the widest panel (history/snapshots). When only one panel is
  // open, its own embedded wrapper handles layout and fills the shell width.
  const widthClass = 'w-[360px]'

  return (
    <div
      data-testid="right-panel-shell"
      className={`flex flex-col bg-gray-900 border-l border-gray-700 h-full ${widthClass} shrink-0 overflow-hidden`}
    >
      {showTabs && (
        <div
          data-testid="right-panel-tabs"
          className="flex border-b border-gray-700 bg-gray-900/60 shrink-0"
        >
          {openPanels.map((panel) => {
            const isActive = panel.key === activeKey
            return (
              <div
                key={panel.key}
                data-testid={`right-panel-tab-${panel.key}`}
                className={`flex items-center flex-1 min-w-0 border-b-2 transition-colors ${
                  isActive
                    ? 'border-blue-400 bg-gray-800/70'
                    : 'border-transparent hover:bg-gray-800/30'
                }`}
              >
                <button
                  onClick={() => setRightPanelActiveTab(panel.key)}
                  className={`flex-1 min-w-0 px-3 py-2 text-xs text-left truncate ${
                    isActive
                      ? 'text-gray-100'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  {panel.label}
                </button>
                <button
                  data-testid={`right-panel-tab-${panel.key}-close`}
                  onClick={(e) => {
                    e.stopPropagation()
                    panel.onClose()
                  }}
                  title={`Close ${panel.label}`}
                  className="p-1 mr-1 text-gray-500 hover:text-gray-200 rounded hover:bg-gray-700/60 transition-colors"
                >
                  <X size={12} />
                </button>
              </div>
            )
          })}
        </div>
      )}
      <div className="flex-1 min-h-0 overflow-hidden">{activePanel.content}</div>
    </div>
  )
}

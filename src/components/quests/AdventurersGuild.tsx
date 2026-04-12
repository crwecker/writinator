import { useEffect, useRef } from 'react'
import { Coins } from 'lucide-react'
import { usePlayerStore } from '../../stores/playerStore'
import { QuestBoardPanel } from './QuestBoardPanel'
import { ShopPanel } from './ShopPanel'
import { QuestPickerPanel } from './QuestPickerPanel'

export type GuildTab = 'board' | 'shop' | 'quests'

interface AdventurersGuildProps {
  open: boolean
  activeTab: GuildTab
  onTabChange: (tab: GuildTab) => void
  onClose: () => void
}

const TABS: { id: GuildTab; label: string }[] = [
  { id: 'board', label: 'Quest Board' },
  { id: 'shop', label: 'Quest Shop' },
  { id: 'quests', label: 'Your Quests' },
]

export function AdventurersGuild({ open, activeTab, onTabChange, onClose }: AdventurersGuildProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  const coins = usePlayerStore((s) => s.coins)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
      <div
        ref={panelRef}
        className="border-4 border-amber-950 rounded-xl shadow-2xl max-w-5xl w-full h-[90vh] flex flex-col relative bg-gray-900"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-amber-50 hover:text-amber-300 transition-colors text-xl font-bold w-8 h-8 flex items-center justify-center z-10"
          title="Close"
        >
          &#x2715;
        </button>

        {/* Header */}
        <div className="text-center pt-6 pb-3 shrink-0">
          <h1 className="font-serif text-3xl font-bold text-amber-50">Adventurer's Guild</h1>
          <div className="mt-1 flex items-center justify-center gap-2 text-amber-400 tabular-nums text-sm">
            <Coins size={14} />
            {coins.toLocaleString()}
          </div>
        </div>

        {/* Top tabs */}
        <div className="flex shrink-0 border-b-2 border-amber-900/60 px-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`font-serif px-5 py-2 text-sm font-semibold tracking-wide transition-colors border-b-2 -mb-[2px] ${
                activeTab === tab.id
                  ? 'text-amber-100 border-amber-400'
                  : 'text-amber-300/70 hover:text-amber-200 border-transparent'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Active panel (scrollable) */}
        <div
          className="flex-1 overflow-y-auto"
          style={{
            backgroundImage: 'url(/questBoardBackground.png)',
            backgroundRepeat: 'repeat',
            backgroundAttachment: 'local',
          }}
        >
          {activeTab === 'board' && <QuestBoardPanel />}
          {activeTab === 'shop' && <ShopPanel />}
          {activeTab === 'quests' && <QuestPickerPanel />}
        </div>
      </div>
    </div>
  )
}

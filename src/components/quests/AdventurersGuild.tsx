import { useEffect, useRef, type ReactNode } from 'react'
import { BookOpen, ScrollText, Swords, X } from 'lucide-react'
import { usePlayerStore } from '../../stores/playerStore'
import { useImageRevealStore } from '../../stores/imageRevealStore'
import { getArmorTimeBonus, getItemById, getWeaponMultiplier } from '../../lib/items'
import { QuestBoardPanel } from './QuestBoardPanel'
import { QuestJournalPanel } from './QuestJournalPanel'
import { ArmoryPanel } from './ArmoryPanel'
import { CoinAmount } from './QuestUi'

export type GuildTab = 'board' | 'journal' | 'armory'

interface AdventurersGuildProps {
  open: boolean
  activeTab: GuildTab
  onTabChange: (tab: GuildTab) => void
  onClose: () => void
}

function PlayerStrip() {
  const coins = usePlayerStore((s) => s.coins)
  const weaponId = usePlayerStore((s) => s.equippedWeapon)
  const armorId = usePlayerStore((s) => s.equippedArmor)
  const completed = usePlayerStore((s) => s.questStats.totalCompleted)
  const weapon = getItemById(weaponId)
  const armor = getItemById(armorId)
  const timeBonus = Math.round(getArmorTimeBonus(armorId) * 100)

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <div className="flex items-center gap-4 text-stone-300">
        {weapon && (
          <span className="inline-flex items-center gap-1.5" title={`${weapon.name}: each word counts ×${getWeaponMultiplier(weaponId)}`}>
            <span aria-hidden="true">{weapon.icon}</span>
            <span className="tabular-nums">×{getWeaponMultiplier(weaponId)}</span>
          </span>
        )}
        {armor && (
          <span className="inline-flex items-center gap-1.5" title={`${armor.name}: +${timeBonus}% time on timed quests`}>
            <span aria-hidden="true">{armor.icon}</span>
            <span className="tabular-nums">+{timeBonus}%</span>
          </span>
        )}
        <span className="tabular-nums">{completed.toLocaleString()} quest{completed === 1 ? '' : 's'} done</span>
      </div>
      <span className="rounded-full border border-amber-600/40 bg-amber-500/10 px-3 py-1">
        <CoinAmount amount={coins.toLocaleString()} className="text-base font-semibold" />
      </span>
    </div>
  )
}

export function AdventurersGuild({ open, activeTab, onTabChange, onClose }: AdventurersGuildProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const activeCount = useImageRevealStore((s) => s.activeSessions.length)

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

  const tabs: { id: GuildTab; label: string; icon: ReactNode; badge?: number }[] = [
    { id: 'board', label: 'Quest Board', icon: <ScrollText size={15} /> },
    { id: 'journal', label: 'Journal', icon: <BookOpen size={15} />, badge: activeCount },
    { id: 'armory', label: 'Armory', icon: <Swords size={15} /> },
  ]

  // The board shows more of the wood so the parchment looks pinned to it.
  const overlay = activeTab === 'board' ? 'rgba(18,12,7,0.55)' : 'rgba(14,10,7,0.88)'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-fade-in">
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Adventurer's Guild"
        className="relative flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-amber-900/70 bg-stone-950 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="shrink-0 border-b border-amber-900/50 bg-gradient-to-b from-stone-900 to-stone-950 px-6 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="font-serif text-3xl font-bold tracking-tight text-amber-50">Adventurer's Guild</h1>
              <p className="mt-0.5 text-sm text-stone-400">Write to reveal pictures, earn coins and gear up.</p>
            </div>
            <div className="flex items-center gap-3">
              <PlayerStrip />
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-1.5 text-stone-400 transition-colors hover:bg-stone-800 hover:text-stone-100"
                aria-label="Close"
                title="Close (Esc)"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          <nav className="mt-4 flex gap-1" role="tablist">
            {tabs.map((tab) => {
              const active = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => onTabChange(tab.id)}
                  className={`-mb-px inline-flex items-center gap-2 rounded-t-lg border-x border-t px-4 py-2 text-sm font-semibold transition-colors ${
                    active
                      ? 'border-amber-900/50 bg-stone-950 text-amber-100'
                      : 'border-transparent text-stone-400 hover:text-stone-100'
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                  {tab.badge ? (
                    <span className="rounded-full bg-amber-500 px-1.5 text-[10px] font-bold leading-4 text-stone-950">{tab.badge}</span>
                  ) : null}
                </button>
              )
            })}
          </nav>
        </header>

        <div
          className="flex-1 overflow-y-auto"
          style={{
            backgroundImage: `linear-gradient(${overlay}, ${overlay}), url(/questBoardBackground.webp)`,
            backgroundRepeat: 'repeat',
            backgroundAttachment: 'local',
          }}
        >
          {activeTab === 'board' && <QuestBoardPanel />}
          {activeTab === 'journal' && <QuestJournalPanel onFindQuests={() => onTabChange('board')} />}
          {activeTab === 'armory' && <ArmoryPanel />}
        </div>
      </div>
    </div>
  )
}

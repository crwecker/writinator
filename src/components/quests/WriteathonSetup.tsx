import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useWriteathonStore } from '../../stores/writeathonStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { countWords } from '../../lib/words'
import { getMilestoneReward, getMilestoneTier } from '../../lib/writeathon'
import type { MilestoneTier } from '../../types'
import { CoinAmount, GuildButton, QuestProgress } from './QuestUi'

interface WriteathonSetupProps {
  open: boolean
  onClose: () => void
}

const TIER_LABEL: Record<MilestoneTier, string> = {
  apprentice: 'Apprentice',
  journeyman: 'Journeyman',
  master: 'Master',
  legendary: 'Legendary',
}

const DAY_PRESETS = [7, 14, 24, 30]

/** Reward per tier for a writeathon of `totalBlocks` days, from the real milestone rules. */
function rewardPreview(totalBlocks: number): { tier: MilestoneTier; days: number; coins: number }[] {
  const rows = new Map<MilestoneTier, { days: number; coins: number }>()
  for (let block = 1; block <= totalBlocks; block++) {
    const tier = getMilestoneTier(block)
    const row = rows.get(tier) ?? { days: 0, coins: 0 }
    row.days++
    row.coins += getMilestoneReward(block)
    rows.set(tier, row)
  }
  return [...rows].map(([tier, row]) => ({ tier, ...row }))
}

export function WriteathonSetup({ open, onClose }: WriteathonSetupProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const config = useWriteathonStore((s) => s.config)
  const milestones = useWriteathonStore((s) => s.milestones)
  const book = useStoryletStore((s) => s.book)
  const [confirmReset, setConfirmReset] = useState(false)
  // Captured once per mount; days-elapsed doesn't need to tick while open.
  const [now] = useState(() => Date.now())

  const startingWordCount = useMemo(
    () => book?.storylets.reduce((sum, storylet) => sum + countWords(storylet.content), 0) ?? 0,
    [book],
  )
  const [targetWordCount, setTargetWordCount] = useState(() => Math.max(50000, startingWordCount + 10000))
  const [totalBlocks, setTotalBlocks] = useState(24)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    function onMouseDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onMouseDown, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', onMouseDown, true)
    }
  }, [open, onClose])

  if (!open) return null

  const shell = (children: ReactNode) => (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Writeathon"
        className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-amber-800/60 bg-gradient-to-b from-stone-900 to-stone-950 p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 rounded p-1 text-stone-400 hover:text-stone-100">
          <X size={18} />
        </button>
        {children}
      </div>
    </div>
  )

  if (config?.active) {
    const completedBlocks = milestones.filter((m) => m.completed).length
    const daysElapsed = Math.max(0, Math.floor((now - Date.parse(config.startDate)) / 86_400_000))
    const coinsEarned = milestones.reduce((sum, m) => sum + (m.completed ? m.coinsAwarded : 0), 0)
    const stats: [string, string][] = [
      ['Words', `${config.startingWordCount.toLocaleString()} → ${config.targetWordCount.toLocaleString()}`],
      ['Per day', `${config.wordsPerBlock.toLocaleString()} words`],
      ['Days done', `${completedBlocks} of ${config.totalBlocks}`],
      ['Days since start', String(daysElapsed)],
      ['Coins earned', coinsEarned.toLocaleString()],
    ]
    return shell(
      <>
        <h2 className="font-serif text-2xl font-semibold text-amber-100">
          {config.completedAt ? 'Writeathon complete' : 'Writeathon in progress'}
        </h2>
        <div className="mt-4">
          <QuestProgress value={completedBlocks} max={config.totalBlocks} />
        </div>
        <dl className="mt-5 grid grid-cols-2 gap-3">
          {stats.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-stone-800 bg-stone-950/60 px-3 py-2">
              <dt className="text-xs text-stone-400">{label}</dt>
              <dd className="font-semibold tabular-nums text-stone-100">{value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          {!config.completedAt && (
            <GuildButton
              variant="secondary"
              onClick={() => {
                const store = useWriteathonStore.getState()
                if (config.paused) store.resumeWriteathon()
                else store.pauseWriteathon()
              }}
            >
              {config.paused ? 'Resume' : 'Pause'}
            </GuildButton>
          )}
          {confirmReset ? (
            <>
              <span className="self-center text-sm text-stone-300">End it and lose progress?</span>
              <GuildButton variant="ghost" onClick={() => setConfirmReset(false)}>Keep</GuildButton>
              <GuildButton
                variant="danger"
                onClick={() => {
                  useWriteathonStore.getState().resetWriteathon()
                  setConfirmReset(false)
                }}
              >
                End writeathon
              </GuildButton>
            </>
          ) : (
            <GuildButton variant="danger" onClick={() => setConfirmReset(true)}>
              {config.completedAt ? 'Clear and start over' : 'End writeathon'}
            </GuildButton>
          )}
        </div>
      </>,
    )
  }

  const wordsToWrite = targetWordCount - startingWordCount
  const wordsPerDay = totalBlocks > 0 && wordsToWrite > 0 ? Math.ceil(wordsToWrite / totalBlocks) : 0
  const valid = wordsToWrite >= 1000 && totalBlocks >= 1 && totalBlocks <= 365
  const preview = rewardPreview(Math.max(1, Math.min(365, totalBlocks)))
  const totalCoins = preview.reduce((sum, row) => sum + row.coins, 0)
  const input =
    'w-full rounded-lg border border-stone-700 bg-stone-950/70 px-3 py-2 font-mono tabular-nums text-stone-100 outline-none focus:border-amber-500'

  return shell(
    <>
      <h2 className="font-serif text-2xl font-semibold text-amber-100">Plan a writeathon</h2>
      <p className="mt-1 text-sm text-stone-400">
        Your book has <span className="text-stone-200">{startingWordCount.toLocaleString()}</span> words today.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-4">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-400">Finish at (words)</span>
          <input
            type="number"
            min={startingWordCount + 1000}
            step={1000}
            value={targetWordCount}
            onChange={(e) => setTargetWordCount(Number(e.target.value))}
            className={input}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-stone-400">Writing days</span>
          <input
            type="number"
            min={1}
            max={365}
            value={totalBlocks}
            onChange={(e) => setTotalBlocks(Number(e.target.value))}
            className={input}
          />
          <span className="mt-1.5 flex gap-1">
            {DAY_PRESETS.map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setTotalBlocks(d)}
                className={`rounded px-2 py-0.5 text-[11px] font-semibold ${totalBlocks === d ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-300 hover:bg-stone-700'}`}
              >
                {d}
              </button>
            ))}
          </span>
        </label>
      </div>

      <p className="mt-4 rounded-lg border border-amber-800/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
        {valid ? (
          <>
            That's <span className="font-semibold">{wordsPerDay.toLocaleString()} words a day</span> for {totalBlocks} day
            {totalBlocks === 1 ? '' : 's'}.
          </>
        ) : (
          'Aim at least 1,000 words past where you are now, over 1–365 days.'
        )}
      </p>

      <div className="mt-5 overflow-hidden rounded-lg border border-stone-800">
        <table className="w-full text-sm">
          <thead className="bg-stone-900 text-xs text-stone-400">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Tier</th>
              <th className="px-3 py-2 text-right font-medium">Days</th>
              <th className="px-3 py-2 text-right font-medium">Coins</th>
            </tr>
          </thead>
          <tbody>
            {preview.map((row) => (
              <tr key={row.tier} className="border-t border-stone-800 text-stone-200">
                <td className="px-3 py-1.5">{TIER_LABEL[row.tier]}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{row.days}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{row.coins.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-stone-700 bg-stone-900/70">
              <td className="px-3 py-2 font-medium text-stone-200" colSpan={2}>If you finish every day</td>
              <td className="px-3 py-2 text-right">
                <CoinAmount amount={totalCoins.toLocaleString()} className="font-semibold" />
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-6 flex justify-end gap-2">
        <GuildButton variant="ghost" onClick={onClose}>Not now</GuildButton>
        <GuildButton
          disabled={!valid}
          onClick={() => {
            useWriteathonStore.getState().startWriteathon(startingWordCount, targetWordCount, totalBlocks)
            onClose()
          }}
          className="px-5"
        >
          Start writeathon
        </GuildButton>
      </div>
    </>,
  )
}

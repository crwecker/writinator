import { useEffect, useRef, useState } from 'react'
import { useWriteathonStore } from '../../stores/writeathonStore'
import { useDocumentStore } from '../../stores/documentStore'
import { countWords } from '../../lib/words'

interface WriteathonSetupProps {
  open: boolean
  onClose: () => void
}

const REWARD_TIERS = [
  { label: 'Apprentice', blocks: '1–6', perBlock: 150, bonusCoins: 500, total: 1400 },
  { label: 'Journeyman', blocks: '7–12', perBlock: 250, bonusCoins: 1000, total: 2500 },
  { label: 'Master', blocks: '13–18', perBlock: 400, bonusCoins: 1500, total: 3900 },
  { label: 'Legendary', blocks: '19–24', perBlock: 600, bonusCoins: 2500, total: 6100 },
]

const TOTAL_POSSIBLE = 13900

export function WriteathonSetup({ open, onClose }: WriteathonSetupProps) {
  const panelRef = useRef<HTMLDivElement>(null)

  const config = useWriteathonStore((s) => s.config)
  const milestones = useWriteathonStore((s) => s.milestones)
  const book = useDocumentStore((s) => s.book)

  const startingWordCount =
    book?.documents.reduce((sum, doc) => sum + countWords(doc.content), 0) ?? 0

  const [targetWordCount, setTargetWordCount] = useState(79755)
  const [totalBlocks, setTotalBlocks] = useState(24)

  // Escape key
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

  // Click outside
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

  const isActive = config?.active === true

  const wordsPerDay =
    totalBlocks > 0 && targetWordCount > startingWordCount
      ? Math.ceil((targetWordCount - startingWordCount) / totalBlocks)
      : 0

  const isSetupValid =
    targetWordCount > startingWordCount + 999 && totalBlocks >= 1

  function handleStart() {
    if (!isSetupValid) return
    useWriteathonStore.getState().startWriteathon(startingWordCount, targetWordCount, totalBlocks)
    onClose()
  }

  function handleReset() {
    if (!confirm('Reset the writeathon? All progress will be lost.')) return
    useWriteathonStore.getState().resetWriteathon()
  }

  // Status view helpers
  let daysElapsed = 0
  let completedBlocks = 0
  let remainingBlocks = 0
  let progressPercent = 0

  if (config) {
    const start = new Date(config.startDate)
    const now = new Date()
    daysElapsed = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
    completedBlocks = milestones.filter((m) => m.completed).length
    remainingBlocks = config.totalBlocks - completedBlocks
    progressPercent =
      config.totalBlocks > 0
        ? Math.round((completedBlocks / config.totalBlocks) * 100)
        : 0
  }

  const storeState = useWriteathonStore.getState() as unknown as Record<string, unknown>
  const hasPause = typeof storeState['pauseWriteathon'] === 'function'
  const hasResume = typeof storeState['resumeWriteathon'] === 'function'
  const isPaused = (config as unknown as { paused?: boolean } | null)?.paused === true

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center">
      <div
        ref={panelRef}
        className="border-4 border-amber-950 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto p-8 relative"
        style={{
          background: 'linear-gradient(180deg, #3d2817 0%, #2a1a0d 100%)',
          backgroundImage:
            'repeating-linear-gradient(90deg, rgba(0,0,0,0.1) 0px, transparent 2px, transparent 80px, rgba(0,0,0,0.1) 82px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-amber-50 hover:text-amber-300 transition-colors text-xl font-bold w-8 h-8 flex items-center justify-center"
          title="Close"
        >
          &#x2715;
        </button>

        {!isActive ? (
          <>
            {/* Setup form */}
            <div className="text-center mb-8">
              <h1 className="text-3xl md:text-4xl font-serif font-bold text-amber-300">
                Accept the Challenge
              </h1>
              <p className="text-amber-500 mt-2 text-sm">Commit to your writing journey</p>
            </div>

            <div className="space-y-5 mb-8">
              {/* Starting word count — read only */}
              <div>
                <label className="block text-amber-200 text-sm font-medium mb-1">
                  Starting word count
                </label>
                <div className="w-full bg-amber-950/40 border border-amber-800/50 rounded-lg px-4 py-3 text-amber-100 font-mono tabular-nums">
                  {startingWordCount.toLocaleString()}
                </div>
                <p className="text-amber-700 text-xs mt-1">Auto-detected from your current book</p>
              </div>

              {/* Target word count */}
              <div>
                <label className="block text-amber-200 text-sm font-medium mb-1">
                  Target word count
                </label>
                <input
                  type="number"
                  value={targetWordCount}
                  min={startingWordCount + 1000}
                  step={100}
                  onChange={(e) => setTargetWordCount(Number(e.target.value))}
                  className="w-full bg-amber-950/40 border border-amber-700 rounded-lg px-4 py-3 text-amber-100 font-mono tabular-nums outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              {/* Total working days */}
              <div>
                <label className="block text-amber-200 text-sm font-medium mb-1">
                  Total working days
                </label>
                <input
                  type="number"
                  value={totalBlocks}
                  min={1}
                  max={365}
                  step={1}
                  onChange={(e) => setTotalBlocks(Number(e.target.value))}
                  className="w-full bg-amber-950/40 border border-amber-700 rounded-lg px-4 py-3 text-amber-100 font-mono tabular-nums outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              {/* Computed words per day */}
              {wordsPerDay > 0 && (
                <p className="text-gray-400 text-sm">
                  That&apos;s{' '}
                  <span className="text-amber-400 font-medium">
                    {wordsPerDay.toLocaleString()} words per day
                  </span>
                </p>
              )}
            </div>

            {/* Reward preview */}
            <div className="mb-8">
              <h2 className="font-serif text-lg text-amber-200 mb-3">Reward Preview</h2>
              <div className="rounded-lg overflow-hidden border border-amber-900/60">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-amber-950/60">
                      <th className="text-left px-4 py-2 text-amber-400 font-medium">Tier</th>
                      <th className="text-right px-4 py-2 text-amber-400 font-medium">Blocks</th>
                      <th className="text-right px-4 py-2 text-amber-400 font-medium">Per Block</th>
                      <th className="text-right px-4 py-2 text-amber-400 font-medium">Bonus</th>
                      <th className="text-right px-4 py-2 text-amber-400 font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {REWARD_TIERS.map((tier) => (
                      <tr key={tier.label} className="border-t border-amber-900/40 bg-amber-950/20">
                        <td className="px-4 py-2 text-amber-200">{tier.label}</td>
                        <td className="px-4 py-2 text-right text-amber-300">{tier.blocks}</td>
                        <td className="px-4 py-2 text-right text-amber-300">
                          {tier.perBlock.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right text-amber-300">
                          +{tier.bonusCoins.toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-right font-medium text-amber-200">
                          {tier.total.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-amber-700 bg-amber-950/50">
                      <td colSpan={4} className="px-4 py-3 font-serif text-amber-200 font-medium">
                        Total possible
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-amber-300 text-base">
                        {TOTAL_POSSIBLE.toLocaleString()} coins
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Accept button */}
            <button
              onClick={handleStart}
              disabled={!isSetupValid}
              className="w-full bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-amber-950 font-bold py-4 rounded-lg text-lg shadow-lg transition-all hover:scale-[1.02] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:from-amber-700 disabled:to-amber-600"
            >
              &#x2694; Accept the Challenge
            </button>
          </>
        ) : (
          <>
            {/* Status view */}
            <div className="text-center mb-8">
              <h1 className="text-3xl md:text-4xl font-serif font-bold text-amber-300">
                Challenge in Progress
              </h1>
              <p className="text-amber-500 mt-2 text-sm">Your journey continues, adventurer</p>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-8">
              <StatCard label="Starting words" value={config!.startingWordCount.toLocaleString()} />
              <StatCard label="Target words" value={config!.targetWordCount.toLocaleString()} />
              <StatCard label="Total blocks" value={String(config!.totalBlocks)} />
              <StatCard label="Days elapsed" value={String(daysElapsed)} />
              <StatCard label="Blocks completed" value={String(completedBlocks)} />
              <StatCard label="Blocks remaining" value={String(remainingBlocks)} />
              <StatCard
                label="Progress"
                value={`${progressPercent}%`}
                highlight
              />
              <StatCard
                label="Words per block"
                value={config!.wordsPerBlock.toLocaleString()}
              />
            </div>

            {/* Progress bar */}
            <div className="mb-8">
              <div className="h-2 bg-amber-950/60 rounded-full overflow-hidden border border-amber-900/40">
                <div
                  className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-[width] duration-500"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              {hasPause && hasResume && (
                <button
                  onClick={() => {
                    const s = useWriteathonStore.getState() as unknown as Record<string, unknown>
                    if (isPaused) {
                      (s['resumeWriteathon'] as () => void)()
                    } else {
                      (s['pauseWriteathon'] as () => void)()
                    }
                  }}
                  className="flex-1 bg-amber-800/60 hover:bg-amber-700/60 text-amber-200 font-semibold py-3 rounded-lg transition-colors border border-amber-700/50"
                >
                  {isPaused ? 'Resume' : 'Pause'}
                </button>
              )}
              <button
                onClick={handleReset}
                className="flex-1 bg-red-900/40 hover:bg-red-800/50 text-red-300 font-semibold py-3 rounded-lg transition-colors border border-red-900/50"
              >
                Reset
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

interface StatCardProps {
  label: string
  value: string
  highlight?: boolean
}

function StatCard({ label, value, highlight = false }: StatCardProps) {
  return (
    <div className="bg-amber-950/30 border border-amber-900/40 rounded-lg px-4 py-3">
      <p className="text-amber-600 text-xs font-medium mb-1">{label}</p>
      <p className={`font-mono font-bold tabular-nums ${highlight ? 'text-amber-300 text-lg' : 'text-amber-100'}`}>
        {value}
      </p>
    </div>
  )
}

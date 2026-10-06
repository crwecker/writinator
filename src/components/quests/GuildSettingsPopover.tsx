import { useEffect, useRef, useState, type ReactNode } from 'react'
import { IMAGE_THEMES, useGameSettingsStore, type ImageTheme } from '../../stores/gameSettingsStore'

const DEFAULT_TIMER_CHOICES: Array<number | null> = [null, 10, 20, 30]

interface GuildSettingsPopoverProps {
  open: boolean
  onClose: () => void
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <input
      type="checkbox"
      role="switch"
      aria-label={label}
      checked={checked}
      onChange={onChange}
      className="h-4 w-4 shrink-0 cursor-pointer accent-amber-500"
    />
  )
}

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5">
      <div className="min-w-0">
        <p className="text-sm font-medium text-stone-200">{title}</p>
        {hint && <p className="mt-0.5 text-xs text-stone-500">{hint}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}

/** Quest defaults: auto session quest, default timer, quiet mode, picture theme. */
export function GuildSettingsPopover({ open, onClose }: GuildSettingsPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const autoQuest = useGameSettingsStore((s) => s.autoQuest)
  const defaultTimer = useGameSettingsStore((s) => s.defaultTimerMinutes)
  const quiet = useGameSettingsStore((s) => s.quietMode)
  const theme = useGameSettingsStore((s) => s.imageTheme)
  const [goalDraft, setGoalDraft] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      // Close just the popover, not the whole guild.
      e.preventDefault()
      e.stopImmediatePropagation()
      onClose()
    }
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Element
      if (ref.current?.contains(target) || target.closest?.('[data-guild-settings-toggle]')) return
      onClose()
    }
    document.addEventListener('keydown', onKey, true)
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [open, onClose])

  if (!open) return null

  const settings = useGameSettingsStore.getState()

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="Quest settings"
      className="absolute right-0 top-full z-20 mt-2 w-80 rounded-xl border border-amber-900/60 bg-stone-950 p-4 text-left shadow-[0_20px_50px_-12px_rgba(0,0,0,0.9)] animate-fade-in"
    >
      <h2 className="font-serif text-lg font-semibold text-amber-100">Quest settings</h2>

      <div className="mt-1 divide-y divide-stone-800">
        <Row title="Session quest" hint="Start a quest automatically when you begin writing.">
          <Toggle
            label="Auto session quest"
            checked={autoQuest.enabled}
            onChange={() => settings.setAutoQuest({ enabled: !autoQuest.enabled })}
          />
        </Row>
        <Row title="Session quest goal">
          <input
            type="number"
            min={50}
            step={50}
            aria-label="Session quest goal"
            value={goalDraft ?? String(autoQuest.wordGoal)}
            disabled={!autoQuest.enabled}
            onChange={(e) => {
              setGoalDraft(e.target.value)
              const n = Number(e.target.value)
              if (Number.isFinite(n) && n >= 1) settings.setAutoQuest({ wordGoal: n })
            }}
            onBlur={() => setGoalDraft(null)}
            className="w-20 rounded-md border border-stone-700 bg-stone-900 px-2 py-1 text-right text-sm tabular-nums text-amber-50 outline-none focus:border-amber-600 disabled:opacity-40"
          />
          <span className="text-xs text-stone-500">words</span>
        </Row>

        <div className="py-2.5">
          <p className="text-sm font-medium text-stone-200">Default timer</p>
          <p className="mt-0.5 text-xs text-stone-500">Pre-selected on guild contracts.</p>
          <div className="mt-2 flex gap-1" role="radiogroup" aria-label="Default timer">
            {DEFAULT_TIMER_CHOICES.map((m) => {
              const active = m === defaultTimer
              return (
                <button
                  key={m ?? 'none'}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={`Default timer ${m === null ? 'none' : `${m} minutes`}`}
                  onClick={() => settings.setDefaultTimer(m)}
                  className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                    active ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
                  }`}
                >
                  {m === null ? 'No timer' : `${m}m`}
                </button>
              )
            })}
          </div>
        </div>

        <Row title="Picture theme" hint="Unsplash photos for new quests.">
          <select
            aria-label="Picture theme"
            value={theme}
            onChange={(e) => settings.setImageTheme(e.target.value as ImageTheme)}
            className="rounded-md border border-stone-700 bg-stone-900 px-2 py-1 text-sm text-amber-50 outline-none focus:border-amber-600"
          >
            {IMAGE_THEMES.map((t) => (
              <option key={t.query} value={t.query}>
                {t.label}
              </option>
            ))}
          </select>
        </Row>

        <Row title="Quiet mode" hint="Hide toasts, the picture widget and badges. The status-bar ring stays.">
          <Toggle label="Quiet mode" checked={quiet} onChange={() => settings.toggleQuietMode()} />
        </Row>
      </div>
    </div>
  )
}

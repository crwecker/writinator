import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  DIFFICULTY_PRESETS,
  IMAGE_THEMES,
  useGameSettingsStore,
  type DifficultyPreset,
  type ImageTheme,
} from '../../stores/gameSettingsStore'
import { useCosmeticsStore } from '../../stores/cosmeticsStore'
import { AMBIENT_IDS, getSoundBySoundId, type AmbientId } from '../../lib/cosmetics'
import type { WordCountMode } from '../../lib/wordAccounting'

const DEFAULT_TIMER_CHOICES: Array<number | null> = [null, 10, 20, 30]
const DIFFICULTIES: DifficultyPreset[] = ['relaxed', 'standard', 'hardcore']
const WORD_COUNT_MODES: Array<{ id: WordCountMode; label: string }> = [
  { id: 'gross', label: 'Gross typing' },
  { id: 'net', label: 'Net growth' },
]

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

function Segmented<T extends string | number | null>({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: Array<{ id: T; label: string; title?: string }>
  value: T
  onChange: (id: T) => void
}) {
  return (
    <div className="mt-2 flex gap-1" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const active = o.id === value
        return (
          <button
            key={String(o.id)}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${label} ${o.label}`}
            title={o.title}
            onClick={() => onChange(o.id)}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
              active ? 'bg-amber-500 text-stone-950' : 'bg-stone-800 text-stone-300 hover:bg-stone-700'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
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

/** Quest defaults: difficulty, auto session quest, default timer, word counting, sounds, quiet mode, picture theme. */
export function GuildSettingsPopover({ open, onClose }: GuildSettingsPopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const autoQuest = useGameSettingsStore((s) => s.autoQuest)
  const defaultTimer = useGameSettingsStore((s) => s.defaultTimerMinutes)
  const quiet = useGameSettingsStore((s) => s.quietMode)
  const theme = useGameSettingsStore((s) => s.imageTheme)
  const difficulty = useGameSettingsStore((s) => s.difficulty)
  const wordCountMode = useGameSettingsStore((s) => s.wordCountMode)
  const sound = useGameSettingsStore((s) => s.sound)
  const ownedCosmetics = useCosmeticsStore((s) => s.owned)
  const ownsKeySounds = ownedCosmetics.includes('sound-typewriter')
  const ownedAmbient = AMBIENT_IDS.filter((id) => ownedCosmetics.includes(`sound-${id}`))
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
      className="absolute right-0 top-full z-20 mt-2 max-h-[75vh] w-80 overflow-y-auto rounded-xl border border-amber-900/60 bg-stone-950 p-4 text-left shadow-[0_20px_50px_-12px_rgba(0,0,0,0.9)] animate-fade-in"
    >
      <h2 className="font-serif text-lg font-semibold text-amber-100">Quest settings</h2>

      <div className="mt-1 divide-y divide-stone-800">
        <div className="py-2.5">
          <p className="text-sm font-medium text-stone-200">Difficulty</p>
          <p className="mt-0.5 text-xs text-stone-500">{DIFFICULTY_PRESETS[difficulty].hint}</p>
          <Segmented
            label="Difficulty"
            options={DIFFICULTIES.map((d) => ({ id: d, label: DIFFICULTY_PRESETS[d].label, title: DIFFICULTY_PRESETS[d].hint }))}
            value={difficulty}
            onChange={(d) => settings.setDifficulty(d)}
          />
        </div>

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

        <div className="py-2.5">
          <p className="text-sm font-medium text-stone-200">Count words as</p>
          <p className="mt-0.5 text-xs text-stone-500">
            {wordCountMode === 'gross'
              ? 'Every word you type counts, even ones you later delete.'
              : 'Words added minus words deleted; a day never goes below zero.'}{' '}
            Used by quests, streaks and goals.
          </p>
          <Segmented label="Count words as" options={WORD_COUNT_MODES} value={wordCountMode} onChange={(m) => settings.setWordCountMode(m)} />
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

        <div className="py-2.5">
          <p className="text-sm font-medium text-stone-200">Writing sounds</p>
          <p className="mt-0.5 text-xs text-stone-500">
            {ownsKeySounds || ownedAmbient.length > 0
              ? 'Unaffected by quiet mode.'
              : 'Unlock key sounds and soundscapes in the Armory under Cosmetics.'}
          </p>
          <div className="mt-2 space-y-2">
            <label className={`flex items-center justify-between gap-3 text-sm ${ownsKeySounds ? 'text-stone-300' : 'text-stone-600'}`}>
              Key sounds
              <Toggle
                label="Typewriter key sounds"
                checked={sound.keySounds && ownsKeySounds}
                onChange={() => ownsKeySounds && settings.setSound({ keySounds: !sound.keySounds })}
              />
            </label>
            <label className={`flex items-center justify-between gap-3 text-sm ${ownedAmbient.length > 0 ? 'text-stone-300' : 'text-stone-600'}`}>
              Soundscape
              <select
                aria-label="Soundscape"
                value={sound.ambient !== null && ownedAmbient.includes(sound.ambient) ? sound.ambient : ''}
                disabled={ownedAmbient.length === 0}
                onChange={(e) => settings.setSound({ ambient: e.target.value === '' ? null : (e.target.value as AmbientId) })}
                className="rounded-md border border-stone-700 bg-stone-900 px-2 py-1 text-sm text-amber-50 outline-none focus:border-amber-600 disabled:opacity-40"
              >
                <option value="">Off</option>
                {ownedAmbient.map((id) => (
                  <option key={id} value={id}>
                    {getSoundBySoundId(id)?.name ?? id}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center justify-between gap-3 text-sm text-stone-300">
              Volume
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                aria-label="Sound volume"
                value={Math.round(sound.volume * 100)}
                onChange={(e) => settings.setSound({ volume: Number(e.target.value) / 100 })}
                className="w-32 accent-amber-500"
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

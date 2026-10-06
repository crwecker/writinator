import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Coins } from 'lucide-react'
import type { ItemRarity, QuestDifficulty } from '../../types'
import { DIFFICULTY_STYLES, RARITY_STYLES } from './questStyles'

export function CoinAmount({ amount, className = '' }: { amount: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 tabular-nums text-amber-300 ${className}`}>
      <Coins size={13} className="shrink-0" aria-hidden="true" />
      {amount}
    </span>
  )
}

export function RarityBadge({ rarity }: { rarity: ItemRarity }) {
  const style = RARITY_STYLES[rarity]
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider ${style.text}`}>{style.label}</span>
  )
}

export function DifficultyBadge({ difficulty }: { difficulty: QuestDifficulty }) {
  const style = DIFFICULTY_STYLES[difficulty]
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${style.className}`}>
      {style.label}
    </span>
  )
}

export function SectionHeading({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="font-serif text-xl font-semibold text-amber-100">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-stone-400">{subtitle}</p>}
      </div>
      {action}
    </div>
  )
}

type Tone = 'amber' | 'emerald' | 'sky'

const TONE_FILL: Record<Tone, string> = {
  amber: 'from-amber-500 to-yellow-300',
  emerald: 'from-emerald-500 to-teal-300',
  sky: 'from-sky-500 to-cyan-300',
}

export function QuestProgress({
  value,
  max,
  tone = 'amber',
  size = 'md',
}: {
  value: number
  max: number
  tone?: Tone
  size?: 'sm' | 'md'
}) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div
      className={`w-full overflow-hidden rounded-full bg-stone-800/90 ring-1 ring-inset ring-black/40 ${size === 'sm' ? 'h-1.5' : 'h-2.5'}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(value, max)}
    >
      <div
        className={`h-full rounded-full bg-gradient-to-r ${TONE_FILL[tone]} transition-[width] duration-500`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-gradient-to-b from-amber-400 to-amber-600 text-stone-950 shadow-md shadow-amber-950/40 hover:from-amber-300 hover:to-amber-500',
  secondary: 'border border-amber-700/60 bg-stone-900/70 text-amber-200 hover:border-amber-500 hover:text-amber-100',
  ghost: 'text-stone-400 hover:bg-stone-800 hover:text-stone-200',
  danger: 'border border-red-800/70 bg-red-950/50 text-red-300 hover:bg-red-900/60',
}

export function GuildButton({
  variant = 'primary',
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      {...props}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${BUTTON_VARIANTS[variant]} ${className}`}
    >
      {children}
    </button>
  )
}

export function EmptyState({ icon, title, children }: { icon: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-stone-700 bg-stone-950/40 px-6 py-10 text-center">
      <div className="mb-3 text-stone-500">{icon}</div>
      <p className="font-serif text-lg text-stone-200">{title}</p>
      {children && <div className="mt-1 text-sm text-stone-400">{children}</div>}
    </div>
  )
}

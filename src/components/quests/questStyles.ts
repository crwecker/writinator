import type { ItemRarity, QuestDifficulty } from '../../types'

export interface RarityStyle {
  label: string
  text: string
  border: string
  /** Tinted tile behind an item's icon. */
  tile: string
  glow: string
}

export const RARITY_STYLES: Record<ItemRarity, RarityStyle> = {
  common: { label: 'Common', text: 'text-stone-300', border: 'border-stone-500/60', tile: 'bg-stone-700/40', glow: '' },
  uncommon: { label: 'Uncommon', text: 'text-emerald-300', border: 'border-emerald-500/60', tile: 'bg-emerald-900/40', glow: 'shadow-[0_0_18px_-6px_rgba(52,211,153,0.6)]' },
  rare: { label: 'Rare', text: 'text-sky-300', border: 'border-sky-500/60', tile: 'bg-sky-900/40', glow: 'shadow-[0_0_18px_-6px_rgba(56,189,248,0.6)]' },
  epic: { label: 'Epic', text: 'text-fuchsia-300', border: 'border-fuchsia-500/60', tile: 'bg-fuchsia-900/40', glow: 'shadow-[0_0_20px_-6px_rgba(232,121,249,0.65)]' },
  legendary: { label: 'Legendary', text: 'text-amber-300', border: 'border-amber-400/70', tile: 'bg-amber-900/40', glow: 'shadow-[0_0_24px_-6px_rgba(251,191,36,0.75)]' },
}

export const DIFFICULTY_STYLES: Record<QuestDifficulty, { label: string; className: string }> = {
  easy: { label: 'Easy', className: 'bg-emerald-900/50 text-emerald-300 border-emerald-700/60' },
  medium: { label: 'Medium', className: 'bg-yellow-900/40 text-yellow-300 border-yellow-700/60' },
  hard: { label: 'Hard', className: 'bg-orange-900/40 text-orange-300 border-orange-700/60' },
  epic: { label: 'Epic', className: 'bg-fuchsia-900/40 text-fuchsia-300 border-fuchsia-700/60' },
}

export function formatCoinRange(range: { min: number; max: number }): string {
  return range.min === range.max
    ? range.min.toLocaleString()
    : `${range.min.toLocaleString()}–${range.max.toLocaleString()}`
}

export function formatMinutes(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`
}

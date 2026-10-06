import { useState, type ReactNode } from 'react'
import { Check, Palette, Pause, Play, Tag } from 'lucide-react'
import { usePlayerStore } from '../../stores/playerStore'
import { useCosmeticsStore } from '../../stores/cosmeticsStore'
import { useGameSettingsStore } from '../../stores/gameSettingsStore'
import {
  CURSOR_STYLES,
  EDITOR_FONTS,
  EDITOR_THEMES,
  GALLERY_FRAMES,
  SOUNDS,
  getCosmetic,
  type Cosmetic,
  type CosmeticKind,
} from '../../lib/cosmetics'
import { dailyDeal, dealPrice } from '../../lib/dailyDeal'
import { getItemById } from '../../lib/items'
import type { Item } from '../../types'
import { CoinAmount, GuildButton, RarityBadge } from './QuestUi'
import { RARITY_STYLES } from './questStyles'

/** Price with today's deal applied, showing the old price struck through. */
export function PriceTag({ id, price, quantity = 1, short = false }: { id: string; price: number; quantity?: number; short?: boolean }) {
  const now = dealPrice(id, price)
  const total = now * quantity
  return (
    <span className="inline-flex items-baseline gap-1.5">
      {now < price && <span className="text-xs tabular-nums text-stone-500 line-through">{(price * quantity).toLocaleString()}</span>}
      <CoinAmount amount={total.toLocaleString()} className={`text-sm font-semibold ${short ? 'text-red-300' : ''}`} />
    </span>
  )
}

function CosmeticTile({ c, size = 'md' }: { c: Cosmetic; size?: 'md' | 'lg' }) {
  const style = RARITY_STYLES[c.rarity]
  const dims = size === 'lg' ? 'h-16 w-16 text-3xl' : 'h-12 w-12 text-2xl'
  if (c.kind === 'theme') {
    return (
      <div
        className={`flex shrink-0 items-center justify-center rounded-xl border ${style.border} ${dims}`}
        style={{ background: `linear-gradient(135deg, ${c.swatch[0]} 55%, ${c.swatch[1]} 55%)` }}
        aria-hidden="true"
      >
        <span className="text-lg drop-shadow">{c.icon}</span>
      </div>
    )
  }
  if (c.kind === 'font') {
    return (
      <div className={`flex shrink-0 items-center justify-center rounded-xl border ${style.border} ${style.tile} ${dims} font-serif text-amber-50`} aria-hidden="true">
        Aa
      </div>
    )
  }
  return (
    <div className={`flex shrink-0 items-center justify-center rounded-xl border ${style.border} ${style.tile} ${dims}`} aria-hidden="true">
      <span>{c.icon}</span>
    </div>
  )
}

const KIND_FIELD: Partial<Record<CosmeticKind, 'editorTheme' | 'cursorStyle' | 'galleryFrame' | 'editorFont'>> = {
  theme: 'editorTheme',
  cursor: 'cursorStyle',
  frame: 'galleryFrame',
  font: 'editorFont',
}

/** Is this cosmetic the one in use? Sounds: playing / switched on. */
function useInUse(c: Cosmetic): boolean {
  const field = KIND_FIELD[c.kind]
  const selected = useCosmeticsStore((s) => (field ? s[field] === c.id : false))
  const sound = useGameSettingsStore((s) => s.sound)
  if (c.kind === 'sound') return c.type === 'keys' ? sound.keySounds : sound.ambient === c.sound
  return selected
}

function applyCosmetic(c: Cosmetic): void {
  if (c.kind === 'sound') {
    const settings = useGameSettingsStore.getState()
    if (c.type === 'keys') settings.setSound({ keySounds: !settings.sound.keySounds })
    else if (c.sound !== 'typewriter') settings.setSound({ ambient: settings.sound.ambient === c.sound ? null : c.sound })
    return
  }
  useCosmeticsStore.getState().select(c.id)
}

function CosmeticCard({ c }: { c: Cosmetic }) {
  const coins = usePlayerStore((s) => s.coins)
  const owned = useCosmeticsStore((s) => c.price === 0 || s.owned.includes(c.id))
  const inUse = useInUse(c)
  const [flash, setFlash] = useState(false)
  const price = dealPrice(c.id, c.price)
  const shortBy = Math.max(0, price - coins)

  function buy() {
    if (!useCosmeticsStore.getState().purchase(c.id)) return
    setFlash(true)
    setTimeout(() => setFlash(false), 700)
  }

  const useLabel =
    c.kind === 'sound' ? (c.type === 'keys' ? (inUse ? 'Turn off' : 'Turn on') : inUse ? 'Stop' : 'Play') : 'Use'

  return (
    <article
      className={`flex flex-col rounded-xl border bg-stone-900/85 p-4 transition-colors ${
        flash ? 'border-emerald-400' : inUse ? 'border-amber-500/70' : 'border-stone-700/70'
      }`}
    >
      <div className="flex items-start gap-3">
        <CosmeticTile c={c} />
        <div className="min-w-0 flex-1">
          <p className="font-serif text-base text-amber-50" style={c.kind === 'font' && owned ? { fontFamily: c.cssFamily } : undefined}>
            {c.name}
          </p>
          <RarityBadge rarity={c.rarity} />
        </div>
      </div>
      <p className="mt-2 text-sm text-stone-300">{c.description}</p>

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        {owned ? (
          <>
            {inUse && c.kind !== 'sound' ? (
              <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-300">
                <Check size={14} /> In use
              </span>
            ) : (
              <span className="text-sm text-emerald-300">{inUse ? 'On' : c.price === 0 ? 'Free' : 'Owned'}</span>
            )}
            {(c.kind === 'sound' || !inUse) && (
              <GuildButton variant="secondary" className="inline-flex items-center gap-1 px-3 py-1 text-xs" onClick={() => applyCosmetic(c)}>
                {c.kind === 'sound' && c.type === 'ambient' && (inUse ? <Pause size={12} /> : <Play size={12} />)}
                {useLabel}
              </GuildButton>
            )}
          </>
        ) : (
          <>
            <PriceTag id={c.id} price={c.price} short={shortBy > 0} />
            <GuildButton
              className="px-3 py-1 text-xs"
              disabled={shortBy > 0}
              title={shortBy > 0 ? `${shortBy.toLocaleString()} more coins needed` : undefined}
              onClick={buy}
            >
              {shortBy > 0 ? `Need ${shortBy.toLocaleString()}` : 'Buy'}
            </GuildButton>
          </>
        )}
      </div>
    </article>
  )
}

function Group({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">
        {title}
        {hint && <span className="ml-2 normal-case tracking-normal text-stone-500">{hint}</span>}
      </h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">{children}</div>
    </div>
  )
}

/** The "Cosmetics" store shelf: looks and sounds that never change the rules. */
export function CosmeticsShelf() {
  return (
    <div className="space-y-6">
      <Group title="Editor themes" hint="Colors for the writing page.">
        {EDITOR_THEMES.map((c) => <CosmeticCard key={c.id} c={c} />)}
      </Group>
      <Group title="Carets">
        {CURSOR_STYLES.map((c) => <CosmeticCard key={c.id} c={c} />)}
      </Group>
      <Group title="Editor fonts" hint="Loaded from Google Fonts when you use one.">
        {EDITOR_FONTS.map((c) => <CosmeticCard key={c.id} c={c} />)}
      </Group>
      <Group title="Gallery frames" hint="For pictures in your Journal.">
        {GALLERY_FRAMES.map((c) => <CosmeticCard key={c.id} c={c} />)}
      </Group>
      <Group title="Writing sounds" hint="Volume in Quest settings.">
        {SOUNDS.map((c) => <CosmeticCard key={c.id} c={c} />)}
      </Group>
    </div>
  )
}

function LoadoutSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: string
  options: Array<{ id: string; name: string }>
  onChange: (id: string) => void
}) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-stone-400">{label}</span>
      <select
        aria-label={label}
        value={value}
        disabled={options.length < 2}
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 max-w-[60%] rounded-md border border-stone-700 bg-stone-900 px-2 py-1 text-sm text-amber-50 outline-none focus:border-amber-600 disabled:opacity-60"
      >
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Loadout card for owned cosmetics: switch theme, caret, font and frame. */
export function CosmeticsLoadout() {
  const owned = useCosmeticsStore((s) => s.owned)
  const theme = useCosmeticsStore((s) => s.editorTheme)
  const cursor = useCosmeticsStore((s) => s.cursorStyle)
  const frame = useCosmeticsStore((s) => s.galleryFrame)
  const font = useCosmeticsStore((s) => s.editorFont)
  const have = <T extends Cosmetic>(list: T[]) => list.filter((c) => c.price === 0 || owned.includes(c.id))
  const select = (id: string) => useCosmeticsStore.getState().select(id)

  return (
    <div className="rounded-xl border border-stone-700/70 bg-stone-900/85 p-4 md:col-span-2">
      <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">
        <Palette size={12} /> Look
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-x-6">
        <LoadoutSelect label="Editor theme" value={theme} options={have(EDITOR_THEMES)} onChange={select} />
        <LoadoutSelect label="Caret" value={cursor} options={have(CURSOR_STYLES)} onChange={select} />
        <LoadoutSelect
          label="Editor font"
          value={font ?? ''}
          options={[{ id: '', name: 'Regular setting' }, ...have(EDITOR_FONTS)]}
          onChange={(id) => (id === '' ? useCosmeticsStore.getState().clearFont() : select(id))}
        />
        <LoadoutSelect label="Gallery frame" value={frame} options={have(GALLERY_FRAMES)} onChange={select} />
      </div>
    </div>
  )
}

/** Today's discounted item, highlighted at the top of the store. */
export function DailyDealBanner({ renderItem }: { renderItem: (item: Item) => ReactNode }) {
  const deal = dailyDeal()
  const item = getItemById(deal.itemId)
  const cosmetic = item ? undefined : getCosmetic(deal.itemId)
  if (!item && !cosmetic) return null

  return (
    <div className="mb-5 rounded-2xl border border-amber-500/50 bg-gradient-to-br from-amber-950/60 via-stone-900/90 to-stone-900/90 p-4 shadow-[0_0_30px_-12px_rgba(245,158,11,0.6)]">
      <div className="mb-3 flex items-center gap-2">
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-stone-950">
          <Tag size={11} /> Deal of the day
        </span>
        <span className="text-sm font-semibold text-amber-200">{deal.percentOff}% off today only</span>
      </div>
      <div className="max-w-md">{item ? renderItem(item) : cosmetic && <CosmeticCard c={cosmetic} />}</div>
    </div>
  )
}

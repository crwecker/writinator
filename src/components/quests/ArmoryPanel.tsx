import { useState } from 'react'
import { ArrowUp, Check, Minus, Plus, Shield, Sword } from 'lucide-react'
import { usePlayerStore } from '../../stores/playerStore'
import { ARMORS, CONSUMABLES, WEAPONS, getArmorTimeBonus, getItemById, getWeaponMultiplier } from '../../lib/items'
import type { ArmorItem, ConsumableItem, Item, WeaponItem } from '../../types'
import { CoinAmount, GuildButton, RarityBadge, SectionHeading } from './QuestUi'
import { RARITY_STYLES } from './questStyles'

type Shelf = 'weapon' | 'armor' | 'consumable'

const SHELVES: { id: Shelf; label: string }[] = [
  { id: 'weapon', label: 'Quills & pens' },
  { id: 'armor', label: 'Armor' },
  { id: 'consumable', label: 'Supplies' },
]

/** Plain-language effect of an item. */
function effectText(item: Item): string {
  if (item.category === 'weapon') {
    const m = (item as WeaponItem).wordMultiplier
    return m === 1 ? 'Each word counts once' : `Each word counts ×${m} toward quests and coins`
  }
  if (item.category === 'armor') {
    const b = (item as ArmorItem).timeBonus
    return b === 0 ? 'No extra time' : `+${Math.round(b * 100)}% time on timed quests`
  }
  return (item as ConsumableItem).description
}

function ItemTile({ item, size = 'md' }: { item: Item; size?: 'md' | 'lg' }) {
  const style = RARITY_STYLES[item.rarity]
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-xl border ${style.border} ${style.tile} ${style.glow} ${
        size === 'lg' ? 'h-16 w-16 text-3xl' : 'h-12 w-12 text-2xl'
      }`}
    >
      <span aria-hidden="true">{item.icon}</span>
    </div>
  )
}

function LoadoutSlot({ slot }: { slot: 'weapon' | 'armor' }) {
  const equippedId = usePlayerStore((s) => (slot === 'weapon' ? s.equippedWeapon : s.equippedArmor))
  const ownedItems = usePlayerStore((s) => s.ownedItems)
  const [choosing, setChoosing] = useState(false)
  const equipped = getItemById(equippedId)
  const catalog: Item[] = slot === 'weapon' ? WEAPONS : ARMORS
  // The starter items are always available, even if never "bought".
  const owned = catalog.filter((i) => i.price === 0 || ownedItems.includes(i.id))
  const SlotIcon = slot === 'weapon' ? Sword : Shield

  return (
    <div className="relative rounded-xl border border-stone-700/70 bg-stone-900/85 p-4">
      <div className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">
        <SlotIcon size={12} /> {slot === 'weapon' ? 'Writing tool' : 'Armor'}
      </div>
      {equipped && (
        <div className="flex items-center gap-3">
          <ItemTile item={equipped} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-serif text-lg text-amber-50">{equipped.name}</p>
            <RarityBadge rarity={equipped.rarity} />
            <p className="mt-0.5 text-sm text-stone-300">{effectText(equipped)}</p>
          </div>
          {owned.length > 1 && (
            <GuildButton variant="secondary" className="shrink-0 px-2.5 py-1 text-xs" onClick={() => setChoosing((v) => !v)}>
              Change
            </GuildButton>
          )}
        </div>
      )}
      {choosing && (
        <div className="mt-3 grid gap-1.5 border-t border-stone-800 pt-3">
          {owned.map((item) => {
            const isEquipped = item.id === equippedId
            return (
              <button
                key={item.id}
                type="button"
                disabled={isEquipped}
                onClick={() => {
                  usePlayerStore.getState().equipItem(item.id, slot)
                  setChoosing(false)
                }}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-stone-800 disabled:cursor-default disabled:bg-stone-800/60"
              >
                <span className="text-lg" aria-hidden="true">{item.icon}</span>
                <span className="flex-1 text-stone-200">{item.name}</span>
                <span className="text-xs text-stone-400">{effectText(item).replace('toward quests and coins', '')}</span>
                {isEquipped && <Check size={14} className="text-emerald-400" />}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/** How much better (or worse) an item is than what's equipped in its slot. */
function upgradeText(item: Item, equippedWeapon: string, equippedArmor: string): string | null {
  if (item.category === 'weapon') {
    const diff = (item as WeaponItem).wordMultiplier - getWeaponMultiplier(equippedWeapon)
    return diff > 0 ? `+${Math.round(diff * 100)}% per word vs. equipped` : null
  }
  if (item.category === 'armor') {
    const diff = (item as ArmorItem).timeBonus - getArmorTimeBonus(equippedArmor)
    return diff > 0 ? `+${Math.round(diff * 100)}% time vs. equipped` : null
  }
  return null
}

function StoreItem({ item }: { item: Item }) {
  const coins = usePlayerStore((s) => s.coins)
  const ownedItems = usePlayerStore((s) => s.ownedItems)
  const equippedWeapon = usePlayerStore((s) => s.equippedWeapon)
  const equippedArmor = usePlayerStore((s) => s.equippedArmor)
  const stock = usePlayerStore((s) => s.consumableInventory[item.id] ?? 0)
  const [qty, setQty] = useState(1)
  const [confirming, setConfirming] = useState(false)
  const [flash, setFlash] = useState(false)

  const isConsumable = item.category === 'consumable'
  const owned = !isConsumable && (item.price === 0 || ownedItems.includes(item.id))
  const equipped = item.id === equippedWeapon || item.id === equippedArmor
  const total = item.price * (isConsumable ? qty : 1)
  const shortBy = Math.max(0, total - coins)
  const upgrade = !owned ? upgradeText(item, equippedWeapon, equippedArmor) : null
  const style = RARITY_STYLES[item.rarity]

  function buy() {
    if (total > 500 && !confirming) {
      setConfirming(true)
      return
    }
    const { purchaseItem } = usePlayerStore.getState()
    let bought = 0
    for (let i = 0; i < (isConsumable ? qty : 1); i++) {
      if (!purchaseItem(item.id)) break
      bought++
    }
    setConfirming(false)
    if (bought > 0) {
      setFlash(true)
      setTimeout(() => setFlash(false), 700)
    }
  }

  return (
    <article
      className={`flex flex-col rounded-xl border bg-stone-900/85 p-4 transition-colors ${
        flash ? 'border-emerald-400' : equipped ? 'border-amber-500/70' : 'border-stone-700/70'
      }`}
    >
      <div className="flex items-start gap-3">
        <ItemTile item={item} />
        <div className="min-w-0 flex-1">
          <p className="font-serif text-base text-amber-50">{item.name}</p>
          <span className={`text-[10px] font-semibold uppercase tracking-wider ${style.text}`}>{style.label}</span>
        </div>
        {isConsumable && stock > 0 && (
          <span className="rounded-full bg-stone-800 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-stone-300">
            {stock} in pack
          </span>
        )}
      </div>
      <p className="mt-2 text-sm text-stone-300">{effectText(item)}</p>
      {!isConsumable && <p className="mt-0.5 text-xs italic text-stone-500">{item.description}</p>}
      {upgrade && (
        <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-emerald-300">
          <ArrowUp size={12} /> {upgrade}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        {owned ? (
          equipped ? (
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-amber-300">
              <Check size={14} /> Equipped
            </span>
          ) : (
            <>
              <span className="text-sm text-emerald-300">Owned</span>
              <GuildButton
                variant="secondary"
                className="px-3 py-1 text-xs"
                onClick={() => usePlayerStore.getState().equipItem(item.id, item.category === 'weapon' ? 'weapon' : 'armor')}
              >
                Equip
              </GuildButton>
            </>
          )
        ) : confirming ? (
          <div className="flex w-full items-center justify-between gap-2 text-xs text-stone-300">
            <span>
              Spend <CoinAmount amount={total.toLocaleString()} />?
            </span>
            <span className="flex gap-1.5">
              <GuildButton variant="ghost" className="px-2 py-1 text-xs" onClick={() => setConfirming(false)}>Cancel</GuildButton>
              <GuildButton className="px-2.5 py-1 text-xs" onClick={buy}>Buy</GuildButton>
            </span>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2">
              <CoinAmount amount={total.toLocaleString()} className={`text-sm font-semibold ${shortBy > 0 ? 'text-red-300' : ''}`} />
              {isConsumable && (
                <div className="flex items-center rounded-md border border-stone-700">
                  <button type="button" aria-label="Fewer" onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-1.5 py-0.5 text-stone-400 hover:text-stone-100">
                    <Minus size={12} />
                  </button>
                  <span className="w-5 text-center text-xs tabular-nums text-stone-200">{qty}</span>
                  <button type="button" aria-label="More" onClick={() => setQty((q) => Math.min(99, q + 1))} className="px-1.5 py-0.5 text-stone-400 hover:text-stone-100">
                    <Plus size={12} />
                  </button>
                </div>
              )}
            </div>
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

/** Armory tab: what you have equipped, then the store. */
export function ArmoryPanel() {
  const [shelf, setShelf] = useState<Shelf>('weapon')
  const consumableInventory = usePlayerStore((s) => s.consumableInventory)
  const items: Item[] = shelf === 'weapon' ? WEAPONS : shelf === 'armor' ? ARMORS : CONSUMABLES
  const pack = CONSUMABLES.filter((c) => (consumableInventory[c.id] ?? 0) > 0)

  return (
    <div className="space-y-8 p-6">
      <section>
        <SectionHeading title="Your loadout" subtitle="Gear applies to every quest automatically." />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <LoadoutSlot slot="weapon" />
          <LoadoutSlot slot="armor" />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-stone-800 bg-stone-950/50 px-4 py-2.5 text-sm">
          <span className="text-stone-400">Pack:</span>
          {pack.length === 0 ? (
            <span className="text-stone-500">empty. Supplies help during timed quests.</span>
          ) : (
            pack.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-stone-800 px-2 py-0.5 text-stone-200" title={c.description}>
                <span aria-hidden="true">{c.icon}</span> {c.name} ×{consumableInventory[c.id]}
              </span>
            ))
          )}
        </div>
      </section>

      <section>
        <SectionHeading
          title="Store"
          action={
            <div className="flex rounded-lg border border-stone-700 bg-stone-950/60 p-0.5" role="tablist">
              {SHELVES.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={shelf === s.id}
                  onClick={() => setShelf(s.id)}
                  className={`rounded-md px-3 py-1 text-xs font-semibold transition-colors ${
                    shelf === s.id ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-stone-100'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          }
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <StoreItem key={item.id} item={item} />
          ))}
        </div>
      </section>
    </div>
  )
}

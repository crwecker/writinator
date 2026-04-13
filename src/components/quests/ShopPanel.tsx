import { useState } from 'react'
import { Coins, Check } from 'lucide-react'
import { usePlayerStore } from '../../stores/playerStore'
import { getItemsByCategory } from '../../lib/items'
import type { Item, WeaponItem, ArmorItem, ConsumableItem, ItemCategory, ItemRarity } from '../../types'
import { EquipmentPanel } from './EquipmentPanel'
import PostRequestTab from './PostRequestTab'

type ShopTab = 'equipment' | 'weapon' | 'armor' | 'consumable' | 'request'

function rarityBorderClass(rarity: ItemRarity): string {
  switch (rarity) {
    case 'common':    return 'border-gray-400'
    case 'uncommon':  return 'border-emerald-400'
    case 'rare':      return 'border-blue-400'
    case 'epic':      return 'border-purple-400'
    case 'legendary': return 'border-amber-400'
  }
}

function rarityTextClass(rarity: ItemRarity): string {
  switch (rarity) {
    case 'common':    return 'text-gray-400'
    case 'uncommon':  return 'text-emerald-400'
    case 'rare':      return 'text-blue-400'
    case 'epic':      return 'text-purple-400'
    case 'legendary': return 'text-amber-400'
  }
}

function rarityLabel(rarity: ItemRarity): string {
  return rarity.charAt(0).toUpperCase() + rarity.slice(1)
}

function getStatLine(item: Item): string {
  if (item.category === 'weapon') {
    const w = item as WeaponItem
    return w.wordMultiplier === 1.0
      ? '1.0× word value (no bonus)'
      : `${w.wordMultiplier}× word value`
  }
  if (item.category === 'armor') {
    const a = item as ArmorItem
    return a.timeBonus === 0
      ? '+0% bonus time (no bonus)'
      : `+${Math.round(a.timeBonus * 100)}% bonus time`
  }
  const c = item as ConsumableItem
  switch (c.effect) {
    case 'pause':        return `Pauses timer for ${c.effectValue}s`
    case 'double-words': return `Next ${c.effectValue} words count double`
    case 'extend-time':  return `Adds ${Math.round(c.effectValue / 60)}m to timer`
    default:             return c.description
  }
}

interface ItemCardProps {
  item: Item
  coins: number
  ownedItems: string[]
  equippedWeapon: string
  equippedArmor: string
  consumableInventory: Record<string, number>
  justPurchased: string | null
  onPurchase: (itemId: string, qty: number) => void
  onEquip: (itemId: string, slot: 'weapon' | 'armor') => void
}

function ItemCard({
  item,
  coins,
  ownedItems,
  equippedWeapon,
  equippedArmor,
  consumableInventory,
  justPurchased,
  onPurchase,
  onEquip,
}: ItemCardProps) {
  const [confirmingBuy, setConfirmingBuy] = useState(false)
  const [consumableQty, setConsumableQty] = useState(1)

  const isOwned = item.category !== 'consumable' && ownedItems.includes(item.id)
  const isEquipped =
    (item.category === 'weapon' && equippedWeapon === item.id) ||
    (item.category === 'armor' && equippedArmor === item.id)

  const ownedCount = item.category === 'consumable' ? (consumableInventory[item.id] ?? 0) : 0
  const effectiveQty = item.category === 'consumable' ? consumableQty : 1
  const totalPrice = item.price * effectiveQty
  const canAfford = coins >= totalPrice
  const isJustPurchased = justPurchased === item.id
  const requiresConfirmation = item.price > 500

  const flashBorder = isJustPurchased ? 'border-emerald-400' : rarityBorderClass(item.rarity)
  const dimmed = !isOwned && !canAfford && item.category !== 'consumable' ? 'opacity-60' : ''

  function handleBuyClick() {
    if (requiresConfirmation && !confirmingBuy) {
      setConfirmingBuy(true)
      return
    }
    onPurchase(item.id, effectiveQty)
    setConfirmingBuy(false)
  }

  function handleCancelConfirm() {
    setConfirmingBuy(false)
  }

  const slot: 'weapon' | 'armor' | null =
    item.category === 'weapon' ? 'weapon' :
    item.category === 'armor' ? 'armor' : null

  return (
    <div
      className={`bg-gray-800 rounded-lg p-3 border-l-4 transition-colors duration-300 ${flashBorder} ${dimmed}`}
    >
      {/* Top row: icon + name + rarity */}
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg leading-none">{item.icon}</span>
        <span className="font-semibold text-gray-200 text-sm flex-1">{item.name}</span>
        <span className={`text-xs font-medium ${rarityTextClass(item.rarity)}`}>
          {rarityLabel(item.rarity)}
        </span>
      </div>

      {/* Description */}
      <p className="text-sm text-gray-400 mb-1">{item.description}</p>

      {/* Stat line */}
      <p className="text-xs text-gray-300 mb-2">{getStatLine(item)}</p>

      {/* Bottom row: price + action */}
      <div className="flex items-center justify-between gap-2">
        {/* Price / owned count */}
        <div className="flex items-center gap-1">
          {item.price === 0 ? (
            <span className="text-xs text-gray-500">Free</span>
          ) : (
            <span className={`flex items-center gap-0.5 text-xs tabular-nums ${canAfford ? 'text-amber-400' : 'text-red-400'}`}>
              <Coins size={11} />
              {item.category === 'consumable' && confirmingBuy
                ? totalPrice.toLocaleString()
                : item.price.toLocaleString()}
            </span>
          )}
          {item.category === 'consumable' && ownedCount > 0 && (
            <span className="text-xs text-gray-500 ml-1">×{ownedCount} owned</span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5">
          {/* Consumable quantity selector */}
          {item.category === 'consumable' && !confirmingBuy && (
            <div className="flex items-center gap-0.5">
              {([1, 5, 10] as const).map((qty) => (
                <button
                  key={qty}
                  onClick={() => setConsumableQty(qty)}
                  className={`text-[10px] px-1.5 py-0.5 rounded transition-colors ${
                    consumableQty === qty
                      ? 'bg-amber-700 text-amber-200'
                      : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                  }`}
                >
                  {qty}
                </button>
              ))}
            </div>
          )}

          {/* Confirmation inline prompt */}
          {confirmingBuy && (
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-gray-400">
                {item.name} for{' '}
                <span className="text-amber-400 tabular-nums">{totalPrice.toLocaleString()}</span>?
              </span>
              <button
                onClick={handleBuyClick}
                className="text-[10px] bg-amber-700 hover:bg-amber-600 text-amber-100 rounded px-2 py-0.5 transition-colors"
              >
                Confirm
              </button>
              <button
                onClick={handleCancelConfirm}
                className="text-[10px] bg-gray-700 hover:bg-gray-600 text-gray-400 rounded px-2 py-0.5 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Equip / Equipped badge (owned weapon/armor) */}
          {!confirmingBuy && isOwned && (
            isEquipped ? (
              <span className="flex items-center gap-0.5 text-xs text-emerald-400 font-medium">
                <Check size={11} />
                Equipped
              </span>
            ) : (
              <>
                <span className="text-xs text-emerald-400 font-medium">Owned</span>
                {slot !== null && (
                  <button
                    onClick={() => onEquip(item.id, slot)}
                    className="text-xs bg-emerald-800 hover:bg-emerald-700 text-emerald-200 rounded px-2 py-0.5 transition-colors"
                  >
                    Equip
                  </button>
                )}
              </>
            )
          )}

          {/* Buy button (not owned, or consumable) */}
          {!confirmingBuy && !isOwned && item.price >= 0 && (
            <button
              onClick={handleBuyClick}
              disabled={!canAfford}
              className="text-xs bg-amber-700 hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-amber-100 rounded px-2.5 py-0.5 transition-colors font-medium"
            >
              Buy
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export function ShopPanel() {
  const [activeTab, setActiveTab] = useState<ShopTab>('equipment')
  const [justPurchased, setJustPurchased] = useState<string | null>(null)

  const coins = usePlayerStore((s) => s.coins)
  const ownedItems = usePlayerStore((s) => s.ownedItems)
  const equippedWeapon = usePlayerStore((s) => s.equippedWeapon)
  const equippedArmor = usePlayerStore((s) => s.equippedArmor)
  const consumableInventory = usePlayerStore((s) => s.consumableInventory)
  const purchaseItem = usePlayerStore((s) => s.purchaseItem)
  const equipItem = usePlayerStore((s) => s.equipItem)

  const tabItems = activeTab !== 'equipment' ? getItemsByCategory(activeTab as ItemCategory) : []

  function handlePurchase(itemId: string, qty: number) {
    if (qty === 1) {
      const success = purchaseItem(itemId)
      if (success) {
        triggerPurchaseFlash(itemId)
      }
    } else {
      // Multiple consumables — purchase one at a time
      let purchased = 0
      for (let i = 0; i < qty; i++) {
        const success = purchaseItem(itemId)
        if (success) purchased++
        else break
      }
      if (purchased > 0) {
        triggerPurchaseFlash(itemId)
      }
    }
  }

  function triggerPurchaseFlash(itemId: string) {
    setJustPurchased(itemId)
    setTimeout(() => setJustPurchased(null), 600)
  }

  function handleEquip(itemId: string, slot: 'weapon' | 'armor') {
    equipItem(itemId, slot)
  }

  const tabs: { id: ShopTab; label: string }[] = [
    { id: 'equipment', label: 'Equipment' },
    { id: 'weapon', label: 'Weapons' },
    { id: 'armor', label: 'Armor' },
    { id: 'consumable', label: 'Consumables' },
    { id: 'request', label: 'Post a Request' },
  ]

  return (
    <div className="flex h-full">
      {/* Left sidebar menu */}
      <nav className="shrink-0 w-44 border-r border-gray-700 bg-gray-900/60 py-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors border-l-2 ${
              activeTab === tab.id
                ? 'bg-gray-800 text-amber-200 border-amber-400'
                : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/60 border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'equipment' ? (
          <EquipmentPanel />
        ) : activeTab === 'request' ? (
          <PostRequestTab />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {tabItems.map((item) => (
              <ItemCard
                key={item.id}
                item={item}
                coins={coins}
                ownedItems={ownedItems}
                equippedWeapon={equippedWeapon}
                equippedArmor={equippedArmor}
                consumableInventory={consumableInventory}
                justPurchased={justPurchased}
                onPurchase={handlePurchase}
                onEquip={handleEquip}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

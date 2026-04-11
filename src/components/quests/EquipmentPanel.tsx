import { useState } from 'react'
import { Shield, Sword, Package, ChevronDown, X } from 'lucide-react'
import { usePlayerStore } from '../../stores/playerStore'
import { getItemById, getWeaponMultiplier, getArmorTimeBonus, WEAPONS, ARMORS } from '../../lib/items'
import type { ItemRarity, ConsumableItem } from '../../types'

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

interface EquipSlotProps {
  slotType: 'weapon' | 'armor'
  equippedId: string
  ownedItems: string[]
  onEquip: (itemId: string, slot: 'weapon' | 'armor') => void
  onUnequip: (slot: 'weapon' | 'armor') => void
}

function EquipSlot({ slotType, equippedId, ownedItems, onEquip, onUnequip }: EquipSlotProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)

  const equipped = getItemById(equippedId)
  const defaultId = slotType === 'weapon' ? 'wooden-pencil' : 'cloth-tunic'
  const isDefault = equippedId === defaultId

  const ownedInSlot = slotType === 'weapon'
    ? WEAPONS.filter((w) => ownedItems.includes(w.id) && w.id !== equippedId)
    : ARMORS.filter((a) => ownedItems.includes(a.id) && a.id !== equippedId)

  const statLine = slotType === 'weapon'
    ? `${getWeaponMultiplier(equippedId)}× word value`
    : `+${Math.round(getArmorTimeBonus(equippedId) * 100)}% bonus time`

  const SlotIcon = slotType === 'weapon' ? Sword : Shield

  return (
    <div className="relative">
      <div
        className={`bg-gray-800 rounded-lg p-3 border-l-4 ${equipped ? rarityBorderClass(equipped.rarity) : 'border-gray-600'}`}
      >
        <div className="flex items-center gap-2 mb-1">
          <SlotIcon size={14} className="text-gray-500 shrink-0" />
          <span className="text-xs text-gray-500 uppercase tracking-wide">
            {slotType === 'weapon' ? 'Weapon' : 'Armor'}
          </span>
        </div>

        {equipped ? (
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base leading-none">{equipped.icon}</span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-gray-200 text-sm truncate">{equipped.name}</span>
                  <span className={`text-xs font-medium shrink-0 ${rarityTextClass(equipped.rarity)}`}>
                    {equipped.rarity.charAt(0).toUpperCase() + equipped.rarity.slice(1)}
                  </span>
                </div>
                <p className="text-xs text-gray-300">{statLine}</p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {!isDefault && (
                <button
                  onClick={() => onUnequip(slotType)}
                  className="text-[10px] flex items-center gap-0.5 bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-gray-300 rounded px-1.5 py-0.5 transition-colors"
                  title="Unequip"
                >
                  <X size={10} />
                </button>
              )}
              {ownedInSlot.length > 0 && (
                <button
                  onClick={() => setDropdownOpen((v) => !v)}
                  className="text-[10px] flex items-center gap-0.5 bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-gray-300 rounded px-2 py-0.5 transition-colors"
                >
                  Swap <ChevronDown size={10} />
                </button>
              )}
            </div>
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">Nothing equipped</p>
        )}
      </div>

      {/* Dropdown for swapping */}
      {dropdownOpen && ownedInSlot.length > 0 && (
        <div className="absolute right-0 top-full mt-1 z-10 bg-gray-800 border border-gray-600 rounded-lg shadow-xl min-w-[200px]">
          {!isDefault && (
            <button
              onClick={() => { onUnequip(slotType); setDropdownOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-400 hover:bg-gray-700 hover:text-gray-300 transition-colors rounded-t-lg border-b border-gray-700"
            >
              <X size={12} />
              Unequip (use default)
            </button>
          )}
          {ownedInSlot.map((item, idx) => (
            <button
              key={item.id}
              onClick={() => { onEquip(item.id, slotType); setDropdownOpen(false) }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-700 transition-colors ${
                idx === ownedInSlot.length - 1 ? 'rounded-b-lg' : ''
              }`}
            >
              <span className="text-base leading-none">{item.icon}</span>
              <span className="flex-1 text-left text-gray-200">{item.name}</span>
              <span className={`text-xs ${rarityTextClass(item.rarity)}`}>
                {item.rarity.charAt(0).toUpperCase() + item.rarity.slice(1)}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function EquipmentPanel() {
  const equippedWeapon = usePlayerStore((s) => s.equippedWeapon)
  const equippedArmor = usePlayerStore((s) => s.equippedArmor)
  const ownedItems = usePlayerStore((s) => s.ownedItems)
  const consumableInventory = usePlayerStore((s) => s.consumableInventory)
  const questStats = usePlayerStore((s) => s.questStats)
  const equipItem = usePlayerStore((s) => s.equipItem)
  const unequipItem = usePlayerStore((s) => s.unequipItem)

  const wordMultiplier = getWeaponMultiplier(equippedWeapon)
  const timeBonus = getArmorTimeBonus(equippedArmor)

  const ownedConsumables = Object.entries(consumableInventory)
    .filter(([, count]) => count > 0)
    .map(([id, count]) => {
      const item = getItemById(id)
      return item ? { item: item as ConsumableItem, count } : null
    })
    .filter((entry): entry is { item: ConsumableItem; count: number } => entry !== null)

  return (
    <div className="space-y-5">
      {/* Equipment Slots */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Equipped Gear
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <EquipSlot
            slotType="weapon"
            equippedId={equippedWeapon}
            ownedItems={ownedItems}
            onEquip={equipItem}
            onUnequip={unequipItem}
          />
          <EquipSlot
            slotType="armor"
            equippedId={equippedArmor}
            ownedItems={ownedItems}
            onEquip={equipItem}
            onUnequip={unequipItem}
          />
        </div>
      </section>

      {/* Stats Summary */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
          Stats
        </h3>
        <div className="bg-gray-800 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-3 gap-3">
          <div>
            <p className="text-xs text-gray-500">Word Multiplier</p>
            <p className="text-sm font-semibold text-amber-300">{wordMultiplier}×</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Time Bonus</p>
            <p className="text-sm font-semibold text-amber-300">+{Math.round(timeBonus * 100)}%</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Quests Done</p>
            <p className="text-sm font-semibold text-gray-200">{questStats.totalCompleted.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Total Words</p>
            <p className="text-sm font-semibold text-gray-200">{questStats.totalWords.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Coins Earned</p>
            <p className="text-sm font-semibold text-gray-200">{questStats.totalCoins.toLocaleString()}</p>
          </div>
        </div>
      </section>

      {/* Consumable Inventory */}
      <section>
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Package size={12} />
          Consumable Inventory
        </h3>

        {ownedConsumables.length === 0 ? (
          <div className="bg-gray-800 rounded-lg p-4 text-center">
            <p className="text-sm text-gray-500">No consumables owned.</p>
            <p className="text-xs text-gray-600 mt-1">Buy them in the Consumables tab.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {ownedConsumables.map(({ item, count }) => (
                <div
                  key={item.id}
                  className={`bg-gray-800 rounded-lg p-3 border-l-4 ${rarityBorderClass(item.rarity)} flex items-center gap-3`}
                >
                  <span className="text-xl leading-none">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-semibold text-gray-200 text-sm truncate">{item.name}</span>
                      <span className="bg-amber-700 text-amber-200 text-[10px] font-bold rounded-full px-1.5 py-0.5 tabular-nums shrink-0">
                        ×{count}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 truncate">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-gray-600 mt-2 text-center">Use consumables during active quests.</p>
          </>
        )}
      </section>
    </div>
  )
}

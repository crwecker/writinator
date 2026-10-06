import { useItemCatalogStore } from '../../stores/itemCatalogStore'
import { capacityOf, carriedWeight, overCapacityWarning } from '../../lib/itemCatalog'
import type { Character, CharacterState, StatValue } from '../../types'

/**
 * "Load 32 / 50" for a character with a capacity stat (weights come from the
 * item catalog). Renders nothing when the character doesn't track capacity.
 */
export function CharacterLoadLine({
  character,
  state,
  effective,
}: {
  character: Character
  state: CharacterState
  effective: Record<string, StatValue>
}) {
  const catalog = useItemCatalogStore((s) => s.items)
  const cap = capacityOf(character, effective)
  if (cap === null) return null
  const weight = carriedWeight(character, state.base, catalog)
  const warning = overCapacityWarning(weight, cap)
  return (
    <div
      data-testid={`character-panel-load-${character.id}`}
      className={`flex items-baseline justify-between rounded px-1.5 py-1 text-[11px] ${
        warning ? 'bg-amber-900/30 text-amber-300' : 'bg-gray-800 text-gray-400'
      }`}
      title="Total item weight from the item catalog"
    >
      <span className="uppercase tracking-wide">{warning ? 'Over capacity' : 'Load'}</span>
      <span className="tabular-nums">
        {weight} / {cap}
      </span>
    </div>
  )
}

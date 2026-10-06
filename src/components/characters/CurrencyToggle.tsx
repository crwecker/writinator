import { useItemCatalogStore } from '../../stores/itemCatalogStore'
import { currencyUnitValue, formatCoins, isCurrencyStat } from '../../lib/itemCatalog'
import type { StatDefinition, StatValue } from '../../types'

/** Character-sheet switch: show a number stat as coins ("2g 50s"). */
export function CurrencyToggle({
  stat,
  value,
  onChange,
}: {
  stat: StatDefinition
  value: StatValue | undefined
  /** Always an explicit true/false: false keeps a coin-named stat ("Gold") from reading as coins. */
  onChange: (currency: boolean) => void
}) {
  const currency = useItemCatalogStore((s) => s.currency)
  if (stat.type !== 'number') return null
  const on = isCurrencyStat(stat, currency)
  const unit = currency.denominations.find((d) => d.value === currencyUnitValue(stat, currency))
  return (
    <div className="mb-2 flex items-center gap-2 text-xs text-gray-400">
      <label className="flex items-center gap-1.5">
        <input
          type="checkbox"
          data-testid={`character-sheet-currency-${stat.id}`}
          checked={on}
          onChange={(e) => onChange(e.target.checked)}
        />
        Currency
      </label>
      {on && (
        <span className="text-gray-500">
          counted in {unit?.name || unit?.abbr || 'coins'}
          {value?.kind === 'number' ? ` · ${formatCoins(value.value * currencyUnitValue(stat, currency), currency)}` : ''}
        </span>
      )}
    </div>
  )
}

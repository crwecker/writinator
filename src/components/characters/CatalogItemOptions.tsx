import { useItemCatalogStore } from '../../stores/itemCatalogStore'

/** `<datalist>` of item catalog names — pair with `<input list={id}>` for autocomplete. */
export function CatalogItemOptions({ id }: { id: string }) {
  const items = useItemCatalogStore((s) => s.items)
  return (
    <datalist id={id}>
      {items.map((it) => (
        <option key={it.id} value={it.name} />
      ))}
    </datalist>
  )
}

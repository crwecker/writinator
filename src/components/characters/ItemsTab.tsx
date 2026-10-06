import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useCharacterStore } from '../../stores/characterStore'
import { syncCatalogWithUsage, useItemCatalogStore } from '../../stores/itemCatalogStore'
import { DEFAULT_CURRENCY, formatCoins, parseCoins } from '../../lib/itemCatalog'
import { createPartyCharacter, partyOf } from '../../lib/party'
import type { CatalogItem, CatalogModifier, CurrencyConfig, ItemRarity } from '../../types'

const RARITIES: ItemRarity[] = ['common', 'uncommon', 'rare', 'epic', 'legendary']

const inputCls =
  'w-full bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-gray-200 placeholder:text-gray-600 outline-none focus:border-blue-400'
const smallBtnCls =
  'text-[11px] text-gray-400 border border-gray-700 hover:border-gray-500 hover:text-gray-200 rounded px-2 py-0.5 transition-colors'

/**
 * Items tab: the book's item catalog (builds itself from items in use; fill
 * in details only if you want them), quick-entry macros, coin denominations
 * and the party stash.
 */
export function ItemsTab() {
  const characters = useCharacterStore((s) => s.characters)
  const markers = useCharacterStore((s) => s.markers)

  // Every item used anywhere shows up here without being added by hand.
  useEffect(() => {
    syncCatalogWithUsage()
  }, [characters, markers])

  return (
    <div data-testid="items-tab" className="space-y-3">
      <Section title="Items" defaultOpen>
        <CatalogSection />
      </Section>
      <Section title="Macros">
        <MacrosSection />
      </Section>
      <Section title="Coins">
        <CurrencySection />
      </Section>
      <Section title="Party stash">
        <PartySection />
      </Section>
    </div>
  )
}

function Section({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-gray-800 rounded overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between bg-gray-800/50 px-2 py-1.5 text-left text-xs font-medium text-gray-300 hover:bg-gray-800"
      >
        <span>{title}</span>
        <span className="text-[10px] text-gray-500">{open ? '▼' : '▶'}</span>
      </button>
      {open && <div className="space-y-1.5 bg-gray-900/40 px-2 py-2">{children}</div>}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

function CatalogSection() {
  const items = useItemCatalogStore((s) => s.items)
  const currency = useItemCatalogStore((s) => s.currency)
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = q ? items.filter((i) => i.name.toLowerCase().includes(q)) : items
    return [...list].sort((a, b) => a.name.localeCompare(b.name))
  }, [items, query])

  function add() {
    const name = newName.trim()
    if (!name) return
    const id = useItemCatalogStore.getState().addItem(name)
    setNewName('')
    setOpenId(id)
  }

  return (
    <>
      <p className="text-[11px] text-gray-500">
        Items appear here the first time they’re used. Add details only if you want them.
      </p>
      {items.length > 6 && (
        <input
          data-testid="items-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter items"
          className={inputCls}
        />
      )}
      {shown.length === 0 && <div className="text-[11px] text-gray-600">(no items yet)</div>}
      <ul className="space-y-1">
        {shown.map((it) => (
          <li key={it.id} className="rounded bg-gray-800">
            <button
              type="button"
              data-testid={`items-row-${it.name}`}
              onClick={() => setOpenId((cur) => (cur === it.id ? null : it.id))}
              className="flex w-full items-baseline justify-between gap-2 px-1.5 py-1 text-left"
              title={it.description}
            >
              <span className="truncate text-xs text-gray-200">{it.name}</span>
              <span className="shrink-0 text-[10px] text-gray-500">{itemSummary(it, currency)}</span>
            </button>
            {openId === it.id && <ItemEditor item={it} currency={currency} onDone={() => setOpenId(null)} />}
          </li>
        ))}
      </ul>
      <div className="flex gap-1">
        <input
          data-testid="items-new-name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') add()
          }}
          placeholder="New item"
          className={inputCls}
        />
        <button type="button" data-testid="items-add" onClick={add} className={smallBtnCls}>
          Add
        </button>
      </div>
    </>
  )
}

function itemSummary(it: CatalogItem, currency: CurrencyConfig): string {
  const parts: string[] = []
  if (it.slot) parts.push(it.slot)
  if (it.weight) parts.push(`${it.weight} wt`)
  if (it.value) parts.push(formatCoins(it.value, currency))
  if (it.modifiers?.length) parts.push(it.modifiers.map(modifierText).join(' '))
  return parts.join(' · ')
}

function modifierText(m: CatalogModifier): string {
  return `${m.amount >= 0 ? '+' : ''}${m.amount}${m.max ? ' max' : ''} ${m.stat}`
}

/** Stat names and attribute keys across all characters, for modifier suggestions. */
function useStatNames(): string[] {
  const characters = useCharacterStore((s) => s.characters)
  return useMemo(() => {
    const out = new Set<string>()
    for (const c of characters) {
      for (const s of c.stats) {
        if (s.type === 'number' || s.type === 'numberWithMax') out.add(s.name)
        if (s.type === 'attributeSet') (s.attributeKeys ?? []).forEach((k) => out.add(k))
      }
    }
    return [...out]
  }, [characters])
}

function useSlotNames(): string[] {
  const characters = useCharacterStore((s) => s.characters)
  return useMemo(() => [...new Set(characters.flatMap((c) => c.equipmentSlots))], [characters])
}

function ItemEditor({ item, currency, onDone }: { item: CatalogItem; currency: CurrencyConfig; onDone: () => void }) {
  const update = (patch: Partial<Omit<CatalogItem, 'id'>>) => useItemCatalogStore.getState().updateItem(item.id, patch)
  const statNames = useStatNames()
  const slotNames = useSlotNames()
  const [valueText, setValueText] = useState(item.value ? formatCoins(item.value, currency) : '')
  const mods = item.modifiers ?? []
  const listId = `items-stat-names-${item.id}`
  const slotListId = `items-slot-names-${item.id}`

  function commitValue(raw: string) {
    const t = raw.trim()
    if (!t) {
      update({ value: undefined })
      return
    }
    // A bare number means the largest coin ("25" = 25 gold).
    const plain = Number(t)
    const units = Number.isFinite(plain) ? plain * Math.max(...currency.denominations.map((d) => d.value), 1) : parseCoins(t, currency)
    if (units === null) {
      setValueText(item.value ? formatCoins(item.value, currency) : '')
      return
    }
    update({ value: units })
    setValueText(formatCoins(units, currency))
  }

  const setMod = (i: number, patch: Partial<CatalogModifier>) =>
    update({ modifiers: mods.map((m, j) => (j === i ? { ...m, ...patch } : m)) })

  return (
    <div
      data-testid={`items-editor-${item.name}`}
      className="space-y-1.5 border-t border-gray-700/60 px-1.5 py-1.5"
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Field label="Name">
        <input
          defaultValue={item.name}
          onBlur={(e) => {
            const name = e.target.value.trim()
            if (name && name !== item.name) update({ name })
          }}
          className={inputCls}
        />
      </Field>
      <Field label="Description">
        <textarea
          data-testid="items-description"
          defaultValue={item.description ?? ''}
          rows={2}
          onBlur={(e) => update({ description: e.target.value.trim() || undefined })}
          className={`${inputCls} resize-y`}
          placeholder="Shown when you hover the item"
        />
      </Field>
      <div className="grid grid-cols-2 gap-1.5">
        <Field label="Value">
          <input
            data-testid="items-value"
            value={valueText}
            onChange={(e) => setValueText(e.target.value)}
            onBlur={(e) => commitValue(e.target.value)}
            placeholder="2g 50s"
            className={inputCls}
          />
        </Field>
        <Field label="Weight">
          <input
            data-testid="items-weight"
            type="number"
            min={0}
            step="any"
            defaultValue={item.weight ?? ''}
            onBlur={(e) => {
              const n = Number(e.target.value)
              update({ weight: e.target.value.trim() && Number.isFinite(n) ? n : undefined })
            }}
            className={inputCls}
          />
        </Field>
        <Field label="Rarity">
          <select
            value={item.rarity ?? ''}
            onChange={(e) => update({ rarity: (e.target.value || undefined) as ItemRarity | undefined })}
            className={inputCls}
          >
            <option value="">—</option>
            {RARITIES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <input
            defaultValue={item.category ?? ''}
            onBlur={(e) => update({ category: e.target.value.trim() || undefined })}
            placeholder="weapon, tool…"
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="Equips in slot">
        <input
          data-testid="items-slot"
          list={slotListId}
          defaultValue={item.slot ?? ''}
          onBlur={(e) => update({ slot: e.target.value.trim() || undefined })}
          placeholder="Weapon"
          className={inputCls}
        />
        <datalist id={slotListId}>
          {slotNames.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Field>
      <Field label="While equipped">
        <datalist id={listId}>
          {statNames.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <div className="space-y-1">
          {mods.map((m, i) => (
            <div key={i} className="flex items-center gap-1">
              <input
                type="number"
                step="any"
                value={m.amount}
                onChange={(e) => setMod(i, { amount: Number(e.target.value) || 0 })}
                className={`${inputCls} w-14`}
                aria-label="Amount"
              />
              <input
                list={listId}
                value={m.stat}
                onChange={(e) => setMod(i, { stat: e.target.value })}
                placeholder="STR"
                className={inputCls}
                aria-label="Stat"
              />
              <label className="flex shrink-0 items-center gap-0.5 text-[10px] text-gray-500" title="Raise the maximum">
                <input type="checkbox" checked={!!m.max} onChange={(e) => setMod(i, { max: e.target.checked || undefined })} />
                max
              </label>
              <button
                type="button"
                onClick={() => update({ modifiers: mods.filter((_, j) => j !== i) })}
                className="shrink-0 px-1 text-gray-500 hover:text-red-300"
                aria-label="Remove modifier"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            data-testid="items-add-modifier"
            onClick={() => update({ modifiers: [...mods, { stat: statNames[0] ?? 'HP', amount: 1 }] })}
            className={smallBtnCls}
          >
            + Bonus
          </button>
        </div>
      </Field>
      <div className="flex justify-between pt-1">
        <button
          type="button"
          onClick={() => useItemCatalogStore.getState().removeItem(item.id)}
          className="text-[11px] text-gray-500 hover:text-red-300"
          title="Items still in use come back the next time the catalog syncs"
        >
          Remove from catalog
        </button>
        <button type="button" onClick={onDone} className={smallBtnCls}>
          Done
        </button>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-0.5">
      <span className="text-[10px] uppercase tracking-wide text-gray-500">{label}</span>
      {children}
    </label>
  )
}

// ---------------------------------------------------------------------------
// Macros
// ---------------------------------------------------------------------------

function MacrosSection() {
  const macros = useItemCatalogStore((s) => s.macros)
  const characters = useCharacterStore((s) => s.characters)
  const store = useItemCatalogStore.getState

  return (
    <>
      <p className="text-[11px] text-gray-500">
        Name a set of changes once, then type “Kael level up” in quick entry.
      </p>
      {macros.map((m) => (
        <div key={m.id} data-testid={`macro-row-${m.name}`} className="space-y-1 rounded bg-gray-800 px-1.5 py-1.5" onKeyDown={(e) => e.stopPropagation()}>
          <div className="flex gap-1">
            <input
              aria-label="Macro name"
              value={m.name}
              onChange={(e) => store().updateMacro(m.id, { name: e.target.value })}
              placeholder="level up"
              className={inputCls}
            />
            <select
              aria-label="Macro character"
              value={m.characterId ?? ''}
              onChange={(e) => store().updateMacro(m.id, { characterId: e.target.value || undefined })}
              className={`${inputCls} w-28 shrink-0`}
            >
              <option value="">Anyone</option>
              {characters.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => store().removeMacro(m.id)}
              className="shrink-0 px-1 text-gray-500 hover:text-red-300"
              aria-label="Delete macro"
            >
              ×
            </button>
          </div>
          <input
            aria-label="Macro changes"
            value={m.body}
            onChange={(e) => store().updateMacro(m.id, { body: e.target.value })}
            placeholder="+1 Level, max HP +10, fill HP"
            spellCheck={false}
            className={`${inputCls} font-mono`}
          />
        </div>
      ))}
      <button
        type="button"
        data-testid="macro-add"
        onClick={() =>
          store().addMacro(
            macros.some((m) => m.name.toLowerCase() === 'level up')
              ? { name: '', body: '' }
              : { name: 'level up', body: '+1 Level, max HP +10, fill HP' },
          )
        }
        className={smallBtnCls}
      >
        + New macro
      </button>
    </>
  )
}

// ---------------------------------------------------------------------------
// Currency
// ---------------------------------------------------------------------------

function CurrencySection() {
  const currency = useItemCatalogStore((s) => s.currency)
  const set = (c: CurrencyConfig) => useItemCatalogStore.getState().setCurrency(c)
  const denoms = currency.denominations
  const setDenom = (i: number, patch: Partial<CurrencyConfig['denominations'][number]>) =>
    set({ denominations: denoms.map((d, j) => (j === i ? { ...d, ...patch } : d)) })

  return (
    <>
      <p className="text-[11px] text-gray-500">
        Stats named after a coin (Gold) show as coins; mark any other number stat as currency on the character sheet. Then type “Kael +2g 50s”.
      </p>
      <div className="grid grid-cols-[1fr_3rem_4.5rem_1rem] gap-1 text-[10px] uppercase tracking-wide text-gray-500">
        <span>Coin</span>
        <span>Short</span>
        <span>Worth</span>
        <span />
      </div>
      {denoms.map((d, i) => (
        <div key={i} className="grid grid-cols-[1fr_3rem_4.5rem_1rem] gap-1" onKeyDown={(e) => e.stopPropagation()}>
          <input aria-label="Coin name" value={d.name} onChange={(e) => setDenom(i, { name: e.target.value })} className={inputCls} />
          <input aria-label="Coin abbreviation" value={d.abbr} onChange={(e) => setDenom(i, { abbr: e.target.value })} className={inputCls} />
          <input
            aria-label="Coin worth in the smallest coin"
            type="number"
            min={1}
            value={d.value}
            onChange={(e) => setDenom(i, { value: Math.max(1, Number(e.target.value) || 1) })}
            className={inputCls}
          />
          <button
            type="button"
            disabled={denoms.length <= 1}
            onClick={() => set({ denominations: denoms.filter((_, j) => j !== i) })}
            className="text-gray-500 hover:text-red-300 disabled:opacity-30"
            aria-label="Remove coin"
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => set({ denominations: [...denoms, { name: '', abbr: '', value: 1 }] })}
          className={smallBtnCls}
        >
          + Coin
        </button>
        <button type="button" onClick={() => set(DEFAULT_CURRENCY)} className={smallBtnCls}>
          Reset to g/s/c
        </button>
      </div>
      <p className="text-[10px] text-gray-600">Example: {formatCoins(25073, currency)}</p>
    </>
  )
}

// ---------------------------------------------------------------------------
// Party stash
// ---------------------------------------------------------------------------

function PartySection() {
  const characters = useCharacterStore((s) => s.characters)
  const party = partyOf(characters)
  if (party) {
    return (
      <p data-testid="party-info" className="text-[11px] text-gray-400">
        <span className="font-medium" style={{ color: party.color }}>
          {party.name}
        </span>{' '}
        holds shared coins and gear. Try “{party.name} +200 Gold”, “Kael stashes Rope”, “Kael takes Rope from{' '}
        {party.name}”.
      </p>
    )
  }
  return (
    <>
      <p className="text-[11px] text-gray-500">A shared inventory and purse for the whole group.</p>
      <button
        type="button"
        data-testid="party-create"
        onClick={() => useCharacterStore.getState().addCharacter(createPartyCharacter())}
        className={smallBtnCls}
      >
        Add party stash
      </button>
    </>
  )
}

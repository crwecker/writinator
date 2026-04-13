import { useMemo } from 'react'
import { useCharacterStore } from '../../stores/characterStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { computeStateAt } from '../../lib/characterState'
import type {
  ActiveBuff,
  Character,
  EquippedItem,
  StatDefinition,
  StatValue,
} from '../../types'

interface StatBlockWidgetProps {
  characterId: string
  fields?: string[]
  storyletId: string
  offsetInStorylet: number
}

const DEFAULT_FIELD_IDS = ['hp', 'mp', 'level', 'xp', 'attributes']

function formatScalar(v: StatValue): string {
  switch (v.kind) {
    case 'number':
      return String(v.value)
    case 'numberWithMax':
      return `${v.value}/${v.max}`
    case 'text':
      return v.value || '—'
    case 'list':
      return v.items.length === 0 ? '(none)' : v.items.join(', ')
    case 'attributeSet':
      return Object.entries(v.values)
        .map(([k, n]) => `${k} ${n}`)
        .join(' • ')
    case 'rank':
      return v.tier
  }
}

function StatRow({
  def,
  value,
}: {
  def: StatDefinition
  value: StatValue | undefined
}) {
  if (!value) return null
  if (value.kind === 'list') {
    return (
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 py-0.5">
        <span className="text-[11px] uppercase tracking-wider text-gray-400">
          {def.name}
        </span>
        {value.items.length === 0 ? (
          <span className="text-xs text-gray-500 italic">none</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {value.items.map((it, i) => (
              <span
                key={`${it}-${i}`}
                className="rounded bg-gray-700/70 px-1.5 py-0.5 text-[11px] text-gray-200"
              >
                {it}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }
  if (value.kind === 'attributeSet') {
    return (
      <div className="py-0.5">
        <div className="text-[11px] uppercase tracking-wider text-gray-400 mb-0.5">
          {def.name}
        </div>
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 font-mono text-xs text-gray-100">
          {Object.entries(value.values).map(([k, n], i, arr) => (
            <span key={k}>
              <span className="text-gray-400">{k}</span>{' '}
              <span className="text-gray-100">{n}</span>
              {i < arr.length - 1 && (
                <span className="ml-3 text-gray-600">•</span>
              )}
            </span>
          ))}
        </div>
      </div>
    )
  }
  if (value.kind === 'rank') {
    return (
      <div className="flex items-baseline justify-between py-0.5">
        <span className="text-[11px] uppercase tracking-wider text-gray-400">
          {def.name}
        </span>
        <span className="inline-flex items-center rounded border border-amber-700/50 bg-amber-900/30 px-1.5 py-0.5 font-mono text-xs font-semibold text-amber-300">
          {value.tier}
        </span>
      </div>
    )
  }
  return (
    <div className="flex items-baseline justify-between py-0.5">
      <span className="text-[11px] uppercase tracking-wider text-gray-400">
        {def.name}
      </span>
      <span className="font-mono text-sm text-gray-100">
        {formatScalar(value)}
      </span>
    </div>
  )
}

function EquipmentSection({
  equipped,
  slots,
}: {
  equipped: Record<string, EquippedItem>
  slots: string[]
}) {
  const entries = Object.entries(equipped)
  if (entries.length === 0) return null
  const ordered: [string, EquippedItem][] = []
  for (const slot of slots) {
    if (equipped[slot]) ordered.push([slot, equipped[slot]])
  }
  for (const [slot, item] of entries) {
    if (!slots.includes(slot)) ordered.push([slot, item])
  }
  return (
    <div className="mt-2 border-t border-gray-700/60 pt-2">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-gray-500">
        Equipped
      </div>
      <div className="space-y-0.5">
        {ordered.map(([slot, item]) => (
          <div
            key={slot}
            className="flex items-baseline justify-between text-xs"
          >
            <span className="text-gray-400">{slot}</span>
            <span className="font-mono text-gray-200">
              {item.itemName ?? item.itemId}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function BuffsSection({ buffs }: { buffs: ActiveBuff[] }) {
  if (buffs.length === 0) return null
  return (
    <div className="mt-2 border-t border-gray-700/60 pt-2">
      <div className="mb-1 text-[10px] uppercase tracking-wider text-gray-500">
        Active Buffs
      </div>
      <div className="space-y-0.5">
        {buffs.map((b) => (
          <div
            key={b.buffId}
            className="flex items-baseline justify-between text-xs"
          >
            <span className="text-gray-200">{b.buffName ?? b.buffId}</span>
            {typeof b.remaining === 'number' && (
              <span className="font-mono text-[10px] text-gray-500">
                {b.remaining} left
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function StatBlockWidget({
  characterId,
  fields,
  storyletId,
  offsetInStorylet,
}: StatBlockWidgetProps) {
  const characters = useCharacterStore((s) => s.characters)
  const markers = useCharacterStore((s) => s.markers)
  const book = useStoryletStore((s) => s.book)

  const character: Character | undefined = useMemo(
    () => characters.find((c) => c.id === characterId),
    [characters, characterId]
  )

  const computed = useMemo(() => {
    if (!character || !book) return null
    return computeStateAt(character, book, markers, {
      storyletId,
      offset: offsetInStorylet,
    })
  }, [character, book, markers, storyletId, offsetInStorylet])

  if (!character) {
    return (
      <div
        data-testid="statblock-widget-missing"
        className="my-2 rounded border border-dashed border-gray-700 bg-gray-900/40 px-3 py-2 text-xs text-gray-500"
      >
        [missing character: {characterId}]
      </div>
    )
  }

  if (!computed || !book) {
    return null
  }

  // Pick definitions to render
  const fieldsToShow = fields && fields.length > 0 ? fields : DEFAULT_FIELD_IDS
  const defsById = new Map(character.stats.map((s) => [s.id, s]))
  const defsByNameLower = new Map(
    character.stats.map((s) => [s.name.toLowerCase(), s])
  )
  const resolved: StatDefinition[] = []
  const seen = new Set<string>()
  for (const key of fieldsToShow) {
    const lower = key.toLowerCase()
    const def = defsById.get(key) ?? defsByNameLower.get(lower)
    if (def && !seen.has(def.id)) {
      resolved.push(def)
      seen.add(def.id)
    }
  }
  // If nothing matched (default list didn't hit any stat ids), fall back to all
  if (resolved.length === 0) {
    for (const def of character.stats) {
      if (!seen.has(def.id)) {
        resolved.push(def)
        seen.add(def.id)
      }
    }
  }

  return (
    <div
      data-testid={`statblock-widget-${character.id}`}
      className="my-3 rounded-md border border-gray-700 bg-gray-900/80 px-4 py-3 shadow-inner"
      style={{ maxWidth: '100%' }}
    >
      <div className="mb-2 flex items-center justify-between border-b border-gray-700/60 pb-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: character.color }}
          />
          <span className="text-sm font-semibold tracking-wide text-gray-100">
            {character.name}
          </span>
        </div>
        <span className="text-[10px] uppercase tracking-[0.2em] text-gray-500">
          System Status
        </span>
      </div>

      <div className="space-y-0.5">
        {resolved.map((def) => (
          <StatRow
            key={def.id}
            def={def}
            value={computed.effective[def.id]}
          />
        ))}
      </div>

      <EquipmentSection
        equipped={computed.state.equipped}
        slots={character.equipmentSlots}
      />
      <BuffsSection buffs={computed.state.activeBuffs} />
    </div>
  )
}

import { useMemo } from 'react'
import StatBlockWidget from './StatBlockWidget'
import { useCharacterStore } from '../../stores/characterStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { computeStateAt } from '../../lib/characterState'
import { resolveStatblockDefinitions } from '../../lib/markerUtils'
import { STATBLOCK_VALUE_FORMAT, formatStatValue } from '../../lib/statFormat'
import type { Book, StatValue } from '../../types'

interface Props {
  characterId: string
  fields?: string[]
  storyletId: string
  offsetInStorylet: number
  book?: Book | null
}

function valueText(v: StatValue): string {
  if (v.kind === 'list') return v.items.length === 0 ? STATBLOCK_VALUE_FORMAT.emptyList : v.items.join(', ')
  if (v.kind === 'inventory') {
    return v.items.length === 0
      ? STATBLOCK_VALUE_FORMAT.emptyList
      : v.items.map((it) => ((it.fields.qty ?? 1) > 1 ? `${it.name} ×${it.fields.qty}` : it.name)).join(', ')
  }
  if (v.kind === 'spellList' || v.kind === 'skillList') {
    return v.items.length === 0 ? STATBLOCK_VALUE_FORMAT.emptyList : v.items.map((it) => it.name).join(', ')
  }
  return formatStatValue(v, STATBLOCK_VALUE_FORMAT)
}

/**
 * A status block in the book's chosen look: the classic card
 * (`StatBlockWidget`), a blue LitRPG "system message" window, or one line.
 */
export default function ThemedStatBlock(props: Props) {
  const theme = useStoryletStore((s) => s.globalSettings.statblockTheme ?? 'classic')
  if (theme === 'classic') return <StatBlockWidget {...props} />
  return <AltStatBlock {...props} theme={theme} />
}

function AltStatBlock({
  characterId,
  fields,
  storyletId,
  offsetInStorylet,
  book: liveBook,
  theme,
}: Props & { theme: 'system' | 'minimal' }) {
  const character = useCharacterStore((s) => s.characters.find((c) => c.id === characterId))
  const markers = useCharacterStore((s) => s.markers)
  const storeBook = useStoryletStore((s) => s.book)
  const book = liveBook ?? storeBook

  const computed = useMemo(
    () => (character && book ? computeStateAt(character, book, markers, { storyletId, offset: offsetInStorylet }) : null),
    [character, book, markers, storyletId, offsetInStorylet],
  )

  if (!character) {
    return (
      <div className="my-2 text-xs text-gray-500 italic">[missing character: {characterId}]</div>
    )
  }
  if (!computed) return null

  const rows = resolveStatblockDefinitions(character, fields)
    .map((def) => ({ def, value: computed.effective[def.id] }))
    .filter((r): r is { def: typeof r.def; value: StatValue } => !!r.value)

  if (theme === 'minimal') {
    return (
      <div data-statblock-theme="minimal" className="my-1 text-[13px] italic text-gray-400">
        <span className="not-italic font-medium" style={{ color: character.color }}>{character.name}</span>
        {' — '}
        {rows.map((r) => `${r.def.name} ${valueText(r.value)}`).join(' · ')}
      </div>
    )
  }

  const equipped = Object.entries(computed.state.equipped)
  const buffs = computed.state.activeBuffs
  return (
    <div
      data-statblock-theme="system"
      className="my-3 rounded border border-blue-500/60 bg-blue-950/70 px-4 py-3 font-mono text-[13px] text-blue-100 shadow-[0_0_14px_rgba(59,130,246,0.25)]"
    >
      <div className="mb-2 border-b border-blue-800/80 pb-1.5 text-center text-[11px] tracking-[0.25em] text-blue-300">
        [ STATUS — {character.name} ]
      </div>
      <div className="space-y-0.5">
        {rows.map((r) => (
          <div key={r.def.id} className="flex gap-2">
            <span className="shrink-0 text-blue-300">{r.def.name}:</span>
            <span className="min-w-0 break-words">{valueText(r.value)}</span>
          </div>
        ))}
        {equipped.length > 0 && (
          <div className="flex gap-2">
            <span className="shrink-0 text-blue-300">Equipped:</span>
            <span>{equipped.map(([slot, it]) => `${slot}: ${it.itemName ?? it.itemId}`).join('; ')}</span>
          </div>
        )}
        {buffs.length > 0 && (
          <div className="flex gap-2">
            <span className="shrink-0 text-blue-300">Buffs:</span>
            <span>{buffs.map((b) => b.buffName ?? b.buffId).join(', ')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

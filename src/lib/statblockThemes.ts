import type { Character, CharacterState, StatblockTheme, StatValue } from '../types'
import { resolveStatblockDefinitions } from './markerUtils'
import { EXPORT_VALUE_FORMAT, formatStatValue } from './statFormat'

export type ThemedStatblockFormat = 'markdown' | 'html' | 'docx' | 'epub' | 'plain'

export const STATBLOCK_THEMES: Array<{ id: StatblockTheme; label: string; description: string }> = [
  { id: 'classic', label: 'Classic box', description: 'Bordered status card' },
  { id: 'system', label: 'System message', description: 'Blue LitRPG system window' },
  { id: 'minimal', label: 'Minimal', description: 'One quiet line' },
]

function esc(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function rows(character: Character, effective: Record<string, StatValue>, fields: string[] | undefined) {
  const out: Array<{ label: string; value: string }> = []
  for (const def of resolveStatblockDefinitions(character, fields)) {
    const v = effective[def.id]
    if (v) out.push({ label: def.name, value: formatStatValue(v, EXPORT_VALUE_FORMAT, def) })
  }
  return out
}

/**
 * A statblock in the "system" or "minimal" look as export text (the classic
 * look stays in `renderStatblockText`). System: a titled window with one stat
 * per line plus equipment and buffs. Minimal: name and stats on one line.
 */
export function renderThemedStatblockText(
  character: Character,
  state: CharacterState,
  effective: Record<string, StatValue>,
  fields: string[] | undefined,
  format: ThemedStatblockFormat,
  theme: Exclude<StatblockTheme, 'classic'>,
): string {
  const lines = rows(character, effective, fields)
  const html = format !== 'markdown' && format !== 'plain'

  if (theme === 'minimal') {
    const text = `${character.name} — ${lines.map((l) => `${l.label} ${l.value}`).join(' · ')}`
    if (format === 'markdown') return `*${text}*`
    if (!html) return text
    return `<p class="writinator-statblock writinator-statblock-minimal" style="font-size:0.9em;color:#666;font-style:italic;margin:8px 0;">${esc(text)}</p>`
  }

  const equipped = Object.entries(state.equipped).map(([slot, it]) => `${slot}: ${it.itemName ?? it.itemId}`)
  const buffs = state.activeBuffs.map((b) => b.buffName ?? b.buffId)
  const title = `STATUS — ${character.name}`
  const body = [
    ...lines.map((l) => `${l.label}: ${l.value}`),
    ...(equipped.length > 0 ? [`Equipped: ${equipped.join('; ')}`] : []),
    ...(buffs.length > 0 ? [`Buffs: ${buffs.join(', ')}`] : []),
  ]
  if (!html) {
    const text = [`[ ${title} ]`, ...body].join('\n')
    return format === 'markdown' ? '```\n' + text + '\n```' : text
  }
  const rowHtml = body
    .map((line) => {
      const i = line.indexOf(': ')
      return `<div><span style="color:#93c5fd;">${esc(line.slice(0, i))}:</span> ${esc(line.slice(i + 2))}</div>`
    })
    .join('')
  return (
    `<div class="writinator-statblock writinator-statblock-system" style="border:1px solid #3b82f6;border-radius:4px;padding:10px 14px;margin:12px 0;background:#0b1a33;color:#dbeafe;font-family:monospace;box-shadow:0 0 12px rgba(59,130,246,0.35);">` +
    `<div style="text-align:center;font-weight:600;letter-spacing:0.12em;color:#bfdbfe;border-bottom:1px solid #1e40af;padding-bottom:4px;margin-bottom:6px;">[ ${esc(title)} ]</div>` +
    `${rowHtml}</div>`
  )
}

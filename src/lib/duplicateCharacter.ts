import type { Character } from '../types'

function copyName(name: string, taken: Set<string>): string {
  const first = `${name} (copy)`
  if (!taken.has(first.toLowerCase())) return first
  for (let n = 2; ; n++) {
    const candidate = `${name} (copy ${n})`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
}

/**
 * A copy of a character sheet for a new party member: new id and name
 * ("Kael (copy)"), same stats, base values and slots. Change markers belong
 * to the original and are not copied. The party-stash role isn't either.
 */
export function duplicateCharacter(source: Character, existingNames: string[] = [], color?: string): Character {
  const now = new Date().toISOString()
  const taken = new Set(existingNames.map((n) => n.toLowerCase()))
  const copy: Character = {
    id: crypto.randomUUID(),
    name: copyName(source.name, taken),
    color: color ?? source.color,
    stats: structuredClone(source.stats),
    baseValues: structuredClone(source.baseValues),
    equipmentSlots: [...source.equipmentSlots],
    createdAt: now,
    updatedAt: now,
  }
  return copy
}

import type { StatDelta } from '../types'
import { delta } from './fixtures'

/** `<!-- stat:id -->` text for a marker id. */
export function m(id: string): string {
  return `<!-- stat:${id} -->`
}

/** A one-delta marker entry for `characterId`. */
export function one(characterId: string, op: StatDelta['op'], id?: string): StatDelta[] {
  return [delta(characterId, op, id)]
}

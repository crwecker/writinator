import type {
  Book,
  Character,
  StatDefinition,
  StatDelta,
  StatValue,
  Storylet,
  WritinatorFile,
} from '../types'
import { useStoryletStore } from '../stores/storyletStore'
import { useCharacterStore } from '../stores/characterStore'

const T = '2026-01-01T00:00:00.000Z'

export function makeStorylet(id: string, content: string | null, extra: Partial<Storylet> = {}): Storylet {
  return { id, name: id, content, createdAt: T, updatedAt: T, ...extra }
}

export function makeBook(storylets: Storylet[], id = 'book-1'): Book {
  return { id, title: 'Test Book', storylets, createdAt: T, updatedAt: T }
}

export function seedStore(book: Book, activeStoryletId: string | null = book.storylets[0]?.id ?? null): void {
  useStoryletStore.setState({
    book,
    activeStoryletId,
    globalSettings: {},
    lastSavedCounter: 0,
    lastSavedAt: null,
    _contentUpdateTimer: null,
    _pendingContent: null,
  })
}

export function storyletContent(id: string): string | null | undefined {
  return useStoryletStore.getState().book?.storylets.find((s) => s.id === id)?.content
}

export function makeCharacter(
  id: string,
  stats: StatDefinition[],
  baseValues: Record<string, StatValue>,
): Character {
  return { id, name: id, color: '#ffffff', stats, baseValues, equipmentSlots: [], createdAt: T, updatedAt: T }
}

export function seedCharacters(characters: Character[], markers: Record<string, StatDelta[]>): void {
  useCharacterStore.setState({ characters, markers })
}

export function delta(characterId: string, op: StatDelta['op'], id: string = crypto.randomUUID()): StatDelta {
  return { id, characterId, op }
}

export function makeFile(book: Book, extra: Partial<WritinatorFile> = {}): WritinatorFile {
  return {
    version: 8,
    book,
    snapshots: {},
    publishedSnapshots: {},
    globalSettings: {},
    characters: [],
    markers: {},
    saveCounter: 1,
    ...extra,
  }
}

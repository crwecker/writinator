import { useMemo } from 'react'
import { getStoryletTreeOrder } from '../../lib/characterState'
import { extractMarkers } from '../../lib/markerUtils'
import { formatOpSummary, statNameLookup } from '../../lib/statFormat'
import type { Book, Character, StatDelta } from '../../types'

interface ChangeEntry {
  markerId: string
  storyletId: string
  storyletName: string
  offset: number
  deltas: StatDelta[]
}

export function ChangesTab({
  book,
  characters,
  markers,
  onJumpToMarker,
}: {
  book: Book | null
  characters: Character[]
  markers: Record<string, StatDelta[]>
  onJumpToMarker: (storyletId: string, offset: number) => void
}) {
  const entries = useMemo<ChangeEntry[]>(() => {
    const out: ChangeEntry[] = []
    if (!book) return out
    for (const storylet of getStoryletTreeOrder(book)) {
      const extracted = extractMarkers(storylet.content ?? '')
      for (const marker of extracted) {
        if (marker.kind !== 'delta') continue
        const deltas = markers[marker.id]
        if (!deltas || deltas.length === 0) continue
        out.push({
          markerId: marker.id,
          storyletId: storylet.id,
          storyletName: storylet.name,
          offset: marker.offset,
          deltas,
        })
      }
    }
    return out
  }, [book, markers])

  if (!book) {
    return <div className="text-center text-xs text-gray-500 py-8">No active book.</div>
  }
  if (entries.length === 0) {
    return (
      <div
        data-testid="character-panel-changes-empty"
        className="text-center text-xs text-gray-500 py-8"
      >
        No stat changes in this book yet.
      </div>
    )
  }

  const charById = new Map(characters.map((c) => [c.id, c]))
  let lastDocId: string | null = null

  return (
    <div className="space-y-2" data-testid="character-panel-changes">
      {entries.map((entry) => {
        const newDoc = entry.storyletId !== lastDocId
        lastDocId = entry.storyletId
        return (
          <div key={entry.markerId}>
            {newDoc && (
              <div className="text-[10px] uppercase tracking-wide text-gray-500 pt-2 pb-1">
                {entry.storyletName}
              </div>
            )}
            <button
              data-testid="character-panel-change-row"
              onClick={() => onJumpToMarker(entry.storyletId, entry.offset)}
              className="w-full text-left px-2 py-1.5 bg-gray-800/40 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded transition-colors space-y-1"
            >
              {entry.deltas.map((d) => {
                const c = charById.get(d.characterId)
                return (
                  <div key={d.id} className="flex items-baseline gap-1.5 text-[11px]">
                    <span
                      className="w-2 h-2 rounded-full shrink-0 translate-y-[1px]"
                      style={{ backgroundColor: c?.color ?? '#6b7280' }}
                    />
                    <span className="text-gray-400 shrink-0">
                      {c?.name ?? 'Unknown'}
                    </span>
                    <span className="text-gray-200 truncate">
                      {formatOpSummary(d.op, statNameLookup(c))}
                    </span>
                  </div>
                )
              })}
              {entry.deltas.some((d) => d.note) && (
                <div className="text-[10px] text-gray-500 italic truncate pl-3.5">
                  {entry.deltas
                    .map((d) => d.note)
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              )}
            </button>
          </div>
        )
      })}
    </div>
  )
}

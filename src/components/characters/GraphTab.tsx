import { ProgressionGraph } from './ProgressionGraph'
import type { Character } from '../../types'

interface GraphTabProps {
  characters: Character[]
  graphCharacterId: string
  setGraphCharacterId: (id: string) => void
}

export function GraphTab({ characters, graphCharacterId, setGraphCharacterId }: GraphTabProps) {
  if (characters.length === 0) {
    return (
      <div className="text-center text-xs text-gray-500 py-8">No characters yet.</div>
    )
  }
  const activeId = characters.find((c) => c.id === graphCharacterId)
    ? graphCharacterId
    : characters[0].id
  return (
    <div className="space-y-3">
      {characters.length > 1 && (
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-wide text-gray-500">
            Character
          </span>
          <select
            data-testid="character-panel-graph-character-select"
            value={activeId}
            onChange={(e) => setGraphCharacterId(e.target.value)}
            className="flex-1 bg-gray-800 text-gray-200 text-xs border border-gray-700 rounded px-2 py-1"
          >
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      <ProgressionGraph characterId={activeId} />
    </div>
  )
}

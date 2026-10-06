import type { ReactNode } from 'react'
import type { EditorView } from '@codemirror/view'
import type { Book, Character, ConsistencyIssue } from '../../types'

interface IssuesTabProps {
  issues: ConsistencyIssue[]
  characters: Character[]
  book: Book | null
  editorView: EditorView | null
  onJumpToMarker: (storyletId: string, offset: number) => void
  onRemoveOrphanFromText: (markerId: string, storyletId: string) => void
  onCreateEmptyDelta: (markerId: string) => void
  onDeleteInverseOrphan: (markerId: string) => void
  onAddSlot: (characterId: string, slot: string) => void
}

function groupIssues(issues: ConsistencyIssue[]): Record<ConsistencyIssue['kind'], ConsistencyIssue[]> {
  const groups: Record<ConsistencyIssue['kind'], ConsistencyIssue[]> = {
    orphanMarker: [],
    inverseOrphan: [],
    impossibleValue: [],
    missingSlot: [],
    unequipEmpty: [],
  }
  for (const i of issues) {
    groups[i.kind].push(i)
  }
  return groups
}

const KIND_LABELS: Record<ConsistencyIssue['kind'], string> = {
  orphanMarker: 'Orphan Markers',
  inverseOrphan: 'Inverse Orphans',
  impossibleValue: 'Impossible Values',
  missingSlot: 'Missing Slots',
  unequipEmpty: 'Unequip of Empty Slot',
}

export function IssuesTab({
  issues,
  characters,
  book,
  onJumpToMarker,
  onRemoveOrphanFromText,
  onCreateEmptyDelta,
  onDeleteInverseOrphan,
  onAddSlot,
}: IssuesTabProps) {
  if (!book) {
    return <div className="text-center text-xs text-gray-500 py-8">No active book.</div>
  }
  if (issues.length === 0) {
    return (
      <div
        data-testid="character-panel-issues-empty"
        className="text-center text-xs text-gray-500 py-8"
      >
        All clear — no consistency issues.
      </div>
    )
  }
  const groups = groupIssues(issues)
  const characterName = (id: string) =>
    characters.find((c) => c.id === id)?.name ?? 'Unknown'
  const docName = (id: string | undefined) =>
    id ? book.storylets.find((d) => d.id === id)?.name ?? '(unknown doc)' : '(unknown doc)'

  return (
    <div className="space-y-3" data-testid="character-panel-issues">
      {(Object.keys(groups) as ConsistencyIssue['kind'][]).map((kind) => {
        const list = groups[kind]
        if (list.length === 0) return null
        return (
          <div key={kind} className="border border-gray-800 rounded overflow-hidden">
            <div className="px-2 py-1.5 bg-gray-800/60 text-[11px] text-gray-300 flex justify-between items-center">
              <span>{KIND_LABELS[kind]}</span>
              <span className="text-gray-500">{list.length}</span>
            </div>
            <ul className="divide-y divide-gray-800/60">
              {list.map((issue, i) => (
                <li
                  key={`${kind}-${i}`}
                  data-testid={`character-panel-issue-${kind}`}
                  className="px-2 py-2 text-[11px] text-gray-300 space-y-1"
                >
                  {issue.kind === 'orphanMarker' && (
                    <>
                      <div>
                        <span className="text-gray-500">Marker </span>
                        <code className="text-gray-400">{issue.markerId.slice(0, 8)}…</code>
                        <span className="text-gray-500"> in </span>
                        <span className="text-gray-300">{docName(issue.storyletId)}</span>
                      </div>
                      <div className="flex gap-1.5 flex-wrap">
                        <IssueButton onClick={() => onRemoveOrphanFromText(issue.markerId, issue.storyletId)}>
                          Remove from text
                        </IssueButton>
                        <IssueButton onClick={() => onCreateEmptyDelta(issue.markerId)}>
                          Create empty entry
                        </IssueButton>
                        <IssueButton onClick={() => onJumpToMarker(issue.storyletId, issue.offset)}>
                          Jump
                        </IssueButton>
                      </div>
                    </>
                  )}
                  {issue.kind === 'inverseOrphan' && (
                    <>
                      <div>
                        <span className="text-gray-500">Store entry </span>
                        <code className="text-gray-400">{issue.markerId.slice(0, 8)}…</code>
                        <span className="text-gray-500"> has no text reference.</span>
                      </div>
                      <div className="flex gap-1.5">
                        <IssueButton onClick={() => onDeleteInverseOrphan(issue.markerId)}>
                          Delete store entry
                        </IssueButton>
                      </div>
                    </>
                  )}
                  {issue.kind === 'impossibleValue' && (
                    <>
                      <div>
                        <span className="text-gray-300">{characterName(issue.characterId)}</span>
                        <span className="text-gray-500"> — </span>
                        <span className="text-gray-300">{issue.reason}</span>
                      </div>
                      {issue.storyletId && typeof issue.offset === 'number' && (
                        <div className="flex gap-1.5">
                          <IssueButton
                            onClick={() =>
                              onJumpToMarker(issue.storyletId as string, issue.offset as number)
                            }
                          >
                            Jump to marker
                          </IssueButton>
                        </div>
                      )}
                    </>
                  )}
                  {issue.kind === 'missingSlot' && (
                    <>
                      <div>
                        <span className="text-gray-300">{characterName(issue.characterId)}</span>
                        <span className="text-gray-500"> has no slot </span>
                        <span className="text-gray-300">"{issue.slot}"</span>
                      </div>
                      <div className="flex gap-1.5">
                        <IssueButton
                          onClick={() => onAddSlot(issue.characterId, issue.slot)}
                        >
                          Add slot
                        </IssueButton>
                      </div>
                    </>
                  )}
                  {issue.kind === 'unequipEmpty' && (
                    <>
                      <div>
                        <span className="text-gray-300">{characterName(issue.characterId)}</span>
                        <span className="text-gray-500"> — unequip of empty </span>
                        <span className="text-gray-300">"{issue.slot}"</span>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

function IssueButton({
  onClick,
  children,
}: {
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className="px-2 py-0.5 text-[10px] text-gray-300 border border-gray-700 hover:border-gray-500 hover:bg-gray-800 rounded transition-colors"
    >
      {children}
    </button>
  )
}

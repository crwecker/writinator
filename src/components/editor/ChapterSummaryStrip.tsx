import { useMemo } from 'react'
import { ChevronDown, ChevronRight, X } from 'lucide-react'
import { useCharacterStore } from '../../stores/characterStore'
import { useStoryletStore } from '../../stores/storyletStore'
import { summarizeChapter, formatChapterSummary } from '../../lib/chapterSummary'
import { useMechanicsPrefsStore } from './mechanicsPrefsStore'

/**
 * A slim line above the editor with the open chapter's net stat changes
 * ("This chapter: Kael HP −15 (40 → 25), +2 items"). Hidden when the chapter
 * has no change markers or the strip is turned off.
 */
export function ChapterSummaryStrip() {
  const show = useMechanicsPrefsStore((s) => s.showChapterSummary)
  const collapsed = useMechanicsPrefsStore((s) => s.chapterSummaryCollapsed)
  const book = useStoryletStore((s) => s.book)
  const storyletId = useStoryletStore((s) => s.activeStoryletId)
  const characters = useCharacterStore((s) => s.characters)
  const markers = useCharacterStore((s) => s.markers)

  const summary = useMemo(
    () => (show && book && storyletId ? summarizeChapter(book, storyletId, characters, markers) : []),
    [show, book, storyletId, characters, markers],
  )

  if (summary.length === 0) return null
  const { toggleChapterSummaryCollapsed, setShowChapterSummary } = useMechanicsPrefsStore.getState()

  return (
    <div
      data-testid="chapter-summary-strip"
      className="w-full max-w-[800px] mx-auto px-8 pt-2 flex items-start gap-1.5 text-[11px] text-gray-500"
      title={`This chapter: ${formatChapterSummary(summary)}`}
    >
      <button
        onClick={toggleChapterSummaryCollapsed}
        className="shrink-0 mt-px text-gray-600 hover:text-gray-300"
        aria-label={collapsed ? 'Show chapter changes' : 'Fold chapter changes'}
        aria-expanded={!collapsed}
      >
        {collapsed ? <ChevronRight size={12} /> : <ChevronDown size={12} />}
      </button>
      <div className={`min-w-0 flex-1 ${collapsed ? 'truncate' : ''}`}>
        <span className="text-gray-600 uppercase tracking-wider text-[10px] mr-1.5">This chapter</span>
        {summary.map((s, i) => (
          <span key={s.characterId}>
            {i > 0 && <span className="text-gray-700"> · </span>}
            <span className="font-medium" style={{ color: s.color }}>{s.name}</span>{' '}
            <span className="text-gray-400">{s.parts.join(', ')}</span>
          </span>
        ))}
      </div>
      <button
        onClick={() => setShowChapterSummary(false)}
        className="shrink-0 mt-px text-gray-700 hover:text-gray-400"
        title="Hide chapter summary (turn back on in the Characters panel)"
        aria-label="Hide chapter summary"
      >
        <X size={11} />
      </button>
    </div>
  )
}

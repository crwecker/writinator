import { useStoryletStore } from '../../stores/storyletStore'
import { useMechanicsPrefsStore } from '../editor/mechanicsPrefsStore'
import { STATBLOCK_THEMES } from '../../lib/statblockThemes'
import type { StatblockTheme } from '../../types'

/** Footer of the Characters panel: status-window look (per book) and the chapter summary strip. */
export function MechanicsDisplaySettings() {
  const theme = useStoryletStore((s) => s.globalSettings.statblockTheme ?? 'classic')
  const hasBook = useStoryletStore((s) => !!s.book)
  const showSummary = useMechanicsPrefsStore((s) => s.showChapterSummary)

  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 border-t border-gray-800 text-[11px] text-gray-500">
      <label className="flex items-center gap-1.5" title="How status blocks look in the editor and in exports (saved with the book)">
        <span>Status windows</span>
        <select
          value={theme}
          disabled={!hasBook}
          onChange={(e) => useStoryletStore.getState().updateGlobalSettings({ statblockTheme: e.target.value as StatblockTheme })}
          className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[11px] text-gray-300 focus:outline-none focus:border-gray-500"
        >
          {STATBLOCK_THEMES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </label>
      <label className="flex items-center gap-1.5 cursor-pointer" title="Net stat changes for the open chapter, above the editor">
        <input
          type="checkbox"
          checked={showSummary}
          onChange={(e) => useMechanicsPrefsStore.getState().setShowChapterSummary(e.target.checked)}
          className="accent-blue-400"
        />
        <span>Chapter summary</span>
      </label>
    </div>
  )
}

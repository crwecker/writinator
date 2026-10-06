import { useAuthorLevel } from './useAuthorLevel'
import { QuestProgress } from './QuestUi'

/** Compact level + title + XP bar for the guild header. */
export function AuthorLevelBadge({ onOpen }: { onOpen?: () => void }) {
  const info = useAuthorLevel()
  const into = info.xp - info.levelStartXp
  const span = info.nextLevelXp - info.levelStartXp
  const toNext = info.nextLevelXp - info.xp
  return (
    <button
      type="button"
      onClick={onOpen}
      data-testid="author-level"
      className="group flex min-w-[170px] items-center gap-2.5 rounded-xl border border-amber-800/50 bg-stone-900/70 px-2.5 py-1.5 text-left transition-colors hover:border-amber-600"
      title={`${info.xp.toLocaleString()} lifetime words · ${toNext.toLocaleString()} to level ${info.level + 1}`}
    >
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-amber-400 to-amber-700 font-serif text-sm font-bold text-stone-950 shadow-inner">
        {info.level}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-serif text-sm font-semibold leading-tight text-amber-100">{info.title}</span>
        <span className="mt-1 block">
          <QuestProgress value={into} max={span} size="sm" />
        </span>
      </span>
    </button>
  )
}

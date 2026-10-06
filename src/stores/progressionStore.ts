import { create, type StoreApi, type UseBoundStore } from 'zustand'
import { persist, type PersistOptions } from 'zustand/middleware'
import { localforageJSONStorage } from './localforageStorage'
import { subscribeStreakHistory, subscribeStreakWrites, useStreakStore, type StreakWriteEvent } from './streakStore'
import { usePlayerStore } from './playerStore'
import { useImageRevealStore } from './imageRevealStore'
import { useStoryletStore } from './storyletStore'
import { useWriteathonStore } from './writeathonStore'
import { useGameSettingsStore } from './gameSettingsStore'
import { addToast } from '../components/quests/rewardToastStore'
import { isTitleLevel, levelInfo, levelUpReward, lifetimeWords } from '../lib/progression'
import { emptyAchievementContext, newlyEarned, type AchievementContext } from '../lib/achievements'
import {
  countBySource,
  GALLERY_SET_BONUS,
  gallerySetMeta,
  inferPictureSource,
  newlyCompletedSets,
  type PictureSource,
} from '../lib/gallerySets'
import { charsToWords, revisedCharsForTransactions } from '../lib/revision'
import type { Transaction } from '@codemirror/state'
import { sessionDifficulty } from '../lib/questRewards'
import { countWords } from '../lib/words'
import { todayKey } from '../lib/metrics'
import { dayDiff } from '../lib/days'
import type { Book, ImageRevealSession } from '../types'

/**
 * Per-writer progression (localforage only, never in book files): author
 * level, achievements, the ledger of revealed pictures behind gallery sets,
 * revised words and publishing milestones.
 *
 * Coins, quest sessions and the writeathon travel with book files and are
 * swapped when one opens, so everything here is an append-only ledger fed by
 * live events (words written, quests finishing, storylets published). Opening
 * a book or merging its history only ever updates things silently.
 */

export const FIRST_PUBLISH_BONUS = 40
export const BOOK_FINISHED_BONUS = 500
/** Days away before writing again counts as a comeback. */
export const COMEBACK_DAYS = 14
const MAX_SOURCE_URLS = 200

export interface RevealRecord {
  /** Image-reveal session id. */
  id: string
  source: PictureSource
  completedAt: string
  /** A timed quest at Epic difficulty. */
  epic?: boolean
  tracking?: 'storylet' | 'revision'
}

export type TrackedQuest =
  | { kind: 'storylet'; storyletId: string; bookId: string; startWords: number }
  | { kind: 'revision' }

export type PictureChoice = { kind: 'theme' } | { kind: 'custom'; pictureId: string }

export interface ProgressionFeats {
  earlyBird: number
  nightOwl: number
  comebacks: number
}

interface ProgressionState {
  /** Highest level already celebrated (or silently absorbed). */
  celebratedLevel: number
  /** Achievement id → ISO time unlocked. */
  unlocked: Record<string, string>
  /** Successful reveals, oldest first. */
  reveals: RevealRecord[]
  completedSets: Partial<Record<PictureSource, string>>
  /** Unsplash photo URL → theme it was fetched with (until the quest ends). */
  sourceByUrl: Record<string, PictureSource>
  /** Session id → what a chapter/revision quest measures. */
  tracked: Record<string, TrackedQuest>
  revisedWords: number
  revisedByDay: Record<string, number>
  feats: ProgressionFeats
  lastWriteDay: string | null
  /** Most words seen in a single storylet. */
  longestChapterWords: number
  /** `${bookId}:${storyletId}` → first time it was seen published. */
  published: Record<string, string>
  /** `book:<id>` or `writeathon:<configId>` → when its bonus was paid. */
  finishedBooks: Record<string, string>
  /** Picture for the next quest. A custom picture is used once. */
  pictureChoice: PictureChoice
  seeded: boolean
  _hasHydrated: boolean

  setPictureChoice: (choice: PictureChoice) => void
}

type PersistedProgression = Omit<ProgressionState, '_hasHydrated' | 'setPictureChoice'>

const persistOptions: PersistOptions<ProgressionState, PersistedProgression> = {
  name: 'writinator-progression',
  version: 1,
  storage: localforageJSONStorage<PersistedProgression>(),
  partialize: (s) => ({
    celebratedLevel: s.celebratedLevel,
    unlocked: s.unlocked,
    reveals: s.reveals,
    completedSets: s.completedSets,
    sourceByUrl: s.sourceByUrl,
    tracked: s.tracked,
    revisedWords: s.revisedWords,
    revisedByDay: s.revisedByDay,
    feats: s.feats,
    lastWriteDay: s.lastWriteDay,
    longestChapterWords: s.longestChapterWords,
    published: s.published,
    finishedBooks: s.finishedBooks,
    pictureChoice: s.pictureChoice,
    seeded: s.seeded,
  }),
  onRehydrateStorage: () => (_state, error) => {
    if (error) console.error('[progressionStore] rehydration error:', error)
    useProgressionStore.setState({ _hasHydrated: true })
  },
}

export const useProgressionStore = create<ProgressionState>()(
  persist(
    (set) => ({
      celebratedLevel: 1,
      unlocked: {},
      reveals: [],
      completedSets: {},
      sourceByUrl: {},
      tracked: {},
      revisedWords: 0,
      revisedByDay: {},
      feats: { earlyBird: 0, nightOwl: 0, comebacks: 0 },
      lastWriteDay: null,
      longestChapterWords: 0,
      published: {},
      finishedBooks: {},
      pictureChoice: { kind: 'theme' },
      seeded: false,
      _hasHydrated: false,

      setPictureChoice: (choice) => {
        set({ pictureChoice: choice })
      },
    }),
    persistOptions,
  ),
)

const get = () => useProgressionStore.getState()
const set = (patch: Partial<ProgressionState>) => useProgressionStore.setState(patch)

// ---------------------------------------------------------------------------
// Derived values
// ---------------------------------------------------------------------------

export function achievementContextFrom(
  p: Pick<
    ProgressionState,
    'reveals' | 'completedSets' | 'longestChapterWords' | 'revisedWords' | 'published' | 'finishedBooks' | 'feats'
  >,
  streak: { dailyWords: Record<string, number>; longestStreak: number },
): AchievementContext {
  const xp = lifetimeWords(streak.dailyWords)
  let bestDay = 0
  for (const w of Object.values(streak.dailyWords)) if (w > bestDay) bestDay = w
  return {
    ...emptyAchievementContext(),
    lifetimeWords: xp,
    bestDayWords: bestDay,
    longestStreak: streak.longestStreak,
    questsCompleted: p.reveals.length,
    picturesRevealed: p.reveals.length,
    epicTimedQuests: p.reveals.filter((r) => r.epic).length,
    gallerySetsCompleted: Object.keys(p.completedSets).length,
    customPicturesRevealed: p.reveals.filter((r) => r.source === 'custom').length,
    longestChapterWords: p.longestChapterWords,
    chapterQuestsCompleted: p.reveals.filter((r) => r.tracking === 'storylet').length,
    revisedWords: p.revisedWords,
    revisionQuestsCompleted: p.reveals.filter((r) => r.tracking === 'revision').length,
    storyletsPublished: Object.keys(p.published).length,
    booksFinished: Object.keys(p.finishedBooks).length,
    earlyBird: p.feats.earlyBird,
    nightOwl: p.feats.nightOwl,
    comebacks: p.feats.comebacks,
    level: levelInfo(xp).level,
  }
}

function currentContext(): AchievementContext {
  return achievementContextFrom(get(), useStreakStore.getState())
}

// ---------------------------------------------------------------------------
// Rewards
// ---------------------------------------------------------------------------

/** Pay coins and toast (the toast is skipped in quiet mode; coins aren't). */
function reward(coins: number, label: string): void {
  if (coins <= 0) return
  usePlayerStore.getState().addCoins(coins)
  if (!useGameSettingsStore.getState().quietMode) addToast(coins, label)
}

function checkLevel(pay: boolean): void {
  const info = levelInfo(lifetimeWords(useStreakStore.getState().dailyWords))
  const from = get().celebratedLevel
  if (info.level <= from) return
  set({ celebratedLevel: info.level })
  if (!pay) return
  let coins = 0
  let newTitle = false
  for (let l = from + 1; l <= info.level; l++) {
    coins += levelUpReward(l)
    if (isTitleLevel(l)) newTitle = true
  }
  reward(coins, newTitle ? `Level ${info.level} — you are now a ${info.title}!` : `Level ${info.level} reached!`)
}

function checkAchievements(pay: boolean, now: number): void {
  const earned = newlyEarned(currentContext(), get().unlocked)
  if (earned.length === 0) return
  const at = new Date(now).toISOString()
  const unlocked = { ...get().unlocked }
  for (const def of earned) unlocked[def.id] = at
  set({ unlocked })
  if (!pay) return
  for (const def of earned) reward(def.coins, `🏅 ${def.name}`)
}

function checkSets(pay: boolean, now: number): void {
  const counts = countBySource(get().reveals.map((r) => r.source))
  const done = newlyCompletedSets(counts, get().completedSets)
  if (done.length === 0) return
  const at = new Date(now).toISOString()
  const completedSets = { ...get().completedSets }
  for (const source of done) completedSets[source] = at
  set({ completedSets })
  if (!pay) return
  for (const source of done) {
    const meta = gallerySetMeta(source)
    reward(GALLERY_SET_BONUS, `Gallery set complete: ${meta.label} — ${meta.frameName} frame unlocked`)
  }
}

/** Level, sets and achievements, all at once. */
function settle(pay: boolean, now: number): void {
  checkLevel(pay)
  checkSets(pay, now)
  checkAchievements(pay, now)
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

function onLiveWrite({ day, timestamp }: StreakWriteEvent): void {
  const hour = new Date(timestamp).getHours()
  const { feats, lastWriteDay } = get()
  const nextFeats = { ...feats }
  if (hour >= 4 && hour < 7) nextFeats.earlyBird += 1
  if (hour < 4) nextFeats.nightOwl += 1
  if (lastWriteDay !== null && lastWriteDay < day && dayDiff(lastWriteDay, day) >= COMEBACK_DAYS) nextFeats.comebacks += 1
  set({
    feats: nextFeats,
    ...(lastWriteDay === null || lastWriteDay < day ? { lastWriteDay: day } : {}),
  })
  settle(true, timestamp)
}

function revealRecord(session: ImageRevealSession): RevealRecord {
  const tracked = get().tracked[session.id]
  const tracking = session.progressSource ?? (tracked ? (tracked.kind === 'storylet' ? 'storylet' : 'revision') : undefined)
  const epic =
    session.timeMinutes !== undefined && sessionDifficulty({ ...session, timeMinutes: session.timeMinutes }) === 'epic'
  return {
    id: session.id,
    source: inferPictureSource(session.imageUrl, get().sourceByUrl[session.imageUrl]),
    completedAt: session.completedAt ?? new Date().toISOString(),
    ...(epic ? { epic: true } : {}),
    ...(tracking ? { tracking } : {}),
  }
}

type RevealSlice = { activeSessions: ImageRevealSession[]; completedSessions: ImageRevealSession[] }

function onRevealChange(state: RevealSlice, prev: RevealSlice): void {
  if (state.completedSessions === prev.completedSessions) return
  // Only sessions that were running here and just ended — not ones that
  // arrived with an opened book file.
  const prevActive = new Set(prev.activeSessions.map((s) => s.id))
  const prevDone = new Set(prev.completedSessions.map((s) => s.id))
  const ended = state.completedSessions.filter((s) => prevActive.has(s.id) && !prevDone.has(s.id))
  if (ended.length === 0) return

  const { reveals, tracked, sourceByUrl } = get()
  const known = new Set(reveals.map((r) => r.id))
  const added = ended.filter((s) => s.result === 'success' && !known.has(s.id)).map(revealRecord)
  const nextTracked = { ...tracked }
  const nextSources = { ...sourceByUrl }
  for (const s of ended) {
    delete nextTracked[s.id]
    delete nextSources[s.imageUrl]
  }
  set({ reveals: [...reveals, ...added], tracked: nextTracked, sourceByUrl: nextSources })
  if (added.length > 0) settle(true, Date.now())
}

/** Move chapter quests forward to their storylet's word count (never backward). */
function creditStoryletQuests(book: Book): void {
  const { tracked } = get()
  for (const session of useImageRevealStore.getState().activeSessions) {
    if (session.progressSource !== 'storylet') continue
    const t = tracked[session.id]
    if (!t || t.kind !== 'storylet' || t.bookId !== book.id) continue
    const storylet = book.storylets.find((s) => s.id === t.storyletId)
    if (!storylet) continue
    const progress = Math.min(Math.max(countWords(storylet.content) - t.startWords, 0), session.wordGoal)
    const delta = progress - session.wordsWritten
    if (delta > 0) useImageRevealStore.getState().creditWords(session.id, delta)
  }
}

function publishedKey(bookId: string, storyletId: string): string {
  return `${bookId}:${storyletId}`
}

/** Every storylet with text has been published. Folders and empty storylets don't block it. */
function isBookFullyPublished(book: Book): boolean {
  const parents = new Set(book.storylets.map((s) => s.parentId).filter((id): id is string => !!id))
  const withText = book.storylets.filter((s) => !parents.has(s.id) && countWords(s.content) > 0)
  return withText.length > 0 && withText.every((s) => !!s.lastPublishedAt)
}

function onBookChange(book: Book | null, prevBook: Book | null): void {
  if (!book || book === prevBook) return
  const sameBook = prevBook !== null && prevBook.id === book.id
  const prevById = sameBook ? new Map(prevBook.storylets.map((s) => [s.id, s])) : null
  const now = Date.now()

  creditStoryletQuests(book)

  let longest = get().longestChapterWords
  for (const s of book.storylets) {
    if (prevById && prevById.get(s.id)?.content === s.content) continue
    const w = countWords(s.content)
    if (w > longest) longest = w
  }
  const patch: Partial<ProgressionState> = {}
  if (longest > get().longestChapterWords) patch.longestChapterWords = longest

  // Publishing: a storylet whose publish time just changed in the open book.
  const published = { ...get().published }
  const firstPublishes: string[] = []
  for (const s of book.storylets) {
    if (!s.lastPublishedAt) continue
    const key = publishedKey(book.id, s.id)
    if (published[key]) continue
    published[key] = new Date(now).toISOString()
    const prevS = prevById?.get(s.id)
    if (prevById && prevS && !prevS.lastPublishedAt) firstPublishes.push(s.name.trim() || 'Untitled')
  }
  if (Object.keys(published).length !== Object.keys(get().published).length) patch.published = published
  if (Object.keys(patch).length > 0) set(patch)

  for (const name of firstPublishes) reward(FIRST_PUBLISH_BONUS, `First publish: ${name}`)
  const bookKey = `book:${book.id}`
  if (firstPublishes.length > 0 && !get().finishedBooks[bookKey] && isBookFullyPublished(book)) {
    set({ finishedBooks: { ...get().finishedBooks, [bookKey]: new Date(now).toISOString() } })
    reward(BOOK_FINISHED_BONUS, `“${book.title}” is published — the end!`)
  }
  settle(sameBook, now)
}

function onWriteathonChange(
  config: { id: string; completedAt?: string } | null,
  prevConfig: { id: string; completedAt?: string } | null,
): void {
  if (!config?.completedAt || !prevConfig || prevConfig.id !== config.id || prevConfig.completedAt) return
  const key = `writeathon:${config.id}`
  if (get().finishedBooks[key]) return
  const now = Date.now()
  set({ finishedBooks: { ...get().finishedBooks, [key]: new Date(now).toISOString() } })
  reward(BOOK_FINISHED_BONUS, 'Writeathon complete — the book is done!')
  settle(true, now)
}

// ---------------------------------------------------------------------------
// First run: fold in existing history silently
// ---------------------------------------------------------------------------

function seed(now: number): void {
  const { completedSessions } = useImageRevealStore.getState()
  const known = new Set(get().reveals.map((r) => r.id))
  const reveals = [
    ...get().reveals,
    ...completedSessions.filter((s) => (s.result ?? 'success') === 'success' && s.completed !== false && !known.has(s.id)).map(revealRecord),
  ]
  const days = Object.entries(useStreakStore.getState().dailyWords)
    .filter(([, w]) => w > 0)
    .map(([d]) => d)
    .sort()
  const book = useStoryletStore.getState().book
  const published = { ...get().published }
  let longest = get().longestChapterWords
  if (book) {
    for (const s of book.storylets) {
      longest = Math.max(longest, countWords(s.content))
      if (s.lastPublishedAt) published[publishedKey(book.id, s.id)] ??= new Date(now).toISOString()
    }
  }
  set({
    reveals,
    published,
    longestChapterWords: longest,
    lastWriteDay: get().lastWriteDay ?? days[days.length - 1] ?? null,
    seeded: true,
  })
  settle(false, now)
}

// ---------------------------------------------------------------------------
// Install
// ---------------------------------------------------------------------------

interface Hydratable {
  persist: { hasHydrated: () => boolean; onFinishHydration: (fn: () => void) => () => void }
}

function hydrated(store: Hydratable): Promise<void> {
  if (store.persist.hasHydrated()) return Promise.resolve()
  return new Promise((resolve) => {
    const off = store.persist.onFinishHydration(() => {
      off()
      resolve()
    })
  })
}

let ready = false
let pending: Array<() => void> = []
let readyPromise: Promise<void> = Promise.resolve()
let revisionCarry = 0

function whenReady(op: () => void): void {
  if (ready) op()
  else pending.push(op)
}

/** Resolves once the current install has loaded and seeded. */
export function progressionReady(): Promise<void> {
  return readyPromise
}

/** Wire progression to the live stores. Returns an uninstall function. */
export function installProgression(): () => void {
  ready = false
  pending = []
  revisionCarry = 0
  let cancelled = false

  const unsubs = [
    subscribeStreakWrites((e) => whenReady(() => onLiveWrite(e))),
    subscribeStreakHistory(() => whenReady(() => settle(false, Date.now()))),
    useImageRevealStore.subscribe((state, prev) => whenReady(() => onRevealChange(state, prev))),
    useStoryletStore.subscribe((state, prev) => {
      if (state.book !== prev.book) whenReady(() => onBookChange(state.book, prev.book))
    }),
    useWriteathonStore.subscribe((state, prev) => {
      if (state.config !== prev.config) whenReady(() => onWriteathonChange(state.config, prev.config))
    }),
  ]

  const stores: Hydratable[] = [
    useProgressionStore as UseBoundStore<StoreApi<ProgressionState>> & Hydratable,
    useStreakStore,
    useImageRevealStore,
    useStoryletStore,
    usePlayerStore,
  ]
  readyPromise = Promise.all(stores.map(hydrated)).then(() => {
    if (cancelled) return
    if (!get().seeded) seed(Date.now())
    else settle(false, Date.now())
    ready = true
    const queued = pending
    pending = []
    for (const op of queued) op()
  })

  return () => {
    cancelled = true
    ready = false
    pending = []
    for (const off of unsubs) off()
  }
}

// ---------------------------------------------------------------------------
// Actions used by the editor and the quest UI
// ---------------------------------------------------------------------------

/** Remember which theme an Unsplash photo was fetched with (for gallery sets). */
export function noteImageSource(url: string, source: PictureSource): void {
  if (url.startsWith('data:')) return
  const entries = Object.entries({ ...get().sourceByUrl, [url]: source })
  set({ sourceByUrl: Object.fromEntries(entries.slice(-MAX_SOURCE_URLS)) })
}

/** Link a chapter or revision quest's session to what it measures. */
export function trackQuestSession(sessionId: string, tracking: TrackedQuest): void {
  set({ tracked: { ...get().tracked, [sessionId]: tracking } })
}

/**
 * Characters revised in existing text (see lib/revision). Converted to words
 * here; revision quests and the revised-words total move per whole word.
 */
export function recordRevisedChars(chars: number, now: number = Date.now()): void {
  if (chars <= 0) return
  whenReady(() => {
    const { words, carry } = charsToWords(revisionCarry, chars)
    revisionCarry = carry
    if (words <= 0) return
    const day = todayKey(now)
    const { revisedWords, revisedByDay } = get()
    set({ revisedWords: revisedWords + words, revisedByDay: { ...revisedByDay, [day]: (revisedByDay[day] ?? 0) + words } })
    for (const session of useImageRevealStore.getState().activeSessions) {
      if (session.progressSource === 'revision') useImageRevealStore.getState().creditWords(session.id, words)
    }
    checkAchievements(true, now)
  })
}

/** Editor hook: count revised characters in an update's writing transactions. Cheap on the hot path. */
export function recordRevisionEdits(transactions: readonly Transaction[]): void {
  const chars = revisedCharsForTransactions(transactions)
  if (chars > 0) recordRevisedChars(chars)
}

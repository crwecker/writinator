# Timed Quests + RPG Reward System — Cross-Phase State

## Current Phase
Phase 7 (not started) — Phase 6 complete

## Key Existing File Paths
- `src/types/index.ts` — shared TypeScript types
- `src/stores/imageRevealStore.ts` — existing quest store (image reveal)
- `src/stores/documentStore.ts` — document store, word delta pipeline (updateDocumentContent line ~436)
- `src/stores/playerStore.ts` — player RPG store (coins, inventory, equipment)
- `src/stores/timedQuestStore.ts` — DELETED in Phase 4.5 (merged into imageRevealStore)
- `src/components/quests/QuestPicker.tsx` — quest creation modal
- `src/components/quests/ImageRevealPanel.tsx` — floating quest panel
- `src/components/quests/QuestReminder.tsx` — no-quest nudge toast
- `src/components/layout/AppShell.tsx` — root layout, bottom bar, panel wiring
- `src/components/editor/Editor.tsx` — CodeMirror editor, word count source
- `src/lib/items.ts` — item catalog (13 items: 5 weapons, 5 armors, 3 consumables)
- `src/lib/questRewards.ts` — difficulty calculator, reward calculator, display helpers
- `src/lib/timer.ts` — pure wall-clock timer utility

## New Files Created Per Phase
- Phase 1: `src/lib/items.ts`, `src/lib/questRewards.ts`, `src/stores/playerStore.ts`
- Phase 2: `src/lib/timer.ts`, `src/stores/timedQuestStore.ts`
- Phase 5: `src/components/quests/RewardToast.tsx`, `src/components/quests/rewardToastStore.ts`, `src/components/quests/useRewardToast.ts`
- Phase 6: `src/components/quests/ShopModal.tsx`

## New Components Per Phase
- Phase 1: (none — data-only phase)
- Phase 2: (none — data-only phase)
- Phase 3: (none — refactored existing QuestPicker.tsx with tabs + timed quest form)
- Phase 4: `src/components/quests/TimedQuestPanel.tsx` — DELETED in Phase 4.5 (merged into ImageRevealPanel)
- Phase 5: `RewardToast` (fixed overlay toast system), coin display added to AppShell bottom bar
- Phase 6: `ShopModal` (RPG shop with item cards, category tabs, purchase flow), Shop button in bottom bar

## New Stores and Persistence Keys
- Phase 1: `usePlayerStore` → `writinator-player` (v1)
- Phase 2: `useTimedQuestStore` → `writinator-timed-quest` (v1) — DELETED in Phase 4.5
- Phase 4.5: `useImageRevealStore` bumped to v2 (absorbs timer state: isPaused, pauseStartedAt, activeEffects)

## Architecture Decisions (Locked)
- Single quest type: image reveal quests with optional timer (no separate timed quest type)
- RPG mechanics (equipment, consumables, coins) apply to ALL quests — timer is a reward multiplier
- Untimed quests earn base coins (~10% of word goal × weapon multiplier)
- Timed quests earn base + difficulty bonus (2-5x more than untimed)
- Difficulty is auto-calculated from words-per-minute: <15 easy, 15-25 medium, 25-40 hard, 40+ epic
- Equipment is functional only (no cosmetic effects)
- Weapon multiplier applies to ALL quests (timed and untimed)
- Armor time bonus only applies when timer is set
- One timed session at a time (untimed sessions remain concurrent, up to 25)
- Timer uses wall-clock time (Date.now() - startedAt - pausedDuration), not intervals
- Coins are the sole currency. No XP or leveling system.
- Item catalog is static (defined in code, not user-configurable)
- Starter items (Wooden Pencil, Cloth Tunic) are free and owned by default
- Shop is RPG-styled (fantasy theme within the dark UI)

## Known Issues / Gotchas
- `countWords()` is duplicated in documentStore.ts and snapshotStore.ts — consolidate in Phase 8
- Word deltas are debounced 1500ms in documentStore — timed quest words will also be delayed
- localforageStorage adapter is copy-pasted across stores (not extracted, acceptable)

## Latest Screenshot
Phase 6: screenshots/phase-6.png (landing page — shop requires open book to view)

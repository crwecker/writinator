# Timed Quests + RPG Reward System — Cross-Phase State

## Current Phase
Phase 4 (not started) — Phase 3 complete

## Key Existing File Paths
- `src/types/index.ts` — shared TypeScript types
- `src/stores/imageRevealStore.ts` — existing quest store (image reveal)
- `src/stores/documentStore.ts` — document store, word delta pipeline (updateDocumentContent line ~436)
- `src/stores/playerStore.ts` — player RPG store (coins, inventory, equipment)
- `src/stores/timedQuestStore.ts` — timed quest lifecycle store
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

## New Components Per Phase
- Phase 1: (none — data-only phase)
- Phase 2: (none — data-only phase)
- Phase 3: (none — refactored existing QuestPicker.tsx with tabs + timed quest form)

## New Stores and Persistence Keys
- Phase 1: `usePlayerStore` → `writinator-player` (v1)
- Phase 2: `useTimedQuestStore` → `writinator-timed-quest` (v1)

## Architecture Decisions (Locked)
- Difficulty is auto-calculated from words-per-minute: <15 easy, 15-25 medium, 25-40 hard, 40+ epic
- Equipment is functional only (no cosmetic effects)
- One timed quest active at a time (image reveal quests remain concurrent)
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
Phase 3: no screenshot (no browser automation available)

# Timed Quests + RPG Reward System — Progress

## Overall Status

| Phase | Title | Status | Started | Completed |
|-------|-------|--------|---------|-----------|
| 1 | Foundation — Types, Items, Player Store | Complete | 2026-04-10 | 2026-04-10 |
| 2 | Timed Quest Store + Timer Utility | Complete | 2026-04-10 | 2026-04-10 |
| 3 | Quest Creation UI — Timed Quest Tab | Complete | 2026-04-10 | 2026-04-10 |
| 4 | Active Timed Quest Panel | Complete | 2026-04-10 | 2026-04-10 |
| 4.5 | Quest Consolidation — Merge Timer into Image Quests | Complete | 2026-04-10 | 2026-04-10 |
| 5 | Coin Display + Reward Toasts | Complete | 2026-04-10 | 2026-04-10 |
| 6 | RPG Shop — Item Cards + Purchase Flow | Complete | 2026-04-10 | 2026-04-10 |
| 7 | Equipment Panel + Consumable Inventory | Complete | 2026-04-10 | 2026-04-10 |
| 8 | Polish + Quest Reminder Integration | Complete | 2026-04-10 | 2026-04-10 |

---

## Phase 1: Foundation — Types, Items, Player Store
- [x] RPG types added to src/types/index.ts
- [x] Item catalog created (src/lib/items.ts)
- [x] Quest reward calculators created (src/lib/questRewards.ts)
- [x] Player store created (src/stores/playerStore.ts)
- [x] Visual QA screenshot captured → screenshots/phase-1.png

### Notes
All types, items, rewards, and player store created. ESLint, tsc, and vite build all pass clean. App loads without errors (data-only phase, no UI changes). Commit: 97c1938.

---

## Phase 2: Timed Quest Store + Timer Utility
- [x] Timer utility created (src/lib/timer.ts)
- [x] Timed quest store created (src/stores/timedQuestStore.ts)
- [x] documentStore word delta pipeline extended
- [ ] Visual QA screenshot captured → screenshots/phase-2.png

### Notes
Timer utility provides pure wall-clock-based getTimerState(). Timed quest store has full lifecycle: start/complete/fail/abandon, pause/resume, word tracking with weapon multiplier + Word Burst, consumable effects (Time Freeze, Word Burst, Second Wind). Word deltas wired from documentStore alongside image reveal. ESLint, tsc, and vite build all pass clean. No browser automation available for screenshot.

---

## Phase 3: Quest Creation UI — Timed Quest Tab
- [x] QuestPicker refactored with tab navigation
- [x] Timed quest creation form with word goal + time limit
- [x] Auto-calculated difficulty badge
- [x] Reward preview + equipment display
- [x] Active timed quest card in QuestPicker
- [x] Completed timed quests list
- [ ] Visual QA screenshot captured → screenshots/phase-3.png

### Notes
QuestPicker now has "Image Quest" / "Timed Quest" tabs. Defaults to Timed tab when no image sessions active. Timed tab has full creation form (word goal + time presets, difficulty badge, reward preview with weapon multiplier, equipment display), active quest card with live countdown timer, and completed quests list (recent 10). No browser automation available for screenshot. Commit: c872185.

---

## Phase 4: Active Timed Quest Panel
- [x] TimedQuestPanel floating component created
- [x] Collapsed view (timer + word count + difficulty dot)
- [x] Expanded view (full details + consumables)
- [x] Timer countdown with color transitions (white → amber → orange → red+pulse)
- [x] Consumable quick-use buttons with count badges
- [x] Completion/failure result overlays
- [x] Wired into AppShell
- [x] Visual QA screenshot captured → screenshots/phase-4.png

### Notes
TimedQuestPanel at fixed bottom-12 left-4 (opposite side from ImageRevealPanel). Collapsed bar shows difficulty dot, MM:SS countdown, word fraction. Expanded shows large timer with color coding by percentRemaining, progress bar, equipment info, consumable buttons (disabled when count=0), pause/resume toggle, abandon with inline confirmation. Result overlays captured via Zustand subscribe detecting activeQuest→null transition, with snapshot of quest state for display. Difficulty uses 'epic' (not 'legendary') per actual QuestDifficulty type. ESLint, tsc, vite build all pass.

---

## Phase 4.5: Quest Consolidation — Merge Timer into Image Quests
- [x] ImageRevealSession extended with optional timer fields
- [x] TimedQuest type deleted
- [x] calculateBaseReward + calculateQuestReward added
- [x] Timer logic merged into imageRevealStore (tick, pause, consumables, fail)
- [x] Weapon multiplier applied to ALL quests (not just timed)
- [x] timedQuestStore.ts deleted
- [x] documentStore word delta simplified (single store dispatch)
- [x] TimedQuestPanel merged into ImageRevealPanel
- [x] TimedQuestPanel.tsx deleted
- [x] QuestPicker tabs removed, single flow with "Add Timer" toggle
- [x] Visual QA screenshot → screenshots/phase-4.5.png

### Notes
Major architectural consolidation. Eliminated the separate timed quest system entirely — image quests are now the single quest type with an optional timer modifier. Key changes: (1) ImageRevealSession gains timeMinutes?, pausedDuration?, result?, coinsEarned?; TimedQuest interface deleted. (2) imageRevealStore absorbs all timer logic (tick, pause, resume, fail, consumable effects) + now applies weapon multiplier to ALL quests. (3) calculateBaseReward + calculateQuestReward provide unified reward API — untimed quests earn ~10% of word goal × weapon multiplier; timed quests earn base + difficulty bonus. (4) QuestPicker is a single flow with "Add Timer" toggle instead of tabs. (5) timedQuestStore.ts and TimedQuestPanel.tsx deleted; documentStore simplified to single store dispatch. Persistence version bumped to v2 with migration. ESLint, tsc, vite build all pass. Visual QA confirms no tabs, Add Timer toggle, equipment display, coin estimate.

---

## Phase 5: Coin Display + Reward Toasts
- [x] Coin balance in AppShell bottom bar
- [x] RewardToast component with animation + toast queue
- [x] Retroactive coin grant for existing completions
- [x] Visual QA screenshot captured → screenshots/phase-5.png

### Notes
Coin display in bottom bar left of Quest button — amber-400 Coins icon + balance with tabular-nums, CSS keyframe pulse animation on change. RewardToast is a fixed bottom-center overlay with slide-up entrance, 3s auto-dismiss with fade-out exit, supports queued toasts via module-level store + useSyncExternalStore. Retroactive grant runs once on mount: counts completedSessions with result==='success', grants 100 coins each, sets retroactiveGrantApplied flag (persisted in playerStore). Note: image reveal completion already calls addCoins from Phase 4.5 — no changes needed to imageRevealStore. ESLint, tsc, vite build all pass. Commit: 98f4289.

---

## Phase 6: RPG Shop — Item Cards + Purchase Flow
- [x] ShopModal component created
- [x] Category tabs (Weapons/Armor/Consumables)
- [x] Item cards with rarity borders and stats
- [x] Purchase flow with confirmation for >500 coin items
- [x] Shop button (Shield icon) in AppShell bottom bar
- [x] Consumable quantity selector (1/5/10)
- [x] Equip/Owned/Equipped state badges
- [x] Purchase flash animation

### Notes
ShopModal follows QuestPicker modal pattern (fixed inset-0 z-50, escape/click-outside/close button dismiss). RPG-themed: amber-300 "Quest Shop" header, coin balance in header, category tabs with amber-400 active border. Item grid (2-col on sm+) with rarity-colored left borders (gray/emerald/blue/purple/amber). Card states: affordable (amber Buy button), can't afford (dimmed, red price, disabled), owned (emerald badge + Equip button), equipped (Check + "Equipped"). Consumables show ×N owned count and 1/5/10 quantity selector. Inline confirmation for items >500 coins. Purchase flash: card border transitions to emerald-400 for 600ms. ESLint, tsc, vite build all pass. Commit: 38f8f5c.

---

## Phase 7: Equipment Panel + Consumable Inventory
- [x] EquipmentPanel component created
- [x] Equipment slots with equip/unequip
- [x] Stats summary display
- [x] Consumable inventory grid
- [x] Integrated into ShopModal
- [x] Visual QA screenshot captured → screenshots/phase-7.png

### Notes
EquipmentPanel added as new "Equipment" tab in ShopModal (first tab, default view). Two sections: Equipped Gear shows weapon + armor cards side-by-side with rarity-colored borders, item icon/name/rarity/stat, swap dropdown of owned alternatives, and unequip button (hidden for starter items). Stats section in 3-col/2-row grid: word multiplier, time bonus, quests done, total words, coins earned — amber-400 accent on multiplier values. Consumable Inventory shows owned consumables in a grid with count badges and effect descriptions, or empty state directing to Consumables tab. ShopModal tabs array extended with 'equipment' first, default activeTab changed to 'equipment'. ESLint, tsc, vite build all pass.

---

## Phase 8: Polish + Quest Reminder Integration
- [x] QuestReminder updated for both quest types
- [x] countWords consolidated into src/lib/words.ts
- [x] Edge cases handled (close book, tab background, page reload)
- [x] Reward balance verified
- [x] Visual QA screenshot captured → screenshots/phase-8.png

### Notes
Consolidated countWords into src/lib/words.ts, updated imports in documentStore.ts and snapshotStore.ts. QuestReminder copy changed to "Start a quest to make your writing count!" with sword icon, auto-hides when active sessions exist, uses shared countWords. RewardToast entry animation fixed (was no-op, now proper slide-in via useState + double-rAF). closeBook() now pauses timed quest timer via imageRevealStore.pauseTimer(). Timer confirmed wall-clock based (Date.now() - startedAt - pausedDuration) — backgrounded tabs and page reloads work correctly. Reward balance reviewed: 250 words/10min classifies as "hard" (25 wpm on boundary), yields ~525 coins; 1000 words/15min classifies as "epic", yields ~3100 coins — both feel balanced. ESLint, tsc, vite build all pass.

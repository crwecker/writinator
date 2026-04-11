# Timed Quests + RPG Reward System — Implementation Plan

## Team Workflow (applies to every phase)

### Step 1 — Load Context (Haiku, context distillation)
Spawn an Explore agent (`model: haiku`) to read planning docs and relevant source files, then return a focused summary. The main agent does NOT read large docs directly.

### Step 2 — Create Team (Sonnet inner loop)
Spawn parallel implementation agents (`model: sonnet`, `mode: bypassPermissions`). Use the appropriate specialized agent type (`editor-dev`, `ui-dev`, or `storage-dev`) based on the work. Give each agent ONLY the context it needs from the Haiku summary.

### Step 3 — Static QA
`npx eslint .`, `npx tsc -b --noEmit`, `npx vite build`. Fix anything that breaks.

### Step 4 — Visual QA (Opus, main agent)
- Launch dev server: `npm run dev` in background, wait for ready.
- Open `http://localhost:5173` with browser automation.
- Drive UI to exercise phase changes. Confirm result matches goal.
- Save one screenshot to `research/timed-quests-rpg/screenshots/phase-N.png`.
- Stop background dev server.
- If anything looks wrong, fix it, re-run Step 3, re-capture screenshot.

### Step 5 — Commit & Update Docs
Commit the phase, then update `progress.md` and `state.md`.

### Agent Scaling Guidelines
- Match agents to work domains: `storage-dev` for stores/types/persistence, `ui-dev` for components/modals/Tailwind, `editor-dev` for CodeMirror extensions.
- Split large store work across multiple agents when handling 4+ independent concerns.
- Merge small work into a single agent when one side has only 1-2 trivial changes.
- Never exceed 5 parallel agents. Sequential follow-up agents are fine.
- Each agent owns complete vertical slices (not split by file type).

### Code Hygiene
- **No regressions**: `npx eslint .`, `npx tsc -b --noEmit`, `npx vite build` after every change.
- **Clean types**: No `any`. Proper interfaces and type narrowing. Shared types in `src/types/index.ts`.
- **Dead code removal**: Delete replaced code. No commented-out code or unused imports.
- **React patterns**: Stable refs for callbacks in effects. Memoize expensive computations. Clean up effects.

### Writinator-Specific Rules
- Zustand stores: `persist` middleware + `localforage`, export `use{Name}Store`, `getState()` for outside React
- Components: `src/components/{domain}/`, modals use `open`/`onClose` pattern, Escape/click-outside dismissal
- Styling: Tailwind v4, dark theme (gray-700/800/900 bg, gray-200/400/500 text), editor max-width 800px
- VIM mode always on — new shortcuts must not conflict with VIM bindings

---

## Phase 1: Foundation — Types, Items, and Player Store

**Goal**: Define all RPG types, create the item catalog, and build the player store with coins, inventory, and equipment.

**Deliverables**:
1. New types in `src/types/index.ts`: `QuestDifficulty`, `TimedQuest`, `QuestResult`, `ItemCategory`, `ItemRarity`, `WeaponItem`, `ArmorItem`, `ConsumableItem`, `Item` (union), `EquipmentSlots`, `Inventory`, `PlayerStats`
2. New `src/lib/items.ts`: Complete item catalog (5 weapons, 5 armors, 3 consumables), helper functions (`getItemById`, `getItemsByCategory`, `getItemPrice`, `getWeaponMultiplier`, `getArmorTimeBonus`)
3. New `src/lib/questRewards.ts`: `calculateDifficulty(wordGoal, timeMinutes)`, `calculateReward(quest, result)`, `getDifficultyColor(difficulty)`, `getDifficultyLabel(difficulty)`
4. New `src/stores/playerStore.ts`: Zustand + localforage persist. State: `coins`, `ownedItems[]`, `equippedWeapon`, `equippedArmor`, `consumableInventory`, `questStats` (totalCompleted, totalWords, totalCoins). Actions: `addCoins`, `spendCoins`, `purchaseItem`, `equipItem`, `unequipItem`, `useConsumable`, `addQuestStats`.

### Starter Prompt
```
This is Phase 1 of the Timed Quests + RPG feature: Foundation — Types, Items, and Player Store.

Goal: Define all RPG types, create the item catalog with effect calculations, and build the player store with coins, inventory, and equipment persistence.

STEP 1 - LOAD CONTEXT (Haiku, context distillation — do NOT read planning docs yourself):
Spawn an Explore agent (model: haiku) to read and summarize:
- research/timed-quests-rpg/state.md
- research/timed-quests-rpg/progress.md
- research/timed-quests-rpg/implementation-plan.md (Phase 1 section only)
- src/types/index.ts
- src/stores/imageRevealStore.ts (as a store pattern reference)
- src/stores/documentStore.ts (first 30 lines — localforage pattern)
- CLAUDE.md
The agent should return: existing type patterns, store boilerplate pattern (localforage adapter, persist config, partialize), and what types/items/rewards need to be created.

STEP 2 - CREATE TEAM (timed-quests-rpg-phase-1, Sonnet inner loop):
Spawn parallel implementation agents (model: sonnet, mode: bypassPermissions)
using the Haiku summary (not raw docs).

storage-dev agent deliverables:
- Add all RPG types to src/types/index.ts: QuestDifficulty ('easy'|'medium'|'hard'|'epic'), TimedQuest (id, wordGoal, timeMinutes, wordsWritten, startedAt, completedAt, pausedDuration, result), QuestResult ('success'|'failure'|'abandoned'), ItemCategory ('weapon'|'armor'|'consumable'), ItemRarity ('common'|'uncommon'|'rare'|'epic'|'legendary'), WeaponItem, ArmorItem, ConsumableItem, Item (union type), EquipmentSlots, Inventory, PlayerStats
- Create src/lib/items.ts: Full item catalog — Wooden Pencil (free, 1.0x), Enchanted Quill (200, 1.15x), Phoenix Feather Pen (500, 1.25x), Dragon's Pen (1500, 1.5x), Celestial Stylus (5000, 2.0x); Cloth Tunic (free, +0%), Leather Vest (200, +10%), Chain Mail (500, +15%), Time Shield (1500, +25%), Chrono Plate (5000, +40%); Time Freeze (150, pause 2min), Word Burst (100, 50 words double), Second Wind (300, +5min). Export getters and effect calculators.
- Create src/lib/questRewards.ts: calculateDifficulty(wordGoal, timeMinutes) → QuestDifficulty based on wpm thresholds (<15 easy, 15-25 medium, 25-40 hard, 40+ epic). calculateReward(wordGoal, timeMinutes, wordsWritten, timeUsedSeconds, difficulty) → coins. getDifficultyColor/getDifficultyLabel helpers.
- Create src/stores/playerStore.ts: Zustand + localforage persist (key: 'writinator-player', version: 1). State: coins (start 0), ownedItems (start with ['wooden-pencil', 'cloth-tunic']), equippedWeapon ('wooden-pencil'), equippedArmor ('cloth-tunic'), consumableInventory (Record<string, number>), questStats. Actions: addCoins, spendCoins (return boolean), purchaseItem, equipItem, unequipItem, useConsumable, addQuestStats. Partialize to exclude actions.

STEP 3 - STATIC QA: npx eslint ., npx tsc -b --noEmit, npx vite build. Fix any failures.

STEP 4 - VISUAL QA (Opus, main agent does this itself):
- Launch dev server: `npm run dev` in the background, wait for it to report ready.
- Open http://localhost:5173 with the available browser automation tool.
- This phase is data-only, so just confirm the app loads without errors and existing quest functionality still works (open QuestPicker from bottom bar).
- Save exactly one screenshot to research/timed-quests-rpg/screenshots/phase-1.png.
- Stop the background dev server.

STEP 5 - COMMIT & UPDATE DOCS: Commit the phase, then update progress.md and state.md.
```

---

## Phase 2: Timed Quest Store + Timer Utility

**Goal**: Build the timed quest store with full lifecycle (create, start, tick, complete, fail, abandon) and a timer utility for countdown logic.

**Deliverables**:
1. New `src/lib/timer.ts`: `createCountdown(totalSeconds)` returning `{ remaining, elapsed, isExpired, percentRemaining }` given a start time and pause duration. Pure functions, no side effects.
2. New `src/stores/imageRevealStore.ts`: Zustand + localforage persist. State: `activeQuest` (TimedQuest | null), `completedQuests` (TimedQuest[]), `isPaused`, `pauseStartedAt`. Actions: `startQuest(wordGoal, timeMinutes)` (applies armor time bonus from playerStore), `addWords(count)` (applies weapon multiplier from playerStore), `tickTimer()`, `pauseTimer()`, `resumeTimer()`, `completeQuest()` (calculates rewards, calls playerStore.addCoins), `failQuest()` (partial rewards), `abandonQuest()`, `useConsumable(itemId)` (Time Freeze / Word Burst / Second Wind effects).
3. Modify `src/stores/documentStore.ts`: In `updateDocumentContent`, also call `useTimedQuestStore.getState().addWords(delta)` alongside the existing imageRevealStore call.

### Starter Prompt
```
This is Phase 2 of the Timed Quests + RPG feature: Timed Quest Store + Timer Utility.

Goal: Build the timed quest store with full lifecycle and a timer utility, then wire word deltas from documentStore.

STEP 1 - LOAD CONTEXT (Haiku, context distillation — do NOT read planning docs yourself):
Spawn an Explore agent (model: haiku) to read and summarize:
- research/timed-quests-rpg/state.md
- research/timed-quests-rpg/progress.md
- research/timed-quests-rpg/implementation-plan.md (Phase 2 section only)
- src/types/index.ts (the new RPG types from Phase 1)
- src/lib/items.ts (item catalog + effect functions from Phase 1)
- src/lib/questRewards.ts (difficulty + reward calculation from Phase 1)
- src/stores/playerStore.ts (player store from Phase 1)
- src/stores/documentStore.ts (word delta pipeline, especially updateDocumentContent)
- src/stores/imageRevealStore.ts (addWords pattern reference)
- CLAUDE.md
The agent should return: RPG types, item effect functions, reward calculators, playerStore actions, and the word delta integration point in documentStore.

STEP 2 - CREATE TEAM (timed-quests-rpg-phase-2, Sonnet inner loop):
Spawn a single storage-dev agent (model: sonnet, mode: bypassPermissions):

storage-dev agent deliverables:
- Create src/lib/timer.ts: Pure functions for countdown logic. getTimerState(startedAt, totalSeconds, pausedDuration, currentPauseStart?) → { remainingSeconds, elapsedSeconds, isExpired, percentRemaining }. No setInterval — the store will call tickTimer which uses wall-clock time.
- Create src/stores/imageRevealStore.ts: Zustand + localforage persist (key: 'writinator-timed-quest', version: 1). State: activeQuest (TimedQuest | null), completedQuests (TimedQuest[]), isPaused (boolean), pauseStartedAt (number | null), activeEffects (for consumables like Word Burst). Actions:
  - startQuest(wordGoal, timeMinutes): Get equipped armor from playerStore, apply time bonus, create TimedQuest with adjusted time, set startedAt to Date.now()
  - addWords(count): If no active quest or paused, return. Apply weapon multiplier from playerStore. Apply Word Burst if active. Add effective words to quest. If wordsWritten >= wordGoal, call completeQuest()
  - tickTimer(): Check if time expired using timer.ts. If expired, call failQuest()
  - pauseTimer() / resumeTimer(): Track pause duration
  - completeQuest(): Calculate reward via questRewards.ts, call playerStore.addCoins(), move to completedQuests
  - failQuest(): Calculate partial reward (base × %completed × 0.5), move to completedQuests with result 'failure'
  - abandonQuest(): Move to completedQuests with result 'abandoned', no reward
  - useConsumable(itemId): Call playerStore.useConsumable(), apply effect (Time Freeze: set pausedDuration adjustment; Word Burst: set activeEffect; Second Wind: increase totalSeconds)
  Partialize to activeQuest, completedQuests, isPaused, pauseStartedAt, activeEffects.
- Modify src/stores/documentStore.ts: In updateDocumentContent's debounced callback, add useTimedQuestStore.getState().addWords(delta) alongside the existing imageRevealStore.addWords(delta) call.

STEP 3 - STATIC QA: npx eslint ., npx tsc -b --noEmit, npx vite build. Fix any failures.

STEP 4 - VISUAL QA (Opus, main agent does this itself):
- Launch dev server: `npm run dev` in the background, wait for it to report ready.
- Open http://localhost:5173 with the available browser automation tool.
- Confirm the app loads without errors. Open QuestPicker and verify image reveal quests still work.
- Save exactly one screenshot to research/timed-quests-rpg/screenshots/phase-2.png.
- Stop the background dev server.

STEP 5 - COMMIT & UPDATE DOCS: Commit the phase, then update progress.md and state.md.
```

---

## Phase 3: Quest Creation UI — Timed Quest Tab in QuestPicker

**Goal**: Extend QuestPicker with a tabbed interface and a timed quest creation form showing word goal, time limit, auto-calculated difficulty, potential rewards, and equipped gear effects.

**Deliverables**:
1. Refactor `QuestPicker.tsx` to have two tabs: "Image Quest" (existing) and "Timed Quest" (new)
2. New timed quest creation form: word goal presets (250/500/1000/2000) + custom, time limit presets (5/10/15/30/60 min) + custom, difficulty badge (auto-calculated, color-coded), potential coin reward display, equipped weapon/armor shown with their effects
3. "Start Quest" button that calls `imageRevealStore.startQuest()` and closes the modal
4. Show active timed quest status in the QuestPicker (if one exists) with abandon option

### Starter Prompt
```
This is Phase 3 of the Timed Quests + RPG feature: Quest Creation UI — Timed Quest Tab.

Goal: Extend QuestPicker with a tabbed interface adding a timed quest creation form with difficulty preview and reward estimates.

STEP 1 - LOAD CONTEXT (Haiku, context distillation — do NOT read planning docs yourself):
Spawn an Explore agent (model: haiku) to read and summarize:
- research/timed-quests-rpg/state.md
- research/timed-quests-rpg/progress.md
- research/timed-quests-rpg/implementation-plan.md (Phase 3 section only)
- src/components/quests/QuestPicker.tsx (full file — this is what we're extending)
- src/stores/imageRevealStore.ts (startQuest action, activeQuest state)
- src/stores/playerStore.ts (equipped items)
- src/lib/questRewards.ts (calculateDifficulty, calculateReward, getDifficultyColor/Label)
- src/lib/items.ts (getWeaponMultiplier, getArmorTimeBonus, getItemById)
- CLAUDE.md
The agent should return: QuestPicker structure and patterns, timed quest store API, player store equipped items API, reward/difficulty calculation API, item effect API.

STEP 2 - CREATE TEAM (timed-quests-rpg-phase-3, Sonnet inner loop):
Spawn a single ui-dev agent (model: sonnet, mode: bypassPermissions):

ui-dev agent deliverables:
- Refactor QuestPicker.tsx to add tab navigation at the top: "Image Quest" | "Timed Quest". Image Quest tab contains all existing content (New Quest form, active sessions, completed gallery). Timed Quest tab is new.
- Timed Quest tab contents:
  - If activeQuest exists: Show active quest card with word progress, time display, difficulty badge, and "Abandon Quest" button
  - If no activeQuest: Show creation form:
    - Word goal: preset buttons (250, 500, 1000, 2000) + Custom input. Same style as existing image quest presets.
    - Time limit: preset buttons (5, 10, 15, 30, 60 min) + Custom input. Same button style.
    - Difficulty badge: Auto-calculated from selections, color-coded (green/amber/orange/red-purple for easy/medium/hard/epic). Updates live as user changes word/time.
    - Reward preview: "~X coins" based on calculateReward with 100% completion estimate
    - Equipment display: Show equipped weapon name + multiplier, equipped armor name + time bonus. Small text, informational.
    - "Start Timed Quest" button (amber-500, prominent). Disabled until both word goal and time are selected.
  - Below form: Completed timed quests list (recent 10) showing word goal, time, result (success/failure/abandoned), coins earned, difficulty badge. Compact rows.
- Styling: Match existing QuestPicker dark theme. Tab bar uses gray-700 bg with amber-400 active indicator. Difficulty colors: easy=emerald-400, medium=amber-400, hard=orange-400, epic=purple-400.
- Tab state: default to "Timed Quest" tab if no image reveal sessions are active, otherwise "Image Quest".

STEP 3 - STATIC QA: npx eslint ., npx tsc -b --noEmit, npx vite build. Fix any failures.

STEP 4 - VISUAL QA (Opus, main agent does this itself):
- Launch dev server: `npm run dev` in the background, wait for it to report ready.
- Open http://localhost:5173 with the available browser automation tool.
- Open the QuestPicker modal from the bottom bar. Verify both tabs appear and switch correctly.
- On the Timed Quest tab, select a word goal and time limit. Verify difficulty badge updates and reward preview shows.
- Switch to Image Quest tab and verify existing functionality still works.
- Save exactly one screenshot to research/timed-quests-rpg/screenshots/phase-3.png.
- Stop the background dev server.

STEP 5 - COMMIT & UPDATE DOCS: Commit the phase, then update progress.md and state.md.
```

---

## Phase 4: Active Timed Quest Panel

**Goal**: Build a floating panel that shows the active timed quest with a live countdown timer, word progress bar, difficulty badge, and consumable quick-use buttons.

**Deliverables**:
1. New `src/components/quests/TimedQuestPanel.tsx`: Floating panel (same positioning pattern as ImageRevealPanel), collapsed (timer + word count) and expanded (full details + consumables) states
2. Timer display with countdown (MM:SS), color shifts as time runs low (amber → orange → red)
3. Word progress bar with current/goal count
4. Consumable quick-use buttons (only show owned consumables)
5. Quest complete/fail celebration/commiseration overlay with coin reward animation
6. Wire into AppShell.tsx alongside ImageRevealPanel
7. Timer tick via `requestAnimationFrame` or 1-second `setInterval` calling `imageRevealStore.tickTimer()`

### Starter Prompt
```
This is Phase 4 of the Timed Quests + RPG feature: Active Timed Quest Panel.

Goal: Build a floating panel showing the active timed quest with live countdown timer, word progress, and consumable buttons.

STEP 1 - LOAD CONTEXT (Haiku, context distillation — do NOT read planning docs yourself):
Spawn an Explore agent (model: haiku) to read and summarize:
- research/timed-quests-rpg/state.md
- research/timed-quests-rpg/progress.md
- research/timed-quests-rpg/implementation-plan.md (Phase 4 section only)
- src/components/quests/ImageRevealPanel.tsx (floating panel pattern, collapsed/expanded, celebration queue)
- src/components/layout/AppShell.tsx (where panels are wired in)
- src/stores/imageRevealStore.ts (activeQuest, tickTimer, useConsumable, isPaused)
- src/stores/playerStore.ts (consumableInventory)
- src/lib/timer.ts (getTimerState)
- src/lib/items.ts (consumable items)
- CLAUDE.md
The agent should return: ImageRevealPanel patterns (positioning, collapsed/expanded, celebration), AppShell panel wiring, imageRevealStore API, timer utility API, consumable items and inventory.

STEP 2 - CREATE TEAM (timed-quests-rpg-phase-4, Sonnet inner loop):
Spawn a single ui-dev agent (model: sonnet, mode: bypassPermissions):

ui-dev agent deliverables:
- Create src/components/quests/TimedQuestPanel.tsx:
  - Floating panel: `fixed bottom-12 left-4 z-40` (left side, to not overlap ImageRevealPanel on right)
  - Collapsed view: Timer countdown (MM:SS), word count fraction (e.g., "342 / 500"), difficulty badge dot. Click to expand.
  - Expanded view:
    - Header: "Timed Quest" + difficulty badge (colored label) + collapse button
    - Timer: Large countdown display (MM:SS). Color: white when >50% time, amber-400 when 25-50%, orange-400 when 10-25%, red-400 when <10% with pulse animation.
    - Progress: Word progress bar (amber-500 fill on gray-700 bg) + "342 / 500 words" label. Show effective word rate if weapon equipped (e.g., "1.25x from Enchanted Quill").
    - Equipment: Small text showing equipped weapon + armor effects
    - Consumables: Row of buttons for owned consumables. Each shows icon + count. Disabled if count is 0. Click calls imageRevealStore.useConsumable(). Tooltip with item name and effect.
    - Pause/Resume button (only if quest supports pausing — for now, always allow)
    - Abandon button (with confirmation)
  - Completion overlay: When quest completes (success), show celebration: emerald heading "Quest Complete!", coin reward with animated count-up, difficulty badge, time remaining. "Done" button dismisses.
  - Failure overlay: When quest fails (time out), show: orange heading "Time's Up!", words written / goal, partial coin reward, "Try Again" (opens QuestPicker) and "Done" buttons.
  - Timer tick: useEffect with setInterval(1000ms) calling imageRevealStore.getState().tickTimer(). Clean up on unmount. Also update local display state each tick via getTimerState().
  - Self-hides when no activeQuest and no pending celebration.
- Modify src/components/layout/AppShell.tsx:
  - Import and render TimedQuestPanel alongside ImageRevealPanel
  - No new state needed (TimedQuestPanel manages its own visibility)

STEP 3 - STATIC QA: npx eslint ., npx tsc -b --noEmit, npx vite build. Fix any failures.

STEP 4 - VISUAL QA (Opus, main agent does this itself):
- Launch dev server: `npm run dev` in the background, wait for it to report ready.
- Open http://localhost:5173 with the available browser automation tool.
- Open QuestPicker, go to Timed Quest tab, start a quest (e.g., 250 words, 10 min).
- Verify TimedQuestPanel appears on the left with countdown timer and word count.
- Click to expand and verify all sections render correctly.
- Type some words in the editor and verify word count updates in the panel.
- Save exactly one screenshot to research/timed-quests-rpg/screenshots/phase-4.png.
- Stop the background dev server.

STEP 5 - COMMIT & UPDATE DOCS: Commit the phase, then update progress.md and state.md.
```

---

## Phase 4.5: Quest Consolidation — Merge Timer into Image Quests

**Goal**: Eliminate the separate timed quest system. Image quests become the single quest type with an optional timer. RPG mechanics (equipment effects, consumables, coin rewards) apply to ALL quests. The timer is an optional modifier that increases rewards.

**Motivation**: Two separate quest types with separate stores, panels, and creation flows is unnecessary complexity. Every quest is an image reveal. The timer just makes it worth more coins.

**Deliverables**:
1. Extend `ImageRevealSession` with optional timer fields. Delete `TimedQuest` type.
2. Add `calculateBaseReward` for untimed quests. Timed quests earn more via difficulty bonus.
3. Merge timer logic (tick, pause, consumables, fail) from `timedQuestStore` into `imageRevealStore`. Weapon multiplier applies to ALL quests. Delete `timedQuestStore.ts`.
4. Remove timed quest dispatch from `documentStore` (single `imageRevealStore.addWords` handles everything).
5. Merge `TimedQuestPanel` into `ImageRevealPanel` — RPG info (equipment, consumables, coin estimate) shows always; timer countdown shows when timed. Delete `TimedQuestPanel.tsx`.
6. Simplify `QuestPicker` — remove tabs, single creation flow with optional "Add Timer" toggle. Timer reveals time presets + difficulty badge + enhanced reward preview.

### Starter Prompt
```
This is Phase 4.5 of the Timed Quests + RPG feature: Quest Consolidation — Merge Timer into Image Quests.

Goal: Eliminate the separate timed quest system. Image quests become the single quest type. RPG mechanics (equipment, consumables, coins) apply to ALL quests. The timer is an optional modifier for higher rewards.

STEP 1 - LOAD CONTEXT (Haiku, context distillation — do NOT read planning docs yourself):
Spawn an Explore agent (model: haiku) to read and summarize:
- research/timed-quests-rpg/state.md
- research/timed-quests-rpg/progress.md
- research/timed-quests-rpg/implementation-plan.md (Phase 4.5 section only)
- src/types/index.ts (ImageRevealSession, TimedQuest, all RPG types)
- src/stores/timedQuestStore.ts (full file — this is being deleted, need all its logic)
- src/stores/imageRevealStore.ts (full file — this absorbs timer logic)
- src/stores/documentStore.ts (word delta pipeline — the two addWords calls)
- src/stores/playerStore.ts (coins, equipment, consumableInventory)
- src/components/quests/TimedQuestPanel.tsx (full file — being merged into ImageRevealPanel)
- src/components/quests/ImageRevealPanel.tsx (full file — absorbs TimedQuestPanel features)
- src/components/quests/QuestPicker.tsx (full file — tabs being removed)
- src/components/layout/AppShell.tsx (panel wiring)
- src/lib/timer.ts (getTimerState — stays as-is)
- src/lib/items.ts (item catalog — stays as-is)
- src/lib/questRewards.ts (reward calculations — needs base reward addition)
- CLAUDE.md
The agent should return: Complete API surfaces for both quest stores, full ImageRevealPanel and TimedQuestPanel patterns, QuestPicker tab structure and both forms, documentStore word delta dispatch, reward calculation API, all RPG types.

STEP 2 - CREATE TEAM (Sonnet inner loop):
This is a large refactor touching types, stores, and UI. Use TWO agents:

Agent 1: storage-dev (model: sonnet, mode: bypassPermissions) — Types + Stores:

Types (src/types/index.ts):
- Add optional timer fields to ImageRevealSession:
  - timeMinutes?: number (if set, quest is timed)
  - pausedDuration?: number (default 0)
  - result?: QuestResult (success/failure/abandoned — only for timed)
  - coinsEarned?: number (recorded at completion)
- Delete the TimedQuest interface entirely.
- Keep QuestDifficulty, QuestResult, ActiveEffect, all item types unchanged.

Rewards (src/lib/questRewards.ts):
- Add calculateBaseReward(wordGoal: number, weaponMultiplier: number): number — formula: Math.floor(wordGoal * 0.1 * weaponMultiplier). A 500-word quest earns ~50 coins base.
- Add calculateTimedBonus(wordGoal: number, timeMinutes: number, wordsWritten: number, timeUsedSeconds: number, difficulty: QuestDifficulty): number — the existing calculateReward logic refactored as a bonus on top of base.
- Add unified calculateQuestReward(opts: { wordGoal, wordsWritten, weaponMultiplier, timeMinutes?, timeUsedSeconds?, difficulty? }): number — returns base + optional timed bonus.
- Keep calculateDifficulty, getDifficultyColor, getDifficultyLabel unchanged.

Store merge (src/stores/imageRevealStore.ts):
- Add to state: isPaused (boolean), pauseStartedAt (number | null), activeEffects (ActiveEffect[])
- Modify startSession: accept optional timeMinutes parameter. When present, set timer fields on session. Apply armor time bonus from playerStore (increase timeMinutes by armorTimeBonus percentage).
- Modify addWords: 
  - ALWAYS apply weapon multiplier from playerStore (getWeaponMultiplier). This is the biggest change — currently image quests count raw words.
  - Apply Word Burst effect if active (2x multiplier, decrement remainingValue).
  - On completion of each session: calculate reward via calculateQuestReward (with or without timer fields), call playerStore.addCoins(), set coinsEarned on session.
  - Call playerStore.addQuestStats on completion.
- Add tickTimer(): check all active sessions with timeMinutes for expiration via getTimerState. If expired, call failSession.
- Add pauseTimer() / resumeTimer(): set isPaused, track pauseStartedAt. Applies to all timed sessions.
- Add useConsumable(itemId: string): call playerStore.useConsumable(), apply effect:
  - time-freeze: add effectValue * 1000 to pausedDuration of all timed sessions
  - word-burst: push { type: 'wordBurst', remainingValue: effectValue } to activeEffects
  - second-wind: increase timeMinutes by effectValue/60 on all timed sessions
- Add failSession(sessionId): for timer expiry. Calculate partial reward (base × fraction × 0.5), grant partial coins, move to completedSessions with result 'failure'.
- Add abandonSession(sessionId): move to completedSessions with result 'abandoned', no reward.
- Keep all existing image reveal logic (pixelation levels, completion, etc.) unchanged.
- Constraint: only one timed session at a time (startSession rejects if timeMinutes provided and another timed session exists). Multiple untimed sessions still allowed.

DocumentStore (src/stores/documentStore.ts):
- Remove import of useTimedQuestStore.
- Remove the useTimedQuestStore.getState().addWords(delta) call.
- The single useImageRevealStore.getState().addWords(delta) call now handles everything.

Delete src/stores/timedQuestStore.ts entirely.

Agent 2: ui-dev (model: sonnet, mode: bypassPermissions) — Panel Merge + QuestPicker:

IMPORTANT: This agent depends on Agent 1's store changes. Give it the EXACT new store API so it can code against it. It should NOT import timedQuestStore anywhere.

ImageRevealPanel merge (src/components/quests/ImageRevealPanel.tsx):
- Import timer utilities, items, questRewards, playerStore.
- The panel always shows RPG info for each session:
  - Equipment info line (weapon name + multiplier)
  - Coin estimate: "~X coins" from calculateQuestReward preview
  - Word progress bar already exists — keep it
- When a session has timeMinutes (is timed), ALSO show:
  - Timer countdown (MM:SS) with color coding: white >50%, amber-400 25-50%, orange-400 10-25%, red-400 <10% with animate-pulse
  - Pause/Resume button
  - Consumable quick-use buttons (same as TimedQuestPanel had)
  - Abandon button with inline confirmation
- Timer tick: useEffect with setInterval(1000ms) calling imageRevealStore.getState().tickTimer() when any timed session exists.
- Result overlays on completion:
  - Success: Show revealed image + "Quest Complete!" + coins earned
  - Failure (timer expired): Show partial image + "Time's Up!" + partial coins + words written/goal
- Collapsed view: if any session is timed, show timer countdown alongside thumbnail
- Port the Zustand subscribe pattern from TimedQuestPanel for detecting quest completion/failure.

Delete src/components/quests/TimedQuestPanel.tsx.

QuestPicker simplification (src/components/quests/QuestPicker.tsx):
- Remove Tab type and tab navigation (no more "Image Quest" / "Timed Quest" tabs).
- Single creation flow:
  1. Word goal presets (250, 500, 1000, 2000, 5000) + Custom — same style
  2. Image section (Unsplash fetch — existing flow, unchanged)
  3. "Add Timer" toggle (default off). Styled as a subtle switch/checkbox.
     When toggled on, reveal:
     - Time limit presets (5, 10, 15, 30, 60 min) + Custom
     - Difficulty badge (auto-calculated from word goal + time, color-coded)
     - Enhanced reward preview showing base + timer bonus
     When toggled off:
     - Show base reward preview only
  4. Equipment display (always shown): weapon multiplier + armor time bonus (if timer on)
  5. "Start Quest" button calls imageRevealStore.startSession(...) with optional timeMinutes
- Active sessions section: show ALL active sessions. Timed ones get a timer badge/countdown.
- Completed gallery: stays for image quests. Show coins earned on each.
- Remove all sub-components that reference TimedQuest or timedQuestStore.
- Remove import of useTimedQuestStore.

AppShell (src/components/layout/AppShell.tsx):
- Remove TimedQuestPanel import and <TimedQuestPanel /> rendering.
- Keep ImageRevealPanel (now handles everything).
- Remove any useTimedQuestStore imports.

STEP 3 - STATIC QA: npx eslint ., npx tsc -b --noEmit, npx vite build. Fix any failures. This is a large refactor so expect some type errors from stale references — fix them all.

STEP 4 - VISUAL QA (Opus, main agent does this itself):
- Launch dev server: npm run dev in the background, wait for ready.
- Open http://localhost:5173 with Puppeteer.
- Create a new book if needed.
- Open QuestPicker — verify NO tabs, single creation flow.
- Start an untimed quest (just pick word goal, start). Verify ImageRevealPanel shows with RPG info (equipment, coin estimate).
- Start a quest with timer enabled. Verify timer countdown appears in the panel.
- Type some words and verify word count updates (with weapon multiplier applied).
- Save one screenshot to research/timed-quests-rpg/screenshots/phase-4.5.png.
- Stop background dev server.

STEP 5 - COMMIT & UPDATE DOCS: Commit the phase, then update progress.md and state.md. Note the architectural change in state.md.
```

---

## Phase 5: Coin Display + Reward Toasts

**Goal**: Add a persistent coin balance display to the bottom bar and animated reward toast notifications when coins are earned.

**Deliverables**:
1. Coin display in AppShell bottom bar (near quest button): coin icon + balance, subtle gold color
2. New `src/components/quests/RewardToast.tsx`: Animated toast that slides in showing "+X coins" with a coin icon, auto-dismisses after 3 seconds
3. Retroactive coin grant for already-completed quests (base reward each, applied once on first load)
4. Quest completions already grant coins via imageRevealStore.addWords (from Phase 4.5) — verify this works with RewardToast

### Starter Prompt
```
This is Phase 5 of the Timed Quests + RPG feature: Coin Display + Reward Toasts.

Goal: Add coin balance to the bottom bar and animated reward notifications when coins are earned.

STEP 1 - LOAD CONTEXT (Haiku, context distillation — do NOT read planning docs yourself):
Spawn an Explore agent (model: haiku) to read and summarize:
- research/timed-quests-rpg/state.md
- research/timed-quests-rpg/progress.md
- research/timed-quests-rpg/implementation-plan.md (Phase 5 section only)
- src/components/layout/AppShell.tsx (bottom bar section — focus on the right-side buttons area)
- src/stores/playerStore.ts (coins, addCoins)
- src/stores/imageRevealStore.ts (completedSessions, addWords completion logic)
- CLAUDE.md
The agent should return: Bottom bar layout and button patterns, playerStore coins API, imageRevealStore completion flow.

STEP 2 - CREATE TEAM (timed-quests-rpg-phase-5, Sonnet inner loop):
Spawn a single ui-dev agent (model: sonnet, mode: bypassPermissions):

ui-dev agent deliverables:
- Modify src/components/layout/AppShell.tsx:
  - Add coin display to bottom bar, positioned left of the Quest button. Show a small coin icon (use a simple circle with "C" or a Lucide coin icon) + balance number in amber-400/gold text. Use tabular-nums for the number.
  - Animate the coin count when it changes (brief scale-up pulse).
- Create src/components/quests/RewardToast.tsx:
  - Fixed position toast, appears from bottom-center of screen.
  - Shows "+X coins" with coin icon, difficulty badge if from a timed quest.
  - Slide-up entrance animation, auto-dismiss after 3 seconds with fade-out.
  - Support queue of multiple toasts (e.g., if image reveal and timed quest complete close together).
  - Export a simple API: useRewardToast() hook that returns { showReward(amount, source?) }.
  - Render RewardToast in AppShell.
- Modify src/stores/imageRevealStore.ts:
  - In addWords(), when a session completes (moves to completedSessions), also call usePlayerStore.getState().addCoins(100).
- Add retroactive coin grant: In playerStore, add a `retroactiveGrantApplied` boolean (persisted). On first load (or in AppShell useEffect), if not applied, count completedSessions from imageRevealStore and grant 100 coins each. Set flag to true.

STEP 3 - STATIC QA: npx eslint ., npx tsc -b --noEmit, npx vite build. Fix any failures.

STEP 4 - VISUAL QA (Opus, main agent does this itself):
- Launch dev server: `npm run dev` in the background, wait for it to report ready.
- Open http://localhost:5173 with the available browser automation tool.
- Verify coin balance appears in the bottom bar.
- If there are completed image reveal quests, verify retroactive coins were granted.
- Save exactly one screenshot to research/timed-quests-rpg/screenshots/phase-5.png.
- Stop the background dev server.

STEP 5 - COMMIT & UPDATE DOCS: Commit the phase, then update progress.md and state.md.
```

---

## Phase 6: RPG Shop — Item Cards and Purchase Flow

**Goal**: Build an RPG-styled shop modal where players browse and buy weapons, armor, and consumables with their coins.

**Deliverables**:
1. New `src/components/quests/ShopModal.tsx`: Full-screen centered modal (like QuestPicker) with RPG styling
2. Three category tabs: Weapons | Armor | Consumables
3. Item cards with: icon/illustration, name, rarity border color, description, stat effect, price, owned/equipped badges
4. Purchase flow: click to select, confirm purchase, coin balance updates, item added to inventory
5. Wire shop button into AppShell bottom bar (or accessible from QuestPicker)

### Starter Prompt
```
This is Phase 6 of the Timed Quests + RPG feature: RPG Shop — Item Cards and Purchase Flow.

Goal: Build an RPG-styled shop modal with item cards, category tabs, and purchase flow.

STEP 1 - LOAD CONTEXT (Haiku, context distillation — do NOT read planning docs yourself):
Spawn an Explore agent (model: haiku) to read and summarize:
- research/timed-quests-rpg/state.md
- research/timed-quests-rpg/progress.md
- research/timed-quests-rpg/implementation-plan.md (Phase 6 section only)
- src/components/quests/QuestPicker.tsx (modal pattern reference — full-screen centered modal)
- src/stores/playerStore.ts (coins, ownedItems, purchaseItem, equipItem)
- src/lib/items.ts (full item catalog, categories, rarities, effects)
- src/components/layout/AppShell.tsx (bottom bar — where shop button goes)
- CLAUDE.md
The agent should return: QuestPicker modal pattern (overlay, sizing, dismiss), playerStore purchase/equip API, full item catalog with prices and effects, AppShell bottom bar layout.

STEP 2 - CREATE TEAM (timed-quests-rpg-phase-6, Sonnet inner loop):
Spawn a single ui-dev agent (model: sonnet, mode: bypassPermissions):

ui-dev agent deliverables:
- Create src/components/quests/ShopModal.tsx:
  - Full-screen centered modal with RPG theming. Overlay: bg-black/70. Panel: max-w-2xl, bg-gray-900 with subtle border.
  - Header: "Armory" or "Quest Shop" title in a fantasy-ish style (larger text, maybe amber-300). Coin balance display (prominent, top-right of header).
  - Category tabs: Weapons | Armor | Consumables. Styled as RPG tab buttons (not plain text tabs). Active tab highlighted with amber/gold accent.
  - Item grid (2 columns on larger panels, 1 column on narrow):
    - Each item card: Dark card (gray-800) with left border colored by rarity (common=gray-400, uncommon=emerald-400, rare=blue-400, epic=purple-400, legendary=amber-400).
    - Card contents: Item name (bold), rarity label (small, colored text), description (gray-400 text), stat effect (e.g., "1.25x word value" or "+15% time"), price in coins.
    - States: Not owned (show price + "Buy" button), Owned (show "Owned" badge, "Equip" button for weapons/armor), Equipped (show "Equipped" emerald badge).
    - Consumables: Show owned count, "Buy" button always available, amount selector (1/5/10).
    - Locked state: If player can't afford, dim the card slightly, "Buy" button disabled, show price in red.
  - Purchase confirmation: For items costing >500 coins, show a small inline confirmation ("Buy Enchanted Quill for 200 coins? [Confirm] [Cancel]"). Cheaper items purchase immediately.
  - Purchase animation: Brief flash of emerald on the card, coin balance animates down.
  - Standard dismiss: Escape, click-outside, close button.
- Modify src/components/layout/AppShell.tsx:
  - Add shop button to bottom bar (between coin display and quest button). Small shield/shop icon, gray-500 hover:gray-300.
  - Add ShopModal with open/onClose state management (same pattern as QuestPicker).

STEP 3 - STATIC QA: npx eslint ., npx tsc -b --noEmit, npx vite build. Fix any failures.

STEP 4 - VISUAL QA (Opus, main agent does this itself):
- Launch dev server: `npm run dev` in the background, wait for it to report ready.
- Open http://localhost:5173 with the available browser automation tool.
- Click the shop button in the bottom bar to open the shop modal.
- Browse all three category tabs. Verify item cards display correctly with proper styling.
- Verify owned items (Wooden Pencil, Cloth Tunic) show as owned/equipped.
- If coins are available, test purchasing an item.
- Save exactly one screenshot to research/timed-quests-rpg/screenshots/phase-6.png.
- Stop the background dev server.

STEP 5 - COMMIT & UPDATE DOCS: Commit the phase, then update progress.md and state.md.
```

---

## Phase 7: Equipment Panel + Consumable Inventory

**Goal**: Build an equipment panel where players view and manage their equipped gear and consumable inventory, accessible from the shop or bottom bar.

**Deliverables**:
1. New `src/components/quests/EquipmentPanel.tsx`: Side panel (like StyleEditor) or section within ShopModal showing equipped weapon + armor with stats, and consumable inventory with counts
2. Equipment slots: Click to open item selector (owned items only), click to equip/unequip
3. Consumable inventory: Grid of owned consumables with counts, info tooltips
4. Stats summary: Current word multiplier, current time bonus, total coins earned

### Starter Prompt
```
This is Phase 7 of the Timed Quests + RPG feature: Equipment Panel + Consumable Inventory.

Goal: Build an equipment management panel with equip/unequip and consumable inventory display.

STEP 1 - LOAD CONTEXT (Haiku, context distillation — do NOT read planning docs yourself):
Spawn an Explore agent (model: haiku) to read and summarize:
- research/timed-quests-rpg/state.md
- research/timed-quests-rpg/progress.md
- research/timed-quests-rpg/implementation-plan.md (Phase 7 section only)
- src/components/quests/ShopModal.tsx (the shop modal we'll integrate with)
- src/stores/playerStore.ts (equippedWeapon, equippedArmor, consumableInventory, equipItem, unequipItem)
- src/lib/items.ts (item catalog, getItemById, getWeaponMultiplier, getArmorTimeBonus)
- src/components/editor/StyleEditor.tsx (side panel pattern reference if using panel approach)
- CLAUDE.md
The agent should return: ShopModal structure, playerStore equipment API, item catalog and effect functions, side panel pattern.

STEP 2 - CREATE TEAM (timed-quests-rpg-phase-7, Sonnet inner loop):
Spawn a single ui-dev agent (model: sonnet, mode: bypassPermissions):

ui-dev agent deliverables:
- Create src/components/quests/EquipmentPanel.tsx as a tab or section within ShopModal (add an "Equipment" tab alongside Weapons/Armor/Consumables, or put it as a persistent sidebar within the shop):
  - Equipment slots section:
    - Weapon slot: Card showing equipped weapon (icon, name, rarity, "1.25x word value" stat). Click opens a dropdown/list of owned weapons to swap. "Unequip" option.
    - Armor slot: Same pattern for equipped armor with time bonus stat.
    - Empty slot: Dashed border placeholder, "No weapon equipped" text, click to browse weapons.
  - Stats summary:
    - Current word multiplier (from weapon)
    - Current time bonus (from armor)
    - Total quests completed
    - Total coins earned (lifetime)
    - Total words written in quests
  - Consumable inventory section:
    - Grid of owned consumables. Each: icon, name, count badge, brief effect description.
    - Consumables with 0 count shown dimmed or hidden.
    - "Use in Quest" note (consumables can only be used during active timed quests, from TimedQuestPanel).
  - Styling: Consistent with ShopModal RPG theme. Equipment slots have subtle glow/border matching equipped item rarity.
- Modify ShopModal.tsx to integrate EquipmentPanel (add tab or sidebar section).

STEP 3 - STATIC QA: npx eslint ., npx tsc -b --noEmit, npx vite build. Fix any failures.

STEP 4 - VISUAL QA (Opus, main agent does this itself):
- Launch dev server: `npm run dev` in the background, wait for it to report ready.
- Open http://localhost:5173 with the available browser automation tool.
- Open the shop modal and navigate to the equipment section.
- Verify equipped items display with correct stats.
- Test equipping a different weapon/armor (if multiple owned).
- Verify consumable inventory shows correctly.
- Save exactly one screenshot to research/timed-quests-rpg/screenshots/phase-7.png.
- Stop the background dev server.

STEP 5 - COMMIT & UPDATE DOCS: Commit the phase, then update progress.md and state.md.
```

---

## Phase 8: Polish + Quest Reminder Integration

**Goal**: Polish the full feature — update QuestReminder to mention timed quests, add keyboard shortcut for shop, tune reward balance, handle edge cases.

**Deliverables**:
1. Update `QuestReminder.tsx` to mention timed quests (not just image quests)
2. Add keyboard shortcut for opening shop (if a non-conflicting binding exists)
3. Handle edge cases: What happens when user closes book during active timed quest? When user switches documents? When browser tab is backgrounded (timer continues based on wall clock, not intervals)?
4. Coin reward balance pass: Verify reward amounts feel right across difficulty tiers
5. Clean up: Remove any dead code, ensure all new code has proper types, consolidate duplicate `countWords` into `src/lib/words.ts`

### Starter Prompt
```
This is Phase 8 of the Timed Quests + RPG feature: Polish + Quest Reminder Integration.

Goal: Polish the full feature — edge cases, QuestReminder update, countWords consolidation, and balance tuning.

STEP 1 - LOAD CONTEXT (Haiku, context distillation — do NOT read planning docs yourself):
Spawn an Explore agent (model: haiku) to read and summarize:
- research/timed-quests-rpg/state.md
- research/timed-quests-rpg/progress.md
- research/timed-quests-rpg/implementation-plan.md (Phase 8 section only)
- src/components/quests/QuestReminder.tsx (current reminder logic)
- src/stores/imageRevealStore.ts (active quest, edge case handling)
- src/stores/documentStore.ts (countWords function, closeBook, setActiveDocument)
- src/stores/snapshotStore.ts (countWords duplicate)
- src/components/layout/AppShell.tsx (keyboard shortcuts, auto-snapshot interval)
- CLAUDE.md
The agent should return: QuestReminder logic, imageRevealStore edge cases, both countWords locations, closeBook/setActiveDocument flows, keyboard shortcut patterns.

STEP 2 - CREATE TEAM (timed-quests-rpg-phase-8, Sonnet inner loop):
Spawn parallel implementation agents (model: sonnet, mode: bypassPermissions):

storage-dev agent deliverables:
- Create src/lib/words.ts: Extract countWords into a shared utility. Update imports in documentStore.ts and snapshotStore.ts to use it. Delete the local copies.
- Edge case handling in imageRevealStore.ts:
  - When book is closed (documentStore.closeBook), pause the timed quest timer (subscribe or handle in closeBook)
  - Timer uses wall-clock time (Date.now() - startedAt - pausedDuration), so backgrounded tabs automatically work correctly. Verify this is the case.
  - When quest is active and user reloads page, quest resumes from persisted state (verify rehydration works — timer should pick up from stored startedAt/pausedDuration).
- Verify reward calculations feel balanced: 250 words / 10 min (easy) = 250 coins, 1000 words / 15 min (epic) = 5000 coins. Adjust if needed.

ui-dev agent deliverables:
- Update QuestReminder.tsx: Change copy to encourage quests. "Start a quest to make your writing count!" or similar. "Let's go" button should open QuestPicker.
- Verify QuestReminder shows when activeSessions is empty.
- Any visual polish: Ensure consistent spacing, colors, and transitions across all new components.

STEP 3 - STATIC QA: npx eslint ., npx tsc -b --noEmit, npx vite build. Fix any failures.

STEP 4 - VISUAL QA (Opus, main agent does this itself):
- Launch dev server: `npm run dev` in the background, wait for it to report ready.
- Open http://localhost:5173 with the available browser automation tool.
- Test full flow: Start with no quests → see QuestReminder → start a timed quest → write words → see timer count down and words increase → complete or let time run out → see reward.
- Verify coin balance updates correctly throughout.
- Save exactly one screenshot to research/timed-quests-rpg/screenshots/phase-8.png.
- Stop the background dev server.

STEP 5 - COMMIT & UPDATE DOCS: Commit the phase, then update progress.md and state.md.
```

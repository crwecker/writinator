# Image Reveal Quests — Implementation Plan

## Team Workflow

Every phase uses Opus 4.6 team agents. Specialized agent types: `editor-dev`, `ui-dev`, `storage-dev`.

1. **Step 1 — Load Context**: Spawn an Explore agent to read planning docs and relevant source files. The main agent does NOT read large docs directly.
2. **Step 2 — Create Team**: Spawn parallel implementation agents (model: opus, mode: bypassPermissions). Use the appropriate specialized agent type based on the work.
3. **Step 3 — QA**: `npx eslint .`, `npx tsc -b --noEmit`, `npx vite build`, commit.
4. **Step 4 — Update Docs**: Update progress.md and state.md.

### Agent Scaling Guidelines

- Match agents to work domains: `editor-dev` for CodeMirror, `ui-dev` for layout/modals/Tailwind, `storage-dev` for Zustand/localforage.
- Split large store work across multiple agents when handling 4+ independent concerns.
- Merge small work into a single agent when one side has only 1-2 trivial changes.
- Never exceed 5 parallel agents.
- Each agent owns complete vertical slices.

### Code Hygiene

- **No regressions**: `npx eslint .`, `npx tsc -b --noEmit`, `npx vite build` after every change.
- **Clean types**: No `any`. Shared types in `src/types/index.ts`.
- **Dead code removal**: No commented-out code, unused imports, or deprecated functions.
- **React patterns**: Stable refs, memoized computations, effect cleanup.

---

## Phase 1: Types, Store, and Canvas Renderer

**Goal**: Build the data layer for image reveal quests and the core canvas pixelation utility.

### Deliverables

1. **New types** in `src/types/index.ts`:
   - `ImageRevealSession`: `{ id, imageUrl, imageWidth, imageHeight, wordGoal, wordsWritten, currentLevel (index into PIXEL_LEVELS), completed, completedAt?, startedAt }`
   - `ImageRevealState`: store interface with `activeSession`, `completedSessions[]`, actions

2. **Image reveal store** (`src/stores/imageRevealStore.ts`):
   - `activeSession: ImageRevealSession | null`
   - `completedSessions: ImageRevealSession[]` (gallery of completed reveals)
   - `startSession(imageUrl, imageWidth, imageHeight, wordGoal)` — creates new session
   - `addWords(count)` — increments wordsWritten, updates currentLevel based on progress, marks completed when goal reached
   - `abandonSession()` — clears activeSession
   - Persisted to localforage key `"writinator-image-reveal"`

3. **Canvas pixelation renderer** (`src/lib/pixelate.ts`):
   - `drawPixelated(canvas, image, level, options?)` — draws the image at a given resolution level (e.g., level=8 means 8×8 grid). Samples source image and fills rects.
   - `animateReveal(canvas, image, fromLevel, toLevel, onComplete?)` — animates from one resolution to the next by drawing rows top-to-bottom with staggered timing.
   - Pure utility, no React dependency. Works with `HTMLCanvasElement` and `HTMLImageElement`.

4. **Wire word deltas** — update `documentStore.updateChapterContent` to also call `imageRevealStore.addWords(delta)` alongside the existing `questStore.addWords(delta)`.

### Starter Prompt
```
This is Phase 1 of the Image Reveal Quests feature: Types, Store, and Canvas Renderer.

Goal: Build the data layer and canvas pixelation utility for image reveal quests.

STEP 1 - LOAD CONTEXT (do NOT read planning docs directly, save your context):
Spawn an Explore agent (model: opus) to read and summarize:
- research/image-reveal-quests/state.md
- research/image-reveal-quests/progress.md
- research/image-reveal-quests/implementation-plan.md (Phase 1 section only)
- src/types/index.ts
- src/stores/questStore.ts (for pattern reference)
- src/stores/documentStore.ts (word delta pipeline, lines 260-300)
- CLAUDE.md
The agent should return: existing quest types, store patterns (persist middleware + localforage), PIXEL_LEVELS array, word delta integration point in documentStore.

STEP 2 - CREATE TEAM (image-reveal-phase-1):
Spawn parallel implementation agents using the Explore summary (not raw docs).

storage-dev agent deliverables:
- Add ImageRevealSession type to src/types/index.ts
- Create src/stores/imageRevealStore.ts with activeSession, completedSessions, startSession, addWords, abandonSession
- Wire documentStore.updateChapterContent to also feed imageRevealStore.addWords(delta)
- Use same localforage persist pattern as questStore

general-purpose agent deliverables:
- Create src/lib/pixelate.ts with drawPixelated() and animateReveal() functions
- drawPixelated: takes canvas, loaded image, resolution level (grid size like 8, 16, 32...), draws sampled pixels as filled rects
- animateReveal: animates row-by-row from one resolution level to the next, with staggered timing per row (top to bottom)
- Pure utility, no React. Use HTMLCanvasElement 2D context and HTMLImageElement.

STEP 3 - QA: eslint, tsc, vite build, commit.
STEP 4 - UPDATE DOCS: progress.md and state.md.
```

---

## Phase 1 QA: Verify Types, Store, and Canvas Renderer

**Goal**: Audit Phase 1 for correctness, edge cases, and dead code.

### QA Starter Prompt
```
This is Phase 1 QA of the Image Reveal Quests feature: Verify Types, Store, and Canvas Renderer.

Goal: Audit Phase 1 implementation for correctness, missing edge cases, dead code, and lint/type errors.

STEP 1 - LOAD CONTEXT (do NOT read planning docs directly, save your context):
Spawn an Explore agent (model: opus) to read and summarize:
- research/image-reveal-quests/state.md (new files from Phase 1)
- research/image-reveal-quests/progress.md (Phase 1 deliverables checklist)
- research/image-reveal-quests/implementation-plan.md (Phase 1 section only)
- All files created or modified in Phase 1
- CLAUDE.md
The agent should return: full list of Phase 1 deliverables, all new/modified files, and any known issues.

STEP 2 - QA AUDIT (spawn parallel review agents using Explore summary):

Correctness agent:
- Verify ImageRevealSession type has all needed fields
- Verify imageRevealStore actions work correctly (startSession, addWords boundary cases, abandonSession)
- Verify word delta pipeline in documentStore feeds BOTH questStore and imageRevealStore
- Verify pixelate.ts handles edge cases: image not loaded, canvas size 0, level 0 (full res), level > image dimensions
- Verify animateReveal cleanup (cancels animation frames on abort)
- Run eslint, tsc, and vite build

Dead code & cleanup agent:
- Check for unused imports in modified files
- Verify no any types were introduced
- Check pixelate.ts doesn't import React or browser globals unnecessarily
- Verify store persistence works (partialize excludes actions)

STEP 3 - FIX: Apply all fixes, run eslint, tsc, vite build, commit.
STEP 4 - UPDATE DOCS: Update progress.md (mark Phase 1 QA complete) and state.md.
```

---

## Phase 2: Unsplash API Integration

**Goal**: Build the image fetching layer with caching and error handling.

### Deliverables

1. **Unsplash service** (`src/lib/unsplash.ts`):
   - `fetchRandomImage(query?)` — fetches a random landscape photo from Unsplash. Returns `{ url, width, height, photographer, photographerUrl }`.
   - Uses Unsplash Source API (no API key needed for basic random photos: `https://source.unsplash.com/random/800x600?nature`) OR the official API with a free access key for better control.
   - Handles loading states, network errors, and rate limiting gracefully.
   - Preloads the image into an `HTMLImageElement` before returning (so the canvas renderer has it ready).

2. **Image preloader utility** — helper to load an image URL into an `HTMLImageElement` and return a promise that resolves when loaded. Used by both the Unsplash service and the canvas renderer.

3. **CORS handling** — Unsplash images need `crossOrigin = "anonymous"` on the img element for canvas to read pixel data. Ensure this is handled in the preloader.

### Starter Prompt
```
This is Phase 2 of the Image Reveal Quests feature: Unsplash API Integration.

Goal: Build the image fetching layer with preloading and error handling.

STEP 1 - LOAD CONTEXT (do NOT read planning docs directly, save your context):
Spawn an Explore agent (model: opus) to read and summarize:
- research/image-reveal-quests/state.md
- research/image-reveal-quests/progress.md
- research/image-reveal-quests/implementation-plan.md (Phase 2 section only)
- src/lib/pixelate.ts (to understand how the image will be consumed)
- CLAUDE.md
The agent should return: how pixelate.ts expects images, any CORS requirements, current lib patterns.

STEP 2 - CREATE TEAM (image-reveal-phase-2):
This phase is small enough for a single agent.

general-purpose agent deliverables:
- Create src/lib/unsplash.ts with fetchRandomImage() function
- Use Unsplash Source API (no key needed) or official API — decide based on CORS and reliability
- Return { url, width, height, photographer, photographerUrl } for attribution
- Create image preloader utility (loadImage(url) → Promise<HTMLImageElement>) with crossOrigin="anonymous"
- Handle network errors, timeouts, and loading states
- Export types for the return value

STEP 3 - QA: eslint, tsc, vite build, commit.
STEP 4 - UPDATE DOCS: progress.md and state.md.
```

---

## Phase 2 QA: Verify Unsplash Integration

### QA Starter Prompt
```
This is Phase 2 QA of the Image Reveal Quests feature: Verify Unsplash API Integration.

Goal: Audit Phase 2 implementation for correctness, missing edge cases, dead code, and lint/type errors.

STEP 1 - LOAD CONTEXT (do NOT read planning docs directly, save your context):
Spawn an Explore agent (model: opus) to read and summarize:
- research/image-reveal-quests/state.md (new files from Phase 2)
- research/image-reveal-quests/progress.md (Phase 2 deliverables checklist)
- research/image-reveal-quests/implementation-plan.md (Phase 2 section only)
- All files created or modified in Phase 2
- CLAUDE.md
The agent should return: full list of Phase 2 deliverables, all new/modified files, and any known issues.

STEP 2 - QA AUDIT (spawn parallel review agents using Explore summary):

Correctness agent:
- Verify fetchRandomImage returns all required fields
- Verify CORS handling (crossOrigin="anonymous" on image elements)
- Verify error handling for network failures, timeouts, invalid responses
- Verify image preloader resolves/rejects correctly
- Run eslint, tsc, and vite build

Dead code & cleanup agent:
- Check for unused imports
- Verify no any types
- Check that types are exported and match what consumers expect

STEP 3 - FIX: Apply all fixes, run eslint, tsc, vite build, commit.
STEP 4 - UPDATE DOCS: Update progress.md (mark Phase 2 QA complete) and state.md.
```

---

## Phase 3: Image Reveal Panel Component

**Goal**: Build the main UI component that displays the canvas-based image reveal.

### Deliverables

1. **ImageRevealPanel** (`src/components/quests/ImageRevealPanel.tsx`):
   - **Collapsed state**: Small floating thumbnail (64×64 canvas) anchored to the bottom-right above the status bar. Shows miniature pixelated image + progress percentage. Click to expand.
   - **Expanded state**: Floating card (320px wide) with:
     - Larger canvas (280×280) showing the current pixelation level
     - Progress bar (word count / goal)
     - Words remaining label
     - Minimize button
     - Abandon button
   - **Canvas integration**: Uses `drawPixelated()` from `src/lib/pixelate.ts`. When the resolution level changes (from store updates), calls `animateReveal()` for the row-by-row transition.
   - **Image loading**: On mount (when activeSession exists), preloads the image URL from the session, then draws initial pixelated state.
   - Self-hides when no active session (like QuestProgress pattern).

2. **Celebration state**: When session completes, the panel auto-expands, shows the fully revealed image with a completion message and photographer attribution. Reuses the `animate-fade-in` keyframe.

3. **Dark theme styling**: `bg-gray-900 border border-gray-700 shadow-2xl rounded-lg` for the floating card. Consistent with existing panel aesthetics.

### Starter Prompt
```
This is Phase 3 of the Image Reveal Quests feature: Image Reveal Panel Component.

Goal: Build the floating panel UI that displays the canvas-based progressive image reveal.

STEP 1 - LOAD CONTEXT (do NOT read planning docs directly, save your context):
Spawn an Explore agent (model: opus) to read and summarize:
- research/image-reveal-quests/state.md
- research/image-reveal-quests/progress.md
- research/image-reveal-quests/implementation-plan.md (Phase 3 section only)
- src/components/quests/QuestProgress.tsx (for pattern reference — self-hiding, celebration overlay)
- src/stores/imageRevealStore.ts (store shape and actions)
- src/lib/pixelate.ts (drawPixelated, animateReveal APIs)
- src/lib/unsplash.ts (image preloader)
- src/index.css (theme variables, animations)
- CLAUDE.md
The agent should return: store shape, pixelate API signatures, QuestProgress patterns, theme/animation classes, dark theme color tokens.

STEP 2 - CREATE TEAM (image-reveal-phase-3):

ui-dev agent deliverables:
- Create src/components/quests/ImageRevealPanel.tsx
- Collapsed state: 64×64 canvas thumbnail, progress %, bottom-right floating position, click to expand
- Expanded state: 320px floating card with 280×280 canvas, progress bar, words remaining, minimize/abandon buttons
- Canvas draws via drawPixelated() on mount and store updates; animateReveal() on level transitions
- Preload image from activeSession.imageUrl on mount using loadImage()
- Celebration state when completed: auto-expand, show clear image, photographer attribution
- Self-hide when no activeSession
- Dark theme: bg-gray-900 border-gray-700 shadow-2xl rounded-lg
- Ensure canvas cleanup (cancel animation frames) on unmount

STEP 3 - QA: eslint, tsc, vite build, commit.
STEP 4 - UPDATE DOCS: progress.md and state.md.
```

---

## Phase 3 QA: Verify Image Reveal Panel

### QA Starter Prompt
```
This is Phase 3 QA of the Image Reveal Quests feature: Verify Image Reveal Panel Component.

Goal: Audit Phase 3 implementation for correctness, missing edge cases, dead code, and lint/type errors.

STEP 1 - LOAD CONTEXT (do NOT read planning docs directly, save your context):
Spawn an Explore agent (model: opus) to read and summarize:
- research/image-reveal-quests/state.md (new files from Phase 3)
- research/image-reveal-quests/progress.md (Phase 3 deliverables checklist)
- research/image-reveal-quests/implementation-plan.md (Phase 3 section only)
- All files created or modified in Phase 3
- CLAUDE.md
The agent should return: full list of Phase 3 deliverables, all new/modified files, and any known issues.

STEP 2 - QA AUDIT (spawn parallel review agents using Explore summary):

Correctness agent:
- Verify canvas renders correctly at each pixelation level
- Verify row-by-row animation triggers on level change (not on every word delta)
- Verify image preloading with crossOrigin for canvas pixel access
- Verify expand/collapse toggle works
- Verify celebration state triggers on completion
- Verify cleanup: animation frame cancellation on unmount and level change
- Verify self-hide when no active session
- Run eslint, tsc, and vite build

Dead code & cleanup agent:
- Check for unused imports
- Verify no any types
- Verify effect cleanup functions
- Check for stable refs on callbacks passed to effects

STEP 3 - FIX: Apply all fixes, run eslint, tsc, vite build, commit.
STEP 4 - UPDATE DOCS: Update progress.md (mark Phase 3 QA complete) and state.md.
```

---

## Phase 4: Quest Picker Integration and Wiring

**Goal**: Add image reveal mode to the quest picker, wire the panel into AppShell, and connect everything end-to-end.

### Deliverables

1. **Quest Picker updates** (`src/components/quests/QuestPicker.tsx`):
   - Add a tab bar at the top: "Quest Arcs" | "Image Reveal"
   - Image Reveal tab shows:
     - Word goal selector (preset buttons: 250, 500, 1000, 2000, 5000 + custom input)
     - "Start Writing" button that fetches a random Unsplash image, creates a session in imageRevealStore, and closes the picker
     - Loading state while fetching image
     - Error state with retry if fetch fails

2. **AppShell integration** (`src/components/layout/AppShell.tsx`):
   - Import and render `ImageRevealPanel` alongside `QuestProgress`
   - Both can coexist (user could have an arc quest AND an image reveal running)

3. **Bottom bar indicator** — update the Quest button in the status bar to also reflect active image reveal sessions (e.g., show image icon when image reveal is active).

### Starter Prompt
```
This is Phase 4 of the Image Reveal Quests feature: Quest Picker Integration and Wiring.

Goal: Wire image reveal mode into the quest picker and app shell for end-to-end functionality.

STEP 1 - LOAD CONTEXT (do NOT read planning docs directly, save your context):
Spawn an Explore agent (model: opus) to read and summarize:
- research/image-reveal-quests/state.md
- research/image-reveal-quests/progress.md
- research/image-reveal-quests/implementation-plan.md (Phase 4 section only)
- src/components/quests/QuestPicker.tsx (full file — this gets modified)
- src/components/layout/AppShell.tsx (full file — this gets modified)
- src/stores/imageRevealStore.ts (startSession API)
- src/lib/unsplash.ts (fetchRandomImage API)
- CLAUDE.md
The agent should return: QuestPicker structure and patterns, AppShell component tree and where quest components are mounted, store action signatures.

STEP 2 - CREATE TEAM (image-reveal-phase-4):

ui-dev agent deliverables:
- Update QuestPicker.tsx: add tab bar ("Quest Arcs" | "Image Reveal"), Image Reveal tab with word goal selector (250/500/1000/2000/5000 + custom), "Start Writing" button, loading/error states
- "Start Writing" calls fetchRandomImage(), then imageRevealStore.startSession(), then onClose()
- Update AppShell.tsx: import and render ImageRevealPanel alongside QuestProgress
- Update bottom bar Quest button to show indicator for active image reveal session
- Consistent dark theme styling for new tab bar and goal selector

STEP 3 - QA: eslint, tsc, vite build, commit.
STEP 4 - UPDATE DOCS: progress.md and state.md.
```

---

## Phase 4 QA: Verify Integration and End-to-End Flow

### QA Starter Prompt
```
This is Phase 4 QA of the Image Reveal Quests feature: Verify Quest Picker Integration and Wiring.

Goal: Audit Phase 4 implementation for correctness, end-to-end data flow, and polish.

STEP 1 - LOAD CONTEXT (do NOT read planning docs directly, save your context):
Spawn an Explore agent (model: opus) to read and summarize:
- research/image-reveal-quests/state.md (new files from Phase 4)
- research/image-reveal-quests/progress.md (Phase 4 deliverables checklist)
- research/image-reveal-quests/implementation-plan.md (Phase 4 section only)
- All files created or modified in Phase 4
- CLAUDE.md
The agent should return: full list of Phase 4 deliverables, all new/modified files, and any known issues.

STEP 2 - QA AUDIT (spawn parallel review agents using Explore summary):

Correctness agent:
- Verify end-to-end flow: pick goal → fetch image → start session → type words → see pixelation clear → celebration
- Verify tab switching in QuestPicker works correctly
- Verify word goal selector (presets + custom input validation)
- Verify loading/error states during image fetch
- Verify both QuestProgress and ImageRevealPanel can coexist in AppShell
- Verify bottom bar indicator updates for image reveal sessions
- Run eslint, tsc, and vite build

Dead code & cleanup agent:
- Check modified files for unused imports
- Verify no any types introduced
- Check that QuestPicker tab state is properly managed
- Verify no duplicate event listeners or effects

STEP 3 - FIX: Apply all fixes, run eslint, tsc, vite build, commit.
STEP 4 - UPDATE DOCS: Update progress.md (mark Phase 4 QA complete) and state.md.
```

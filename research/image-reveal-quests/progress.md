# Image Reveal Quests — Progress

## Overall Status

| Phase | Description | Status | Started | Completed |
|-------|-------------|--------|---------|-----------|
| 1 | Types, Store, and Canvas Renderer | Complete | 2026-04-02 | 2026-04-02 |
| 1 QA | Verify Types, Store, and Canvas Renderer | Complete | 2026-04-02 | 2026-04-02 |
| 2 | Unsplash API Integration | Complete | 2026-04-02 | 2026-04-02 |
| 2 QA | Verify Unsplash Integration | Complete | 2026-04-02 | 2026-04-02 |
| 3 | Image Reveal Panel Component | Complete | 2026-04-02 | 2026-04-02 |
| 3 QA | Verify Image Reveal Panel | Complete | 2026-04-02 | 2026-04-02 |
| 4 | Quest Picker Integration and Wiring | Complete | 2026-04-02 | 2026-04-02 |
| 4 QA | Verify Integration and End-to-End | Complete | 2026-04-02 | 2026-04-02 |

## Phase 1: Types, Store, and Canvas Renderer

- [x] `ImageRevealSession` type in `src/types/index.ts`
- [x] `imageRevealStore` in `src/stores/imageRevealStore.ts` with persist middleware
- [x] `drawPixelated()` in `src/lib/pixelate.ts`
- [x] `animateReveal()` in `src/lib/pixelate.ts`
- [x] Wire `documentStore.updateChapterContent` to feed `imageRevealStore.addWords()`

### Phase 1 QA
- [x] Correctness audit (eslint, tsc, vite build all pass)
- [x] Dead code cleanup (removed duplicate PIXEL_LEVELS from pixelate.ts)
- [x] Added `getPixelLevelIndex` to questStore, simplified imageRevealStore round-trip
- [x] Capped wordsWritten at wordGoal to prevent overshoot
- [x] Added zero-dimension image guards in pixelate.ts
- [x] Optimized animateReveal to only draw newly revealed rows (lastRevealedRow tracker)
- [x] Removed semicolons from pixelate.ts for codebase consistency
- [x] Dev server verified running (200 OK)

### Notes
- `PIXEL_LEVELS`, `getPixelLevel`, and `getPixelLevelIndex` in `questStore.ts` — imageRevealStore uses `getPixelLevelIndex` directly
- `pixelate.ts` is a pure canvas utility with no store/React dependencies
- `animateReveal` uses 40ms row stagger with requestAnimationFrame, returns cancel function

---

## Phase 2: Unsplash API Integration

- [x] `fetchRandomImage()` in `src/lib/unsplash.ts`
- [x] Image preloader with CORS handling (`loadImage()`)
- [x] Error handling for network failures and timeouts

### Phase 2 QA
- [x] Correctness audit (eslint, tsc, vite build all pass)
- [x] No dead code — new file only
- [x] Added runtime validation of API response shape (guards against unexpected JSON)
- [x] Fixed loadImage timeout to null out onload/onerror before clearing src (prevents redundant reject)
- [x] Added `downloadLocationUrl` to `UnsplashImage` type for Unsplash API ToS compliance
- [x] Added `links.download_location` to internal `UnsplashApiPhoto` type
- [x] Both exports (`fetchRandomImage`, `loadImage`) are unused until Phase 3 wires them in — expected

### Notes
- Uses official Unsplash API (`/photos/random`) with `VITE_UNSPLASH_ACCESS_KEY` env var
- `UnsplashImage` type added to `src/types/index.ts` (includes `downloadLocationUrl` for ToS tracking)
- `loadImage()` sets `crossOrigin="anonymous"` before `src` to prevent canvas tainting
- Both `fetchRandomImage()` and `loadImage()` have 10s timeouts
- `fetchRandomImage()` uses AbortController; `loadImage()` uses setTimeout + src clearing
- Runtime shape validation guards against unexpected API response format
- No semicolons, named exports, pure utility — matches codebase conventions

---

## Phase 3: Image Reveal Panel Component

- [x] `ImageRevealPanel` component in `src/components/quests/ImageRevealPanel.tsx`
- [x] Collapsed state: 64×64 canvas thumbnail, progress %, floating bottom-right
- [x] Expanded state: 320px card, 280×280 canvas, progress bar, words remaining, minimize/abandon
- [x] Canvas integration with `drawPixelated()` and `animateReveal()` (level transitions only)
- [x] Celebration state on completion (auto-expand, clear image, photographer attribution, 6s auto-dismiss)
- [x] Dark theme styling (bg-gray-900 border-gray-700 shadow-2xl rounded-lg)
- [x] Extended `ImageRevealSession` type with optional `photographer`/`photographerUrl` fields
- [x] Extended `startSession()` to accept photographer params
- [x] Canvas cleanup on unmount (cancelAnimationFrame)
- [x] Image preloading via `loadImage()` on session start
- [x] Self-hiding when no active session (same pattern as QuestProgress)
- [x] eslint clean (changed files only), tsc clean, vite build clean

### Phase 3 QA
- [x] Correctness audit (eslint, tsc, vite build all pass)
- [x] Dead code cleanup
- [x] Fixed: setTimeout in Zustand subscribe effect now cleared on cleanup (prevented post-unmount setState)
- [x] Fixed: Canvas elements now have explicit width/height HTML attributes (prevents 300x150 flash before draw)
- [x] Fixed: `drawCanvases` deps use `hasSession` boolean instead of `activeSession` object (prevents unnecessary redraws on every word delta)
- [x] Fixed: Consolidated expand-redraw effect into `drawCanvases` callback (eliminated duplicate draws and animation/static draw conflicts)
- [x] Fixed: Image load failures now log to console instead of silent swallow
- [x] Verified: crossOrigin set before src in loadImage, animateReveal cancel on unmount + level change, celebration detection via subscribe, self-hide when no session

### Notes
- Celebration detection uses Zustand `subscribe()` to avoid sync setState in effects
- Image loading uses ref-based session ID tracking instead of sync `setImage(null)` reset
- `imageRef` caches loaded image for celebration canvas (avoids re-fetch on completion)
- `animateReveal()` cancel function stored in ref, called on unmount and level transitions
- Canvas draw logic consolidated into single `drawCanvases` callback gated on `expanded` state

---

## Phase 4: Quest Picker Integration and Wiring

- [x] QuestPicker tab bar ("Quest Arcs" | "Image Reveal")
- [x] Word goal selector (250/500/1000/2000/5000 + custom)
- [x] Image fetch + session creation flow with loading/error states
- [x] AppShell: render ImageRevealPanel alongside QuestProgress
- [x] Bottom bar Quest button highlights amber for active image reveal sessions
- [x] eslint clean, tsc clean, vite build clean

### Phase 4 QA
- [x] Correctness audit (eslint, tsc, vite build all pass)
- [x] No dead code — all changes are wiring existing components

### Notes
- Tab bar replaces center title in QuestPicker header
- Back button only shows when on arcs tab with selected arc, otherwise Close
- Image Reveal tab shows "in progress" state when session active (prevents duplicate sessions)
- `handleStartImageReveal` uses `getState()` for store access outside React lifecycle
- `ImageRevealPanel` renders unconditionally in AppShell (self-hides when no session)

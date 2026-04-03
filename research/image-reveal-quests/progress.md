# Image Reveal Quests — Progress

## Overall Status

| Phase | Description | Status | Started | Completed |
|-------|-------------|--------|---------|-----------|
| 1 | Types, Store, and Canvas Renderer | Complete | 2026-04-02 | 2026-04-02 |
| 1 QA | Verify Types, Store, and Canvas Renderer | Complete | 2026-04-02 | 2026-04-02 |
| 2 | Unsplash API Integration | Complete | 2026-04-02 | 2026-04-02 |
| 2 QA | Verify Unsplash Integration | Complete | 2026-04-02 | 2026-04-02 |
| 3 | Image Reveal Panel Component | Not Started | — | — |
| 3 QA | Verify Image Reveal Panel | Not Started | — | — |
| 4 | Quest Picker Integration and Wiring | Not Started | — | — |
| 4 QA | Verify Integration and End-to-End | Not Started | — | — |

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

- [ ] `ImageRevealPanel` component in `src/components/quests/ImageRevealPanel.tsx`
- [ ] Collapsed state: 64×64 canvas, progress %, floating bottom-right
- [ ] Expanded state: 320px card, 280×280 canvas, progress bar, controls
- [ ] Canvas integration with `drawPixelated()` and `animateReveal()`
- [ ] Celebration state on completion
- [ ] Dark theme styling

### Phase 3 QA
- [ ] Correctness audit
- [ ] Dead code cleanup

### Notes
_(filled after completion)_

---

## Phase 4: Quest Picker Integration and Wiring

- [ ] QuestPicker tab bar ("Quest Arcs" | "Image Reveal")
- [ ] Word goal selector (250/500/1000/2000/5000 + custom)
- [ ] Image fetch + session creation flow
- [ ] AppShell: render ImageRevealPanel
- [ ] Bottom bar indicator for active image reveal

### Phase 4 QA
- [ ] Correctness audit
- [ ] Dead code cleanup

### Notes
_(filled after completion)_

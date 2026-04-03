# Image Reveal Quests — State

## Current Phase: 3 (Not Started) — Phases 1–2 Complete

## Key File Paths (Existing)

| File | Purpose |
|------|---------|
| `src/types/index.ts` | Shared types — Quest, QuestArc, QuestProgress already defined |
| `src/stores/questStore.ts` | Existing quest store — pattern reference for new store |
| `src/stores/documentStore.ts` | Word delta pipeline (lines 261-292) — integration point |
| `src/components/quests/QuestPicker.tsx` | Quest picker modal — will add tab for image reveal |
| `src/components/quests/QuestProgress.tsx` | Quest progress bar — pattern reference for self-hiding component |
| `src/components/layout/AppShell.tsx` | App shell — will mount ImageRevealPanel |
| `src/data/quests.ts` | Quest arc data — not modified |
| `src/lib/` | Utility modules — new files added here |
| `src/index.css` | Tailwind theme + animations |

## New Files Created Per Phase

### Phase 1
- `src/types/index.ts` — added `ImageRevealSession` interface
- `src/stores/imageRevealStore.ts` — new store with persist/localforage
- `src/lib/pixelate.ts` — `drawPixelated()` and `animateReveal()` canvas utilities
- `src/stores/documentStore.ts` — wired `imageRevealStore.addWords(delta)` into word delta pipeline

### Phase 2
- `src/types/index.ts` — added `UnsplashImage` interface (with `downloadLocationUrl` for Unsplash ToS)
- `src/lib/unsplash.ts` — `fetchRandomImage()` and `loadImage()` utilities, runtime response validation

### Phase 3
_(pending)_

### Phase 4
_(pending)_

## Architecture Decisions (Locked)

1. **Separate store**: Image reveal quests use their own `imageRevealStore`, not the existing `questStore`. This keeps concerns separate and allows both modes to run concurrently.
2. **Canvas-based rendering**: True pixelation via canvas 2D context (sample + fillRect), not CSS blur. This matches the original site's behavior.
3. **Row-by-row animation**: Each resolution level transition animates rows top-to-bottom, not instant.
4. **Floating panel**: Image reveal displays in a collapsible floating panel (bottom-right), not the inline progress bar used by arc quests.
5. **Unsplash API**: Random images from Unsplash (no API key needed for source endpoint, or free access key for official API).
6. **User-chosen word goals**: Preset options (250, 500, 1000, 2000, 5000) plus custom input.
7. **Coexistence**: Image reveal and arc quests can run simultaneously — separate stores, separate UI.

## Persistence Keys

| Store | Key | Persisted Fields |
|-------|-----|-----------------|
| imageRevealStore | `writinator-image-reveal` | `activeSession`, `completedSessions` |

## Known Issues / Gotchas

- `documentStore.updateChapterContent` debounces at 1500ms — word deltas are not instant. The pixelation reveal will update in bursts, not per-keystroke.
- `_flushContentUpdate()` (chapter switch) does NOT compute word deltas — words written right before switching chapters won't count toward the quest. This is a pre-existing issue in the arc quest system too.
- CORS: Unsplash images need `crossOrigin="anonymous"` on the img element for canvas `getImageData()` / `drawImage()` to work without tainting the canvas.
- Canvas cleanup: `requestAnimationFrame` chains from `animateReveal()` must be cancelled on component unmount and when a new level transition starts.

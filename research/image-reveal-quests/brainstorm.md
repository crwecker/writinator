# Image Reveal Quests — Brainstorm

## Feature Vision

A new quest mode where writing progressively reveals a random photograph through canvas-based pixelation. The image starts as an 8×8 grid of colored blocks and sharpens through increasingly higher resolutions (16×16 → 32×32 → 64×64 → 128×128 → full) as the user writes toward a self-chosen word goal. Each resolution level animates in row-by-row from top to bottom for a satisfying reveal effect.

This is a **separate mode** from the existing quest arcs. Users pick a word goal, get a random image from Unsplash, and write to reveal it.

## Approved Ideas

- **Canvas-based progressive pixelation** — not CSS blur. Sample source image at NxN grid, draw each "pixel" as a filled rect on a canvas. Layer higher resolutions on top as progress increases.
- **Row-by-row animation** — within each resolution level, rows appear top-to-bottom with a staggered animation, not an instant flip.
- **Random images from Unsplash API** — fetch a random landscape/nature photo when starting a session. Cache the URL in quest state so it persists across page reloads.
- **User-chosen word goal** — when starting an image reveal quest, the user picks their target (e.g., 250, 500, 1000, 2000, 5000 words or custom).
- **Floating/expandable panel** — the image reveal needs more visual real estate than the current thin progress bar. A dedicated panel that can be expanded/collapsed, positioned so the writer can glance at it while typing. Likely a collapsible side panel or a floating widget near the bottom-right that can be expanded.
- **Separate from existing arcs** — accessed via a tab or section in the quest picker. Existing quest arcs remain untouched.

## Current State Summary

### Existing infrastructure to reuse
- **questStore** (`src/stores/questStore.ts`) — word delta pipeline already works. `addWords(count)` accumulates positive deltas. `PIXEL_LEVELS` array already defines the resolution progression.
- **documentStore** word tracking — debounced content updates compute word deltas and feed questStore. This pipeline is solid and doesn't need changes.
- **QuestPicker** (`src/components/quests/QuestPicker.tsx`) — modal with open/onClose pattern. Can add a tab for "Image Reveal" mode.
- **QuestProgress** (`src/components/quests/QuestProgress.tsx`) — progress bar + celebration overlay. The celebration overlay pattern can be reused.
- **Types** (`src/types/index.ts`) — `QuestProgress` type tracks `wordsWritten`, `completed`, `completedAt`.
- **Dark theme + Tailwind** — consistent styling patterns across all quest UI.

### What's new (needs to be built)
1. **Canvas pixelation renderer** — pure utility that takes an image + resolution level and draws the pixelated version on a canvas. Handles row-by-row animation.
2. **Unsplash API integration** — fetch random images, handle loading/errors, respect rate limits.
3. **Image Reveal quest types/store** — new state for image reveal sessions (separate from arc-based quests): chosen word goal, image URL, current resolution level.
4. **Image Reveal panel component** — the main UI showing the canvas, progress, and controls.
5. **Quest Picker updates** — tab or section for starting an image reveal session with word goal selection.
6. **Word goal selector** — UI for picking target word count.

## Design Direction

The image reveal panel should be a **floating panel anchored to the bottom-right** of the editor area:
- **Collapsed state**: small thumbnail (64×64) + progress percentage, sits above the status bar on the right side. Clicking expands it.
- **Expanded state**: larger canvas (280×280 or so), progress bar, word count, and a minimize button. Positioned as a floating card above the bottom-right corner so it doesn't push the editor layout around.
- **Celebration**: when the image is fully revealed, the panel auto-expands and shows the clear image with a completion message. After dismissing, the image stays viewable in a "gallery" of completed reveals.

This floating approach works well because:
- Doesn't steal horizontal space from the 800px max-width editor
- Writer can glance at it without breaking flow
- Collapsed state is minimal — just a tiny thumbnail that progressively sharpens
- Expandable for when the writer wants to appreciate the reveal

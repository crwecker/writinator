# Image Reveal Quests — Progress

## Overall Status

| Phase | Description | Status | Started | Completed |
|-------|-------------|--------|---------|-----------|
| 1 | Types, Store, and Canvas Renderer | Not Started | — | — |
| 1 QA | Verify Types, Store, and Canvas Renderer | Not Started | — | — |
| 2 | Unsplash API Integration | Not Started | — | — |
| 2 QA | Verify Unsplash Integration | Not Started | — | — |
| 3 | Image Reveal Panel Component | Not Started | — | — |
| 3 QA | Verify Image Reveal Panel | Not Started | — | — |
| 4 | Quest Picker Integration and Wiring | Not Started | — | — |
| 4 QA | Verify Integration and End-to-End | Not Started | — | — |

## Phase 1: Types, Store, and Canvas Renderer

- [ ] `ImageRevealSession` type in `src/types/index.ts`
- [ ] `imageRevealStore` in `src/stores/imageRevealStore.ts` with persist middleware
- [ ] `drawPixelated()` in `src/lib/pixelate.ts`
- [ ] `animateReveal()` in `src/lib/pixelate.ts`
- [ ] Wire `documentStore.updateChapterContent` to feed `imageRevealStore.addWords()`

### Phase 1 QA
- [ ] Correctness audit
- [ ] Dead code cleanup

### Notes
_(filled after completion)_

---

## Phase 2: Unsplash API Integration

- [ ] `fetchRandomImage()` in `src/lib/unsplash.ts`
- [ ] Image preloader with CORS handling (`loadImage()`)
- [ ] Error handling for network failures and timeouts

### Phase 2 QA
- [ ] Correctness audit
- [ ] Dead code cleanup

### Notes
_(filled after completion)_

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

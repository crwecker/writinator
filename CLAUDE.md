# Writinator

Book-writing app. React + TypeScript + CodeMirror 6 + Zustand + Tailwind CSS v4 + Vite.

## Commands

- `npx eslint .` — lint
- `npx tsc -b --noEmit` — type-check
- `npx vite build` — production build
- `npm run dev` — dev server

## Architecture

- `src/components/{domain}/` — React components (editor, layout, sidebar, quests)
- `src/stores/` — Zustand stores with localforage persistence (`use{Name}Store`)
- `src/lib/` — pure utilities (export, fileSystem, ast, richPaste)
- `src/types/index.ts` — shared TypeScript types

## Key Conventions

- **No `any` types.** Use proper interfaces and type narrowing.
- **VIM mode is always on** via `@replit/codemirror-vim`. New shortcuts must not conflict with VIM bindings.
- **Tailwind v4** via `@tailwindcss/vite` plugin. No PostCSS config.
- **Dark theme**: gray-700/800/900 backgrounds, gray-200/400/500 text.
- **Editor max-width**: 800px, centered.
- **Modals/panels**: use `open`/`onClose` prop pattern.
- **Store access outside React**: use `getState()` (e.g., in keyboard handlers, intervals).
- **CodeMirror extensions**: use `Compartment` for reconfigurable, `StateField`/`StateEffect` for custom state.
- **Document model**: Book → Chapters (with nesting).

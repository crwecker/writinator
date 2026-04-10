---
name: feature-plan
description: Break a big feature into phased implementation plan with starter prompts, progress tracking, and cross-session state. Use when a feature is too large for one session.
disable-model-invocation: true
user-invocable: true
---

# Feature Plan: Multi-Phase Implementation Planning

Break a large feature into a phased implementation plan designed for multiple Claude Code sessions. Each phase uses a tiered team of agents to save context and parallelize work.

The user will provide a feature description either inline (e.g., `/feature-plan add a notification system`) or you'll ask them to describe it.

## Model Tier Rules (apply to every agent spawned by this skill)

These rules are non-negotiable and mirror the project's model-usage policy:

- **Opus** — Main brain. Orchestration loop. Codebase discovery. High-complexity reasoning. The top-level agent driving a `/feature-plan` session is always Opus, and so are Explore agents that do genuine codebase discovery (mapping unknown territory, tracing architecture).
- **Sonnet** — Structured planning steps. Inner loop tasks. All team implementation agents (`editor-dev`, `ui-dev`, `storage-dev`, `general-purpose`, `reviewer`) that do the actual writing, editing, and testing of code run as Sonnet.
- **Haiku** — Lower-complexity tasks. Context distillation. When an Explore agent's job is to read a known set of files (planning docs, progress trackers, a handful of source files for a phase) and return a focused summary, it runs as Haiku.

Every `Agent(...)` call in this skill's output must set `model` to one of these three, matching the role.

## Step 1: Understand the Feature

If the user didn't provide a feature description inline, ask them to describe what they want to build. Get enough detail to understand scope, but don't over-interrogate.

## Step 2: Explore the Codebase (2 Parallel Explore Agents)

Spawn 2 **Explore** agents (`model: opus` — this is codebase discovery) in parallel to understand what exists. Do NOT read these files yourself (save your context window):

### Agent 1: `ui-explorer`
Explore the React component layer for anything related to this feature:
- Existing components in `src/components/` (editor, layout, sidebar, quests)
- Current routing and navigation patterns (AppShell, dropdowns, modals)
- Editor extensions and CodeMirror integrations
- Tailwind theme and styling patterns in `src/components/editor/editor.css`

### Agent 2: `data-explorer`
Explore the data and logic layer for anything related to this feature:
- Zustand stores in `src/stores/` (documentStore, editorStore, keybindingStore, questStore, snapshotStore)
- Utility and library modules in `src/lib/` (export, fileSystem, ast, richPaste)
- Type definitions in `src/types/`
- localforage persistence patterns

## Step 3: Brainstorm with the User

Present findings from the Explore agents (summarized, not raw) and brainstorm:
- What components, stores, and utilities already exist vs what's new
- How existing stores and state patterns can be extended
- Creative ideas for the feature that leverage existing infrastructure
- What would make this feature stand out

Get user buy-in on the overall vision before planning phases.

## Step 4: Create Planning Documents

Create `research/{feature-name}/` with 4 files:

### brainstorm.md
- Feature vision and approved ideas
- Current state summary
- Existing components/stores/libs that can be reused
- New work needed

### implementation-plan.md
Split the feature into phases. Each phase is a single Claude Code session that includes its own inline QA at the end — **there are no separate QA phases**. The numbering is simply Phase 1, Phase 2, Phase 3, etc.

**Phase sizing (critical):**
Prefer many small phases over fewer large ones. A phase that tries to do too much burns context, produces sloppier output, and misses details. Each phase should be completable in a single focused session without exhausting the context window. Rules of thumb:
- One phase = one logical slice (e.g., "add the Zustand store + persistence + types" or "build the modal component + wire to existing store"). If you find yourself writing "and also..." in the phase description, split it.
- 2-4 deliverables per phase is ideal. More than 5 is a sign the phase is too big.
- When in doubt, split. Two small phases will always produce better work than one large phase that rushes through.

**Phase ordering principles:**
1. Phase 1 is always architecture/foundation (types, store shape, patterns that all later phases follow)
2. Next phases build stores, utilities, and core logic (testable in isolation)
3. Then phases that build React components (views, modals, toolbars, editor extensions)
4. Then integration, polish, and wiring everything together last
5. Every phase ends with inline QA (lint/type/build + visual check + screenshot) before being marked done

**Team Workflow section (include at top of plan):**
Every phase uses a tiered team of agents per the model rules above. The project has specialized agent types available: `editor-dev` (editor, CodeMirror extensions, formatting, VIM), `ui-dev` (sidebar, layout, modals, Tailwind), and `storage-dev` (Zustand stores, localforage, file system). Include this standard workflow:
1. **Step 1 - Load Context (Haiku)**: Spawn an Explore agent (`model: haiku`) to read planning docs and a short list of relevant source files, then return a focused summary. This is context distillation, not discovery — the target files are already known. The main agent does NOT read large docs directly.
2. **Step 2 - Create Team (Sonnet)**: Spawn parallel implementation agents (`model: sonnet`, `mode: bypassPermissions`). Use the appropriate specialized agent type (`editor-dev`, `ui-dev`, or `storage-dev`) based on the work. Give each agent ONLY the context it needs from the Haiku summary, not raw planning docs.
3. **Step 3 - Static QA**: `npx eslint .`, `npx tsc -b --noEmit`, `npx vite build`. Fix anything that breaks before moving on.
4. **Step 4 - Visual QA (main Opus agent does this itself)**: Launch the website with `npm run dev`, drive the UI to confirm the changes look as expected, and capture exactly one screenshot saved to `research/{feature-name}/screenshots/phase-N.png`. Details below.
5. **Step 5 - Commit & Update Docs**: Commit the phase, then update `progress.md` and `state.md`.

**Visual QA Step — required details (include in Team Workflow):**
Every phase must end with a real visual verification, not just a type-check. The main Opus agent performs this step itself — it has the context to judge whether the screen looks right:
- Start the dev server in the background: `npm run dev` via `Bash` with `run_in_background: true`. Wait for the server to report it's listening by polling the background output (do not `sleep`).
- Navigate to the local dev URL (default `http://localhost:5173`) using whichever browser automation tool is available in the session (Playwright MCP, Chrome DevTools MCP, Puppeteer, etc.). If none is available, fall back to `screencapture -x` against a manually opened browser window and note that in `progress.md`.
- Drive the UI just enough to exercise this phase's changes (open the new modal, click the new button, trigger the new editor extension, etc.) and confirm the result matches the phase's goal.
- Take exactly **one** screenshot of the most representative state and save it to `research/{feature-name}/screenshots/phase-N.png` (create the `screenshots/` subfolder if it doesn't exist). One screenshot per phase — not a gallery.
- Stop the background dev server before finishing the phase.
- If the visual QA reveals a problem, fix it in the same session (spawn a follow-up Sonnet agent if needed), re-run static QA, re-capture the screenshot, then commit.

**Agent Scaling Guidelines (include in Team Workflow):**
The starter prompts suggest a default split based on the specialized agent types, but the orchestrator MUST assess the actual workload and scale accordingly:
- **Match agents to work domains.** Use `editor-dev` for CodeMirror extensions, editor behavior, bubble toolbar, and VIM integrations. Use `ui-dev` for layout components, sidebar, modals, menus, and Tailwind styling. Use `storage-dev` for Zustand stores, localforage persistence, file system access, and snapshots. Use `general-purpose` when work doesn't fit a specialized type.
- **Split large store work across multiple agents** when a single agent would handle 4+ independent stores or complex cross-store logic. Signs a split is needed: the deliverable list has 10+ items, the work spans 4+ files, or the concerns are independent.
- **Merge small work into a single agent** when one side has only 1-2 trivial changes (e.g., adding a field to an existing type, updating a constant). Don't spawn a dedicated agent for work that takes 5 minutes.
- **Split large component work** when a phase creates 3+ new components plus modals plus editor extensions. One agent for layout/UI, one for editor-specific work.
- **Use a dedicated reviewer agent (`reviewer`, `model: sonnet`)** when a phase has significant changes across multiple domains. It can run lint, type-check, and build in parallel after implementation agents commit their code.
- **Never exceed 5 parallel agents.** Coordination overhead outweighs parallelism beyond this point. Sequential follow-up agents are fine when needed.
- **Each agent should own complete vertical slices.** Don't split by file type (one for components, another for stores). Split by domain (one for snapshot feature, another for export feature). Each agent writes its own tests for the code it creates.

**Code Hygiene section (include in Team Workflow):**
Every phase must enforce:
- **No regressions.** Run `npx eslint .`, `npx tsc -b --noEmit`, and `npx vite build` after every change.
- **Clean types**: No `any` types. Use proper TypeScript interfaces and type narrowing. Shared types go in `src/types/index.ts`.
- **Dead code removal**: Delete fully replaced components, helpers, and functions. No commented-out code, unused imports, or deprecated functions.
- **React patterns**: Stable refs for callbacks passed to effects. Memoize expensive computations. Clean up effects (return cleanup functions for listeners, intervals, subscriptions).

**Every phase starter prompt must follow this structure:**
````
### Starter Prompt
```
This is Phase N of the {Feature Name} feature: {Phase Title}.

Goal: {one sentence}

STEP 1 - LOAD CONTEXT (Haiku, context distillation — do NOT read planning docs yourself):
Spawn an Explore agent (model: haiku) to read and summarize:
- research/{feature-name}/state.md
- research/{feature-name}/progress.md
- research/{feature-name}/implementation-plan.md (Phase N section only)
- {relevant source files for this phase}
- CLAUDE.md
The agent should return: {what specific info this phase needs}.

STEP 2 - CREATE TEAM ({feature-name}-phase-N, Sonnet inner loop):
Spawn parallel implementation agents (model: sonnet, mode: bypassPermissions)
using the Haiku summary (not raw docs). Use the appropriate specialized
agent type for each:

{agent-type} agent deliverables:
{bulleted list of store, lib, type work}

{agent-type} agent deliverables:
{bulleted list of components, modals, editor extensions}

STEP 3 - STATIC QA: npx eslint ., npx tsc -b --noEmit, npx vite build. Fix any failures.

STEP 4 - VISUAL QA (Opus, main agent does this itself):
- Launch dev server: `npm run dev` in the background, wait for it to report ready.
- Open http://localhost:5173 with the available browser automation tool.
- Drive the UI to exercise this phase's changes: {what specifically to click/type/open}.
- Confirm the result matches the goal.
- Save exactly one screenshot to research/{feature-name}/screenshots/phase-N.png.
- Stop the background dev server.
- If anything looks wrong, fix it (spawn a follow-up Sonnet agent if needed),
  re-run STEP 3, re-capture the screenshot, then continue.

STEP 5 - COMMIT & UPDATE DOCS: Commit the phase, then update progress.md and state.md.
```
````

**Writinator-specific rules for every phase:**

Store patterns:
- Zustand stores use `persist` middleware with `localforage` for browser storage
- Store files live in `src/stores/` and export a `use{Name}Store` hook
- Keep stores focused — one domain per store (documents, editor settings, keybindings, quests, snapshots)
- Use `getState()` for accessing store values outside React components (e.g., in keyboard handlers, intervals)

Component patterns:
- Components live in `src/components/{domain}/` (editor, layout, sidebar, quests)
- Editor extensions use CodeMirror 6 APIs (Compartment for reconfigurable extensions, StateField/StateEffect for custom state)
- VIM mode is always on via `@replit/codemirror-vim` — new keyboard shortcuts must not conflict with VIM bindings
- Bubble toolbar provides inline formatting — new formatting options go there
- Modals/panels follow the `open`/`onClose` prop pattern (see StyleEditor, SnapshotBrowser, QuestPicker)

Styling:
- Tailwind CSS v4 via `@tailwindcss/vite` plugin (no PostCSS config needed)
- Dark theme — use `gray-700`/`gray-800`/`gray-900` backgrounds, `gray-200`/`gray-400`/`gray-500` text
- Custom CSS variables defined in `editor.css` for editor-specific styling
- Editor max-width is 800px, centered

Export & persistence:
- File System Access API for native save/open via `src/lib/fileSystem.ts`
- Export formats (PDF, DOCX, HTML, Markdown) via `src/lib/export.ts`
- Snapshots (auto every 5min + manual) via `src/stores/snapshotStore.ts`
- Document structure: Book → Chapters (with nesting support)

### progress.md
- Overall status table (phase | status | date started | date completed) — one row per phase, no separate QA rows
- Per-phase checklist matching deliverables from implementation-plan.md, plus a final "Visual QA screenshot captured" checkbox pointing to `screenshots/phase-N.png`
- Notes section per phase (filled in after completion, including anything the visual QA surfaced)

### state.md
Cross-phase cheat sheet. Contains ONLY what the next session needs:
- Current phase number
- Key file paths (existing + created by this feature)
- New files created per phase
- New components and their locations per phase
- New stores and their persistence keys per phase
- Architecture decisions (locked once made)
- Known issues / gotchas
- Path to the most recent phase screenshot under `screenshots/`

## Step 5: Present Summary

Do NOT commit or stage the planning docs — the `research/` folder is gitignored and should stay out of version control.

Present a summary to the user:
- Number of phases
- What each phase covers (one line each)
- How to start Phase 1 (copy the starter prompt)

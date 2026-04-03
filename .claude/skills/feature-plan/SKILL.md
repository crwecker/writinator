---
name: feature-plan
description: Break a big feature into phased implementation plan with starter prompts, progress tracking, and cross-session state. Use when a feature is too large for one session.
disable-model-invocation: true
user-invocable: true
---

# Feature Plan: Multi-Phase Implementation Planning

Break a large feature into a phased implementation plan designed for multiple Claude Code sessions. Each phase uses Opus 4.6 team agents to save context and parallelize work.

The user will provide a feature description either inline (e.g., `/feature-plan add a notification system`) or you'll ask them to describe it.

## Step 1: Understand the Feature

If the user didn't provide a feature description inline, ask them to describe what they want to build. Get enough detail to understand scope, but don't over-interrogate.

## Step 2: Explore the Codebase (2 Parallel Explore Agents)

Spawn 2 **Explore** agents (model: opus) in parallel to understand what exists. Do NOT read these files yourself (save your context window):

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
Split the feature into phases. Each implementation phase is followed by a dedicated QA phase. Both are separate Claude Code sessions. The numbering is: Phase 1 (implement), Phase 1 QA (verify), Phase 2 (implement), Phase 2 QA (verify), etc.

**Phase sizing (critical):**
Prefer many small phases over fewer large ones. A phase that tries to do too much burns context, produces sloppier output, and misses details. Each implementation phase should be completable in a single focused session without exhausting the context window. Rules of thumb:
- One phase = one logical slice (e.g., "add the Zustand store + persistence + types" or "build the modal component + wire to existing store"). If you find yourself writing "and also..." in the phase description, split it.
- 2-4 deliverables per phase is ideal. More than 5 is a sign the phase is too big.
- When in doubt, split. Two small phases with QA passes will always produce better work than one large phase that rushes through.

**Phase ordering principles:**
1. Phase 1 is always architecture/foundation (types, store shape, patterns that all later phases follow)
2. Phase 1 QA verifies Phase 1
3. Next phases build stores, utilities, and core logic (testable in isolation)
4. Then phases that build React components (views, modals, toolbars, editor extensions)
5. Then integration, polish, and wiring everything together last
6. Every implementation phase gets a QA phase immediately after it

**Team Workflow section (include at top of plan):**
Every phase uses Opus 4.6 team agents. The project has specialized agent types available: `editor-dev` (editor, CodeMirror extensions, formatting, VIM), `ui-dev` (sidebar, layout, modals, Tailwind), and `storage-dev` (Zustand stores, localforage, file system). Include this standard workflow:
1. **Step 1 - Load Context**: Spawn an Explore agent to read planning docs and relevant source files. The main agent does NOT read large docs directly. The Explore agent returns a focused summary.
2. **Step 2 - Create Team**: Spawn parallel implementation agents (model: opus, mode: bypassPermissions). Use the appropriate specialized agent type (`editor-dev`, `ui-dev`, or `storage-dev`) based on the work. Give each agent ONLY the context it needs from the Explore summary, not raw planning docs.
3. **Step 3 - QA**: `npx eslint .`, `npx tsc -b --noEmit`, `npx vite build`, commit.
4. **Step 4 - Update Docs**: Update progress.md and state.md.

**Agent Scaling Guidelines (include in Team Workflow):**
The starter prompts suggest a default split based on the specialized agent types, but the orchestrator MUST assess the actual workload and scale accordingly:
- **Match agents to work domains.** Use `editor-dev` for CodeMirror extensions, editor behavior, bubble toolbar, and VIM integrations. Use `ui-dev` for layout components, sidebar, modals, menus, and Tailwind styling. Use `storage-dev` for Zustand stores, localforage persistence, file system access, and snapshots. Use `general-purpose` when work doesn't fit a specialized type.
- **Split large store work across multiple agents** when a single agent would handle 4+ independent stores or complex cross-store logic. Signs a split is needed: the deliverable list has 10+ items, the work spans 4+ files, or the concerns are independent.
- **Merge small work into a single agent** when one side has only 1-2 trivial changes (e.g., adding a field to an existing type, updating a constant). Don't spawn a dedicated agent for work that takes 5 minutes.
- **Split large component work** when a phase creates 3+ new components plus modals plus editor extensions. One agent for layout/UI, one for editor-specific work.
- **Use a dedicated reviewer agent** when a phase has significant changes across multiple domains. The `reviewer` agent type can run lint, type-check, and build in parallel after implementation agents commit their code.
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

STEP 1 - LOAD CONTEXT (do NOT read planning docs directly, save your context):
Spawn an Explore agent (model: opus) to read and summarize:
- research/{feature-name}/state.md
- research/{feature-name}/progress.md
- research/{feature-name}/implementation-plan.md (Phase N section only)
- {relevant source files for this phase}
- CLAUDE.md
The agent should return: {what specific info this phase needs}.

STEP 2 - CREATE TEAM ({feature-name}-phase-N):
Spawn parallel implementation agents using the Explore summary (not raw docs).
Use the appropriate specialized agent type for each:

{agent-type} agent deliverables:
{bulleted list of store, lib, type work}

{agent-type} agent deliverables:
{bulleted list of components, modals, editor extensions}

STEP 3 - QA: eslint, tsc, vite build, commit.
STEP 4 - UPDATE DOCS: progress.md and state.md.
```
````

**Every QA phase starter prompt must follow this structure:**
````
### QA Starter Prompt
```
This is Phase N QA of the {Feature Name} feature: Verify {Phase Title}.

Goal: Audit Phase N implementation for correctness, missing edge cases, dead code, and lint/type errors.

STEP 1 - LOAD CONTEXT (do NOT read planning docs directly, save your context):
Spawn an Explore agent (model: opus) to read and summarize:
- research/{feature-name}/state.md (new files from Phase N)
- research/{feature-name}/progress.md (Phase N deliverables checklist)
- research/{feature-name}/implementation-plan.md (Phase N section only)
- All files created or modified in Phase N
- CLAUDE.md
The agent should return: full list of Phase N deliverables, all new/modified files, and any known issues.

STEP 2 - QA AUDIT (spawn parallel review agents using Explore summary):

Correctness agent:
- Verify every deliverable from Phase N was actually implemented
- Check for logic bugs, missing null/undefined guards, incorrect state updates
- Verify data flow between stores, components, and effects
- Test edge cases: empty states, missing data, boundary values
- Run eslint, tsc, and vite build to verify no regressions

Dead code & cleanup agent:
- Find unused imports, functions, and components left behind
- Remove commented-out code
- Consolidate duplicate or near-duplicate logic
- Verify no TODO/FIXME items were left unresolved
- Check for `any` types, inconsistent naming, or patterns that diverge from the rest of the codebase
- Verify React effects have proper cleanup and dependency arrays

STEP 3 - FIX: Apply all fixes, run eslint, tsc, vite build, commit.
STEP 4 - UPDATE DOCS: Update progress.md (mark Phase N QA complete) and state.md.
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
- Overall status table (phase | status | date started | date completed), includes both implementation and QA phases
- Per-phase checklist matching deliverables from implementation-plan.md
- Per-QA-phase checklist (fixes applied, dead code removed)
- Notes section per phase (filled in after completion)

### state.md
Cross-phase cheat sheet. Contains ONLY what the next session needs:
- Current phase number
- Key file paths (existing + created by this feature)
- New files created per phase
- New components and their locations per phase
- New stores and their persistence keys per phase
- Architecture decisions (locked once made)
- Known issues / gotchas

## Step 5: Commit

Stage and commit all planning docs:
```
docs: add {feature-name} phased implementation plan
```

Present a summary to the user:
- Number of phases (implementation + QA)
- What each phase covers (one line each, showing the implement/QA pairs)
- How to start Phase 1 (copy the starter prompt)

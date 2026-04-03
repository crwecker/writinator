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

### Agent 1: `component-explorer`
Explore the SceneGraph component layer for anything related to this feature:
- Existing views, controllers, widgets, modals that overlap
- Current screen stack and navigation patterns
- Task nodes and their async data flows
- XML component structure and interface fields

### Agent 2: `logic-explorer`
Explore the source layer for anything related to this feature:
- Existing logic modules in `source/logic/`
- Request modules in `source/requests/` and parsers in `source/parsers/`
- Utility functions in `source/utils/`
- Existing test patterns (Rooibos specs, Roca tests, E2E tests)

## Step 3: Brainstorm with the User

Present findings from the Explore agents (summarized, not raw) and brainstorm:
- What components and logic already exist vs what's new
- What API endpoints exist vs what needs building
- Creative ideas for the feature that leverage existing infrastructure
- What would make this feature stand out

Get user buy-in on the overall vision before planning phases.

## Step 4: Create Planning Documents

Create `docs/{feature-name}/` with 4 files:

### brainstorm.md
- Feature vision and approved ideas
- Current state summary
- Existing components/logic that can be reused
- New work needed

### implementation-plan.md
Split the feature into phases. Each implementation phase is followed by a dedicated QA phase. Both are separate Claude Code sessions. The numbering is: Phase 1 (implement), Phase 1 QA (verify), Phase 2 (implement), Phase 2 QA (verify), etc.

**Phase sizing (critical):**
Prefer many small phases over fewer large ones. A phase that tries to do too much burns context, produces sloppier output, and misses details. Each implementation phase should be completable in a single focused session without exhausting the context window. Rules of thumb:
- One phase = one logical slice (e.g., "add the logic module + Roca tests + Rooibos spec" or "build the view + controller + wire to existing task"). If you find yourself writing "and also..." in the phase description, split it.
- 2-4 deliverables per phase is ideal. More than 5 is a sign the phase is too big.
- When in doubt, split. Two small phases with QA passes will always produce better work than one large phase that rushes through.

**Phase ordering principles:**
1. Phase 1 is always architecture/foundation (patterns that all later phases follow)
2. Phase 1 QA verifies Phase 1
3. Next phases build logic and request layers (testable off-device with Roca)
4. Then phases that build SceneGraph components (views, controllers, widgets)
5. Then integration, polish, and E2E test coverage last
6. Every implementation phase gets a QA phase immediately after it

**Team Workflow section (include at top of plan):**
Every phase uses Opus 4.6 team agents. Include this standard workflow:
1. **Step 1 - Load Context**: Spawn an Explore agent to read planning docs and relevant source files. The main agent does NOT read large docs directly. The Explore agent returns a focused summary.
2. **Step 2 - Create Team**: Spawn parallel implementation agents (model: opus, mode: bypassPermissions). Give each agent ONLY the context it needs from the Explore summary, not raw planning docs.
3. **Step 3 - QA**: bslint, production build, test:roca, commit.
4. **Step 4 - Update Docs**: Update progress.md and state.md.

**Agent Scaling Guidelines (include in Team Workflow):**
The starter prompts suggest a default split (logic + components), but the orchestrator MUST assess the actual workload and scale accordingly:
- **Split large logic work across multiple agents** when a single agent would handle 4+ independent modules (e.g., request builders + parsers + logic extraction + utility functions). Signs a split is needed: the deliverable list has 10+ items, the work spans 4+ directories, or the concerns are independent.
- **Merge small work into a single agent** when one side has only 1-2 trivial changes (e.g., adding a field to an existing interface, updating a constant). Don't spawn a dedicated agent for work that takes 5 minutes.
- **Split large component work** when a phase creates 3+ new views/controllers plus widgets plus task nodes. One agent for views/controllers, one for widgets/tasks.
- **Use dedicated test agents** when a phase has complex test requirements across multiple tiers (Roca + Rooibos + E2E). A test agent can run in parallel after implementation agents commit their code.
- **Never exceed 5 parallel agents.** Coordination overhead outweighs parallelism beyond this point. Sequential follow-up agents are fine when needed.
- **Each agent should own complete vertical slices.** Don't split by file type (one for logic, another for tests). Split by domain (one for auth flow, another for profile management). Each agent writes its own tests for the code it creates.

**Code Hygiene section (include in Team Workflow):**
Every phase must enforce:
- **No regressions.** The app serves millions of users. Run `npm run lint`, `npm run build -- --config=production`, and `npm run test:roca` after every change.
- **New code gets tests**: Every new function, component, and behavior gets tests. Logic in `source/logic/` must have both Roca and Rooibos tests. SceneGraph components get Rooibos specs. User-facing flows get E2E tests where applicable. If you wrote it, test it.
- **Test maintenance**: Update/remove tests when modifying existing code. Never leave orphaned or broken tests.
- **Dead code removal**: Delete fully replaced widgets, components, helpers, and functions. No commented-out code, unused imports, or deprecated functions.
- **AAA pattern.** Every test follows Arrange / Act / Assert. No shared mutable state between tests.

**Every phase starter prompt must follow this structure:**
````
### Starter Prompt
```
This is Phase N of the {Feature Name} feature: {Phase Title}.

Goal: {one sentence}

STEP 1 - LOAD CONTEXT (do NOT read planning docs directly, save your context):
Spawn an Explore agent (model: opus) to read and summarize:
- docs/{feature-name}/state.md
- docs/{feature-name}/progress.md
- docs/{feature-name}/implementation-plan.md (Phase N section only)
- {relevant source files for this phase}
- CLAUDE.md
The agent should return: {what specific info this phase needs}.

STEP 2 - CREATE TEAM ({feature-name}-phase-N):
Spawn parallel implementation agents using the Explore summary (not raw docs):

Logic agent deliverables:
{bulleted list of source/logic/, requests, parsers work}

Component agent deliverables:
{bulleted list of views, controllers, widgets, task nodes}

Tests: {test scenarios for each tier}

STEP 3 - QA: bslint, production build, test:roca, commit.
STEP 4 - UPDATE DOCS: progress.md and state.md.
```
````

**Every QA phase starter prompt must follow this structure:**
````
### QA Starter Prompt
```
This is Phase N QA of the {Feature Name} feature: Verify {Phase Title}.

Goal: Audit Phase N implementation for correctness, missing tests, dead code, and edge cases.

STEP 1 - LOAD CONTEXT (do NOT read planning docs directly, save your context):
Spawn an Explore agent (model: opus) to read and summarize:
- docs/{feature-name}/state.md (new files from Phase N)
- docs/{feature-name}/progress.md (Phase N deliverables checklist)
- docs/{feature-name}/implementation-plan.md (Phase N section only)
- All files created or modified in Phase N
- CLAUDE.md
The agent should return: full list of Phase N deliverables, all new/modified files, and any known issues.

STEP 2 - QA AUDIT (spawn parallel review agents using Explore summary):

Correctness agent:
- Verify every deliverable from Phase N was actually implemented
- Check for logic bugs, off-by-one errors, missing null/invalid guards
- Verify data flow contracts between task nodes, controllers, and views
- Test edge cases: empty states, invalid data, boundary values
- Run lint, build, and tests to verify no regressions

Test coverage agent:
- Identify new code paths without tests
- Verify logic in source/logic/ has both Roca and Rooibos coverage
- Verify Rooibos specs use real component code (no always-passing assertions)
- Check edge-case parity between Roca and Rooibos for shared logic
- Remove orphaned tests for deleted/replaced code

Dead code & cleanup agent:
- Find unused imports, functions, and components left behind
- Remove commented-out code
- Consolidate duplicate or near-duplicate logic
- Verify no TODO/FIXME items were left unresolved
- Check for inconsistent naming or patterns vs the rest of the codebase

STEP 3 - FIX: Apply all fixes, run full test suite, bslint, production build, commit.
STEP 4 - UPDATE DOCS: Update progress.md (mark Phase N QA complete) and state.md.
```
````

**Roku-specific rules for every phase:**

Logic extraction:
- Prefer extracting testable pure functions to `source/logic/` over embedding logic in controllers
- Logic files must have no SceneGraph dependencies (no roSGNode, m.top, m.global)
- Controllers should be thin delegation layers calling into logic modules

SceneGraph rules:
- XML files define structure only. No visual properties, styling, or behavior in XML.
- All numeric dimensions must be divisible by 3 (1080p to 720p scaling)
- Use `fontToken()` for all typography. Never create Font nodes in XML.
- Follow the lifecycle order: `_bindComponents()`, `_bindObservers()`, `_initComponents()`, `_initScreen()`
- When a controller calls a function from `source/logic/`, add a `<script>` import in the view XML

BrightScript pitfalls:
- `.brs` files do not support line continuation with `_` (use intermediate variables)
- BrightScript `and`/`or` do NOT short-circuit; use nested `if` for null-safe guards
- Avoid reserved words as identifiers: `pos`, `tab`, `stop`, `run`, `dim`, `rem`, `goto`, `line`, `next`, `step`

### progress.md
- Overall status table (phase | status | date started | date completed), includes both implementation and QA phases
- Per-phase checklist matching deliverables from implementation-plan.md
- Per-QA-phase checklist (fixes applied, tests added, dead code removed)
- Cumulative test counts table (Rooibos | Roca | E2E | Total) updated after each phase
- Notes section per phase (filled in after completion)

### state.md
Cross-phase cheat sheet. Contains ONLY what the next session needs:
- Current phase number
- Non-negotiable constraints (dimensions divisible by 3, XML structure only, fontToken)
- Key file paths (existing + created by this feature)
- New files created per phase
- New components and their XML/BRS pairs per phase
- New logic modules and their test files per phase
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
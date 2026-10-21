---
docType: slice-design
slice: detection-and-adoption-state
project: context-forge
parent: project-documents/user/architecture/260-slices.brownfield-adoption.md
dependencies:
- 260
interfaces:
- 262
- 263
- 264
- 266
- 267
dateCreated: 20261020
dateUpdated: 20261021
status: complete
turns: 33
promptTokens: 2512810
cachedTokens: 2393045
cacheWriteTokens: 119703
completionTokens: 33874
durationSeconds: 334.4
costUsd: 2.114289
usageRounds: 1
pricedRounds: 1
---

# Slice Design: detection-and-adoption-state

## Overview

Today `cf build` on a fresh registration always assembles the Phase 0 concept prompt, whatever the repository holds. This slice adds the one decision the brownfield initiative rests on: core looks at the project folder, produces a **detection report** (source volume, history, docs, ADRs, CI, rule files), and maps it to one **outcome**, checked in order:

1. **Adoption in progress** or **closed**: the persisted adoption state says so.
2. **Already planned**: an initiative plan, architecture/HLD or slice plan exists. A concept alone doesn't count.
3. **Brownfield** or **greenfield**: decided from the code signals.

When the outcome is brownfield or adoption in progress, and the build would otherwise assemble the Phase 0 concept prompt, `cf build` and `context_build` select the guide's `brownfield-adoption` profile and prompt and append an **Adoption Facts** section after the instruction prompt. A first brownfield detection persists the adoption state as `in_progress`, so the build keeps resuming the brownfield prompt after the concept and architecture exist. The user can override the outcome in both directions with one config key. If the installed guide lacks the profile or prompt, the build fails with a named error and never falls back to the concept prompt.

Squadron is not probed in this slice (262 adds it). Until then, the Adoption Facts section states that squadron is unavailable because this cf version doesn't run the probe, and the guide prompt takes the CF-only path (D8).

## Value

- **A working CF-only brownfield path.** With guide v0.22.2, `cf init` followed by `cf build` on an existing codebase produces the brownfield adoption prompt. No onboarding change is needed (slice 260 already hands off to `cf build`).
- **One decision in core.** The outcome order (`decideOutcome`), the adoption state and the planning-artifact check live in core, so later slices reuse them rather than carry their own heuristics. 262 extends the build resolver; 264, the first consumer outside the build, shapes any read-only API it needs (D7).
- **Greenfield and planned projects are unchanged.** An empty repo still gets the concept prompt. A project with planning artifacts (including this one) never runs the source walk.

## Technical Scope

Included:
- A new core module `packages/core/src/adoption/`: detection report, planning-artifact check, outcome decision, adoption state, the Adoption Facts renderer and the build-time resolver.
- Two additions to the existing `detection/` module: the source-volume walk and the history fact. Docs, ADR and rule-file facts also live there. The report reuses 260's `recognizeCi` and `hasBuildManifest` unchanged.
- One config key, `adoption.state` (shared scope), which is both the persisted state and the user override.
- Build integration in `ContextIntegrator` via an injected resolver, so `cf build`, `context_build` and `template_preview` share one code path. `template_preview` never writes the state.
- One named error, `AdoptionError`, for a guide without the `brownfield-adoption` profile or prompt, a failed state write, and a walk that can't finish (D9).
- A `CONCEPT_PHASE` export from `projectSchema.ts` beside the existing phase constants.
- README: one line documenting `adoption.state` and the override. Full adoption docs are 265's.

Excluded:
- Running or reading squadron's probe, and `fileComprehension` (262).
- The retroactive marker and moving the state to `complete` automatically (263). Until 263, the PM sets `complete` by hand.
- Any `cf next` change (264). `cf next` behavior is unchanged in this slice.
- Interpreting rule files or docs. The report records presence and counts only; reconciliation is 266, mapping is 267.
- Any change to onboarding (260 made it detection-free by design).

## Dependencies

### Prerequisites
- **Slice 260 (complete):** `detection/` module, `recognizeCi`, `hasBuildManifest`, `pathPresent`/`isEnoent`, and `MIN_GUIDE_VERSION = '0.22.2'` with its build-time warning.
- **ai-project-guide ≥ v0.22.2:** ships the `brownfield-adoption` context profile (`[fileConcept, fileArch, fileSlicePlan, fileComprehension]`) and the `##### Brownfield Adoption` prompt, which requires the appended Adoption Facts section and stops if it's missing. 260's minimum already matches, so `MIN_GUIDE_VERSION` doesn't change.
- `git` on PATH for the history fact only. Its absence makes history "unknown", never a build failure (D5).

### Interfaces Required
- `ConfigManager.get/set` for `adoption.state` (existing; validates `enum` values).
- `resolvePromptFilePath`, `ContextProfileParser.parseProfiles`, `SystemPromptParser.getPromptForInstruction` (existing).
- `gitExec` from `guides/gitExec.ts` (existing) for the history fact.
- `resolvePhaseValue` (existing) to normalize the instruction before comparing it with `CONCEPT_PHASE`.

## Architecture

### Component Structure

```
packages/core/src/detection/              facts only
  sourceVolume.ts      measureSourceVolume(root) → Promise<SourceVolume>   (async walk, bounded: D2)
  presentPaths.ts      presentPaths(root, candidates) → string[]           (sync; docs, ADR dirs, rule files)
  history.ts           readHistory(root) → Promise<HistoryFact>            (spawns git, timeout: D5)
  planningArtifacts.ts findPlanningArtifacts(root) → Promise<string[]>     (D6)
  ciDetection.ts       (260, unchanged)
  buildManifest.ts     (260, unchanged)
packages/core/src/adoption/               decisions built on the facts
  adoptionState.ts     ADOPTION_STATES, readAdoptionState, writeAdoptionState
  adoptionOutcome.ts   BROWNFIELD_MIN_SOURCE_LINES, decideOutcome(...) → AdoptionOutcome  (pure)
  adoptionFacts.ts     renderAdoptionFacts(...) → string
  contracts.ts         BROWNFIELD_ADOPTION_INSTRUCTION, AdoptionSelection, AdoptionResolver, AdoptionError
                       (no imports from services/)
  adoptionResolver.ts  createAdoptionResolver({ stateWrites }) → AdoptionResolver
                       the one home of the selection rule (D4) and the build's step order (D7)
  index.ts
packages/core/src/services/
  ContextIntegrator.ts      imports the contracts from adoption/; calls the resolver before mapping
  ContextTemplateEngine.ts  + Adoption Facts section (order 3.4)
  CoreServiceFactory.ts     createContextPipeline(projectPath, { adoptionStateWrites })
```

`detection/` keeps 260's rule: facts only, no policy. Thresholds, outcome order and state live in `adoption/`, which also owns the contracts the integrator consumes. `adoptionResolver.ts` uses the existing guide parsers in `services/` for the guide check (D9). `contracts.ts` imports nothing from `services/`, so the two directories don't import each other's contracts in a cycle.

### Data Flow

```
cf build / context_build / template_preview
  → createContextPipeline(projectPath, { adoptionStateWrites: 'persist' | 'read-only' })
  → integrator.generateContextFromProject(project, worktreeId)
      checkoutPath = worktree path ?? projectPath
      adoptionResolver(projectPath, checkoutPath, project.instruction)   (steps in order)
        1. instruction not eligible (D4) → { selected: false }             (no I/O)
        2. decide (concept-phase instruction only; skipped for an explicit
           'brownfield-adoption', D4): readAdoptionState → findPlanningArtifacts →
           measureSourceVolume, each read only if the previous one didn't decide → decideOutcome(...)
        3. not selected (D4) → { selected: false }
        4. assert profile + prompt exist in the guide, else AdoptionError
        5. brownfield + 'persist' → writeAdoptionState(checkoutPath, 'in_progress')   (D9)
        6. gather the render-only facts (history, docs, ADRs, rule files, CI) → renderAdoptionFacts
        └─ { selected: true, instruction: 'brownfield-adoption', facts }
      effective project = { ...project, instruction } (when selected)
      map → profile filtering (brownfield-adoption keeps fileConcept, fileArch, fileSlicePlan)
      enhancedData.adoptionFacts = facts
  → ContextTemplateEngine: ... Instruction Prompt (3) → Adoption Facts (3.4) → permissiveness (3.5) → ...
```

Facts are gathered only when they are used: source volume only when the state is unset and nothing is planned, the render-only facts only when the brownfield prompt is selected. A planned project costs one `ConfigManager.get` and a few `readdir` calls, and only when its instruction is the concept phase. The guide check runs before the write, so a missing profile never leaves the state written.

### State Management

- **Persisted state:** `adoption.state` in the checkout's shared `.context-forge.toml`. Values in `ADOPTION_STATES`: `""` (default, unset: detection decides), `in_progress`, `complete`, `declined`. Shared scope because adoption is a property of the repository, not of one machine: it is committed and reaches teammates and worktrees.
- **Writers:** `cf build` and `context_build` write `in_progress` on the first brownfield detection, only when the state is unset. `template_preview` never writes. Users write any value with `cf config set` or the MCP config tools. Slice 263 writes `complete`.
- **Readers:** the build resolver (this slice), `cf next` (264), the checker (263).
- **Transitions:**

| From | Event | To |
|---|---|---|
| `""` | brownfield detected by a persisting build | `in_progress` |
| `""` | user override toward brownfield | `in_progress` |
| `""` / `in_progress` | user override toward greenfield / not adopting | `declined` |
| `in_progress` | existing-state slice plan written (263), or PM by hand until then | `complete` |
| any | user unsets (`cf config set adoption.state ""`) | `""` (re-detect) |

## Technical Decisions

### D1 — Outcome order and the brownfield signal
Status: decided
- Outcome order is the arch's: persisted state → already planned → code signals. The state sits first so that writing the concept and architecture during adoption (which would make the repo look "planned") doesn't drop the user out of the brownfield prompt.
- **Brownfield iff non-blank source lines in the project folder ≥ `BROWNFIELD_MIN_SOURCE_LINES` (2000).** One signal, one constant in `adoptionOutcome.ts`, the only place the threshold is written.
- Why source volume alone:
  - Scaffolding stays greenfield. Framework starters (create-next-app, Vite, `django-admin startproject`, `cargo new`) are tens to a few hundred source lines. Manifests, lockfiles, README and LICENSE aren't source and don't count.
  - Shallow clones and squashed or imported repos are judged on their code, not their commit count. History is reported for the prompt (D5) but never decides.
  - The costs are lopsided (a false brownfield writes wrong artifacts), so the threshold sits well above any starter. A small real codebase under 2000 lines lands in greenfield, which only costs a conversation, and the override fixes it.
- Not configurable. The override (D3) is the safety valve; a tunable threshold would be a second override with less clear meaning.
- Rejected: a weighted score over manifest, history, docs and CI; each extra signal is another way to misfire.
- Rejected: `git ls-files`; it misses uncommitted code and spawns a process.

### D2 — Source walk rules
Status: decided
- `measureSourceVolume(root)` walks `root` with `fs/promises`, so it never blocks the MCP server's event loop. It stops at whichever comes first:
  - the line count reaches the threshold (`capped: true`), or
  - `MAX_WALK_ENTRIES` (20,000 directory entries visited, one constant in `sourceVolume.ts`) is reached below the threshold. That's a large non-source tree the walk can't judge, so it throws `AdoptionError` naming the count and the override, rather than guessing greenfield.
- Performance target: detection adds under one second to a Phase 0 build on a local disk. The two caps bound the worst case at 20,000 entries visited and at most 2000 lines' worth of files read. Tests assert the caps, not timings. The walk runs only for Phase 0 builds where the state is unset and nothing is planned (D4, D6), so once the state is written, or a plan exists, it never runs again.
- Counted: files whose extension is in `SOURCE_EXTENSIONS`, a core list of mainstream languages in `sourceVolume.ts` (`ts tsx js jsx py rb go rs java kt swift c h cpp cs php`). The 2000-line threshold leaves wide margin, so the list doesn't need to be exhaustive. Adding a language is a one-line edit to that constant, and 265's real-repo runs are where gaps will show.
- Skipped: any directory whose name starts with `.`; any directory in `EXCLUDED_DIRS` (`node_modules vendor dist build out target coverage __pycache__ venv project-documents`); files larger than `MAX_SOURCE_FILE_BYTES` (512 KiB, treated as generated or minified); symlinks (not followed, so no loops and no escaping the folder).
- `project-documents` is excluded so cf's own footprint (the guide, planning docs) never counts. `cf init` therefore can't tip a repo into brownfield.
- Errors follow 260's rule: ENOENT during the walk (a file deleted mid-walk) is "not present". Any other error throws `AdoptionError`, which names the path and code and says how to skip detection (`cf config set adoption.state in_progress` or `declined`). The build fails explicitly rather than deciding on a partial count.

### D3 — `adoption.state` is both the persisted state and the override
Status: decided
- One shared config key, `type: 'string'`, `enum: [...ADOPTION_STATES]`, default `""`. Override toward brownfield: `cf config set adoption.state in_progress`. Toward greenfield: `cf config set adoption.state declined`. Back to detection: set `""`.
- One key means the two can't disagree, and the existing config surface (CLI, MCP config tools, validation, `cf config get` showing the source) applies with no new commands or flags.
- `declined` and `complete` behave the same for the build (no adoption prompt). They differ for 264: `complete` means "adopted, point at new work"; `declined` means "treat as a fresh project". `declined` isn't in the arch; it is this slice's form of the arch's "override in both directions", and 263 and 264 must read it as "fresh project" (Integration Points).
- The key keeps no history: a `declined` set over an auto-written `in_progress` looks the same as one set first. Nothing consumes that difference, so a second key isn't worth adding.
- Rejected: a project-registry field (per machine, but the state belongs to the repo); a state file under `project-documents/` (new format for one enum); separate mode and state keys (needs precedence rules).

### D4 — Adoption applies only where the concept prompt would run
Status: decided
- The resolver selects the brownfield prompt only when the instruction resolves (via `resolvePhaseValue`) to `CONCEPT_PHASE`, or is literally `brownfield-adoption`. A fresh registration's instruction is `Phase 0: Concept` (`buildProjectCreationDefaults`), so this is exactly the case the slice plan targets.
- Any other phase, stored or passed with `--phase` / `--instruction` / `--it` / MCP overrides, builds as today. A PM who moves to Phase 2 by hand during adoption gets the Phase 2 prompt; that's their choice, and no explicit-override plumbing is needed in either caller.
- **Explicit `brownfield-adoption` instruction** (`--it brownfield-adoption`, or the MCP `instructionType`): the decide step is skipped, so no state check, planning check or source walk, and it can't throw the walk's `AdoptionError`. It never writes the state. The guide check (D9) and the render-only facts still run. The Outcome bullet reads "not evaluated (explicit brownfield-adoption instruction)", and the state bullet shows the stored value. This is the escape hatch D9 names for read-only checkouts, so it must not depend on detection.
- The resolver short-circuits before any I/O for other instructions, so builds in Phases 1–7 pay nothing.
- **Resume relies on the stored instruction staying at Phase 0, and nothing in cf changes it on its own.** Checked in the current code:
  - The stored instruction changes only through explicit user commands. `cf set phase` / `cf project set` (`developmentPhase` or `instruction`, through `computeAutoSetFields`) and the MCP project update tool change it.
  - `cf build --phase/--instruction/--it` and `context_build` overrides change only a working copy.
  - `cf next` and `workflow_next` don't write the project.
  - `workflow.auto_advance` has no reader.
  
  So the brownfield prompt resumes until the user moves the phase, and moving the phase is the user's explicit choice. 264 must keep this property (Integration Points).
- Matching is on constants, not display labels: `resolvePhaseValue` normalizes the instruction before it's compared with `CONCEPT_PHASE`. `BROWNFIELD_ADOPTION_INSTRUCTION` is the same key as the guide's profile name, a contract with the guide that D9 checks on every selected build.
- Rejected: selecting by outcome alone. It would replace every phase's prompt while the state is `in_progress`.

### D5 — Detection report contents
Status: decided
- The slice plan names the report's facts: source volume, history, docs, ADRs, CI and rule files. The guide prompt asks for "the detection facts" without naming any, so the report carries exactly the plan's list and nothing more. Only source volume decides (D1); the rest are gathered only when the Adoption Facts section is rendered (Data Flow step 6), never for greenfield or planned builds.
- Root: every fact, the state read and write, and the planning check use `checkoutPath` (the worktree being worked in, else `projectPath`). CI uses it too: `recognizeCi` walks up from there to the repository root. Only the guide check uses `projectPath`, because that's the prompt file the build reads (D9).
- Facts (paths relative to the checkout root, except CI's absolute paths):
  - `source: { files, lines, capped }` (D2)
  - `history`: `{ kind: 'known', commits, shallow }` or `{ kind: 'unknown', reason }`. Two git calls, each with a 5 s timeout (`gitExec`'s `timeoutMs`, constant `HISTORY_GIT_TIMEOUT_MS`): `git -C root rev-list --count HEAD -- .` (scoped to the folder, so a monorepo subdirectory reports its own commits) and `git -C root rev-parse --is-shallow-repository`. Not a repo, no commits, no `git`, or a timeout → `unknown` with the reason, e.g. "git timed out after 5s". History never decides the outcome (D1), so `unknown` is a stated fact, not a fallback.
  - `docs`: the present entries of `DOC_PATHS` (`README.md README docs doc`)
  - `adrs`: the present entries of `ADR_DIRS` (`docs/adr docs/adrs docs/decisions docs/architecture/decisions doc/adr adr adrs`)
  - `ruleFiles`: the present entries of `RULE_FILE_PATHS` (`CLAUDE.md AGENTS.md GEMINI.md .cursorrules .cursor/rules .windsurfrules .github/copilot-instructions.md .claude/rules`)
  - `ci`: 260's `recognizeCi(root)` result, which owns the repository-root exception
- Presence only, through one helper, `presentPaths(root, candidates)`; no file counts. The three lists are constants in `detection/presentPaths.ts`, not exported from the package. This slice doesn't shape them for 266 or 267, which decide their own needs. Core never reads these files for meaning (arch: facts in core, judgement in the prompt). `cf init` writes some rule files itself; the report doesn't try to tell them apart.
- No `DetectionReport` type or builder file: the resolver gathers the facts and hands them straight to `renderAdoptionFacts`.

### D6 — "Already planned" means a planning artifact file exists
Status: decided
- `findPlanningArtifacts(root)` returns the paths of: `project-documents/user/project-guides/001-initiative-plan.*.md` (reusing `resolveInitiativePlanPath`), and `nnn-arch.*.md`, `nnn-hld.*.md`, `nnn-slices.*.md` under `project-documents/user/architecture/` and `project-documents/user/project-guides/`. Matching is by filename pattern, case-insensitive, the same conventions `ProjectModelBuilder` already parses.
- A concept (`000-concept.*`) is not a planning artifact (PM ruling 20261020). Squadron writes the same filenames, so SQ artifacts count with no special case.
- A missing `project-documents/user/...` directory means none exist. Other read errors throw, as in D2.
- Rejected: reading `project.fileArch` / `fileSlicePlan`. Those are pointers that can be set before a file exists, and they're per worktree.

### D7 — Build integration through an injected resolver
Status: decided
- `ContextIntegrator` gains a seventh optional constructor resolver, `AdoptionResolver = (projectPath, checkoutPath, instruction) => Promise<AdoptionSelection>`, beside the permissiveness resolver. It runs at the start of `generateWithTemplateEngine`, before `mapProjectToEnhancedContext`, because profile filtering keys on the instruction it may change.
- One layer. `adoptionResolver.ts` holds the whole build-time sequence (Data Flow steps 1–6) and is the only file that holds the selection rule. `decideOutcome` is a pure function beside it so the outcome order is tested without I/O; the renderer and the Data Flow diagram only consume the result. No separate read-only resolver is built for 262–264: 264 extracts one from `adoptionResolver.ts` when it needs it, since it's the first consumer outside the build.
- `createContextPipeline(projectPath, options: { adoptionStateWrites: 'persist' | 'read-only' })` wires it. The option is required, so every caller states whether its build may write: `cf build` and `context_build` pass `persist`; `template_preview` ("without side effects") passes `read-only`; existing tests pass `read-only`. `generateContext` in `contextTools.ts` gains the same option.
- Because both CLI and MCP go through this one resolver, their prompts are identical by construction; a test asserts it (Success Criteria).
- The state-change notice goes inside the Adoption Facts section (D8), not on a side channel, so no caller has to plumb a new return value and both surfaces show it the same way.
- Rejected: calling the resolver from `build.ts` and `contextTools.ts`; two call sites invite drift.

### D8 — Adoption Facts section
Status: decided
- Rendered by `renderAdoptionFacts` only, under the heading `### Adoption Facts`, at order 3.4 in `ContextTemplateEngine` (directly after the instruction prompt, before the permissiveness fragment, outside the template). Content, as plain bullets:
  - Outcome and why (e.g. "brownfield: 2000+ non-blank source lines (count stopped at the threshold)"), or "not evaluated (explicit brownfield-adoption instruction)" (D4).
  - Adoption state, and when this build set it: "adoption.state was set to in_progress by this build. To treat the project as new instead: `cf config set adoption.state declined`."
  - Each report fact from D5, with "none found" written out rather than omitted.
  - Squadron: "Squadron: unavailable. This cf version does not run squadron's capability probe, so no probe output is present." This is the arch's "squadron unavailable" statement, with the reason. Checked against the guide v0.22.2 prompt:
    - it takes the squadron path only when probe output is present, the agent's surface has an entry, and `analysis_skill_installed` is true;
    - "any other case", which includes "the section says squadron is absent or unreadable", takes the CF-only path.
    
    With no probe output, the squadron path can't be chosen. The Verification Walkthrough confirms it. Slice 262 replaces this one bullet with the probe JSON or its own unavailable statement; the renderer keeps it in its own function for that.
- Facts only. The section never tells the agent which path to take; the guide prompt does.
- The section is present on every build that selects the brownfield prompt. A selected build without facts is impossible by construction, since the resolver returns both together.

### D9 — Missing guide profile or prompt fails the build
Status: decided
- When the resolver selects the brownfield prompt, it checks the guide prompt file the build reads (`resolvePromptFilePath(projectPath)`) for both a `brownfield-adoption` key in `context_profiles` and a prompt matched by `getPromptForInstruction('brownfield-adoption')`. Either missing → `AdoptionError`: "This project is being adopted as an existing codebase, but the installed ai-project-guide has no brownfield-adoption {profile|prompt}. Run: cf guides update (needs v{MIN_GUIDE_VERSION}+). To treat the project as new instead: cf config set adoption.state declined".
- `generateContextFromProject` rethrows it, as it does `PermissivenessFragmentError`; every other error there still becomes the error stub. `cf build` exits non-zero through `handleError`; `context_build` returns an error result.
- The check reads profiles directly and fails loudly, unlike `applyProfileFiltering`'s lenient load, which would fall back to `_default`.
- One error class, `AdoptionError` in `adoption/contracts.ts`, covers the three adoption failures: missing profile or prompt (above), a walk that can't finish (D2), and a failed state write (below). Each message carries its remedy.
- **State write fails** (read-only checkout, permission denied): `AdoptionError`, rethrown, no prompt. It names `.context-forge.toml`, the error, and two ways on: `cf build --it brownfield-adoption` builds the brownfield prompt without writing (D4), and `cf config set adoption.state declined` takes the greenfield path. Rejected: building anyway unsaved; once an architecture exists, the next build would silently leave adoption.
- **Concurrent builds:** two first builds may both write `in_progress`. `ConfigManager.set` is read-modify-write with no lock, so the last write wins. Both write the same value, so the result is correct. No lock is added.
- **Malformed `.context-forge.toml`:** not a new failure. Every build already reads the file for `git.integration_branch`, and today that parse error becomes the error stub. `readAdoptionState` lets the same parse error propagate unwrapped, and it gets today's error-stub behavior.
- `AdoptionError` is the only error `generateContextFromProject` newly rethrows. Every other error keeps today's error-stub behavior, on the Phase 0 path too.

### Patterns and Conventions
- Facts in `detection/` are synchronous filesystem checks, except the source walk (async, D2) and `readHistory` (spawns `git`).
- Every list or limit the logic compares against (`ADOPTION_STATES`, `SOURCE_EXTENSIONS`, `EXCLUDED_DIRS`, `DOC_PATHS`, `ADR_DIRS`, `RULE_FILE_PATHS`, `BROWNFIELD_MIN_SOURCE_LINES`, `MAX_SOURCE_FILE_BYTES`, `MAX_WALK_ENTRIES`, `HISTORY_GIT_TIMEOUT_MS`, the `brownfield-adoption` instruction key) is defined once as a constant.
- `AdoptionOutcome` is a discriminated union (`kind`), switched exhaustively in the renderer and the selection rule.

## Implementation Details

### API Contracts

```ts
// adoption/adoptionState.ts
export const ADOPTION_STATES = ['', 'in_progress', 'complete', 'declined'] as const;
export type AdoptionState = (typeof ADOPTION_STATES)[number];
export function readAdoptionState(root: string): Promise<AdoptionState>;
export function writeAdoptionState(root: string, state: AdoptionState): Promise<void>;

// adoption/adoptionOutcome.ts
export const BROWNFIELD_MIN_SOURCE_LINES = 2000;
export type AdoptionOutcome =
  | { kind: 'adoption-in-progress' }
  | { kind: 'adoption-closed'; state: 'complete' | 'declined' }
  | { kind: 'already-planned'; artifacts: string[] }
  | { kind: 'brownfield'; source: SourceVolume }
  | { kind: 'greenfield'; source: SourceVolume };

// adoption/contracts.ts — imported by services/ContextIntegrator.ts
export const BROWNFIELD_ADOPTION_INSTRUCTION = 'brownfield-adoption';
export type AdoptionSelection =
  | { selected: false }
  | { selected: true; instruction: typeof BROWNFIELD_ADOPTION_INSTRUCTION; facts: string };
export type AdoptionResolver =
  (projectPath: string, checkoutPath: string, instruction: string) => Promise<AdoptionSelection>;
export class AdoptionError extends Error {} // message carries the remedy (D9)
```

`EnhancedContextData` gains `adoptionFacts?: string`.

### Database / Storage Schema

New key in `CONFIG_KEYS`:

```ts
'adoption.state': {
  type: 'string',
  default: '',
  enum: [...ADOPTION_STATES],
  scope: ConfigScope.Shared,
  description: 'Brownfield adoption state. Empty: cf build detects whether the project is an existing codebase. ' +
    'in_progress: cf build uses the brownfield-adoption prompt in Phase 0 (set automatically on detection, or by hand to force it). ' +
    'complete: adoption finished. declined: treat the project as new.',
},
```

Stored in `.context-forge.toml` as `[adoption] state = "in_progress"`. No existing data changes.

## Integration Points

### Provides to Other Slices
- **262 (squadron path):** the Adoption Facts renderer with the squadron bullet isolated for replacement; the resolver as the place the probe runs.
- **263 (retroactive marker):** `writeAdoptionState(root, 'complete')` and `ADOPTION_STATES`; the checker reads `readAdoptionState`. `declined` means "fresh project", never "adopted" (D3).
- **264 (brownfield-aware `cf next`):** `readAdoptionState`, `findPlanningArtifacts` and `decideOutcome`. 264 extracts a read-only resolver from `adoptionResolver.ts` if it needs the full outcome (D7). It treats `declined` as a fresh project (D3), and must keep the instruction at `CONCEPT_PHASE` while recommending adoption steps, since D4 selects the brownfield prompt only there.
- **266, 267:** the adoption state only. Their rule-file, doc and ADR lists are theirs to define (D5).

### Consumes from Other Slices
- **260:** `recognizeCi`, `hasBuildManifest`, `pathPresent`/`isEnoent`, `MIN_GUIDE_VERSION`; all unchanged.
- **Guide:** the `brownfield-adoption` profile and prompt. Absent → D9's error, never a fallback.

## Success Criteria

### Functional Requirements
- On a fresh registration (instruction `Phase 0: Concept`):
  - Empty repo, or a scaffold-only repo (starter source, manifest, lockfile, README, LICENSE): the concept prompt, no Adoption Facts, `adoption.state` unchanged.
  - Repo with ≥ 2000 non-blank source lines and no planning artifacts: the brownfield prompt with Adoption Facts, and `adoption.state` becomes `in_progress`.
  - A shallow clone (`git clone --depth 1`) of such a repo: brownfield, with history reported as shallow.
  - Repo with a concept only plus code: brownfield.
  - Repo with an initiative plan, arch, HLD or slice plan: the concept prompt; no source walk is performed.
- Monorepo: a project registered at `repo/packages/app` is judged on that folder only. Code in sibling folders doesn't count. CI at the repository root is still recognized.
- `in_progress` resumes: after `000-concept` and an `nnn-arch` file are added, `cf build` still selects the brownfield prompt.
- Override: `declined` on a brownfield repo gives the concept prompt; `in_progress` on an empty repo gives the brownfield prompt; `""` re-detects. Invalid values are rejected by `cf config set`.
- `--phase 2` (or any non-concept instruction) builds that phase's prompt regardless of state. `--it brownfield-adoption` builds the brownfield prompt with facts and doesn't write state.
- `template_preview` on a brownfield repo with unset state shows the brownfield prompt and leaves `adoption.state` unset.
- A guide without the profile or prompt: `cf build` exits non-zero with the `AdoptionError` message; `context_build` returns it as an error. The concept prompt is never produced.

### Technical Requirements
- Unit tests: `measureSourceVolume` (extensions, excluded and dot dirs, size cap, symlinks not followed, early exit at the line threshold, `AdoptionError` at `MAX_WALK_ENTRIES`, non-ENOENT error throws); `readHistory` (repo, shallow repo, non-repo, subdirectory scoping, timeout reported as unknown); `presentPaths`; D9's write failure (`AdoptionError`, state unchanged) and guide-check-before-write ordering; the explicit-instruction path (no decide step, no write, "not evaluated" outcome); `findPlanningArtifacts` (each pattern, concept excluded); `decideOutcome` (every branch of the order); `renderAdoptionFacts` (every outcome, the state-set notice, "none found" facts, the squadron bullet); resolver selection table (D4) and D9's checks.
- Integration tests in `CoreServiceFactory.test.ts` / `pipeline-integration.test.ts`: fixtures for empty, scaffold-only, brownfield, shallow clone, monorepo subdirectory, planned, concept-only, resume (`in_progress` with concept and arch present), `declined` / `in_progress` overrides, `--phase 2` on an `in_progress` project, explicit `brownfield-adoption`, and a guide fixture without the profile.
- CLI/MCP parity test: the same fixture built through `cf build`'s path and `generateContext` (MCP) produces identical prompt strings.
- `pnpm -r build`, lint, typecheck and existing tests pass; existing `createContextPipeline` callers updated with an explicit `adoptionStateWrites`.

### Integration Requirements
- 262 can replace the squadron bullet without touching selection or state.
- 263 and 264 can read and write the state through `adoption/` only.
- This repo (planned) and every existing planned project build byte-identical prompts before and after the slice.

### Verification Walkthrough

Verified 20261021 on the slice branch with the local build. The global `cf` is the published package and lacks this slice, so use the local build: `pnpm -r build`, then `cfl() { node "$PWD/packages/cli/dist/index.js" "$@"; }` from the repo root (a shell function, because zsh does not word-split an alias variable). Guide installs need ai-project-guide ≥ v0.22.2. `cf build` prints only a summary; the prompt itself is the `context` field of `cfl build --json`. Set `CONTEXT_FORGE_DATA_DIR` to a scratch directory (`mkdir /tmp/bf-data && echo '[]' > /tmp/bf-data/projects.json`) for steps 2-5, so the clone is not added to your real project list.

1. **Planned project unchanged.** Build the prompt from `main` and from the slice branch, and diff them. `main` is built in a temporary `git worktree add /tmp/cf-main-wt main` (`pnpm install --frozen-lockfile && pnpm -r build` there), then removed.
   ```bash
   node /tmp/cf-main-wt/packages/cli/dist/index.js build --json > /tmp/before.json   # run from this repo's root
   cfl build --json > /tmp/after.json
   diff /tmp/before.json /tmp/after.json   # expect: no output (verified: 6200 bytes each, identical)
   ```
2. **Brownfield detected and persisted; squadron statement takes the CF-only path.** Any real codebase over 2000 source lines without `project-documents/` (verified with `expressjs/express`, 2246+ counted lines):
   ```bash
   export CONTEXT_FORGE_DATA_DIR=/tmp/bf-data
   git clone --depth 1 https://github.com/expressjs/express.git /tmp/bf && cd /tmp/bf && cfl init --name bf
   cfl build --json | python3 -c "import json,sys; c=json.load(sys.stdin)['context']; print(c[c.index('### Instruction Prompt'):])"
   # expect: "We're adopting project bf, an existing codebase...", then "### Adoption Facts" with
   #   "Outcome: brownfield: 2246+ non-blank source lines (threshold 2000; count stopped at the threshold)",
   #   the state-set notice, "History: N commits (shallow clone: history is truncated)", docs, rule files and CI
   #   files (relative to the project folder), and "Squadron: unavailable. This cf version does not run squadron's capability probe..."
   cfl config get adoption.state   # expect: Value: in_progress, Source: project
   ```
   Live run (reset the state first with `cfl config set adoption.state ''`). The `/cf:build` command calls `cf` from PATH, so put a `cf` shim for the local build first on PATH (`printf '#!/bin/sh\nexec node <repo>/packages/cli/dist/index.js "$@"\n' > /tmp/cfshim/cf; chmod +x /tmp/cfshim/cf; export PATH=/tmp/cfshim:$PATH`), then `claude -p "/cf:build" --max-turns 6 --output-format stream-json --verbose`. Verified: the agent replied "Context loaded: bf | Phase 0: Concept (brownfield adoption, Architect role) | no slice", then "CF-only path: the Adoption Facts say squadron is unavailable ... I'll work from the repo alone", and went on to read the repo and the guide's concept and naming guides. It tried no squadron step.
3. **Overrides.**
   ```bash
   cfl config set adoption.state declined && cfl build --json | grep -o 'Adoption Facts' | wc -l   # expect: 0
   cfl config set adoption.state maybe   # expect: exit 1, 'must be one of ["", "in_progress", "complete", "declined"]'
   cfl config set adoption.state in_progress && cfl build --json | grep -o 'Adoption Facts' | wc -l   # expect: 1
   ```
4. **Missing profile.** Reset the state (`cfl config set adoption.state ''`), then delete the `  brownfield-adoption:` line from `project-documents/ai-project-guide/project-guides/prompt.ai-project.system.md` in `/tmp/bf` (verified in place, with a backup restored afterward) and run `cfl build`. Expect exit 1 and: `This project is being adopted as an existing codebase, but the installed ai-project-guide has no brownfield-adoption profile. Run: cf guides update (needs v0.22.2+). To treat the project as new instead: cf config set adoption.state declined`. `cfl config get adoption.state` is still empty (verified).
5. **MCP parity.** From a headless MCP client (the SDK's stdio client spawning `packages/mcp-server/dist/index.js` with cwd `/tmp/bf`): with the state empty, `template_preview` returns the brownfield prompt with Adoption Facts and leaves `adoption.state` empty (verified). `context_build` then sets it to `in_progress`; after resetting it to empty, the `context_build` text equals `cfl build --json`'s `context` exactly (verified, 8180 characters each). `packages/mcp-server/tests/integration/adoptionParity.test.ts` covers the same equality in CI.

Greenfield, scaffold-only, resume, other phases, the explicit instruction and monorepo scoping are covered by the integration fixtures (Technical Requirements), not by manual steps.

## Risk Assessment

### Technical Risks
- **Threshold misfire.** A real but small codebase (< 2000 lines) gets the concept prompt; a large generated tree outside `EXCLUDED_DIRS` could tip a starter into brownfield.

### Mitigation Strategies
- One constant, unit-tested against starter-sized and codebase-sized fixtures; generated-file size cap; `project-documents` and dot-directories excluded.
- The Adoption Facts section states the outcome, the count and the override command, and the guide prompt reviews everything with the PM before writing artifacts. 265's real-repo runs will show whether the threshold or `EXCLUDED_DIRS` need adjusting.

## Implementation Notes

### Development Approach
1. `CONCEPT_PHASE` export; `adoption.state` config key with `ADOPTION_STATES`; `readAdoptionState` / `writeAdoptionState`, with tests.
2. Detection facts: `sourceVolume.ts`, `presentPaths.ts`, `history.ts`, `planningArtifacts.ts`, with tests (including a shallow-clone fixture built in a temp dir).
3. `adoptionOutcome.ts`, with tests for every outcome.
4. `adoptionFacts.ts` renderer, with tests.
5. `adoption/contracts.ts`, `adoptionResolver.ts`, `ContextIntegrator` and `ContextTemplateEngine` changes, `createContextPipeline` option and its callers (`build.ts`, `contextTools.ts` incl. `template_preview`, tests).
6. Integration fixtures, the parity test, README line. Run the walkthrough.

### Special Considerations
- The build writes a tracked file (`.context-forge.toml`) on first brownfield detection. That's intended (the state must travel with the repo), and the Adoption Facts notice tells the user it happened.
- Until 263 lands, nothing moves the state to `complete`; the PM sets it by hand. With D4, a project left at `in_progress` only affects Phase 0 builds.
- `packages/electron/out/` holds a stale compiled caller of `createContextPipeline`; the package was deleted in 0.13.2, so it is not updated.

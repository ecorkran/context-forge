---
docType: slice-design
slice: detection-and-adoption-state
project: context-forge
parent: project-documents/user/architecture/260-slices.brownfield-adoption.md
dependencies: [260]
interfaces: [262, 263, 264, 266, 267]
dateCreated: 20261020
dateUpdated: 20261020
status: not_started
---

# Slice Design: detection-and-adoption-state

## Overview

Today `cf build` on a fresh registration always assembles the Phase 0 concept prompt, whatever the repository holds. This slice adds the one decision the brownfield initiative rests on: core looks at the project folder, produces a **detection report** (source volume, history, docs, ADRs, CI, rule files), and maps it to one **outcome**, checked in order:

1. **Adoption in progress** or **closed**: the persisted adoption state says so.
2. **Already planned**: an initiative plan, architecture/HLD or slice plan exists. A concept alone doesn't count.
3. **Brownfield** or **greenfield**: decided from the code signals.

When the outcome is brownfield or adoption in progress, and the build would otherwise assemble the Phase 0 concept prompt, `cf build` and `context_build` select the guide's `brownfield-adoption` profile and prompt and append an **Adoption Facts** section after the instruction prompt. A first brownfield detection persists the adoption state as `in_progress`, so the build keeps resuming the brownfield prompt after the concept and architecture exist. The user can override the outcome in both directions with one config key. If the installed guide lacks the profile or prompt, the build fails with a named error and never falls back to the concept prompt.

Squadron is not probed in this slice (262 adds it). Until then, the Adoption Facts section states that no probe was run, and the guide prompt takes the CF-only path.

## Value

- **A working CF-only brownfield path.** With guide v0.22.2, `cf init` followed by `cf build` on an existing codebase produces the brownfield adoption prompt. No onboarding change is needed (slice 260 already hands off to `cf build`).
- **One decision, many consumers.** 262–264, 266 and 267 read the report, the outcome and the state from core rather than carrying their own heuristics.
- **Greenfield and planned projects are unchanged.** An empty repo still gets the concept prompt. A project with planning artifacts (including this one) never runs the source walk.

## Technical Scope

Included:
- A new core module `packages/core/src/adoption/`: detection report, planning-artifact check, outcome decision, adoption state, the Adoption Facts renderer and the build-time resolver.
- Two additions to the existing `detection/` module: the source-volume walk and the history fact. Docs, ADR and rule-file facts also live there. The report reuses 260's `recognizeCi` and `hasBuildManifest` unchanged.
- One config key, `adoption.state` (shared scope), which is both the persisted state and the user override.
- Build integration in `ContextIntegrator` via an injected resolver, so `cf build`, `context_build` and `template_preview` share one code path. `template_preview` never writes the state.
- A named error, `AdoptionPromptMissingError`, for a guide without the `brownfield-adoption` profile or prompt.
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
packages/core/src/detection/              facts only (sync unless noted)
  sourceVolume.ts      measureSourceVolume(root) → SourceVolume       (sync walk, early exit)
  projectDocs.ts       findReadme, findDocDirs, findAdrDirs           (sync)
  ruleFiles.ts         RULE_FILE_PATHS + findRuleFiles(root)          (sync)
  history.ts           readHistory(root) → Promise<HistoryFact>       (async: spawns git)
  ciDetection.ts       (260, unchanged)
  buildManifest.ts     (260, unchanged)
packages/core/src/adoption/               decisions built on the facts
  adoptionState.ts     ADOPTION_STATES, readAdoptionState, writeAdoptionState
  planningArtifacts.ts findPlanningArtifacts(root) → Promise<string[]>
  detectionReport.ts   buildDetectionReport(root) → Promise<DetectionReport>
  adoptionOutcome.ts   BROWNFIELD_MIN_SOURCE_LINES, decideOutcome(...) → AdoptionOutcome  (pure)
  resolveAdoption.ts   resolveAdoption(root) → Promise<AdoptionResolution>  (read-only, for 262–264)
  adoptionFacts.ts     renderAdoptionFacts(resolution) → string
  adoptionResolver.ts  createAdoptionResolver({ stateWrites }) → AdoptionResolver  (build integration)
  index.ts
packages/core/src/services/
  ContextIntegrator.ts      + AdoptionResolver type, AdoptionPromptMissingError, call before mapping
  ContextTemplateEngine.ts  + Adoption Facts section (order 3.4)
  CoreServiceFactory.ts     createContextPipeline(projectPath, { adoptionStateWrites })
```

`detection/` keeps 260's rule: facts only, no policy. Thresholds, outcome order and state live in `adoption/`.

### Data Flow

```
cf build / context_build / template_preview
  → createContextPipeline(projectPath, { adoptionStateWrites: 'persist' | 'read-only' })
  → integrator.generateContextFromProject(project, worktreeId)
      checkoutPath = worktree path ?? projectPath
      adoptionResolver(projectPath, checkoutPath, project.instruction)
        ├─ instruction is neither CONCEPT_PHASE nor 'brownfield-adoption' → { selected: false }   (no I/O)
        ├─ resolveAdoption(checkoutPath)
        │    state = adoption.state
        │    in_progress           → outcome adoption-in-progress
        │    complete | declined   → outcome adoption-closed
        │    planningArtifacts ≠ ∅ → outcome already-planned
        │    report.source.lines ≥ BROWNFIELD_MIN_SOURCE_LINES → brownfield, else greenfield
        ├─ brownfield + 'persist' → writeAdoptionState(checkoutPath, 'in_progress'), stateChanged = true
        ├─ select when outcome ∈ {adoption-in-progress, brownfield} or instruction is 'brownfield-adoption'
        ├─ selected → assert profile + prompt exist in the guide, else AdoptionPromptMissingError
        └─ return { selected, instruction: 'brownfield-adoption', facts: renderAdoptionFacts(...) }
      effective project = { ...project, instruction } (when selected)
      map → profile filtering (brownfield-adoption keeps fileConcept, fileArch, fileSlicePlan)
      enhancedData.adoptionFacts = facts
  → ContextTemplateEngine: ... Instruction Prompt (3) → Adoption Facts (3.4) → permissiveness (3.5) → ...
```

The detection report is built only when the state is unset and no planning artifact exists, or when facts are rendered. A planned project costs one `ConfigManager.get` and a few `readdir` calls, and only when its instruction is the concept phase.

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
- Rejected: a weighted score over manifest, history, docs and CI. Every extra signal is a way to misfire (a starter has a manifest and often CI), and a score is harder to test and explain than one threshold.
- Rejected: `git ls-files` for the file list. It misses uncommitted code, spawns a process, and needs the same failure handling 260 rejected for CI.

### D2 — Source walk rules
Status: decided
- `measureSourceVolume(root)` walks `root` synchronously and stops as soon as the line count reaches the threshold (`capped: true`). Cost is bounded by the threshold, not by repo size.
- Counted: files whose extension is in `SOURCE_EXTENSIONS` (one exported constant in `sourceVolume.ts`): `ts tsx js jsx mjs cjs vue svelte py rb go rs java kt kts scala swift m mm c h cc cpp hpp cs fs php dart ex exs erl clj lua r jl sh sql`.
- Skipped: any directory whose name starts with `.`; any directory in `EXCLUDED_DIRS` (`node_modules vendor dist build out target coverage __pycache__ venv project-documents`); files larger than `MAX_SOURCE_FILE_BYTES` (512 KiB, treated as generated or minified); symlinks (not followed, so no loops and no escaping the folder).
- `project-documents` is excluded so cf's own footprint (the guide, planning docs) never counts. `cf init` therefore can't tip a repo into brownfield.
- Errors follow 260's rule: ENOENT during the walk (a file deleted mid-walk) is "not present". Any other error throws `DetectionError`, which names the path and code and says how to skip detection (`cf config set adoption.state in_progress` or `declined`). The build fails explicitly rather than deciding on a partial count.

### D3 — `adoption.state` is both the persisted state and the override
Status: decided
- One shared config key, `type: 'string'`, `enum: [...ADOPTION_STATES]`, default `""`. Override toward brownfield: `cf config set adoption.state in_progress`. Toward greenfield: `cf config set adoption.state declined`. Back to detection: set `""`.
- One key means the two can't disagree, and the existing config surface (CLI, MCP config tools, validation, `cf config get` showing the source) applies with no new commands or flags.
- `declined` and `complete` behave the same for the build (no adoption prompt). They differ for 264: `complete` means "adopted, point at new work"; `declined` means "treat as a fresh project".
- Rejected: a field in the project registry. The registry is per machine; adoption is a property of the repo that teammates and worktrees must see.
- Rejected: a state file under `project-documents/`. A new format and parser for one enum.
- Rejected: separate `adoption.mode` (override) and `adoption.state` keys. Combinations like mode `greenfield` with state `in_progress` would need precedence rules.

### D4 — Adoption applies only where the concept prompt would run
Status: decided
- The resolver selects the brownfield prompt only when the instruction resolves (via `resolvePhaseValue`) to `CONCEPT_PHASE`, or is literally `brownfield-adoption`. A fresh registration's instruction is `Phase 0: Concept` (`buildProjectCreationDefaults`), so this is exactly the case the slice plan targets.
- Any other phase, stored or passed with `--phase` / `--instruction` / `--it` / MCP overrides, builds as today. A PM who moves to Phase 2 by hand during adoption gets the Phase 2 prompt; that's their choice, and no explicit-override plumbing is needed in either caller.
- An explicit `brownfield-adoption` instruction always gets the Adoption Facts (the prompt stops without them), whatever the outcome. It never writes the state; the documented override is D3.
- The resolver short-circuits before any I/O for other instructions, so builds in Phases 1–7 pay nothing.
- Rejected: selecting by outcome alone, ignoring the instruction. It would replace every phase's prompt while the state is `in_progress`, and until 263 the state never leaves `in_progress` on its own.

### D5 — Detection report contents
Status: decided
- `DetectionReport` (all paths absolute, scoped to the checkout root except CI):
  - `source: { files, lines, capped }` (D2)
  - `buildManifest: boolean` (260's `hasBuildManifest`)
  - `history`: `{ kind: 'known', commits, shallow }` or `{ kind: 'unknown', reason }`. `git -C root rev-list --count HEAD -- .` (scoped to the folder, so a monorepo subdirectory reports its own commits) and `git -C root rev-parse --is-shallow-repository`. Not a repo, no commits, or no `git` → `unknown` with the reason. History is a fact for the prompt and never decides the outcome (D1), so `unknown` is a stated fact, not a fallback.
  - `readme`: path of the first `README*` at the root, or null
  - `docDirs`: `docs/`, `doc/` with their markdown file counts
  - `adrDirs`: `ADR_DIRS` (`docs/adr docs/adrs docs/decisions docs/architecture/decisions doc/adr adr adrs`) with markdown file counts
  - `ci`: 260's `recognizeCi(root)` result, which owns the repository-root exception
  - `ruleFiles`: present entries of `RULE_FILE_PATHS` (`CLAUDE.md AGENTS.md GEMINI.md .cursorrules .cursor/rules .windsurfrules .github/copilot-instructions.md .claude/rules`)
- Presence and counts only. Core never reads these files for meaning (arch: facts in core, judgement in the prompt). `cf init` writes some rule files itself; the report doesn't try to tell them apart. That's 266's problem.
- Every fact lives in `detection/` as its own function and constant, so 262–267 can reuse one without building the whole report.

### D6 — "Already planned" means a planning artifact file exists
Status: decided
- `findPlanningArtifacts(root)` returns the paths of: `project-documents/user/project-guides/001-initiative-plan.*.md` (reusing `resolveInitiativePlanPath`), and `nnn-arch.*.md`, `nnn-hld.*.md`, `nnn-slices.*.md` under `project-documents/user/architecture/` and `project-documents/user/project-guides/`. Matching is by filename pattern, case-insensitive, the same conventions `ProjectModelBuilder` already parses.
- A concept (`000-concept.*`) is not a planning artifact (PM ruling 20261020). Squadron writes the same filenames, so SQ artifacts count with no special case.
- A missing `project-documents/user/...` directory means none exist. Other read errors throw, as in D2.
- Rejected: reading `project.fileArch` / `fileSlicePlan`. Those are pointers that can be set before a file exists, and they're per worktree.

### D7 — Build integration through an injected resolver
Status: decided
- `ContextIntegrator` gains a seventh optional constructor resolver, `AdoptionResolver = (projectPath, checkoutPath, instruction) => Promise<AdoptionSelection>`, beside the permissiveness resolver. It runs at the start of `generateWithTemplateEngine`, before `mapProjectToEnhancedContext`, because profile filtering keys on the instruction it may change.
- `createContextPipeline(projectPath, options: { adoptionStateWrites: 'persist' | 'read-only' })` wires it. The option is required, so every caller states whether its build may write: `cf build` and `context_build` pass `persist`; `template_preview` ("without side effects") passes `read-only`; existing tests pass `read-only`. `generateContext` in `contextTools.ts` gains the same option.
- Because both CLI and MCP go through this one resolver, their prompts are identical by construction; a test asserts it (Success Criteria).
- The state-change notice goes inside the Adoption Facts section (D8), not on a side channel, so no caller has to plumb a new return value and both surfaces show it the same way.
- Rejected: calling the resolver from `build.ts` and `contextTools.ts` before the pipeline. Two call sites, the drift 260 just removed elsewhere.

### D8 — Adoption Facts section
Status: decided
- Rendered by `renderAdoptionFacts` only, under the heading `### Adoption Facts`, at order 3.4 in `ContextTemplateEngine` (directly after the instruction prompt, before the permissiveness fragment, outside the template). Content, as plain bullets:
  - Outcome and why (e.g. "brownfield: 2000+ non-blank source lines (count stopped at the threshold)").
  - Adoption state, and when this build set it: "adoption.state was set to in_progress by this build. To treat the project as new instead: `cf config set adoption.state declined`."
  - Each report fact from D5, with "none found" written out rather than omitted.
  - Squadron: "Squadron probe: not run. This cf version does not read squadron's capability probe, so no probe output is available." Slice 262 replaces this one bullet with the probe JSON or its "squadron unavailable" statement; the renderer keeps it in its own function for that.
- Facts only. The section never tells the agent which path to take; the guide prompt does.
- The section is present on every build that selects the brownfield prompt. A selected build without facts is impossible by construction, since the resolver returns both together.

### D9 — Missing guide profile or prompt fails the build
Status: decided
- When the resolver selects the brownfield prompt, it checks the guide prompt file the build reads (`resolvePromptFilePath(projectPath)`) for both a `brownfield-adoption` key in `context_profiles` and a prompt matched by `getPromptForInstruction('brownfield-adoption')`. Either missing → `AdoptionPromptMissingError`: "This project is being adopted as an existing codebase, but the installed ai-project-guide has no brownfield-adoption {profile|prompt}. Run: cf guides update (needs v{MIN_GUIDE_VERSION}+). To treat the project as new instead: cf config set adoption.state declined".
- `generateContextFromProject` rethrows it, as it does `PermissivenessFragmentError`; every other error there still becomes the error stub. `cf build` exits non-zero through `handleError`; `context_build` returns an error result.
- The check reads profiles directly and fails loudly, unlike `applyProfileFiltering`'s lenient load, which would fall back to `_default`.
- `DetectionError` (D2) and a failed state write are rethrown the same way. They are configuration or I/O problems the user must see.

### Patterns and Conventions
- Facts in `detection/` are synchronous filesystem checks except `readHistory`, the one fact that needs `git`.
- Every list the logic compares against (`ADOPTION_STATES`, `SOURCE_EXTENSIONS`, `EXCLUDED_DIRS`, `ADR_DIRS`, `RULE_FILE_PATHS`, `BROWNFIELD_MIN_SOURCE_LINES`, `MAX_SOURCE_FILE_BYTES`, the `brownfield-adoption` instruction key) is one exported constant.
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

// adoption/resolveAdoption.ts — read-only; what 262–264 call
export interface AdoptionResolution {
  state: AdoptionState;
  outcome: AdoptionOutcome;
  report: DetectionReport | null; // null when the outcome was decided without it
}
export function resolveAdoption(root: string): Promise<AdoptionResolution>;

// services/ContextIntegrator.ts
export const BROWNFIELD_ADOPTION_INSTRUCTION = 'brownfield-adoption';
export type AdoptionSelection =
  | { selected: false }
  | { selected: true; instruction: typeof BROWNFIELD_ADOPTION_INSTRUCTION; facts: string };
export type AdoptionResolver =
  (projectPath: string, checkoutPath: string, instruction: string) => Promise<AdoptionSelection>;
export class AdoptionPromptMissingError extends Error {}
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
- **263 (retroactive marker):** `writeAdoptionState(root, 'complete')` and `ADOPTION_STATES`; the checker reads `readAdoptionState`.
- **264 (brownfield-aware `cf next`):** `resolveAdoption(root)` (read-only) for in-progress / complete / fresh. 264 must keep the instruction at `CONCEPT_PHASE` while recommending adoption steps, since D4 selects the brownfield prompt only there.
- **266, 267:** `findRuleFiles`, `findDocDirs`, `findAdrDirs` and `RULE_FILE_PATHS` / `ADR_DIRS` as the single lists of where those live.

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
- A guide without the profile or prompt: `cf build` exits non-zero with `AdoptionPromptMissingError`'s message; `context_build` returns it as an error. The concept prompt is never produced.

### Technical Requirements
- Unit tests: `measureSourceVolume` (extensions, excluded and dot dirs, size cap, symlinks not followed, early exit, non-ENOENT error throws); `readHistory` (repo, shallow repo, non-repo, subdirectory scoping); `findPlanningArtifacts` (each pattern, concept excluded); `decideOutcome` (every branch of the order); `renderAdoptionFacts` (every outcome, the state-set notice, "none found" facts, the squadron bullet); resolver selection table (D4) and D9's checks.
- Integration tests in `CoreServiceFactory.test.ts` / `pipeline-integration.test.ts`: fixtures for empty, scaffold-only, brownfield, shallow clone, monorepo subdirectory, planned, concept-only, and a guide fixture without the profile.
- CLI/MCP parity test: the same fixture built through `cf build`'s path and `generateContext` (MCP) produces identical prompt strings.
- `pnpm -r build`, lint, typecheck and existing tests pass; existing `createContextPipeline` callers updated with an explicit `adoptionStateWrites`.

### Integration Requirements
- 262 can replace the squadron bullet without touching selection or state.
- 263 and 264 can read and write the state through `adoption/` only.
- This repo (planned) and every existing planned project build byte-identical prompts before and after the slice.

### Verification Walkthrough

Use the local build (the global `cf` is the published package): `alias cfl="node $PWD/packages/cli/dist/index.js"` from the repo root after `pnpm -r build`. Guide installs need ai-project-guide ≥ v0.22.2.

1. **Planned project unchanged.**
   ```bash
   cfl build > /tmp/before.md     # in this repo, on main before the slice
   cfl build > /tmp/after.md      # after the slice
   diff /tmp/before.md /tmp/after.md   # expect: no differences
   ```
2. **Greenfield.**
   ```bash
   mkdir /tmp/gf && cd /tmp/gf && cfl init --name gf
   cfl build | grep -E 'Concept|Adoption Facts'   # expect: the concept prompt, no "Adoption Facts"
   cfl config get adoption.state                   # expect: empty, source default
   ```
3. **Scaffold-only stays greenfield.**
   ```bash
   cd /tmp && npm create vite@latest scaf -- --template react-ts && cd scaf && cfl init --name scaf
   cfl build | grep -c 'Adoption Facts'            # expect: 0
   ```
4. **Brownfield detected and persisted.** Use any real codebase over 2000 lines without `project-documents/`:
   ```bash
   git clone --depth 1 <some-repo> /tmp/bf && cd /tmp/bf && cfl init --name bf
   cfl build | sed -n '/### Instruction Prompt/,/### 3rd-Party/p'
   # expect: "We're adopting project bf, an existing codebase...", then "### Adoption Facts" with
   #   outcome brownfield (2000+ lines), history shallow, CI/docs/rule files, the state-set notice,
   #   and "Squadron probe: not run"
   cfl config get adoption.state                   # expect: in_progress, source project
   ```
5. **Resume after artifacts exist.** Add `project-documents/user/project-guides/000-concept.bf.md` and `project-documents/user/architecture/100-arch.bf.md`, then `cfl build` → still the brownfield prompt.
6. **Overrides.**
   ```bash
   cfl config set adoption.state declined && cfl build | grep -c 'Adoption Facts'   # expect: 0
   cd /tmp/gf && cfl config set adoption.state in_progress && cfl build | grep -c 'Adoption Facts'   # expect: 1
   cfl config set adoption.state maybe            # expect: rejected, lists the allowed values
   ```
7. **Other phases untouched.** In `/tmp/bf`: `cfl build --phase 2` → the Phase 2 architecture prompt, no Adoption Facts.
8. **Missing profile.** Install a guide older than v0.22.0 in a copy of `/tmp/bf` (`cfl guides` with a pinned old version, or delete the `brownfield-adoption` line from the installed prompt file), then `cfl build` → non-zero exit and the `AdoptionPromptMissingError` message naming `cf guides update` and the `declined` override.
9. **MCP parity.** From an MCP client in `/tmp/bf`, call `context_build` and compare with `cfl build` output (expect identical prompt text); call `template_preview` on a fresh brownfield copy and confirm `adoption.state` is still unset afterward.
10. **Monorepo.** `mkdir -p /tmp/mono/packages/app && cd /tmp/mono && git init`, put the brownfield code under `packages/other`, register `packages/app` (`cd packages/app && cfl init --name app`) → greenfield; move the code into `packages/app` and set `adoption.state ""` → brownfield.

## Risk Assessment

### Technical Risks
- **Threshold misfire.** A real but small codebase (< 2000 lines) gets the concept prompt; a large generated tree outside `EXCLUDED_DIRS` could tip a starter into brownfield.

### Mitigation Strategies
- One constant, unit-tested against starter-sized and codebase-sized fixtures; generated-file size cap; `project-documents` and dot-directories excluded.
- The Adoption Facts section states the outcome, the count and the override command, and the guide prompt reviews everything with the PM before writing artifacts. 265's real-repo runs will show whether the threshold or `EXCLUDED_DIRS` need adjusting.

## Implementation Notes

### Development Approach
1. `CONCEPT_PHASE` export; `adoption.state` config key with `ADOPTION_STATES`; `readAdoptionState` / `writeAdoptionState`, with tests.
2. Detection facts: `sourceVolume.ts`, `projectDocs.ts`, `ruleFiles.ts`, `history.ts`, with tests (including a shallow-clone fixture built in a temp dir).
3. `planningArtifacts.ts`, `detectionReport.ts`, `adoptionOutcome.ts`, `resolveAdoption.ts`, with tests for every outcome.
4. `adoptionFacts.ts` renderer, with tests.
5. `adoptionResolver.ts`, `AdoptionPromptMissingError`, `ContextIntegrator` and `ContextTemplateEngine` changes, `createContextPipeline` option and its callers (`build.ts`, `contextTools.ts` incl. `template_preview`, tests).
6. Integration fixtures, the parity test, README line. Run the walkthrough.

### Special Considerations
- The build writes a tracked file (`.context-forge.toml`) on first brownfield detection. That's intended (the state must travel with the repo), and the Adoption Facts notice tells the user it happened.
- Until 263 lands, nothing moves the state to `complete`; the PM sets it by hand. With D4, a project left at `in_progress` only affects Phase 0 builds.
- `packages/electron/out/` holds a stale compiled caller of `createContextPipeline`; the package was deleted in 0.13.2, so it is not updated.

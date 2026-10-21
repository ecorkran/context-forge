---
docType: tasks
slice: detection-and-adoption-state
project: context-forge
lld: user/slices/261-slice.detection-and-adoption-state.md
dependencies:
- 260
projectState: main after slice 260 (complete). `detection/` holds `pathPresent`/`isEnoent`,
  `recognizeCi` and `hasBuildManifest`; `MIN_GUIDE_VERSION` is 0.22.2. `cf build`
  on a fresh registration always assembles the Phase 0 concept prompt. Design reviewed
  (round 2 CONCERNS; F002 addressed by the 260 arch amendment in 93587cdd, the rest
  accepted as written).
dateCreated: 20261021
dateUpdated: 20261021
status: complete
turns: 36
promptTokens: 3064205
cachedTokens: 2950677
cacheWriteTokens: 113460
completionTokens: 31508
durationSeconds: 357.7
costUsd: 2.128757
usageRounds: 2
pricedRounds: 2
revision_number: 1
---

## Context Summary

- Slice 261 adds brownfield detection and the persisted adoption state. On a Phase 0 build, core decides an outcome (state → already planned → source volume) and, for brownfield or adoption in progress, selects the guide's `brownfield-adoption` prompt and appends an `### Adoption Facts` section.
- The design's D1–D9, API Contracts, Storage Schema, Success Criteria and Verification Walkthrough are the spec. Do not re-derive them, and do not widen scope (Excluded list: no squadron probe, no `cf next` change, no `complete` transition, no onboarding change, no reading rule files or docs for meaning).
- Dependencies: slice 260 (complete). Guide: ai-project-guide v0.22.2 ships the profile and prompt. This repo's installed guide is v0.21.9 and has neither, which is fine: this repo is planned, so it never selects the brownfield prompt.
- Core export split: `packages/core/src/index.ts` is browser-safe; `packages/core/src/node.ts` holds fs-dependent exports. `adoption/` and the new `detection/` files are fs-dependent: export them from `node.ts` only. Export `CONCEPT_PHASE` from `index.ts` (it lives in `schema/projectSchema.ts`, already browser-safe).
- Import direction (review F005): `services/ContextIntegrator.ts` imports from `adoption/contracts.ts` only, never from `adoption/index.ts`. `contracts.ts` imports nothing. `createAdoptionResolver` is wired in `CoreServiceFactory.ts` (the composition root).
- Import cycle to avoid: `ConfigManager.ts` imports `ConfigKeys.ts`, and `adoptionState.ts` needs `ConfigManager`. Define `ADOPTION_STATES` and `AdoptionState` in `config/ConfigKeys.ts` beside `PERMISSIVENESS_LEVELS`, and re-export them from `adoption/adoptionState.ts` so the design's contract holds. Defined once, no cycle.
- Missing-file rule (260, D2, D6): `ENOENT` means "not present"; every other filesystem error throws. Never use `existsSync` in `detection/`. Use `isEnoent` / `pathPresent` from `detection/pathPresent.ts`.
- `resolveInitiativePlanPath` swallows every `readdir` error, which conflicts with D6 ("other read errors throw"). Task 6 extracts its filename pattern as a constant and reads the directory with the ENOENT-only rule, so there is one pattern definition and no swallowed error. `resolveInitiativePlanPath`'s own behavior is unchanged.
- `ContextIntegrator.ts` is already 377 lines. Add only the resolver field, the call and the rethrow there; all adoption logic lives in `adoption/`.
- Performance (D2): the sub-second detection target is verified by the cap tests in Task 3T (early exit at the line threshold, `AdoptionError` at `MAX_WALK_ENTRIES`), which bound the worst case. D2 says tests assert the caps, not timings, so there is no timing or load test. The `tests/load/` tier is a rule in `rules/python.md` and does not apply to this TypeScript repo.
- Permission tests (`chmod 000`) can't fail as root and don't apply on Windows: skip with `it.skipIf`, as the 260 detection tests do.
- Use the local build (`node packages/cli/dist/index.js`, alias `cfl`); the global `cf` is the published package. Run `pnpm -r build` before tests that import `@context-forge/core` from `dist`.
- Next planned slice: 262 (squadron path), which replaces the squadron bullet and runs the probe in the resolver.

## Tasks

- [x] **Task 0: Slice branch** (effort: 1)
  - [x] Read `cf config get git.integration_branch`; empty means the target is `main`.
  - [x] Create `261-slice.detection-and-adoption-state` from the target if it does not exist, otherwise switch to it.
  - [x] Success: `git branch --show-current` prints the slice branch.

### State and contracts (Development Approach step 1)

- [x] **Task 1: `CONCEPT_PHASE` and the `adoption.state` key** (effort: 1)
  - [x] In `packages/core/src/schema/projectSchema.ts`, add `CONCEPT_PHASE` (`PHASE_STRINGS[0]`) beside `ARCHITECTURE_PHASE`, typed the same way. Confirm it is exported from `packages/core/src/index.ts` the way `ARCHITECTURE_PHASE` is.
  - [x] In `packages/core/src/config/ConfigKeys.ts`, add `ADOPTION_STATES` (`['', 'in_progress', 'complete', 'declined'] as const`) and `AdoptionState`, beside `PERMISSIVENESS_LEVELS`.
  - [x] Add the `adoption.state` key exactly as in the design's Database / Storage Schema (string, default `''`, `enum: [...ADOPTION_STATES]`, `ConfigScope.Shared`, the description verbatim).
  - [x] Success: `pnpm -r build` passes; `cfl config get adoption.state` prints an empty value with source `default`.

- [x] **Task 1T: Key and constant tests** (effort: 1)
  - [x] In `packages/core/tests/config/ConfigKeys.test.ts`, add a `describe('adoption.state')` following the `workflow.permissiveness` block: registered, default `''`, shared scope, enum equals `ADOPTION_STATES`.
  - [x] Add cases there (or in `ConfigManager.test.ts`, following the permissiveness `set` case): each `ADOPTION_STATES` value is accepted by `set(..., 'project')` and lands in `.context-forge.toml` (not the personal file); `maybe` is rejected and the error lists the allowed values.
  - [x] Add one assertion in `packages/core/tests/schema/` that `resolvePhaseValue('Phase 0: Concept')`, `resolvePhaseValue('0')` and `resolvePhaseValue('phase 1: concept')` (legacy) all equal `CONCEPT_PHASE`.
  - [x] Success: all pass.

- [x] **Task 2: Adoption contracts and state helpers** (effort: 2)
  - [x] Create `packages/core/src/adoption/contracts.ts` per the API Contracts: `BROWNFIELD_ADOPTION_INSTRUCTION`, `AdoptionSelection`, `AdoptionResolver`, and `AdoptionError extends Error` (sets `name`, accepts `ErrorOptions` for `cause`, like `PermissivenessFragmentError`). No imports.
  - [x] Create `packages/core/src/adoption/adoptionState.ts`: re-export `ADOPTION_STATES` and `AdoptionState`; `readAdoptionState(root)` reads `adoption.state` through `new ConfigManager(root).get`; `writeAdoptionState(root, state)` calls `set('adoption.state', state, 'project')`.
  - [x] `readAdoptionState`: a value not in `ADOPTION_STATES` (hand-edited file) throws `AdoptionError` naming the value, the allowed values and `.context-forge.toml`. A TOML parse error propagates unwrapped (D9, malformed file).
  - [x] `writeAdoptionState` does not catch: the resolver owns the D9 write-failure message (Task 9).
  - [x] Create `packages/core/src/adoption/index.ts` re-exporting both files, and re-export it from `packages/core/src/node.ts`.
  - [x] Success: `pnpm -r build` and `pnpm -r typecheck` pass.

- [x] **Task 2T: State helper tests** (effort: 1)
  - [x] Create `packages/core/tests/adoption/adoptionState.test.ts` with temp directories.
  - [x] No `.context-forge.toml` → `''`. Write then read each state → round-trips; the file contains `[adoption]` and `state = "in_progress"`.
  - [x] Hand-written invalid value → `AdoptionError`. Malformed TOML → rejects with the parser's error, not `AdoptionError`.
  - [x] Success: all pass.

- [x] **Task 2C: Commit** — `feat(core): add adoption.state config key and state helpers`

### Detection facts (Development Approach step 2)

- [x] **Task 3: Source-volume walk** (effort: 3)
  - [x] Create `packages/core/src/detection/sourceVolume.ts` exporting `SourceVolume` (`{ files; lines; capped }`) and async `measureSourceVolume(root)`, per D2. Use `fs/promises` only.
  - [x] Constants, each defined once in this file: `SOURCE_EXTENSIONS`, `EXCLUDED_DIRS` (lists verbatim from D2), `MAX_SOURCE_FILE_BYTES` (512 KiB), `MAX_WALK_ENTRIES` (20,000).
  - [x] Create `packages/core/src/adoption/adoptionOutcome.ts` now holding only `BROWNFIELD_MIN_SOURCE_LINES = 2000` (Task 7 adds the rest), and import it here as the stop threshold. It is written nowhere else (D1).
  - [x] Skip directories whose name starts with `.` and directories in `EXCLUDED_DIRS`; skip files over `MAX_SOURCE_FILE_BYTES`; do not follow symlinks (use `readdir` with `withFileTypes` and `lstat`; a symlink is neither walked nor counted).
  - [x] Count non-blank lines (trimmed length > 0) in files whose extension (lowercased, without the dot) is in `SOURCE_EXTENSIONS`. Stop as soon as `lines >= BROWNFIELD_MIN_SOURCE_LINES` → `capped: true`.
  - [x] Count every directory entry visited. Reaching `MAX_WALK_ENTRIES` below the threshold throws `AdoptionError` naming the count and both overrides (`cf config set adoption.state in_progress` / `declined`).
  - [x] ENOENT on any entry (deleted mid-walk) → skip it. Any other error → `AdoptionError` naming the path, the error code and the overrides, with the original error as `cause`.
  - [x] Keep functions under ~50 lines: split directory listing, per-file counting and the walk loop.
  - [x] Success: build passes.

- [x] **Task 3T: Source-volume tests** (effort: 3)
  - [x] Create `packages/core/tests/detection/sourceVolume.test.ts` with temp directories.
  - [x] Extensions: one file per `SOURCE_EXTENSIONS` entry counted (`it.each` over the constant); `.md`, `.json`, `.lock` and `LICENSE` not counted; blank and whitespace-only lines not counted.
  - [x] Exclusions: lines under each `EXCLUDED_DIRS` entry (`it.each`) and under `.git/` and `.hidden/` not counted. `project-documents/` with source files not counted.
  - [x] Size cap: a `.ts` file just over `MAX_SOURCE_FILE_BYTES` not counted.
  - [x] Symlinks: a symlinked directory and a symlinked file pointing at 3000 source lines outside `root` → not counted.
  - [x] Early exit: ten `.ts` files of 1000 lines each → `capped: true`, `files === 2`, `lines === 2000`.
  - [x] Below threshold: three files totalling 900 lines → `{ files: 3, lines: 900, capped: false }`.
  - [x] Entry cap: `MAX_WALK_ENTRIES + 1` empty `.txt` files spread over a few subdirectories → `AdoptionError` whose message names the count and `declined`.
  - [x] Non-ENOENT error: a `chmod 000` subdirectory → `AdoptionError` naming that path and `EACCES` (skip as root/Windows; restore the mode in `afterEach`).
  - [x] Success: all pass.

- [x] **Task 3C: Commit** — `feat(core): add bounded source-volume walk`

- [x] **Task 4: Present-path facts** (effort: 1)
  - [x] Create `packages/core/src/detection/presentPaths.ts` exporting sync `presentPaths(root, candidates)` (returns the candidates present, in candidate order, via `pathPresent`) and the three lists from D5: `DOC_PATHS`, `ADR_DIRS`, `RULE_FILE_PATHS`, verbatim. Do not add them to the `detection/index.ts` barrel (D5: not exported from the package).
  - [x] Success: build passes.

- [x] **Task 4T: Present-path tests** (effort: 1)
  - [x] Create `packages/core/tests/detection/presentPaths.test.ts`: none present → `[]`; a file and a directory candidate both present → both, in candidate order; each entry of each list is found when created (`it.each`); a path under a regular file (`ENOTDIR`) throws.
  - [x] Success: all pass.

- [x] **Task 5: History fact** (effort: 2)
  - [x] Create `packages/core/src/detection/history.ts` exporting `HistoryFact` (`{ kind: 'known'; commits; shallow } | { kind: 'unknown'; reason }`), `HISTORY_GIT_TIMEOUT_MS` (5000) and async `readHistory(root)`, per D5.
  - [x] Two calls through `gitExec` with `{ timeoutMs: HISTORY_GIT_TIMEOUT_MS }`: `rev-list --count HEAD -- .` and `rev-parse --is-shallow-repository`, both run with `root` as the git working directory (check `gitExec`'s signature for how it takes the directory).
  - [x] Any failure of either call (not a repo, no commits, no `git`, timeout) → `{ kind: 'unknown', reason }` where `reason` is the error message (gitExec's timeout message already reads "timed out after 5s"). This catch is a stated fact, not a fallback (D5): add a comment saying so.
  - [x] Export `readHistory`, `HistoryFact`, `measureSourceVolume` and `SourceVolume` from `detection/index.ts`.
  - [x] Success: build passes.

- [x] **Task 5T: History tests** (effort: 2)
  - [x] Create `packages/core/tests/detection/history.test.ts` with temp repos built by `spawnSync('git', ...)` (set `user.name`/`user.email` locally in each repo).
  - [x] Repo with 3 commits → `{ kind: 'known', commits: 3, shallow: false }`.
  - [x] Shallow clone: `git clone --depth 1 file://<source>` (the `file://` form is required for `--depth`) → `shallow: true`, `commits: 1`.
  - [x] Subdirectory scoping: commits touching `packages/app` and others touching `packages/lib`; `readHistory('<repo>/packages/app')` counts only the first set.
  - [x] Non-repo temp dir (assert no `.git` ancestor first) → `unknown` with a non-empty reason. Repo with no commits → `unknown`.
  - [x] Timeout: `vi.mock` the gitExec module so the call rejects with an error whose message is `timed out after 5s` → `unknown`, reason contains `timed out`.
  - [x] Success: all pass.

- [x] **Task 5C: Commit** — `feat(core): add present-path and history detection facts`

- [x] **Task 6: Planning-artifact check** (effort: 2)
  - [x] In `packages/core/src/introspection/ArtifactIntrospector.ts`, extract the initiative-plan regex into an exported `INITIATIVE_PLAN_FILE_PATTERN` used by `resolveInitiativePlanPath`. No behavior change.
  - [x] Create `packages/core/src/detection/planningArtifacts.ts` exporting async `findPlanningArtifacts(root)`, per D6. Read `project-documents/user/project-guides/` and `project-documents/user/architecture/` once each with `readdir`; ENOENT → no entries; any other error throws `AdoptionError` naming the directory and the overrides.
  - [x] Match, case-insensitive: `INITIATIVE_PLAN_FILE_PATTERN` (project-guides only), and `^\d{3}-(arch|hld|slices)\..+\.md$` in both directories. Define the second pattern once as a constant. `000-concept.*` never matches.
  - [x] Return absolute paths, sorted. Export from `detection/index.ts`.
  - [x] Success: build passes; existing `ArtifactIntrospector` tests pass unchanged.

- [x] **Task 6T: Planning-artifact tests** (effort: 2)
  - [x] Create `packages/core/tests/detection/planningArtifacts.test.ts` with temp directories.
  - [x] No `project-documents/` → `[]`. Concept only (`000-concept.x.md`) → `[]`.
  - [x] Each pattern alone found: `001-initiative-plan.x.md` in project-guides; `260-arch.x.md`, `050-hld.x.md`, `140-slices.x.md` in architecture; `100-arch.x.md` in project-guides. Upper-case `260-ARCH.x.MD` found.
  - [x] Non-matching names (`260-slice.x.md`, `260-arch.x.txt`) → `[]`.
  - [x] `project-documents/user/architecture` as a regular file (`ENOTDIR`) → throws `AdoptionError`.
  - [x] Success: all pass.

- [x] **Task 6C: Commit** — `feat(core): add planning-artifact detection`

### Outcome and facts (Development Approach steps 3–4)

- [x] **Task 7: Outcome decision** (effort: 2)
  - [x] In `packages/core/src/adoption/adoptionOutcome.ts` (holds `BROWNFIELD_MIN_SOURCE_LINES` from Task 3), add `AdoptionOutcome` (the union from the API Contracts) and pure `decideOutcome(input)`.
  - [x] Input: `{ state: AdoptionState; artifacts?: string[]; source?: SourceVolume }` (import `SourceVolume` with `import type`, so `adoptionOutcome.ts` and `sourceVolume.ts` don't form a runtime import cycle), so the resolver can read each fact only when needed. Order (D1): `in_progress` → `adoption-in-progress`; `complete`/`declined` → `adoption-closed`; non-empty `artifacts` → `already-planned`; `source.lines >= BROWNFIELD_MIN_SOURCE_LINES` → `brownfield`; else `greenfield`.
  - [x] A missing input that the order needs (state `''` and `artifacts` undefined; or no artifacts and `source` undefined) throws an `Error` naming the missing input. That is a programming error, not a default.
  - [x] Export from `adoption/index.ts`.
  - [x] Success: build passes.

- [x] **Task 7T: Outcome tests** (effort: 1)
  - [x] Create `packages/core/tests/adoption/adoptionOutcome.test.ts`: one case per branch; `in_progress` with artifacts and 0 lines → `adoption-in-progress` (state wins); `declined` with 5000 lines → `adoption-closed`; artifacts with 5000 lines → `already-planned`; exactly 2000 lines → brownfield; 1999 → greenfield; each missing-input case throws.
  - [x] Success: all pass.

- [x] **Task 8: Adoption Facts renderer** (effort: 2)
  - [x] Create `packages/core/src/adoption/adoptionFacts.ts` exporting `renderAdoptionFacts(input)` and `NOT_EVALUATED` (`{ kind: 'not-evaluated' }`, used for the explicit-instruction path, D4).
  - [x] Input: `{ outcome: AdoptionOutcome | typeof NOT_EVALUATED; state; stateSetByBuild: boolean; history; docs; adrs; ruleFiles; ci }`.
  - [x] Output per D8: heading `### Adoption Facts`, then plain bullets in this order: outcome and reason; adoption state (plus, when `stateSetByBuild`, the D8 notice verbatim); source volume (when the outcome carries it; "count stopped at the threshold" when `capped`); history (commits and shallow, or "unknown: {reason}"); docs; ADRs; rule files; CI (its matches); squadron.
  - [x] Empty lists render "none found". State `''` renders as unset.
  - [x] Switch on `outcome.kind` exhaustively (a `never` check), so 263's new kind fails to compile until handled.
  - [x] The squadron bullet comes from its own exported function `renderSquadronFact()` returning the D8 text verbatim (262 replaces it).
  - [x] No guidance text: facts only (D8).
  - [x] Success: build passes.

- [x] **Task 8T: Renderer tests** (effort: 2)
  - [x] Create `packages/core/tests/adoption/adoptionFacts.test.ts`: brownfield (capped) → outcome bullet contains `2000+` and the threshold note; adoption-in-progress; `NOT_EVALUATED` → "not evaluated (explicit brownfield-adoption instruction)"; `stateSetByBuild` true → the notice with `cf config set adoption.state declined`, false → no notice; empty docs/ADRs/rule files/CI → each "none found"; history unknown → the reason; the squadron bullet equals `renderSquadronFact()`.
  - [x] Output starts with `### Adoption Facts`.
  - [x] Success: all pass.

- [x] **Task 8C: Commit** — `feat(core): add adoption outcome decision and facts renderer`

### Resolver and build integration (Development Approach step 5)

- [x] **Task 9: Adoption resolver** (effort: 3)
  - [x] Create `packages/core/src/adoption/adoptionResolver.ts` exporting `AdoptionStateWrites` (`'persist' | 'read-only'`) and `createAdoptionResolver({ stateWrites })` returning an `AdoptionResolver`. This is the only file holding the selection rule (D4) and step order (D7, Data Flow steps 1–6).
  - [x] Step 1: eligible only when `resolvePhaseValue(instruction) === CONCEPT_PHASE` or `instruction === BROWNFIELD_ADOPTION_INSTRUCTION`. Otherwise return `{ selected: false }` before any I/O.
  - [x] Step 2 (concept phase only): `readAdoptionState(checkoutPath)`; if `''`, `findPlanningArtifacts(checkoutPath)`; if none, `measureSourceVolume(checkoutPath)`; then `decideOutcome`. Explicit instruction: skip, outcome `NOT_EVALUATED`, still read the state for the state bullet.
  - [x] Step 3: selected iff outcome is `brownfield` or `adoption-in-progress`, or the instruction is explicit. Switch exhaustively on `kind`.
  - [x] Step 4 (D9): read `resolvePromptFilePath(projectPath)`; require a `brownfield-adoption` key in `ContextProfileParser.parseProfiles(content)` and a non-null `new SystemPromptParser(path).getPromptForInstruction(BROWNFIELD_ADOPTION_INSTRUCTION)`. Missing either → `AdoptionError` with the D9 message verbatim (`profile` or `prompt`, built from `MIN_GUIDE_VERSION`).
  - [x] Step 5: outcome `brownfield` and `stateWrites === 'persist'` → `writeAdoptionState(checkoutPath, 'in_progress')`. A failure → `AdoptionError` naming `.context-forge.toml`, the error, `cf build --it brownfield-adoption` and `cf config set adoption.state declined`, with `cause`.
  - [x] Step 6: gather `readHistory`, `presentPaths` (the three lists), `recognizeCi(checkoutPath)`, then `renderAdoptionFacts` with `stateSetByBuild` true only when step 5 wrote. Return `{ selected: true, instruction: BROWNFIELD_ADOPTION_INSTRUCTION, facts }`.
  - [x] Split each step into its own function so each stays under ~50 lines. Export from `adoption/index.ts`.
  - [x] Success: build passes.

- [x] **Task 9T: Resolver tests** (effort: 3)
  - [x] Create a guide fixture `packages/core/tests/fixtures/brownfield-guide/`: a copy of the `test-project` fixture's `prompt.ai-project.system.md` with a `brownfield-adoption: [fileConcept, fileArch, fileSlicePlan, fileComprehension]` profile line and a short `##### Brownfield Adoption` prompt section added. The existing `test-project` fixture serves as the guide without the profile. Tests copy the prompt file into temp project dirs at `PROMPT_FILE_RELATIVE_PATH`.
  - [x] Create `packages/core/tests/adoption/adoptionResolver.test.ts`. Selection table (D4), one case each: `Phase 2: Architecture` on an `in_progress` project → not selected and no fs access (spy or a non-existent `checkoutPath`); concept + empty repo → not selected, state unchanged; concept + 2000 lines → selected, state `in_progress`, facts contain the notice; concept + `in_progress` + arch present → selected, no write, no notice; concept + `declined` + 5000 lines → not selected; concept + planned + 5000 lines → not selected and the walk never runs (spy on `measureSourceVolume`).
  - [x] Explicit `brownfield-adoption` on an empty repo with state `''`: selected, "not evaluated" in facts, state still `''`, no walk.
  - [x] `read-only` + brownfield → selected, state still `''`, no notice.
  - [x] Guide without the profile (and, separately, with the profile but no prompt) → `AdoptionError` naming `profile` / `prompt`, and state still `''` (check before write).
  - [x] Write failure: `.context-forge.toml` as a read-only file (`chmod 444`, skip as root/Windows) → `AdoptionError` naming `.context-forge.toml` and `--it brownfield-adoption`.
  - [x] Success: all pass.

- [x] **Task 9C: Commit** — `feat(core): add build-time adoption resolver`

- [x] **Task 10: Integrator and template engine** (effort: 2)
  - [x] In `ContextIntegrator.ts`, import `AdoptionResolver` and `AdoptionError` from `../adoption/contracts.js`. Add a seventh optional constructor parameter `resolveAdoptionFn: AdoptionResolver | null = null` and its JSDoc line.
  - [x] In `generateWithTemplateEngine`, compute `checkoutPath` before `mapProjectToEnhancedContext` (move the existing two lines up). When the resolver and `project.projectPath` are set, call it with `(project.projectPath, checkoutPath, instruction)`, where `instruction` is the value mapping already uses (`project.instruction || 'implementation'`, held in one local). When selected, map `{ ...project, instruction: selection.instruction }` and set `enhancedData.adoptionFacts = selection.facts`.
  - [x] In `generateContextFromProject`, rethrow `AdoptionError` beside `PermissivenessFragmentError`, with a one-line comment.
  - [x] Add `adoptionFacts?: string` to `EnhancedContextData`.
  - [x] In `ContextTemplateEngine.ts`, add an order 3.4 section (key `adoptionFacts`) when `adoptionFacts?.trim()`, following the 3.5 permissiveness block. The facts carry their own heading.
  - [x] Success: build passes; existing integrator and engine tests pass unchanged.

- [x] **Task 10T: Integrator and engine tests** (effort: 2)
  - [x] In `packages/core/tests/services/ContextIntegrator.test.ts`, with a stub resolver: selected → the brownfield prompt is used, `adoptionFacts` set, profile filtering uses `brownfield-adoption`; not selected → output identical to an integrator built without a resolver; stub throws `AdoptionError` → rejects; stub throws a plain `Error` → error stub returned, as today.
  - [x] In `ContextTemplateEngine.test.ts`: facts appear after the instruction prompt and before the permissiveness fragment; absent facts → no section.
  - [x] Success: all pass.

- [x] **Task 11: Pipeline option and callers** (effort: 2)
  - [x] Change `createContextPipeline(projectPath, options: { adoptionStateWrites: AdoptionStateWrites })` (required) and pass `createAdoptionResolver({ stateWrites })` as the seventh integrator argument.
  - [x] `packages/cli/src/commands/build.ts` → `persist`.
  - [x] `packages/mcp-server/src/tools/contextTools.ts`: `generateContext` gains a required `adoptionStateWrites` parameter passed to the pipeline; `context_build` passes `persist`, `template_preview` passes `read-only`.
  - [x] Update every test caller found by `grep -rn "createContextPipeline(" packages/*/tests` to pass `{ adoptionStateWrites: 'read-only' }`. Update `build.test.ts`'s `toHaveBeenCalledWith('/tmp/test')` to expect `persist`. Do not touch `packages/electron/out/` (Special Considerations).
  - [x] Add `contextTools.test.ts` assertions that `context_build` passes `persist` and `template_preview` passes `read-only` to the mocked pipeline.
  - [x] Success: `pnpm -r build`, `pnpm -r typecheck` and `pnpm -r test` pass.

- [x] **Task 11C: Commit** — `feat: select brownfield-adoption prompt in cf build and context_build`

### Integration, parity and docs (Development Approach step 6)

- [x] **Task 12: Integration fixtures** (effort: 3)
  - [x] In `packages/core/tests/services/CoreServiceFactory.test.ts` (or `pipeline-integration.test.ts`), build each fixture in a temp dir with the brownfield guide fixture, through `createContextPipeline(dir, { adoptionStateWrites: 'persist' })` and instruction `Phase 0: Concept` unless stated. Write a small helper to create N lines of `.ts` source.
  - [x] Expectations (Success Criteria, Functional Requirements):
    1. Empty → concept prompt, no `### Adoption Facts`, state `''`.
    2. Scaffold-only (≈200 source lines, `package.json`, a lockfile, README, LICENSE) → same as empty.
    3. Brownfield (2000+ lines, no planning docs) → brownfield prompt and facts; state `in_progress`.
    4. Shallow clone of fixture 3 (committed, cloned with `--depth 1 file://`) → brownfield; facts report shallow.
    5. Monorepo: `.git` and `.github/workflows/ci.yml` at the repo root, 3000 lines in `packages/lib`, 100 in `packages/app`; project at `packages/app` → concept prompt. With 3000 lines moved into `packages/app` → brownfield, and facts list the root CI file.
    6. Concept only + 2000 lines → brownfield.
    7. Planned (an `nnn-arch` file) + 5000 lines → concept prompt.
    8. Resume: state `in_progress`, concept and arch present → brownfield prompt.
    9. Overrides: `declined` + 5000 lines → concept prompt; `in_progress` on an empty repo → brownfield. Re-detect: set `declined` on a 2000+ line repo, then `""`, then build → brownfield, and the state becomes `in_progress`.
    10. `Phase 2: Architecture` with state `in_progress` → the Phase 2 prompt, no facts.
    11. Explicit `brownfield-adoption` on an empty repo → brownfield prompt, "not evaluated", state `''`.
    12. Brownfield repo with the `test-project` guide (no profile) → rejects with `AdoptionError`; state `''`.
    13. `template_preview` path: brownfield repo with state `''` through `createContextPipeline(dir, { adoptionStateWrites: 'read-only' })` → brownfield prompt and facts; state still `''` afterward.
  - [x] Success: all pass.

- [x] **Task 13: CLI/MCP parity test** (effort: 2)
  - [x] In `packages/mcp-server/tests/integration/` (MCP depends on core, so it can call both paths), build a brownfield temp fixture twice from identical copies: once through `createContextPipeline(dir, { adoptionStateWrites: 'persist' })` + `generateContextFromProject` (the `cf build` path), once through `generateContext(..., 'persist')` with a registered project (follow how `mcpIntegration.test.ts` registers projects). Assert identical prompt strings.
  - [x] Success: passes.

- [x] **Task 13C: Commit** — `test: add adoption integration fixtures and CLI/MCP parity test`

- [x] **Task 14: README** (effort: 1)
  - [x] Add one row for `adoption.state` (shared) to the config key table near `workflow.permissiveness`: what it does, set automatically on first brownfield detection, `declined` / `in_progress` to override, `""` to re-detect.
  - [x] Success: no other README sections change.

- [x] **Task 14C: Commit** — `docs: document adoption.state in README`

- [x] **Task 15: Full verification and walkthrough** (effort: 3)
  - [x] Run format, lint, `pnpm -r typecheck`, `pnpm -r build`, `pnpm -r test`. All pass.
  - [x] Every new source file is under ~300 lines (`wc -l`); `ContextIntegrator.ts` grew only by the resolver wiring.
  - [x] Walkthrough step 1 (planned project unchanged): build `/tmp/before.md` from `main` (a temporary `git worktree add` of `main`, built there) and `/tmp/after.md` from the slice branch; `diff` shows no differences. Remove the temporary worktree afterward.
  - [x] Walkthrough steps 2–4 with the local build against a real public codebase over 2000 lines, cloned `--depth 1` to `/tmp/bf`, with guide v0.22.2+ installed by `cfl init`. Each matches its expected output.
  - [x] Step 2 live run (pre-authorized): `claude -p "/cf:build"` in `/tmp/bf`. Record whether the agent states it is taking the CF-only path and begins the baseline concept without a squadron step.
  - [x] Step 5: `context_build` output vs `cfl build` and `template_preview` leaving the state unset, through an MCP client (`claude -p` with the local MCP server configured). If no client can run headless, write a `BLOCKED:` line naming it; Task 13 covers parity.
  - [x] Record each step's outcome under this task. Any defect is fixed in its own commit typed by what it is (`fix:`, `feat:`, `test:`).
  - Outcomes (20261021, local build; the walkthrough in the slice design carries the exact commands):
    - Automated: `pnpm lint`, `pnpm -r typecheck`, `pnpm -r build` and `pnpm -r test` pass (core 1959, mcp-server 240, cli 866). New source files are 5-137 lines; `ContextIntegrator.ts` grew 377 → 397 (resolver wiring only).
    - Step 1: `build --json` from `main` (temporary worktree, removed) and from the slice branch are byte-identical (6200 bytes). Plain `cf build` prints only a summary, so the comparison uses `--json`; the walkthrough now says so.
    - Steps 2-3: `expressjs/express` (depth 1) → brownfield, 2246+ lines, state `in_progress` (source `project`), facts as expected. `declined` → 0 Adoption Facts; `maybe` rejected with the allowed values; `in_progress` → 1.
    - Step 2 live run: `claude -p "/cf:build"` in `/tmp/bf` with a `cf` shim for the local build on PATH (the global `cf` is the published package). The agent stated "CF-only path", began reading the repo for the baseline concept, and tried no squadron step.
    - Step 4: removing the `brownfield-adoption` profile line → exit 1 with the D9 message; state still empty.
    - Step 5: a headless MCP SDK client: `template_preview` leaves the state empty; `context_build` text equals `cf build --json` exactly (8180 characters). Not BLOCKED.
    - No defects found. Deviations from the plan: the Task 12 fixtures are in `tests/adoption/adoptionBuild.integration.test.ts` rather than `CoreServiceFactory.test.ts`; the Task 13 parity test builds on one checkout and resets the state between runs, because the history fact embeds the checkout path.
  - [x] Success: all automated checks pass and each walkthrough step's outcome or `BLOCKED:` line is recorded.

- [x] **Task 15C: Commit** — `docs: record slice 261 verification walkthrough`

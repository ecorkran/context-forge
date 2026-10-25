---
docType: tasks
slice: pure-cf-build
project: context-forge
lld: user/slices/268-slice.pure-cf-build.md
dependencies: []
projectState: main after slices 260-267 (built and merged). Build-time adoption lives
  in `packages/core/src/adoption/` (`adoptionResolver.ts`, `adoptionFacts.ts`, `adoptionCompletion.ts`)
  and `detection/squadronProbe.ts`, wired through `createContextPipeline(projectPath,
  options)` in `services/CoreServiceFactory.ts`. `AdoptionStateWrites` is defined
  in `adoptionResolver.ts`; `BROWNFIELD_ADOPTION_INSTRUCTION`, `SquadronProbe`, `AdoptionSelection`,
  `AdoptionResolver` and `AdoptionError` in `adoption/contracts.ts`. Callers are `cli/src/commands/build.ts`
  and `mcp-server/src/tools/contextTools.ts`. Global `cf` is the published npm package,
  not the local build.
dateCreated: 20261025
dateUpdated: 20261025
status: complete
turns: 46
promptTokens: 2532555
cachedTokens: 2442436
cacheWriteTokens: 90049
completionTokens: 26645
durationSeconds: 301.5
costUsd: 1.74234
usageRounds: 3
pricedRounds: 3
usageByModel:
  claude-opus-5-5:
    rounds: 3
    costUsd: 1.7423405000000003
    completionTokens: 26645
revision_number: 2
---

## Context Summary

- Slice 268 removes brownfield adoption from the build. After it, `cf build`, `context_build` and `template_preview` assemble context and write nothing in every phase. They do not read or write `adoption.state`, run detection, or spawn `sq`. Phase 0 always resolves to the concept prompt.
- The slice design (`user/slices/268-slice.pure-cf-build.md`) is the spec. D1–D6, the Migration Plan, Success Criteria and the Verification Walkthrough are referenced below by name. Read the named section before each task.
- Kept (do not delete): `AdoptionError` (`adoption/contracts.ts`), `readAdoptionState`, `decideOutcome`, `BROWNFIELD_MIN_SOURCE_LINES`, all `detection/` modules except `squadronProbe.ts`, `COMPREHENSION_PROFILE_VARIABLE`/`findComprehensionAnalysis`, `core/tests/helpers/adoptionFixtures.ts`, and the `core/tests/fixtures/brownfield-guide` fixture. `history`, `comprehensionAnalysis` and `adoptionOutcome` have no production consumer after the cut. They are retained for 269/271 on purpose.
- Excluded (design): `adoption.state` semantics and its config key description (269), `adoptionNavigation.ts` and its "run `cf build`" text (270), the detection report and prompt delivery (271), README/reference docs, the guide prompt and `MIN_GUIDE_VERSION` (272). `checkGuideMinimum` and the guide warning stay unchanged. If you find something outside scope, file an issue and continue.
- Local build: run `pnpm -r build`, then test with `node packages/cli/dist/index.js`. Tests run per package with `pnpm --filter @context-forge/{core|cli|mcp} test`. Root `pnpm lint` and `pnpm typecheck` cover the workspace. There is no format script; ESLint is the formatter gate.
- Conventions: every compared value in new tests (marker filename, fixture text, placeholder tokens) is one constant at the top of the test file. No silent fallbacks. No `any`.
- Branch: `268-slice.pure-cf-build`, forked from the target. This file has no merge or push task; Phase 7 merges after code review.
- Next planned slice: 269 (`adoption.state` rework). It needs no build-path changes after this slice.

---

## Tasks

### 1. Branch setup

- [x] **1.1 Create the slice branch** — effort 1
  - [x] Run `pwd` and confirm it is the repo root. Run `cf config get git.integration_branch`. Its value, or `main` when empty, is the target
  - [x] Run `git status --short`. The only change it may list is this task file, from checking off items. That change carries over to the new branch and is committed with 2.3. Anything else: stop and commit or report it first
  - [x] Confirm you are on the target, then `git checkout -b 268-slice.pure-cf-build {target}`. If the branch already exists, switch to it
  - [x] **Success:** `git branch --show-current` prints `268-slice.pure-cf-build`

---

### 2. Golden capture on the current code (D6)

This section runs **before any source edit**. A golden file captured after an edit proves nothing.

- [x] **2.1 Create the golden fixture projects** — effort 2
  - [x] Under `packages/core/tests/fixtures/pure-build-golden/`, create two project directories, `greenfield/` and `planned/`. Each holds the guide prompt at `PROMPT_FILE_RELATIVE_PATH`, copied from `core/tests/fixtures/brownfield-guide`, so the Concept section and the context profiles are present
  - [x] `greenfield/`: no `project-documents/user/` artifacts and no source files
  - [x] `planned/`: add a minimal architecture file and a slice plan under `project-documents/user/architecture/`, with frontmatter that follows `file-naming-conventions.md`
  - [x] **Success:** both directories exist. Neither contains a `.context-forge.toml`

- [x] **2.2 Write the golden test and capture the outputs** — effort 3
  - [x] Create `packages/core/tests/pure-build-golden.test.ts`. It uses the same setup as `pipeline-integration.test.ts`: a temp `CONTEXT_FORGE_DATA_DIR`, a pre-seeded empty `projects.json` and a `FileProjectStore`
  - [x] Case 1, greenfield at Phase 0: create a project pointing at `greenfield/` with the Phase 0 / concept instruction (see `CONCEPT_PHASE` and how `adoptionParity.test.ts` sets up a Phase 0 build)
  - [x] Case 2, planned at Phase 4: create a project pointing at `planned/` with instruction `design` (a section present in the fixture prompt), `fileArch` and `fileSlicePlan` set, and a `fileSlice` name
  - [x] Pin every time-dependent input. Set `dateProject` explicitly, because `ContextIntegrator` falls back to today's date. If the output contains an absolute path or another machine-specific value, replace it with one placeholder constant before writing or comparing
  - [x] Generate each output with `createContextPipeline` and `generateContextFromProject`, exactly as the current code does (pass `{ adoptionStateWrites: 'read-only' }` for now). Write the outputs once to `pure-build-golden/greenfield.golden.md` and `pure-build-golden/planned.golden.md`, then make the test compare against those files. Capture by a one-time run of the test with a write step. Remove the write step before committing. Never hand-edit a golden file
  - [x] Run the test twice. **Success:** both runs pass, and `git status` shows the golden files unchanged after the second run
  - [x] **Success:** `pnpm --filter @context-forge/core test pure-build-golden` passes on unmodified source

- [x] **2.3 Commit** — `test: add pure-build golden outputs captured before the cut`

---

### 3. Remove the pipeline seam (D1, D4)

The section commits once, at 3.7. 3.1–3.2 stop rendering fields the resolver still fills, so tests outside the two touched files (`pipeline-integration`, `adoptionBuild.integration`) fail until 3.3 and 4.1 change or delete them. 3.3–3.6 change the `createContextPipeline` signature and its two callers, which cannot compile apart. Run only each task's targeted tests until 3.7.

`cli` and `mcp-server` typecheck against core's built `dist/`, not its source. After 3.4, run `pnpm --filter @context-forge/core build` before 3.5. After that build, both `cli` and `mcp-server` fail typecheck. 3.5 fixes `cli`, and 3.6 fixes `mcp-server`.

- [x] **3.1 `SectionBuilder`: remove the `Comprehension:` line** — effort 1
  - [x] In `core/src/services/SectionBuilder.ts`, delete the code that renders `Comprehension:` from `fileComprehension`
  - [x] In `core/tests/services/SectionBuilder.test.ts`, delete the two `Comprehension` cases (the "puts Comprehension right after Slice Plan" case and the `it.each` "omits Comprehension" case)
  - [x] **Success:** `pnpm --filter @context-forge/core test SectionBuilder` passes

- [x] **3.2 `ContextTemplateEngine`: remove the Adoption Facts section** — effort 1
  - [x] In `core/src/services/ContextTemplateEngine.ts`, delete section 3.4 (Adoption Facts) and its comment
  - [x] In `core/tests/services/ContextTemplateEngine.test.ts`, delete the cases that assert the section renders or is placed
  - [x] **Success:** `pnpm --filter @context-forge/core test ContextTemplateEngine` passes

- [x] **3.3 `ContextIntegrator` and `CoreServiceFactory`: remove the adoption hook** — effort 2
  - [x] `ContextIntegrator.ts`: remove the `resolveAdoptionFn` constructor parameter, the instruction swap, the `AdoptionError` rethrow, and the code that sets `adoptionFacts`/`fileComprehension`. Remove every import from `adoption/` and `detection/`
  - [x] `CoreServiceFactory.ts`: change the signature to `createContextPipeline(projectPath)`. Remove the `options` parameter and its JSDoc, `createAdoptionResolver`, `runSquadronProbe`, and their imports
  - [x] Tests: in `ContextIntegrator.test.ts`, delete the resolver, swap and rethrow cases (including the `BROWNFIELD_ADOPTION_INSTRUCTION` cases). In `CoreServiceFactory.test.ts`, delete the options and adoption-wiring cases. Update the remaining calls to `createContextPipeline(path)`
  - [x] `core/tests/pipeline-integration.test.ts`: change every call to `createContextPipeline(path)`. Delete the brownfield, probe and state-write cases (the `probeReturning` block and the `ProbeOutcome`/`SquadronProbe` imports). Brownfield behavior is covered again in section 5
  - [x] Delete `core/tests/adoption/adoptionBuild.integration.test.ts`. It drives the resolver through `createContextPipeline(dir, options)`, so it cannot survive the signature change
  - [x] `core/tests/pure-build-golden.test.ts`: change the call to `createContextPipeline(path)`. Do not touch the golden files
  - [x] **Success:** `grep -rn "adoption/\|detection/" packages/core/src/services` prints nothing
  - [x] **Success:** `pnpm --filter @context-forge/core test ContextIntegrator CoreServiceFactory pipeline-integration pure-build-golden` passes

- [x] **3.4 `EnhancedContextData`: remove the fields** — effort 1
  - [x] In `core/src/types/context.ts`, delete `adoptionFacts` and `fileComprehension` and their comments
  - [x] Remove any remaining references in core tests and helpers (for example `createTestEnhancedContextData` callers)
  - [x] **Success:** `pnpm --filter @context-forge/core typecheck` passes
  - [x] Run `pnpm --filter @context-forge/core build` so `cli` and `mcp-server` see the new signature

- [x] **3.5 CLI: `build.ts`** — effort 1
  - [x] In `cli/src/commands/build.ts`, call `createContextPipeline(workingCopy.projectPath!)` with no second argument. Leave the `checkGuideMinimum` stderr warning as it is
  - [x] In `cli/tests/commands/build.test.ts` and `cli/tests/integration/build.integration.test.ts`, delete the `adoptionStateWrites`/adoption assertions and update mocks or expectations to the one-argument call. Keep the guide-warning-on-stderr assertions
  - [x] **Success:** `pnpm --filter @context-forge/cli test` and `pnpm --filter @context-forge/cli typecheck` pass

- [x] **3.6 MCP: `contextTools.ts`** — effort 2
  - [x] Remove the `adoptionStateWrites` parameter from `generateContext` and update both callers (`context_build` and `template_preview`). Delete the `template_preview` comment about not writing `adoption.state`
  - [x] Remove the `ContextToolOptions` type and the `options` parameter from `registerContextTools`, along with the `AdoptionStateWrites`/`SquadronProbe` imports. Update its caller in the server setup
  - [x] `mcp-server/tests/helpers/integrationSetup.ts`: drop the `squadronProbe` option and its doc comment
  - [x] Delete `mcp-server/tests/integration/adoptionParity.test.ts`. It asserts the removed behavior, and section 5 replaces it
  - [x] `mcp-server/tests/contextTools.test.ts`: delete the adoption and probe cases. Keep the `guideWarning` cases, which check that the warning is returned separately from the context
  - [x] **Success:** `pnpm --filter @context-forge/mcp test` and `pnpm --filter @context-forge/mcp typecheck` pass

- [x] **3.7 Verify and commit the seam removal** — effort 1
  - [x] Run `pnpm -r build`, `pnpm typecheck`, `pnpm lint`, and `pnpm -r test`
  - [x] **Success:** all four pass. `pure-build-golden` passes with the golden files unchanged (`git diff --stat` shows no change under `pure-build-golden/`)
  - [x] Commit: `refactor: remove adoption hook from the build pipeline` (3.1–3.6)

---

### 4. Delete build-only adoption code (D3, Migration Plan)

Each task leaves the workspace compiling and commits on its own.

- [x] **4.1 Delete the resolver, facts and completion modules** — effort 2
  - [x] Delete `core/src/adoption/adoptionResolver.ts`, `adoptionFacts.ts`, `adoptionCompletion.ts`
  - [x] Delete `core/tests/adoption/adoptionResolver.test.ts`, `adoptionFacts.test.ts`, `adoptionCompletion.test.ts` (`adoptionBuild.integration.test.ts` went in 3.3)
  - [x] Drop their re-exports from `core/src/adoption/index.ts`
  - [x] `core/tests/docs-map/outOfTreeLinks.test.ts`: rewrite the "261's adoption outcome" case so it calls the kept functions directly (`findPlanningArtifacts`, `measureSourceVolume`, `decideOutcome`) and asserts the same outcome. Remove the `createAdoptionResolver` and `SquadronProbe` imports
  - [x] **Success:** `pnpm --filter @context-forge/core typecheck` and `pnpm --filter @context-forge/core test` pass
  - [x] Commit: `refactor: delete build-time adoption resolver, facts and completion`

- [x] **4.2 Trim `adoption/contracts.ts` to `AdoptionError`** — effort 1
  - [x] Delete `BROWNFIELD_ADOPTION_INSTRUCTION`, `SquadronProbe`, `AdoptionSelection`, `AdoptionResolver`, and the `ProbeOutcome` import
  - [x] Rewrite the file header to say what the file holds now: the error that kept detection modules throw. It is no longer a contract with the integrator. Update the `AdoptionError` JSDoc too. It must no longer say the build rethrows it, and it must not list causes that were removed (guide profile, state write)
  - [x] In `core/src/node.ts`, change the adoption export comment so it no longer mentions the build resolver. It should describe what remains: state read, outcome and `AdoptionError`
  - [x] **Success:** `pnpm typecheck` and `pnpm lint` pass. `grep -rnw "BROWNFIELD_ADOPTION_INSTRUCTION\|AdoptionSelection\|AdoptionResolver\|SquadronProbe" packages/*/src packages/*/tests` prints nothing. The compiler does not flag an unused export, so this grep is the check that each name is gone
  - [x] Commit: `refactor: reduce adoption contracts to AdoptionError`

- [x] **4.3 Delete `writeAdoptionState` and the `adoption-completed` variant** — effort 1
  - [x] In `core/src/adoption/adoptionState.ts`, delete `writeAdoptionState` and any imports only it used. Keep `readAdoptionState` and the `ADOPTION_STATES` re-export
  - [x] In `core/tests/adoption/adoptionState.test.ts`, delete the write cases and keep the read cases
  - [x] In `core/src/adoption/adoptionOutcome.ts`, delete the `adoption-completed` member and its comment
  - [x] In `core/tests/adoption/adoptionOutcome.test.ts`, remove any case or exhaustiveness entry that names it. If there is none, the file needs no change
  - [x] **Success:** `pnpm typecheck` passes (any leftover `switch` on `kind` fails to compile) and `pnpm --filter @context-forge/core test adoption` passes. `grep -rn "writeAdoptionState\|adoption-completed" packages/*/src packages/*/tests` prints nothing
  - [x] Commit: `refactor: remove adoption.state writer and adoption-completed outcome`

- [x] **4.4 Delete the squadron probe (D3)** — effort 1
  - [x] Delete `core/src/detection/squadronProbe.ts`, and remove its whole `export { … } from './squadronProbe.js'` block from `core/src/detection/index.ts`: `runSquadronProbe`, `classifyProbeRun`, `SQUADRON_PROBE_COMMAND`, `SUPPORTED_PROBE_VERSION`, `SQUADRON_PROBE_TIMEOUT_MS`, `SQUADRON_PROBE_MAX_BUFFER_BYTES`, `ProbeRun`, `ProbeOutcome`, `ProbeUnavailableReason`
  - [x] Delete `core/tests/detection/squadronProbe.test.ts`, `squadronProbe.contract.test.ts`, and the `core/tests/fixtures/squadron-probe/` directory
  - [x] **Success:** `pnpm typecheck` and `pnpm --filter @context-forge/core test` pass. `grep -rni "squadronProbe\|SQUADRON_PROBE\|classifyProbeRun\|SUPPORTED_PROBE_VERSION\|ProbeRun\|ProbeOutcome\|ProbeUnavailableReason" packages/*/src packages/*/tests` prints nothing
  - [x] Commit: `refactor: delete squadron probe`

---

### 5. Purity test (D5)

- [x] **5.1 Create the purity test** — effort 3
  - [x] Create `mcp-server/tests/integration/pureBuild.test.ts`. Reuse the `createBrownfieldCheckout` pattern from the test deleted in 3.6. Read it with `git show {target}:packages/mcp-server/tests/integration/adoptionParity.test.ts`. Its steps: copy `fixtures/integration-project`, install the `core/tests/fixtures/brownfield-guide` prompt, write a source file with at least `BROWNFIELD_MIN_SOURCE_LINES` non-blank lines, and add a comprehension analysis document. Do not create any planning artifacts
  - [x] Fake `sq`: in `beforeAll`, write an executable `sq` script into a temp bin directory. When run, it creates a marker file at a path held in a constant. Prepend the bin directory to `process.env.PATH` for this test process only, and restore `PATH` in `afterAll`. The MCP tools run in-process, so they inherit it. The test must never depend on whether the machine has a real `sq`
  - [x] Snapshot helper: before each run, record the sorted relative file list of the checkout and the bytes of `.context-forge.toml` (or record that it is absent). After the run, assert both are unchanged. A file that was absent must still be absent
  - [x] CLI path (pipeline plus integrator, as `build.ts` does it): run once with no `.context-forge.toml`, then once with `adoption.state = "in_progress"`
  - [x] MCP: run `context_build` once and `template_preview` once, on the `in_progress` state
  - [x] Every run asserts three things: the snapshot is unchanged, the output contains the fixture's concept prompt text and not `### Adoption Facts`, and the `sq` marker does not exist
  - [x] Parity check, run once: the CLI and MCP `context_build` outputs are equal
  - [x] Explicit-key check, run once: a build with instruction `brownfield-adoption` contains the `brownfield-guide` fixture's Brownfield Adoption prompt text, with no `Comprehension:` line and no `### Adoption Facts`. Assert on fixture text held in a constant, never on the installed guide
  - [x] **Success:** `pnpm --filter @context-forge/mcp test pureBuild` passes
  - [x] **Success:** the test fails when run against code that writes state. To check, temporarily add a `writeFileSync` of `.context-forge.toml` in the CLI path of the test, confirm the snapshot assertion fails, then revert the change
  - [x] Commit: `test: add pure build purity test across CLI and MCP`

---

### 6. Final validation

- [x] **6.1 Full pass** — effort 1
  - [x] Run `pnpm -r build`, `pnpm typecheck`, `pnpm lint`, `pnpm -r test`
  - [x] **Success:** all pass. `git diff {target} --stat -- packages/core/tests/fixtures/pure-build-golden/` lists only the files added in 2.1–2.2, and no golden file differs from the 2.3 commit
  - [x] **Success (guide warning):** these two existing tests still exist and pass: `cli/tests/commands/build.test.ts` "writes the warning to stderr and leaves stdout as the unchanged prompt", and `mcp-server/tests/contextTools.test.ts` "returns the guide-minimum warning as a second text item after an unchanged prompt". 3.5 and 3.6 may change their setup or mocks to the one-argument call. In `git diff {target} -- <file>`, though, no `expect` line about the warning may have changed

- [x] **6.2 Code-gone and import checks** — effort 1
  - [x] `grep -rn "resolveAdoptionFn\|adoptionFacts\|runSquadronProbe\|writeAdoptionState\|fileComprehension\|adoptionStateWrites\|ContextToolOptions" packages/*/src` prints nothing. The exception is `COMPREHENSION_PROFILE_VARIABLE = 'fileComprehension'` in `detection/comprehensionAnalysis.ts`, which is kept (D4)
  - [x] `grep -rn "adoption/\|detection/" packages/core/src/services` prints nothing
  - [x] Export audit: list every `export` line in `core/src/adoption/index.ts` and `core/src/detection/index.ts`. Expected source modules: `pathPresent`, `presentPaths`, `sourceVolume`, `ciDetection`, `buildManifest`, `planningArtifacts`, `history`, `comprehensionAnalysis`, `adoptionOutcome`, `adoptionState` (`readAdoptionState`, `ADOPTION_STATES`) and `contracts` (`AdoptionError`). Any export from another module is a removal candidate. Remove it if `grep -rnw <symbol> packages/*/src` finds no use outside its own module and the index files
  - [x] **Success:** all three checks are clean

- [x] **6.3 Verification Walkthrough** — effort 2
  - [x] Run steps 1–5 of the design's Verification Walkthrough using `node packages/cli/dist/index.js` in a scratch brownfield repo under `/tmp`. Reset `adoption.state` afterwards as step 2 describes
  - [x] **Success:** the `.context-forge.toml` hash is unchanged (or the file is still absent), `Adoption Facts` appears 0 times, the output is the concept prompt, a stored `in_progress` is ignored and left in place, and the `MIN_GUIDE_VERSION` warning (when it applies) still goes to stderr
  - [x] If 6.2 or 6.3 required changes, commit them: `refactor: remove remaining build-only adoption exports`. Otherwise nothing to commit. Result: nothing to commit.

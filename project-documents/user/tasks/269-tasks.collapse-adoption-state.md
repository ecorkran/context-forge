---
docType: tasks
slice: collapse-adoption-state
project: context-forge
lld: user/slices/269-slice.collapse-adoption-state.md
dependencies:
- pure-cf-build
projectState: main after slice 268 (pure cf build, merged). No build path reads or
  writes `adoption.state`. `adoption.state` still has four enum values in `config/ConfigKeys.ts`
  and is read by `readAdoptionState` (`adoption/adoptionState.ts`). `decideOutcome`
  (`adoption/adoptionOutcome.ts`) still branches on stored state. `cf next` / `workflow_next`
  route adoption through `introspection/adoptionNavigation.ts` and `WorkflowNavigator.routeAdoption`.
  `OVERRIDE_REMEDY` is defined twice, in `detection/sourceVolume.ts` and `detection/planningArtifacts.ts`,
  and both name `in_progress`. Global `cf` is the published npm package, not the local
  build.
dateCreated: 20261025
dateUpdated: 20261025
status: complete
turns: 26
promptTokens: 1423165
cachedTokens: 1342298
cacheWriteTokens: 80825
completionTokens: 21776
durationSeconds: 245.1
costUsd: 1.35103
usageRounds: 2
pricedRounds: 2
usageByModel:
  claude-opus-5-5:
    rounds: 2
    costUsd: 1.3510299
    completionTokens: 21776
revision_number: 1
---

## Context Summary

- Slice 269 derives adoption progress from the project's files on every read and keeps one stored value, the opt-out `adoption.state = "declined"`. Stored `in_progress` and `complete` are ignored with a notice, never an error. It also carries the former slice 270: the per-step adoption guidance in `cf next` is deleted and replaced by two one-line warnings.
- The slice design (`user/slices/269-slice.collapse-adoption-state.md`) is the spec. D1–D6, the Migration Plan, Success Criteria and the Verification Walkthrough are referenced below by name. Read the named section before each task. Line texts and the notice text are in D1, D3 and D6; copy them from there, do not retype them from memory.
- Order: new pieces are added first (shared constants, planning facts, stage/outcome, opt-out reader, navigation lines), then navigation is cut over and the old module deleted, then the config enum shrinks. Every commit leaves format, lint, typecheck and tests passing.
- Excluded (design): the detection report command, its MCP tool and `cf init`'s line (271); the README adoption section, `packages/cli/README.md` rows for `cf next`/`cf build`, and the guide prompt (272); the retroactive marker and its checker rules. If you find something outside scope, file an issue and continue.
- Local build: run `pnpm -r build`, then test with `node packages/cli/dist/index.js`. Tests run per package with `pnpm --filter @context-forge/{core|cli|mcp} test [pattern]`. Root `pnpm lint` and `pnpm typecheck` cover the workspace. There is no format script; ESLint is the formatter gate.
- Conventions: every literal value is defined once (design, Patterns and Conventions). In tests, every compared value (file names, fixture text, expected lines) is a constant at the top of the file or imported from the source module. No silent fallbacks. No `any`.
- Branch: `269-slice.collapse-adoption-state`, forked from the target. This file has no merge or push task; Phase 7 merges after code review.
- Next planned slice: 271 (adoption primitives for `sq onboard`). It consumes `readAdoptionOptOut`, `readPlanningFacts`, `decideStage`, `decideOutcome` and `legacyAdoptionStateNotice` from this slice.

---

## Tasks

### 1. Branch setup

- [x] **1.1 Create the slice branch** — effort 1
  - [x] Run `pwd` and confirm it is the repo root. Run `cf config get git.integration_branch`. Its value, or `main` when empty, is the target
  - [x] Run `git status --short`. The only change it may list is this task file. That change carries over to the new branch and is committed with 2.3. Anything else: stop and commit or report it first
  - [x] Confirm you are on the target, then `git checkout -b 269-slice.collapse-adoption-state {target}`. If the branch already exists, switch to it
  - [x] **Success:** `git branch --show-current` prints `269-slice.collapse-adoption-state`

---

### 2. Shared constants (Migration Plan "Code removed", D4)

- [x] **2.1 Move `OVERRIDE_REMEDY` to `adoption/contracts.ts`** — effort 1
  - [x] Add an exported `OVERRIDE_REMEDY` beside `AdoptionError` in `packages/core/src/adoption/contracts.ts`, with the text from the Migration Plan ("To treat the project as new and skip detection: …")
  - [x] Delete the local `OVERRIDE_REMEDY` from `detection/sourceVolume.ts` and `detection/planningArtifacts.ts`. Import the shared one in both
  - [x] Update any assertion in `tests/detection/sourceVolume.test.ts` and `tests/detection/planningArtifacts.test.ts` that matches the old `in_progress` remedy text. Assert against the imported `OVERRIDE_REMEDY`, not a retyped string
  - [x] **Success:** `grep -n "in_progress" packages/core/src/detection/` returns nothing. `pnpm --filter @context-forge/core test detection` passes

- [x] **2.2 Add `DERIVED_PROVENANCE`** — effort 1
  - [x] In `packages/core/src/schema/frontmatterSchema.ts`, export `DERIVED_PROVENANCE = 'derived'` and use it in the `provenance` entry's `values`
  - [x] Replace the "Informational only: no behavior branches on it" comment with one saying adoption detection reads it (D4)
  - [x] **Success:** `pnpm --filter @context-forge/core test schema` passes unchanged

- [x] **2.3 Commit** — `refactor: share adoption override remedy and derived provenance constant`
  - [x] `pnpm lint` and `pnpm typecheck` pass before committing

---

### 3. Planning facts (D4, D5)

- [x] **3.1 Implement `adoption/planningFacts.ts`** — effort 2
  - [x] New file exporting `PlanningFacts` (`artifacts: string[]`, `derivedArchitectures: string[]`, `existingStatePlan` as returned by `findExistingStatePlan`) and `readPlanningFacts(root)`
  - [x] Call `findPlanningArtifacts`, `findArchitectureArtifacts` and `findExistingStatePlan` unchanged. For each architecture path, `parseFrontmatter` the file and keep it in `derivedArchitectures` only when `provenance === DERIVED_PROVENANCE`
  - [x] Failure handling follows D4's table exactly: no new try/catch. Non-`ENOENT` `readdir` errors propagate as the existing `AdoptionError`
  - [x] Read-only: the module writes nothing. It imports only from `introspection/parsers/`, `detection/`, `schema/` and `adoption/contracts.ts`
  - [x] Export it from `packages/core/src/adoption/index.ts`
  - [x] **Success:** `pnpm typecheck` passes

- [x] **3.2 Test `readPlanningFacts`** — effort 2
  - [x] New `packages/core/tests/adoption/planningFacts.test.ts`, using temp directories (follow `tests/helpers/adoptionFixtures.ts` for file names and layout)
  - [x] Cases: a derived architecture (compact frontmatter); a derived architecture whose frontmatter has extra fields in the layout the guide writes; a non-derived architecture; an architecture file whose frontmatter is absent or malformed (not derived, still an artifact); an unreadable architecture file (not derived; make it a directory named `*.md`, not chmod, so it fails the same way under root and on any CI filesystem); a slice plan with a retroactive entry (`existingStatePlan` set); a concept-only repo (no artifacts); an empty repo
  - [x] **Success:** `pnpm --filter @context-forge/core test planningFacts` passes

- [x] **3.3 Commit** — `feat: derive adoption planning facts from project files`

---

### 4. Stage and outcome rework (D5)

- [x] **4.1 Rewrite `adoption/adoptionOutcome.ts`** — effort 2
  - [x] Add `AdoptionStage` (`opted-out` | `adoption-incomplete` with `derivedArchitectures` | `already-planned` with `artifacts` and `existingStatePlan` | `unplanned`) and pure `decideStage({ optedOut, facts })` in D5's order
  - [x] Replace `decideOutcome` with `decideOutcome({ stage, source? })`: the first three stages are returned unchanged; `unplanned` requires `source` and returns `brownfield` or `greenfield` against `BROWNFIELD_MIN_SOURCE_LINES`; a missing `source` for `unplanned` throws
  - [x] `AdoptionOutcome` becomes the five kinds in D5. Remove `adoption-in-progress`, `adoption-closed`, `OutcomeInput.state` and the `AdoptionState` import. Keep the type-only `SourceVolume` import and its cycle comment. Update the threshold's comment so it names the `declined` opt-out
  - [x] **Success:** `pnpm typecheck` reports errors only in tests that call the old signature (fixed in 4.2)

- [x] **4.2 Test `decideStage` and `decideOutcome`** — effort 2
  - [x] Rewrite `packages/core/tests/adoption/adoptionOutcome.test.ts`: each stage in order; opted-out wins over a derived architecture; a derived architecture plus an existing-state plan is `already-planned`; a non-derived architecture is `already-planned`; `unplanned` at 2000 lines is brownfield and at 1999 is greenfield; `unplanned` without `source` throws; the first three stages ignore `source`
  - [x] Update `packages/core/tests/docs-map/outOfTreeLinks.test.ts`, which calls the old `decideOutcome`. Build the outcome from `readPlanningFacts`, `decideStage({ optedOut: false, … })` and `measureSourceVolume`. The test's assertions stay the same
  - [x] **Success:** `pnpm --filter @context-forge/core test adoptionOutcome outOfTreeLinks` passes, and `pnpm typecheck` passes

- [x] **4.3 Commit** — `refactor: split adoption outcome into a file-derived stage and code signal`

---

### 5. Opt-out reader and legacy notice (D2, D3)

The enum itself shrinks in section 8. `readAdoptionState` stays until then, because `adoptionNavigation.ts` still uses it.

- [x] **5.1 Add `LEGACY_ADOPTION_STATES` and `ADOPTION_OPT_OUT`** — effort 1
  - [x] In `config/ConfigKeys.ts`, export `LEGACY_ADOPTION_STATES = ['in_progress', 'complete'] as const` and its element type
  - [x] Export `ADOPTION_OPT_OUT = 'declined'` and use it for the `declined` entry in `ADOPTION_STATES`. Do not remove any `ADOPTION_STATES` value yet
  - [x] **Success:** `pnpm typecheck` passes

- [x] **5.2 Implement `readAdoptionOptOut` and `legacyAdoptionStateNotice`** — effort 2
  - [x] In `adoption/adoptionState.ts`, add `readAdoptionOptOut(root)` returning `{ optedOut: boolean; ignoredLegacyValue: LegacyAdoptionState | null }`, per D2: `declined` → opted out; absent or `""` → not opted out; a `LEGACY_ADOPTION_STATES` value → not opted out with `ignoredLegacyValue` set; anything else → `AdoptionError` listing the allowed values, as `readAdoptionState` does today
  - [x] Compare against the constants: membership in `LEGACY_ADOPTION_STATES`, then membership in `ADOPTION_STATES` (else throw), then `optedOut = value === ADOPTION_OPT_OUT`. The error's allowed values come from `ADOPTION_STATES`. No string literals for state values in the function body
  - [x] Add `legacyAdoptionStateNotice(value)` returning D3's notice text with the value interpolated. It is the only place that text is built
  - [x] **Success:** `pnpm typecheck` passes

- [x] **5.3 Test the opt-out reader** — effort 2
  - [x] In `packages/core/tests/adoption/adoptionState.test.ts`, add `readAdoptionOptOut` cases covering every row of the Migration Plan's config table: absent, `""`, `declined`, each legacy value (with `ignoredLegacyValue`), and an unknown value that throws an `AdoptionError` naming `declined`. Do not pin the full allowed-values list; it changes in 8.1
  - [x] Assert `legacyAdoptionStateNotice('in_progress')` and `('complete')` each contain the value and `cf config unset adoption.state`
  - [x] Leave the existing `readAdoptionState` cases in place (removed in 8.2)
  - [x] **Success:** `pnpm --filter @context-forge/core test adoptionState` passes

- [x] **5.4 Commit** — `feat: read the adoption opt-out and report legacy adoption.state values`

---

### 6. Navigation lines (D6)

- [x] **6.1 Implement `adoption/adoptionLines.ts`** — effort 3
  - [x] Export `BROWNFIELD_LINE`, `INCOMPLETE_ADOPTION_LINE` and `inconclusiveDetectionLine(reason)` with D6's texts
  - [x] Export `adoptionNavLines(projectPath)` returning `{ warnings: string[]; skipFirstRun: boolean }`. It calls `readAdoptionOptOut`; when opted out it skips the file reads; otherwise it calls `readPlanningFacts` and `decideStage`, and measures source volume only for `unplanned`, then maps the outcome per D6's table
  - [x] The legacy notice (`legacyAdoptionStateNotice`) is added to `warnings` whenever `ignoredLegacyValue` is set, in every row
  - [x] Catch `AdoptionError` from `measureSourceVolume` only (D6): return `inconclusiveDetectionLine(error.message)` with `skipFirstRun: false`, and comment why swallowing is correct. Every other error, including planning-artifact read errors, propagates
  - [x] Allow injecting the source-volume measurer (an optional parameter defaulting to `measureSourceVolume`) so 6.2 can force a failure without mocking modules
  - [x] Export it from `adoption/index.ts`
  - [x] **Success:** `pnpm typecheck` passes

- [x] **6.2 Test `adoptionNavLines`** — effort 2
  - [x] New `packages/core/tests/adoption/adoptionLines.test.ts`. One case per D6 table row: opted out, adoption incomplete, already planned with and without an existing-state plan (`skipFirstRun` true and false), brownfield, greenfield
  - [x] Legacy value: the notice is present together with the row's own line (use a brownfield fixture)
  - [x] Walk failure: an injected measurer that throws `AdoptionError` yields `inconclusiveDetectionLine` with the error's message and `skipFirstRun: false`. An injected measurer that throws a plain `Error` propagates
  - [x] **Success:** `pnpm --filter @context-forge/core test adoptionLines` passes

- [x] **6.3 Commit** — `feat: add one-line adoption warnings for navigation`

---

### 7. Navigation cutover and deletion (D6)

- [x] **7.1 Wire `adoptionNavLines` into `WorkflowNavigator`** — effort 2
  - [x] In the no-active-slice guard (where `this.routeAdoption(...)` runs today), call `adoptionNavLines(project.projectPath)`, push its `warnings` onto `navWarnings`, and use its `skipFirstRun` for the first-run check. Navigation never returns an adoption action
  - [x] Delete `routeAdoption`, `gateDerivedArchitecture`, the `AdoptionRoute` interface and the `adoptionNavigation.js` import. Remove imports left unused (for example `basename`, if nothing else uses it)
  - [x] Keep `gateBlockAction`; reword its comment so it no longer mentions the adoption gate
  - [x] **Success:** `pnpm typecheck` passes for `packages/core/src`. `grep -n "adoptionNavigation\|routeAdoption" packages/core/src/introspection/WorkflowNavigator.ts` returns nothing

- [x] **7.2 Rewrite `WorkflowNavigator.adoption.test.ts`** — effort 3
  - [x] Replace the step-based cases in `packages/core/tests/introspection/WorkflowNavigator.adoption.test.ts` with the Migration Plan's navigation cases: brownfield (warning is `BROWNFIELD_LINE`), adoption incomplete (`INCOMPLETE_ADOPTION_LINE`), opted out (no adoption line), greenfield (no adoption line), an adopted project (fixture with `ALL_RETROACTIVE_ENTRIES` plus one unchecked entry, plan registered) navigated to its first unbuilt slice, and a legacy value (notice present)
  - [x] Keep the out-of-enum case; it now expects the `readAdoptionOptOut` error
  - [x] Assert no recommendation or suggested command mentions `cf build` for adoption
  - [x] Import expected texts from `adoption/adoptionLines.ts` and `adoptionState.ts`; never from `adoptionNavigation.ts`
  - [x] **Success:** `pnpm --filter @context-forge/core test WorkflowNavigator` passes

- [x] **7.3 Rewrite CLI `next.adoption.test.ts`** — effort 2
  - [x] Same cases as 7.2 through `cf next` in `packages/cli/tests/commands/next.adoption.test.ts`, including the out-of-enum non-zero exit
  - [x] **Success:** `pnpm --filter @context-forge/cli test next.adoption` passes

- [x] **7.4 Rewrite MCP `workflowNextAdoption.test.ts`** — effort 2
  - [x] Same cases as 7.2 through `workflow_next` in `packages/mcp-server/tests/workflowNextAdoption.test.ts`. Assert the warnings equal the CLI's for brownfield and the legacy value
  - [x] **Success:** `pnpm --filter @context-forge/mcp test workflowNextAdoption` passes

- [x] **7.5 Walk-cap end-to-end** — effort 2
  - [x] Add one CLI case to `next.adoption.test.ts`: a project with no planning artifacts and no source, holding more than `MAX_WALK_ENTRIES` non-source files (reuse the layout in `tests/detection/sourceVolume.test.ts`'s cap test). `cf next` exits 0 and its warnings contain `inconclusiveDetectionLine` naming `MAX_WALK_ENTRIES`
  - [x] **Success:** the case passes

- [x] **7.6 Verify and commit before deleting** — effort 1
  - [x] Run `pnpm -r build` and the core, CLI and MCP test suites. All pass with `adoptionNavigation.ts` still present but unreferenced by `src/`
  - [x] Commit — `refactor: route adoption navigation through one-line warnings`

- [x] **7.7 Delete the old module and commit** — effort 1
  - [x] Delete `packages/core/src/introspection/adoptionNavigation.ts`, `tests/introspection/adoptionNavigation.decide.test.ts` and `tests/introspection/adoptionNavigation.actions.test.ts`
  - [x] Update the header comment and the `state` doc in `tests/helpers/adoptionFixtures.ts`: the optional state is now limited to `declined` and the legacy values
  - [x] **Success:** `grep -rn "adoptionNavigation" packages/*/src packages/*/tests` returns nothing. `pnpm typecheck` and the core suite pass
  - [x] Commit — `refactor: remove per-step adoption navigation`

---

### 8. Config key shrink (D1, D2)

- [x] **8.1 Shrink `adoption.state` and remove the old reader** — effort 2
  - [x] In `config/ConfigKeys.ts`, set `ADOPTION_STATES = ['', ADOPTION_OPT_OUT]`, replace the key's description with D1's text, and delete the `AdoptionState` type
  - [x] Remove `AdoptionState` from `config/index.ts` exports and add `LEGACY_ADOPTION_STATES`
  - [x] In `adoption/adoptionState.ts`, delete `readAdoptionState`, `isAdoptionState` and the `ADOPTION_STATES`/`AdoptionState` re-export
  - [x] **Success:** `pnpm typecheck` passes across the workspace

- [x] **8.2 Update config and reader tests** — effort 2
  - [x] `packages/core/tests/adoption/adoptionState.test.ts`: remove the `readAdoptionState` cases; the `readAdoptionOptOut` cases from 5.3 remain
  - [x] `packages/core/tests/config/ConfigKeys.test.ts`: the enum is `["", "declined"]`; the description equals D1's text; `ConfigManager.set` rejects `in_progress` and `complete` with an error listing `""` and `"declined"`; `ConfigManager.get` on a file holding `in_progress` returns it
  - [x] **Success:** `pnpm --filter @context-forge/core test adoptionState ConfigKeys` passes

- [x] **8.3 Commit** — `feat: reduce adoption.state to the declined opt-out`

---

### 9. Checker with a legacy value (Success Criteria)

- [x] **9.1 Test `cf check` findings are unchanged by a legacy value** — effort 2
  - [x] New `packages/core/tests/introspection/ConsistencyChecker.legacyAdoptionState.test.ts`, with setup following `ConsistencyChecker.retroactive.test.ts`
  - [x] Run the checker on one project twice: without an `[adoption]` section, and with `adoption.state = "in_progress"`. Assert the two findings lists are equal and no error is thrown
  - [x] `packages/mcp-server/tests/integration/pureBuild.test.ts` keeps its stored `in_progress` config. Update only comments that describe it as a current state; it is now a legacy value the build ignores
  - [x] **Success:** `pnpm --filter @context-forge/core test legacyAdoptionState` and `pnpm --filter @context-forge/mcp test pureBuild` pass

- [x] **9.2 Commit** — `test: confirm legacy adoption.state does not affect cf check`

---

### 10. README row and stale-text sweep

- [x] **10.1 Update the README config row** — effort 1
  - [x] Reword the `adoption.state` row in the root `README.md` config table to D1's description. Leave the README adoption section and `packages/cli/README.md` for 272
  - [x] **Success:** the row names only `declined` and the empty default, and says the old values are ignored

- [x] **10.2 Sweep source for stale adoption text** — effort 2
  - [x] `grep -rnE "in_progress|'complete'|\"complete\"" packages/*/src` and inspect each hit. Outside `ConfigKeys.ts` and `adoptionState.ts`, none may be an adoption state (other uses, such as task or slice status, stay)
  - [x] `grep -rn "cf build" packages/*/src` and inspect each hit. None may advise `cf build` for adoption
  - [x] Fix any adoption hit found. File an issue for anything outside this slice's scope
  - [x] **Success:** both sweeps show no adoption-state or `cf build` adoption text outside the allowed files

- [x] **10.3 Commit** — `docs: describe adoption.state as the opt-out in the config table`

---

### 11. Final validation

- [x] **11.1 Full suite** — effort 1
  - [x] Run `pnpm -r build`, `pnpm lint`, `pnpm typecheck` and `pnpm test` from the repo root
  - [x] **Success:** all pass

- [x] **11.2 Verification Walkthrough** — effort 2
  - [x] Run steps 1–6 of the design's Verification Walkthrough on a scratch copy of a repo with more than 2000 source lines, using `node packages/cli/dist/index.js`. Step 6 uses the MCP server's `workflow_next` (local build)
  - [x] Record the outcome of each step under this task. A step that fails is a bug in this slice: fix it, add a test that would have caught it, and re-run the step
  - [x] Confirm the design's Technical Requirements by a grep or a named test each: `adoptionNavigation.ts`, `readAdoptionState` and the config `AdoptionState` type are gone; tests cover every Migration Plan config row, every `decideStage` branch and every D6 row
  - [x] **Success:** every step matches the design's expected result. `shasum .context-forge.toml` is unchanged across step 4
  - [x] Outcomes:
    Step 1 (unadopted brownfield): pass. `cf config get adoption.state` shows an empty value and the D1 text; `cf next` shows BROWNFIELD_LINE and the ordinary Phase 0 recommendation.
    Step 2 (legacy value): pass. Notice shown, exit 0; `cf check` output byte-identical before and after; unset removes the notice; `cf config set adoption.state complete` exits 1 listing "" and "declined".
    Step 3 (incomplete adoption): pass. INCOMPLETE_ADOPTION_LINE shown.
    Step 4 (adopted): pass. After `cf set arch 100-arch.existing`, `cf next` recommends `cf set slice 101`; `shasum .context-forge.toml` unchanged throughout. Caveat: with review gating on and no arch review, the ordinary arch gate blocks first.
    Step 5 (opt-out): pass. No adoption line.
    Step 6 (MCP parity): pass. `workflow_next` warnings equal `cf next --json` warnings for steps 1 and 2.
    Technical requirements: `adoptionNavigation.ts`, `readAdoptionState` and the config `AdoptionState` type are gone (grep empty). Tests cover every config row (`adoptionState.test.ts`, `ConfigKeys.test.ts`), every `decideStage` branch (`adoptionOutcome.test.ts`) and every D6 row (`adoptionLines.test.ts`).

- [x] **11.3 Commit** — `chore: complete slice 269 validation`
  - [x] Commit any walkthrough fixes and this task file's check-offs on the slice branch

---
docType: tasks
slice: brownfield-aware-cf-next
project: context-forge
lld: user/slices/264-slice.brownfield-aware-cf-next.md
dependencies:
- 261
- 263
projectState: main after slices 261, 262 and 263 (built). `adoption/` has `readAdoptionState`
  (throws `AdoptionError` on an out-of-enum value), the resolver, and `adoptionCompletion.ts`
  with `findRecordedPlan` (inline slice plan scan), `persistAdoptionComplete` and
  `completeAdoptionIfPlanRecorded`. `detection/planningArtifacts.ts` has `findPlanningArtifacts`
  and one combined `ARCH_FILE_PATTERN` (arch|hld|slices). `WorkflowNavigator.ts` (1065
  lines) has no adoption awareness. No import-boundary lint rule exists.
dateCreated: 20261023
dateUpdated: 20261023
status: not_started
turns: 25
promptTokens: 1760651
cachedTokens: 1648397
cacheWriteTokens: 112210
completionTokens: 36816
durationSeconds: 309.6
costUsd: 1.964141
usageRounds: 2
pricedRounds: 2
revision_number: 1
---

## Context Summary

- Slice 264 makes `cf next` / `workflow_next` read `adoption.state` and the retroactive marker. `in_progress` at Phase 0 recommends the next adoption step (`cf build`); `complete` skips first-run logic and points at the first new slice plan entry (registering the plan first if needed); `""` keeps today's navigation plus the D2 warning in one case; `declined` is unchanged.
- The slice design's D1–D8, API Contracts, Success Criteria and Verification Walkthrough are the spec. Do not widen scope (Excluded: no detection in `cf next`, no writes by `cf next`, no `getStatus`/`cf status` change, no `agent_onboard` change, no guide prompt change).
- Dependencies: 261 and 263 are built. The only edits to their code are the `findExistingStatePlan` swap (Task 3) and the pattern split in `planningArtifacts.ts` (Task 1). Both keep signatures; the one behavior change is R3's ordering when slice plans exist in two directories.
- Layering (D8): `introspection/parsers/` → `adoption/` → the rest of `introspection/`. New navigation logic lives in `introspection/adoptionNavigation.ts`; `WorkflowNavigator.ts` gets call-site edits and the `gateBlockAction` extraction only.
- Missing-file rule (260/261): `ENOENT` means "not present"; other filesystem errors throw. Use `pathPresent`/`isEnoent` from `detection/pathPresent.ts`. No new `existsSync`.
- Local build: the global `cf` is the published package. Run the local CLI as `node <repo>/packages/cli/dist/index.js`, with `<repo>` the absolute repo root. Shell aliases do not persist between tool calls, so write the full command wherever the design's walkthrough says `cfl`. Run `pnpm -r build` before cli/mcp-server tests, which import `@context-forge/core` from `dist`.
- Tests: core in `packages/core/tests/{detection,introspection,adoption}/`, navigator fixtures pattern in `WorkflowNavigator.retroactive.test.ts` and `tests/helpers/workflowNavigatorFixtures.ts`; MCP in `packages/mcp-server/tests/workflowTools.test.ts`; CLI in `packages/cli/tests/commands/next.test.ts`.
- Next slice: 265 (end-to-end adoption verification and docs).

### Resolutions of gaps in the design (PM-approved with this breakdown)

- **R1 — Swap point is `findRecordedPlan`.** 263 split its inline scan out as `findRecordedPlan` (called by the resolver and by `completeAdoptionIfPlanRecorded`). The swap therefore replaces `findRecordedPlan`'s body with a call to `findExistingStatePlan`. Both 263 exports keep their signatures; `SLICE_PLAN_FILE_PATTERN` moves out of `adoptionCompletion.ts`.
- **R2 — Filename constants.** There are no separate `nnn-arch` / `nnn-hld` constants: `ARCH_FILE_PATTERN` matches arch, hld and slices. Task 1 replaces it with two exported patterns in `planningArtifacts.ts`, `ARCHITECTURE_FILE_PATTERN` (arch|hld) and `SLICE_PLAN_FILE_PATTERN` (slices); `findPlanningArtifacts` matches either, so its results are unchanged. `ARCH_FILE_PATTERN` has no other users and is not re-exported from `detection/index.ts`.
- **R3 — Ordering by index.** `findArchitectureArtifacts` and `findExistingStatePlan` sort by the 3-digit index of the file name, then by full path. This differs from `findRecordedPlan`'s current full-path order only when slice plans exist in both `project-guides/` and `architecture/`; there the lowest index now wins, as the design specifies.
- **R4 — `gatherAdoptionInputs` takes `conceptExists`.** `conceptDocExists` is a private navigator method that `computeNext` already calls before the arch gate. The signature becomes `gatherAdoptionInputs(project, status, conceptExists)`: the navigator passes the value it has, so there is no second read and no duplicate concept logic.
- **R5 — `findFirstNotCompleteEntry` becomes a shared pure function.** `registeredPlanHasOpenEntry` uses the navigator's "not complete" rule. The private method moves, unchanged, to an exported function in `introspection/statusDerivation.ts`; the navigator and `gatherAdoptionInputs` both call it.
- **R6 — Step actions are built in `adoptionNavigation.ts`.** The design puts the step texts in `adoptionNavigation.ts` and says the navigator builds the action. To keep texts and their assembly in one place (and `WorkflowNavigator.ts` thin), `adoptionNavigation.ts` exports a pure `buildAdoptionStepAction(step, inputs): NextAction`. The navigator calls it, and runs the D4 arch gate itself before using it for step `existing-state-plan`.
- **R7 — Transitive import.** `parsers/existingStatePlan.ts` imports `detection/planningArtifacts.ts`, which imports `adoption/contracts.ts` (type-only leaf plus `AdoptionError`). There is no runtime cycle, and the D8 rule checks direct imports, so this passes. No change is made to avoid it.

## Tasks

- [ ] **Task 0: Amend the slice design with R1–R7, on the target** (effort: 2)
  - [ ] Read `cf config get git.integration_branch`; empty means the target is `main`. Do this task on the target, before Task 0B creates the slice branch: it is planning work (Git Rules).
  - [ ] In `project-documents/user/slices/264-slice.brownfield-aware-cf-next.md`, add a short "Resolutions" note under Technical Decisions naming R1–R7 as PM-approved, and edit the text they change:
    - Interfaces Required: the swap target is `findRecordedPlan` (R1); the filename constants are `ARCHITECTURE_FILE_PATTERN` and `SLICE_PLAN_FILE_PATTERN` (R2); index-then-path ordering (R3).
    - Component Structure and API Contracts: `gatherAdoptionInputs(project, status, conceptExists)` (R4); `buildAdoptionStepAction(step, inputs): NextAction` (R6); `findFirstNotCompleteEntry` exported from `statusDerivation.ts` (R5).
    - D8: one bullet noting the transitive import and why it is acceptable (R7).
  - [ ] Success: the design's contracts match the resolutions; no Decision `Status` or review verdict is changed.
  - [ ] Commit on the target: `docs: amend slice 264 design with approved task-breakdown resolutions`

- [ ] **Task 0B: Slice branch and baseline** (effort: 1)
  - [ ] Create `264-slice.brownfield-aware-cf-next` from the target if it does not exist, otherwise switch to it.
  - [ ] Run `pnpm -r build`, then in the repo root: `node packages/cli/dist/index.js next --json > /tmp/264-next-before.json` and `node packages/cli/dist/index.js next > /tmp/264-next-before.txt`.
  - [ ] Success: `git branch --show-current` prints the branch name; both baseline files exist and are non-empty.

### Shared reads and the lint boundary (Development Approach step 1)

- [ ] **Task 1: Split filename patterns; add `findArchitectureArtifacts`** (effort: 2)
  - [ ] In `packages/core/src/detection/planningArtifacts.ts`, replace `ARCH_FILE_PATTERN` with exported `ARCHITECTURE_FILE_PATTERN` (`nnn-arch.*.md`, `nnn-hld.*.md`) and `SLICE_PLAN_FILE_PATTERN` (`nnn-slices.*.md`), case-insensitive like today. `findPlanningArtifacts` keeps a name if it matches the initiative plan pattern (project-guides only, as today) or either new pattern; its output is unchanged.
  - [ ] Add exported `findArchitectureArtifacts(root): Promise<string[]>`: the same two directories and `listFileNames` helper (same error text), names matching `ARCHITECTURE_FILE_PATTERN`, absolute paths sorted by file-name index then full path (R3). Put the index-sort comparator in this file, exported, so Task 2 reuses it.
  - [ ] Update the doc comment in `adoption/adoptionCompletion.ts` that mentions `ARCH_FILE_PATTERN`.
  - [ ] Success: `pnpm typecheck` passes; existing `planningArtifacts.test.ts` passes unchanged.

- [ ] **Task 1T: Pattern and `findArchitectureArtifacts` tests** (effort: 2)
  - [ ] In `packages/core/tests/detection/planningArtifacts.test.ts` (temp dirs):
    1. No directories → `[]`.
    2. `architecture/100-arch.a.md`, `100-slices.a.md`, `000-concept.a.md` → only the arch path.
    3. `100-hld.x.md` counts; `100-ARCH.x.md` (upper case) counts.
    4. `project-guides/200-arch.b.md` and `architecture/100-arch.a.md` → 100 first (index order across directories).
    5. Architecture directory unreadable (`chmod 000`, skip on Windows/root) → throws, message names the path (D7).
    6. `findPlanningArtifacts` on a fixture with arch, hld, slices and initiative plan files returns the same set as before the split.
  - [ ] Success: the new tests pass.
  - [ ] Commit: `feat: add findArchitectureArtifacts and split planning filename patterns`

- [ ] **Task 2: `findExistingStatePlan`** (effort: 2)
  - [ ] Create `packages/core/src/introspection/parsers/existingStatePlan.ts` exporting `findExistingStatePlan(checkoutPath): Promise<string | null>`: `findPlanningArtifacts`, keep names matching `SLICE_PLAN_FILE_PATTERN`, order with Task 1's comparator, `parseSlicePlan` each, return the first with an entry where `retroactive` is true, else null. Doc comment: "The first slice plan, by index, with at least one retroactive entry." Read-only.
  - [ ] It imports nothing from `adoption/` directly (D8).
  - [ ] Success: `pnpm typecheck` passes.

- [ ] **Task 2T: `findExistingStatePlan` tests** (effort: 2)
  - [ ] Add `packages/core/tests/introspection/parsers/existingStatePlan.test.ts` (follow the location of existing parser tests if they live elsewhere). Plan lines use 263's Marker Specification form exactly: ``1. [x] **(100) Existing System** `retroactive` — built before adoption.``
    1. No plan → null.
    2. Plan with only ordinary entries → null.
    3. Plan with a retroactive entry → that path.
    4. Two plans with markers, `project-guides/200-slices.b.md` and `architecture/100-slices.a.md` → the 100 plan (lowest index wins).
    5. A retroactive line inside a `100-arch.*.md` → null.
    6. Plan file unreadable (`chmod 000`) and another readable marked plan → the readable one (D7: unreadable plan is not the existing-state plan).
  - [ ] Success: the new tests pass.
  - [ ] Commit: `feat: add findExistingStatePlan`

- [ ] **Task 3: `findRecordedPlan` delegates (R1)** (effort: 1)
  - [ ] In `adoption/adoptionCompletion.ts`, make `findRecordedPlan` return `findExistingStatePlan(checkoutPath)`; delete the inline loop, its local `SLICE_PLAN_FILE_PATTERN` and unused imports. Update the file header comment (it currently says "When 264 lands…").
  - [ ] Success: `packages/core/tests/adoption/adoptionCompletion.test.ts` and `adoptionResolver.test.ts` pass unchanged.
  - [ ] Commit: `refactor: delegate findRecordedPlan to findExistingStatePlan`

- [ ] **Task 4: D8 import-boundary lint rule** (effort: 2)
  - [ ] In `eslint.config.mjs`, add two blocks using `no-restricted-imports` with `patterns`:
    - files `packages/core/src/adoption/**/*.ts`: forbid `**/introspection/*` and deeper, except `**/introspection/parsers/**` and `**/introspection/types*`. Message names D8 and the allowed layers.
    - files `packages/core/src/introspection/parsers/**/*.ts`: forbid `**/adoption/**`.
  - [ ] Existing imports the rule must allow: `adoption/` imports only `introspection/parsers/` (the `existingStatePlan` import from Task 3), and no parser imports `adoption/`. If `pnpm lint` flags an existing import, the pattern is wrong; fix the pattern, not the import.
  - [ ] Check the rule bites: temporarily add `import '../introspection/WorkflowNavigator.js'` to an `adoption/` file and run `pnpm lint` (expect the D8 error), then remove it. Do the same for an `adoption/` import in a parser file.
  - [ ] Success: `pnpm lint` passes on the real tree; both temporary imports were reported.
  - [ ] Commit: `chore: add adoption import-boundary lint rule`

### Adoption decision module (Development Approach step 2)

- [ ] **Task 5: `adoptionNavigation.ts` types, texts and `decideAdoptionNav`** (effort: 3)
  - [ ] Create `packages/core/src/introspection/adoptionNavigation.ts` with `AdoptionNav`, `AdoptionNavStep` (from D1) and `AdoptionNavInputs` (API Contracts).
  - [ ] Define the D2, D5 and D6-row-1 warning texts once as constants (wording from the design; D5 interpolates the instruction).
  - [ ] Export pure `decideAdoptionNav(inputs)`:
    - `declined` → `not-adopting`.
    - `""` → `warn` (D2) when `conceptInstruction && conceptExists && !planningArtifactsExist`; else `not-adopting`.
    - `in_progress` → `warn` (D5) when not `conceptInstruction`; otherwise D4's table in order: existing-state plan → `record-completion`; no concept → `concept`; no architecture → `architecture`; else `existing-state-plan`.
    - `complete` → D6's table in order: no existing-state plan → `warn`; no registered plan → `register-plan`; registered plan is the existing-state plan (compare resolved absolute paths) and no open entry → `plan-new-work`; else `adopted`.
  - [ ] Switch on the state exhaustively (no default branch that hides a new state).
  - [ ] Success: `pnpm typecheck` passes; the file has no I/O imports in the decide path.

- [ ] **Task 5T: `decideAdoptionNav` tests** (effort: 3)
  - [ ] Add `packages/core/tests/introspection/adoptionNavigation.decide.test.ts` with an inputs factory (defaults: empty fields). One test per row:
    1. `declined` with every input set → `not-adopting`.
    2. `""`: Phase 0 + concept + no artifacts → `warn` with the D2 text; with artifacts → `not-adopting`; no concept → `not-adopting`; not Phase 0 → `not-adopting`.
    3. `in_progress` at Phase 0: each D4 row, including plan present with no concept → `record-completion` (row 1 wins).
    4. D4 order pin: the three artifact steps in sequence are `concept`, `architecture`, `existing-state-plan` as artifacts are added one by one.
    5. `in_progress` not Phase 0 → `warn` containing the instruction and `cf set phase 'Phase 0: Concept'`.
    6. `complete`: each D6 row, plus a registered plan different from the existing-state plan with no open entry → `adopted`.
  - [ ] Success: the new tests pass.
  - [ ] Commit: `feat: add the adoption navigation decision`

- [ ] **Task 6: `buildAdoptionStepAction` (R6)** (effort: 2)
  - [ ] Export pure `buildAdoptionStepAction(step, inputs): NextAction` from `adoptionNavigation.ts`, switching exhaustively on the step:
    - D4 steps: recommendation from D4's table, `suggestedCommand: 'cf build'`, rationale says `cf build` assembles the brownfield adoption prompt, which resumes from the artifacts that exist, and gives `cf config set adoption.state declined`. No `phase` field.
    - `register-plan`: D6 text; `cf set arch {archStem}` when an architecture path shares the plan's index, else `cf set plan {planStem}`. Stems are file names without `.md`.
    - `plan-new-work`: D6 text with `{planStem}`, `suggestedCommand: "cf set phase 'Phase 3: Slice Planning'"`, rationale per D6.
  - [ ] Every action carries a `summary`, like the existing actions.
  - [ ] Success: `pnpm typecheck` passes.

- [ ] **Task 6T: Step action tests** (effort: 2)
  - [ ] In `packages/core/tests/introspection/adoptionNavigation.actions.test.ts`:
    1. Each D4 step: exact recommendation, command `cf build`, `phase` undefined, no `cf set phase` anywhere in the action.
    2. `register-plan` with `100-arch.existing.md` and `100-slices.existing.md` → `cf set arch 100-arch.existing`; with arch 100 and plan 200 → `cf set plan 200-slices.x`.
    3. `plan-new-work` → command `cf set phase 'Phase 3: Slice Planning'`, recommendation names the plan stem.
  - [ ] Success: the new tests pass.
  - [ ] Commit: `feat: add adoption step actions`

### Gathering inputs and navigator wiring (Development Approach step 3)

- [ ] **Task 7: Move `findFirstNotCompleteEntry` (R5)** (effort: 1)
  - [ ] Move the private method from `WorkflowNavigator.ts` to an exported function in `introspection/statusDerivation.ts`, body and doc comment unchanged. Update the navigator's call sites.
  - [ ] Success: `pnpm typecheck` passes; all `WorkflowNavigator.*.test.ts` pass unchanged.
  - [ ] Commit: `refactor: share findFirstNotCompleteEntry`

- [ ] **Task 8: Extract `gateBlockAction`** (effort: 2)
  - [ ] In `WorkflowNavigator.ts`, extract the existing arch gate's `GateResult` → `NextAction` mapping (the `pending-review` and `review-failed` returns in the no-active-slice guard) into a private `gateBlockAction(gate, archIndex): NextAction | null` (null when `isBlockingGate` is false). The existing arch gate calls it; text unchanged.
  - [ ] Success: `WorkflowNavigator.reviewGate*.test.ts` and all other navigator tests pass unchanged.
  - [ ] Commit: `refactor: extract gateBlockAction`

- [ ] **Task 9: Adoption fixture helper** (effort: 2)
  - [ ] Add `packages/core/tests/helpers/adoptionFixtures.ts`: creates a temp checkout with `.context-forge.toml` holding a given `adoption.state` (or none), and options to add `000-concept.*.md`, a `100-arch.existing.md` (`provenance: derived`), a `100-slices.existing.md` (entries given as retroactive/new, real marker format) and an unrelated plan. Returns the path and a `ProjectData` builder taking `instruction`, `developmentPhase`, `fileArch`, `fileSlicePlan`, `fileSlice`.
  - [ ] Valid frontmatter on every written document (copy the shape from `WorkflowNavigator.retroactive.test.ts`).
  - [ ] Success: `pnpm typecheck` passes; Tasks 11T, 12T and 13 use this helper.
  - [ ] Commit: `test: add adoption fixture helper`

- [ ] **Task 10: `gatherAdoptionInputs` (R4)** (effort: 3)
  - [ ] Export `gatherAdoptionInputs(project, status, conceptExists): Promise<AdoptionNavInputs>` from `adoptionNavigation.ts`, reading only what the state needs (Data Flow):
    - Always: `readAdoptionState(projectPath)` (errors propagate, D7); `instruction` and `conceptInstruction` (`resolvePhaseValue(project.instruction) === CONCEPT_PHASE`).
    - `declined`: nothing more.
    - `""`: `findPlanningArtifacts` only when `conceptInstruction && conceptExists`.
    - `in_progress` / `complete`: `findArchitectureArtifacts`, `findExistingStatePlan`; `registeredPlanPath` from `resolveArtifactPath('fileSlicePlan', …)` joined to the checkout, null if unset or `pathPresent` is false; `registeredPlanHasOpenEntry` from `findFirstNotCompleteEntry(status.slicePlan?.entries ?? [])` when the registered plan is the existing-state plan.
  - [ ] Success: `pnpm typecheck` and `pnpm lint` pass (navigator layer may import `adoption/`). Its behavior is tested through the navigator in Task 11T.
  - [ ] Commit: `feat: add gatherAdoptionInputs`

- [ ] **Task 11: Route `computeNext` through the adoption decision (D1)** (effort: 3)
  - [ ] In the no-active-slice guard, after the existing arch gate and before `detectFirstRunContext`, call `gatherAdoptionInputs(project, status, conceptExists)` and `decideAdoptionNav`, then switch exhaustively:
    - `not-adopting` → today's flow.
    - `warn` → push the warning onto `navWarnings`; today's flow. Make sure the warning reaches every first-run return (today only the final fall-through attaches `navWarnings`; attach them where the first-run action is returned too, without changing output when `navWarnings` is empty).
    - `recommend` → return `buildAdoptionStepAction(step, inputs)` with `navWarnings` attached when non-empty. (Task 12 adds the arch gate for `existing-state-plan`.)
    - `adopted` → skip `detectFirstRunContext`; continue to the existing fall-through.
  - [ ] No write anywhere in this path (D3).
  - [ ] Success: `pnpm typecheck` and `pnpm lint` pass; all existing navigator tests pass unchanged.

- [ ] **Task 11T: Navigator adoption tests** (effort: 4)
  - [ ] Add `packages/core/tests/introspection/WorkflowNavigator.adoption.test.ts` using Task 9's helper, one test per Functional Requirements bullet:
    1. Declined and unset: for no phase, Phase 0 with and without concept, Phases 1–3, `getNext` equals the same fixture with no `[adoption]` section, except unset + Phase 0 + concept + no planning artifact, which adds exactly the D2 warning; with a planning artifact, no warning.
    2. `in_progress` at Phase 0 (gating off): steps `concept`, `architecture`, `existing-state-plan`, `record-completion` from their fixtures; no action has `phase` set or mentions `cf set phase`.
    3. `in_progress` at Phase 2 → today's Phase 2 recommendation plus the D5 warning.
    4. `complete`: no existing-state plan → today's navigation plus the D6 row 1 warning; plan unregistered with arch 100 → `cf set arch 100-arch.existing`; then with `fileArch`/`fileSlicePlan` set → `cf set slice 102`; all entries retroactive → `cf set phase 'Phase 3: Slice Planning'`; a different plan registered → normal navigation on it. No complete-state fixture returns "Advance to Phase 1".
    5. Active slice set: in each state, `getNext` equals the no-adoption fixture's.
    6. Read-only: `.context-forge.toml` bytes and the `ProjectData` object are unchanged after `getNext` in every fixture above.
    7. Out-of-enum `adoption.state` → `getNext` rejects with the `readAdoptionState` message (D7).
  - [ ] Success: the new tests pass.
  - [ ] Commit: `feat: route cf next through adoption navigation`

- [ ] **Task 12: Arch gate before `existing-state-plan` (D4)** (effort: 2)
  - [ ] In the `recommend` branch from Task 11, for step `existing-state-plan` only: evaluate `preSlicePlan` for the index of `architecturePaths[0]` (`extractSliceIndex` on its stem) and return `gateBlockAction`'s action if it blocks; otherwise continue as in Task 11.
  - [ ] Success: `pnpm typecheck` passes; Task 11T tests still pass; `WorkflowNavigator.ts` grows by no more than ~40 lines across Tasks 11 and 12.

- [ ] **Task 12T: Arch gate test** (effort: 1)
  - [ ] In `WorkflowNavigator.adoption.test.ts`: `in_progress` at Phase 0 with concept and `100-arch.existing.md`, review gating on (`makeStubConfig(GATE_ENABLED_DEFAULTS)`), no arch review → "Review required before creating the slice plan" naming architecture 100.
  - [ ] Success: the new test passes.
  - [ ] Commit: `feat: gate the existing-state-plan step on the derived architecture review`

### Surfaces and verification (Development Approach step 4)

- [ ] **Task 13: MCP and CLI parity tests** (effort: 3)
  - [ ] Run `pnpm -r build`.
  - [ ] Build fixtures with Task 9's helper, imported by relative path as `workflowCheckRouting.test.ts` imports `../../core/tests/helpers/gitWorktreeFixture.js`.
  - [ ] In `packages/mcp-server/tests/workflowTools.test.ts`, for the `in_progress` (`architecture` step), `complete` register-plan and `complete` adopted fixtures: `workflow_next`'s `recommendation`, `suggestedCommand` and `warnings` equal `WorkflowNavigator.getNext` on the same project. For out-of-enum `adoption.state`: `errorResult` text is `Error: {readAdoptionState message}`.
  - [ ] In `packages/cli/tests/commands/next.test.ts`: `next --json` on one adoption fixture matches `getNext`; out-of-enum state exits non-zero with the same message.
  - [ ] Success: the new tests pass. These tests cover the design's walkthrough step 9 (MCP parity).
  - [ ] Commit: `test: add workflow_next and cf next adoption parity tests`

- [ ] **Task 14: Full validation and walkthrough** (effort: 2)
  - [ ] Run `pnpm -r build`, then format (if the repo has a format script), `pnpm lint`, `pnpm typecheck` and `pnpm test` once each; fix failures.
  - [ ] In the repo root: `node packages/cli/dist/index.js next --json` and `node packages/cli/dist/index.js next` diffed against Task 0B's baselines show no differences (walkthrough step 1).
  - [ ] Run the design's Verification Walkthrough steps 2–8 against a scratch project in `/tmp/bf`, using `node <repo>/packages/cli/dist/index.js` for `cfl`. Step 9 is covered by Task 13. Record each step's result in the slice design's walkthrough notes (as slices 262 and 263 did).
  - [ ] Success: all checks pass; steps 1–8 each show their expected output.
  - [ ] Commit: `docs: record slice 264 walkthrough results`

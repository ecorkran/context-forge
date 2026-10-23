---
docType: tasks
slice: retroactive-marker-and-existing-state-slice-plan
project: context-forge
lld: user/slices/263-slice.retroactive-marker-and-existing-state-slice-plan.md
dependencies:
- 261
dateCreated: 20261022
dateUpdated: 20261023
projectState: main after slices 261 and 262 (built). `adoption/` has the resolver,
  `readAdoptionState`/`writeAdoptionState`, `AdoptionOutcome`, `renderAdoptionFacts`;
  `detection/planningArtifacts.ts` has `findPlanningArtifacts`. No code reads a retroactive
  marker. Slice 264 (`findExistingStatePlan`) is not built.
status: not_started
turns: 31
promptTokens: 2406305
cachedTokens: 2289878
cacheWriteTokens: 116375
completionTokens: 28978
durationSeconds: 204.3
costUsd: 0.984662
usageRounds: 3
pricedRounds: 3
revision_number: 2
---

## Context Summary

- Slice 263 defines the **retroactive marker** (`` `retroactive` `` after the entry title in a slice plan), teaches cf to parse it, makes the review gate skip it with its own result kind, adds a `retroactive-entry` checker rule, adds `provenance: derived` to the architecture schema, and makes the first persisting Phase 0 `cf build` move `adoption.state` from `in_progress` to `complete` once a slice plan with a retroactive entry exists.
- The slice design's D1–D8, API Contracts, Success Criteria and Verification Walkthrough are the spec. Do not re-derive them and do not widen scope (Excluded list: no command for setting the marker, no guide text, no `cf next` change beyond a retroactive active slice).
- Dependencies: slice 261 (built). Slice 264 is **not** built, so `findExistingStatePlan` does not exist. This slice implements the scan inline in `adoption/adoptionCompletion.ts`; 264 later swaps it for `findExistingStatePlan` without changing signatures (264 "Interfaces Required").
- Layering: `adoption/` may import `introspection/parsers/**` and `introspection/types`, not other `introspection/` files (264 D8). `services/ContextIntegrator.ts` is not touched.
- Missing-file rule (260/261): `ENOENT` means "not present"; other filesystem errors throw. No `existsSync`.
- `ConsistencyChecker.ts` (1475 lines) and `WorkflowNavigator.ts` (1049 lines) get only call-site edits; new logic goes in new modules.
- Use the local build (`node packages/cli/dist/index.js`, alias `cfl`). Run `pnpm -r build` before tests that import `@context-forge/core` from `dist` (cli, mcp-server).
- Test fixtures live in `packages/core/tests/fixtures/`; core tests are in `packages/core/tests/{introspection,adoption,schema}/`, CLI tests in `packages/cli/tests/`.

### Resolutions of gaps in the design (PM-approved with this breakdown)

- **R1 — Completion write ordering.** The design has the resolver's decide step call `completeAdoptionIfPlanRecorded`, which scans and writes in one step. 261's resolver gathers facts before writing, so a failure after the write cannot leave state persisted for a build that produced no prompt (the guide check in `assertGuideSupportsAdoption` can still throw). So `adoptionCompletion.ts` exports three functions: `findRecordedPlan` (read-only scan), `persistAdoptionComplete` (the write, with 261 D9 error text), and `completeAdoptionIfPlanRecorded` (the design's contract: both, composed; kept exported for 264). The resolver calls `findRecordedPlan` in decide and `persistAdoptionComplete` after the facts render, mirroring `persistInProgress`.
- **R2 — `evaluateEntryGate` parameters.** The design writes `config: ResolvedGate`; `evaluateReviewGate` takes `(…, config: ConfigManager, resolved?: ResolvedGate)`. `evaluateEntryGate` takes the same trailing parameters as `evaluateReviewGate` and returns `Promise<GateResult | null>` (null when gating is off, for non-retroactive entries).
- **R3 — Navigator and gating off.** An active retroactive slice has no design file, so without a special case it reports `needs-design` whether or not gating is on. The navigator therefore tests `entry.retroactive` directly and returns `complete` regardless of gating; it evaluates no gate for it (D2/D3 "no `preAdvance` gate"). `evaluateEntryGate` is used by the checker only, which deviates from D3's "the navigator and `ruleReviewGate` both call it" (PM-approved). The skip meaning is one fact (`entry.retroactive`), read in two places. This adds one API item the design's contracts do not list: the optional `SliceStatus.retroactive` flag (mirrors `gateExempt`; it serializes into the `workflow_status` and `workflow_next` JSON as `activeSlice.retroactive`, present only when true). PM-approved.
- **R4 — `SlicePlanEntry.retroactive` is required.** About 54 test and source literals construct `SlicePlanEntry` with `indexSource:`. Task 1 makes the field required and fixes each literal the compiler reports (`retroactive: false`).
- **R5 — Completing build shows state `complete`.** For the `adoption-completed` outcome the resolver passes state `complete` to the renderer. The notice names the plan path relative to the checkout, like the other path facts. This is render-only and adds no API surface beyond the design's `adoption-completed` outcome. `decideOutcome` stays pure and unchanged; the resolver builds this outcome itself because it needs the plan path.

## Tasks

- [ ] **Task 0: Slice branch** (effort: 1)
  - [ ] Read `cf config get git.integration_branch`; empty means the target is `main`.
  - [ ] Create `263-slice.retroactive-marker-and-existing-state-slice-plan` from the target if it does not exist, otherwise switch to it.
  - [ ] Run `node packages/cli/dist/index.js check > /tmp/263-check-baseline.txt` (after `pnpm -r build`) to capture this repo's `cf check` output before any change.
  - [ ] Success: `git branch --show-current` prints the branch name; the baseline file exists.

- [ ] **Task 0A: Amend the slice design with R1–R5 and the D8 correction** (effort: 2)
  - [ ] In `project-documents/user/slices/263-slice.retroactive-marker-and-existing-state-slice-plan.md`, record each resolution in the section it changes, so Phase 7 review compares the code to a design that matches it. Add a short "Resolutions" note under Technical Decisions naming R1–R5 as PM-approved, and edit the text itself:
    - **D3 (R2, R3):** the "One entry point" bullet says the navigator and `ruleReviewGate` both call `evaluateEntryGate`. Change it: the checker (`ruleReviewGate`) is the only caller; the navigator tests `entry.retroactive` directly and returns `complete` regardless of gating, because a retroactive slice has no design file. The skip meaning is one fact read in two places.
    - **D5 (R1, R5):** the Mechanism bullet says the resolver's decide step calls `completeAdoptionIfPlanRecorded`. Change it: decide calls the read-only `findRecordedPlan`; `persistAdoptionComplete` writes after the facts render (mirroring `persistInProgress`); `completeAdoptionIfPlanRecorded` stays as the composed export for 264. The completing build renders state `complete` with the plan path relative to the checkout; `decideOutcome` stays unchanged.
    - **D8:** the first bullet claims `retroactive` reaches `cf list slices --json` "with no extra code". Correct it: the JSON builds each entry field by field, so Task 7 carries `retroactive` through explicitly.
    - **API Contracts:** `evaluateEntryGate` takes `config: ConfigManager, resolved?: ResolvedGate` and returns `Promise<GateResult | null>` (null when gating is off for a non-retroactive entry); add optional `SliceStatus.retroactive?: boolean` (set only when true; appears in `workflow_status` and `workflow_next` as `activeSlice.retroactive`); show the three `adoptionCompletion.ts` exports.
    - **R4:** note in the `SlicePlanEntry` contract that the field is required and existing literals take `retroactive: false`.
  - [ ] Set the design's `dateUpdated` to the current date. Do not change its `status` or any other frontmatter.
  - [ ] Success: `grep -n "both call" ` on the design returns nothing; each of R1–R5 appears in the design.

- [ ] **Task 0C: Commit** — `docs: amend slice 263 design with approved task-breakdown resolutions`

### Parser (Development Approach step 1)

- [ ] **Task 1: Marker parsing and `SlicePlanEntry.retroactive`** (effort: 2)
  - [ ] In `packages/core/src/introspection/types.ts`, add required `retroactive: boolean` to `SlicePlanEntry` with a doc comment (D1/D2).
  - [ ] In `packages/core/src/introspection/parsers/slicePlanParser.ts`, define `RETROACTIVE_MARKER_RE` once, with a comment naming D1: a backticked `retroactive`, matched at the start of the text after the title's closing `**`, any letter case, any whitespace, backticks required.
  - [ ] Indexed entries: set `retroactive` from the regex and strip the token from `description` (a description of only the marker becomes absent, as `parseDescription` already does for empty text).
  - [ ] Unindexed (`fallback`) entries: always `retroactive: false`; the token is left in the text untouched.
  - [ ] Fix every `SlicePlanEntry` literal the compiler reports in `packages/*/src` and `packages/*/tests` by adding `retroactive: false` (R4).
  - [ ] The compiler does not flag `toEqual` assertions on parsed entries (`packages/core/tests/introspection/slicePlanParser.test.ts` lines ~12, 22, 36, 135, 145, 162, and any in other test files). Run the suite and add `retroactive: false` to each expected object that fails.
  - [ ] Success: `pnpm typecheck` passes; existing tests pass; `RETROACTIVE_MARKER_RE` appears once in `src`.

- [ ] **Task 1T: Parser tests** (effort: 2)
  - [ ] In `packages/core/tests/introspection/slicePlanParser.test.ts`, add a `describe('retroactive marker')` using a temp plan file:
    1. Real-format line, exactly as the Marker Specification gives it: `1. [x] **(100) Existing System** ` + backticked `retroactive` + ` — the system as built at adoption.` → `retroactive: true`, `status: complete`, description `the system as built at adoption.` (CLAUDE.md real-format rule).
    2. Same marker in other letter cases and with extra or no spaces around it → `retroactive: true`.
    3. A description that starts with the bare word "retroactive" (no backticks) → `retroactive: false`, description unchanged.
    4. An unindexed `**Name**` line followed by the marker → `retroactive: false`.
    5. A line with a bold prefix before the index (the #117 form) plus the marker → `retroactive: true`.
    6. An unmarked indexed entry → `retroactive: false`.
    7. A retroactive entry written `[ ]` → `retroactive: true`, status `not_started` (the parser does not promote it, D2).
  - [ ] Success: the new tests pass.

- [ ] **Task 1C: Commit** — `feat: parse the retroactive marker on slice plan entries`

### Review gate (Development Approach step 2)

- [ ] **Task 2: `GateSkip` and `evaluateEntryGate`** (effort: 2)
  - [ ] In `packages/core/src/introspection/reviewGate.ts`, add `RETROACTIVE_SKIP_REASON = 'retroactive'` and `RETROACTIVE_NOTE` (the display text "retroactive: recorded history, not reviewed"), each defined once.
  - [ ] Add `GateSkip { status: 'skipped'; reason; rationale }` and add it to the `GateResult` union. `isBlockingGate` is unchanged (false for it).
  - [ ] Add `evaluateEntryGate(projectPath, entry, boundary, config, resolved?)` per R2: for `entry.retroactive` and a slice-scoped boundary (`preTasks`, `preImplementation`, `preAdvance`) return `GateSkip` without reading files; when gating is off (config resolves to null) return null; otherwise delegate to `evaluateReviewGate(projectPath, entry.index, …)` unchanged. `preSlicePlan` always delegates.
  - [ ] Fix every `switch` over `GateResult` that the compiler flags.
  - [ ] Success: `pnpm typecheck` passes; no existing gate test changes.

- [ ] **Task 2T: `evaluateEntryGate` tests** (effort: 2)
  - [ ] In `packages/core/tests/introspection/reviewGate.test.ts` (follow its config and temp-dir setup), add tests:
    1. Retroactive entry at each of `preTasks`, `preImplementation`, `preAdvance` with gating on → `skipped`, reason `retroactive`, not `clears`, not `exempt`, `isBlockingGate` false.
    2. Retroactive entry with gating off → null.
    3. Retroactive entry at `preSlicePlan` → delegates (pending-review when no arch review exists).
    4. Non-retroactive entry → same result as `evaluateReviewGate` for pending, failed and clears fixtures.
    5. The skipped rationale contains `RETROACTIVE_NOTE` and the entry index.
  - [ ] Success: the new tests pass.

- [ ] **Task 3: Navigator: retroactive active slice is complete** (effort: 3)
  - [ ] In `packages/core/src/introspection/types.ts`, add optional `retroactive?: boolean` to `SliceStatus` (set only when true).
  - [ ] In `WorkflowNavigator.getStatus`, parse the slice plan before deriving the active slice (swap the two existing calls; `parseSlicePlanSafe` does not depend on the active slice), and pass the plan's entry for the active index to `deriveSliceStatus`.
  - [ ] In `deriveSliceStatus`, immediately after the index is known and before `detectDocuments`: if the entry is retroactive, return `{ ...base, status: 'complete', retroactive: true }` (R3). No gate is evaluated.
  - [ ] In `packages/mcp-server/src/tools/workflowTools.ts`, add `retroactive?` to the `workflow_status` description's response-shape string. No handler change.
  - [ ] In `getNext`'s `enrich` helper, when `slice.retroactive` is true append `RETROACTIVE_NOTE` to the rationale, next to the existing `gateExempt` note.
  - [ ] Success: `pnpm typecheck` passes; existing navigator tests pass unchanged.

- [ ] **Task 3T: Navigator tests** (effort: 2)
  - [ ] Create `packages/core/tests/introspection/WorkflowNavigator.retroactive.test.ts`, following `WorkflowNavigator.derivedStatus.test.ts` for setup. Plan: `(100)` and `(101)` retroactive `[x]`, `(102)` unchecked.
    1. Active slice 100, no design or task file, gating off → `activeSlice.status` `complete`, `retroactive` true.
    2. Same with `workflow.review_enabled` true → `complete`, no `pendingReview`/`gateInfo`.
    3. `getNext` for active slice 100 → recommendation advances to slice 102 with `suggestedCommand` `cf set slice 102`; rationale contains `RETROACTIVE_NOTE`.
    4. Active slice 102 (non-retroactive, no design) → still `needs-design`.
  - [ ] Success: the new tests pass.

- [ ] **Task 3C: Commit** — `feat: skip the review gate for retroactive slice plan entries`

- [ ] **Task 4: Checker: `ruleReviewGate` uses the entry gate; per-plan skip info** (effort: 3)
  - [ ] In `ConsistencyChecker.safeEvaluateGate` / `ruleReviewGate`, when `planEntry` is non-null call `evaluateEntryGate` instead of `evaluateReviewGate`; a null `planEntry` keeps the current call. A `skipped` result produces no finding and does not enter the `exemptReason` or weak-clear branches.
  - [ ] Create `packages/core/src/introspection/retroactiveRules.ts` with `retroactiveSkipFindings(plans: SlicePlanResult[]): ConsistencyFinding[]` (D3): one `info` finding per plan that has retroactive entries, rule `review-gate`, location the plan path, description "Slices 100–104 are retroactive: recorded history, not reviewed. The review gate skips them." Consecutive indices collapse into `A–B` ranges, other indices are comma-separated; `fixable: false`. Unlike the `review: none` info it is emitted whether or not entries are checked.
  - [ ] In `checkAll`, after the per-slice loop and only when `resolvedGate !== null`, push `retroactiveSkipFindings([...parsedPlans.values()])`.
  - [ ] Success: `pnpm typecheck` passes; existing checker tests pass.

- [ ] **Task 4T: Skip-info and gate tests** (effort: 2)
  - [ ] In a new `packages/core/tests/introspection/ConsistencyChecker.retroactive.test.ts` (setup as in `ConsistencyChecker.reviewGate.test.ts`), with gating on:
    1. Plan with retroactive 100–101 and 103, plus one new entry → exactly one `review-gate` info naming `100–101, 103` as retroactive and not reviewed; no `pending-review` or `review-failed` finding for them.
    2. A retroactive entry that also has a slice design and no review → no `pending-review` finding (the structural error comes in Task 5).
    3. Gating off → no skip info.
    4. Two plans, each with retroactive entries → one info per plan.
    5. No output text calls a retroactive entry reviewed, cleared or exempt.
  - [ ] Success: the new tests pass.

- [ ] **Task 4C: Commit** — `feat: report skipped retroactive entries in the review-gate check`

### Checker rule (Development Approach step 3)

- [ ] **Task 5: `ruleRetroactiveEntries` and its `checkAll` call** (effort: 3)
  - [ ] In `retroactiveRules.ts`, add `ruleRetroactiveEntries(projectPath, plans: SlicePlanResult[]): Promise<ConsistencyFinding[]>` (D4). Rule id `retroactive-entry` (define once), severity `error`, `fixable: false`, location the plan path. One finding per cause, three causes, using the design's message text:
    1. **Has a design or task file:** `detectDocuments(projectPath, entry.index)` returns a `sliceDesign` or `taskFile`.
    2. **Not checked:** `entry.isChecked` is false (`[ ]` or `[~]`).
    3. **Indexed after new work:** the entry's index is greater than the lowest index of any non-retroactive, non-deprecated, `explicit`-index entry across all supplied plans.
  - [ ] Only `explicit`-index entries are considered (a `fallback` entry is never retroactive).
  - [ ] In `ConsistencyChecker.checkAll`, push `ruleRetroactiveEntries(projectPath, [...parsedPlans.values()])` once, after the per-slice loop. It runs whether or not gating is on (the rule is structural).
  - [ ] Success: `pnpm typecheck` passes; the file is under ~150 lines.

- [ ] **Task 5T: Rule and `checkAll` tests** (effort: 4)
  - [ ] In `ConsistencyChecker.retroactive.test.ts` or a new `retroactiveRules.test.ts` in `packages/core/tests/introspection/`, call `ruleRetroactiveEntries` with temp-dir plans:
    1. Valid plan (retroactive 100–101 checked, new 102 unchecked, no files for 100–101) → no findings.
    2. Retroactive 101 with `slices/101-slice.cli.md` → one error naming slice 101 and the design file.
    3. Retroactive 101 with `tasks/101-tasks.cli.md` → one error.
    4. Retroactive 101 with `[ ]` and again with `[~]` → one error each ("check it, or remove the marker").
    5. Retroactive 103 after new entry 102 → one ordering error for 103.
    6. Ordering across plans: new entry 102 in plan A, retroactive 103 in plan B → error.
    7. A deprecated entry (`[~]`) with a lower index than a retroactive entry does not trigger the ordering error.
    8. A fallback-index entry never produces a finding.
  - [ ] Then run `checkAll` on temp projects (same test file):
    1. Valid adopted plan, gating on → no `retroactive-entry` findings; the skip info present.
    2. Retroactive entry with a design file → `retroactive-entry` error in the result and a non-zero error count; gating off gives the same error.
    3. A project with no retroactive entries → no `retroactive-entry` or retroactive skip finding (this repo's `cf check` output must stay unchanged).
    4. Plan-status rule (Success Criteria): a plan whose entries are all retroactive and checked, with frontmatter `status: in_progress` → one `plan-status-vs-entries` finding suggesting `complete`; with `status: complete` → none. Its `parseSlicePlan` counts already come from the checkbox, so no rule code changes.
  - [ ] Success: the new tests pass.

- [ ] **Task 5C: Commit** — `feat: add the retroactive-entry check rule`

### Schema and display (Development Approach step 4)

- [ ] **Task 6: `provenance` in the architecture schema, with tests** (effort: 2)
  - [ ] In `packages/core/src/schema/frontmatterSchema.ts`, add `provenance: { required: false, values: ['derived'] }` to `architecture`, with a one-line comment naming D7 (informational only; no behavior branches on it). Define the `'derived'` value once if the file already uses a constant pattern for values.
  - [ ] In `packages/core/tests/schema/` (the existing frontmatter schema test file), add: `provenance: derived` on an architecture validates; `provenance: guessed` yields a `frontmatter-schema` finding naming `provenance`; an architecture without it validates.
  - [ ] Success: `pnpm typecheck` passes; the new tests pass.

- [ ] **Task 7: Display: retroactive entries in `cf list slices`** (effort: 2)
  - [ ] In `packages/cli/src/output/entryStatusDisplay.ts`, give `renderEntryStatus` an optional third parameter `retroactive`; for a checked complete retroactive entry return `✓ retroactive` (styled like `✓ complete`). All other combinations are unchanged. Branch on the boolean, never on the label.
  - [ ] In `packages/cli/src/commands/slice.ts` (line ~188), pass `e.retroactive`. Do not change `arch.ts` (architecture entries have no marker).
  - [ ] `cf list slices --json` builds each entry field by field (`slice.ts` ~line 171), so `retroactive` is not carried automatically. Carry it through the entries built near line 89 and add `retroactive: e.retroactive` to the JSON mapping.
  - [ ] Success: `pnpm typecheck` passes.

- [ ] **Task 7T: Display tests** (effort: 1)
  - [ ] In `packages/cli/tests/output/` (the existing entry status display test, or a new `entryStatusDisplay.test.ts`): checked + retroactive → contains `retroactive` and not `complete`; unchecked + retroactive → unchanged from the non-retroactive label; non-retroactive paths unchanged.
  - [ ] Add a slice-list test in `packages/cli/tests/commands/` (create one if none exists): its JSON includes `retroactive: false` for ordinary entries and `true` for a marked one.
  - [ ] Success: the new tests pass.

- [ ] **Task 7C: Commit** — `feat: show retroactive entries and derived-architecture provenance`

### Adoption completion (Development Approach step 5)

- [ ] **Task 8: `adoption-completed` outcome and notice** (effort: 2)
  - [ ] In `packages/core/src/adoption/adoptionOutcome.ts`, add `{ kind: 'adoption-completed'; planPath: string }` to `AdoptionOutcome`. `decideOutcome` is unchanged (R5).
  - [ ] In `adoptionFacts.ts`: handle the kind in `describeOutcome` ("adoption completed by this build") and `describeSourceVolume` (null). Change `describeState` to take the outcome as a third parameter (its only caller is `renderAdoptionFacts`); when the outcome is `adoption-completed` it renders: `adoption.state: complete. adoption.state was set to complete by this build: existing-state slice plan found at {planPath}. Adoption is finished; run `cf next` for the next step.` (exact text from D5; the plan path is relative to the checkout).
  - [ ] In `adoptionResolver.ts`, add the kind to `isSelected` (selected, `true`).
  - [ ] Success: `pnpm typecheck` passes (the `never` defaults flag any missed site).

- [ ] **Task 8T: Renderer tests** (effort: 1)
  - [ ] In `packages/core/tests/adoption/adoptionFacts.test.ts`: input with outcome `adoption-completed` and state `complete` renders the notice text with the plan path, an outcome line, no source-volume line, and the squadron lines as before. Existing cases unchanged.
  - [ ] Success: the new tests pass.

- [ ] **Task 9: `adoptionCompletion.ts`** (effort: 3)
  - [ ] Create `packages/core/src/adoption/adoptionCompletion.ts` with a header comment naming D5 and 264's later swap. Imports: `findPlanningArtifacts`, `parseSlicePlan`, `readAdoptionState`/`writeAdoptionState`, `AdoptionError`.
  - [ ] `findRecordedPlan(checkoutPath): Promise<string | null>` (R1): from `findPlanningArtifacts`, keep absolute paths whose file name matches `nnn-slices.*.md` (a named constant; `ARCH_FILE_PATTERN` also matches arch and hld, so it cannot be reused), parse each in sorted order with `parseSlicePlan`, return the first path with at least one `retroactive` entry, else null. A plan with no retroactive entry does not count.
  - [ ] `persistAdoptionComplete(checkoutPath): Promise<void>`: `writeAdoptionState(checkoutPath, 'complete')`; a failure throws `AdoptionError` naming `.context-forge.toml` and the remedy `cf config set adoption.state complete`, with `cause` (same shape as `persistInProgress` in the resolver).
  - [ ] `completeAdoptionIfPlanRecorded(checkoutPath)` per the design contract: `{ completed: false } | { completed: true; planPath }`; finds, then persists.
  - [ ] Export all three from `adoption/index.ts`.
  - [ ] Success: `pnpm typecheck` passes; file under ~120 lines.

- [ ] **Task 9T: Completion tests** (effort: 3)
  - [ ] Create `packages/core/tests/adoption/adoptionCompletion.test.ts` with temp checkouts (setup as in `adoptionResolver.test.ts`):
    1. No planning artifacts → `findRecordedPlan` null; `completeAdoptionIfPlanRecorded` returns `{ completed: false }` and writes nothing.
    2. A `100-slices.*.md` with only ordinary entries → null.
    3. A `100-slices.*.md` with the real-format retroactive line → returns that path; `completeAdoptionIfPlanRecorded` returns `completed: true` with the path and `readAdoptionState` is `complete`.
    4. A retroactive line in a `100-arch.*.md` (not a slice plan) → null.
    5. Two plans, marker only in the second → the second path; both with markers → the lowest-sorted path.
    6. Unwritable `.context-forge.toml` (or a stubbed `writeAdoptionState` that throws) → `AdoptionError` whose message names `.context-forge.toml` and `cf config set adoption.state complete`.
  - [ ] Success: the new tests pass.

- [ ] **Task 10: Resolver wiring** (effort: 3)
  - [ ] In `adoptionResolver.ts` `decide`, take the `stateWrites` mode. When `state === 'in_progress'` and the mode is `persist` and the instruction is not explicit: call `findRecordedPlan`; a non-null path gives outcome `{ kind: 'adoption-completed', planPath }` (R1); otherwise 261's `adoption-in-progress` as today. `read-only` (`template_preview`) never completes.
  - [ ] In the resolver body, treat completion like `stateSetByBuild`: render the facts with state `complete` and the plan path relative to the checkout (R5), and after the facts render call `persistAdoptionComplete`. Selection is still the brownfield prompt, so the instruction and `fileComprehension` handling are unchanged.
  - [ ] Success: `pnpm typecheck` passes; 261/262 resolver tests pass unchanged.

- [ ] **Task 10T: Resolver tests** (effort: 3)
  - [ ] In `packages/core/tests/adoption/adoptionResolver.test.ts` (fake probe injected, per 262 R4):
    1. `in_progress`, persisting, slice plan with a retroactive entry → selected, facts contain the completion notice, `readAdoptionState` is `complete`.
    2. Same with `read-only` → facts show 261's in-progress flow, state stays `in_progress`.
    3. `in_progress`, plan without retroactive entries → state stays `in_progress`, 261 flow.
    4. State `complete` (next build) → `{ selected: false }`.
    5. Guide missing the brownfield profile → `AdoptionError` thrown and the state is still `in_progress` (write happens after the guide check).
    6. Explicit `brownfield-adoption` instruction → no completion, state unchanged.
  - [ ] Success: the new tests pass.

- [ ] **Task 10C: Commit** — `feat: complete adoption when an existing-state slice plan is recorded`

### Integration and verification (Development Approach step 6)

- [ ] **Task 11: Adopted-project integration fixture and test** (effort: 3)
  - [ ] Build the fixture in a temp dir inside the test (not a checked-in tree): `architecture/100-arch.existing.md` (`provenance: derived`, valid frontmatter) and `architecture/100-slices.existing.md` with three retroactive `[x]` entries (100–102) and two new entries (103, 104) written in the real format, with `workflow.review_enabled` true. The derived architecture is ordinary process work and its `preSlicePlan` gate applies (D7), so with no architecture review the checker also emits a `review-gate` pending-review warning located at `100-arch.existing.md`. Expect it; do not add a review file to hide it.
  - [ ] Add `packages/core/tests/introspection/retroactive.integration.test.ts` driving `ConsistencyChecker.checkAll`, `WorkflowNavigator.getNext` (active slice 100, then no active slice), and the plan parser. Assert: no `retroactive-entry` findings and no `pending-review` finding located at the slice plan or for slices 100–102 (filter by location; the arch-gate warning for `100-arch.existing.md` is expected and asserted present); exactly one retroactive skip info; `provenance` validates; next action after 100 is slice 103; plan statuses complete/complete/complete/not started/not started.
  - [ ] Add a CLI-level test (in `packages/cli/tests/integration/` following an existing test there) that `list slices --json` on the fixture shows `retroactive` true for 100–102 and false for 103–104.
  - [ ] Success: the new tests pass.

- [ ] **Task 12: Full validation and walkthrough** (effort: 2)
  - [ ] Run `pnpm -r build`, then format (if the repo has a format script), `pnpm lint`, `pnpm typecheck` and `pnpm test` once each; fix failures.
  - [ ] Run `cfl check` in this repo and diff it against `/tmp/263-check-baseline.txt` from Task 0; the output must be unchanged (no plan here uses the marker).
  - [ ] Run the design's Verification Walkthrough steps 1–6 against a scratch copy, using the local build. In step 4 `cfl check` also shows the expected arch-gate pending-review warning for `100-arch.existing.md` (D7); only the absence of `pending-review` for slices 100 and 101 is checked. Record each step's result in the slice's walkthrough notes (as slice 262 did).
  - [ ] Success: all checks pass; every walkthrough step shows its expected output.

- [ ] **Task 12C: Commit** — `test: add retroactive marker integration coverage`

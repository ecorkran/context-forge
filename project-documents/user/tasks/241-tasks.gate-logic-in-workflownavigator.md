---
docType: tasks
slice: gate-logic-in-workflownavigator
project: context-forge
lldReference: project-documents/user/slices/241-slice.gate-logic-in-workflownavigator.md
dependencies: [240]
projectState: >
  Slice 240 (foundation) is complete and merged to main: DocumentDetectionResult.review,
  detectDocuments(path, index, reviewType?), the workflow.review_* config keys, and the
  reserved LIFECYCLE: review-gate branch in getNext() all exist. WorkflowNavigator currently
  takes no config and getNext(project) reads only ProjectData + filesystem. This slice adds
  the review gate covering all four lifecycle boundaries, with reviewType derived from position.
dateCreated: 20260702
dateUpdated: 20260704
status: complete
---

# Tasks: Gate Logic in WorkflowNavigator (Slice 241)

## Context Summary

Slice 241 fills the reserved `LIFECYCLE: review-gate` branch with the full review gate. The review type is **derived from lifecycle position** (`arch`/`slice`/`tasks`/`code`), never configured. A standalone `reviewGate.ts` module owns the decision logic (position→type, verdict normalization, decision matrix, config resolution) so slice 242 can reuse it. `WorkflowNavigator` gains an optional `ConfigManager` constructor dependency; gating off ⇒ identical behavior to today. Two new slice statuses (`pending-review`, `review-failed`) flow through `deriveSliceStatus()`; `getNext()` routes them to `review`/`blocked` recommendations.

**Key files (all under `packages/`):**
- `core/src/introspection/types.ts` — `SliceStatus`, `NormalizedStatus`, new `STATUS` const
- `core/src/introspection/reviewGate.ts` — **new** evaluator module
- `core/src/introspection/WorkflowNavigator.ts` — config injection, gate evaluation, branch fill
- `core/src/introspection/parsers/frontmatterParser.ts` — existing, read `verdict` (never throws)
- `core/src/introspection/parsers/documentDetector.ts` — existing, `detectDocuments(...reviewType)`
- `core/src/config/ConfigManager.ts` / `ConfigKeys.ts` — existing, read review keys
- `cli/src/commands/next.ts`, `status.ts` — wire `ConfigManager`
- `mcp-server/src/tools/workflowTools.ts` — wire `ConfigManager` (2 sites)

**Reference:** design TDs — TD-1 (module), TD-2 (matrix), TD-3 (status derivation routes), TD-4 (position-derived; review_type keys inert), TD-5 (code trigger = checkbox), TD-6 (STATUS const), TD-7 (additive vocabulary), TD-8 (config error handling / fail-fast).

**Conventions:** no `any`; explicit return types on exported functions; no magic strings (use `STATUS`, `BOUNDARY_REVIEW_TYPE`, named token unions); functions ≤ ~50 lines; test-with pattern (test task follows each impl task).

---

## Task 1 — Branch and baseline

- [ ] 1.1 Confirm working branch and clean baseline
  - Verify you are on the slice branch for implementation. Per Git Rules, Phase 6 implementation of slice 241 belongs on `{root}/241-slice.gate-logic-in-workflownavigator` (read `cf config get git.branch_root` for `{root}`). **Correction (20260703):** `git.branch_root` resolves empty/default (`config.toml` is empty) — the note below assuming `dev/erik` was stale. Branch created as `241-slice.gate-logic-in-workflownavigator` (no prefix), confirmed with PM. If the branch does not exist, create it from `main`: `git checkout -b 241-slice.gate-logic-in-workflownavigator main`.
  - Run `pnpm -r build` and note the current state. Known pre-existing failures (NOT introduced here, do not fix in this slice): 3 in `packages/core/tests/storage/FileProjectStore.test.ts`, 4 in `packages/cli/tests/commands/list.test.ts`.
  - Success: on the correct slice branch; build green; the 7 known failures are the only failures.

---

## Task 2 — Types: new statuses and the STATUS constant (design TD-6)

- [x] 2.1 Add `pending-review` and `review-failed` to `SliceStatus`
  - In `core/src/introspection/types.ts`, extend the `SliceStatus.status` union (currently `'needs-design' | 'needs-tasks' | 'in-implementation' | 'complete' | 'no-active-slice'`) to add `'pending-review'` and `'review-failed'`.
  - Success: type compiles; TypeScript may flag non-exhaustive switches over status elsewhere — that is expected and guides later tasks.

- [x] 2.2 Introduce the `STATUS` const and derive `NormalizedStatus`
  - In `types.ts`, add:
    ```ts
    export const STATUS = {
      Complete: 'complete',
      InProgress: 'in-progress',
      NotStarted: 'not-started',
      Deprecated: 'deprecated',
    } as const;
    export type NormalizedStatus = (typeof STATUS)[keyof typeof STATUS];
    ```
  - Replace the existing hand-written `type NormalizedStatus = 'complete' | ...` union with the derived form. The resulting union must be **byte-identical** — do not change any string value.
  - Do **not** sweep the ~50 existing literal sites — that is maintenance slice 910. Only introduce the const here.
  - Success: `NormalizedStatus` unchanged in shape; `pnpm --filter @context-forge/core build` clean.

- [x] 2.3 Test: types/STATUS
  - Add a small unit test asserting `STATUS.Complete === 'complete'` (and the other three), and a type-level check that `NormalizedStatus` still admits exactly the four values (a compile-time assignment test is sufficient).
  - Success: test passes; confirms the const↔union equivalence.

- [x] 2.4 Commit checkpoint — types + STATUS
  - Commit the type changes and the STATUS const (Tasks 2.1–2.3) on the slice branch (e.g. `feat(core): add review slice statuses and STATUS const`). Small coherent unit; a save point before the new module.
  - Success: committed; `pnpm --filter @context-forge/core build` clean.

---

## Task 3 — `reviewGate.ts` evaluator (design TD-1, TD-2, TD-4)

- [x] 3.1 Create the module scaffold and type vocabulary
  - Create `core/src/introspection/reviewGate.ts`. Define the named unions and the boundary→type map (single source of truth, no magic strings):
    ```ts
    export type Verdict = 'PASS' | 'CONCERNS' | 'FAIL' | 'UNKNOWN';
    export type ThresholdToken = 'pass' | 'concerns';
    export type UnknownPolicy = 'fail' | 'concerns' | 'pass';
    export type GateOutcome = 'clears' | 'pending' | 'failed';
    export type Boundary = 'preSlicePlan' | 'preTasks' | 'preImplementation' | 'preAdvance';
    const BOUNDARY_REVIEW_TYPE = {
      preSlicePlan: 'arch', preTasks: 'slice',
      preImplementation: 'tasks', preAdvance: 'code',
    } as const;
    ```
  - Success: module compiles; exports the types.

- [x] 3.2 Implement `positionToReviewType` and `normalizeVerdict`
  - `positionToReviewType(boundary: Boundary): string` → `BOUNDARY_REVIEW_TYPE[boundary]`.
  - `normalizeVerdict(raw: string | undefined): Verdict` → uppercase, match the known set, anything absent/unrecognized → `'UNKNOWN'`. This narrows **untrusted external** frontmatter (TD-8: verdict degrades to UNKNOWN, does not throw).
  - Success: explicit return types; no `any`.

- [x] 3.3 Test: `positionToReviewType` and `normalizeVerdict`
  - Each boundary maps to its type (`preAdvance`→`code`, `preTasks`→`slice`, `preImplementation`→`tasks`, `preSlicePlan`→`arch`).
  - `normalizeVerdict`: `'PASS'`/`'pass'`/`' concerns '`(trimmed?) map correctly; `undefined`, `''`, `'garbage'` → `UNKNOWN`. (Decide and test whether whitespace/case tolerance is in scope — the frontmatter parser already trims values; document the choice.)
  - Success: all cases covered.

- [x] 3.4 Implement `evaluateVerdict` (the decision matrix, TD-2)
  - `evaluateVerdict(verdict: Verdict, threshold: ThresholdToken, unknownAs: UnknownPolicy): GateOutcome`.
  - `PASS` → `clears`. `FAIL` → `failed`. `CONCERNS` → `clears` if `threshold==='concerns'`, else `failed`. `UNKNOWN` → substitute the stand-in verdict per `unknownAs` (`fail`→FAIL, `concerns`→CONCERNS, `pass`→PASS) then apply the same table.
  - Returns only `clears`/`failed` here (the `pending` outcome is the navigator's, from the absent-artifact signal). Use an exhaustive `switch` over `Verdict`.
  - Success: matrix implemented; no fall-through defaults masking a missing case.

- [x] 3.5 Test: `evaluateVerdict` full matrix
  - Cover `{PASS, CONCERNS, FAIL, UNKNOWN} × {threshold: pass, concerns} × {unknownAs: fail, concerns, pass}` where meaningful. Explicitly assert: `CONCERNS`+`pass`→`failed`; `CONCERNS`+`concerns`→`clears`; `UNKNOWN`+`unknownAs=concerns`+`threshold=concerns`→`clears`; `UNKNOWN`+`unknownAs=concerns`+`threshold=pass`→`failed`; `UNKNOWN`+`unknownAs=fail`→`failed`; `UNKNOWN`+`unknownAs=pass`→`clears`.
  - Success: every documented cell of the matrix has an assertion.

- [x] 3.6 Implement `resolveGateConfig` with fail-fast validation (TD-4, TD-8)
  - `resolveGateConfig(config: ConfigManager): Promise<ResolvedGate | null>`.
  - Read `workflow.review_enabled`; narrow with `=== true`. If not true → return `null` (gating off; caller skips — no artifact lookup).
  - Read `workflow.review_threshold` and `workflow.review_unknown_as`. Validate each against its token set via small `parseThresholdToken`/`parseUnknownPolicy` helpers that **throw a descriptive config error** (naming key, bad value, allowed values) on mismatch — do NOT coerce to default (TD-8 (b): config is the project's own policy, fail fast).
  - If per-gate `threshold` override keys are consumed (TD-4 retains `threshold`, drops `review_type` reliance), resolve the boundary-specific threshold here: override if non-empty, else global. Empty string = "use global".
  - Do **not** wrap `config.get()` in a swallow-all catch — a genuine read/parse failure must propagate (TD-8 (a)). (A *missing* config file is not a failure: `ConfigManager` returns the default `review_enabled=false` → gating off.)
  - `ResolvedGate` shape: `{ threshold: ThresholdToken; unknownAs: UnknownPolicy; thresholdFor(boundary): ThresholdToken }` (or equivalent) — expose enough for the navigator to evaluate any boundary.
  - Success: explicit types; invalid token throws; missing config yields `null`; read failure propagates.

- [x] 3.7 Test: `resolveGateConfig`
  - Use a stub/fake `ConfigManager` (inject values) — no real filesystem.
  - `review_enabled=false` (and default/missing) → `null`.
  - `review_enabled=true`, valid tokens → populated `ResolvedGate`; per-gate threshold override beats global; empty override falls back to global.
  - Invalid `review_threshold` (`'foobar'`) → throws with a message naming the key and allowed values. Same for `review_unknown_as`.
  - A `config.get` that rejects/throws (unreadable config) → `resolveGateConfig` propagates (does not return `null`, does not swallow).
  - Success: all three TD-8 outcomes (missing→off, invalid→throw, unreadable→propagate) asserted.

- [x] 3.8 Commit checkpoint — reviewGate module
  - Commit the `reviewGate.ts` module and its unit tests (Tasks 3.1–3.7) on the slice branch with a semantic message (e.g. `feat(core): add reviewGate evaluator for review gating`). This is a coherent, independently testable unit — a save point before touching the navigator.
  - Success: module + tests committed; suite green for the new tests.

---

## Task 4 — Test fixtures (verdict-bearing reviews)

Fixtures come **before** the navigator work: the navigator gate tests (Task 5) point `project.projectPath` at these fixtures, so they must exist first. The `reviewGate` unit tests (Task 3) needed no fixtures (they inject stubs), which is why fixtures land here rather than earlier.

- [x] 4.1 Add verdict-bearing review fixtures
  - The slice 240 fixtures under `core/tests/fixtures/introspection/project/.../reviews/` carry NO `verdict` field (discovery-only). Add fixtures with `verdict` frontmatter for the boundaries under test. At minimum, for the `code` type: a `PASS`, a `CONCERNS`, a `FAIL`, and a **present-but-no-`verdict`** artifact (a file that exists with valid frontmatter but no `verdict:` key — for the UNKNOWN path); plus an absent-file case (simply do not create the file for that index). Add at least one `arch` and one `slice` verdict fixture to exercise those boundaries.
  - Keep fixtures small; mirror the real frontmatter shape (`verdict: FAIL`, uppercase). Choose indices that do not collide with existing fixture expectations, or extend the existing fixture project consistently (update any hardcoded doc-count assertions if the shared fixture tree is walked — as happened in slice 240 with `ProjectModelBuilder.test.ts`).
  - Success: fixtures exist (including the present-but-no-`verdict` one); no unrelated fixture-count test breaks (fix counts if the shared tree grew).

---

## Task 5 — WorkflowNavigator: config injection and gate evaluation (design TD-3, TD-5)

- [x] 5.1 Add optional `ConfigManager` constructor dependency
  - In `WorkflowNavigator.ts`, add `constructor(private readonly config?: ConfigManager) {}`. Import `ConfigManager` (and `reviewGate` helpers) via the core config/introspection paths.
  - No behavior change yet — the field is unused until 5.2.
  - Success: compiles; all existing no-arg `new WorkflowNavigator()` call sites still valid.

- [x] 5.2 Evaluate the gate inside `deriveSliceStatus()` (code + slice + tasks boundaries)
  - Introduce a private helper (e.g. `evaluateGate(project, projectPath, boundary): Promise<GateStatus | null>`) that: calls `resolveGateConfig(this.config)`; if `null` (gating off or no config) returns `null` (caller keeps existing status). Otherwise derives the reviewType via `positionToReviewType(boundary)`, calls `detectDocuments(projectPath, index, reviewType)`, and:
    - `review === null` → outcome `pending` → return `pending-review`.
    - else `parseFrontmatter(join(projectPath, review))` → `evaluateVerdict(normalizeVerdict(data.verdict), threshold, unknownAs)`; `clears` → `null` (keep going/complete), `failed` → return `review-failed`. Note: a present file whose `verdict` is absent/unrecognized/unreadable normalizes to `UNKNOWN` here and is resolved by `unknownAs` — it must never be treated as `pending` (that would imply "not yet reviewed") and must never silently clear (TD-2/TD-8).
  - Wire the boundaries in `deriveSliceStatus`:
    - **pre-advance (`code`)**: at the point tasks are `STATUS.Complete` (currently returns `complete`), evaluate the `preAdvance` gate first; if it returns a gated status, return that instead (TD-5: checkbox completion is the trigger; do NOT inspect git).
    - **pre-implementation (`tasks`)**: at the `in-implementation` determination boundary — evaluate `preImplementation` when tasks exist but implementation not started. (Confirm exact trigger from the design's boundary table; only gate the *transition out of* task-breakdown.)
    - **pre-tasks (`slice`)**: at the `needs-tasks` boundary (design exists, no task file) — evaluate `preTasks`.
  - Use `STATUS.Complete` (not the literal) for the completion comparison. Keep gating strictly behind "config present AND enabled" so the gating-off path is byte-identical.
  - Success: statuses set correctly per boundary; gating-off path unchanged.

- [x] 5.3 Evaluate the pre-slice-plan (`arch`) boundary in the no-active-slice path
  - In `getNext()`'s `no-active-slice` / "architecture exists but no slice plan" branch, evaluate the `preSlicePlan` gate (reviewType `arch`, index = the arch/initiative index) before recommending slice-plan creation. When it gates, surface `pending-review`/`review-failed` routing rather than the create-slice-plan recommendation.
  - Note: this path is not a `SliceStatus` on an active slice — decide (per design) whether to represent it via the same recommendation routing directly here. Keep the gating-off behavior identical.
  - Success: arch gate fires only when enabled and configured; otherwise the existing slice-plan recommendation is unchanged.

- [x] 5.4 Fill the reserved `LIFECYCLE: review-gate` branch in `getNext()` (TD-7)
  - Replace the reserved placeholder comment (between `in-implementation` and `complete-advance`) with the routing branch: when `slice.status === 'pending-review'` return the `review` recommendation; when `'review-failed'` return the `blocked` recommendation. Use `enrich()` and the warnings pattern like sibling branches.
  - Rationale strings must name the review type; `review-failed` also names the verdict and threshold (TD-7). No new field on `NextAction` — additive `recommendation` strings only.
  - Success: both statuses route to their recommendations; `NextAction` shape unchanged.

- [x] 5.5 Test: navigator gate behavior (all boundaries)
  - Construct the navigator with a stub `ConfigManager` and point `project.projectPath` at the Task 4 fixtures. For each boundary assert: absent artifact → `pending-review`/`review`; `FAIL` → `review-failed`/`blocked`; clearing verdict → prior status/recommendation unchanged; correct reviewType is sought per boundary.
  - **Present-but-no-`verdict` path (integration-level, per review F002):** using the present-but-no-`verdict` fixture, assert that under default `unknownAs=fail` the boundary produces `review-failed` (NOT `pending-review`, NOT silently cleared); and under `unknownAs=pass` the same fixture clears. This confirms the "present file, missing/malformed verdict → UNKNOWN → unknownAs" guarantee end-to-end at the navigator, not just in the `reviewGate` unit tests.
  - Assert `review-failed` rationale contains the verdict and threshold; `pending-review` rationale names the review type.
  - Success: each boundary has clears/pending/failed coverage, plus the present-but-no-verdict UNKNOWN assertion.

- [x] 5.6 Test: gating-off regression (conservative-by-default)
  - Construct the navigator (a) with no config, and (b) with a stub where `review_enabled=false`. Assert the full set of existing `getNext` recommendations for representative fixtures (needs-design, needs-tasks, in-implementation, complete→advance) is **unchanged** from pre-241 (extend the 240 baseline test). Assert no artifact lookup occurs when gating is off.
  - Success: byte-identical recommendations with gating off.

- [x] 5.7 Commit checkpoint — navigator gate
  - Commit the navigator changes and their tests (Tasks 5.1–5.6) on the slice branch (e.g. `feat(core): wire review gate into WorkflowNavigator`). Coherent save point before surface wiring.
  - Success: navigator work committed; suite green (modulo the 7 known pre-existing failures).

---

## Task 6 — Surface wiring (CLI + MCP)

- [x] 6.1 Wire `ConfigManager` into CLI `next` and `status`
  - In `cli/src/commands/next.ts` and `status.ts`, construct `new ConfigManager(project.projectPath)` (using the already-worktree-resolved project path) and pass it to `new WorkflowNavigator(config)`.
  - Success: `cf next` / `cf status` read gate config at project/worktree scope.

- [x] 6.2 Wire `ConfigManager` into MCP workflow tools
  - In `mcp-server/src/tools/workflowTools.ts`, at both `new WorkflowNavigator()` sites (getStatus ~:154, getNext ~:200), construct and pass `new ConfigManager(project.projectPath)`.
  - Success: `workflow_next` / `workflow_status` inherit the gate identically.

- [x] 6.3 Test: surfaces pass config; existing CLI/MCP tests pass
  - Confirm existing CLI (`next`, `status`) and MCP (`workflowTools`) tests still pass with the wiring. Add one CLI or MCP test that, with gating enabled + a FAIL review fixture, the surface reports the `blocked` recommendation end-to-end.
  - Success: no regressions; one end-to-end gated assertion.

---

## Task 7 — Build, full suite, and design walkthrough

- [x] 7.1 Build and run the full suite
  - `pnpm -r build` (clean). `pnpm --filter @context-forge/core test reviewGate` and `... test WorkflowNavigator` green. Full `pnpm -r test`: only the 7 known pre-existing failures remain; zero new failures. Fix any fixture-count assertions this slice perturbed.
  - Success: build clean; no new failures.

- [x] 7.2 Execute the design Verification Walkthrough
  - Run the design's Verification Walkthrough (steps 1–8) against a scratch project (`--project <scratch>` so real config is untouched): gating-off no-change; enable; pre-advance pending→FAIL blocked→CONCERNS clears; pre-tasks slice-type; tighten threshold to `pass`. Capture actual output; correct the walkthrough in the design doc if any command/output differs (as was needed in slice 240).
  - Success: walkthrough reproduces; design doc walkthrough matches reality.

- [x] 7.3 Update docs/frontmatter and commit
  - Add a CHANGELOG `[Unreleased]` entry (review gate now active behind `workflow.review_enabled`; new `pending-review`/`review-failed` statuses and `review`/`blocked` recommendations). Set the slice design and this task file frontmatter `status: complete`, `dateUpdated` to the implementation date. Delegate checkbox updates to `task-checker`.
  - Final commit checkpoint: commit the surface wiring (Task 6), fixtures (Task 4 if not already), CHANGELOG, and frontmatter on the slice branch with a semantic message. (Earlier checkpoints at 2.4, 3.8, 5.7 already saved types/reviewGate/navigator.) Do NOT run the code review here — that is a separate step.
  - Success: docs updated; all work committed on the slice branch across the distributed checkpoints.

---

## Notes / Deferred

- **Slice 242** imports `reviewGate.ts` (`normalizeVerdict`/`evaluateVerdict`/`resolveGateConfig`) for the ConsistencyChecker rule — keep the module's exports stable and navigator-free.
- **Slice 910** sweeps the ~50 pre-existing `NormalizedStatus` literals to reference the `STATUS` const introduced in Task 2.2. Do not do that sweep here.
- **TD-4 open call:** whether to leave the 240 per-gate `review_type` config keys inert (recommended, backward-compatible) or delete them. This slice assumes *inert*; if the PM elects removal, that is a one-line `ConfigKeys.ts` + test change appended to Task 5 — confirm before deleting released keys.

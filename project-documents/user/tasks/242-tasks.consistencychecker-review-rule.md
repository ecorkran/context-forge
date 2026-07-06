---
docType: tasks
slice: consistencychecker-review-rule
project: context-forge
lldReference: project-documents/user/slices/242-slice.consistencychecker-review-rule.md
dependencies: [240, 241]
projectState: >
  Slices 240 and 241 are complete and merged to main. reviewGate.ts exists with the pure
  helpers (positionToReviewType, normalizeVerdict, evaluateVerdict, resolveGateConfig) plus
  a private composite evaluator (WorkflowNavigator.evaluateGate()) that wires detectDocuments
  + parseFrontmatter + evaluateVerdict together — that composite is NOT exported. ConsistencyChecker
  currently takes only an IArtifactIntrospector and has no review-awareness. This slice extracts
  the composite into reviewGate.ts as evaluateReviewGate(), refactors the navigator to delegate
  to it, injects an optional ConfigManager into ConsistencyChecker, and adds a review-gate rule.
dateCreated: 20260705
dateUpdated: 20260705
status: complete
---

# Tasks: ConsistencyChecker Review Rule (Slice 242)

## Context Summary

Slice 242 makes `cf check` / `workflow_check` aware of the review gate that 241 wired into `cf next` / `workflow_next`. Rather than reimplementing the "find review artifact → read verdict → decide" logic a second time, this slice extracts the composite currently private inside `WorkflowNavigator.evaluateGate()` into an exported `evaluateReviewGate()` in `reviewGate.ts`, and makes both the navigator and `ConsistencyChecker` call it. A new rule fires when a slice is marked **complete in the plan** but its `code` review is absent (`warning`) or present-and-failing (`error`). Neither finding is auto-fixable.

**Key files (all under `packages/`):**
- `core/src/introspection/reviewGate.ts` — add `evaluateReviewGate()` + export `GateEvaluation`
- `core/src/introspection/WorkflowNavigator.ts` — `evaluateGate()` becomes a thin delegating wrapper
- `core/src/introspection/ConsistencyChecker.ts` — optional `ConfigManager` ctor dep, new rule
- `core/src/introspection/types.ts` — no changes expected (reuses existing `ConsistencyFinding`)
- `cli/src/commands/check.ts` — construct `ConfigManager` and pass to `ConsistencyChecker`
- `mcp-server/src/tools/workflowTools.ts` — same, at the `workflow_check` construction site

**Reference:** design TDs — TD-1 (extract composite evaluator), TD-2 (optional `ConfigManager` on `ConsistencyChecker`), TD-3 (code/pre-advance boundary only, keyed off `planEntry.isChecked`), TD-4 (finding shape: warning/error, never fixable), TD-5 (hoist config resolution once per `check`/`checkAll` call), TD-6 (inherit failure/UNKNOWN handling, no new error paths).

**Conventions:** no `any`; explicit return types on exported functions; no magic strings; functions ≤ ~50 lines; test-with pattern (test task follows each impl task); the TD-1 refactor must be behavior-preserving — 241's existing navigator test suite is the proof, do not rewrite those tests to make them pass.

---

## Task 1 — Branch and baseline

- [x] 1.1 Confirm working branch and clean baseline
  - Verify `cf config get git.branch_root` (expected empty/default per the 241 correction — no prefix). Per Git Rules, Phase 6 implementation of slice 242 belongs on branch `242-slice.consistencychecker-review-rule`. If it does not exist, create it from `main`: `git checkout -b 242-slice.consistencychecker-review-rule main`.
  - Run `pnpm -r build` and note the current state. Known pre-existing failures (NOT introduced here, do not fix in this slice): 3 in `packages/core/tests/storage/FileProjectStore.test.ts`, 4 in `packages/cli/tests/commands/list.test.ts`.
  - Success: on the correct slice branch; build green; the 7 known failures are the only failures.

---

## Task 2 — Extract `evaluateReviewGate()` into `reviewGate.ts` (design TD-1)

- [x] 2.1 Add `GateEvaluation` and `evaluateReviewGate()` to `reviewGate.ts`
  - In `core/src/introspection/reviewGate.ts`, add:
    ```ts
    export interface GateEvaluation {
      status: 'pending-review' | 'review-failed';
      reviewType: string;
      rationale: string;
      /** Relative path (from projectPath) to the review artifact, when one was found.
       *  Absent for pending-review (no artifact exists yet). Lets callers point a
       *  finding's location at the artifact without a second detectDocuments call. */
      artifactPath?: string;
    }

    export async function evaluateReviewGate(
      projectPath: string,
      index: number,
      boundary: Boundary,
      config: ConfigManager,
      resolved?: ResolvedGate,
    ): Promise<GateEvaluation | null>
    ```
  - Body: if `resolved` is not passed, call `resolveGateConfig(config)`; if the result (passed or resolved) is `null`, return `null`. Otherwise derive `reviewType` via `positionToReviewType(boundary)`, call `detectDocuments(projectPath, index, reviewType)`. If `docs.review === null`, return `{ status: 'pending-review', reviewType, rationale: ... }` (reuse the exact rationale wording from the current `WorkflowNavigator.evaluateGate()`; no `artifactPath` — none exists). Otherwise `parseFrontmatter`, `normalizeVerdict`, `evaluateVerdict` against `resolved.thresholdFor(boundary)`; if outcome is `'clears'` return `null`; else return `{ status: 'review-failed', reviewType, rationale: ..., artifactPath: docs.review }` (rationale wording byte-identical to the current navigator's — this is a pure move, not a rewrite; `artifactPath` is new but additive, so it does not change the navigator's existing behavior since the navigator ignores it).
  - This function needs `detectDocuments` and `parseFrontmatter` imports in `reviewGate.ts` (currently only imported in `WorkflowNavigator.ts`).
  - Success: module compiles; exported function and interface present; no `any`; rationale strings byte-identical to the current navigator's; `artifactPath` populated only on `review-failed`.

- [x] 2.2 Refactor `WorkflowNavigator.evaluateGate()` to delegate
  - Replace the body of the private `evaluateGate()` in `WorkflowNavigator.ts` with a call to `evaluateReviewGate(projectPath, index, boundary, this.config)` guarded by the existing `if (!this.config) return null;` early return. Remove the now-dead local `GateEvaluation` interface/type and import it from `reviewGate.ts` instead. Remove now-unused imports (`detectDocuments`, `parseFrontmatter`, `normalizeVerdict`, `evaluateVerdict`, `resolveGateConfig`, `positionToReviewType`) from `WorkflowNavigator.ts` if they become unused after the delegation — check each before removing (some may still be used elsewhere in the file).
  - Do NOT change any of the four call sites of `evaluateGate()` in `WorkflowNavigator.ts` (lines ~141, ~538, ~565, ~580 per the design) — this is a pure internal refactor.
  - Success: `WorkflowNavigator.ts` compiles; `evaluateGate()` is now a thin wrapper; no behavior change.

- [x] 2.3 Test: regression — 241's full navigator suite passes unchanged
  - Run the existing `WorkflowNavigator.test.ts` suite. Every test that existed before this task must still pass with **no modification to the test file**. This is the behavior-preservation proof for the TD-1 refactor.
  - If any test fails, the refactor changed behavior — fix `evaluateReviewGate()` or the delegation, not the test.
  - Success: `pnpm --filter @context-forge/core test WorkflowNavigator` green, zero test-file diffs.

- [x] 2.4 Test: `evaluateReviewGate()` directly
  - Add tests in `reviewGate.test.ts` covering `evaluateReviewGate()` directly (not just through the navigator): gating off (no config / `review_enabled=false`) → `null`; absent review artifact → `pending-review` with correct `reviewType`; present + failing verdict → `review-failed`; present + clearing verdict → `null`; passing a pre-resolved `ResolvedGate` via the `resolved` parameter skips re-reading config (assert via a stub `ConfigManager` call-count or equivalent).
  - Reuse the existing fixture project and stub `ConfigManager` helper (`tests/helpers/stubConfig.ts` from the 241 review-finding fix) rather than duplicating stub setup.
  - Success: all cases covered; no new stub duplication (reuses `stubConfig.ts`).

- [x] 2.5 Commit checkpoint — extracted evaluator
  - Commit Tasks 2.1–2.4 on the slice branch (e.g. `refactor(core): extract evaluateReviewGate from WorkflowNavigator`). Coherent save point before touching `ConsistencyChecker`.
  - Success: committed; suite green (modulo the 7 known pre-existing failures).

---

## Task 3 — `ConsistencyChecker`: optional `ConfigManager` dependency (design TD-2)

- [x] 3.1 Add optional `ConfigManager` constructor parameter
  - In `ConsistencyChecker.ts`, change the constructor to `constructor(private readonly introspector: IArtifactIntrospector, private readonly config?: ConfigManager) {}`. Import `ConfigManager` from `../config/ConfigManager.js`.
  - No behavior change yet — the field is unused until Task 4.
  - Success: compiles; all existing `new ConsistencyChecker(introspector)` call sites (production and test) remain valid with no changes required.

- [x] 3.2 Test: constructor accepts optional config with no behavior change
  - Add a test instantiating `ConsistencyChecker` both with and without a `config` argument against an existing fixture project; assert identical `check()`/`checkAll()` output between the two when no review-gate rule exists yet (this test is a placeholder proving the constructor change alone is inert — it will remain true after Task 4 adds the rule, since gating stays off in this fixture by default).
  - Success: both construction forms produce identical results.

- [x] 3.3 Commit checkpoint — optional config dependency
  - Commit Tasks 3.1–3.2 on the slice branch (e.g. `feat(core): add optional ConfigManager to ConsistencyChecker`).
  - Success: committed; suite green.

---

## Task 4 — The review-gate rule (design TD-3, TD-4, TD-5, TD-6)

- [x] 4.1 Hoist gate config resolution in `check()` and `checkAll()`
  - In `ConsistencyChecker.check()`: if `this.config` is set, call `resolveGateConfig(this.config)` once and pass the result (a `ResolvedGate | null`) down into `checkSlice(...)`. If `this.config` is unset, pass `null` directly without calling `resolveGateConfig`.
  - In `checkAll()`: same hoist, once per call (not once per slice in the loop), passed to each `checkSlice(...)` invocation.
  - Update `checkSlice`'s signature to accept the resolved gate (e.g. `resolvedGate: ResolvedGate | null`) as an additional parameter, threaded through to the new rule in Task 4.2.
  - Success: config resolved at most once per `check`/`checkAll` call; `checkSlice` signature updated; existing rules 1–5 unaffected by the new parameter.

- [x] 4.2 Implement `ruleReviewGate` (the new rule)
  - Add a private method with an explicit `slicePlanPath` parameter (it is not derivable from `SlicePlanEntry`, which has no path field):
    ```ts
    private async ruleReviewGate(
      planEntry: SlicePlanEntry | null,
      sliceIndex: number,
      projectPath: string,
      slicePlanPath: string | null,
      resolvedGate: ResolvedGate | null,
    ): Promise<ConsistencyFinding[]>
    ```
  - Logic: if `resolvedGate === null` return `[]` (gating off). If `!planEntry?.isChecked` return `[]` (only fires for slices marked complete). If `slicePlanPath === null` return `[]` (no plan path to attribute the finding to — mirrors the existing rules' guard pattern, e.g. `ruleTaskVsPlan`). Otherwise call `evaluateReviewGate(projectPath, sliceIndex, 'preAdvance', this.config!, resolvedGate)`.
    - Result `null` → `[]` (review clears — nothing to flag).
    - Result `status: 'pending-review'` → one finding: `{ rule: 'review-gate', severity: 'warning', location: slicePlanPath, description: <the rationale from GateEvaluation>, suggestedFix: 'Run the code review for slice N', fixable: false }`.
    - Result `status: 'review-failed'` → one finding: `{ rule: 'review-gate', severity: 'error', location: join(projectPath, result.artifactPath!) — the artifact path returned on GateEvaluation (Task 2.1), no second detectDocuments call, description: <the rationale>, suggestedFix: 'Resolve the review findings or rerun the review for slice N', fixable: false }`.
  - Call this method from `checkSlice` alongside the existing rules 1–5, passing the same `slicePlanPath` already available in `checkSlice`'s scope (it is already threaded into `ruleTaskVsPlan` and `rulePlanVsFrontmatter` — reuse that existing value, do not re-resolve it).
  - Success: rule wired into `checkSlice`; both severities map correctly; no `fixAction` set on either finding.

- [x] 4.3 Test: absent review → warning
  - Fixture: a slice marked complete (`isChecked: true`) in the plan with no matching `code` review artifact. With gating enabled (stub config, `review_enabled=true`), assert `check()`/`checkAll()` produces exactly one `review-gate` finding, `severity: 'warning'`, `fixable: false`.
  - Success: assertion passes; no `fixAction` present.

- [x] 4.4 Test: failing verdict → error
  - Fixture: same slice, now with a `code` review artifact present carrying `verdict: FAIL`. Assert exactly one `review-gate` finding, `severity: 'error'`, `fixable: false`.
  - Success: assertion passes.

- [x] 4.5 Test: clearing verdict → no finding
  - Same slice, review artifact with `verdict: PASS` (or `CONCERNS` at default threshold). Assert zero `review-gate` findings.
  - Success: assertion passes.

- [x] 4.6 Test: incomplete slice → no finding regardless of review state
  - Slice with `isChecked: false` in the plan, even with a `FAIL` review artifact present. Assert zero `review-gate` findings (the rule keys off plan-completion per TD-3).
  - Success: assertion passes.

- [x] 4.7 Test: gating off → identical to pre-242 output
  - Construct `ConsistencyChecker` (a) with no `config` argument, and (b) with a stub config where `review_enabled=false`. Using a fixture with a complete slice and no/failing review artifact, assert zero `review-gate` findings in both cases, and that the full finding set is byte-for-byte identical to a pre-242 baseline run (same fixture, rules 1–5 only).
  - Success: gating-off parity confirmed for both "no config" and "config present but disabled."

- [x] 4.8 Test: present-but-no-verdict (UNKNOWN) under default policy
  - Reuse the present-but-no-`verdict` fixture from slice 241 (`core/tests/fixtures/.../reviews/`) if it matches a `code`-type index, or add one. Under default `review_unknown_as=fail`, assert one `error` finding (UNKNOWN → FAIL-equivalent → does not clear). This mirrors the navigator's 241 integration test for the same fixture, confirming both consumers agree at this edge.
  - Success: `error` finding produced; matches TD-6's "inherited, not redefined" guarantee.

- [x] 4.9 Test: `cf check --fix` does not touch review-gate findings
  - With a failing-verdict fixture producing an `error` finding, run `applyFixes()` (or `fix()`/`fixAll()`). Assert the finding is still reported in the result, `fixed` count does not include it, and no file on disk is modified as a result of this finding.
  - Success: fix pass leaves the review-gate finding and its target files untouched.

- [x] 4.10 Commit checkpoint — review-gate rule
  - Commit Tasks 4.1–4.9 on the slice branch (e.g. `feat(core): add review-gate consistency rule`).
  - Success: committed; suite green (modulo the 7 known pre-existing failures).

---

## Task 5 — Surface wiring (CLI + MCP)

- [x] 5.1 Wire `ConfigManager` into `cf check`
  - In `cli/src/commands/check.ts`, construct `new ConfigManager(project.projectPath)` (the CLI already does this locally for `workflow.auto_fix` — reuse that instance rather than constructing a second one) and pass it as the second argument to `new ConsistencyChecker(introspector, config)`.
  - Success: `cf check` reads gate config at project/worktree scope; existing `auto_fix` read behavior unchanged.

- [x] 5.2 Wire `ConfigManager` into `workflow_check` (MCP)
  - In `mcp-server/src/tools/workflowTools.ts`, at the `new ConsistencyChecker(introspector)` site (~line 258), construct `new ConfigManager(project.projectPath)` and pass it as the second constructor argument.
  - Success: `workflow_check` inherits the gate identically to `cf check`.

- [x] 5.3 Test: end-to-end — both surfaces report the same finding
  - With gating enabled and a failing-verdict fixture, run `cf check` and the `workflow_check` MCP tool against the same scratch project state. Assert both surface the same `review-gate` `error` finding.
  - Success: parity confirmed across CLI and MCP surfaces.

- [x] 5.4 Commit checkpoint — surface wiring
  - Commit Tasks 5.1–5.3 on the slice branch (e.g. `feat(cli,mcp): wire ConfigManager into ConsistencyChecker construction`).
  - Success: committed; suite green.

---

## Task 6 — Build, full suite, and design walkthrough

- [x] 6.1 Build and run the full suite
  - `pnpm -r build` (clean). `pnpm --filter @context-forge/core test reviewGate` and `... test ConsistencyChecker` green. Full `pnpm -r test`: only the 7 known pre-existing failures remain; zero new failures.
  - Success: build clean; no new failures.

- [x] 6.2 Execute the design Verification Walkthrough
  - Run the design's 9-step Verification Walkthrough against a scratch project (`--project <scratch>`): gating-off baseline, enable gating, absent→warning, failing→error, clearing→clean, unknown-verdict→error, incomplete-slice→silent, `--fix` does not touch it, `workflow_check` parity. Capture actual command output; correct the walkthrough in the design doc if any command/output differs from what was drafted (as was needed in slices 240/241).
  - Success: walkthrough reproduces; design doc walkthrough matches reality.

- [x] 6.3 Update docs/frontmatter and commit
  - Add a CHANGELOG `[Unreleased]` entry (review-gate consistency rule now active in `cf check`/`workflow_check` behind `workflow.review_enabled`). Set the slice design and this task file frontmatter `status: complete`, `dateUpdated` to the implementation date. Delegate checkbox updates to `task-checker`.
  - Final commit checkpoint: commit the walkthrough corrections, CHANGELOG, and frontmatter updates on the slice branch. (Earlier checkpoints at 2.5, 3.3, 4.10, 5.4 already saved the extraction, config injection, rule, and surface wiring.) Do NOT run the code review here — that is a separate step.
  - Success: docs updated; all work committed on the slice branch across the distributed checkpoints.

---

## Notes / Deferred

- **Slice 243** documents the new `cf check`/`workflow_check` findings alongside the `cf next` behavior shipped in 241 — no code changes expected to interact with 243.
- The `arch`/`slice`/`tasks` boundaries are explicitly out of scope for the consistency rule (design TD-3) — do not add them here even if it seems like a small extension; that was a considered exclusion, not an oversight.

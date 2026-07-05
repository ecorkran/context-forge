---
docType: slice-design
slice: consistencychecker-review-rule
project: context-forge
parent: project-documents/user/architecture/240-slices.review-aware-workflow-gating.md
dependencies: [240, 241]
interfaces: [243]
dateCreated: 20260704
dateUpdated: 20260704
status: not-started
---

# Slice Design: ConsistencyChecker Review Rule

## Overview

Slice 241 made the review gate a first-class *workflow position* — `cf next` / `workflow_next` now route to `review` or `blocked` instead of recommending an advance when a slice's code review is absent or failing. Slice 242 makes the same condition visible through the other diagnostic surface: `cf check` / `workflow_check`.

Where the navigator answers "what should I do next for the active slice," the `ConsistencyChecker` answers "what is inconsistent across the project's artifacts." A slice marked **complete in the slice plan** whose **code review is absent** (or present but **failing**) is exactly that kind of inconsistency — the plan asserts the slice is done, but the review discipline the project enabled says it is not cleared. This slice adds one rule that flags it.

The rule reuses 241's verdict machinery rather than reimplementing it. To do so cleanly, this slice performs a small refactor first: the composite "detect review artifact → read verdict → produce an outcome" logic that 241 kept **private** inside `WorkflowNavigator.evaluateGate()` is extracted into an exported function in `reviewGate.ts`, so both the navigator and the checker call one evaluator. This is the DRY step the slice plan anticipated with "reusing 241's `reviewGate.ts` evaluator."

Three units of work:

1. **Extract the composite evaluator** into `reviewGate.ts` as an exported function; refactor `WorkflowNavigator.evaluateGate()` to delegate to it (no behavior change, verified by 241's existing test suite).
2. **Inject `ConfigManager`** into `ConsistencyChecker` as an optional constructor dependency, mirroring how 241 wired it into `WorkflowNavigator`. Gating off ⇒ the checker's output is byte-for-byte identical to today.
3. **Add the review-gate rule**: for each slice marked complete in the plan, evaluate the `code` (pre-advance) boundary. Absent review → `warning`; present-but-failing → `error`. Neither is auto-fixable. Wire `ConfigManager` construction into the `cf check` and `workflow_check` call sites.

## Value

- **Review state is visible from both diagnostic surfaces, not just the navigator.** A team that runs `cf check` in CI or before a merge sees "slice complete but code review missing/failing" as a first-class finding, without having to run `cf next` on each slice.
- **No new logic to trust.** The verdict decision matrix, threshold resolution, and `review_unknown_as` policy are the exact code paths 241 shipped and tested. This slice adds a consumer, not a second implementation.
- **Silent-pass is closed.** Before 242, a slice plan checkbox could be ticked with no code review present and nothing in the toolchain would object. After 242, `cf check` surfaces it whenever gating is enabled.

## Scope

**In scope**
- Extract the composite gate evaluator from `WorkflowNavigator` into `reviewGate.ts`; refactor the navigator to delegate.
- Optional `ConfigManager` dependency on `ConsistencyChecker`.
- One new consistency rule (`review-gate`) evaluating the **code / pre-advance** boundary for slices marked complete in the plan.
- Wire `ConfigManager` into the two `ConsistencyChecker` construction sites (`cf check`, `workflow_check`).
- Unit tests: the rule (absent / failing / clearing / gating-off / present-no-verdict), the extracted evaluator, and a navigator regression proving the refactor changed nothing.

**Out of scope**
- The `arch` / `slice` / `tasks` boundaries. The arch's `ConsistencyChecker` section describes only the "slice complete but review absent/failing" (code) case; evaluating the other three boundaries per-slice would flag a pending review on every in-flight slice on every `cf check`, which is noise, not a consistency signal. (Design decision below, confirmed with PM.)
- Auto-fix for the new rule. A missing or failing review is not a mechanical correction — the arch is explicit that neither case is auto-fixable.
- Any change to config keys, slice-status values, or the navigator's routing (all shipped in 240/241).
- Score-based gating (a documented no-op in v1, gated behind Squadron slice 301).

## Technical Decisions

### TD-1 — Extract the composite evaluator into `reviewGate.ts` (the DRY step)

241 split the gate logic across two homes:

- **Pure, exported** (`reviewGate.ts`): `positionToReviewType`, `normalizeVerdict`, `evaluateVerdict`, `resolveGateConfig`.
- **Composite, private** (`WorkflowNavigator.evaluateGate()`): resolve config → derive reviewType → `detectDocuments` → `parseFrontmatter` → `evaluateVerdict` → shape a `{status, reviewType, rationale}` result.

242 needs that composite. Reimplementing the ~10-line I/O wiring inside `ConsistencyChecker` would duplicate logic and violate DRY (a CLAUDE.md core principle). Instead, extract it.

**New export in `reviewGate.ts`:**

```ts
export interface GateEvaluation {
  status: 'pending-review' | 'review-failed';
  reviewType: string;
  rationale: string;
}

/**
 * Composite gate evaluation for one boundary of one slice/arch index.
 * Returns null when gating is off OR the review clears — i.e. "nothing to flag."
 * Returns a GateEvaluation when the review is absent (pending-review) or
 * present-but-not-clearing (review-failed). Pure I/O over the pure helpers;
 * both WorkflowNavigator and ConsistencyChecker call this.
 */
export async function evaluateReviewGate(
  projectPath: string,
  index: number,
  boundary: Boundary,
  config: ConfigManager,
  resolved?: ResolvedGate,   // optional: caller may pass a pre-resolved gate to avoid re-reading config in a loop
): Promise<GateEvaluation | null>;
```

- The `resolved` parameter is an optimization for `ConsistencyChecker.checkAll()`, which evaluates the rule across every complete slice in a loop: resolve the gate config **once**, pass it in, avoid N config reads. When omitted, the function resolves config itself (the navigator's per-call pattern). This keeps the single-call ergonomics identical to today while letting the loop caller hoist the config read.
- `GateEvaluation` moves from its private definition in `WorkflowNavigator` to `reviewGate.ts` (its natural home now that two modules use it). The navigator imports it from there.
- `WorkflowNavigator.evaluateGate()` becomes a thin adapter that calls `evaluateReviewGate(this.config, …)` when `this.config` is set (it already early-returns `null` when config is absent). Its four call sites are unchanged.

**Behavior contract:** the extraction is a pure move. 241's full navigator test suite (all four boundaries, gating-off regression, present-no-verdict integration) is the proof that nothing changed. No test rewrites — if a test breaks, the refactor was not behavior-preserving and must be corrected.

### TD-2 — Inject `ConfigManager` into `ConsistencyChecker` (optional ctor dep)

`ConsistencyChecker`'s constructor currently takes only `IArtifactIntrospector`. The review-gate rule needs config to answer two questions: *is gating enabled?* and *what threshold clears the gate?* Mirror 241's navigator pattern exactly:

```ts
constructor(
  private readonly introspector: IArtifactIntrospector,
  private readonly config?: ConfigManager,
) {}
```

- **Optional.** When `config` is absent, the review-gate rule short-circuits to "no findings" — every other rule runs unchanged. This preserves all existing test call sites (`new ConsistencyChecker(introspector)`) and keeps the checker usable in contexts without a resolved project path.
- **Gating-off parity.** Even when `config` *is* present, `resolveGateConfig` returns `null` unless `workflow.review_enabled = true`. So a project that has not opted into gating sees byte-identical `cf check` output. This is the same conservative-by-default guarantee 241 provides.

### TD-3 — The rule evaluates the code / pre-advance boundary only

`cf check` runs in two modes: `check()` (active slice) and `checkAll()` (every entry across all discovered plans). The review-gate rule attaches to the **per-slice** logic (`checkSlice`), so it participates in both modes automatically — `checkAll` already iterates `checkSlice` over every unique plan entry.

For a given slice, the rule fires **only when the slice is marked complete in the slice plan** (`planEntry.isChecked === true`). Rationale:

- The arch's `ConsistencyChecker` section defines the condition precisely: *"a slice is marked complete in the slice plan but its required review artifact is absent … present but its verdict does not clear the threshold."* The trigger is plan-completion, and the review type is `code` (the review a completed slice owes).
- Evaluating the other three boundaries (`arch`/`slice`/`tasks`) per-slice would emit a `pending-review` finding for every slice currently mid-flight — noise on every `cf check`, not an inconsistency. The navigator already surfaces those as *next actions*; the checker's job is to catch contradictions, and "an in-progress slice has no code review yet" is not a contradiction.

This keeps the rule aligned with the existing `ruleTaskVsPlan` shape, which already keys off `planEntry.isChecked`.

### TD-4 — Finding shape: warning for absent, error for failing, never fixable

The rule maps the two `GateEvaluation` outcomes onto the existing `ConsistencyFinding` model:

| `evaluateReviewGate` result | Severity | Meaning |
|---|---|---|
| `status: 'pending-review'` (review absent) | `warning` | Plan says complete; no code review on disk. |
| `status: 'review-failed'` (present, not clearing) | `error` | Code review present; verdict does not clear threshold. |
| `null` (clears, or gating off) | *(no finding)* | Nothing to flag. |

- Severities match the arch: absent = `warning`, failing = `error`.
- `fixable: false`, no `fixAction`, on both. `applyFixes` already skips findings without a `fixAction`, so no change to the fix machinery.
- `description` reuses the `rationale` string `evaluateReviewGate` already produces (e.g. *"Slice 242 requires a code review before proceeding — no review artifact found."* / *"Review artifact present but verdict FAIL does not clear threshold 'concerns' for slice 242."*). In `checkAll`, the existing `[index]` prefix is applied by the aggregate loop, so no per-rule index formatting is needed.
- `location`: the slice plan path for the absent case (the artifact whose checkbox is the assertion being contradicted); the review artifact's path for the failing case (the file whose verdict is the problem). This mirrors how sibling rules point `location` at the document a human should open.
- `suggestedFix`: "Run the code review for slice N" (absent) / "Resolve the review findings or rerun the review for slice N" (failing). Advisory only — CF routes to a review, it never performs one.

### TD-5 — Config resolution is hoisted in `checkAll`, per-call in `check`

`checkSlice` is the shared per-slice path. To avoid re-reading config once per slice in `checkAll`, the review-gate rule resolves the gate config **once** at the top of `check` / `checkAll` and threads the `ResolvedGate` (or `null`) down into `checkSlice`, which passes it to `evaluateReviewGate` via the optional `resolved` parameter (TD-1). When gating is off, `resolved` is `null` and the rule is skipped without any per-slice I/O. This is a straightforward extension of the existing `checkSlice` signature, not a new traversal.

### TD-6 — Failure and unknown-verdict handling is inherited, not redefined

The rule adds **no** new error handling for verdicts. A review file that is absent, unparseable, or carries an absent/unrecognized `verdict` is handled by `evaluateReviewGate` exactly as it is for the navigator: absent → `pending-review`; unparseable/unknown verdict → `normalizeVerdict` degrades to `UNKNOWN`, then `review_unknown_as` policy applies (default `fail` ⇒ `review-failed` ⇒ `error` finding). CF's fail-fast-on-config-error principle is likewise inherited: an out-of-vocabulary `review_threshold` throws from `resolveGateConfig`, surfacing as a `cf check` error rather than a silent pass — identical to `cf next`.

## Data Flow

```
cf check  (or  workflow_check)
  └─ construct ConsistencyChecker(introspector, new ConfigManager(projectPath))
       └─ check() / checkAll()
            ├─ resolveGateConfig(config)  ──► ResolvedGate | null   (hoisted once)
            └─ for each slice entry:
                 checkSlice(…, resolvedGate)
                   ├─ existing rules 1–5 (unchanged)
                   └─ ruleReviewGate(planEntry, sliceIndex, resolvedGate)
                        ├─ resolvedGate === null            → []            (gating off)
                        ├─ !planEntry.isChecked             → []            (not complete)
                        └─ evaluateReviewGate(path, idx, 'preAdvance', config, resolvedGate)
                             ├─ null            → []                        (review clears)
                             ├─ pending-review  → [ warning finding ]       (review absent)
                             └─ review-failed   → [ error finding ]         (verdict fails)
```

`evaluateReviewGate` is the same function `WorkflowNavigator.evaluateGate()` now delegates to — one evaluator, two consumers.

## Interfaces & Dependencies

**Depends on (241, shipped):**
- `reviewGate.ts` — the pure helpers plus the newly extracted `evaluateReviewGate` composite and re-homed `GateEvaluation`.
- `detectDocuments(projectPath, index, reviewType)` — the `review` discovery slot (240).
- `ConfigManager` and the `workflow.review_*` keys (240).

**Changes to 241 code (behavior-preserving refactor):**
- `WorkflowNavigator.evaluateGate()` becomes a delegating wrapper; `GateEvaluation` import moves to `reviewGate.ts`.

**Consumed by (243):**
- Documentation slice 243 documents the new `cf check` findings alongside the `cf next` behavior.

**No interface breaks:** `ConsistencyFinding`, `ConsistencyCheckResult`, and the `check`/`checkAll`/`fix` signatures are unchanged. The new constructor parameter is optional, so every existing `new ConsistencyChecker(introspector)` call site compiles and behaves as before.

## Success Criteria

1. `evaluateReviewGate` exists as an exported function in `reviewGate.ts`; `GateEvaluation` is exported from there; `WorkflowNavigator.evaluateGate()` delegates to it and 241's full navigator suite passes unchanged.
2. `ConsistencyChecker` accepts an optional `ConfigManager`; all pre-existing construction sites and tests compile and pass without modification.
3. With gating **off** (`review_enabled` false or config absent), `cf check` output is byte-for-byte identical to pre-242 for a representative project.
4. With gating **on**, for a slice marked complete in the plan:
   - code review **absent** → one `warning` finding (`rule: 'review-gate'`).
   - code review **present, verdict FAIL** (or UNKNOWN under default policy) → one `error` finding.
   - code review **present, verdict PASS/CONCERNS clearing threshold** → no finding.
5. A slice **not** marked complete emits no review-gate finding regardless of review presence.
6. No review-gate finding is `fixable`; `cf check --fix` neither reports nor attempts a fix for it.
7. `cf check` and `workflow_check` both surface the findings (shared `ConsistencyChecker`), verified end-to-end.
8. Full build + test sweep (core, cli, mcp, electron) shows only the known pre-existing failures — zero new.

## Verification Walkthrough (draft — refined at Phase 6)

Run against a scratch project with the locally-built CLI. Assumes `workflow.review_enabled = true`, default threshold `concerns`, default `review_unknown_as = fail`.

1. **Baseline, gating off.** In a project with `review_enabled` unset, mark a slice complete in its plan with no review file. `cf check` → no `review-gate` finding. (Proves conservative default.)
2. **Enable gating.** `cf config set workflow.review_enabled true`.
3. **Absent code review → warning.** With slice `N` checked in the plan and no `reviews/N-review.code.*.md`, run `cf check`. Expect one `warning`: *"Slice N requires a code review before proceeding — no review artifact found."*
4. **Failing verdict → error.** Add `reviews/N-review.code.first.md` with `verdict: FAIL`. `cf check` → one `error`: *"…verdict FAIL does not clear threshold 'concerns' for slice N."*
5. **Clearing verdict → clean.** Change the verdict to `CONCERNS` (clears at default threshold). `cf check` → no review-gate finding.
6. **Unknown verdict under default policy.** Set `verdict:` to a garbage value (or remove it). `cf check` → one `error` (UNKNOWN → `review_unknown_as: fail` → does not clear).
7. **Incomplete slice is silent.** Uncheck the slice in the plan. `cf check` → no review-gate finding even with a failing review on disk (the rule keys off plan-completion).
8. **Not auto-fixable.** With a failing review present, run `cf check --fix`. The error is reported but no fix is applied and no file is modified for it.
9. **Both surfaces agree.** Run the equivalent `workflow_check` MCP tool for the same project state and confirm it reports the same finding (shared checker).

## Effort

2/5 — one extracted function, one optional constructor parameter, one rule keyed off an existing per-slice path, two call-site wirings. The bounded risk is the refactor in TD-1 touching 241's just-shipped navigator; it is contained by 241's existing test suite acting as the behavior contract.

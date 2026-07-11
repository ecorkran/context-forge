---
docType: slice-plan
parent: project-documents/user/architecture/240-arch.review-aware-workflow-gating.md
project: context-forge
dateCreated: 20260624
dateUpdated: 20260704
status: complete
---

# Slice Plan: Review-Aware Workflow Gating

## Parent Document
`project-documents/user/architecture/240-arch.review-aware-workflow-gating.md`

## Foundation Work
1. [x] **(240) Review Artifact Discovery and Config Keys** — Add `review` slot to `DocumentDetectionResult`, implement detection rule in `documentDetector.ts` (scans `project-documents/user/reviews/` for `NNN-review.{reviewType}.*.md`; lexicographically last wins on multiple matches). Add three global config keys (`workflow.review_enabled`, `workflow.review_threshold`, `workflow.review_unknown_as`) and the per-gate override structure to `ConfigKeys.ts`. Renumber the `getNext()` priority cascade to make room for the gate branch. No gate logic — this is the foundation the gate builds on. Effort: 2/5

## Feature Slices (in implementation order)
1. [x] **(241) Gate Logic in WorkflowNavigator** — The full review-gate mechanism, covering **all four lifecycle boundaries** in one coherent slice. The review type is **derived from lifecycle position**, not configured: `arch` before slice-plan creation, `slice` after design (before tasks), `tasks` after task-breakdown (before implementation), `code` after implementation (before advance). Add `pending-review` and `review-failed` to the `SliceStatus` enum. Extend `deriveSliceStatus()` (and the pre-slice-plan/no-active-slice path) to evaluate the gate at each boundary and set these values. Add a standalone `reviewGate.ts` evaluator (position→reviewType derivation, verdict decision matrix, `review_unknown_as`/`review_threshold` resolution) reused by 242. Inject `ConfigManager` into `WorkflowNavigator` (optional ctor dep; gating off ⇒ identical behavior). Fill the reserved `LIFECYCLE: review-gate` branch in `getNext()` returning `review`/`blocked` recommendations with structured rationale. Introduce the `STATUS` const (referenced by 910). Full unit coverage of the decision matrix and every boundary. Dependencies: 240. Risk: Medium. Effort: 4/5
2. [x] **(242) ConsistencyChecker Review Rule** — Add missing-artifact (`warning`) and failing-verdict (`error`) consistency rules, reusing 241's `reviewGate.ts` evaluator. Neither is auto-fixable. Verify `cf check` surfaces both conditions correctly. Dependencies: 240, 241. Risk: Low. Effort: 2/5
3. [x] **(243) Documentation and README Updates** — Document new config keys (`workflow.review_enabled`, `workflow.review_threshold`, `workflow.review_unknown_as`), the **position-derived review-type model** (which boundary owes which review type), new slice status values (`pending-review`, `review-failed`), and updated `cf next` / `cf check` behavior. Note that `review_type` is derived from position, not configured — document why the earlier per-gate `review_type` config keys are inert/removed. Update any existing README or configuration reference sections that describe workflow behavior or status values. Dependencies: 241, 242. Risk: Low. Effort: 1/5

## Notes
- No migration or refactoring slices — initiative 240 is purely additive to initiative 160's infrastructure. No existing interfaces change.
- No integration work section — each slice leaves the system in a working state and is independently testable.
- **Review type is derived from lifecycle position, not configured (Phase 4 decision, supersedes the arch's per-gate `reviewType` config).** Each phase boundary owes exactly one review: `arch` (before slice plan), `slice` (before tasks), `tasks` (before implementation), `code` (before advance). CF reads the boundary it is already at and looks for that review type. This removes the need for the user to configure *which* review — they configure only *whether* gating is on (`review_enabled`) and *how strict* (`review_threshold` / `review_unknown_as`).
- **Slice 244 (initiative-level pre-slice-plan gate) is folded into 241.** With reviewType position-derived, the `arch`/pre-slice-plan boundary is just one more case of the same single mechanism, not a separate slice with a different insertion point. 241 now covers all four boundaries. 244 is retired.
- **Consequence for the 240 per-gate config keys (RESOLVED).** Slice 240 shipped `workflow.review_gates.{gate}.review_type` and `.threshold` keys (inert). Under the position-derived model the `review_type` keys are unnecessary — position determines type. **Resolution (implemented, #60 / commit `92ead91`): the `review_type` per-gate keys were _removed_, not left inert.** The per-gate `threshold` override survives and is consumed (a stricter bar at one boundary is a legitimate need). 243 therefore documents the keys as _removed_ — not "inert/deprecated" (that framing predates the removal). See `243-slice.documentation-and-readme-updates.md` TD-1.
- Score-based gating (`score` field enforcement) is a documented no-op code path in v1, not a separate slice. Activated once Squadron slice 301 emits stable scores.
- CF never advances the workflow — it only makes recommendations. `pending-review` and `review-failed` are recommendations, not state mutations.
- The `code` gate's "implementation done" trigger is **all task checkboxes checked** (`inferredStatus === STATUS.Complete`) — the only signal at CF's artifact/checkbox layer. CF does not inspect git/commits/PRs to confirm code exists; a false "done" claim is caught by the code review itself (verdict FAIL), not by CF pre-verifying. This keeps CF artifact-shaped, consistent with the arch's layer boundaries.

## Future Work
Items to be added here as they arise during slice design, task breakdown, or implementation.

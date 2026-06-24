---
docType: slice-plan
parent: project-documents/user/architecture/240-arch.review-aware-workflow-gating.md
project: context-forge
dateCreated: 20260624
dateUpdated: 20260624
status: not_started
---

# Slice Plan: Review-Aware Workflow Gating

## Parent Document
`project-documents/user/architecture/240-arch.review-aware-workflow-gating.md`

## Foundation Work
1. [ ] **(240) Review Artifact Discovery and Config Keys** — Add `review` slot to `DocumentDetectionResult`, implement detection rule in `documentDetector.ts` (scans `project-documents/user/reviews/` for `NNN-review.{reviewType}.*.md`; lexicographically last wins on multiple matches). Add three global config keys (`workflow.review_enabled`, `workflow.review_threshold`, `workflow.review_unknown_as`) and the per-gate override structure to `ConfigKeys.ts`. Renumber the `getNext()` priority cascade to make room for the gate branch. No gate logic — this is the foundation the gate builds on. Effort: 2/5

## Feature Slices (in implementation order)
1. [ ] **(241) Gate Logic in WorkflowNavigator** — Add `pending-review` and `review-failed` to the `SliceStatus` enum. Extend `deriveSliceStatus()` to set these values when gate conditions apply. Add the new priority branch in `getNext()` returning `review` and `blocked` recommendations with structured rationale. Full unit test coverage of the verdict decision matrix and all `review_unknown_as` / `review_threshold` combinations. Dependencies: 240. Risk: Medium. Effort: 3/5
2. [ ] **(242) ConsistencyChecker Review Rule** — Add missing-artifact (`warning`) and failing-verdict (`error`) consistency rules. Neither is auto-fixable. Verify `cf check` surfaces both conditions correctly. Dependencies: 240, 241. Risk: Low. Effort: 2/5
3. [ ] **(243) Documentation and README Updates** — Document new config keys (`workflow.review_enabled`, `workflow.review_threshold`, `workflow.review_unknown_as`, `workflow.review_gates`), new slice status values (`pending-review`, `review-failed`), and updated `cf next` / `cf check` behavior. Update any existing README or configuration reference sections that describe workflow behavior or status values. Dependencies: 241, 242. Risk: Low. Effort: 1/5
4. [ ] **(244) Initiative-Level Gate - pre-slice-plan** — Extend `getNext()` to check for an arch review artifact before recommending slice plan creation when `pre-slice-plan` is configured. Same verdict/threshold mechanism as 241; different insertion point in the cascade. Dependencies: 241. Risk: Low. Effort: 2/5

## Notes
- No migration or refactoring slices — initiative 240 is purely additive to initiative 160's infrastructure. No existing interfaces change.
- No integration work section — each slice leaves the system in a working state and is independently testable.
- Slice 241 owns the `review_gates` nested TOML schema decision: extend `ConfigKeyDefinition` to support nested shapes, or treat `workflow.review_gates.*` as a flat dotted-key namespace. Resolve at slice design (Phase 4).
- Score-based gating (`score` field enforcement) is a documented no-op code path in v1, not a separate slice. Activated once Squadron slice 301 emits stable scores.
- CF never advances the workflow — it only makes recommendations. `pending-review` and `review-failed` are recommendations, not state mutations.

## Future Work
Items to be added here as they arise during slice design, task breakdown, or implementation.

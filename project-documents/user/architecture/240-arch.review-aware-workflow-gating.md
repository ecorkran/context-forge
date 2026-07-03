---
docType: architecture
layer: project
project: context-forge
archIndex: 240
component: review-aware-workflow-gating
dateCreated: 20260621
dateUpdated: 20260624
status: active
relatedSlices: []
riskLevel: low
---

# Architecture: Review-Aware Workflow Gating

## Overview

Context Forge's workflow navigator (`workflow_next` / `cf next`) walks a project through its full lifecycle — from concept through architecture, slice planning, design, task breakdown, implementation, and advance to the next slice — by reading artifact presence and task-checkbox state. It is blind to reviews: when a slice's tasks are all checked, the state machine recommends "advance to the next slice" regardless of whether that slice's review is absent or failing.

Initiative 240 inserts a deterministic, AI-free review gate into that state machine. Configurable rules express which transitions require a review artifact and what verdict clears the bar. The gate reads the review artifact's frontmatter and — when a required review is absent or below threshold — recommends `pending-review` or `review-failed` instead of recommending an advance. It routes *to* a review; it never performs one. No model is invoked. Amoeba's Runner consumes the same gate output rather than reimplementing the logic.

**Scope:** New config keys, a review-artifact discovery mechanism in the document detector, new slice status values (`pending-review`, `review-failed`), the gate logic in `WorkflowNavigator`, and a new consistency rule in `ConsistencyChecker`. The cross-project frontmatter contract (verdict/score schema) is a data dependency owned by Squadron slice 300 — CF reads it but does not define it. Initiative-level gating (arch review blocking slice plan creation, the `pre-slice-plan` transition) is in scope for v1.

> **Scope revision (Phase 4, 20260702):** This document originally deferred the `pre-slice-plan` (arch review) transition to a later slice, with v1 covering slice-level transitions only. That deferral is withdrawn. The Phase 4 slice design for 241 adopts a **position-derived reviewType** model in which the review type is read from the lifecycle boundary CF is already at (`arch`/`slice`/`tasks`/`code`), rather than configured per gate. Under that model the `pre-slice-plan`/`arch` boundary is not a separate mechanism with its own insertion point — it is one more case of the single gate. Folding it into slice 241 is therefore cheaper than a standalone slice, so the separately-anticipated initiative-level slice (planned index 244) is retired and all four boundaries ship in 241. See `240-slices.review-aware-workflow-gating.md` and the 241 slice design.

**Motivation:** The state machine currently has no node between "tasks complete" and "advance." Teams running pipelines via Squadron or Amoeba need CF to surface review state as a first-class workflow position so runners can route to a review agent rather than an implement agent. Without this, either the runner reimplements the gate (violating the principle that CF is the authoritative workflow position reporter) or review discipline is enforced only by convention.

## Design Goals

- **Deterministic gating.** The gate produces the same routing decision for the same inputs every time. It reads a file, reads a field, compares to a threshold, and returns a recommendation. No model reasoning; no probabilistic inference.

- **Config-driven.** Which transitions require a review, which reviewType satisfies each, and what verdict clears the bar are all configurable per project without a code change. Sensible defaults mean ungated projects see no behavioral change.

- **First-class status representation.** "Tasks complete but review pending" and "review present but failing" are named states in the slice status enum, not inferred conditions. The visualizer and runners can act on them without parsing recommendation strings.

- **Inherited by both surfaces.** The gate lives in the shared `WorkflowNavigator` and `ConsistencyChecker`. Both `cf next` / `cf check` (CLI) and `workflow_next` / `workflow_check` (MCP) inherit it without per-surface work.

- **Conservative by default.** Review gating is off unless `workflow.review_enabled = true`. When enabled, the default threshold (`concerns`) passes on `PASS` or `CONCERNS` and blocks on `FAIL` or `UNKNOWN`. Numeric score gating is a forward-compatible extension, not v1 scope.

## Architectural Principles

- **Artifact-first truth.** Review state is derived from what is on disk. There is no declared review status — if the review artifact is absent, the gate treats it as unreviewed. If the file exists but the verdict field is absent or unrecognized, the gate applies the `workflow.review_unknown_as` policy.

- **Gate is a routing rule, not a decision.** When the gate fires, `workflow_next` returns a `pending-review` or `review-failed` recommendation with a rationale. It does not determine why a review failed or what to do about it. Those are consumer concerns — Squadron nodes, Amoeba, or a human. CF's job ends at the named state.

- **Extend, don't replace.** The gate inserts at a named priority point in the existing `getNext()` cascade (after task completion is confirmed, before the advance recommendation). It does not restructure the existing flow. Projects that do not enable review gating see identical behavior to today.

- **Frontmatter as cross-project contract.** The review artifact's frontmatter schema (`verdict`, `score`, `criteria`, `provenance`) is owned by Squadron slice 300. CF reads `verdict` and (when present) `score`. It carries `criteria` and `provenance` as opaque fields with no v1 consumer — they are preserved for downstream tools that do consume them. CF must not extend or reinterpret this schema unilaterally.

- **Fail-fast on configuration errors.** An invalid `workflow.review_threshold` value or an unrecognized per-gate config is a config error surfaced immediately, not a silent pass or silent block. The `validate` hook in `ConfigKeyDefinition` is the enforcement point.

## Current State

`WorkflowNavigator.getNext()` (`packages/core/src/introspection/WorkflowNavigator.ts:83–300`) implements a priority-ordered cascade. `deriveSliceStatus()` (`:446–497`) produces a closed enum:

```
needs-design → needs-tasks → in-implementation → complete → (advance to next slice)
```

Priority 6 (`:248–266`) takes a slice whose `inferredStatus === 'complete'` and immediately recommends advancing to the next unchecked slice plan entry. There is no state between `complete` and advance.

`DocumentDetectionResult` (`packages/core/src/introspection/types.ts:67–73`) has slots for `sliceDesign`, `taskFile`, `architecture`, and `slicePlan`. It has no `review` slot. `documentDetector.ts` has no review-artifact awareness.

`ConfigKeys.ts` (`packages/core/src/config/ConfigKeys.ts:9–36`) defines `workflow.auto_advance` and `workflow.auto_fix` as boolean keys with defaults. No review-related keys exist.

`ConsistencyChecker` emits `ConsistencyFinding` items and can apply `update-frontmatter` / `update-checkbox` fixes. It has no review-presence or review-verdict rule.

## Envisioned State

### Config keys

Three new keys in `ConfigKeys.ts`, following the existing pattern:

```toml
workflow.review_enabled = false          # global on/off; default false
workflow.review_threshold = "concerns"   # verdict floor: PASS or CONCERNS clears (default)
workflow.review_unknown_as = "fail"      # policy for UNKNOWN verdict; default "fail"
```

Optional per-transition overrides in `.context-forge.toml`:

```toml
[workflow.review_gates]
pre-slice-plan    = { reviewType = "arch",  threshold = "pass" }
pre-tasks         = { reviewType = "slice", threshold = "concerns" }
pre-implementation = { reviewType = "tasks", threshold = "concerns" }
pre-advance       = { reviewType = "code",  threshold = "concerns" }
```

When no per-transition override exists, `workflow.review_threshold` applies. `workflow.review_enabled = false` disables all gating regardless of other keys.

### Verdict handling

The recognized verdict vocabulary (from the Squadron slice 300 contract) is `PASS`, `CONCERNS`, `FAIL`, `UNKNOWN`. The threshold comparison:

- `PASS` — always clears
- `CONCERNS` — clears if `review_threshold = "concerns"` or lower
- `FAIL` — always blocks
- `UNKNOWN` — treated according to `workflow.review_unknown_as` (default: `fail`, therefore blocks)
- Absent `verdict` field, unrecognized value, or file-read failure — treated as `UNKNOWN`, then `review_unknown_as` applies

Score-based gating (`score` field, float 0–100) is read and stored when present but not enforced in v1. The enforcement switch is a documented code path, not a hidden behavior, activated once Squadron slice 301 emits stable scores.

### Slice status extension

Two new values added to the `SliceStatus` enum:

- `pending-review` — tasks complete, review gate configured, no review artifact present (or verdict is `UNKNOWN` and `review_unknown_as` treats it as pending)
- `review-failed` — review artifact present, verdict does not clear the threshold

`review-failed` is distinct from `in-progress`. The work is not incomplete; the review verdict is not cleared. Reconciliation (rerunning the review, a bounded judge dismissing findings, human decision) is above CF's layer.

When `review_enabled = false` or no gate is configured for the current transition, the status goes directly from `complete` to advance — `pending-review` and `review-failed` are never set.

### Gate insertion point

A new named priority branch in `getNext()` between current Priority 5 (`in-implementation`) and Priority 6 (`complete → advance`). When the slice status is `pending-review`, the recommendation is:

```
{ recommendation: "review", rationale: "Review required before advancing — no review artifact found for slice NNN (type: code).", ... }
```

When `review-failed`:

```
{ recommendation: "blocked", rationale: "Review artifact present but verdict FAIL does not clear threshold 'concerns'.", ... }
```

The existing `enrich()` helper and warning-attachment pattern are reused.

### Review-artifact discovery

`DocumentDetectionResult` gains a `review` slot. `documentDetector.ts` gains a detection rule that scans `project-documents/user/reviews/` for files matching `NNN-review.{reviewType}.*.md` for the current slice index and configured reviewType. The existing naming convention (e.g., `210-review.code.github-copilot-vs-code-ide-support.md`) is the pattern — no new convention is introduced.

When multiple files match (e.g., two `code` review artifacts for the same index), the gate takes the lexicographically last filename (most recent by sort order). This is deterministic and documented.

### ConsistencyChecker rule

A new `ConsistencyFinding` rule: when `review_enabled = true` and a slice is marked complete in the slice plan but its required review artifact is absent, emit a `warning`-severity finding. When the artifact is present but its verdict does not clear the threshold, emit an `error`-severity finding. Neither case is auto-fixable — a failing or missing review is not a mechanical correction.

### Initiative-level gating (in v1 scope — revised)

The `pre-slice-plan` transition (arch review must pass before slice plan creation is recommended) is defined in the config schema and in this architecture. Its gate logic — checking for `NNN-review.arch.*.md` before recommending slice plan creation — was originally deferred to a later slice. That deferral is withdrawn (see the Scope revision note above): under the position-derived reviewType model adopted at Phase 4, the `arch` boundary is just another case of the single gate mechanism, so it ships in slice 241 alongside the `slice`/`tasks`/`code` boundaries rather than as a standalone slice.

## Technical Considerations

- **Config schema for `review_gates`.** The per-transition override map is a nested TOML table. The existing `ConfigKeyDefinition` interface supports scalar keys well but does not currently model nested tables. A decision is needed at slice design time: extend `ConfigKeyDefinition` to support nested shapes, or treat `workflow.review_gates.*` as a flat namespace of dotted keys (`workflow.review_gates.pre-advance.reviewType`, etc.).

- **`review_unknown_as` interaction with `review_threshold`.** When `review_unknown_as = "concerns"`, `UNKNOWN` is treated as `CONCERNS` and then compared against `review_threshold`. This means the same `UNKNOWN` artifact can pass or block depending on the threshold — which is the intended behavior but must be documented clearly to avoid support confusion. (Token is `concerns`, plural — matching the `review_threshold` enum and the `CONCERNS` verdict. The singular `"concern"` used in an earlier draft was corrected in slice 240; see that slice's review finding F002.)

- **File-read failure modes.** A review file that exists but cannot be parsed (malformed YAML, unreadable encoding, permission error) must not silently pass. It is treated as `UNKNOWN` and `review_unknown_as` applies. The rationale returned to the caller names the parse failure explicitly.

- **Priority renumbering.** The current `getNext()` uses integer comments (Priority 1–7) to label branches. Adding a new branch between 5 and 6 requires renumbering to avoid fractional priorities. The slice implementing the gate logic should renumber the full cascade (or convert to named stages) as part of the same change.

- **`workflow.auto_advance` interaction.** `auto_advance` is a consumer-layer concern — it expresses that a runner may act on an `advance` recommendation without human confirmation. The review gate operates on the recommendation itself. If the gate fires, the recommendation is `review` or `blocked`, not `advance` — so `auto_advance` has nothing to act on. No special interaction logic is needed; the gate naturally takes precedence.

## Anticipated Slices

- **Review artifact discovery and config keys.** Add the `review` slot to `DocumentDetectionResult`, implement the detection rule in `documentDetector.ts`, and add the three global config keys and per-gate override structure to `ConfigKeys.ts`. Includes renumbering the `getNext()` priority cascade. No gate logic yet — this is the foundation the gate builds on.

- **Gate logic in WorkflowNavigator.** Add `pending-review` and `review-failed` to the `SliceStatus` enum. Extend `deriveSliceStatus()` to set these values when gate conditions apply. Add the new priority branch in `getNext()` returning `review` and `blocked` recommendations. Full unit test coverage against the verdict decision matrix and all `review_unknown_as` / `review_threshold` combinations.

- **ConsistencyChecker review rule.** Add the missing-artifact (`warning`) and failing-verdict (`error`) consistency rules. Not auto-fixable. Verify that `cf check` surfaces both conditions.

- **Initiative-level gate (pre-slice-plan).** Extend `getNext()` to check for an arch review artifact before recommending slice plan creation when `pre-slice-plan` is configured. Same gate mechanism; different insertion point in the cascade.

## Related Work

- **160-arch.project-workflow-system** — Built `WorkflowNavigator`, `ConfigKeys`, `ConsistencyChecker`, and the artifact introspection layer. Initiative 240 is purely additive to 160's infrastructure; no 160 interfaces change.

- **Squadron slice 300** (external, data contract) — Defines and owns the review-artifact frontmatter schema (`verdict` / `score` / `criteria` / `provenance`). CF reads this schema; it does not call or import Squadron. Numeric score enforcement is unblocked by Squadron slice 301.

- **180-arch.initiative-context-worktree** — Established worktree-scoped config resolution. The `workflow.review_*` keys should be resolvable at worktree scope (per-initiative review policy) as well as project scope, using the resolution chain 180 introduced.

- **Amoeba Runner** (external) — Downstream consumer of `review` and `blocked` recommendations. Routes to a review agent when the gate fires. Depends on CF returning structured `recommendation` values with a stable vocabulary — the gate must not change the `NextAction` return type, only add new `recommendation` string values.

- **001-review-gating-architecture-input.context-forge.md** — Source-grounded architecture input note, including file:line citations for the insertion point and the `DocumentDetectionResult` gap. Superseded by this document.

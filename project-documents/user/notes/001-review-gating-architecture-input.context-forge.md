---
docType: architecture-input
layer: project
project: context-forge
source: user/project-guides/001-initiative-plan.context-forge.md
audience: [human, ai]
description: Everything the architect needs to design the Phase-2 architecture for initiative 240 (Review-Aware Workflow Gating) without re-deriving it from source. Grounded in a read-only inspection of packages/core and packages/mcp-server, with file:line citations.
dateCreated: 20260621
dateUpdated: 20260621
status: not_started
---

# Architecture Input: Initiative 240 — Review-Aware Workflow Gating

Purpose: give the 240 architect a complete, source-grounded starting point so the Phase-2 architecture document can be written directly. This note states **what 240 must do**, **where in the existing code it attaches**, **what is missing and must be built**, **the cross-project data contract it depends on**, and **the decisions already locked** (so they are not re-litigated) vs. **the decisions the architecture must make**.

All CF-side claims are grounded in a read-only inspection of `packages/core/src/introspection/*` and `packages/core/src/config/*`; file:line citations are included so the architect can start from the exact code.

## What 240 is (one paragraph)

`cf next` today reasons over artifact existence and task-checkbox state and walks a project from concept → code. It is **blind to reviews**: when a slice's tasks are all checked, the state machine jumps straight to "advance to the next slice," even if that slice's review is missing or failing. Initiative 240 inserts a **deterministic, AI-free review gate** into that state machine: configurable rules for *which states require a review artifact* and *what verdict/score clears the bar*, read from the review artifact's frontmatter. When a required review is absent or below threshold, the recommended next action becomes *review* (or *blocked*) instead of *advance*. It routes **to** a review; it never performs one. No model is invoked. Amoeba's Runner consumes the same gate later rather than reimplementing it.

## The single most important fact (the insertion point)

The state machine is a **priority-ordered cascade** in `WorkflowNavigator.getNext()` — `packages/core/src/introspection/WorkflowNavigator.ts:83-300`. Slice status is a closed enum derived in `deriveSliceStatus()` (`:446-497`):

```
needs-design → needs-tasks → in-implementation → complete → (advance to next slice)
```

(`SliceStatus.status` type: `packages/core/src/introspection/types.ts:243-252`.)

**There is no review state between `complete` and "advance."** Priority 6 (`WorkflowNavigator.ts:248-266`) takes a slice whose tasks are all checked and immediately recommends `cf set slice <next>`. **That gap — between "tasks complete" and "advance to next slice" — is exactly where the review gate inserts.** The architecture's central decision is how to represent "complete-but-unreviewed" / "complete-but-review-failing" as a first-class state the cascade checks *before* Priority 6 fires.

A clean shape to evaluate (architect decides): add a `needs-review` (and possibly `review-failing`) value to the `SliceStatus` enum, populated by `deriveSliceStatus()` after it computes `inferredStatus === 'complete'`, gated on config. Then add a new priority branch in `getNext()` between current Priority 5 (in-implementation) and Priority 6 (complete → advance) that returns a "create/await review" recommendation. This keeps the gate inside the one state machine rather than bolting a parallel checker alongside it.

## What already exists (build on these as-is)

- **Declarative config registry.** Adding config keys is a literal object entry. `packages/core/src/config/ConfigKeys.ts:9-36` already defines `workflow.auto_advance` and `workflow.auto_fix` (both `boolean`, default `false`). The `ConfigKeyDefinition` interface (`:1-7`) supports `type`, `default`, `description`, optional `enum`, and optional `validate(value) => string | null`. **240's two new keys are a direct addition here** — no new config infrastructure needed. Resolution order is project → user → built-in default (confirmed via `config_get`).
- **The state machine itself.** `WorkflowNavigator.getNext()` / `getStatus()` / `deriveSliceStatus()` — stateless, derives everything from `ProjectData` + filesystem. New states slot into the existing priority cascade.
- **Frontmatter extraction.** `FrontmatterResult` / `FrontmatterData` already exist (`types.ts:40-50`) — the review gate reads `verdict`/`score` from a review doc's frontmatter using the same machinery the introspection layer already uses.
- **A frontmatter-aware consistency checker with a fix mechanism.** `ConsistencyChecker` emits `ConsistencyFinding`s and can apply `update-frontmatter` / `update-checkbox` fixes (`types.ts:197-238`). The `workflow_check` side of 240 (detecting "slice complete but no/failing review") is a **new consistency rule** in this existing framework, and `workflow.auto_fix` already gates whether checks self-correct. This is the natural home for the *check* half; `workflow_next` is the home for the *recommend* half.
- **MCP + CLI parity surface.** `workflow_next` (MCP) and `cf next` (CLI) both call `WorkflowNavigator.getNext()`; `workflow_check` (MCP) and `cf check` (CLI) both call the consistency checker. Putting the gate in the navigator/checker means **both surfaces inherit it for free** — no per-surface work. (`packages/mcp-server/src/tools/workflowTools.ts`, `packages/cli/src/commands/{next,check}.ts`.)

## What is MISSING and must be built

1. **Review-artifact discovery.** `DocumentDetectionResult` (`types.ts:67-73`) has slots for `sliceDesign`, `taskFile`, `architecture`, `slicePlan` — **and no `review` slot.** `documentDetector.ts` has zero review awareness (confirmed: no `review` token in the file). The architecture must define how a slice's review artifact is located. The convention exists in practice — e.g. `project-documents/user/reviews/301-review.slice.judge-enforcement-layer.md` — so this is "add a `review` detection slot mirroring `sliceDesign`," not a green-field design. Decide: one review per slice, or multiple (per-phase reviews: arch/slice/tasks/code)? The slice-300 contract and the review-gate policy table in Amoeba's concept imply potentially per-phase reviews.
2. **The two config keys** (names tentative — architect confirms):
   - `workflow.review_required` — which states/phases require a review artifact before advance. Boolean is the v1 minimum (mirrors `auto_advance`); a per-phase list (`["P2","P4","P5","P6"]`) is the richer shape Amoeba's policy table wants. Decide v1 scope.
   - `workflow.review_threshold` — what clears the bar. v1 = a verdict floor (`concern` | `fail`-excluded); later = a numeric score floor once Squadron emits scores. Use `ConfigKeyDefinition.enum`/`validate` to constrain it.
3. **The gate logic** — read the review artifact's frontmatter, compare `verdict` (and later `score`) to the threshold, and decide pass / needs-review / review-failing. Pure deterministic function; no AI.
4. **The new `SliceStatus` enum value(s)** and the `getNext()` priority branch (see "insertion point" above).
5. **The new consistency rule** in `ConsistencyChecker` for the `workflow_check` side.

## The cross-project data contract (the seam — do NOT redesign it)

The review gate reads a **review-artifact frontmatter contract owned by Squadron**, standardized in Squadron **slice 300 (Numeric Scoring Foundation)**:

- `verdict` — `{PASS, CONCERNS, FAIL, UNKNOWN}` (the v1 gate keys on this).
- `score` — `float | None` (0–100 once populated; numeric gating activates when present).
- `criteria` — `dict[str, float] | None` (per-criterion sub-scores; optional, not required by the gate).
- `provenance` — `str | None` (who/what produced the verdict; informational).

**This frontmatter schema is the contract between CF and Squadron — keep it a documented data contract, not a code dependency.** CF depends only on the *shape* being stable; it does not import or call Squadron. Numeric-score gating is unblocked by Squadron **slice 301 (Judge Enforcement Layer)**, which derives verdict-from-score and populates `score`/`provenance`. Until 301 ships a score, 240's threshold is **verdict-only** and conservative.

A v1 caveat to design for: a review artifact may carry `verdict` with `score: None` (300 is additive; no template emits a score yet). The gate must handle verdict-only artifacts as the *normal* v1 case, not an error.

## Decisions already locked (do not re-open)

- **Gate lives in `cf next` / context-forge, not in an external orchestrator.** Chosen so `cf next` is review-aware *standalone*; Amoeba consumes it rather than owning it. (This is the whole reason 240 is a CF initiative and not an Amoeba one.)
- **AI-free / deterministic.** The gate routes to a review and thresholds a verdict/score. It never invokes a model. Judgment (running the review, scoring) is Squadron's; gating (does a review exist, does it pass) is CF's.
- **v1 threshold is conservative** — `verdict != FAIL` passes; numeric-score gating is a later activation gated on Squadron 301.
- **Both MCP and CLI inherit the gate** by placing it in the shared navigator/checker, not per-surface.

## Decisions the architecture must make

- **State representation:** new `SliceStatus` enum value(s) vs. a separate review-status object; exact placement of the new priority branch in `getNext()`.
- **Review-artifact discovery:** one-per-slice vs. per-phase; the detection rule added to `documentDetector` / `DocumentDetectionResult`.
- **Config granularity:** `workflow.review_required` as a boolean vs. a per-phase list for v1.
- **`UNKNOWN`/missing handling:** when a review is required but absent, or its `verdict` is `UNKNOWN` — does the gate recommend *create review*, or *block*? (Recommend an observable signal either way — `cf check` should surface "required review missing," consistent with the project's fail-fast / observable-failure rules.)
- **Interaction with `workflow.auto_advance`:** if auto-advance is on but a review gate fails, the gate must win (do not advance). Define the precedence explicitly.
- **`workflow_check` rule shape:** the new `ConsistencyFinding` rule name, severity (likely `warning` for missing, `error` for failing), and whether any part is `fixable` (probably not — a failing review is not auto-fixable).

## Dependencies

- **Internal:** initiative **160 (Project Workflow System)** — 240 extends its `WorkflowNavigator` and config system. (See initiative plan cross-dependency `240 depends on 160`.)
- **External (data contract only):** Squadron slice **300** (frontmatter shape, exists now) and slice **301** (populates `score`/`provenance`, unblocks numeric gating). Not a code dependency.

## Notes

- This note is architecture *input*, not the architecture. The Phase-2 architecture document for 240 supersedes it and should cite it as source.
- Companion: the downstream consumer (Amoeba's Runner, initiative 120) is recorded in `amoeba/project-documents/user/notes/001-squadron-dependencies.amoeba.md` — Amoeba reads this gate's result; it does not reimplement it.

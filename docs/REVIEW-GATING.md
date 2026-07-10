---
docType: guide
scope: review-gating
audience: [project-managers, ai-agent-developers]
dateCreated: 20260709
dateUpdated: 20260709
---

# Review Gating

Deterministic, AI-free routing that lets a project require a review artifact to exist (and clear a verdict threshold) before Context Forge recommends advancing past a lifecycle boundary. **Off by default** (`workflow.review_enabled = false`). When off, there is **zero** behavior change — `cf next` and `cf check` behave exactly as they did before this feature existed.

Context Forge only *recommends*. It never advances a phase, mutates a status, or blocks a command on its own — gating changes what `cf next` suggests and what `cf check` flags, not what you're allowed to do.

## The Position-Derived Model

The review a slice or architecture doc owes is derived entirely from **where it sits in the lifecycle**, never from configuration:

| Boundary | Owed before | Review type |
|---|---|---|
| `preSlicePlan` | slice-plan creation | `arch` |
| `preTasks` | task breakdown | `slice` |
| `preImplementation` | implementation (Phase 6) | `tasks` |
| `preAdvance` | advancing past complete | `code` |

There is no `review_type` config key, and there never will be — review type is a function of lifecycle position, not a setting. (An earlier design considered a per-gate `review_type` override key; it shipped, then was **removed** in commit `92ead91` (#60) once the position-derived model proved sufficient. See the [CHANGELOG](../CHANGELOG.md) and history below.)

## Config Keys

All eight keys live under the `workflow.*` namespace. Read any of them with `cf config get <key>`; each one-liner below is quoted verbatim from that key's `description` in source, so the CLI's help text and this doc never diverge.

| Key | Type | Default | Allowed values |
|---|---|---|---|
| `workflow.review_enabled` | boolean | `false` | — |
| `workflow.review_threshold` | string | `concerns` | `pass`, `concerns` |
| `workflow.review_unknown_as` | string | `fail` | `fail`, `concerns`, `pass` |
| `workflow.review_gates.code.threshold` | string | `''` | `''`, `pass`, `concerns` |
| `workflow.review_gates.arch.threshold` | string | `''` | `''`, `pass`, `concerns` |
| `workflow.review_gates.slice.threshold` | string | `''` | `''`, `pass`, `concerns` |
| `workflow.review_gates.tasks.threshold` | string | `''` | `''`, `pass`, `concerns` |
| `workflow.review_gate_effective_date` | string | `''` | `YYYYMMDD` or `''` |

- **`workflow.review_enabled`** — Enable review gating in the workflow navigator (off by default; no behavior change when false).
- **`workflow.review_threshold`** — Verdict floor that clears a review gate: "pass" requires PASS; "concerns" clears on PASS or CONCERNS.
- **`workflow.review_unknown_as`** — How to treat an UNKNOWN/absent/unparseable verdict: "fail" blocks, "concerns" treats as CONCERNS, "pass" clears.
- **`workflow.review_gates.code.threshold`** — Per-gate override: verdict floor for the code (pre-advance) review gate (empty = use `workflow.review_threshold`).
- **`workflow.review_gates.arch.threshold`** — Per-gate override: verdict floor for the arch (pre-slice-plan) review gate (empty = use `workflow.review_threshold`).
- **`workflow.review_gates.slice.threshold`** — Per-gate override: verdict floor for the slice (pre-tasks) review gate (empty = use `workflow.review_threshold`).
- **`workflow.review_gates.tasks.threshold`** — Per-gate override: verdict floor for the tasks (pre-implementation) review gate (empty = use `workflow.review_threshold`).
- **`workflow.review_gate_effective_date`** — Grandfathers slices/architecture designed before this date (`YYYYMMDD`, compared against the artifact's own `dateCreated`) out of every review gate boundary. Empty (default) applies no cutoff — every slice is subject to gating. Lets a project turn on `review_enabled` without retroactively demanding reviews for work completed before the gate existed.

The four `review_gates.*.threshold` keys default to `''` (empty), meaning "use the global `workflow.review_threshold`." Set one only when a specific boundary needs a stricter or looser floor than the project-wide default.

## The Decision Matrix

A present review artifact's frontmatter `verdict` is normalized to one of `PASS` / `CONCERNS` / `FAIL` / `UNKNOWN`, then evaluated against the resolved threshold (`pass` or `concerns`) for that boundary:

| Verdict | `threshold: pass` | `threshold: concerns` |
|---|---|---|
| `PASS` | clears | clears |
| `CONCERNS` | fails | clears |
| `FAIL` | fails | fails |
| `UNKNOWN` | substituted via `review_unknown_as`, then re-evaluated | substituted via `review_unknown_as`, then re-evaluated |

`review_unknown_as` substitutes a stand-in verdict before the matrix runs again: `fail` → treat as `FAIL`, `concerns` → treat as `CONCERNS`, `pass` → treat as `PASS`. An `UNKNOWN` verdict arises from a review file whose frontmatter `verdict` field is missing or unrecognized — it is never silently cleared without going through this substitution.

**Absent vs. present matters:**
- No review artifact exists at all → **`pending-review`**.
- A review artifact exists but its verdict doesn't clear the threshold → **`review-failed`**.

## Workflow States

- **`pending-review`** — the boundary's review artifact doesn't exist yet. `cf next` recommends `review` (write the review before proceeding).
- **`review-failed`** — a review artifact exists but its verdict doesn't clear the configured threshold. `cf next` recommends `blocked`.

Both are recommendations only. Nothing in Context Forge prevents you from creating the next artifact anyway — the gate shapes guidance, not permission.

## `cf check` Findings

With gating on, `cf check` (no `--slice` flag — i.e. `checkAll()`) surfaces a `review-gate` finding at **all four boundaries**: `arch`, `slice`, `tasks`, and `code`. (`cf check --slice <n>` only evaluates the slice/tasks/code boundaries for that one slice — arch-boundary checking runs only in the full `cf check` sweep, since it applies across the architecture rather than to one slice.)

- Slice/artifact complete but review absent → **`warning`**.
- Review present but verdict fails the threshold → **`error`**.
- **Never auto-fixable.** `cf check --fix` cannot resolve a `review-gate` finding — a human has to actually write or complete the review. (Contrast with other checker rules like stale-checkbox findings, which `--fix` can correct automatically.)

## Escape Hatches

Two independent ways to exempt work from gating, for different reasons.

### Effective-date grandfathering

Set `workflow.review_gate_effective_date` to a `YYYYMMDD` cutoff. Any slice or architecture doc whose frontmatter `dateCreated` is **before** the cutoff is exempt from **every** boundary — checked ahead of every other rule, so a grandfathered artifact needs no further declaration. Empty (default) applies no cutoff, so every slice is subject to gating once `review_enabled` is on.

**Purpose:** turn on gating for a project that already has history, without retroactively demanding reviews for work completed before the gate existed.

### Docs-only slices (`codeReview: none`)

A slice-design frontmatter field. When a slice design declares `codeReview: none`, the `code` (pre-advance) gate is cleared unconditionally for that slice — it produces no code, so it cannot produce a code review. Default (field absent) means the code review is still required.

Write it by hand, or run:

```bash
cf check --set-review-none <index>
```

This writes `codeReview: none` to the slice's design frontmatter for you.

**Scoped to the pre-advance boundary only** — a docs-only slice still owes arch/slice/tasks reviews normally; only the code-review gate is skipped.

## Worked Example

```bash
# 1. Turn gating on, at the default (concerns-or-better) threshold
cf config set workflow.review_enabled true

# 2. Hit a gate: a complete slice with no review artifact
cf next
# → pending-review: "Slice 12 requires a tasks review before proceeding — no review artifact found."

# 3. Clear it: write the review artifact with a PASS or CONCERNS verdict,
#    then re-check
cf next
# → gate clears, next action recommended normally

# 4. A docs-only slice with no code to review
cf check --set-review-none 243
cf next
# → the code (pre-advance) gate no longer applies to slice 243

# 5. Grandfather pre-existing work
cf config set workflow.review_gate_effective_date 20260101
# → any slice/arch dated before 2026-01-01 is exempt from every boundary
```

## Related

- [CHANGELOG.md](../CHANGELOG.md) — `[Unreleased]` entries for this feature.
- `ConfigKeys.ts` (`packages/core/src/config/ConfigKeys.ts`) — source of truth for every key above.

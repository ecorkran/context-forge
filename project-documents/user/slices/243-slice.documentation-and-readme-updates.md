---
docType: slice-design
slice: documentation-and-readme-updates
project: context-forge
parent: project-documents/user/architecture/240-slices.review-aware-workflow-gating.md
dependencies: [240, 241, 242]
interfaces: []
dateCreated: 20260709
dateUpdated: 20260709
status: complete
codeReview: none
---

# Slice Design: Documentation and README Updates

## Overview

This is the closeout slice for initiative 240. Slices 240–242 built the review gate — config keys, discovery, the `reviewGate.ts` evaluator, the `WorkflowNavigator` gating, and the `ConsistencyChecker` rule — and shipped them all behind `workflow.review_enabled` (default off). Slices 911–912 then extended that surface with two escape hatches (effective-date grandfathering, per-slice `codeReview: none`) and broadened `cf check` to all four boundaries. **Every one of those behaviors is merged to `main` and `status: complete`, and none has been released to users.** What is missing is *user-facing documentation*: a person enabling review gating today has no README section and no reference page describing the config keys, the position-derived model, the new statuses, or the two opt-outs.

Slice 243 writes that documentation. It ships **no code** — it is a pure docs slice. Its one non-obvious job is honesty about scope: the review-gating surface that actually shipped is **larger than the 240/241/242 designs described**, because 911/912 added keys and behaviors after those designs were written. 243 documents the surface **as merged**, not as originally designed, and corrects the stale descriptions the earlier docs left behind.

### Two deliverables (PM decision, 20260709)

1. **A concise "Review Gating" section in the root `README.md`** — discoverable, alongside the existing config/workflow content, that summarizes the feature and links to the reference doc.
2. **A dedicated reference doc, `docs/REVIEW-GATING.md`** — the full config-key reference, decision matrix, position-derived model, status values, and the two opt-outs. This follows the established `docs/` convention (`TOOLS.md`, `AGENT-INTEGRATION.md` — ALL-CAPS reference docs linked from the README's "Related" section).

## Value

- A user can turn on `workflow.review_enabled` and understand, from documentation alone, **which** review each boundary owes (without reading source), **how strict** they can make it, **how** to exempt legacy work, and **how** to mark a docs-only slice exempt. Today all of that is discoverable only by reading `reviewGate.ts` and `ConfigKeys.ts`.
- The **stale/incomplete descriptions** left by the earlier work are corrected in one place: the CHANGELOG's `[Unreleased]` entry still describes `review_type` per-gate keys as "inert" (line 22) when they were in fact **removed** (commit `92ead91`, #60), and never mentions `review_gate_effective_date` or `codeReview: none` in the designed-surface framing. 243 reconciles documentation with shipped reality before release.
- The initiative closes with its documentation debt paid — a prerequisite for the eventual version bump that ships review gating.

## Scope

**In scope**

- New `docs/REVIEW-GATING.md` reference doc covering the complete, as-merged surface (enumerated in Technical Decisions below).
- New "Review Gating" section in root `README.md` (summary + link to the reference doc; a "Related" link entry mirroring the existing `AGENT-INTEGRATION.md` link).
- Reconcile the CHANGELOG `[Unreleased]` review-gating entries with shipped reality (correct the `review_type`-keys-are-inert language to reflect their removal; ensure effective-date and `codeReview: none` are described in user-facing terms). No new version section — release is a separate step.
- Correct the one stale forward-looking Note in the 240 slice plan (line 28) that framed the `review_type` decision as still-open / "inert or removed"; the answer is **removed**, and 243 records that so the plan is not self-contradictory in the archive.
- **Correct the 240 architecture document's stale Envisioned State (TD-6).** The arch's **Envisioned State → Config keys** section (`240-arch...:70–90`) still shows the never-shipped `reviewType`-bearing per-transition override syntax and omits both post-design keys. Since the architecture is the authoritative design reference, it must not silently contradict shipped behavior at release. This is the same principle 243 applies to the CHANGELOG and slice-plan Note, extended to the highest-authority artifact — and it stays within the docs-only constraint (a `.md` edit).

**Out of scope**

- **Any code change.** No `ConfigKeys.ts` edits, no `reviewGate.ts` edits, no test changes. If documenting the surface reveals a *code* defect (e.g. a key whose behavior contradicts its `description`), 243 does not fix it — it flags it to the PM as future work. Documentation describes what shipped; it does not change it.
- MCP `docs/TOOLS.md` tool-parameter changes — no review-gating tool signatures changed (the gate rides inside existing `workflow_next`/`workflow_check`/`config_*` tools), so TOOLS.md needs no per-tool edits. A one-line pointer from the workflow-tools intro to `REVIEW-GATING.md` is optional and left to implementation judgment.
- Documenting numeric `score` gating (a v1 no-op, gated behind Squadron slice 301) beyond a single "not yet active" sentence.
- Per-package READMEs (`packages/*/README.md`) — the feature is cross-cutting; the root README + reference doc are the correct homes. No per-package duplication (DRY).

## The surface to document (ground truth, verified against `main`)

This table is the authoritative inventory 243 documents. Every row was verified against the merged source, not the design docs — because the design docs are, in three rows, out of date.

| Behavior | Surface (config key / frontmatter / CLI) | Introduced by | Design-trail status |
|---|---|---|---|
| Global on/off | `workflow.review_enabled` (bool, default `false`) | 240 | designed ✅ |
| Verdict floor | `workflow.review_threshold` (`pass`\|`concerns`, default `concerns`) | 240 | designed ✅ |
| Unknown-verdict policy | `workflow.review_unknown_as` (`fail`\|`concerns`\|`pass`, default `fail`) | 240 | designed ✅ |
| Per-gate threshold override | `workflow.review_gates.{code,arch,slice,tasks}.threshold` (`''`\|`pass`\|`concerns`, default `''`) | 241, **keys renamed** in #60 | ⚠️ keys differ from 241's design text |
| `review_type` per-gate keys | **removed** | removed in #60 (`92ead91`) | ⚠️ plan/CHANGELOG still call them "inert" |
| Position-derived review type | (behavior) `arch`→slice-plan, `slice`→tasks, `tasks`→impl, `code`→advance | 241 | designed ✅ |
| New slice statuses | `pending-review`, `review-failed` | 241 | designed ✅ |
| Effective-date grandfather | `workflow.review_gate_effective_date` (`YYYYMMDD`\|`''`, default `''`) | **912** | ❌ post-243 slice |
| Docs-only opt-out | `codeReview: none` slice-design frontmatter + `cf check --set-review-none <index>` | **911/912** (#57) | ❌ post-243 slice |
| Four-boundary `cf check` | `cf check`/`workflow_check` fires at `arch`/`slice`/`tasks`/`code`, not just `code` | **912** | ❌ post-243 slice |

The three ⚠️/❌ rows are exactly what makes 243 non-trivial: a docs slice that copied the 240/241/242 designs would ship documentation that is wrong about `review_type` and silent about the two most user-visible escape hatches.

## Technical Decisions

### TD-1 — Document the surface *as merged*, not *as designed* (the core decision)

The slice-plan brief for 243 (written before 911/912 existed) says: *"document why the earlier per-gate `review_type` config keys are inert/removed."* Under the shipped code they are **removed**, not inert. More broadly, three behaviors (effective-date, `codeReview: none`, four-boundary check) shipped after the 243 brief was written and have no user documentation anywhere. **243 documents the complete surface that exists on `main`, and the source of truth is the code** (`ConfigKeys.ts`, `reviewGate.ts`, `frontmatterSchema.ts`, `check.ts`), cross-checked against the 911/912 slice designs — not the 240/241/242 designs, which are superseded on these three points. Where a prior doc (CHANGELOG, slice plan) describes the surface inaccurately, 243 corrects it.

Rationale: shipping documentation that contradicts shipped behavior is worse than no documentation. The PM confirmed (20260709) that the effective-date key is in scope for 243, which settles the direction — 243 owns the full as-merged surface, not a designed subset.

### TD-2 — Reference doc lives at `docs/REVIEW-GATING.md`, README carries a summary + link

`docs/` already holds the project's user-facing reference material in ALL-CAPS files (`TOOLS.md`, `AGENT-INTEGRATION.md`, `EXTRACTION-COMPOUND-COMMANDS.md`), each linked from the README's "Related" section. `REVIEW-GATING.md` follows that exact convention — same location, same naming, same linking pattern. The README gets a compact "Review Gating" subsection (under "How It Works" or adjacent to the config mention at `README.md:154`) that: states what the feature does, shows the one-line enable, names the default-off guarantee, and links to the reference doc. The full matrix, all eight keys, and the two opt-outs live in the reference doc — not duplicated in the README (DRY).

Rejected: a `project-documents/user/` reference doc (that tree is process/planning artifacts, not shipped product docs — the wrong audience); README-only (the full decision matrix + eight keys would bloat a README that is deliberately a landing page).

### TD-3 — Reference doc structure

`docs/REVIEW-GATING.md` sections, in order:

1. **What it is / default-off guarantee.** One paragraph: deterministic, AI-free routing; off unless `review_enabled = true`; when off, zero behavior change.
2. **The position-derived model.** The boundary→review-type table (`arch`/`slice`/`tasks`/`code`), stating explicitly that the review type is derived from lifecycle position and is *never configured* — and therefore no `review_type` config key exists (correcting the removed-keys history in one sentence).
3. **Config keys.** All eight, each with type, default, allowed values, and a one-line meaning — sourced verbatim from the `description` strings already in `ConfigKeys.ts` so the doc and the `cf config` help never diverge:
   - `workflow.review_enabled`
   - `workflow.review_threshold`
   - `workflow.review_unknown_as`
   - `workflow.review_gates.{code,arch,slice,tasks}.threshold` (per-gate override; empty = use global)
   - `workflow.review_gate_effective_date`
4. **The decision matrix.** The `(verdict × threshold × unknown_as) → clears/pending/failed` table from 241 TD-2, with the absent-artifact → `pending-review` and present-not-clearing → `review-failed` distinction.
5. **New workflow states.** `pending-review` and `review-failed` — what each means, what recommendation each produces (`review` / `blocked`), and that CF only *recommends*, never mutates state.
6. **`cf check` findings.** Slice-complete-but-review-absent → `warning`; present-but-failing → `error`; never auto-fixable; now fires at all four boundaries (912).
7. **Escape hatches.**
   - **Effective-date grandfathering** (`review_gate_effective_date`): a slice/arch whose frontmatter `dateCreated` is *before* the cutoff is exempt from every boundary. Purpose: turn gating on for a project with history without retroactively demanding reviews for old work. Format `YYYYMMDD`; empty = no cutoff.
   - **Docs-only slices** (`codeReview: none`): a slice design that declares `codeReview: none` in frontmatter is not blocked at the `code`/pre-advance gate (it cannot produce a code review). Default (absent) = code review still required. `cf check --set-review-none <index>` writes the declaration for you. Scoped to the pre-advance boundary only.
8. **Worked example.** A short "enable → hit a gate → clear it" walkthrough mirroring the 241 verification steps (compressed).

### TD-4 — Config-key descriptions are the single source of truth; the doc quotes them

The `description` field on each key in `ConfigKeys.ts` is what `cf config get <key>` prints. To prevent the reference doc from drifting from the CLI help, the doc's per-key one-liners are taken from those `description` strings (lightly reflowed for prose, not reworded in substance). If a key's `description` is itself unclear, 243 flags it as future work rather than silently improving the doc while leaving the CLI help worse — the two must agree, and code is out of scope (TD-1).

### TD-5 — CHANGELOG reconciliation, not rewriting

The `[Unreleased]` section already has review-gating entries (some added by 240/241/242, some by 911/912). 243 makes them internally consistent and release-ready:
- Correct the line that still calls the `review_type` per-gate keys "inert" — they were removed.
- Ensure the effective-date and `codeReview: none` entries read as user-facing capabilities (they largely do already from 911/912).
- Do **not** invent a version section or reorder released history. Release/version-bump is a separate task outside 243.

### TD-6 — Reconcile the architecture's Envisioned State with shipped reality (resolves review F002)

The 240 architecture doc's **Envisioned State → Config keys** section (`240-arch.review-aware-workflow-gating.md:70–90`) is stale on three points that the merged code contradicts:

1. **Override syntax.** The arch shows nested per-transition tables with `reviewType` fields (`pre-slice-plan = { reviewType = "arch", threshold = "pass" }`). The shipped keys are flat, position-named, threshold-only: `workflow.review_gates.{code,arch,slice,tasks}.threshold`. No `reviewType` field exists.
2. **`review_type` keys.** Presented as a designed feature; **removed** in #60.
3. **Missing surface.** Neither `review_gate_effective_date` (912) nor `codeReview: none` (911/912) appears in the Envisioned State at all.

243 corrects this section so the authoritative design reference matches shipped behavior at release. **Approach — extend the existing precedent, don't rewrite history.** The arch already carries a top-of-document *"Scope revision (Phase 4, 20260702)"* note (`:23–24`) recording where implementation superseded the original design; that is the established mechanism in this exact doc for recording supersession without destroying the original reasoning. 243 uses the same mechanism: a dated **"Implementation reconciliation"** note (and/or a corrected fenced config-keys block) in the Envisioned State that states the shipped shape, points to the reference doc, and preserves the original text as "as originally envisioned." The original design intent stays legible; the reader is not misled about what shipped.

Consistency with TD-1: this is the same "documentation must not contradict shipped behavior" principle 243 applies to the CHANGELOG and slice-plan Note — the review (F002) correctly observed that applying it to the two lower-authority artifacts while ignoring the highest-authority one was inconsistent. This decision closes that gap. It remains docs-only (a `.md` edit; no code, keys, or behavior touched — TD-1 holds).

## Interfaces & Dependencies

**Depends on (all shipped/complete on `main`):**
- 240 — the three global keys and discovery.
- 241 — position-derived model, `reviewGate.ts`, the two new statuses, per-gate threshold keys.
- 242 — the `cf check` review-gate finding.
- 911/912 — effective-date, `codeReview: none`, four-boundary check, `--set-review-none`, `review_type`-key removal (#60). *243 does not depend on these being designed **before** it — it depends on them being **merged**, which they are.*

**Provides:** nothing to other slices (terminal docs slice; `interfaces: []`).

**No interface changes.** Docs only — no types, keys, signatures, or behavior touched.

## Success Criteria

1. `docs/REVIEW-GATING.md` exists and documents **all eight** config keys — `review_enabled`, `review_threshold`, `review_unknown_as` (3), the four `review_gates.{code,arch,slice,tasks}.threshold` overrides (4), and `review_gate_effective_date` (1) — with correct types, defaults, and allowed values matching `ConfigKeys.ts` exactly.
2. The reference doc documents the position-derived review-type model, the `pending-review`/`review-failed` states, the decision matrix, the `cf check` findings (all four boundaries), and **both** escape hatches (`review_gate_effective_date`, `codeReview: none` + `cf check --set-review-none`).
3. The reference doc does **not** describe any `review_type` config key as existing (they were removed); it states that review type is position-derived and unconfigurable.
4. Root `README.md` gains a "Review Gating" summary that states the default-off guarantee and links to `docs/REVIEW-GATING.md` (a "Related" entry mirroring the existing `AGENT-INTEGRATION.md` link).
5. The CHANGELOG `[Unreleased]` review-gating entries are internally consistent with shipped behavior — no remaining claim that `review_type` keys are "inert."
6. The 240 slice-plan Note (line 28) is corrected to record the resolved decision (`review_type` keys **removed**), so the archived plan is not self-contradictory.
7. The 240 architecture doc's **Envisioned State → Config keys** section no longer contradicts shipped behavior: it reflects the flat `review_gates.*.threshold` override shape, records that `review_type` keys were removed, and accounts for `review_gate_effective_date` and `codeReview: none` — via a dated reconciliation note that preserves the original design text (TD-6).
8. Every config key, default value, and CLI flag named in the docs is verified against the actual source (`ConfigKeys.ts`, `check.ts`, `frontmatterSchema.ts`) — no invented keys, defaults, or flags.
9. No source-code, test, or config-key change is introduced by this slice (`git diff` touches only `.md` files).

## Verification Walkthrough (draft — to be executed and refined at Phase 6)

Docs slices are verified by *cross-checking every documented fact against the code it describes* and by exercising the CLI the docs tell a user to run. Concrete steps:

1. **Every documented key exists and matches.** For each of the eight keys, run `cf config get <key>` (via the locally built CLI, `node packages/cli/dist/index.js config get <key>`) and confirm the doc's stated default and allowed values match the CLI's output and the `enum`/`default` in `ConfigKeys.ts`. Any mismatch is a doc bug to fix before closeout.
   ```bash
   for k in workflow.review_enabled workflow.review_threshold workflow.review_unknown_as \
            workflow.review_gates.code.threshold workflow.review_gates.arch.threshold \
            workflow.review_gates.slice.threshold workflow.review_gates.tasks.threshold \
            workflow.review_gate_effective_date; do
     node packages/cli/dist/index.js config get "$k"
   done   # all eight keys
   ```
2. **No phantom `review_type` key.** `cf config get workflow.review_gates.code.review_type` must fail / report unknown key — confirming the doc is right to say it does not exist. Confirm `grep -r "review_type" packages/core/src/config/ConfigKeys.ts` returns nothing.
3. **Effective-date behavior matches the doc.** Follow the reference doc's grandfathering description literally against a scratch project: set `review_gate_effective_date` to a date *after* a complete slice's `dateCreated`, confirm `cf next` does **not** gate it; set it *before*, confirm the gate fires. The doc's claim and the observed behavior must agree.
4. **Docs-only opt-out matches the doc.** On a complete slice with no code review, `cf next` reports `pending-review`; run `cf check --set-review-none <index>` (or hand-add `codeReview: none`); confirm `cf next` no longer gates it — exactly as the doc's escape-hatch section says.
5. **`cf check` four-boundary claim.** With gating on, confirm `cf check` can surface a non-`code` boundary finding (e.g. a `slice` review pending), matching the doc's statement that the check is no longer code-only.
6. **README link resolves.** Confirm the README's new "Review Gating" link points to `docs/REVIEW-GATING.md` and the path is correct (relative link renders on GitHub).
7. **Architecture reconciliation is present and faithful.** Confirm the 240 arch's Envisioned State no longer shows the `reviewType`-bearing override syntax as the shipped shape, names the `review_type` removal, and accounts for `review_gate_effective_date` + `codeReview: none` — while the original design text remains legible as "as originally envisioned" (TD-6). Cross-check the corrected config-keys block against `ConfigKeys.ts` the same way step 1 checks the reference doc.
8. **Docs-only diff.** `git diff main --name-only` for the slice lists only `.md` files (README, the new reference doc, CHANGELOG, the slice plan, and the 240 arch doc). Any non-`.md` file in the diff means scope leaked into code — stop and reassess.
9. **This slice is itself docs-only** — so at Phase 6 it should declare `codeReview: none` in its own frontmatter (it produces no code to review), which will clear its own pre-advance gate. A fitting dogfood of the escape hatch it documents.

## Effort

1/5 — two markdown files and two small reconciliations, no code. The only real work is *accuracy*: the surface is larger and partly mis-described by prior docs, so the effort is verification (cross-checking every key/flag/default against source) rather than volume. Risk: Low — a documentation error is caught by the Phase 6 cross-check walkthrough, and nothing this slice touches can change runtime behavior.

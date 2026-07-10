---
docType: tasks
slice: documentation-and-readme-updates
project: context-forge
lld: project-documents/user/slices/243-slice.documentation-and-readme-updates.md
dependencies: [240, 241, 242, 911, 912]
projectState: "Initiative 240 (review-aware workflow gating) is code-complete and merged to main: slices 240/241/242 shipped the gate, and 911/912 added the effective-date grandfather, the codeReview:none docs-only opt-out, four-boundary cf check, and removed the review_type per-gate keys (#60). All behavior is behind workflow.review_enabled (default off) and UNRELEASED. No user-facing documentation of the review-gating surface exists yet. Slice 243 is the docs-only closeout."
status: not_started
---

# Tasks: Documentation and README Updates (Slice 243)

## Context Summary

Slice 243 writes the user-facing documentation for the review-gating feature that initiative 240 (plus 911/912) shipped but never documented. It is **docs-only** — every task edits `.md` files; **no** source, test, or config-key change is permitted (design TD-1). The `git diff` at the end must touch only markdown.

Two primary deliverables plus three reconciliations:

- **Deliverable A** — new reference doc `docs/REVIEW-GATING.md` (the full surface: 8 config keys, decision matrix, position-derived model, statuses, `cf check` findings, both escape hatches, a worked example).
- **Deliverable B** — a "Review Gating" summary in root `README.md` that links to the reference doc.
- **Reconciliation C** — CHANGELOG `[Unreleased]` entries corrected (remove the "inert `review_type` keys" language; fix the stale key-name list).
- **Reconciliation D** — 240 slice-plan Note (line 28) — *already done in the design commit `dcdb619`*; this task only verifies it.
- **Reconciliation E** — 240 architecture doc Envisioned State (design TD-6): correct the never-shipped `reviewType` override syntax, record the `review_type` removal, and account for the two post-design keys, via a dated reconciliation note that preserves the original design text.

**The single source of truth for every documented fact is the merged code**, not the 240/241/242 designs (which are superseded on three points). Authoritative files to read and cross-check against:

- `packages/core/src/config/ConfigKeys.ts` — the 8 keys, their types, defaults, `enum`s, and `description` strings (verbatim source for the reference doc's per-key lines).
- `packages/core/src/introspection/reviewGate.ts` — the decision matrix, effective-date grandfather logic (`:197–207`), `codeReview: none` skip (`:209–215`), and boundary→reviewType map.
- `packages/core/src/schema/frontmatterSchema.ts` — the `codeReview: { values: ['none'] }` slice-design field (`:85–88`).
- `packages/cli/src/commands/check.ts` — the `--set-review-none` flag.

**The 8 config keys** (this exact count is a review-corrected fact — F001): `workflow.review_enabled`, `workflow.review_threshold`, `workflow.review_unknown_as` (3 global) + `workflow.review_gates.{code,arch,slice,tasks}.threshold` (4 per-gate) + `workflow.review_gate_effective_date` (1) = **8**.

**Anchor points already located** (so tasks don't re-hunt):
- README "Related" section link list is at ~`README.md:203–207` (the `AGENT-INTEGRATION.md` link is the pattern to mirror).
- CHANGELOG stale lines are `CHANGELOG.md:22` (key-name list naming `review_type` + `pre_advance`-style gate names) and `:23` (ends "...`review_type` per-gate keys from 240 are inert").
- Arch Envisioned State config-keys block is `240-arch.review-aware-workflow-gating.md:70–90`; the existing dated-note precedent to mirror is at `:23–24`.

> **Note on "test" tasks below:** this is a documentation slice with no runtime code, so each deliverable's "test" task is a **cross-check against source / CLI** — confirming every documented key, default, flag, and behavior matches what actually ships. That is the real verification for docs (design Verification Walkthrough).

---

## Task 0 — Pre-flight: confirm branch, clean tree, and ground-truth inventory

- [ ] Confirm current branch is `240-planning.review-aware-workflow-gating` (`git branch --show-current`). If not, switch to it. This is a planning-phase slice; docs stay on the planning branch.
- [ ] Confirm working tree is clean except for expected untracked files (`git status --short`).
- [ ] Re-read the authoritative source files listed in the Context Summary and confirm the 8-key inventory is exactly as stated (no keys added/removed since the design was written): run `grep -n "review" packages/core/src/config/ConfigKeys.ts` and confirm exactly the 8 keys, and that **no** `review_type` key appears.
- **Success:** on the correct branch; the live key inventory matches the design's 8-key list; zero `review_type` keys present.
- **Effort:** 1/5

---

## Deliverable A — `docs/REVIEW-GATING.md` reference doc

### Task 1 — Create the reference doc skeleton + "what it is" section

- [ ] Create `docs/REVIEW-GATING.md` following the `docs/` convention (ALL-CAPS filename, same header style as `docs/TOOLS.md` / `docs/AGENT-INTEGRATION.md`).
- [ ] Write the opening section (design TD-3 §1): one paragraph stating the feature is deterministic and AI-free, **off by default** (`review_enabled = false`), and that with it off there is **zero** behavior change. State that CF only *recommends* — it never advances or mutates state.
- [ ] Add the section skeleton (headers only, filled by later tasks): Position-derived model · Config keys · Decision matrix · Workflow states · `cf check` findings · Escape hatches · Worked example.
- **Success:** file exists at `docs/REVIEW-GATING.md`; opening section present and accurate; section headers stubbed in the TD-3 order.
- **Effort:** 1/5

### Task 2 — Document the position-derived review-type model

- [ ] Write the "position-derived model" section (design TD-3 §2): the boundary→review-type table — `arch` before slice-plan creation, `slice` before tasks, `tasks` before implementation, `code` before advance.
- [ ] State explicitly that review type is **derived from lifecycle position and never configured** — and therefore **no `review_type` config key exists** (one sentence correcting the removed-keys history). Source: `BOUNDARY_REVIEW_TYPE` in `reviewGate.ts`.
- **Success:** the four boundaries and their review types are documented and match `reviewGate.ts`; the "no `review_type` key" statement is present.
- **Effort:** 1/5

### Task 3 — Document all eight config keys

- [ ] Write the "config keys" section (design TD-3 §3, criterion 1) documenting **all eight** keys. For each: name, type, default, allowed values, one-line meaning.
- [ ] Source each key's one-liner **verbatim (lightly reflowed, not reworded)** from its `description` string in `ConfigKeys.ts` (design TD-4) so the doc and `cf config get` help never diverge.
- [ ] The eight, in order: `workflow.review_enabled` · `workflow.review_threshold` · `workflow.review_unknown_as` · `workflow.review_gates.code.threshold` · `workflow.review_gates.arch.threshold` · `workflow.review_gates.slice.threshold` · `workflow.review_gates.tasks.threshold` · `workflow.review_gate_effective_date`.
- [ ] For the per-gate `threshold` keys, state that empty (default) means "use the global `workflow.review_threshold`."
- **Success:** exactly 8 keys documented; each key's type/default/enum matches `ConfigKeys.ts` exactly; per-gate empty-means-global semantics stated.
- **Effort:** 2/5

### Task 4 — Verify Deliverable A config-key section against source (cross-check)

- [ ] For each of the 8 keys, run the locally built CLI `node packages/cli/dist/index.js config get <key>` and confirm the doc's stated default and allowed values match the CLI output and the `default`/`enum` in `ConfigKeys.ts`. Use the full 8-key loop from the design Verification Walkthrough step 1.
- [ ] Run `grep -r "review_type" packages/core/src/config/ConfigKeys.ts` and confirm it returns nothing — the doc's "no `review_type` key" claim is correct.
- [ ] Fix any mismatch found in the doc (doc-side only; never touch `ConfigKeys.ts`).
- **Success:** all 8 keys' documented values match source and CLI; the `review_type` grep is empty; no doc/source discrepancy remains.
- **Effort:** 2/5

### Task 5 — Document the decision matrix and the new workflow states

- [ ] Write the "decision matrix" section (design TD-3 §4): the `(verdict × threshold)` table (`PASS`/`CONCERNS`/`FAIL`/`UNKNOWN` × `pass`/`concerns` → clears/failed), plus the `review_unknown_as` substitution rule (`fail`→treat as FAIL, `concerns`→treat as CONCERNS, `pass`→treat as PASS). Source: `evaluateVerdict` / decision matrix in `reviewGate.ts` (matches design TD-2 of slice 241).
- [ ] Document the absent-vs-present distinction: **absent** artifact → `pending-review`; **present but not clearing** → `review-failed`. A present-but-unparseable file is `UNKNOWN` (never silently cleared), then `review_unknown_as` applies.
- [ ] Write the "workflow states" section (design TD-3 §5): what `pending-review` and `review-failed` each mean, and the recommendation each produces (`review` / `blocked`). Restate that CF only recommends.
- **Success:** decision matrix matches `reviewGate.ts`; unknown-verdict substitution documented; both statuses and their recommendations documented; absent-vs-present rule stated.
- **Effort:** 2/5

### Task 6 — Document `cf check` findings and both escape hatches

- [ ] Write the "`cf check` findings" section (design TD-3 §6): slice-complete-but-review-absent → `warning`; present-but-failing → `error`; **never auto-fixable**; fires at **all four boundaries** (912), not just `code`. Source: `check.ts` and `ConsistencyChecker` review-gate rule.
- [ ] Write the "escape hatches" section (design TD-3 §7) — **both**:
  - **Effective-date grandfathering** (`review_gate_effective_date`): a slice/arch whose frontmatter `dateCreated` is *before* the cutoff is exempt from **every** boundary. Purpose: enable gating on a project with history without retroactively demanding reviews for old work. Format `YYYYMMDD`; empty = no cutoff. Source: `reviewGate.ts:197–207`.
  - **Docs-only slices** (`codeReview: none`): a slice design declaring `codeReview: none` in frontmatter is not blocked at the `code`/pre-advance gate (it cannot produce a code review). Default (absent) = code review still required. `cf check --set-review-none <index>` writes the declaration for you. **Scoped to the pre-advance boundary only.** Source: `reviewGate.ts:209–215`, `frontmatterSchema.ts:85–88`, `check.ts`.
- **Success:** `cf check` finding severities + non-fixable + four-boundary all documented and match source; both escape hatches documented with correct semantics, formats, and the `--set-review-none` flag.
- **Effort:** 2/5

### Task 7 — Write the worked example, then verify both escape hatches behave as documented (cross-check)

- [ ] Write the "worked example" section (design TD-3 §8): a compressed "enable → hit a gate → clear it" walkthrough mirroring the 241 verification steps.
- [ ] **Cross-check effective-date** (design Verification Walkthrough step 3): against a scratch project, set `review_gate_effective_date` to a date *after* a complete slice's `dateCreated` → confirm `cf next` does **not** gate it; set it *before* → confirm the gate fires. Doc claim and observed behavior must agree.
- [ ] **Cross-check docs-only opt-out** (design Verification Walkthrough step 4): on a complete slice with no code review, `cf next` reports `pending-review`; run `cf check --set-review-none <index>` (or hand-add `codeReview: none`) → confirm `cf next` no longer gates it.
- [ ] **Cross-check four-boundary `cf check`** (design Verification Walkthrough step 5): with gating on, confirm `cf check` can surface a non-`code` boundary finding (e.g. a `slice` review pending).
- [ ] Reconcile any divergence by fixing the **doc** (never the code).
- **Success:** worked example present; effective-date, docs-only, and four-boundary behaviors each observed to match their documentation; any divergence resolved doc-side.
- **Effort:** 3/5

---

## Deliverable B — README "Review Gating" summary

### Task 8 — Add the README "Review Gating" section + Related link

- [ ] Add a compact "Review Gating" subsection to `README.md` (design TD-2): state what the feature does, show the one-line enable (`cf config set workflow.review_enabled true`), name the **default-off** guarantee, and link to `docs/REVIEW-GATING.md`. Do **not** duplicate the full matrix or all 8 keys here (DRY — those live in the reference doc).
- [ ] Add a "Related" section link entry mirroring the existing `AGENT-INTEGRATION.md` line (~`README.md:207`): `**[Review Gating](docs/REVIEW-GATING.md)** — <one-line description>`.
- **Success:** README has a "Review Gating" summary with the default-off statement and enable one-liner; a "Related" link to `docs/REVIEW-GATING.md` exists; the full surface is NOT duplicated into the README.
- **Effort:** 2/5

### Task 9 — Verify README link resolves (cross-check)

- [ ] Confirm the README's new link path is exactly `docs/REVIEW-GATING.md` and is a correct relative link (design Verification Walkthrough step 6). Confirm the file it points to exists.
- **Success:** the relative link path is correct and the target file exists (link would render/resolve on GitHub).
- **Effort:** 1/5

---

## Reconciliation tasks (existing artifacts)

### Task 10 — Reconcile the CHANGELOG `[Unreleased]` entries

- [ ] Correct `CHANGELOG.md:22`: the per-gate key list names the **removed** `review_type` keys and the **old** gate names (`pre_advance`/`pre_slice_plan`/`pre_tasks`/`pre_implementation`). Update to the shipped reality — per-gate keys are `workflow.review_gates.{code,arch,slice,tasks}.threshold` (threshold-only, position-named), and `review_type` keys do not exist.
- [ ] Correct `CHANGELOG.md:23`: remove/replace the trailing "...the `review_type` per-gate keys from 240 are **inert**" clause — they were **removed** (#60), not inert. Keep the "review type is always derived from position" statement.
- [ ] Confirm the existing effective-date (`:27`) and `codeReview: none` (`:25`) entries read as user-facing capabilities (they largely do from 911/912 — light touch only if needed).
- [ ] Do **not** create a version section or reorder released history (design TD-5).
- **Success:** no CHANGELOG line still calls `review_type` keys "inert" or lists the old `pre_*` gate key names; entries are internally consistent with shipped behavior; no version section invented.
- **Effort:** 2/5

### Task 11 — Verify the slice-plan Note correction (already committed)

- [ ] Confirm `240-slices.review-aware-workflow-gating.md` line ~28 already records the resolved decision (`review_type` keys **removed**, not "inert/open") — this was done in design commit `dcdb619`. Verify it reads correctly; no further edit expected.
- **Success:** the slice-plan Note states `review_type` keys were removed and references the 243 design; plan is not self-contradictory. (No-op edit if already correct.)
- **Effort:** 1/5

### Task 12 — Reconcile the 240 architecture Envisioned State (design TD-6, resolves review F002)

- [ ] Correct the arch's **Envisioned State → Config keys** section (`240-arch.review-aware-workflow-gating.md:70–90`) on three points: (1) the never-shipped `reviewType`-bearing per-transition override syntax → the shipped flat `workflow.review_gates.{code,arch,slice,tasks}.threshold` shape; (2) record that the `review_type` keys were **removed** (#60); (3) account for the two post-design keys absent from the section — `review_gate_effective_date` and `codeReview: none`.
- [ ] Use the arch's **existing dated-note precedent** (mirror the "Scope revision (Phase 4, 20260702)" note at `:23–24`): add a dated **"Implementation reconciliation"** note and/or a corrected fenced config-keys block that states the shipped shape and **preserves the original text as "as originally envisioned"** — do not delete the original design reasoning (design TD-6).
- [ ] Point the reconciliation note at `docs/REVIEW-GATING.md` for the authoritative current surface.
- **Success:** the arch Envisioned State no longer presents `reviewType` override syntax as shipped; the `review_type` removal is recorded; both post-design keys are accounted for; original design text remains legible; this stays a `.md`-only edit.
- **Effort:** 2/5

---

## Closeout

### Task 13 — Full cross-check sweep and docs-only diff verification

- [ ] Re-run the design Verification Walkthrough end to end (steps 1–7): all 8 keys match source (Task 4), no phantom `review_type` key, effective-date + docs-only + four-boundary behaviors match their docs (Task 7), README link resolves (Task 9), arch reconciliation present and faithful (Task 12).
- [ ] **Docs-only diff gate** (design criterion 9, Verification Walkthrough step 8): `git diff main --name-only` must list **only** `.md` files — expected set: `docs/REVIEW-GATING.md`, `README.md`, `CHANGELOG.md`, `240-slices...md` (already committed), `240-arch...md`, plus the 243 slice/task/review docs. **Any non-`.md` file means scope leaked into code — STOP and reassess.**
- [ ] Confirm no `ConfigKeys.ts`, `reviewGate.ts`, `frontmatterSchema.ts`, `check.ts`, or any source/test file appears in the diff.
- **Success:** every documented fact verified against source; `git diff` touches only markdown; zero code/test files changed.
- **Effort:** 2/5

### Task 14 — Frontmatter, changelog check, and dogfood the escape hatch

- [ ] At implementation completion, set the 243 slice design and this task file frontmatter to `status: complete` and update `dateUpdated`.
- [ ] **Dogfood `codeReview: none`** (design Verification Walkthrough step 9): because 243 is itself docs-only and produces no code to review, add `codeReview: none` to the **243 slice-design** frontmatter — this clears its own pre-advance gate and validates the escape hatch it documents. (Register-safe: `frontmatterSchema.ts` already accepts `codeReview` as an optional slice-design field.)
- [ ] Delegate checklist check-off to the `task-checker` agent per project convention (or check off directly if unavailable).
- **Success:** slice + task frontmatter marked complete with updated dates; `243` slice design carries `codeReview: none`; all task checkboxes checked.
- **Effort:** 1/5

---

## Task Dependencies & Sequencing

Sequential, with each deliverable's cross-check immediately following its authoring (test-with pattern):

- **Task 0** (pre-flight) → gates everything.
- **Deliverable A:** 1 → 2 → 3 → **4 (verify A keys)** → 5 → 6 → **7 (verify A behaviors + example)**.
- **Deliverable B:** 8 → **9 (verify link)**.
- **Reconciliations:** 10 (CHANGELOG) → 11 (verify plan note) → 12 (arch, TD-6).
- **Closeout:** 13 (full sweep + docs-only diff gate) → 14 (frontmatter + dogfood).

Deliverable A must precede B and the README link tasks (the link target must exist). Reconciliations C/E can be done in parallel with A/B in principle, but the sequential order above keeps a junior implementer on a single clean path. Task 13's docs-only diff gate is the hard stop that enforces design TD-1.

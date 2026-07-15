---
docType: slice-design
slice: frontmatter-parser-nesting-fix
project: context-forge
parent: project-documents/user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: []
interfaces: []
dateCreated: 20260715
dateUpdated: 20260715
status: in_progress
---

# Slice Design: Frontmatter Parser Nesting Fix & Corpus Verification

## Scope

This slice folds together two independent fixes discovered back-to-back while dogfooding `cf check`/`cf next` during the same investigation session:

- **Issue #64** — frontmatter parser nesting bug (the slice's original scope, see Overview below).
- **Issue #66** — `cf next` never flags a stale `phase` field when a review gate blocks progress.

They share no code and are unrelated in mechanism, but are small enough individually, and close enough in time/context, to ship as one slice rather than two. Each gets its own Technical Decision and Success Criteria below; the Effort estimate accounts for both.

## Overview

`packages/core/src/introspection/parsers/frontmatterParser.ts` (`parseFrontmatter()`) is a hand-rolled flat line-scanner, not a real YAML parser. It has no concept of indentation or nesting: every non-empty line between the opening and closing `---` delimiters that contains a `:` is treated as a top-level key, regardless of leading whitespace.

Found while verifying the `normalizeVerdict()` leniency fix (issue #63 follow-up, committed `ccc90c4`): a real review document (`grizcam_mobile_ios` project, slice 142 code review) has frontmatter shaped like:

```yaml
verdict: CONCERNS (resolved — see verifiedUpdate)
...
verifiedUpdate:
  date: 20260715
  note: >
    ...
findings:
  - id: F001
    ...
    verdict: CONFIRMED
    disposition: FIXED
  - id: F002
    ...
  - id: F003
    ...
    verdict: CONFIRMED
    disposition: DOCUMENTED
  - id: F004
    ...
    verdict: CONFIRMED
```

The scanner walks every line top to bottom and overwrites `data.verdict` each time it sees a `verdict:` line — including the three nested `findings[].verdict` lines. The last one wins (`CONFIRMED`, from F004), silently clobbering the true document-level verdict (`CONCERNS (resolved...)`). `normalizeVerdict('CONFIRMED')` doesn't match any known verdict and degrades to `UNKNOWN`, which fails the review gate under the default `unknownAs` policy — masking the leniency fix entirely and producing a false `cf check` block.

This is filed as GitHub issue #64. A companion issue (#65) tracks replacing the parser with a real YAML library as the correct long-term fix; that path was evaluated and explicitly deferred (see Technical Decisions) in favor of a minimal, contained patch — because the primary goal of this slice is **verifiability**, not parser elegance.

## Value

- Closes #64: nested `findings[].verdict` (or any nested field colliding with a top-level key name) no longer clobbers the real frontmatter value.
- The `normalizeVerdict()` leniency fix (already on `main`) becomes effective for its actual target case, not just for synthetic test strings.
- Delivers a reusable differential-verification harness: run the real-world frontmatter corpus (this repo plus sibling projects) through the old and new parsing logic, diff every field per file, and surface exactly which files' parsed values change — turning "did this break anything" from a guess into a concrete, reviewable list.
- Closes #66: `cf next` stops silently tolerating a stale `phase` field while a review gate blocks progress — restoring the guidance loop's reliability for exactly the users who most need it (someone unfamiliar with the phase model, unsure what to do next).

## Technical Decisions

### TD-1 — Minimal nesting-aware patch, not a real YAML parser (this slice)

Two approaches were weighed:

1. **Minimal patch**: teach the scanner to stop capturing top-level keys once it enters a nested block, keeping the `FrontmatterData = { [key: string]: string }` contract byte-identical to today.
2. **Real YAML library** (`yaml`/`js-yaml`): correct by construction, eliminates the whole category of nesting bugs, not just this shape.

**Decision: minimal patch.** Reasoning:

- **Contract preservation.** All 5 current consumers (`reviewGate.ts`, `WorkflowNavigator.ts`, `ProjectModelBuilder.ts`, `ArtifactIntrospector.ts`, `node.ts`) assume every frontmatter value is a string. A real YAML parser infers types (numeric-looking dates/indices become numbers, nested blocks become objects, `true`/`false` become booleans), which would require signature/logic changes at every consumer, not just in the parser.
- **Verifiability.** This slice's differential-verification harness (TD-3) diffs old-vs-new parsed output across the real corpus. Under the minimal patch, a flagged file almost certainly indicates the exact clobbering bug being fixed — the diff signal stays sharp. Under a full YAML swap, many files would show "different" results purely from type coercion even though the new result is more correct, diluting "flagged" from "found a real bug" to "found an expected type upgrade" and requiring row-by-row triage to tell them apart. That tradeoff is real but belongs to a deliberate future migration (#65), not a bug-fix slice.
- **Blast radius.** No new runtime dependency, no consumer-contract changes, fix isolated to one file.

The real-YAML migration is tracked as GitHub issue #65, which documents this same tradeoff analysis and the 5-consumer scope for whoever picks it up later. The differential-verification technique built here (TD-3) is explicitly designed to be reusable for that future migration.

### TD-2 — Parser fix: track nesting depth via indentation

Current logic ([frontmatterParser.ts:20-42](../../../packages/core/src/introspection/parsers/frontmatterParser.ts)):

```ts
const data: Record<string, string> = {};
for (let i = 1; i < lines.length; i++) {
  const stripped = lines[i].trim();
  if (stripped === '---') return { filePath, found: true, data };
  if (stripped.includes(':')) {
    const colonIdx = stripped.indexOf(':');
    const key = stripped.slice(0, colonIdx).trim();
    let val = stripped.slice(colonIdx + 1).trim();
    // (quote-stripping)
    if (key) data[key] = val;
  }
}
```

Every line is `.trim()`-ed before inspection, discarding indentation — the sole reason nested keys collide with top-level ones.

**Decision:** only treat a line as a **top-level** key if its original (untrimmed) leading whitespace is zero. Once a top-level key's value is empty (i.e. the line is `key:` with nothing after the colon — the opening of a nested block or list), skip every subsequent line that has *any* leading whitespace, resuming top-level scanning only when a line with zero leading indentation is seen again (or the closing `---` is reached). This handles:

- Nested object blocks (`verifiedUpdate:` followed by indented `date:`/`note:`)
- List-of-object blocks (`findings:` followed by `  - id: ...` and further-indented sub-fields)
- Folded/literal block scalars (`note: >` or `note: |` followed by indented free text, which may itself contain colons — already indented, so already skipped by the same rule)

A top-level key whose value is non-empty on the same line (e.g. `verdict: CONCERNS (resolved...)`) is captured exactly as today — this rule only changes what happens *after* a key that opens a nested block.

**Not handled (explicitly out of scope, matches today's behavior or existing lenient-parsing posture):** inline flow collections (`tags: [a, b, c]`, `meta: {a: 1}`), multi-doc anchors/aliases. These are rare in this project's frontmatter conventions (confirmed: zero occurrences found in the corpus survey, TD-3) and remain unhandled by both the old and new parser — no regression, no new capability claimed.

### TD-3 — Differential corpus-verification harness

**Goal:** for every real frontmatter-bearing markdown file across this repo and sibling projects, parse it with both the current (pre-fix) parser and the new (post-fix) parser, and diff the resulting `data` maps field-by-field. Output:

1. **Unchanged files** — old and new produce an identical `data` map. This is the regression-safety proof: the fix did not alter parsing for any file that was already correct.
2. **Changed files** — old and new differ on at least one field. Each such file is listed with the specific field(s) that changed (old value → new value), for manual review. Expectation: these are exactly the files with a nested block whose sub-field name collides with a top-level key (the #64 bug shape) — a hand review confirms the new value is the correct one and the old value was the latent bug.

**Implementation approach:**
- A one-off script (not a permanent CLI command — this is a verification tool for this slice, not a shipped feature) that:
  - Discovers all `.md` files under `project-documents/` in a configurable list of project roots (this repo plus any sibling repos the PM points it at — `grizcam_mobile_ios`, `squadron`, and others surveyed during #64 investigation are good candidates given their volume).
  - Runs the pre-fix parser (git-stashed/checked-out version, or a preserved copy of the old function) and the post-fix parser against each file.
  - Diffs the two `data` maps per file; collects changed-file reports.
  - Prints a summary: total files scanned, count unchanged, count changed (with per-file field diffs), count of any files where either parser throws (should be zero — both are designed never to throw).
- Script output is reviewed manually by the PM/agent before considering the fix verified — this is a one-time audit, not an automated test-suite gate (the corpus lives outside this repo in most cases, so it can't be a CI-run test).
- A **small, permanent** set of unit tests is added to `frontmatterParser.test.ts` covering the specific nested-block shapes found in the wild (nested object, list-of-objects with colliding sub-field names, folded block scalar) — these are the regression guard that *does* run in CI, separate from the one-off corpus audit.

**Scope note on "many more files/projects":** the harness accepts a list of project roots so it can run against as much of the available corpus as the PM wants scanned. No fixed cap is imposed by the design; the task breakdown will confirm which project roots are actually scanned during verification and log anything intentionally excluded (e.g. a project with no `project-documents/` directory).

### TD-4 — No schema, no config, no new dependency (frontmatter parser fix)

This slice touches only `frontmatterParser.ts` and its test file, plus a scratch verification script that is not part of the shipped package (lives under the slice's own scratch/verification area, not `packages/core/src`). No frontmatter schema changes, no config keys, no new runtime dependency. `FrontmatterData`'s `{ [key: string]: string }` contract is unchanged, so no consumer (`reviewGate.ts`, `WorkflowNavigator.ts`, `ProjectModelBuilder.ts`, `ArtifactIntrospector.ts`, `node.ts`) needs any change.

### TD-5 — #66: attach `phase` to the review-gate branches so `enrich()` can flag staleness

**The code change is narrow; the effect it corrects is not.** `WorkflowNavigator.getNext()`'s `pending-review`/`review-failed` branches ([WorkflowNavigator.ts:301-319](../../../packages/core/src/introspection/WorkflowNavigator.ts)) are the only lifecycle branches in the function that return a `NextAction` with no `phase` field. The three sibling branches immediately above them all set one:

```ts
// needs-design  → phase: 'Phase 4: Slice Design'   (WorkflowNavigator.ts:271)
// needs-tasks   → phase: 'Phase 5: Task Breakdown' (WorkflowNavigator.ts:282)
// in-implementation → phase: 'Phase 6: Implementation' (WorkflowNavigator.ts:296)
```

`enrich()` ([WorkflowNavigator.ts:255-263](../../../packages/core/src/introspection/WorkflowNavigator.ts)) is the *only* place that ever compares a `NextAction`'s `phase` against the project's actual `developmentPhase` and prints a `cf set phase '<x>'` suggestion when they differ — and it only fires `if (action.phase && ...)`. Because the review-gate branches never populate `phase`, `enrich()` has nothing to compare, and a stale `developmentPhase` (left over from whatever phase the *previous* slice was in when it completed) sails through with zero indication that anything is wrong. Confirmed live: `phase` stuck at `Phase 6: Implementation` from a completed prior slice, `cf next` correctly named the pending slice-review requirement for the new active slice, but gave no hint that `phase` itself needed to move back to `Phase 4: Slice Design` — the user had to work that out and run `cf set phase 4` unassisted.

**Why the effect is wider than the diff.** This is not a cosmetic gap. `cf next` is the tool's primary guidance surface for "what do I do now" — its entire value proposition is that a user who doesn't know the phase model can trust its output instead of having to understand `developmentPhase`/slice-state derivation themselves. A silent gap in exactly the review-gate branch means the tool's guidance goes quiet at precisely the moment a review is blocking progress — arguably the moment a confused user most needs a correct signal. The bug's *reach* is every project, every slice, every time a review gate fires while `phase` has drifted (which is the common case: `phase` only advances via explicit `cf set phase` or a suggested command a user runs themselves — see root-cause note below — so drift after a slice completes is the default, not the exception).

**Root cause confirms `phase` is never auto-corrected.** `packages/core/src/project-autoset.ts` (`computeAutoSetFields()`) has three auto-set rules (`developmentPhase → instruction`, `fileArch → fileSlicePlan`, `fileSlice → fileTasks`) — none derive or correct `developmentPhase` itself from slice/task/review state. `phase` is purely hand-set. This is a deliberate, unrelated design choice (phase transitions are a human/agent decision, not something to auto-advance) and is **not** being changed by this TD — the fix is only to make `cf next`'s existing staleness-detection machinery (`enrich()`) aware of the review-gate branches, not to make `phase` self-correcting.

**Decision:** in both the `pending-review` and `review-failed` branches, derive and attach a `phase` field from the gate's boundary/review type, using the same boundary→phase mapping already implicit in the sibling branches (e.g. a `preTasks`/slice-review gate → `Phase 4: Slice Design`; a `preImplementation`/tasks-review gate → `Phase 5: Task Breakdown`; a `preAdvance`/code-review gate → `Phase 6: Implementation`). Once `phase` is populated, `enrich()`'s existing comparison-and-suggest logic applies unchanged — no changes needed to `enrich()` itself.

**Not in scope for this TD:** #58/slice 912 already fixed a different stale-phase bug (phase vs. arch-file-existence, in the no-active-slice branch) — no overlap, confirmed during #66 investigation. `cf check`/`ConsistencyChecker` is unaffected — it does not read `developmentPhase` at all (confirmed in slice 912's design), so no changes needed there.

## Data Flows & Component Interactions

```
cf check / cf list / workflow_check
  └─ (5 consumers) ──► parseFrontmatter(filePath)
                          ├─ TD-2: top-level key scan now indentation-aware
                          │    — nested findings[].verdict no longer overwrites
                          │      top-level verdict
                          └─ return shape unchanged: { filePath, found, data: Record<string,string> }

Verification (one-time, not shipped):
  corpus of real .md files ──► [old parser | new parser] ──► diff per file
                                                                ├─ unchanged → regression proof
                                                                └─ changed → manual review list

cf next ──► WorkflowNavigator.getNext()
              └─ pending-review / review-failed branches (TD-5: now set `phase`
                    derived from gate boundary → 'Phase 4/5/6: ...')
                    └─ enrich() (unchanged) ──► compares action.phase vs
                          project.developmentPhase ──► suggests `cf set phase '<x>'`
                          when they differ, exactly as it already does for the
                          needs-design / needs-tasks / in-implementation branches
```

## Success Criteria

1. **#64 fixed.** Parsing the real `142-review.code.ipad-adaptive-layout-and-safe-areas.md` fixture (or an anonymized equivalent added to test fixtures) yields `data.verdict === 'CONCERNS (resolved — see verifiedUpdate)'`, not `'CONFIRMED'`.
2. **`normalizeVerdict()` fix becomes effective end-to-end.** With the real fixture, `normalizeVerdict(data.verdict)` resolves to `'CONCERNS'`, and a `cf check` run against a scratch project using this fixture's shape no longer produces a false review-gate failure.
3. **No contract change.** `FrontmatterData` remains `{ [key: string]: string }`; no consumer file requires any code change.
4. **Corpus diff run and reviewed.** The differential harness has been run against this repo's own corpus plus at least one sibling project with a large `project-documents/` tree (candidates surveyed during #64: `squadron` at 451 files, `grizcam_mobile_ios` at 195 files, `migratory` at 358 files). Results are summarized: X files scanned, Y unchanged, Z changed-and-reviewed, confirming every changed file's new value is correct and every changed file matches the nested-collision bug shape (not an unrelated behavior change).
5. **New unit tests pass** for the specific nested shapes found (nested object block, list-of-objects with colliding sub-field name, folded block scalar), added to `frontmatterParser.test.ts`.
6. **No regressions.** Full core/cli/mcp-server suites pass (modulo documented pre-existing failures), `pnpm -r build` clean.

### #66 — stale-phase-on-review-gate

7. **Fixed for both blocked states.** With the active slice in `pending-review` and `phase` stale, `cf next` now prints a `cf set phase '<x>'` suggestion alongside the review-gate rationale, where `<x>` correctly matches the gate's boundary (slice-review gate → Phase 4, tasks-review gate → Phase 5, code-review gate → Phase 6). Same for `review-failed`.
8. **No change to gate-blocking behavior.** The review gate still blocks regardless of `phase` — this TD only adds a suggestion, it does not change whether/when the gate fires. Existing tests asserting "gate fires regardless of phase" (`WorkflowNavigator.test.ts:809, 823`) continue to pass unmodified.
9. **No regression to #58/912 or to `cf check`.** The no-active-slice arch-gate branch (912's territory) and `ConsistencyChecker` (`developmentPhase`-blind by design) are both untouched — confirmed by inspection, no new tests needed there beyond the existing suite passing.
10. **New unit tests** covering: `pending-review` with stale phase → suggestion printed; `pending-review` with already-correct phase → no suggestion (unchanged existing behavior); same two cases for `review-failed`.

## Effort

Relative effort: **3/5** for the combined slice. The frontmatter-parser fix itself is small and contained (TD-2); most of that portion's effort is in the differential-verification harness (TD-3) and reviewing its corpus output across multiple external projects — that review work is the actual point of the #64 half of this slice, per the PM's stated priority on verifiability over the fix's mechanics. The #66 fix (TD-5) is small in code (attach a derived `phase` field in two branches, reusing existing `enrich()` logic) but is called out explicitly because its user-facing effect is disproportionate to its diff size — the risk being managed is under-scoping the *verification* of a change to the tool's primary guidance surface, not the implementation itself.

---
docType: review
layer: project
reviewType: tasks
slice: worktree-scoped-validate-check-attribution-and-scope-reporting
targetKind: slice
rulesSource: project
project: context-forge
verdict: CONCERNS
verdictSource: derived
sourceDocument: project-documents/user/tasks/926-tasks.worktree-scoped-validate-check-attribution-and-scope-reporting.md
aiModel: deepseek/deepseek-v4-pro
status: complete
dateCreated: 20260922
dateUpdated: 20260922
reviewedSha: adc8af97a9923b430fa68607b5612742ac6fcd8c
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 4
findings:
  - id: F001
    severity: concern
    category: correctness
    summary: "Task 17 (D8 \"distinguish empty from filtered\") may have no observable effect on arch.ts after D7"
    location: "project-documents/user/tasks/926-tasks.worktree-scoped-validate-check-attribution-and-scope-reporting.md"
  - id: F002
    severity: concern
    category: testing
    summary: "No automated regression test for single-checkout byte-identical output"
    location: "project-documents/user/tasks/926-tasks.worktree-scoped-validate-check-attribution-and-scope-reporting.md"
  - id: F003
    severity: note
    category: design-alignment
    summary: "Shared resolver is only consumed by `findProjectByCwd` refactor, not by the validate or check fixes"
    location: "project-documents/user/tasks/926-tasks.worktree-scoped-validate-check-attribution-and-scope-reporting.md"
---

# Review: tasks — slice 0

**Verdict:** CONCERNS
**Model:** deepseek/deepseek-v4-pro

## Findings

### [CONCERN] Task 17 (D8 "distinguish empty from filtered") may have no observable effect on arch.ts after D7

After D7 removes `isInIndexRange` from both `archListFromPlan` (arch.ts:80) and `archListFromModel` (arch.ts:173), the empty-result paths at arch.ts:83 and arch.ts:~180 will only fire when the plan/model is genuinely empty — there is no filter left to distinguish from. The slice design's D8 explicitly says "Any empty-result message on a **path that retains a filter** must distinguish..." (emphasis added). The initiative paths in arch.ts will retain no filter after D7, so the "filtered" branch added by Task 17 would be dead code on these paths. The task's instruction to "distinguish 'the plan is empty' from 'entries were excluded by the active filter'" cannot trigger on arch.ts after D7.

The design intent behind D8 appears to target the *other* six `isInIndexRange` call sites (slice.ts, task.ts, plan.ts, future.ts, project.ts, WorkflowNavigator.ts), which correctly retain their filters — but those are explicitly excluded from this slice's scope. If Task 17 is implemented as written, it risks adding unreachable code. Clarify with the PM whether: (a) Task 17 should apply D8 to those six sites instead (expanding scope), (b) Task 17 should simply improve the arch.ts empty-message wording without a "filtered" branch (e.g., "No initiatives found in initiative plan" → "No initiative entries present in initiative plan"), or (c) Task 17 should be dropped as unnecessary after D7.

### [CONCERN] No automated regression test for single-checkout byte-identical output

The slice design's Technical Requirements state: "A regression test pinning default-checkout output identical to pre-slice behavior." This is only covered by Task 19's manual walkthrough step 7 ("Capture the before-output first"). Task 8 covers the core validator's `filesChecked`/`findings` regression at the unit level, and Task 10 asserts the five legacy JSON fields are unchanged, but neither captures a full-output diff. Task 15 says "single-checkout users must see no change" as a success criterion but delegates verification to the manual walkthrough.

Given that D3's additive-only guarantee is the primary defense against breaking external consumers (squadron), an automated CLI snapshot test comparing pre-slice and post-slice `cf check` and `cf validate frontmatter --json` output for a single-checkout project would be a stronger regression safety net than a one-time manual diff. Consider adding a small automated test (perhaps as a subtask of Task 19 or a new subtask in Task 10) that captures and compares the output programmatically. This is not a blocker — the manual walkthrough plus the field-level unit assertions provide reasonable coverage — but the design explicitly calls for a "regression test" rather than a walkthrough step.

### [NOTE] Shared resolver is only consumed by `findProjectByCwd` refactor, not by the validate or check fixes

The context summary states: "Implementation order rationale: the shared resolver first, because it is a pure refactor that both later fixes build on." However, Task 4 (#88 fix) uses the already-existing `resolveOperationPath` helper, and Task 13 (#87 attribution) uses the existing per-worktree view building in check.ts:221-223 — neither depends on `resolveWorktreeForPath()`. Only Task 3 (refactor `findProjectByCwd`) actually consumes the shared resolver. Placing Part 1 first is still correct (pure refactor, establishes the canonical matching rule in one place), but the stated rationale that "both later fixes build on it" is misleading. No action required; this is an informational note for the implementer to avoid confusion about what depends on what.

### Run Digest

- Response length: 4540 chars
- Response is newline-free: no
- Tool calls made: 4
- Tool calls failed: 0
- Stop reason: stop
- Reasoning characters: 28649
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 3
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 3
- Finding-shaped matches — surviving validation: 3

### Raw Response

## Summary

The task breakdown is thorough and well-structured, with clear traceability to each success criterion, proper sequencing (test-with pattern followed throughout), well-distributed commit checkpoints, and appropriate task granularity. I identified **two concerns** that should be addressed before or during implementation, but neither is a blocker. No FAIL-level findings.

**CONCERNS**

## Findings

### [CONCERN] Task 17 (D8 "distinguish empty from filtered") may have no observable effect on arch.ts after D7
category: correctness
location: project-documents/user/tasks/926-tasks.worktree-scoped-validate-check-attribution-and-scope-reporting.md

After D7 removes `isInIndexRange` from both `archListFromPlan` (arch.ts:80) and `archListFromModel` (arch.ts:173), the empty-result paths at arch.ts:83 and arch.ts:~180 will only fire when the plan/model is genuinely empty — there is no filter left to distinguish from. The slice design's D8 explicitly says "Any empty-result message on a **path that retains a filter** must distinguish..." (emphasis added). The initiative paths in arch.ts will retain no filter after D7, so the "filtered" branch added by Task 17 would be dead code on these paths. The task's instruction to "distinguish 'the plan is empty' from 'entries were excluded by the active filter'" cannot trigger on arch.ts after D7.

The design intent behind D8 appears to target the *other* six `isInIndexRange` call sites (slice.ts, task.ts, plan.ts, future.ts, project.ts, WorkflowNavigator.ts), which correctly retain their filters — but those are explicitly excluded from this slice's scope. If Task 17 is implemented as written, it risks adding unreachable code. Clarify with the PM whether: (a) Task 17 should apply D8 to those six sites instead (expanding scope), (b) Task 17 should simply improve the arch.ts empty-message wording without a "filtered" branch (e.g., "No initiatives found in initiative plan" → "No initiative entries present in initiative plan"), or (c) Task 17 should be dropped as unnecessary after D7.

### [CONCERN] No automated regression test for single-checkout byte-identical output
category: testing
location: project-documents/user/tasks/926-tasks.worktree-scoped-validate-check-attribution-and-scope-reporting.md

The slice design's Technical Requirements state: "A regression test pinning default-checkout output identical to pre-slice behavior." This is only covered by Task 19's manual walkthrough step 7 ("Capture the before-output first"). Task 8 covers the core validator's `filesChecked`/`findings` regression at the unit level, and Task 10 asserts the five legacy JSON fields are unchanged, but neither captures a full-output diff. Task 15 says "single-checkout users must see no change" as a success criterion but delegates verification to the manual walkthrough.

Given that D3's additive-only guarantee is the primary defense against breaking external consumers (squadron), an automated CLI snapshot test comparing pre-slice and post-slice `cf check` and `cf validate frontmatter --json` output for a single-checkout project would be a stronger regression safety net than a one-time manual diff. Consider adding a small automated test (perhaps as a subtask of Task 19 or a new subtask in Task 10) that captures and compares the output programmatically. This is not a blocker — the manual walkthrough plus the field-level unit assertions provide reasonable coverage — but the design explicitly calls for a "regression test" rather than a walkthrough step.

### [NOTE] Shared resolver is only consumed by `findProjectByCwd` refactor, not by the validate or check fixes
category: design-alignment
location: project-documents/user/tasks/926-tasks.worktree-scoped-validate-check-attribution-and-scope-reporting.md

The context summary states: "Implementation order rationale: the shared resolver first, because it is a pure refactor that both later fixes build on." However, Task 4 (#88 fix) uses the already-existing `resolveOperationPath` helper, and Task 13 (#87 attribution) uses the existing per-worktree view building in check.ts:221-223 — neither depends on `resolveWorktreeForPath()`. Only Task 3 (refactor `findProjectByCwd`) actually consumes the shared resolver. Placing Part 1 first is still correct (pure refactor, establishes the canonical matching rule in one place), but the stated rationale that "both later fixes build on it" is misleading. No action required; this is an informational note for the implementer to avoid confusion about what depends on what.

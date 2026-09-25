---
docType: review
layer: project
reviewType: tasks
slice: worktree-dedup-and-explicit-project-worktree-resolution
targetKind: slice
rulesSource: project
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/927-tasks.worktree-dedup-and-explicit-project-worktree-resolution.md
aiModel: z-ai/glm-5.3-flash
status: complete
dateCreated: 20260925
dateUpdated: 20260925
reviewedSha: 03c6ce602c7f9a4ffefb0c7f934a04b39c4b00ba
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 43
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "All but one success criterion traces to a specific task; no scope creep; references verified accurate"
    location: "project-documents/user/tasks/927-tasks.worktree-dedup-and-explicit-project-worktree-resolution.md:1-179"
  - id: F002
    severity: concern
    category: coverage
    summary: "Criterion 8 (migrated `--project` status JSON) is pinned nowhere end-to-end"
    location: "project-documents/user/tasks/927-tasks.worktree-dedup-and-explicit-project-worktree-resolution.md:79-81"
  - id: F003
    severity: concern
    category: process
    summary: "Part 3 batches 8 tasks (~14 effort) into a single commit checkpoint"
    location: "project-documents/user/tasks/927-tasks.worktree-dedup-and-explicit-project-worktree-resolution.md:119"
  - id: F004
    severity: concern
    category: test-design
    summary: "Task 15's assertion (\"both checkout files are fixed\") cannot pass in the named mock-based test files"
    location: "project-documents/user/tasks/927-tasks.worktree-dedup-and-explicit-project-worktree-resolution.md:149-153"
  - id: F005
    severity: note
    category: test-design
    summary: "Task 8 case 5 defers its fixture to an external source when the shape is recorded in-repo"
    location: "project-documents/user/tasks/927-tasks.worktree-dedup-and-explicit-project-worktree-resolution.md:110"
  - id: F006
    severity: note
    category: sequencing
    summary: "Task 13's test is separated from its implementation by Task 14"
    location: "project-documents/user/tasks/927-tasks.worktree-dedup-and-explicit-project-worktree-resolution.md:137"
  - id: F007
    severity: note
    category: nfr
    summary: "No NFRs restated in the slice design, so no load-test or CI-gating task is required"
    location: "project-documents/user/slices/927-slice.worktree-dedup-and-explicit-project-worktree-resolution.md"
---

# Review: tasks — slice 927

**Verdict:** CONCERNS
**Model:** z-ai/glm-5.3-flash

## Findings

### [PASS] All but one success criterion traces to a specific task; no scope creep; references verified accurate

Cross-referenced all 11 functional and 5 technical criteria from the slice design: #100 dedup (Tasks 6–8), `--json` shape preservation and absolute `location` (Task 7's "pushed unmodified" + Task 8 case 1), byte-identical single-checkout behavior (Task 7's early-return guard + Task 8 case 6 + Task 9's unchanged-attribution-tests check), explicit-branch resolution cases (Task 2, Tasks 3 cases 1–4, walkthrough steps 3–4), `cf status --worktree` regression guard (Task 4), per-view CLI fixing (Tasks 13–15), MCP fix fields (Tasks 16–17). Every task traces to a criterion, a settled decision (D1–D5), or the design's Implementation Notes — Task 10's generics requirement is explicitly anticipated by the design ("make them generic so fix results keep their fix fields"), and Task 6's export implements the "reuse rather than duplicate" note. Line references in the tasks are accurate against current source, including subtle ones like the two `applyFixes(dryRun)` calls in the all-slices branch. The only coverage gap is raised separately below.

### [CONCERN] Criterion 8 (migrated `--project` status JSON) is pinned nowhere end-to-end

The design's functional criterion "Migrated single-worktree project: `cf status --json --project <name>` run from the project root reports `worktree.name: 'default'`, matching bare `cf status --json` from the same directory" (slice design, F003 resolution) has no matching task assertion. Task 3 case 4 covers only the resolver unit level (`resolveProjectWorktree` returns `worktreeId: 'default'`); Task 4's scope is explicitly the `--worktree` flag override, not the flag-less CWD-derived default; and the walkthrough (slice design steps 1–7, executed in Task 19) exercises `validate` and `check` but never `cf status --json --project` from a migrated root — even though this repo is itself a migrated-default project, so the check would be one command. The status-side wiring (status.ts:37+ consumes `resolvedWorktreeId` regardless of `source`) appears correct by inspection, but the criterion's whole point per F003 is pinning an observable behavior change, and nothing in the plan will catch a regression in the status command's `worktree` JSON field for the `source: 'flag'` + `worktreeId` combination. Add a status-level case to Task 4 (CWD stubbed at the project root, `--project <name>`, assert `worktree.name === 'default'` and `resolutionSource: 'flag'`) or a walkthrough step.

### [CONCERN] Part 3 batches 8 tasks (~14 effort) into a single commit checkpoint

CLAUDE.md requires "git add and commit from project root at least once per task." The breakdown commits only at Task 5 (after 4 tasks), Task 9 (after 3), and Task 18 (after 8 tasks spanning Tasks 10–17: generics, core `mergeFixResults`, two CLI rewrites, MCP swap, and two test tasks). The predecessor slice's task file placed a "Commit checkpoint" inside nearly every task (926 Tasks 3, 5, 10, 12, 15, 18, 21, 24, 26), so this is a regression in cadence, not a house style. At minimum, split Task 18's commit into per-task checkpoints across Part 3 — e.g., commit after Task 12 (core `mergeFixResults` green) and after Task 15 (CLI per-view fixing pinned) — so a failure in Task 14 doesn't leave seven tasks of uncommitted work and so each task is independently revertable.

### [CONCERN] Task 15's assertion ("both checkout files are fixed") cannot pass in the named mock-based test files

Task 15 says to build "a project with two worktrees whose checkouts both contain the same fixable state" and assert "both checkout files are fixed; `fixLog` has two entries with different file paths" — but both files it names mock `ConsistencyChecker` entirely (`check.test.ts` replaces the class with a factory returning `mockFix`/`mockApplyFixes`; `check-worktree-attribution.test.ts:51-56` uses a class of `vi.fn()` methods). With a mocked checker there are no real checkout files to fix, so the task as written either cannot be completed as stated or will be silently downgraded to asserting the merged `fixLog` shape — which would leave criterion 10's first half ("writes the fix in **both** checkouts") automated nowhere, with only walkthrough step 6 covering it one-time. The task should follow 926 Task 5's precedent: state explicitly that `ConsistencyChecker` must be the real implementation over real temp directories (the mock stays for the store), with real `project-documents/.../900-slices.*.md` fixtures carrying the same unchecked entry in both checkouts, and that the test must fail against pre-Task-13/14 code. Task 17's MCP test does not have this problem — asserting concatenated `fixLog` entries from two mocked per-view results is exactly what it should pin.

### [NOTE] Task 8 case 5 defers its fixture to an external source when the shape is recorded in-repo

"see issue #100 for the exact finding" points at GitHub for the fixture. The same finding shape is already recorded locally in `project-documents/user/slices/926-slice...md`'s verification walkthrough (steps 5–6 and the `#100` caveat: the slice-921 review-gate warning whose `location` is the `900-slices.maintenance-and-refactoring.md` plan path under two checkout roots). Pointing the implementer at that in-repo record — or inlining the finding text — removes a dependency on network access and removes any temptation to invent a plausible finding.

### [NOTE] Task 13's test is separated from its implementation by Task 14

The test-with pattern holds for every other pair (2→3, 7→8, 11→12, 16→17), but Task 13 (single-slice fix implementation) is followed by Task 14 (all-slices fix implementation) before either is tested in Task 15. This is defensible — the two implementation tasks touch sibling branches of the same `if/else` in `check.ts`, and Task 15 deliberately covers both modes with one fixture — but if Task 13 turns out broken, it will be discovered only after Task 14's larger rewrite is also in the tree. If Part 3 gains per-task commits (per the finding above), committing Task 13+12 together before starting 14 partially mitigates this.

### [NOTE] No NFRs restated in the slice design, so no load-test or CI-gating task is required

The slice design and the parent architecture (`900-slices.maintenance-and-refactoring.md`) contain no non-functional requirements (verified: no NFR/performance/throughput/load-test language in either). The success criteria are all functional and correctness-shaped. Consequently no load-test task in `tests/load/` is required of this breakdown, and no CI wiring task is owed.

### Run Digest

- Response length: 8486 chars
- Response is newline-free: no
- Tool calls made: 43
- Tool calls failed: 1
- Stop reason: stop
- Reasoning characters: 43743
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7

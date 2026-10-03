---
docType: review
layer: project
reviewType: tasks
slice: prune-stale-guide-files-in-worktrees
targetKind: slice
rulesSource: project
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/930-tasks.prune-stale-guide-files-in-worktrees.md
aiModel: claude-sonnet-5-5
status: complete
dateCreated: 20261003
dateUpdated: 20261003
reviewedSha: 8c6aa96278450186d6bf91092d8c74f797330738
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
durationSeconds: 29.7
squadronVersion: 0.18.2
findings:
  - id: F001
    severity: concern
    category: sequencing
    summary: "Prompt sweep conflicts with the D4 early return in Task 8"
    location: "project-documents/user/tasks/930-tasks.prune-stale-guide-files-in-worktrees.md:261-263"
  - id: F002
    severity: concern
    category: test-coverage
    summary: "D5 \"unconditional\" behaviour has no test"
    location: "project-documents/user/tasks/930-tasks.prune-stale-guide-files-in-worktrees.md:316-322"
  - id: F003
    severity: concern
    category: test-coverage
    summary: "Warning and notice output is mostly untested"
    location: "project-documents/user/tasks/930-tasks.prune-stale-guide-files-in-worktrees.md:282-297"
  - id: F004
    severity: note
    category: task-sizing
    summary: "Task 8 is large"
    location: "project-documents/user/tasks/930-tasks.prune-stale-guide-files-in-worktrees.md:255-280"
  - id: F005
    severity: note
    category: consistency
    summary: "Small mismatches with the design"
    location: "project-documents/user/tasks/930-tasks.prune-stale-guide-files-in-worktrees.md:167-169"
  - id: F006
    severity: pass
    category: traceability
    summary: "Coverage of success criteria"
    location: "project-documents/user/tasks/930-tasks.prune-stale-guide-files-in-worktrees.md:213-323"
  - id: F007
    severity: pass
    category: sequencing
    summary: "Sequencing, test-with pattern, and commits"
    location: "project-documents/user/tasks/930-tasks.prune-stale-guide-files-in-worktrees.md:74-363"
---

# Review: tasks — slice 930

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Prompt sweep conflicts with the D4 early return in Task 8

Task 8 step 1 says that when `newRoot` is `null`, the copy loop runs, the notice is printed, and the function returns. Task 9 (line 310-312) then says the sweep "runs whether or not a manifest exists (D5)". An implementer who follows Task 8 will have already returned before the sweep runs on the old-guide path. Task 9 doesn't say to restructure the early return. The design's Data Flow (line 96-98) has the same ambiguity. Task 9 should say that the D4 branch must still run the sweep per worktree, or Task 8 should leave a per-worktree hook for it.

### [CONCERN] D5 "unconditional" behaviour has no test

Task 9a checks the sweep on a run where the root manifest exists. It never checks a copilot run with no root manifest (D4) or with an empty manifest. The "unconditional" part of D5 is the one that conflicts with Task 8, and it is the part that can regress. Add a case: copilot, no root manifest, marked prompt present, which means it is removed and the D4 notice is printed once.

### [CONCERN] Warning and notice output is mostly untested

Success criterion 2 requires that a warning names an edited file. Task 6a checks that the file is kept, but it can't check the output because `pruneStaleFiles` does no printing. Task 8a asserts only the `Removed ...` line (case 1). Nothing checks the `Kept ... edited since` line, or the one-line containment and non-regular warnings that Task 8 step 3 prints. Task 8a case 4 does cover the D4 notice. Add an edited-file case to 8a that asserts the `Kept` line. Also assert one containment warning, or the reason-to-message mapping.

### [NOTE] Task 8 is large

Task 8 covers the baseline snapshot, the early-return notice, the union baseline, the prune and print step, and the temp-and-rename manifest copy. It is rated effort 3 and has four numbered sub-steps. A junior could manage it, but it would split cleanly. One part would be the snapshot wiring and the D4 notice. The other would be the prune, print and manifest copy. This isn't blocking. If it is split, 8a needs to follow each part.

### [NOTE] Small mismatches with the design

- Task 5 says `worktreePropagation.ts` imports from `ideTargets.ts` "only". It must also import `installManifest.ts` once Task 8 lands.
- Task 9 gives `sweepGeneratedPrompts(worktreePath, dirs)`. The design says `sweepGeneratedPrompts(worktreePath)`. The task's version is the better one, because the sweep is descriptor-driven.
- Task 6 makes `kept` carry a reason, where the design says `string[]`. The tests in 6a should assert the reason.

### [PASS] Coverage of success criteria

- Criterion 1 is covered by Tasks 6, 6a, 8 and 8a.
- Criterion 2 is covered by 6a case 2 and Task 8.
- Criterion 3 is covered by 6a cases 3 and 4.
- Criterion 4 is covered by 8a case 6.
- Criterion 5 is covered by 8a cases 2 and 3.
- Criterion 6 is covered by 8a case 4.
- Criterion 7 is covered by Tasks 9 and 9a.
- Criterion 8 is covered by 6a case 6.
- Criterion 9 is covered by 6a case 9.
- Criterion 10 is covered by Tasks 7 and 7a.
- Criterion 11 is covered by 6a cases 7 and 8.
- The technical requirements are covered. The `cksum` fixture and edge cases are in 2a, the parser tests are in 3a, and the size checks are in Task 10.
- Every task traces to the design. Task 1 maps to Development Approach step 0, Tasks 4 and 5 to the Migration Plan, and Tasks 11 to 13 to the integration requirements and walkthrough.

### [PASS] Sequencing, test-with pattern, and commits

- Characterization runs before the moves.
- Each implementation task is immediately followed by its test task.
- The extractions are no-behaviour-change steps, each with its own commit.
- There are no circular dependencies.
- Commits come after each part (1, 3a, 4, 5, 6a, 7a, 8a, 9a and the close-out), so none are batched at the end.
- The design has no NFR, so no load-test or CI-gating task is needed.

### Run Digest

- Response length: 5065 chars
- Response is newline-free: no
- Tool calls made: 2
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: not computed
- Tokens — prompt / cached / completion / reasoning: not computed / not computed / not computed / not computed
- Duration: 29.7 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7

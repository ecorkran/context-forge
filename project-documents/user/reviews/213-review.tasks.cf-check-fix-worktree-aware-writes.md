---
docType: review
layer: project
reviewType: tasks
slice: cf-check-fix-worktree-aware-writes
targetKind: slice
rulesSource: project
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/213-tasks.cf-check-fix-worktree-aware-writes.md
aiModel: claude-sonnet-5-5
status: complete
dateCreated: 20261004
dateUpdated: 20261004
reviewedSha: b6d95ab543133f5fdb56ff8162c490fd276736e6
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
durationSeconds: 36.0
squadronVersion: 0.18.4
findings:
  - id: F001
    severity: concern
    category: test-coverage
    summary: "Restore-failure path (SC 7) has no test"
    location: "project-documents/user/tasks/213-tasks.cf-check-fix-worktree-aware-writes.md:231"
  - id: F002
    severity: concern
    category: task-sizing
    summary: "CLI implementation tasks are not followed by tests, and Task 20 is oversized"
    location: "project-documents/user/tasks/213-tasks.cf-check-fix-worktree-aware-writes.md:249-276"
  - id: F003
    severity: note
    category: specification
    summary: "`FixPlan` and `ReadinessResult` shapes are never defined"
    location: "project-documents/user/slices/213-slice.cf-check-fix-worktree-aware-writes.md:115"
  - id: F004
    severity: note
    category: commit-cadence
    summary: "Commit checkpoints are grouped but distributed"
    location: "project-documents/user/tasks/213-tasks.cf-check-fix-worktree-aware-writes.md:172"
  - id: F005
    severity: note
    category: sequencing
    summary: "Task 1 deliberately leaves the build broken until Task 2"
    location: "project-documents/user/tasks/213-tasks.cf-check-fix-worktree-aware-writes.md:85"
  - id: F006
    severity: note
    category: scope
    summary: "`restorePathsToHead` and the Task 25 commit prefix"
    location: "project-documents/user/tasks/213-tasks.cf-check-fix-worktree-aware-writes.md:145"
  - id: F007
    severity: pass
    category: coverage
    summary: "Success criteria SC 1–6 and 8–12 map to tasks, and sequencing holds"
    location: "project-documents/user/tasks/213-tasks.cf-check-fix-worktree-aware-writes.md:74-316"
  - id: F008
    severity: pass
    category: nfr
    summary: "No NFR or load-test obligation in this slice"
    location: "project-documents/user/slices/213-slice.cf-check-fix-worktree-aware-writes.md:336-344"
---

# Review: tasks — slice 213

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Restore-failure path (SC 7) has no test

Task 16 implements the second half of SC 7. If `restorePathsToHead` also throws, the log entries stay in place and one `fixErrors` entry names the checkout and the uncommitted files. The slice design calls this "the only path from git to `fixErrors`" and says it is "always reported". No task covers it. Task 17 case 5 asserts only the successful-restore path, with `fixErrors` empty, and Task 8 tests `restorePathsToHead` in isolation. Add a Task 17 case where both commit and restore fail. One way is to reject via the hook and make the restore fail, for example by holding `index.lock`. It should assert that the `fixErrors` entry names the checkout and the files, and that the `fixLog` entries are retained.

### [CONCERN] CLI implementation tasks are not followed by tests, and Task 20 is oversized

Tasks 18 (routing, `resolveInvokingCheckout`, auto_fix path, preview and prompt) and 19 (grouped output and the label map) are both implementation tasks with no commit and no test between them. Task 20 then carries the whole CLI test load:
- a rewrite of the fixture to real git
- eight new scenarios
- the contract change of the 927 assertion

That breaks the test-with pattern and makes Task 20 the largest task in the file. A failure there is hard to attribute to Task 18 or Task 19. Split Task 20 in two. Test Task 18 right after it (owner commit, unregistered error, preview, auto_fix, single-checkout JSON), with a commit. Then test Task 19's grouped text and label coverage right after Task 19.

### [NOTE] `FixPlan` and `ReadinessResult` shapes are never defined

Tasks 9, 13 and 15 refer to `FixPlan` and `ReadinessResult` "per Data Flow and API Contracts". The design defines only the `FixPlan` sketch `{ perView: [{ view result subset, commit: boolean }], deferred }`. It gives no TypeScript interface for either type. Task 1 does not add them. A junior implementer will have to invent the fields. Add an explicit type-definition item to Task 1 or Task 9, and to Task 13 for `FixPlan`, so Tasks 14, 15 and 18 build against one shape. Task 9 should also note that `opts` is an addition to the design's `checkoutReadiness` signature.

### [NOTE] Commit checkpoints are grouped but distributed

Commits land at Tasks 3, 5, 10, 14, 17, 20, 22 and 23, which satisfies "distributed, not batched at end". Task 10's commit covers Tasks 6–10 (fixture, two helpers, and their tests), which is the largest group. Consider a commit after Task 8, so `commitPathsIfChanged` and `restorePathsToHead` are committed separately from `checkoutReadiness`. This is optional.

### [NOTE] Task 1 deliberately leaves the build broken until Task 2

Task 1's success criterion is that the core build fails only on `fixAction` literals missing `subjectIndex`. It is explicit, and Task 3 gives the first commit after the build is green again. The design intentionally uses the compiler to find every site (Mitigation Strategies). No change is needed, but the implementer must not commit between Tasks 1 and 2.

### [NOTE] `restorePathsToHead` and the Task 25 commit prefix

`restorePathsToHead` is not named in the design's component list. It traces to SC 7 and D5a, which specify the restore command, so it is not scope creep. The slice design should mention it for consistency. Separately, Task 25's commit prefix `test:` (line 316) records results into a document and would normally be `docs:` under the repository's commit conventions.

### [PASS] Success criteria SC 1–6 and 8–12 map to tasks, and sequencing holds

- **Ordering:** types, then subject index, then ownership, then git helpers, then plan and apply, then CLI, then MCP, then docs and verification. There are no circular dependencies. `mergeFixResults` (Task 11) precedes its use in Task 15. `restorePathsToHead` (Task 7) precedes Task 16. The `FIX_GIT_TIMEOUT_MS` constant (Task 9) precedes Task 13.
- **Test-with pairs:** Tasks 2→3, 4→5, 7→8, 9→10, 12–13→14, 15–16→17 and 21→22 each have a test task directly after.
- **SC 9:** the single-checkout invariant is checked in Tasks 14, 17, 20 and 22.
- **Verification and docs:** Task 25 covers walkthrough steps 1–8 and Task 23 covers README and CHANGELOG. MCP step 9 is covered by Task 22.
- **Tasks 2, 4 and 13:** the effort-3 sizes are reasonable.
- **Task 2:** a stop-and-ask guard prevents parsing indexes from labels.
- **Task 6:** real git is used instead of mocks.

### [PASS] No NFR or load-test obligation in this slice

The slice restates no performance or throughput NFR. The only timing element is the `FIX_GIT_TIMEOUT_MS` bound, which Tasks 9 and 16 implement. No `tests/load/` task or CI gating task is required.

### Run Digest

- Response length: 5923 chars
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
- Duration: 36.0 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 8
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 8
- Finding-shaped matches — surviving validation: 8

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
reviewedSha: 32783b0945005ad1516b441c07189162dfd10219
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
durationSeconds: 35.2
squadronVersion: 0.18.4
findings:
  - id: F001
    severity: concern
    category: sequencing
    summary: "Test-with pattern broken for the core routing tasks (11–13)"
    location: "project-documents/user/tasks/213-tasks.cf-check-fix-worktree-aware-writes.md:166-223"
  - id: F002
    severity: concern
    category: sequencing
    summary: "Task 13 depends on Task 14, which is sequenced after it"
    location: "project-documents/user/tasks/213-tasks.cf-check-fix-worktree-aware-writes.md:196-204"
  - id: F003
    severity: concern
    category: sequencing
    summary: "`FIX_GIT_TIMEOUT_MS` location is ambiguous and could invert the module dependency"
    location: "project-documents/user/tasks/213-tasks.cf-check-fix-worktree-aware-writes.md:146"
  - id: F004
    severity: concern
    category: task-scope
    summary: "Task 13 is dense and leaves several behaviors underspecified"
    location: "project-documents/user/tasks/213-tasks.cf-check-fix-worktree-aware-writes.md:187-198"
  - id: F005
    severity: concern
    category: coverage
    summary: "`workflow.auto_fix` path (SC 11) has no test"
    location: "project-documents/user/tasks/213-tasks.cf-check-fix-worktree-aware-writes.md:230,258"
  - id: F006
    severity: note
    category: coverage
    summary: "Grouped CLI text output is only partly asserted"
    location: "project-documents/user/tasks/213-tasks.cf-check-fix-worktree-aware-writes.md:235-251"
  - id: F007
    severity: note
    category: commits
    summary: "Commit checkpoints are mostly distributed but gapped in the middle"
    location: "project-documents/user/tasks/213-tasks.cf-check-fix-worktree-aware-writes.md:162-223"
  - id: F008
    severity: note
    category: nfr
    summary: "No NFR load-test requirement applies"
    location: "project-documents/user/slices/213-slice.cf-check-fix-worktree-aware-writes.md:319-344"
  - id: F009
    severity: pass
    category: coverage
    summary: "Success criteria coverage and scope discipline"
    location: "project-documents/user/tasks/213-tasks.cf-check-fix-worktree-aware-writes.md:61-290"
---

# Review: tasks — slice 213

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Test-with pattern broken for the core routing tasks (11–13)

Tasks 11 (`resolveInvokingCheckout`), 12 (`planRoutedFixes`) and 13 (`applyFixPlan`) are the most complex logic in the slice. None has a test task immediately after it. Their only success criterion is "core build passes", and all of their tests are deferred to Task 15. Task 15 is effort 4 and bundles 12 scenarios plus the single-checkout case. No commit lands between Task 10 and Task 15, so four implementation tasks and a very large test task accumulate before the first checkpoint.

Suggested fix:
- Test 11 and 12 right after they are written (invoking checkout, owner routing, readiness deferrals).
- Test 13 right after it is written (commit, restore, re-check).
- Add a commit after each.

### [CONCERN] Task 13 depends on Task 14, which is sequenced after it

Task 13 says "Combine per-view results through `mergeFixResults` (extended in Task 14)". Task 14 comes after it, so Task 13 cannot be completed or verified in order. Move Task 14 before Task 13, or fold it into Task 1/Task 13.

### [CONCERN] `FIX_GIT_TIMEOUT_MS` location is ambiguous and could invert the module dependency

Task 9 allows the constant to live "next to the other git constants or in `routedFixes.ts`'s module". `routedFixes.ts` is not created until Task 11. `checkoutReadiness`, which lives in `git/`, would then import from `introspection/`, which is the wrong direction. Name one location, in the `git/` layer, so a junior implementer has no choice to make.

### [CONCERN] Task 13 is dense and leaves several behaviors underspecified

Task 13 packs the following into one task:
- readiness re-check
- per-view apply
- worktree tagging
- commit
- restore on failure
- `fixErrors` handling
- merge

Four gaps in it:
- **Written paths:** it uses `writtenRelPaths` without saying how they are obtained from `applyFixes`' result.
- **`fixed` count:** it removes log entries on `COMMIT_FAILED` but never says to adjust `fixed`, so the count could disagree with the log.
- **Restore helper:** it runs `git restore ...` with no named helper, so the call may be inlined instead of living in `gitExec`.
- **`detail` field:** `DeferredFix.detail` appears in Task 1 but not in the design's API Contracts (design:271). This is a minor design/task mismatch worth reconciling.

Consider splitting it into a task for apply, tagging and commit and another for failure and restore. Each needs a test as per the concern above.

### [CONCERN] `workflow.auto_fix` path (SC 11) has no test

Tasks 16 and 19 implement the `auto_fix` branch, but neither Task 18 nor Task 20 tests it. SC 11 says the `auto_fix` path must produce the same routing as the CLI, skip the prompt, and can commit during a plain `cf check`. Add a test case in the CLI and MCP suites. This is the highest-blast-radius path.

### [NOTE] Grouped CLI text output is only partly asserted

Task 17 builds the grouped output, the all-seven-reasons label map and the `fixErrors` printing. Task 18 asserts only the preview text and JSON shape. Add one assertion on the grouped text ("invoking checkout, uncommitted", "committed <sha>", "Left alone") and a check that every `DeferReason` has a label entry.

### [NOTE] Commit checkpoints are mostly distributed but gapped in the middle

Commits land after Tasks 3, 5, 10, 15, 18, 20, 21 and 23, which is reasonable. The gap between Task 10 and Task 15 (four implementation tasks) is the weak point and is addressed by the first concern. Tasks 22 and 23 depend on a clean tree, so no extra commit is needed there.

### [NOTE] No NFR load-test requirement applies

The slice states no performance or scalability NFR, so no `tests/load/` task or CI-gating task is required. The only bound is `FIX_GIT_TIMEOUT_MS`, which is covered functionally.

### [PASS] Success criteria coverage and scope discipline

- **Ownership and routing (SC 1, 2, 8):** covered by Tasks 4, 12 and 15.
- **Commits and git status (SC 3, 4, 5):** covered by Tasks 7, 13, 15 and 18.
- **Readiness and failure handling (SC 6, 7):** covered by Tasks 9, 13 and 15.
- **Single-checkout invariant (SC 9):** asserted in Tasks 15, 18 and 20.
- **CLI and invoking checkout (SC 10, 12):** covered by Tasks 16, 18, 19 and 20.
- **Docs and walkthrough:** the design's "Technical Requirements" and Verification Walkthrough steps 1–9 map to Tasks 3, 5, 8, 10, 15, 18, 20, 21 and 23.

No task is scope creep. Task 0, Task 22 and the Task 23 scratch-repo guard all follow project conventions, including never running `--fix` in this repository.

### Run Digest

- Response length: 5811 chars
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
- Duration: 35.2 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 9
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 9
- Finding-shaped matches — surviving validation: 9

---
docType: review
layer: project
reviewType: tasks
slice: native-setup-ide-install
targetKind: slice
rulesSource: project
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/215-tasks.native-setup-ide-install.md
aiModel: claude-opus-5-5
aiProfile: sdk
status: complete
dateCreated: 20261013
dateUpdated: 20261013
reviewedSha: 27db2408f56430323562cb74ee2c57e843afe544
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 11
durationSeconds: 64.8
squadronVersion: 0.21.6
findings:
  - id: F001
    severity: concern
    category: sequencing
    summary: "Task 31 lets only 2 snapshots update, but fix #40 changes 18"
    location: "project-documents/user/tasks/215-tasks.native-setup-ide-install.md:277-281"
  - id: F002
    severity: concern
    category: commit-cadence
    summary: "Tasks 3 and 5–9 have no commits"
    location: "project-documents/user/tasks/215-tasks.native-setup-ide-install.md:52-98"
  - id: F003
    severity: concern
    category: accuracy
    summary: "Task 10 lists the wrong files that import `installManifest.ts`"
    location: "packages/cli/src/commands/setup-ide.ts:29"
  - id: F004
    severity: concern
    category: dry
    summary: "Task 26's `rules.exclude` parsing doesn't trim and doesn't reuse the validator's split"
    location: "packages/core/src/config/ConfigKeys.ts:176-184"
  - id: F005
    severity: note
    category: proportionality
    summary: "Paired implement-then-test tasks could merge"
    location: "project-documents/user/tasks/215-tasks.native-setup-ide-install.md:72-98"
  - id: F006
    severity: note
    category: accuracy
    summary: "The coordination step names a different session than the design"
    location: "project-documents/user/tasks/215-tasks.native-setup-ide-install.md:23"
  - id: F007
    severity: pass
    category: coverage
    summary: "Every success criterion maps to a task"
    location: "project-documents/user/slices/215-slice.native-setup-ide-install.md:241-260"
  - id: F008
    severity: pass
    category: sequencing
    summary: "Order, test placement and spec-change isolation"
    location: "project-documents/user/tasks/215-tasks.native-setup-ide-install.md:139-287"
---

# Review: tasks — slice 215

**Verdict:** CONCERNS
**Model:** claude-opus-5-5

## Findings

### [CONCERN] Task 31 lets only 2 snapshots update, but fix #40 changes 18

Task 31 says to run `vitest -u` only for `test_targets_copilot_fresh` and `test_targets_agents_fresh`. The slice design says the same at line 161. But the broken `**` / `**"` pair shows up in 18 guide snapshots:
- `test_targets_copilot_prompts`
- all the `test_managed_*_agents` snapshots (`no_markers`, `legacy`, `legacy_end`, `block_replaced`, `backup_kept`, `absent`)
- every `test_lint_*` snapshot, which shows the AGENTS-style `Applies to: \`**` line for `broken.md`

I checked `test_lint_dart.snap:87-88` and `test_targets_copilot_prompts.snap:70-71` directly. With the fix in place, Task 31's "all tests pass" can only be met by breaking its own allow-list. Replace the list with "every snapshot containing the default-glob pair", or list all 18. The success check should then be that the diff touches only those glob lines. Ask the PM to amend design line 161 the same way.

Task 32 (#38) may have the same problem. Before relying on `test_managed_block_replaced_*` as the full list, check whether re-run scenarios (`test_ownership_*`, `test_managed_backup_kept_*`) also replace a block.

### [CONCERN] Tasks 3 and 5–9 have no commits

After Task 4, the next commit is Task 10. That leaves the stub, `lines.ts`, `output.ts`, `frontmatter.ts` and their tests (Tasks 3 and 5–9) uncommitted, which breaks the project rule "commit at least once per task". Add commits, for example:
- `feat(cli): add ideInstall line and output helpers` after Task 7
- `feat(cli): add ideInstall frontmatter helpers` after Task 9

Task 3 can go into Task 4's commit.

### [CONCERN] Task 10 lists the wrong files that import `installManifest.ts`

Task 10 says to update "`ideTargets.ts`, `worktreePropagation.ts` and their tests". `ideTargets.ts` doesn't import `installManifest.ts`. The actual importers are:
- `setup-ide.ts:29` (`readManifest`)
- `worktreePropagation.ts:6`
- `tests/commands/worktreePrune.test.ts:6`
- `tests/commands/installManifest.test.ts:11`

The build would catch the missing `setup-ide.ts`, but a junior agent following the list would edit the wrong file. Fix the list.

### [CONCERN] Task 26's `rules.exclude` parsing doesn't trim and doesn't reuse the validator's split

The design (API Contracts) says `rulesExclude` arrives "already split and trimmed". Task 26 says only "split on `,`, with an empty value giving `[]`". The validator already does this split, and Task 27 needs it again for each worktree. To avoid writing it twice, Task 26 should name one shared parse helper that both call sites use. It should also say whether trimming is needed, since the validator already rejects whitespace around entries.

### [NOTE] Paired implement-then-test tasks could merge

Tasks 7, 10, 11 and 12 include their tests in the same task. Tasks 5/6 and 8/9 split them, even though the implementation step's only success check is "the module builds". Merging 5+6 and 8+9 would make the pattern consistent and would also give the commit points the previous finding asks for. 34 tasks is a reasonable size for a port of about 2,000 lines of bash plus 76 tests.

### [NOTE] The coordination step names a different session than the design

The task file says to notify "the ai-project-guide-old session". The design (lines 51, 238, 329) says "the ai-project-guide session". If the session was renamed, ignore this. Otherwise make the two match.

### [PASS] Every success criterion maps to a task

| Criterion | Tasks |
|---|---|
| All targets and aliases, no bash | 13–17, 28, 29 |
| Snapshot match | 14–23 |
| Real-guide byte parity, fresh and re-run | 25 |
| `--dry-run` and `--write-lint` | 18–21 |
| Worktree loop failure handling | 27, 28, walkthrough step 5 in Task 34 |
| `rules.exclude` behavior | 12, 22, 28 |
| `cf init --ide` | 26 |
| Recognizing a bash-written install | 11, 25 |
| No shell-out (grep) | 29 |
| Size limits | 24 |
| `--help` and docs | 33 |
| Guide can delete its scripts | 23 (smoke test needs no script), 29 |

I found no scope creep. The CHANGELOG entry in Task 33 and the `MANAGED_MARKER_END` constant in Task 11 both come from the slice's own requirements. The slice states no NFR, so no load-test or CI-gating task is needed.

### [PASS] Order, test placement and spec-change isolation

- Each implementation task is followed directly by its test task.
- The lint no-op in Task 13 is replaced in Task 20 before Task 22 needs it.
- Parity (25) runs before the fixes (31, 32), so it can expect IDENTICAL results.
- Deletion (29) is gated on a green suite.
- The env-tier change (22) and the #40 and #38 fixes (31, 32) each get their own commit, as the PM decisions require.
- No task merges the branch, as the git rules require.

### Run Digest

- Response length: 6102 chars
- Response is newline-free: no
- Tool calls made: 11
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: not computed
- Tokens — prompt / cached / completion / reasoning: not computed / not computed / not computed / not computed
- Duration: 64.8 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 8
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 8
- Finding-shaped matches — surviving validation: 8

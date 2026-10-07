---
docType: review
layer: project
reviewType: tasks
slice: stable-default-worktree-marker
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/934-tasks.stable-default-worktree-marker.md
aiModel: deepseek/deepseek-v4.1-flash
status: complete
dateCreated: 20261007
dateUpdated: 20261007
reviewedSha: aee38a58fdc78575222f5694910ace61166f2276
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 52
turns: 20
promptTokens: 1329415
cachedTokens: 1104512
completionTokens: 120183
reasoningTokens: 114514
durationSeconds: 505.8
runId: run-20261007-p5-ca66f7b8
squadronVersion: 0.21.0
findings:
  - id: F001
    severity: concern
    category: correctness
    summary: "MCP task names a tool that does not exist (`worktree_remove`)"
    location: "packages/mcp-server/src/tools/worktreeTools.ts:261"
  - id: F002
    severity: concern
    category: testing
    summary: "Task 5T misdescribes the CLI test updates; the real breakage is unaddressed"
    location: "packages/cli/tests/commands/worktree.test.ts:420-450"
  - id: F003
    severity: concern
    category: testing
    summary: "Task 6T describes MCP test cases that do not exist, and its `isDefault` assertion cannot exercise the stated risk"
    location: "packages/mcp-server/tests/worktreeTools.test.ts:1-40"
  - id: F004
    severity: concern
    category: coverage
    summary: "Integration Requirements criterion has no corresponding task"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md#Success Criteria"
  - id: F005
    severity: note
    category: tooling
    summary: "Task 7's sweep command is quote-specific and cannot prove the criterion"
    location: "packages/cli/src/commands/worktreePropagation.ts:185"
  - id: F006
    severity: note
    category: documentation
    summary: "Existing \"read returns stored fields verbatim\" block and its NOTE comment become false"
    location: "packages/core/tests/storage/FileProjectStore.test.ts:81-87"
  - id: F007
    severity: note
    category: nfr
    summary: "NFR / load-test rule does not apply, but state why in the task file"
    location: "project-documents/user/slices/934-slice.stable-default-worktree-marker.md#Special Considerations"
  - id: F008
    severity: note
    category: sequencing
    summary: "Mid-slice window where chop and restore are silently off for legacy data"
    location: "packages/core/src/services/WorktreeService.ts:325-326"
---

# Review: tasks — slice 934

**Verdict:** CONCERNS
**Model:** deepseek/deepseek-v4.1-flash

## Findings

### [CONCERN] MCP task names a tool that does not exist (`worktree_remove`)

Task 6 says: "change the `worktree_init` and `worktree_remove` descriptions (including line ~267)". The registered tool is `worktree_rm` (`server.registerTool('worktree_rm', …)` at line 261), not `worktree_remove`. The line reference (~267) is correct — line 267-268 holds `restoredRange is the 'default' worktree's new range … rangeNotRestored { reason, defaultRange }` — so the intent is recoverable, but a junior AI told to edit `worktree_remove` may conclude the tool is absent and either skip the edit or, worse, add a new registration. Task 6T inherits the same imprecision ("`worktree_list` output includes `isDefault` on each worktree" is fine; the tool-name error is only in Task 6). Change `worktree_remove` to `worktree_rm`.

### [CONCERN] Task 5T misdescribes the CLI test updates; the real breakage is unaddressed

Task 5T's first bullet reads: "Update `cli/tests/commands/worktree.test.ts` cases that seed a default by name and expect chop or restore to seed `isDefault: true`." No such cases exist. That file mocks the service wholesale (`vi.mock('@context-forge/core/node')` with `removeWorktree: mockRemoveWorktree`) and never constructs worktrees through `addWorktree` or seeds a default at all. What actually breaks after Task 5 is different: the two `rm` tests at lines ~420 and ~431 stub `mockRemoveWorktree.mockResolvedValue({ removed: sampleWorktree, migrated: false, restoredRange: [100, 799] })` with **no `defaultWorktree` field**, and then assert `"'default' worktree, now 100-799"` / `"'default' worktree keeps its range 100-299"` / `cf worktree update default --range`. Once Task 5 replaces the literal `'default'` with `defaultWorktree.name`, those mocks produce `undefined` (or a throw) rather than the asserted text. An implementer following the instruction literally will not find "name-seeded" cases, and the file needs a different edit: add `defaultWorktree: { id, name }` to the mocked remove results (or change the assertions). This bullet should name that change explicitly.

### [CONCERN] Task 6T describes MCP test cases that do not exist, and its `isDefault` assertion cannot exercise the stated risk

Two problems in one task:

1. "Update `mcp-server/tests/worktreeTools.test.ts` cases that seed a default by name and expect chop or restore to seed `isDefault: true`" — the file mocks `WorktreeService` entirely (`addWorktree: mockAddWorktree`, `removeWorktree: mockRemoveWorktree`, etc.) and never seeds worktrees; there is nothing of that shape to update. The only seeding-adjacent fixture is `packages/mcp-server/tests/fixtures/integration-project/projects.json`, and it declares no `worktrees` array at all, so the read migration is a no-op there. As written, the bullet sends the implementer looking for work that isn't there.

2. "Add: `worktree_update` called with an `isDefault` argument leaves the stored value unchanged" gives false confidence. The handler copies every received argument key into `updates`, but the MCP SDK validates `inputSchema` first and the `worktree_update` zod object declares no `isDefault` field, so zod strips the key before the handler sees it — the test passes whether or not the handler is safe, and never touches the "stray runtime key" path. The meaningful assertion (a stray `isDefault` in the updates object does not change the stored value) is already specified in Task 3T and is the one that matters. Either strengthen this bullet to assert the handler's collected `updates` object never contains `isDefault`, or drop it.

### [CONCERN] Integration Requirements criterion has no corresponding task

The slice's Success Criteria include an Integration Requirements section: "`cf check` worktree attribution (`buildAttributedViews`) and `propagationTargets` behave the same. They don't use the default name today." No task verifies it. Task 7's sweep only covers the `grep` for name comparisons, and Task 8 runs the generic suite. Both call sites are indirectly at risk because the migration now rewrites every project on read: `buildAttributedViews` keys on worktree *count* (packages/core/src/introspection/mergeCheckResults.ts:36-41) and `propagationTargets` filters on resolved *path* equality with the project root (packages/cli/src/commands/worktreePropagation.ts:190-195), so both should be unaffected — but nothing in the task list confirms it, and the migration adds an `isDefault` field to objects these functions pass through. Add an explicit verification bullet (e.g. run `cf check` on a multi-worktree project and confirm the attribution output is unchanged, and the existing `check-worktree-attribution.test.ts` / `worktreePropagation.test.ts` suites still pass with the store-level migration active).

### [NOTE] Task 7's sweep command is quote-specific and cannot prove the criterion

Task 7 runs `grep -rn "'default'" packages/*/src`. The Technical Requirement it is meant to discharge is "no code outside `utils/defaultWorktree.ts` compares a worktree name to `'default'`" — but the codebase mixes quote styles, e.g. `WorktreeService.ts:182` uses `"default"` in a comment, `worktreePropagation.ts:185` uses `"default"`, and the MCP descriptions use `"default"`. A single-quote-only grep will miss any double-quoted reintroduction. Suggest `grep -rn "['\"]default['\"]" packages/*/src` (and the same for tests) so the sweep actually matches the stated criterion.

### [NOTE] Existing "read returns stored fields verbatim" block and its NOTE comment become false

Task 4 adds a read-time migration to `FileProjectStore.getAll()`, but Task 4T only adds new tests. The existing suite carries a prominent contract comment: "NOTE: `getAll()` returns stored records verbatim — no read-time field migration. `migrateProjectFields()` was intentionally removed (commit 8da8cc8) … These tests assert the verbatim pass-through contract, not migration." The tests themselves still pass (their fixtures declare no `worktrees`, so the migration is a no-op), but the comment now states the opposite of the new behavior, and it sits directly above the block a reader would consult. Task 4T should add a bullet to amend that comment (and the `describe('read returns stored fields verbatim', …)` title) to scope the verbatim claim to non-worktree fields.

### [NOTE] NFR / load-test rule does not apply, but state why in the task file

The slice restates a non-functional concern — the migration cost ("one in-memory pass over the projects on each `getAll()` … No measurable startup cost is expected, and the 900 architecture sets no latency targets for these paths"). There is no `tests/load/` infrastructure anywhere in the repository and no latency target to gate on, so no load-test task and no CI gating task is warranted here; the rule's premise (a measurable NFR) is absent. Worth one line in Task 8 acknowledging it, so the absence reads as a decision rather than an omission.

### [NOTE] Mid-slice window where chop and restore are silently off for legacy data

Task 3C (`fix(core): identify the default worktree by isDefault, not name`) lands before Task 4C (the store read migration). At the intermediate commit, a stored project that still has a name-only `default` worktree has no marked default, so `findDefaultWorktree` returns `undefined` and both `chopDefaultRange` and `restoreDefaultRange` become no-ops — precisely the "silently disables both" symptom #112 describes. This is harmless in the final artifact (both commits are on the same slice branch, and Task 3T rebuilds the affected core tests), but if anyone checks out or reviews the intermediate commit, or if the two commits are ever split, the failure is silent. Consider reordering (store migration before, or in the same commit as, the service switch) or adding a line to Task 3C stating the branch is not releasable until 4C lands.

### Run Digest

- Response length: 9399 chars
- Response is newline-free: no
- Tool calls made: 52
- Tool calls failed: 0
- Stop reason: stop
- Output budget: 384000 tokens
- System prompt: custom
- Settings sources: n/a (non-SDK)
- Reasoning characters: 471687
- Effort: backend default
- Turns: 20
- Tokens — prompt / cached / completion / reasoning: 1329415 / 1104512 / 120183 / 114514
- Duration: 505.8 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 8
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 8
- Finding-shaped matches — surviving validation: 8

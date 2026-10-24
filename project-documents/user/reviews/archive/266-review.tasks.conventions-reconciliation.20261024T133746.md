---
docType: review
layer: project
reviewType: tasks
slice: conventions-reconciliation
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/266-tasks.conventions-reconciliation.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261024
dateUpdated: 20261024
reviewedSha: 4c79b9d0dee91a5f51c1c401cd7f4c240f85beee
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 102818
cachedTokens: 8843
cacheWriteTokens: 93971
completionTokens: 6312
durationSeconds: 53.1
costUsd: 0.44063
costBasis: provider
runId: run-20261024-p56-497422e8
squadronVersion: 0.23.7
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success criteria coverage is complete"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md"
  - id: F002
    severity: pass
    category: sequencing
    summary: "Sequencing and commit distribution"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md:41-297"
  - id: F003
    severity: concern
    category: completeness
    summary: "Task 4.3 never exports `managedBlockRange`"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md:115-122"
  - id: F004
    severity: concern
    category: task-sizing
    summary: "Task 11 is the largest task and tests only at the end"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md:232-255"
  - id: F005
    severity: concern
    category: interface-clarity
    summary: "`delivered()` is ambiguous across tasks 6.1, 10.1 and 11.1"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md:153-157"
  - id: F006
    severity: concern
    category: task-design
    summary: "Task 12.3 can block mid-sequence and its first bullet is a no-op"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md:270-273"
  - id: F007
    severity: note
    category: consistency
    summary: "Effort ratings appear only on task 1.1"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md:49"
---

# Review: tasks — slice 266

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success criteria coverage is complete

Each Functional and Technical Requirement in the slice design maps to a task:
- **Inventory:** 5.1/5.2 for the enumeration and 7.1/7.2 for the command. This includes the managed-block range, broken markers, and the exclusion of installed files, generated-marker files and backups.
- **Resolve and rejections:** 8.1/8.2.
- **Rendering and re-run:** 11.2/11.3 render every composite and check byte-identical re-runs.
- **No-file regression and basename-stable rendering:** 11.3.
- **Stale warnings and malformed file:** 10.1/10.2 and 11.3.
- **Worktree and dry run:** 11.3.
- **261 `.github/instructions` and tests:** 4.1/4.2.
- **`managedState` unchanged:** 4.4/4.5.
- **README and CLI reference:** 12.1/12.2.
- **Prompt contract:** 12.3.
- **Verification Walkthrough:** 13.2 covers steps 1-6.

Every task traces back to the design. The Future Work edit in 13.3 comes from the design's Special Considerations.

### [PASS] Sequencing and commit distribution

Dependencies run forward with no cycles: markers (2), then schema and store (3), then rule list and range (4), then enumeration (5), then guide entries (6), then the commands (7, 8), then `trailing` (9), then render (10), then wiring (11). Tests follow their implementation tasks, and there is a commit after each of tasks 2 through 12. Commit checkpoints are not batched at the end. The task file is a single file, which suits a slice this size.

### [CONCERN] Task 4.3 never exports `managedBlockRange`

Task 4.4 has cli's `managedSection.ts` call `managedBlockRange`, which core must expose through `ruleReconciliation/index.ts` and `node.ts`. Tasks 3.3 and 5.1 both include an "Export from `ruleReconciliation/index.ts`" step. Task 4.3 has none, so a junior implementer could finish 4.3 and fail on 4.4's import. Add the same export step to 4.3.

### [CONCERN] Task 11 is the largest task and tests only at the end

Task 11 changes `setup-ide.ts`, `installer.ts`, `InstallContext` and four target emitters. All of it is verified by one test subtask (11.3) with about ten case groups and committed once. This breaks the test-with pattern used elsewhere, and a failure is hard to localise. Split it into two commits:
- **11.1 plus the Claude-target part of 11.2.** Plumbing, `claude.ts` wiring, the matching render tests, stale-identity and malformed-file tests, and the no-file regression, then commit.
- **The agents, copilot and cursor emitters with their tests.** Cover the dry-run and worktree cases here, then commit.

### [CONCERN] `delivered()` is ambiguous across tasks 6.1, 10.1 and 11.1

Task 6.1 exports `delivered(rule)`, but delivery depends on the `exclusions` object, and `isExcluded` records matches as a side effect. Task 10.1 then says `live` requires `delivered(rule)` without saying what it is called with. Task 6.1 already stores the result in each entry's `excluded` field. State that `classifyResolutions` reads `entry.excluded` and does not re-invoke `isExcluded`. Also state the order in 11.1: `guideRuleEntries` runs once per install, before `warnUnmatched`. Otherwise an implementer could evaluate exclusions twice or in the wrong order and change the unmatched-pattern warnings. That would also threaten the no-file byte-identity requirement.

### [CONCERN] Task 12.3 can block mid-sequence and its first bullet is a no-op

The slice design's Integration Points already hold the full prompt contract (design line 269), so the first bullet ("add … only if not already complete") does nothing. The real work is filing the issue in ai-project-guide. If `gh` access is missing, the task writes `BLOCKED:` and stops before task 13, so the final verification and the status update never run. Make the contract check a one-line verification. Move the issue filing to after 13.3, or make its absence non-blocking, so the slice's own verification isn't held up by an external repo.

### [NOTE] Effort ratings appear only on task 1.1

The Context Summary says "Effort scale 1-5", but only task 1.1 carries an `Effort:` line. Either add ratings to the other tasks or drop the scale from the summary.

### Run Digest

- Response length: 5183 chars
- Response is newline-free: no
- Tool calls made: 2
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 3
- Tokens — prompt / cached / cache write / completion / reasoning: 102818 / 8843 / 93971 / 6312 / not computed
- Duration: 53.1 s
- Cost: $0.44 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7

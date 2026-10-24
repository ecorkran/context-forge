---
docType: review
layer: project
reviewType: tasks
slice: conventions-reconciliation
targetKind: slice
rulesSource: project
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
reviewedSha: f1563e9d6dc69c77ada9348bdadd34972f081aad
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 5
turns: 6
promptTokens: 287293
cachedTokens: 185831
cacheWriteTokens: 101454
completionTokens: 4209
durationSeconds: 37.1
costUsd: 0.467236
costBasis: provider
squadronVersion: 0.23.7
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success-criteria coverage is complete"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md"
  - id: F002
    severity: pass
    category: sequencing
    summary: "Sequencing and test-with pattern hold"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md"
  - id: F003
    severity: concern
    category: task-sizing
    summary: "Task 11.4 bundles too many independent test scopes"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md:270-276"
  - id: F004
    severity: concern
    category: conventions
    summary: "Format step is missing from the verification commands"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md:299"
  - id: F005
    severity: note
    category: granularity
    summary: "Task 9 is small enough to fold into task 11"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md:218-227"
  - id: F006
    severity: note
    category: duplication
    summary: "`managedSection.ts` has a second BEGIN/END scan that 4.4 leaves alone"
    location: "packages/cli/src/ideInstall/managedSection.ts:112-128"
  - id: F007
    severity: note
    category: proportionality
    summary: "Proportionality is reasonable"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md"
---

# Review: tasks — slice 266

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success-criteria coverage is complete

Each design criterion traces to a task:
- Inventory content, exclusions, block ranges and broken markers: 5.1/5.2, 7.3 to 7.6.
- `resolve` rejections (unknown rule or source, multi-line statement, marker, backtick, missing statement): 3.1/3.2, 8.1/8.2.
- Render per composite, re-run byte-identity, no-file byte-identity, body-change stability: 11.3/11.4.
- Stale-identity warnings and fail-before-write on a malformed file: 10.1/10.2, 11.1/11.2.
- Worktree and dry run: 11.4.
- 261 `.github/instructions` and its tests: 4.1/4.2.
- Docs: 12.1/12.2.
- `managedState` unchanged: 4.4/4.5.
- Walkthrough: 13.2.

The slice restates no NFR, so no `tests/load/` task or CI-gating task is needed.

### [PASS] Sequencing and test-with pattern hold

Dependencies run in order:
- Markers move first (2).
- Schema and store (3), the rule-file list and `managedBlockRange` (4), then `projectRuleSources` (5).
- `guideRules.ts` (6) comes before the inventory (7) and the renderer (10), which call `delivered()`.
- `compileClaudeRules` gains `trailing` (9) before the emitters use it (11.3).

Each implementation task is followed immediately by its tests. Commits land at the end of tasks 2 to 12, and the merge is correctly left to Phase 7.

### [CONCERN] Task 11.4 bundles too many independent test scopes

11.4 is one test file covering four unrelated groups:
- Per-target rendering across four targets and five composite files.
- Re-run idempotence and guide-body stability.
- The no-file snapshot regression.
- Dry run and worktree behaviour.

A junior AI would struggle to finish this in one pass. Split it into 11.4a (per-target render, idempotence, body stability) and 11.4b (no-file regression, dry run, worktree). Give each its own `resolutions.*.test.ts` file. Keep the final `pnpm test` and commit on the last one.

### [CONCERN] Format step is missing from the verification commands

The design's Technical Requirements say "Format, lint and typecheck pass", and the project guidelines list format as part of the fix workflow. The commit checkpoints and 13.1 run only `pnpm lint`, `pnpm typecheck` and tests. Add the project's format command to 13.1 and to the per-task commit checkpoints, or state that lint covers formatting. I didn't confirm which script name the repo uses.

### [NOTE] Task 9 is small enough to fold into task 11

Adding `trailing` to `compileClaudeRules` is a one-parameter change with two test cases. Keeping it separate is defensible because it is a behaviour-preserving refactor with its own commit. It could also merge into 11.3 without losing anything.

### [NOTE] `managedSection.ts` has a second BEGIN/END scan that 4.4 leaves alone

`replaceBlock` walks the markers itself, separately from `managedState`. Task 4.4 replaces only the `managedState` scan with `managedBlockRange`. This is acceptable because `replaceBlock` is reached only after `managedState` has returned `'managed'`, so the pair is already valid. The "BEGIN/END rule now exists once" success line in 4.4 slightly overstates this. Either reword it to cover `managedState` only, or leave a comment in `replaceBlock` pointing to `managedBlockRange`.

### [NOTE] Proportionality is reasonable

The task count is high (13 groups), but the design spans core, cli and ideInstall, and the work is split by module. Every test case traces to a design criterion. I found no scope creep: the extra `.github/instructions` and `.github/copilot-instructions.md` handling is explicitly in the design. A single task file is appropriate.

### Run Digest

- Response length: 4552 chars
- Response is newline-free: no
- Tool calls made: 5
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 6
- Tokens — prompt / cached / cache write / completion / reasoning: 287293 / 185831 / 101454 / 4209 / not computed
- Duration: 37.1 s
- Cost: $0.47 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7

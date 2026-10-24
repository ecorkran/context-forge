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
reviewedSha: deb12065d9ccae8488d0acfd7ad54e686f9d7bdf
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 4
turns: 5
promptTokens: 278750
cachedTokens: 183830
cacheWriteTokens: 94912
completionTokens: 4959
durationSeconds: 41.8
costUsd: 0.448368
costBasis: provider
runId: run-20261024-p56-497422e8
squadronVersion: 0.23.7
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success criteria are fully covered"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md"
  - id: F002
    severity: concern
    category: proportionality
    summary: "Stale and excluded-rule behaviour is tested three times"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md:227-260"
  - id: F003
    severity: concern
    category: task-clarity
    summary: "Ambiguous alternative in 11.1 invites a silent fallback"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md:239"
  - id: F004
    severity: concern
    category: task-scope
    summary: "Task 7.1 bundles several unrelated changes"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md:170-177"
  - id: F005
    severity: note
    category: task-clarity
    summary: "Wording of the 10.2 `projectRoot` case is unclear"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md:228"
  - id: F006
    severity: note
    category: dependency
    summary: "Installed-path format is assumed"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md:173"
  - id: F007
    severity: note
    category: scope
    summary: "13.3 files an external GitHub issue"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md:294-297"
  - id: F008
    severity: pass
    category: sequencing
    summary: "Sequencing and commit checkpoints"
    location: "project-documents/user/tasks/266-tasks.conventions-reconciliation.md"
---

# Review: tasks — slice 266

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success criteria are fully covered

Each functional and technical requirement maps to a task:
- **Inventory** (guide rule exclusion state, composite block ranges, broken markers, exclusion of cf output): 5.1, 6.1 and 7.1, tested in 5.2, 6.2 and 7.2.
- **`resolve` rejections** (unknown rule or source, missing, multi-line or marker-bearing statement, backtick): 3.1 and 8.1, tested in 3.2 and 8.2.
- **`setup-ide` rendering:** every composite is covered by 11.3 and 11.4. This includes re-run byte-identity, the no-file regression, the basename-stable case, both stale warnings, the malformed-file failure, and worktree and dry-run.
- **261 changes:** `.github/instructions` and the `presentPaths` and `renderAdoptionFacts` tests are in 4.1 and 4.2. The `managedState` regression is in 4.5.
- **Docs and prompt contract:** 12.1, 12.2 and 13.3.
- **Verification Walkthrough:** 13.2.

Nothing is out of scope. The tasks stay within the Excluded list, and 13.4 only files the deferred items in the slice plan, as the design asks. The slice has no NFRs, so no load test or CI gating task is needed.

### [CONCERN] Stale and excluded-rule behaviour is tested three times

The stale-guide, stale-project and excluded-scoped-rule cases appear in 10.2 (`resolutions.test.ts`), in 11.2 (`resolutions.install.test.ts`) and again in 11.4 (`resolutions.render.test.ts`). That is three test files in `ideInstall` for one behaviour, and the design needs the behaviour verified once at each level.
- Keep 10.2 for classify and render at unit level.
- Merge 11.2 into 11.4. Both use `harness.ts`, and 11.4 already checks that no section is rendered for stale or excluded rules.
- Keep only what 11.4 does not cover: the malformed-file fail-before-write case and the once-per-run, exit-0 warning assertion.

This cuts one test file and roughly six duplicate cases.

### [CONCERN] Ambiguous alternative in 11.1 invites a silent fallback

The step says to classify only after `requireRulesDir` passes, "or tolerate the missing directory by skipping classification". Skipping classification when the guide rules directory is missing would drop resolutions without any signal. That conflicts with the project rule against silent fallbacks, and a junior implementer cannot tell which option to pick.
- Pick one: call `guideRuleEntries` only after the target's own `requireRulesDir` check, and let it throw (6.1 already throws on a missing directory).
- Delete the "or tolerate" clause.

### [CONCERN] Task 7.1 bundles several unrelated changes

7.1 packs together:
- project and guide resolution
- exporting `readRulesExclude` from `setup-ide.ts`
- adding a manifest reader to `manifest.ts`, which I checked does not exist today (only `manifestPath` and `cksum` are exported)
- building the shared inventory function
- registering the command

The manifest reader and the `readRulesExclude` export are small refactors of existing cli modules, and they are easy to get wrong in combination. Split them into a short prerequisite subtask, "7.0 Export manifest reader and `readRulesExclude`". That subtask would have its own check that existing tests are unchanged, and a separate commit if you want to isolate regressions.

### [NOTE] Wording of the 10.2 `projectRoot` case is unclear

"a project source checked against `projectRoot`, not a sandbox" does not say what to set up or assert. Reword it to something like: "a resolution whose `projectSource` exists only under the real `projectRoot` classifies as live".

### [NOTE] Installed-path format is assumed

5.1 requires `installedPaths` to be checkout-relative with `/` separators, and 7.1 passes whatever the manifest reader returns. Add one assertion in 7.2 that the paths read from a real `setup-ide` manifest match the `projectRuleSources` format. The 7.2 case "cf-installed `.claude/rules/*` files are absent" after a real run mostly covers this already, so it needs only a note, not a new task.

### [NOTE] 13.3 files an external GitHub issue

This task does not trace to a success criterion. It does trace to the design's "Provides to Other Slices" bullet for ai-project-guide. It says it never blocks the slice, and its fallback is explicit (`issue not filed`). I would keep it.

### [PASS] Sequencing and commit checkpoints

Dependencies run in order with no cycles:
- markers (2) before schema and store (3)
- `RULE_FILE_PATHS` and `managedBlockRange` (4) before `projectRuleSources` (5)
- `guideRuleEntries` (6) before the commands (7 and 8)
- `compileClaudeRules` `trailing` (9) before render (10), wiring (11.1) and emitters (11.3)

Commits fall at the end of tasks 2, 3, 4 (twice), 5, 6, 7, 8, 9, 10, 11 (twice), 12 and 13, so none are batched at the end. Merge and push are correctly left out.

### Run Digest

- Response length: 5905 chars
- Response is newline-free: no
- Tool calls made: 4
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 5
- Tokens — prompt / cached / cache write / completion / reasoning: 278750 / 183830 / 94912 / 4959 / not computed
- Duration: 41.8 s
- Cost: $0.45 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 8
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 8
- Finding-shaped matches — surviving validation: 8

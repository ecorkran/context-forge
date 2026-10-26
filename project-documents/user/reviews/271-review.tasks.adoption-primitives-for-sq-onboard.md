---
docType: review
layer: project
reviewType: tasks
slice: adoption-primitives-for-sq-onboard
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: PASS
verdictSource: stated
sourceDocument: project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261025
dateUpdated: 20261025
reviewedSha: f38bd7e21540f35997afba4090c06870a82b91bc
revision_number: 2
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 107864
cachedTokens: 11222
cacheWriteTokens: 96638
completionTokens: 5676
durationSeconds: 48.7
costUsd: 0.445178
costBasis: provider
runId: run-20261026-p5-dc0b898a
squadronVersion: 0.24.5
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success criteria are fully traced to tasks"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md:52-364"
  - id: F002
    severity: pass
    category: sequencing
    summary: "Sequencing and test-with pattern hold"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md:86-340"
  - id: F003
    severity: note
    category: sequencing
    summary: "`cf init --json` write point must move when the codebase line is added"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md:266"
  - id: F004
    severity: note
    category: validation
    summary: "Walkthrough step 1 depends on a sibling repo that may not exist"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md:352-355"
  - id: F005
    severity: note
    category: validation
    summary: "Live onboarding run depends on how the installed command reaches detection"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md:357-361"
  - id: F006
    severity: note
    category: task-sizing
    summary: "Task 9.2 is the densest implementation task"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md:230-235"
  - id: F007
    severity: note
    category: proportionality
    summary: "Task count fits the slice"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md:52-364"
---

# Review: tasks — slice 271

**Verdict:** PASS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success criteria are fully traced to tasks

- **CLI/MCP byte parity:** task 8.3.
- **No-writes snapshot and unregistered directory:** task 7.2.
- **Non-git directory, monorepo subdirectory, relative paths, notice ordering:** task 6.2.
- **Failed source walk, planned vs unplanned:** task 6.3.
- **Each D5 code reachable with exit 1:** tasks 7.2 and 10.7. `worktree-of-registered-project` is in 10.7 because it applies only to `cf init`.
- **Prompt delivery:** task 11.6 covers absolute and relative paths, a missing path, a directory, `concept-phase-0` refused, `--raw`, and `--path` from an unrelated cwd.
- **`cf init`:** exit code in 10.4, `--json` and the shared envelope in 10.7, the codebase line in 10.9.
- **Onboarding surfaces and divergence test:** 12.1 and 12.2.
- **Deletion and ban guard:** 2.1 and 2.2.
- **Walkthrough steps 1–6 and 8:** 13.3. Step 7 is 13.4.

No task lacks a source in the design. The CHANGELOG task (13.1) comes from the design's Risk Assessment mitigation.

### [PASS] Sequencing and test-with pattern hold

No circular dependencies. Each group builds only on earlier ones:
- **Group 3:** `outcomeLine` comes first.
- **Group 4:** `readAdoptionArtifacts` and its shared path helper.
- **Groups 5 and 6:** the report types, then `detectProject`.
- **Groups 7 and 8:** the CLI, then MCP.
- **Group 9:** the log sinks, before `cf init` uses them in group 10.
- **Group 10:** the `cf init` steps are extracted as a pure move and committed (10.1–10.2) before behavior changes (10.3).
- **Groups 11 and 12:** prompt delivery, then the onboarding recipe that depends on `project_detect`.

Every implementation task is followed immediately by its tests, and a commit lands at the end of each group.

### [NOTE] `cf init --json` write point must move when the codebase line is added

Task 10.6 writes the D8 object "on completion" with `notices`. Task 10.9 later adds the `detectProject` notice into that same array. Detection must run before the JSON object is serialized, not after, or `--json` on a brownfield repo would print `notices: []`. The 10.9 test ("`--json` on brownfield has the line in `notices`") catches this. Say in 10.6 that the write happens after the detection call, so 10.9 doesn't have to restructure it.

### [NOTE] Walkthrough step 1 depends on a sibling repo that may not exist

Task 13.3 runs the design's step 1 against `~/source/repos/manta/squadron`. The task gives no instruction for when that checkout is absent. Add one line: if it is absent, record that and substitute another unregistered planned repo, or write `BLOCKED:` under the task. The task already does this for the `claude` CLI in 13.4.

### [NOTE] Live onboarding run depends on how the installed command reaches detection

Task 13.4 relies on the `cf` shim for the CLI path. Task 12.1 adds `project_detect` to `allowed-tools`, but whether `cf detect --json` via Bash is permitted in a non-interactive `claude -p` run depends on the command's frontmatter. The success line ("transcript shows the notice and a stop") is the right check. If the run fails only on permissions, the fix is to the recipe's `allowed-tools`. That is in this slice's code, so the 13.3 mismatch rule already covers it.

### [NOTE] Task 9.2 is the densest implementation task

Task 9.2 threads a sink through three actions and the helpers each calls, with three test files, in one commit at effort 2. This is acceptable because the change is mechanical. If `guidesInstallAction` reaches many `console.log` sites, split it into one sub-task per action, each with its own test run.

### [NOTE] Task count fits the slice

The slice is rated 3/5 and spans core, CLI, MCP and the recipe. A single task file with 13 groups is proportionate, and splitting it would add no value.

I found no test tasks beyond what the success criteria need. The parity test (8.3) overlaps partly with the JSON cases in 7.2, but it is the only check of byte identity, which the design requires. The design states no NFR, so no load-test or CI-gating task is required.

### Run Digest

- Response length: 5162 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 107864 / 11222 / 96638 / 5676 / not computed
- Duration: 48.7 s
- Cost: $0.45 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7

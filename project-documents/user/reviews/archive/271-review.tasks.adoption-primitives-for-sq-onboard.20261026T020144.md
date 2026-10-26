---
docType: review
layer: project
reviewType: tasks
slice: adoption-primitives-for-sq-onboard
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261025
dateUpdated: 20261025
reviewedSha: 8c5e71fc58868e1fc6ae3cbcbab554edf1bb6195
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 4
turns: 5
promptTokens: 202659
cachedTokens: 97830
cacheWriteTokens: 104823
completionTokens: 8295
durationSeconds: 64.0
costUsd: 0.512772
costBasis: provider
runId: run-20261026-p5-dc0b898a
squadronVersion: 0.24.5
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success-criteria coverage is complete"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md"
  - id: F002
    severity: concern
    category: completeness
    summary: "Behavior of `cf init --json` when the `register` step fails is undefined"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md:257-260"
  - id: F003
    severity: concern
    category: sequencing
    summary: "Commit checkpoints are batched in places"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md:110-170, 245-276"
  - id: F004
    severity: concern
    category: scope
    summary: "Task 10 is the heaviest unit and the split is uneven"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md:245-249"
  - id: F005
    severity: concern
    category: correctness
    summary: "Task 6.1 would duplicate `OVERRIDE_REMEDY` in the `source-unmeasurable` message"
    location: "packages/core/src/detection/sourceVolume.ts:45"
  - id: F006
    severity: concern
    category: correctness
    summary: "Walkthrough step 7 (task 13.4) does not carry the isolated data directory"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md:339-348"
  - id: F007
    severity: note
    category: sequencing
    summary: "`git status` precondition in 1.1 will fail on the current tree"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md:57"
  - id: F008
    severity: note
    category: granularity
    summary: "Tasks 9.2–9.4 are near-identical and could be one task"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md:224-237"
  - id: F009
    severity: note
    category: clarity
    summary: "A few task steps leave a detail open"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md:188, 211"
  - id: F010
    severity: note
    category: proportionality
    summary: "Prescriptive wording is mostly justified"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md:119-126"
---

# Review: tasks — slice 271

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success-criteria coverage is complete

Each criterion maps to a task:
- **CLI/MCP byte parity:** 8.3.
- **No-writes snapshot and the unregistered directory:** 7.2.
- **Non-git, monorepo and relative-path cases:** 6.2.
- **Every D5 code:** 6.3 for core and 7.2 for the CLI. `worktree-of-registered-project` is covered in 10.4.
- **Unmeasured source walk:** 6.3.
- **Prompt delivery criteria, including `--path` from an unrelated cwd:** 11.4.
- **`reportVersion` and envelope equality for init:** 10.4.
- **Exit 1 with and without `--json`:** 10.2 and 10.4.
- **Brownfield and greenfield init lines:** 10.5.
- **Onboarding surfaces:** 12.1 and 12.2.
- **Ban guard and deletion:** 2.1 and 2.2.

Every task traces back to a design decision (D1–D10). The only extra is the CHANGELOG task (13.1), which D8 calls for. The slice restates no NFR, so no load test or CI wiring task is needed.

### [CONCERN] Behavior of `cf init --json` when the `register` step fails is undefined

Task 10.3 requires `projectId`, `projectName` and `projectPath` in the D8 object. Task 10.1 says any caught step error becomes `failed` and that all steps still run. If `register` fails, there is no project id. The later steps (guides, commands, ide) also depend on a registered project. Neither the task nor D8 says what the JSON contains in that case.

A silent empty string would break the "no silent fallbacks" rule. Squadron parses this output, so decide before coding. One option: the `register` failure produces the D5 envelope with `internal`. Another: the id fields become nullable in the shape. Add the choice and a test case to 10.3 and 10.4.

### [CONCERN] Commit checkpoints are batched in places

Two batching problems:
- Tasks 4 and 5 (`readAdoptionArtifacts` and the report types, each with a test) have no commit. They fold into the single 6.4 commit, so three tasks land together. The project rule is a commit at least once per task.
- Task 10 has one commit (10.6) for six subtasks. That includes the largest refactor in the slice: moving every step out of `init.ts` into `initSteps.ts` and changing the exit code.

Add a commit after 4.2, after 5.2, and after 10.2 (`refactor: record init step results and exit 1 on failure`). Keep 10.6 for `--json` and the codebase line.

### [CONCERN] Task 10 is the heaviest unit and the split is uneven

Task 10.1 is rated effort 3. It moves all step functions, defines the step and status constants, adds a `LogSink` to every step, maps the status rules for `--lite`, `--no-ide` and copilot/cursor, and changes the exit code. A junior AI will likely struggle to finish it in one pass. Split it into two tasks:
- Extract `initSteps.ts` as a pure move, with unchanged behavior and tests.
- Add `StepResult` recording, the status rules and the exit code.

Also clarify where "`registration: existing`" is recorded. `StepResult` has only `step`, `status` and `message`, yet 10.3 puts `registration` at the top level.

### [CONCERN] Task 6.1 would duplicate `OVERRIDE_REMEDY` in the `source-unmeasurable` message

The `AdoptionError` that `measureSourceVolume` throws already ends with `OVERRIDE_REMEDY` (sourceVolume.ts:45 and :88). Task 6.1 says the `source-unmeasurable` message should carry "the walk's message and `OVERRIDE_REMEDY`". Doing both prints the remedy twice. The 6.3 assertion that the message contains `OVERRIDE_REMEDY` would still pass. Change 6.1 to reuse the walk's message as is, and keep 6.3's check that the remedy is present.

### [CONCERN] Walkthrough step 7 (task 13.4) does not carry the isolated data directory

Task 13.3 points `CONTEXT_FORGE_DATA_DIR` at a temp directory. Task 13.4 runs `claude -p "/cf:onboard"` through a `cf` shim with no such variable. Two consequences:
- The onboarding setup step would register `/tmp/cf271-bf` in the real project store.
- The registration from walkthrough step 3 lives in the temp store, so the design's "registered in step 3" assumption doesn't hold.

Have the shim export the same `CONTEXT_FORGE_DATA_DIR`.

### [NOTE] `git status` precondition in 1.1 will fail on the current tree

The tree has an uncommitted change to this task file (`M` in the session's git status). Task 1.1 requires an empty `git status --short` and says to stop otherwise. Planning artifacts commit directly to the target, so commit this file first (`docs:`) or the first task will stop.

### [NOTE] Tasks 9.2–9.4 are near-identical and could be one task

The three log-sink tasks use the same pattern: add an optional `log` parameter, replace `console.log`, and test with a capturing sink. 9.4 and 9.3 literally say "Same change". Merging them into one task with three sub-items cuts overhead without losing anything. This is optional, since the tasks are small.

### [NOTE] A few task steps leave a detail open

- **7.2:** "`internal` via a forced throw" doesn't say how to force a throw from the CLI. Mocking `detectProject` is the likely way, but the task should name it.
- **8.3:** the parity test depends on the built `packages/cli/dist/index.js`. Say that it must fail loudly, not skip, when `dist` is missing. That fits the "no silent fallbacks" rule and avoids a false pass under a bare `pnpm -r test`.

### [NOTE] Prescriptive wording is mostly justified

Items such as "one `JSON.stringify` call with fixed indentation" (5.1) and the exhaustive `switch` with a `never` default (3.1) are implementation detail. They are tied to byte parity and the project's existing convention, so I would leave them. One task file for a 3/5 slice is the right size. The test volume matches the success criteria, with no extra test tasks.

### Run Digest

- Response length: 7100 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 202659 / 97830 / 104823 / 8295 / not computed
- Duration: 64.0 s
- Cost: $0.51 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 10
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 10
- Finding-shaped matches — surviving validation: 10

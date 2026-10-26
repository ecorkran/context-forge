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
reviewedSha: 0eab291fe6ce9d6cfd686038c479219a115e10b4
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 4
turns: 5
promptTokens: 199272
cachedTokens: 100652
cacheWriteTokens: 98614
completionTokens: 4490
durationSeconds: 39.5
costUsd: 0.450169
costBasis: provider
runId: run-20261026-p5-dc0b898a
squadronVersion: 0.24.5
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success criteria coverage is complete"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md"
  - id: F002
    severity: pass
    category: sequencing
    summary: "Sequencing and dependencies are sound"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md"
  - id: F003
    severity: concern
    category: commit-checkpoints
    summary: "Task 11 batches four separable changes into one commit"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md:288-315"
  - id: F004
    severity: concern
    category: commit-checkpoints
    summary: "Task 10.9 bundles three test-bearing tasks into one commit"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md:264-284"
  - id: F005
    severity: concern
    category: task-sizing
    summary: "Task 9.2 is a three-part refactor with a vague carve-out"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md:230-235"
  - id: F006
    severity: concern
    category: proportionality
    summary: "Prescriptive detail the slice design doesn't require"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md:104-108"
  - id: F007
    severity: note
    category: test-design
    summary: "The ban-guard package-presence assertion names three packages, but the workspace has four"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md:78"
  - id: F008
    severity: note
    category: proportionality
    summary: "Task and test volume is high for a 3/5 slice but justified"
    location: "project-documents/user/tasks/271-tasks.adoption-primitives-for-sq-onboard.md"
---

# Review: tasks — slice 271

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success criteria coverage is complete

Every functional and technical criterion in the slice design maps to a task:
- **CLI/MCP byte parity:** 8.3.
- **No writes, still unregistered:** 7.2.
- **Unregistered directory, non-git directory, monorepo subdirectory, relative paths:** 6.2.
- **Each D5 error code produced by a test:**
  - Five codes through the CLI in 7.2, with 6.3 covering them in core.
  - `worktree-of-registered-project` in 10.7.
- **Planned vs. unplanned unmeasured source walk:** 6.3.
- **Prompt delivery, including the `--path` case from an unrelated cwd:** 11.4.
- **`cf init --json` pure stdout, `reportVersion`, and exit 1 with and without `--json`:** 10.4 and 10.7.
- **Brownfield and greenfield init lines:** 10.8.
- **Onboarding surfaces and the divergence test:** 12.1 and 12.2.
- **Ban guard and deletions:** 2.1 and 2.2.
- **Verification Walkthrough steps 1–8:** 13.3 and 13.4.

Every task traces back to a design decision. The CHANGELOG entry in 13.1 supports D8's stated requirement that the exit-code change be recorded.

### [PASS] Sequencing and dependencies are sound

Each task builds only on earlier ones.
- `outcomeLine` (3) comes before `detectProject` (6), which uses it.
- `readAdoptionArtifacts` and its path helper (4) come before `detectProject` and `renderAdoptionInputs`.
- The log sinks (9) come before the `cf init` step work (10).
- 10.8 calls `detectProject`, which exists from task 6.
- The recipe change (12) comes after `cf detect` and `project_detect` exist.
- Validation is last.

Tests follow their implementation tasks throughout. The `COMPREHENSION_PROFILE_VARIABLE` deleted in 2.1 is reintroduced in 11.2, and the task text explains why. Nothing is circular.

### [CONCERN] Task 11 batches four separable changes into one commit

Tasks 11.1–11.4 cover four pieces of work:
- the `findProjectByCwd` signature change and `--path`;
- `renderAdoptionInputs` in core;
- `--comprehension` with profile gating and path checks;
- their tests.

All of it lands in the single commit at 11.5. By contrast, task 10 commits three times. 11.1 (`--path`, `findProjectByCwd`) is independent of the rest and already has its own tests, so it can be committed alone. 11.2 is a core-only change with its own test. Add a commit after 11.1 and another after 11.2. A failure in 11.3 or 11.4 would then not force the earlier work into a larger revert or rework.

### [CONCERN] Task 10.9 bundles three test-bearing tasks into one commit

10.6 (`--json` mode), 10.7 (its tests) and 10.8 (the codebase line and its tests) share one commit. 10.8 is independent of `--json`; it is the D9 line. Commit after 10.7, with a `feat: add cf init --json` message, and commit 10.8 separately. The message on 10.9 already names both features, which suggests they were meant to be separate commits.

### [CONCERN] Task 9.2 is a three-part refactor with a vague carve-out

9.2 threads a sink through three actions in three files, and each action gets its own test. One item reads "leave `uninstallCommandsAction` unchanged unless it shares the logging helper". A junior implementer cannot resolve that without reading the code, and the ambiguity could widen the change. Either split it into 9.2a, 9.2b and 9.2c, or fold it into one task with one explicit rule. The rule could be: if the install action's logging helper is shared with uninstall, thread the sink through the helper and leave uninstall's call sites defaulting to `STDOUT_SINK`.

### [CONCERN] Prescriptive detail the slice design doesn't require

Some steps dictate implementation the design leaves open.
- **4.1** names a helper `toReportPath(root, absPath)` ("e.g."). What the design requires is a single shared conversion to root-relative paths with `/` separators, and the task already states that.
- **6.1** specifies a "helper module if it grows past that" and an optional measurer parameter on `detectProject`.
- **11.2** says "pick one and assert it" about list formatting.

These are low-risk, but they add decision points for a junior implementer. Keep the requirement (one shared path conversion, as D3 requires) and drop the suggested names and parameter shapes. Leave file organization to the ~300-line rule already in the Context Summary.

### [NOTE] The ban-guard package-presence assertion names three packages, but the workspace has four

2.2 asserts the scan visited a file in `core`, `cli` and `mcp-server`. `packages/context-forge` also exists, and the `packages/*/src` glob will include it if it has a `src` directory. That is harmless: the scan covers it, and the assertion only needs to prove the root is right. But the implementer should know that package is scanned too, so a finding there isn't a surprise.

### [NOTE] Task and test volume is high for a 3/5 slice but justified

The file has 13 task groups and about 45 subtasks in a single task file, for an effort 3/5 slice. The design's own scope (detection, MCP, init, prompt, onboarding, deletion) is broad, and the cross-repo contract justifies the test density. Each test traces to a stated criterion. The CLI-level re-tests of error codes in 7.2 overlap with 6.3 at the core level. They are needed, because the criterion requires the JSON object and exit 1 from the CLI. I'd keep this as one file.

### Run Digest

- Response length: 6574 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 199272 / 100652 / 98614 / 4490 / not computed
- Duration: 39.5 s
- Cost: $0.45 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 8
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 8
- Finding-shaped matches — surviving validation: 8

---
docType: review
layer: project
reviewType: tasks
slice: tarball-guide-update-preview-exclude-fixes-version-pinning
project: context-forge
verdict: CONCERNS
verdictSource: derived
sourceDocument: project-documents/user/tasks/931-tasks.tarball-guide-update-preview-exclude-fixes-version-pinning.md
aiModel: deepseek/deepseek-v4.1-flash
status: complete
dateCreated: 20261006
dateUpdated: 20261006
reviewedSha: 8a284ec6ceb793ac5767fb05446f081867241bf1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 1
turns: 2
promptTokens: 22186
cachedTokens: 4864
completionTokens: 4503
reasoningTokens: 3288
durationSeconds: 17.3
runId: run-20261007-p5-234fc799
squadronVersion: 0.19.0
findings:
  - id: F001
    severity: concern
    category: test-coverage
    summary: "Local-marker status and \"later update → latest remote\" behavior has no automated test"
    location: "project-documents/user/tasks/931-tasks.tarball-guide-update-preview-exclude-fixes-version-pinning.md"
  - id: F002
    severity: note
    category: process-consistency
    summary: "Task 11 folds its test into the implementation task, breaking the test-with pattern"
    location: "project-documents/user/tasks/931-tasks.tarball-guide-update-preview-exclude-fixes-version-pinning.md"
  - id: F003
    severity: note
    category: task-scoping
    summary: "Task 4 bundles several distinct concerns at effort 4"
    location: "project-documents/user/tasks/931-tasks.tarball-guide-update-preview-exclude-fixes-version-pinning.md"
  - id: F004
    severity: pass
    category: traceability
    summary: "All functional success criteria trace to tasks"
    location: "project-documents/user/tasks/931-tasks.tarball-guide-update-preview-exclude-fixes-version-pinning.md"
---

# Review: tasks — slice 931

**Verdict:** CONCERNS
**Model:** deepseek/deepseek-v4.1-flash

## Findings

### [CONCERN] Local-marker status and "later update → latest remote" behavior has no automated test

The slice design lists two Integration Requirements as success criteria: "`cf guides info` reports a `local` version unchanged (displayed as-is), and reports an update as available" and "A later plain update moves to the latest remote release." The breakdown defines `LOCAL_VERSION_MARKER` (Task 3) and implements "short-circuit remote sources only" (Task 4), but no task adds a unit/strategy test asserting that (a) the `local` marker compares unequal to a remote tag so status reports an update available, and (b) a plain (non-`--source`) update after a local install proceeds to the latest release rather than short-circuiting. The only coverage is the manual Verification Walkthrough in Task 15 step 4, and Task 15 explicitly permits reporting network-dependent steps as "not run." Both behaviors are offline-unit-testable at the `resolveTarballSource` / marker-comparison level, so a small test task should be added (e.g., extend Task 4T or 9T).

### [NOTE] Task 11 folds its test into the implementation task, breaking the test-with pattern

Every other implementation task in this breakdown is immediately followed by a dedicated `Task XT` test task (1T, 3T, 4T, 5T, 6T, 7T, 8T, 9T, 10T, 12T, 13T). Task 11 (MCP preview in result, effort 1) instead bundles "Add MCP test in `guideTools.test.ts`" into the task body with no separate `11T`. This is defensible for a one-point task, but it is an inconsistency worth noting; if the reviewer wants strict uniformity, either promote the MCP assertions into Task 7T's surface or add a `Task 11T`.

### [NOTE] Task 4 bundles several distinct concerns at effort 4

Task 4 combines four separable changes: (1) new core types (`TarballUpdateOptions`, `GuidePreview`, `UpdateResult` fields), (2) rewiring `install`/`update`/`extractAndSwap` to the resolved source, (3) the error-wrapping of the pipeline, and (4) the multi-top-level extraction guard (D5). Each is independently testable and has its own failure mode in the design's Failure modes table. It is declared at effort 4, so it is within bounds, but splitting the D5 multi-top-level guard into its own task (with its own test in `tarballStrategyLocal.test.ts`) would tighten the success criteria per task and make the failure-mode coverage more explicit.

### [PASS] All functional success criteria trace to tasks

Cross-referencing the slice-design Functional Requirements: preview/confirm/decline (Tasks 9, 9T, 10, 10T), `--yes` skipping both prompts (Task 10, 10T), MCP no-ask with preview (Task 11), zero-diff unchanged (Task 9, 10), `guide.exclude` carve-out success/refusal with exact D1 messages (Task 12, 12T), re-extract commit incl. `.context-forge.toml` plus the mixed-diff notice (Task 13, 13T), `--version` pin and tag-not-found naming newest (Tasks 3, 3T, 5, 6, 7), local `--source` recording `local` and rejecting `--version` combination (Tasks 3, 4, 5), and the tarball-only error for submodule/clone (Task 5, 5T). No orphaned success criterion and no task that lacks a design anchor.

### Run Digest

- Response length: 4344 chars
- Response is newline-free: no
- Tool calls made: 1
- Tool calls failed: 0
- Stop reason: stop
- Output budget: 384000 tokens
- System prompt: custom
- Settings sources: n/a (non-SDK)
- Reasoning characters: 13210
- Effort: backend default
- Turns: 2
- Tokens — prompt / cached / completion / reasoning: 22186 / 4864 / 4503 / 3288
- Duration: 17.3 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 4
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 4
- Finding-shaped matches — surviving validation: 4

### Raw Response

## Summary

The task breakdown is broadly complete and well-structured. Every major success criterion in the slice design (preview/confirm, `--yes`, MCP preview, unchanged path, `guide.exclude` carve-out, D3 config commit, `--version`, local `--source`, tarball-only error) traces to at least one task, and test tasks (`Task XT`) follow their implementations with commit checkpoints (`X C`) distributed across all six parts. Sequencing respects dependencies (extraction → source resolution → strategy wiring → diff → preview flow → exclude fixes → config commit → docs). One integration success criterion is only covered by a network-gated manual walkthrough, which is worth flagging.

## Findings

### [CONCERN] Local-marker status and "later update → latest remote" behavior has no automated test
category: test-coverage
location: project-documents/user/tasks/931-tasks.tarball-guide-update-preview-exclude-fixes-version-pinning.md
The slice design lists two Integration Requirements as success criteria: "`cf guides info` reports a `local` version unchanged (displayed as-is), and reports an update as available" and "A later plain update moves to the latest remote release." The breakdown defines `LOCAL_VERSION_MARKER` (Task 3) and implements "short-circuit remote sources only" (Task 4), but no task adds a unit/strategy test asserting that (a) the `local` marker compares unequal to a remote tag so status reports an update available, and (b) a plain (non-`--source`) update after a local install proceeds to the latest release rather than short-circuiting. The only coverage is the manual Verification Walkthrough in Task 15 step 4, and Task 15 explicitly permits reporting network-dependent steps as "not run." Both behaviors are offline-unit-testable at the `resolveTarballSource` / marker-comparison level, so a small test task should be added (e.g., extend Task 4T or 9T).

### [NOTE] Task 11 folds its test into the implementation task, breaking the test-with pattern
category: process-consistency
location: project-documents/user/tasks/931-tasks.tarball-guide-update-preview-exclude-fixes-version-pinning.md
Every other implementation task in this breakdown is immediately followed by a dedicated `Task XT` test task (1T, 3T, 4T, 5T, 6T, 7T, 8T, 9T, 10T, 12T, 13T). Task 11 (MCP preview in result, effort 1) instead bundles "Add MCP test in `guideTools.test.ts`" into the task body with no separate `11T`. This is defensible for a one-point task, but it is an inconsistency worth noting; if the reviewer wants strict uniformity, either promote the MCP assertions into Task 7T's surface or add a `Task 11T`.

### [NOTE] Task 4 bundles several distinct concerns at effort 4
category: task-scoping
location: project-documents/user/tasks/931-tasks.tarball-guide-update-preview-exclude-fixes-version-pinning.md
Task 4 combines four separable changes: (1) new core types (`TarballUpdateOptions`, `GuidePreview`, `UpdateResult` fields), (2) rewiring `install`/`update`/`extractAndSwap` to the resolved source, (3) the error-wrapping of the pipeline, and (4) the multi-top-level extraction guard (D5). Each is independently testable and has its own failure mode in the design's Failure modes table. It is declared at effort 4, so it is within bounds, but splitting the D5 multi-top-level guard into its own task (with its own test in `tarballStrategyLocal.test.ts`) would tighten the success criteria per task and make the failure-mode coverage more explicit.

### [PASS] All functional success criteria trace to tasks
category: traceability
location: project-documents/user/tasks/931-tasks.tarball-guide-update-preview-exclude-fixes-version-pinning.md
Cross-referencing the slice-design Functional Requirements: preview/confirm/decline (Tasks 9, 9T, 10, 10T), `--yes` skipping both prompts (Task 10, 10T), MCP no-ask with preview (Task 11), zero-diff unchanged (Task 9, 10), `guide.exclude` carve-out success/refusal with exact D1 messages (Task 12, 12T), re-extract commit incl. `.context-forge.toml` plus the mixed-diff notice (Task 13, 13T), `--version` pin and tag-not-found naming newest (Tasks 3, 3T, 5, 6, 7), local `--source` recording `local` and rejecting `--version` combination (Tasks 3, 4, 5), and the tarball-only error for submodule/clone (Task 5, 5T). No orphaned success criterion and no task that lacks a design anchor.

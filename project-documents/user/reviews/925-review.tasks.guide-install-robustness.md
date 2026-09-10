---
docType: review
layer: project
reviewType: tasks
slice: guide-install-robustness
project: context-forge
verdict: CONCERNS
sourceDocument: project-documents/user/tasks/925-tasks.guide-install-robustness.md
aiModel: z-ai/glm-5.2
status: complete
dateCreated: 20260909
dateUpdated: 20260909
reviewedSha: 25ef4d74abbbeb37a5587fab649a0f42d2ee165f
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 13
findings:
  - id: F001
    severity: concern
    category: test-coverage
    summary: "MCP prompt_list / prompt_get auto-init is wired but not tested"
    location: "unverified"
  - id: F002
    severity: note
    category: test-coverage
    summary: "Config-sourced deprecation warning at the CLI has no dedicated CLI-level test"
    location: "unverified"
  - id: F003
    severity: note
    category: test-with-pattern
    summary: "Task 25 help-descriptor implementation is tested two tasks later"
    location: "unverified"
  - id: F004
    severity: pass
    category: commit-discipline
    summary: "Commit checkpoints are distributed throughout, not batched at the end"
    location: "unverified"
  - id: F005
    severity: pass
    category: sequencing
    summary: "Task sequencing respects dependencies with no circular dependencies"
    location: "unverified"
  - id: F006
    severity: pass
    category: test-with-pattern
    summary: "Test-with pattern is followed for the core implementation tasks"
    location: "unverified"
---

# Review: tasks — slice 925

**Verdict:** CONCERNS
**Model:** z-ai/glm-5.2

## Findings

### [CONCERN] MCP prompt_list / prompt_get auto-init is wired but not tested

Task 22 instructs wiring `ensureCheckout()` before `createContextPipeline` (~contextTools.ts:57) and `resolvePromptFilePath` (~contextTools.ts:98) for `context_build`, `prompt_list`, and `prompt_get`. Task 23, the paired test task, only asserts `context_build` on `cloned()` returns a `notices` entry and on `initialized()` returns none. The `prompt_list` and `prompt_get` paths — which go through the same `resolvePromptFilePath` call site — receive no test assertion. The slice's Technical Scope says "Tests for each of the above," and the data-flow diagram lists `prompt_*` as callers of `ensureCheckout()`. Either Task 23 should add one `cloned()` assertion for a prompt tool (reusing the same fixture), or Task 22 should note that `resolvePromptFilePath` is shared so the `context_build` test is deemed to cover it. As written, two of three wired call sites are unverified by tests.

### [NOTE] Config-sourced deprecation warning at the CLI has no dedicated CLI-level test

Task 5 introduces a return shape (e.g. `{ method, deprecatedAlias? }`) so `guidesInstallAction()` can print the config-path deprecation warning (Task 7, second bullet). The only test covering the config-alias path is Task 6(b) in `GuideManager.test.ts`, which asserts `TarballStrategy` is selected and "the alias is reported" at the core level. There is no CLI-level test asserting that `cf guides install` (with `guide.git_strategy: manual` in config) actually prints the deprecation line to stderr. Task 8's CLI test covers the `--strategy manual` *flag* path, not the config-sourced path. The core logic is covered, so this is not blocking, but the end-to-end CLI warning for the config case is unverified.

### [NOTE] Task 25 help-descriptor implementation is tested two tasks later

Task 25 implements `GUIDE_STRATEGIES` and `strategyHelpText()` for `cf guides install --strategy`, with a success criterion about `cf guides install --help` output. Its test lives in Task 27 (after Task 26 wires `cf init --strategy`). This is a minor deviation from the strict test-immediately-after-implementation pattern; it is pragmatic because Tasks 25–26 are a tightly coupled `--strategy` pair and Task 27 tests both help outputs together. No action required, but worth noting the pattern is relaxed here.

### [PASS] Commit checkpoints are distributed throughout, not batched at the end

Explicit commit instructions appear at Tasks 4, 6, 8, 12, 14, 16, 18, 21, 23, 24, 27, 29, 31, with a final commit in Task 32. Checkpoints are interleaved with implementation rather than deferred to a single end-of-slice commit, matching the guidance.

### [PASS] Task sequencing respects dependencies with no circular dependencies

The five parts follow the design's suggested order: rename/normalize (1–8) → detection/init primitives (9–18) → call sites (19–24) → `cf init --strategy`/help (25–27) → notice/docs (28–32). Within parts, dependencies are correct: Task 3 depends on 1; Task 5 on 1; Task 7 on 5's return shape; Task 11 on 10; Task 15 on 13; Task 17 on 11 and 15; Task 20 on 19; Task 21 on 9 and 20; Task 26 on 25; Task 27 on 26. No task references a later task as a prerequisite.

### [PASS] Test-with pattern is followed for the core implementation tasks

Every primary implementation task has a paired test task immediately following: 1→2, 3→4, 5→6, 7→8, 11→12, 13→14, 15→16, 17→18, 20→21, 22→23, 28→29. Task sizes are appropriate (effort 1–3), with the largest (Task 9 fixture, Task 17 ensureCheckout, Task 21 CLI tests) being cohesive single-concern units rather than bundles that should be split. No task is so granular it should be merged.

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
reviewedSha: 851c48707300960b5d88ca25bf88c5bf569fa949
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 39
turns: 20
promptTokens: 831429
cachedTokens: 676736
completionTokens: 65658
reasoningTokens: 60775
durationSeconds: 209.6
runId: run-20261007-p5-ca66f7b8
squadronVersion: 0.21.0
findings:
  - id: F001
    severity: concern
    category: testability
    summary: "Warn-once module state has no specified reset path, but Task 3T requires resetting it"
    location: "packages/core/src/storage/FileProjectStore.ts#getAll"
  - id: F002
    severity: concern
    category: performance
    summary: "Slice restates a cost NFR, but no load/perf task or CI gate is added (and none exists)"
    location: "project-documents/user/tasks/934-tasks.stable-default-worktree-marker.md"
  - id: F003
    severity: note
    category: requirements-coverage
    summary: "Read-only `projects.json` criterion is covered only at the store level, not through the commands it names"
    location: "packages/core/tests/storage/FileProjectStore.test.ts:81"
  - id: F004
    severity: note
    category: test-maintenance
    summary: "Name-keyed test helper and a now-obsolete name-matching test survive the sweep"
    location: "packages/core/tests/services/WorktreeService.test.ts#defaultRange"
  - id: F005
    severity: note
    category: task-clarity
    summary: "Task 6T leaves the asserted outcome of the MCP `isDefault`-injection test runtime-dependent"
    location: "packages/mcp-server/tests/worktreeTools.test.ts:580"
  - id: F006
    severity: pass
    category: requirements-coverage
    summary: "Every functional success criterion and Technical Requirement maps to a task"
    location: "project-documents/user/tasks/934-tasks.stable-default-worktree-marker.md"
  - id: F007
    severity: pass
    category: sequencing
    summary: "Sequencing, dependencies and test-with pairing are correct, and commits are distributed"
    location: "project-documents/user/tasks/934-tasks.stable-default-worktree-marker.md"
---

# Review: tasks — slice 934

**Verdict:** CONCERNS
**Model:** deepseek/deepseek-v4.1-flash

## Findings

### [CONCERN] Warn-once module state has no specified reset path, but Task 3T requires resetting it

Task 3 specifies `getAll()` prints each warning "at most once per process, using a module-level set of printed warning strings". Task 3T then requires: "Repeated `getAll()` calls print each warning once (spy on `console.warn`); reset the module-level set between tests." The set is module-private to `FileProjectStore.ts` (verified: the file has no exported test hook today), so the task gives the implementer no way to satisfy its own test step short of `vi.resetModules()` plus a fresh dynamic import — and the current test file (`packages/core/tests/storage/FileProjectStore.test.ts`) constructs `new FileProjectStore()` statically after setting `process.env.CONTEXT_FORGE_DATA_DIR` in `beforeEach`, so the reset strategy interacts with env setup. Worse, without an explicit reset the once-per-process dedup will make a later warning test silently pass-for-the-wrong-reason because an earlier test already printed the same string. Either Task 3 should name the mechanism (e.g. an exported `resetPrintedWarningsForTests()` or an explicit `vi.resetModules()` recipe in Task 3T), or Task 3 should scope the dedup per store instance.

### [CONCERN] Slice restates a cost NFR, but no load/perf task or CI gate is added (and none exists)

The slice's Special Considerations carry a "Cost" NFR paragraph ("The migration is one in-memory pass over the projects on each `getAll()`... No measurable startup cost is expected"), and a review finding (F007 NFRs) was resolved by adding exactly that note. The task file's Context Summary explicitly declines a load-test task on the grounds that "the 900 architecture sets no latency targets for these paths" — a defensible reading, and I verified there is no `tests/load/` directory anywhere in the repo (two searches, both empty), so there is nothing to wire into CI. However, the criterion "a load test task exists in `tests/load/` covering that NFR (or this task breakdown adds one)" is therefore unmet, and the once-per-`getAll()` pass is on the hot read path of every CLI/MCP command. Recommend either adding a small bounded sanity task (e.g. asserting `getAll()` over a large synthetic `projects.json` stays within a fixed budget, wired as a normal test) or recording in the task list that no gate is intended and why, so the omission is explicit rather than implicit.

### [NOTE] Read-only `projects.json` criterion is covered only at the store level, not through the commands it names

The success criterion reads: "With a read-only `projects.json`, read-only commands (`cf worktree list`, `cf check`, MCP `worktree_list`) work after upgrade and see migrated data. Commands that write fail as they do today." Task 3T covers the mechanism (`chmod` + `getAll()` returns migrated data without error), which is a reasonable proxy since those commands all read through `getAll()`. But no task exercises the named commands under a read-only data dir, and the Verification Walkthrough (Task 9, steps 1–7) never does a read-only run either. Consider adding a read-only line to the walkthrough rather than new automated tests.

### [NOTE] Name-keyed test helper and a now-obsolete name-matching test survive the sweep

Task 4T instructs updating "existing `WorktreeService.test.ts` cases that seed a default by name and expect chop or restore to seed `isDefault: true`", which covers the ~15 seeding sites in the `chopDefaultRange`, `rangeOverride`, and `restore default range (#76)` blocks. Two things fall outside that instruction and outside Task 8's sweep, which greps for `name: ['\"]default['\"]`: (a) the local helper `defaultRange()` in that file locates the default with `w.name.toLowerCase() === 'default'`, so the grep will not find it; and (b) the case `'matches the default by name case-insensitively, as the chop does'` asserts the exact behavior this slice removes — after the change its name and comment are false, and it duplicates the new "a worktree named `Default` with `isDefault: false` is not chopped" case. Fold both into Task 4T explicitly.

### [NOTE] Task 6T leaves the asserted outcome of the MCP `isDefault`-injection test runtime-dependent

Task 6T says: "Assert the call does not error and that the `updates` object passed to `mockUpdateWorktree` (third argument) has no `isDefault` key" and then adds "If the SDK rejects the unknown key instead of stripping it, assert that outcome and note it in the design walkthrough step 5." The primary assertion is well-aimed against the real risk I verified at `packages/mcp-server/src/tools/worktreeTools.ts:230-241` (the handler copies every argument key; only the zod schema keeps `isDefault` out), but the fallback branch leaves a junior executor to pick a passing assertion post hoc. Since zod object schemas strip unknown keys by default, state the expected outcome as the primary assertion and keep the alternative as a diagnostic note instead of a conditional success path.

### [PASS] Every functional success criterion and Technical Requirement maps to a task

Cross-referencing the slice's Success Criteria against the task list: `Default` never chopped (Task 4T); rename keeps chop/restore (4T); `init --name default` → `isDefault: false` (4T, with an explicit justification for skipping a CLI test at 5T); first-read migration + no write on read + next write saves for every project (3T); post-removal rename inert across a process restart (3T "fresh store instance" case); ambiguous candidates → all `false` + warn with names, ids and recovery step (2T, 3T); no-candidate-at-project-path → warn; no-candidate-silent → 2T "(silent)"; duplicate marker → add/range-update/remove fail, list/json/`worktree_list`/`worktree_get`/`cf check` and non-range updates keep working (4T, 5T); `isDefault` not settable through service, CLI or MCP update (4T, 6T); `rm` prints the current name (5, 5T). Technical Requirements are likewise covered: all eight `markLegacyDefaultWorktree` cases (2T), all four `FileProjectStore` cases (3T), the `'default'`-comparison sweep (Task 8, whose regex is deliberately broader than the design's `grep -rn "'default'"` and classifies the literal-comment hits the narrower pattern would miss), and the `storage/`→`services/` import ban (Tasks 3 and 8). No task traces to something the design does not authorize — the `(default)` list tag, the `defaultWorktree` result field and the `propagationTargets` regression case are each justified in the slice (Overview; API Contracts; Integration Requirements).

### [PASS] Sequencing, dependencies and test-with pairing are correct, and commits are distributed

The critical ordering the design calls out is honored: the store's read-time migration (Task 3) lands before `WorktreeService` starts reading the flag (Task 4), so no intermediate commit reads legacy data with no `isDefault`. Dependencies run strictly forward (1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9) with no cycles; Task 5 consumes the `defaultWorktree` result field added in Task 4, and Task 6T consumes Task 6's description edits. Every implementation task up to the description-text change has an immediate test counterpart (2/2T, 3/3T, 4/4T, 5/5T, 6/6T); Task 1 is type-only with tests folded into 4T, which is where the type change is observable, and the CLI/MCP test tasks correctly do not attempt to seed defaults they cannot reach through their `WorktreeService` mocks. Commit checkpoints appear at Tasks 2C, 3C, 4C, 6C, 7C and 9 rather than batched at the end (Task 5's CLI edits riding in 6C is the only merged checkpoint, and its message could mention the `rm` note rename). Task 9 correctly stops before Phase 7 and writes no merge step, per the project's git rules.

### Run Digest

- Response length: 9237 chars
- Response is newline-free: no
- Tool calls made: 39
- Tool calls failed: 1
- Stop reason: stop
- Output budget: 384000 tokens
- System prompt: custom
- Settings sources: n/a (non-SDK)
- Reasoning characters: 244714
- Effort: backend default
- Turns: 20
- Tokens — prompt / cached / completion / reasoning: 831429 / 676736 / 65658 / 60775
- Duration: 209.6 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7

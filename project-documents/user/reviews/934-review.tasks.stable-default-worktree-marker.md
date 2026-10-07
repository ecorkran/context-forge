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
reviewedSha: e95a751b365c7ba774975237e1540fa0e0a7a954
revision_number: 2
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 38
turns: 20
promptTokens: 1047285
cachedTokens: 798336
completionTokens: 72701
reasoningTokens: 67568
durationSeconds: 247.5
runId: run-20261007-p5-ca66f7b8
squadronVersion: 0.21.0
findings:
  - id: F001
    severity: concern
    category: correctness
    summary: "`findDefaultWorktree(worktrees)` has no exclusion parameter, but `chopDefaultRange` requires one"
    location: "packages/core/src/services/WorktreeService.ts:362"
  - id: F002
    severity: concern
    category: test-coverage
    summary: "Read-only `projects.json` criterion has no automated coverage for `cf check` or MCP `worktree_list`"
    location: "project-documents/user/tasks/934-tasks.stable-default-worktree-marker.md"
  - id: F003
    severity: note
    category: test-quality
    summary: "Task 7's added assertions cannot fail"
    location: "packages/cli/tests/commands/worktreePropagation.test.ts:354-378"
  - id: F004
    severity: note
    category: test-coverage
    summary: "Duplicate-marker \"diagnostic paths keep working\" is only partly covered"
    location: "packages/core/tests/services/WorktreeService.test.ts"
  - id: F005
    severity: note
    category: test-coverage
    summary: "Recovery-sentence text (with the `projects.json` path) is never asserted"
    location: "project-documents/user/tasks/934-tasks.stable-default-worktree-marker.md"
  - id: F006
    severity: note
    category: process
    summary: "Task 8 duplicates Task 3's dependency-direction check"
    location: "project-documents/user/tasks/934-tasks.stable-default-worktree-marker.md"
  - id: F007
    severity: note
    category: task-sizing
    summary: "Task 9 bundles several unrelated deliverables"
    location: "project-documents/user/tasks/934-tasks.stable-default-worktree-marker.md"
  - id: F008
    severity: note
    category: documentation
    summary: "`mergeCheckResults.ts` prose about the \"default\" name is unassigned"
    location: "packages/core/src/introspection/mergeCheckResults.ts:21-25"
  - id: F009
    severity: pass
    category: non-functional-requirements
    summary: "NFR / load-test and CI-gating expectations are correctly scoped"
    location: ".github/workflows/ci.yml"
---

# Review: tasks — slice 934

**Verdict:** CONCERNS
**Model:** deepseek/deepseek-v4.1-flash

## Findings

### [CONCERN] `findDefaultWorktree(worktrees)` has no exclusion parameter, but `chopDefaultRange` requires one

Task 2 specifies `findDefaultWorktree(worktrees)` as "the one worktree with `isDefault === true`, or `undefined`. Throws if more than one" — no `excludeId`, no filtering hook. Task 4 then says "`chopDefaultRange` and `restoreDefaultRange` locate the default through `findDefaultWorktree` instead of `findIndex(isDefaultWorktree)`. Range rules are unchanged."

Those two instructions cannot both be honored. The current chop site is:

```ts
const defaultWt = worktrees.find(
  (wt) => isDefaultWorktree(wt) && wt.id !== excludeId,
);
```

The `wt.id !== excludeId` guard is what prevents an `updateWorktree` that changes the *default's own* range from chopping the default against itself. Substituting a bare `findDefaultWorktree(worktrees)` removes that guard: with `newRange === defaultWt.indexRange`, the overlap test passes, `lowerValid`/`upperValid` are both false, `candidate` stays `null`, and the code falls into the "new range covers entire default" branch — which either throws an artifact-collision error or assigns the `[0, 0]` sentinel and returns "Default worktree has no remaining index range." That is a destructive behavior change, whereas Task 4 asserts "Range rules are unchanged." `restoreDefaultRange` has the analogous self-case, currently handled by the separate `isDefaultWorktree(removed)` check at `WorktreeService.ts:326`.

Fix the task text: either give the utility an exclusion parameter (e.g. `findDefaultWorktree(worktrees, excludeId?)`, documented as "the marked worktree, excluding `excludeId`"), or state explicitly in Task 4 that the caller filters before the call and how duplicate detection interacts with that filter (filtering can mask a genuine two-markers case, which is the error the design wants surfaced). Also make explicit whether a range-changing update with `rangeOverride: true` still triggers the duplicate-marker error — with the current control flow the override branch skips chop entirely, so `findDefaultWorktree` is never called and no error is raised.

### [CONCERN] Read-only `projects.json` criterion has no automated coverage for `cf check` or MCP `worktree_list`

Slice Success Criterion: "With a read-only `projects.json`, read-only commands (`cf worktree list`, `cf check`, MCP `worktree_list`) work after upgrade and see migrated data." Three consumers are named.

Task 3T automates only one path — a real `FileProjectStore` + real `WorktreeService` over a chmod'd file calling `listWorktrees` — and Task 6T explicitly declines an MCP `worktree_list` test ("with the service mocked it only echoes the fixture and proves nothing"). `cli/tests/commands/check-worktree-attribution.test.ts` replaces `FileProjectStore` with a stub class exposing `mockGetAll`/`mockGetById` (lines 25–38), so no migration runs in the `cf check` attribution tests either, and Task 7 only adds an `isDefault: true` field to those fixtures. That leaves `cf check` and MCP `worktree_list` under a read-only file verified only by Task 9's manual walkthrough (which covers `cfl worktree list --json` and `cfl check`, but not the MCP tool).

The mechanism is shared, so this is a coverage gap rather than a defect — but two of the three commands the criterion names have no automated proof, and one has none at all. Either widen Task 3T's command-path case to drive the attribution/merge path over the read-only file, or add a line to Task 9's manual step covering MCP `worktree_list` under a read-only `projects.json` so all three named surfaces are exercised somewhere.

### [NOTE] Task 7's added assertions cannot fail

Task 7 adds `isDefault: true` to fixtures and one new `propagationTargets` case, then requires "Leave every assertion unchanged." `propagationTargets` filters on `wt.worktreePath && fs.existsSync(...) && path.resolve(...) !== resolvedRootPath` (`packages/cli/src/commands/worktreePropagation.ts:190-193`); it never reads `isDefault`. The fixtures are stubbed stores in the CLI tests, so the migration never runs there either. The new "root-path worktree marked `isDefault: true` and a sibling marked `false`" case therefore passes identically if the field is absent, `false`, or omitted — it is a non-discriminating test. The existing case at line 354 already pins the root-path-skip behavior. This is harmless, but it should not be counted as proof that the integration requirement holds; consider asserting on the service/store level (real `FileProjectStore`, duplicate markers present) if the intent is to show `isDefault` does not leak into propagation.

### [NOTE] Duplicate-marker "diagnostic paths keep working" is only partly covered

The slice promises that with two marked worktrees, "`cf worktree list` (table and `--json`), `worktree_list`, `worktree_get`, `cf check`, and updates that don't change a range still work." Task 4T asserts only the throwing paths plus "a non-range update still succeeds"; Task 8's walkthrough step 7 checks `cfl worktree list` shows both rows tagged. `worktree_get`, MCP `worktree_list`, and `cf check` under duplicate markers are not asserted anywhere. Task 5T covers the `list` tag for two marked rows, which is the closest automated proof. Consider adding `worktree_get` to the Task 4T/5T duplicate-marker case or naming the omission.

### [NOTE] Recovery-sentence text (with the `projects.json` path) is never asserted

The design's Migration rule pins exact warning copy: both warnings must end with `Range narrowing and restore are off for this project. To turn them on, set "isDefault": true on the intended worktree in <full projects.json path>.` Task 2T asserts that warnings name the project and candidates by name and id, and Task 3T asserts warn-once/stderr routing, but no task asserts the recovery sentence or that the injected path appears in it. Since the treatable failure mode is "user can't find the fix," one assertion on the shared suffix and the path would close it.

### [NOTE] Task 8 duplicates Task 3's dependency-direction check

Task 3 already includes "Confirm `packages/core/src/storage/` has no import from `services/`", and Task 8 repeats it (`grep -rn "services" packages/core/src/storage`). Not harmful as a final sweep, but the duplicate means a failure could be reported twice; keeping it only in the sweeping task (or only at the point of change) would be cleaner.

### [NOTE] Task 9 bundles several unrelated deliverables

Task 9 carries a CHANGELOG entry, a full build/typecheck/lint/test pass, a seven-step manual walkthrough with backup/restore of the real `projects.json`, an added chmod-read-only variation run through `cfl worktree list --json` and `cfl check` (including an MCP `worktree_update` call in step 5), and an update of the design document with real output. That is closer to three tasks than one (docs / automated verification / manual walkthrough), and a failure in any part makes the whole final task look incomplete. Splitting the walkthrough from the CHANGELOG+suite step would give a cleaner stopping point.

### [NOTE] `mergeCheckResults.ts` prose about the "default" name is unassigned

Task 8's sweep (`grep -rnEi "[\"'\`]default[\"'\`]..."` over `packages/*/src`) will hit this comment, which explains attribution by saying "a migrated project has exactly one worktree named \"default\"". Task 7 updates the sibling comment in `worktreePropagation.ts:185` but no task assigns this one. It is a comment, not a name comparison, so Task 8's classifier can legitimately pass it — but the sweep task should say so explicitly, since after this slice the default's name is arbitrary and the comment's framing is left stale.

### [PASS] NFR / load-test and CI-gating expectations are correctly scoped

The design's only performance content is the "Cost" bullet under Special Considerations ("one in-memory pass over the projects on each `getAll()`… the 900 architecture sets no latency targets for these paths"), which is neither a Success Criterion nor a Technical Requirement. `.github/workflows/ci.yml` runs only `pnpm -r build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` — there is no perf or load stage to extend, and no `tests/load/` directory exists under `packages/`. The task file states this reasoning explicitly ("No performance or load-test task, and no perf gate is added…"), so no load-test task is owed and no CI wiring task is silently omitted.

### Run Digest

- Response length: 10359 chars
- Response is newline-free: no
- Tool calls made: 38
- Tool calls failed: 0
- Stop reason: stop
- Output budget: 384000 tokens
- System prompt: custom
- Settings sources: n/a (non-SDK)
- Reasoning characters: 272477
- Effort: backend default
- Turns: 20
- Tokens — prompt / cached / completion / reasoning: 1047285 / 798336 / 72701 / 67568
- Duration: 247.5 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 9
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 9
- Finding-shaped matches — surviving validation: 9

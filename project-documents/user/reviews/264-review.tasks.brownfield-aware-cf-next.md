---
docType: review
layer: project
reviewType: tasks
slice: brownfield-aware-cf-next
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/264-tasks.brownfield-aware-cf-next.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261023
dateUpdated: 20261023
reviewedSha: ccbc1f70489ba33cad469b234386c966739e9ac9
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 98194
cachedTokens: 8843
cacheWriteTokens: 89347
completionTokens: 6660
durationSeconds: 57.5
costUsd: 0.425615
costBasis: provider
runId: run-20261023-p5-ad1e6a4a
squadronVersion: 0.23.7
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success criteria coverage is complete"
    location: "project-documents/user/tasks/264-tasks.brownfield-aware-cf-next.md:67-227"
  - id: F002
    severity: concern
    category: process
    summary: "Task 0A amends a planning artifact on the slice branch"
    location: "project-documents/user/tasks/264-tasks.brownfield-aware-cf-next.md:52-65"
  - id: F003
    severity: concern
    category: commit-checkpoints
    summary: "Commits are batched across many tasks, against the per-task commit rule"
    location: "project-documents/user/tasks/264-tasks.brownfield-aware-cf-next.md:111, 209"
  - id: F004
    severity: concern
    category: sequencing
    summary: "Task 12 doesn't say where the MCP and CLI fixtures come from"
    location: "project-documents/user/tasks/264-tasks.brownfield-aware-cf-next.md:213-217"
  - id: F005
    severity: concern
    category: task-sizing
    summary: "Task 11 is large and bundles three separate changes"
    location: "project-documents/user/tasks/264-tasks.brownfield-aware-cf-next.md:188-195"
  - id: F006
    severity: concern
    category: proportionality
    summary: "Some test tasks exceed what the success criteria need"
    location: "project-documents/user/tasks/264-tasks.brownfield-aware-cf-next.md:165-186"
  - id: F007
    severity: concern
    category: verification
    summary: "Walkthrough step 9 and the `cfl` alias are unworkable for an automated implementer"
    location: "project-documents/user/tasks/264-tasks.brownfield-aware-cf-next.md:222-224"
  - id: F008
    severity: note
    category: consistency
    summary: "Context Summary says 261/263 edits are all behavior-preserving, but R3 changes ordering"
    location: "project-documents/user/tasks/264-tasks.brownfield-aware-cf-next.md:33, 44"
  - id: F009
    severity: note
    category: risk
    summary: "Lint rule may flag existing `adoption/` imports"
    location: "project-documents/user/tasks/264-tasks.brownfield-aware-cf-next.md:104-109"
---

# Review: tasks — slice 264

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success criteria coverage is complete

Each slice criterion maps to a task:
- **Declined/unset/D2:** 11T.1.
- **`in_progress` steps and arch gate:** 11T.2–3.
- **`in_progress` outside Phase 0:** 11T.4.
- **`complete` rows:** 11T.5.
- **Active slice:** 11T.6.
- **Read-only:** 11T.7.
- **Out-of-enum state:** 10T.5, 11T.8 and Task 12.
- **`decideAdoptionNav` rows and the order pin:** 5T.
- **`findExistingStatePlan`, including the marker format and the unreadable plan:** 2T.
- **D8 lint rule:** Task 4.
- **Unchanged output in this repo:** Task 13.
- **Parity:** Task 12.

I found no tasks outside the slice scope. Dependencies run in order: Task 7 before 10, Task 8 before 11, and Task 5 before 6, 10 and 11. The NFR load-test criteria don't apply, because the slice restates no NFR.

### [CONCERN] Task 0A amends a planning artifact on the slice branch

Task 0 creates `264-slice.*` first. Tasks 0A and 0C then edit the slice design and commit it with `docs:`. The Git Rules say planning artifacts (Phases 0–5, including slice design and task breakdown) commit directly to the target and never to a work branch. The task file itself is also still uncommitted on `main`, per git status. Do 0A and 0C on the target, before the branch is created. Then Task 0 only branches and takes the baseline. Better still, fold the same commit into the one that lands this task file.

### [CONCERN] Commits are batched across many tasks, against the per-task commit rule

The project rule is to commit at least once per task. Commit 4C covers Tasks 1, 1T, 2, 2T, 3 and 4. Commit 11C covers Tasks 9, 10, 10T, 11 and 11T. Commit 6C covers 5, 5T, 6 and 6T. These spans mix a `feat:` message with `refactor:` and `test:` work. They also leave a long stretch where a failure is hard to bisect, especially in Tasks 3 and 11, which edit existing 263 and navigator code. Add commits after at least these points:
- Task 1T.
- Task 2T.
- Task 3. This is a behavior-preserving swap, so it deserves its own `refactor:` commit.
- Task 4.
- Task 10T.
- Task 11 or 11T.

### [CONCERN] Task 12 doesn't say where the MCP and CLI fixtures come from

Task 9's helper lives in `packages/core/tests/helpers/adoptionFixtures.ts`. Task 12 needs the same fixtures in `packages/mcp-server/tests` and `packages/cli/tests`. Test helpers aren't shipped in the core `dist`, so a junior implementer has no stated way to reuse them. They would either guess an import path or duplicate the fixture code. Name the mechanism. Options are to build the fixtures inline from a small shared writer, to have core export the helper through a test-only entry point, or to copy a minimal fixture into each package. This is a real ambiguity, because the three packages must agree on the marker format.

### [CONCERN] Task 11 is large and bundles three separate changes

Task 11 combines four things:
- The four-way exhaustive switch.
- The D4 arch gate for the `existing-state-plan` step.
- The change that attaches `navWarnings` to every first-run return, which edits existing output paths.
- A line-growth cap of about 40.

Task 11T then covers eight requirement groups in one test file. Split Task 11 into two parts. The first is the call, the switch and the `warn` and `adopted` routing, which includes the warning plumbing. The second is the `recommend` branch with its arch gate. Put each part's tests right after it. This also gives natural commit points.

### [CONCERN] Some test tasks exceed what the success criteria need

The criteria require D7 failure-mode tests, but not separate input-reading tests for `gatherAdoptionInputs`.
- **10T.1–4** duplicate behavior that 11T checks end to end: declined, `""`, `in_progress` and `complete` fixtures. Keep 10T.5–6, which are the D7 cases, and drop or fold in 10T.1–4. 10T.2's "not read when not Phase 0" can be asserted in 11T.1.
- **11T.8 and the out-of-enum assertion in Task 12** repeat 10T.5. Keep one core test plus the surface-parity assertion in Task 12.
- **Task 9's "smoke test builds each option"** is a test of a test helper. Skip it, because 10T and 11T exercise the helper immediately.

### [CONCERN] Walkthrough step 9 and the `cfl` alias are unworkable for an automated implementer

Task 13 runs walkthrough steps 2–9. Step 9 requires an "MCP client in `/tmp/bf`". No such client is available to the implementer, and Task 12 already tests the same parity programmatically. Restrict Task 13 to steps 2–8 and cite Task 12 for step 9. The tasks also rely on `alias cfl=...`, and shell aliases don't persist across separate non-interactive shell invocations. Say to define a shell function or a script, or to invoke `node packages/cli/dist/index.js` directly, in every command block that uses `cfl`.

### [NOTE] Context Summary says 261/263 edits are all behavior-preserving, but R3 changes ordering

Line 33 calls the edits to 261/263 code "both behavior-preserving". R3 on line 44 admits that `findRecordedPlan` changes order when plans exist in both `project-guides/` and `architecture/`. Task 3 still passes because the existing tests don't cover that case, and 2T.4 does. Reword line 33 to name the one deliberate change so the implementer isn't surprised.

### [NOTE] Lint rule may flag existing `adoption/` imports

Task 4 forbids `adoption/` from importing anything in `introspection/` except `parsers/` and `types*`. If any 263 or 261 file there already imports another `introspection/` module, `pnpm lint` fails on the real tree. The task's success line catches this, but it gives no instruction for that case. Add one line: stop and report the offending import rather than loosening the rule.

### Run Digest

- Response length: 6899 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 98194 / 8843 / 89347 / 6660 / not computed
- Duration: 57.5 s
- Cost: $0.43 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 9
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 9
- Finding-shaped matches — surviving validation: 9

---
docType: review
layer: project
reviewType: tasks
slice: onboarding-consolidation
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/260-tasks.onboarding-consolidation.md
aiModel: claude-haiku-5-5
aiProfile: sdk
status: complete
dateCreated: 20261020
dateUpdated: 20261020
reviewedSha: eadac87eb00a70b462b41d03f8e20f2d8ea5d56d
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 101439
cachedTokens: 9623
cacheWriteTokens: 91812
completionTokens: 17340
durationSeconds: 81.9
costUsd: 0.02786
costBasis: provider
runId: run-20261020-p5-2eb33972
squadronVersion: 0.23.5
findings:
  - id: F001
    severity: concern
    category: sequencing
    summary: "`pathPresent` is both internal and exported in Task 2"
    location: "project-documents/user/tasks/260-tasks.onboarding-consolidation.md:70"
  - id: F002
    severity: concern
    category: sequencing
    summary: "Task 10T's \"git checkout\" step would revert the render output"
    location: "project-documents/user/tasks/260-tasks.onboarding-consolidation.md:184"
  - id: F003
    severity: concern
    category: granularity
    summary: "Task 16 is overloaded and has an open-ended fix bucket"
    location: "project-documents/user/tasks/260-tasks.onboarding-consolidation.md:241"
  - id: F004
    severity: note
    category: coverage
    summary: "Task 10T's installer check is conditional"
    location: "project-documents/user/tasks/260-tasks.onboarding-consolidation.md:185"
  - id: F005
    severity: note
    category: sequencing
    summary: "Drift test depends on a built core package and no ordering is stated"
    location: "project-documents/user/tasks/260-tasks.onboarding-consolidation.md:182"
  - id: F006
    severity: note
    category: granularity
    summary: "Tasks 3, 3T and 4 are very small"
    location: "project-documents/user/tasks/260-tasks.onboarding-consolidation.md:88"
  - id: F007
    severity: pass
    category: coverage
    summary: "Success criteria are fully covered"
    location: "project-documents/user/tasks/260-tasks.onboarding-consolidation.md:41"
  - id: F008
    severity: pass
    category: sequencing
    summary: "Test-with pattern and commit checkpoints are well distributed"
    location: "project-documents/user/tasks/260-tasks.onboarding-consolidation.md:60"
---

# Review: tasks — slice 260

**Verdict:** CONCERNS
**Model:** claude-haiku-5-5

## Findings

### [CONCERN] `pathPresent` is both internal and exported in Task 2

Task 1 and the slice's Component Structure say `pathPresent` is internal to core. Task 2 says "Keep `pathPresent` internal to core. Export it from `packages/core/src/node.ts`." The slice design says `node.ts` exports the detection facts, not `pathPresent`. The last clause most likely means the detection facts. As written, an implementer could export the helper publicly, which the slice rules out. Reword it to say `node.ts` re-exports `recognizeCi`, `CI_SIGNATURES`, `CiRecognition`, `hasBuildManifest` and `BUILD_MANIFESTS`, and that `pathPresent` stays unexported from `node.ts`.

### [CONCERN] Task 10T's "git checkout" step would revert the render output

Task 10 writes the rendered `onboard.md` and `SKILL.md` but does not commit them until Task 10C, which comes after 10T. The hand check in 10T then says to append a line, run the test, and "then `git checkout` the file." That restores the last committed file, which is the old hand-written recipe, not the render output. The drift test would then fail and the wrong content could be committed. Restore by re-running `pnpm --filter @context-forge/cli render:onboard` instead. Use `git checkout` only after 10C.

### [CONCERN] Task 16 is overloaded and has an open-ended fix bucket

Task 16 combines automated checks, the local-build walkthrough, `install-commands`, two live headless runs (Claude Code and Codex), and the in-repo mid-project run. It also says "any fix made here is committed as part of this task," which makes the scope unbounded and sits oddly with the one-commit-per-task rule. Three specific gaps:
- Walkthrough step 5 calls `agent_onboard` over MCP. The local CLI cannot run it, and the task does not say how to make the call. The unit test in 11T covers the same behavior, so either name an MCP client or mark step 5 as covered by 11T.
- Walkthrough step 4 assumes this repository is registered at Phase 4 with slice 260 set (design line 350). Task 16 does not check that precondition, so a wrong state would make the step's result meaningless.
- Split the live runs and the `install-commands` check into a Task 17 with its own commit. Keep Task 16 for automated checks and walkthrough steps 1, 2 and 5–9. Replace "any fix made here" with a rule that any fix gets its own `fix:`/`feat:` commit with a message matching its real type, not `chore:`.

### [NOTE] Task 10T's installer check is conditional

"Add a check ... (or confirm an existing one)" lets the implementer skip the check if they judge an existing test covers it. The Integration Requirement that `install-commands` yields the rendered files with no stale-entry removals should be stated as a required assertion, with the file named.

### [NOTE] Drift test depends on a built core package and no ordering is stated

`onboardRender.test.ts` imports `@context-forge/core`, which resolves to `dist`. Task 10 says to build before rendering, but Task 10T does not say the test needs a fresh build. The slice design states this requirement at Context Summary line 34. Add it to 10T's success line.

### [NOTE] Tasks 3, 3T and 4 are very small

Task 3 adds one config key, 3T tests its registration, and Task 4 adds two type declarations. None of them has its own success criterion. Task 3T's key-registration check is harmless and follows the existing pattern, but it is the one test not tied to a criterion. Merging 3 and 4 into Task 5 would keep the commit at 5C and remove a checkpoint without losing coverage. Either choice is acceptable.

### [PASS] Success criteria are fully covered

Every functional, technical and integration criterion in the slice design maps to a task (see Summary). The unit-test list in the design, including the four I/O failure classes, the navigator's gate-blocked and I/O-warning cases, and the `checkGuideMinimum` cases, is covered by Tasks 1T, 2T, 5T, 6T, 11T and 12T.

### [PASS] Test-with pattern and commit checkpoints are well distributed

Each implementation group is followed by its test task. Commits fall after every group of two to four tasks, so no work is batched to the end. The only exceptions are Task 4 (types only) and Tasks 7/8, whose tests are inline or follow directly, which is proportionate.

### Run Digest

- Response length: 6439 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 101439 / 9623 / 91812 / 17340 / not computed
- Duration: 81.9 s
- Cost: $0.03 (provider)
- `## Summary` located: yes
- `## Findings` located: no
- Finding-shaped matches — whole response: 8
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 8
- Finding-shaped matches — surviving validation: 8

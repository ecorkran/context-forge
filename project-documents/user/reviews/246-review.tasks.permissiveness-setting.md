---
docType: review
layer: project
reviewType: tasks
slice: permissiveness-setting
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/246-tasks.permissiveness-setting.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261019
dateUpdated: 20261019
reviewedSha: 0adc74f9af8ed1c65814c04278917dbe86f0f22e
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 3
turns: 4
promptTokens: 163890
cachedTokens: 81119
cacheWriteTokens: 82765
completionTokens: 3261
durationSeconds: 27.9
costUsd: 0.372524
costBasis: provider
runId: run-20261019-p5-1a9fe8b3
squadronVersion: 0.23.3
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success criteria coverage"
    location: "project-documents/user/tasks/246-tasks.permissiveness-setting.md"
  - id: F002
    severity: concern
    category: proportionality
    summary: "Task 5 pipeline tests exceed what the design requires"
    location: "project-documents/user/tasks/246-tasks.permissiveness-setting.md:140-146"
  - id: F003
    severity: concern
    category: task-sizing
    summary: "Task 2 is too granular and should merge into Task 3"
    location: "project-documents/user/tasks/246-tasks.permissiveness-setting.md:79-85"
  - id: F004
    severity: concern
    category: proportionality
    summary: "Task 3 dictates implementation steps beyond the design"
    location: "project-documents/user/tasks/246-tasks.permissiveness-setting.md:95-105"
  - id: F005
    severity: concern
    category: scope
    summary: "Task 8 mixes planning-document corrections into the docs task"
    location: "project-documents/user/tasks/246-tasks.permissiveness-setting.md:184"
  - id: F006
    severity: note
    category: risk
    summary: "Task 9 temporarily moves a tracked guide file"
    location: "project-documents/user/tasks/246-tasks.permissiveness-setting.md:199"
  - id: F007
    severity: note
    category: accuracy
    summary: "Referenced schema anchors verified"
    location: "packages/core/src/schema/projectSchema.ts:33"
---

# Review: tasks — slice 246

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success criteria coverage

Each functional criterion maps to a task:
- Validator accepts the three levels and rejects others: Task 1.
- Default level is byte-identical to today: Task 5.
- Fragment appears after the instruction prompt in Phases 4–6 and not elsewhere: Tasks 3 and 5.
- A level change takes effect on the next build: Task 5.
- A missing fragment fails the build (D6): Tasks 3 and 5.
- A worktree gets its own fragment: Task 3.
- MCP `context_build` matches the CLI: Task 6.
- setup-ide ignores the `permissiveness/` subdirectory: Task 7.
- Docs: Task 8.
- Design Verification Walkthrough steps 1–6: Task 9.

The design does not restate an NFR, so no load test or CI-gating task is needed. Task 9 runs the existing CI sequence. I found no tasks outside the success criteria.

### [CONCERN] Task 5 pipeline tests exceed what the design requires

The design asks for "one pipeline-level test" confirming the section lands after the instruction prompt. Task 5 specifies five tests, and two of them re-run behavior already covered in Task 3:
- The non-applicable-phase test (ARCHITECTURE) duplicates Task 3's non-applicable-phase case.
- The missing-fragment test duplicates Task 3's D6 failure cases.

The byte-identical default and the level-change test do map to success criteria. The byte-identical test is also heavier than needed. It loops every applicable phase and compares against a hand-built integrator, and a single unset-versus-`standard` comparison plus one comparison with no resolver would meet the criterion. Cut the architecture-phase and missing-fragment tests from Task 5. Keep ordering, byte-identical default and level change. Reduce the phase loop to one phase.

### [CONCERN] Task 2 is too granular and should merge into Task 3

Task 2 copies two files and adds a one-line README, which is a task of its own with a separate commit. The fixtures exist to serve Task 3's tests, with Tasks 5 and 7 reusing them. This breaks the test-with pattern, because the fixtures are committed apart from the tests that give them meaning. Fold Task 2 into Task 3 (the fixtures are committed alongside the resolver and its tests). The README is optional. Dropping it removes a file without losing the "refresh when format changes" intent, which a code comment in the resolver test can carry.

### [CONCERN] Task 3 dictates implementation steps beyond the design

The eight-step ordered list restates D6 nearly verbatim, and then adds prescriptions the design leaves open:
- A "~120 lines" size cap.
- Exact error-wrapping with `{ cause }`.
- The frontmatter-stripping edge cases, such as an unclosed `---` being treated as all frontmatter.

The size cap and `{ cause }` are not tied to any success criterion. D6 plus "reads like `integrationBranchResolver.ts`" is enough direction for an implementer. Reference D6's failure list instead of re-listing it, and keep only the order-of-checks constraint that matters: the phase check runs before any config or guide access. Also drop the line cap, since CLAUDE.md already sets a ~300-line guideline.

### [CONCERN] Task 8 mixes planning-document corrections into the docs task

Task 8 edits the slice design to fix the stale "installed guide is v0.21.6" sentence. The task file's context summary already says Implementation Notes steps 1 and 7 are done. The design edit is a planning-doc fix, and it would be cleaner as a separate `docs:` commit made before implementation starts (or folded into Task 0) so the slice branch carries only implementation work. As written, it bundles into the README commit.

### [NOTE] Task 9 temporarily moves a tracked guide file

Step 4 moves the installed `rules/permissiveness/cautious.md` aside and then restores it. The restore instruction is explicit and the final `git status` check would catch a missed restore. Moving a copy of the guide to a temp checkout would avoid touching the repo's guide at all, but the current approach is acceptable.

### [NOTE] Referenced schema anchors verified

I confirmed that `ARCHITECTURE_PHASE` (:33) and `PHASE_MAP` (:49) exist, so the Task 3 references to them are accurate. I did not check the other line-number anchors in the context summary.

### Run Digest

- Response length: 5199 chars
- Response is newline-free: no
- Tool calls made: 3
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 4
- Tokens — prompt / cached / cache write / completion / reasoning: 163890 / 81119 / 82765 / 3261 / not computed
- Duration: 27.9 s
- Cost: $0.37 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7

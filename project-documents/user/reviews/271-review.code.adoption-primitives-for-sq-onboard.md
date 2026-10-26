---
docType: review
layer: project
reviewType: code
slice: adoption-primitives-for-sq-onboard
targetKind: slice
rulesSource: project
conventionsSource: AGENTS.md
projectRules: [testing.md, typescript.md]
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/271-slice.adoption-primitives-for-sq-onboard.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261026
dateUpdated: 20261026
reviewedSha: 14d684d2a564357e06b2ce6434febf6704e6480d
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 1
diffTruncated: false
turns: 2
promptTokens: 238665
cachedTokens: 14149
cacheWriteTokens: 224512
completionTokens: 3790
durationSeconds: 38.2
costUsd: 0.945465
costBasis: provider
squadronVersion: 0.24.5
findings:
  - id: F001
    severity: concern
    category: dry
    summary: "Error-envelope mapping is duplicated across three call sites"
    location: "packages/cli/src/commands/detect.ts:20-27"
  - id: F002
    severity: concern
    category: design
    summary: "Planning facts are read twice per `detectProject` call"
    location: "packages/core/src/adoption/projectDetection.ts:60-62"
  - id: F003
    severity: concern
    category: error-handling
    summary: "`findProjectGuideFile` swallows every error, and detection now relies on it"
    location: "packages/core/src/introspection/parsers/projectGuideFile.ts:9-15"
  - id: F004
    severity: concern
    category: simplicity
    summary: "`getProfileVariables` wraps synchronous code in a `new Promise` executor"
    location: "packages/core/src/services/SystemPromptParser.ts (getProfileVariables)"
  - id: F005
    severity: note
    category: consistency
    summary: "Human-mode worktree refusal exits 0 but `--json` exits 1"
    location: "packages/cli/src/commands/init.ts (registration.kind === 'worktree')"
  - id: F006
    severity: note
    category: typescript
    summary: "Type assertions without the required justification comment"
    location: "packages/cli/src/commands/promptAdoption.ts:14"
  - id: F007
    severity: note
    category: config
    summary: "Magic default `'claude'` for the IDE target"
    location: "packages/cli/src/commands/initSteps.ts (ideTargetOf)"
  - id: F008
    severity: note
    category: testing
    summary: "Test hygiene"
    location: "packages/cli/tests/commands/init.test.ts (worktree tests); packages/cli/tests/commands/detect.test.ts:8"
  - id: F009
    severity: pass
    category: design
    summary: "Separation of concerns, output sinks and test coverage"
    location: "packages/cli/src/output/logSink.ts"
---

# Review: code — slice 271

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Error-envelope mapping is duplicated across three call sites

`DetectionError` → `serializeErrorEnvelope(...)`, with `internal` as the fallback, is written three times. `detect.ts:writeJsonFailure` and `mcp-server/src/tools/detectTools.ts:failure` hold the same ternary. `init.ts:writeJsonFailure` repeats the `internal` branch. A change to the fallback, such as how non-`Error` values are stringified, has to be made in each place, and the CLI/MCP byte-parity guarantee relies on them staying identical. Move one `toErrorEnvelope(reportVersion, error)` helper into `detectionReport.ts` next to `serializeErrorEnvelope` and use it in all three.

### [CONCERN] Planning facts are read twice per `detectProject` call

`detectProject` calls `readPlanningFacts(root)` directly. `readAdoptionArtifacts(root)` then calls it again internally (`adoptionInputs.ts`, in the `Promise.all`). That doubles the directory reads. Because the two reads happen at different moments, the outcome stage and the reported artifacts could disagree if the files change in between. Let `readAdoptionArtifacts` accept already-read facts, or have one function return both.

### [CONCERN] `findProjectGuideFile` swallows every error, and detection now relies on it

The moved helper uses a bare `catch` that returns `null` for any failure. The comment justifies this only for a missing directory. `readAdoptionArtifacts` now uses it for `concept`. An EACCES or ENOTDIR on `project-guides` therefore reports `concept: null` instead of raising the `unreadable-planning` error that `detectProject` documents for planning-file failures. This contradicts the exception-handling rule that a swallow must be specific and justified. The code is moved, but this slice added a caller that depends on it. Catch ENOENT only, and wrap other errors the same way `planningFacts` does.

### [CONCERN] `getProfileVariables` wraps synchronous code in a `new Promise` executor

The method uses a `new Promise` executor that throws inside the executor, just to get rejection semantics. Declaring it `async` does the same thing more simply, and `existsSync` followed by `readFileSync` is a check-then-use race. Read the file and map ENOENT to the "not found" error instead. As written, the code looks like it contains an error-swallowing bug when it doesn't.

### [NOTE] Human-mode worktree refusal exits 0 but `--json` exits 1

The test "the worktree refusal still exits 0" shows this is deliberate. Scripts that run `cf init` in human mode still can't tell that nothing was set up. Also, `'worktree-of-registered-project'` is added to `DETECTION_ERROR_CODES`, but `detectProject` never throws it. It is an init-only code, so the type name is misleading.

### [NOTE] Type assertions without the required justification comment

`(error as NodeJS.ErrnoException).code` and `p.projectPath as string` (`initSteps.ts` `runRegisterStep`) are assertions without a comment saying why they are safe. The typescript rule asks for one. The `projectPath` case can be removed with a type-guard filter. The ErrnoException case could reuse `isEnoent` from `detection/pathPresent.ts`, which `projectDetection.ts` already uses.

### [NOTE] Magic default `'claude'` for the IDE target

The `'claude'` literal is a hard-coded default, which the project rules say to centralise. It was already in `init.ts` before this change, but the refactor was a chance to move it into a shared constant. It also appears in the `--ide` option help text.

### [NOTE] Test hygiene

- Several tests call `mockExecFileSync.mockReset()` at the end of the test body. If an assertion fails first, the mock leaks into later tests. Move the reset into `afterEach`.
- `detect.test.ts`, `prompt.adoption.test.ts`, `detectTools.test.ts` and `detectParity.test.ts` import `../../../core/tests/helpers/adoptionFixtures.js`, a cross-package path into another package's tests. Exporting the fixtures from a shared test-utils location would be sturdier.
- `detectParity.test.ts` throws if `cli/dist` is missing. That is explicit and acceptable, but CI needs a build step before the tests.

### [PASS] Separation of concerns, output sinks and test coverage

The `LogSink` abstraction cleanly redirects progress to stderr for `--json`, with defaults that preserve the old behaviour. `initSteps.ts` splits the old `init` action into small, single-purpose step functions. `INIT_STEP`, `STEP_STATUS` and `SKIP_REASON` centralise the comparison values. `GuideAlreadyInstalledError` replaces message-text matching, as the rules prefer. New code has tests for the success paths, the error codes, the parity between CLI and MCP, and read-only behaviour. The squadron-ban test adds mechanical enforcement.

### Run Digest

- Response length: 6008 chars
- Response is newline-free: no
- Tool calls made: 1
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 2
- Tokens — prompt / cached / cache write / completion / reasoning: 238665 / 14149 / 224512 / 3790 / not computed
- Duration: 38.2 s
- Cost: $0.95 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 9
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 9
- Finding-shaped matches — surviving validation: 9

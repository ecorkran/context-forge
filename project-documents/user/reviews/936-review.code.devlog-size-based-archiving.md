---
docType: review
layer: project
reviewType: code
slice: devlog-size-based-archiving
conventionsSource: AGENTS.md
projectRules: [testing.md, typescript.md]
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/936-slice.devlog-size-based-archiving.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261106
dateUpdated: 20261106
reviewedSha: 8329778ee8502e641fdf63d56df17e9a4c116227
revision_number: 2
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
diffTruncated: false
turns: 3
promptTokens: 188914
cachedTokens: 22864
cacheWriteTokens: 166046
completionTokens: 3346
durationSeconds: 28.3
costUsd: 0.704782
costBasis: provider
runId: run-20261106-p6-f9bab4c8
squadronVersion: 0.24.23
categoriesNormalized: true
findings:
  - id: F001
    severity: concern
    category: consistency-rot
    summary: "CLI redefines the DEVLOG filename and config-key strings that core already owns"
    location: "packages/cli/src/commands/devlog.ts:17"
  - id: F002
    severity: concern
    category: test-debt
    summary: "Permission-based test fails under root and some filesystems"
    location: "packages/core/tests/devlog/archiveDevlog.test.ts (test \"names the path, cause and files already written when a write fails\")"
  - id: F003
    severity: note
    category: test-debt
    summary: "Loose cast and duplicated setup in the multi-path tests"
    location: "packages/core/tests/introspection/routedFixes.multiPath.test.ts"
  - id: F004
    severity: note
    category: architectural-decay
    summary: "ConsistencyChecker keeps growing"
    location: "packages/core/src/introspection/ConsistencyChecker.ts"
  - id: F005
    severity: pass
    category: other
    summary: "Core devlog design"
    location: "packages/core/src/devlog/archiveDevlog.ts"
---

# Review: code — slice 936

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] CLI redefines the DEVLOG filename and config-key strings that core already owns

The CLI declares `const DEVLOG_NAME = 'DEVLOG.md'`, but core already exports `DEVLOG_FILE` through `@context-forge/core/node`. This slice also changed `ProjectModelBuilder.ts` to use `DEVLOG_FILE` instead of a literal. The CLI is the one place left with its own copy, which breaks the "define once, reference everywhere" rule.

The literals `devlog.max_bytes` and `devlog.target_bytes` are also repeated in the CLI report and description text. They appear again in the `description` string in `devlogSizeFinding.ts`. `DEVLOG_MAX_BYTES_KEY` and `DEVLOG_TARGET_BYTES_KEY` exist in `devlogLimits.ts` but are not re-exported from `devlog/index.ts`. Export them, along with `DEVLOG_FILE` if it is not already reachable, and use them in the CLI and the finding text.

### [CONCERN] Permission-based test fails under root and some filesystems

The test makes a file read-only with `chmod 0o444` and expects `EACCES`. A root user (common in CI containers) bypasses file modes, so the write succeeds and the test fails. The same applies to some filesystems. Skip the test when `process.getuid?.() === 0`, or force the failure another way. For example, make the archive path a directory so the write fails with `EISDIR`.

### [NOTE] Loose cast and duplicated setup in the multi-path tests

The first test builds a finding with `as unknown as ConsistencyFinding`. The TypeScript rules call `as` assertions a code smell and ask for a comment explaining why. A small typed `ConsistencyFinding` builder would avoid the cast. The `applyFixes` failure test calls `checker.checkAll` twice when once would do.

### [NOTE] ConsistencyChecker keeps growing

Rule 16 is a thin delegate, which is the right pattern. The file is still well over the ~300-line guideline, and every new rule adds to that. This is existing debt, not a regression from this slice.

### [PASS] Core devlog design

- **Read and write:** UTF-8 is read strictly, with BOM and CRLF preserved.
- **Concurrency and dedupe:** a concurrent edit to `DEVLOG.md` is detected before the final write, and archives are deduplicated by whole section.
- **Partial failure:** the error reports which files were already written, since there is no rollback.
- **Trust boundary:** the `archive-devlog` `fixAction.detail` is narrowed from `unknown` with a type guard (`parseArchiveDevlogDetail`), so there is no `any`.
- **Multi-file fixes:** `fixRelPaths` extends dirty-gating and commit handling to every file a fix writes.
- **Tests:** they use real-format fixtures, sit in the centralized `tests/` directories, and cover the edge cases.

### Run Digest

- Response length: 3355 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 188914 / 22864 / 166046 / 3346 / not computed
- Duration: 28.3 s
- Cost: $0.70 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 5
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 5
- Finding-shaped matches — surviving validation: 5

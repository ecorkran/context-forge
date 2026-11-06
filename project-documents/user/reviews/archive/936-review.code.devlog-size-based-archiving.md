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
reviewedSha: e1b00e4abe321907fbf4a2c205d79a59a9e67422
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 4
diffTruncated: false
turns: 5
promptTokens: 305813
cachedTokens: 140559
cacheWriteTokens: 165246
completionTokens: 3071
durationSeconds: 29.6
costUsd: 0.710526
costBasis: provider
runId: run-20261106-p6-f9bab4c8
squadronVersion: 0.24.23
categoriesNormalized: true
findings:
  - id: F001
    severity: concern
    category: architectural-decay
    summary: "ConsistencyChecker.ts keeps growing as a god file"
    location: "packages/core/src/introspection/ConsistencyChecker.ts:1286"
  - id: F002
    severity: concern
    category: consistency-rot
    summary: "Duplicated error-message narrowing instead of the new `causeText` helper"
    location: "packages/core/src/introspection/ConsistencyChecker.ts:1291"
  - id: F003
    severity: concern
    category: consistency-rot
    summary: "Long positional parameter lists in writer helpers"
    location: "packages/core/src/devlog/archiveDevlog.ts#writeAll"
  - id: F004
    severity: concern
    category: architectural-decay
    summary: "Test seam exposed on the production options type"
    location: "packages/core/src/devlog/archiveDevlog.ts:21"
  - id: F005
    severity: note
    category: correctness
    summary: "Archive idempotence uses substring matching"
    location: "packages/core/src/devlog/archiveText.ts:18"
  - id: F006
    severity: note
    category: error-handling-observability
    summary: "Non-atomic multi-file write is documented and tested"
    location: "packages/core/src/devlog/archiveDevlog.ts:84-103"
  - id: F007
    severity: pass
    category: test-debt
    summary: "Tests accompany implementation with real-format fixtures"
    location: "packages/core/tests/devlog/devlogSections.test.ts"
---

# Review: code — slice 936

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] ConsistencyChecker.ts keeps growing as a god file

`ConsistencyChecker.ts` is now 1544 lines, against the project's ~300-line guideline. This slice adds Rule 16 (`ruleDevlogSize`) and `applyArchiveDevlog` to it. The finding builder was correctly extracted to `devlogSizeFinding.ts`, but the fix application and rule wiring still sit in the class. `applyFixes` (lines 227-268) is a growing if/else chain on `fixAction.type`. A handler registry keyed by action type would keep new fix kinds out of this file. Most of the size predates this slice, but this change adds to it.

### [CONCERN] Duplicated error-message narrowing instead of the new `causeText` helper

`ruleDevlogSize` repeats `err instanceof Error ? err.message : String(err)`. This slice adds `causeText` in `devlog/errorText.ts` for exactly that, and `devlogSizeFinding.ts` uses it. `applyArchiveDevlog`'s caller at line 262 has the same inline form, but that is older code. Using `causeText` in the new code would follow the DRY rule.

### [CONCERN] Long positional parameter lists in writer helpers

`writeAll` takes six positional parameters, and `planArchiveWrites` takes four. The TypeScript rules say to use a destructured options object for 3 or more parameters. `ArchiveDevlogOptions` already shows the intended style. The call at the end of `archiveDevlog` is hard to read as a result, because it passes `devlogPath, original, plan.keptText, writes, options.beforeFinalWrite` in order.

### [CONCERN] Test seam exposed on the production options type

`beforeFinalWrite` is a test-only hook on the public `ArchiveDevlogOptions`, and it is re-exported through `devlog/index.ts` and `node.ts`. The comment says production never sets it, but nothing enforces that. An internal `archiveDevlogWith(options, hooks)` overload, or a separate non-exported options type, would keep the public contract clean.

### [NOTE] Archive idempotence uses substring matching

`existing.includes(section)` decides whether a section is already archived. A short moved section whose exact text appears inside a different archived section would be dropped silently. This is unlikely, because each section starts with a unique dated heading and ends in a blank line. It is still a heuristic, so it is worth a comment or a heading-keyed check.

### [NOTE] Non-atomic multi-file write is documented and tested

A failure partway through the writes leaves earlier archives written. The error names those files and says no rollback was done. The routed-fix path restores state when its commit fails, and tests cover both cases. The behaviour is acceptable and clearly communicated.

### [PASS] Tests accompany implementation with real-format fixtures

The tests cover the real heading forms (compact, dashed, ranged and month-only), CRLF, a missing trailing newline, code fences, a squadron-format archive, byte-versus-character counting, concurrent edits, and a non-UTF-8 archive. Multi-path routed fixes are tested against real git worktrees, and the MCP tool is tested end to end. This matches the project's parsing-fixture rule. The tests use temp directories, and none of them reads a production database variable.

### Run Digest

- Response length: 4183 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 305813 / 140559 / 165246 / 3071 / not computed
- Duration: 29.6 s
- Cost: $0.71 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7

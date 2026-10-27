---
docType: review
layer: project
reviewType: code
slice: docs-and-guide-alignment
targetKind: slice
rulesSource: project
conventionsSource: AGENTS.md
projectRules: [testing.md, typescript.md]
project: context-forge
verdict: PASS
verdictSource: stated
sourceDocument: project-documents/user/slices/272-slice.docs-and-guide-alignment.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261026
dateUpdated: 20261026
reviewedSha: c89b0843190a5eb1911866d1976264d9e8d8e13f
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 5
diffTruncated: false
turns: 6
promptTokens: 190671
cachedTokens: 93590
cacheWriteTokens: 97075
completionTokens: 2095
durationSeconds: 21.4
costUsd: 0.420046
costBasis: provider
squadronVersion: 0.24.5
findings:
  - id: F001
    severity: pass
    category: design
    summary: "Guide-minimum warning is extracted into one helper"
    location: "packages/cli/src/utils/guideReady.ts:60-69"
  - id: F002
    severity: pass
    category: testing
    summary: "`cf prompt get` tests cover the stderr contract"
    location: "packages/cli/tests/commands/prompt.guideMinimum.test.ts"
  - id: F003
    severity: note
    category: structure
    summary: "The test imports a helper from another package by relative path"
    location: "packages/cli/tests/commands/prompt.guideMinimum.test.ts:15"
  - id: F004
    severity: note
    category: testing
    summary: "The tests re-derive the expected message from the function under test"
    location: "packages/cli/tests/commands/prompt.guideMinimum.test.ts:85-93"
  - id: F005
    severity: note
    category: documentation
    summary: "Comment and test cleanups look correct"
    location: "packages/core/src/detection/presentPaths.ts:1-4"
---

# Review: code — slice 272

**Verdict:** PASS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Guide-minimum warning is extracted into one helper

`warnIfGuideOutdated` replaces the inline `checkGuideMinimum` call in `build.ts`, and `prompt.ts` now calls the same helper. The warning logic lives in one place (DRY). It writes only to stderr, so stdout and the exit code are unchanged. It has an explicit `Promise<void>` return type and a doc comment. `MIN_GUIDE_VERSION` is a single constant, and the bump to `0.22.8` matches the guide version marker.

### [PASS] `cf prompt get` tests cover the stderr contract

The tests cover an older version, a missing marker, an empty marker, an unreadable marker, a current guide, and no guide installed. Each warning case asserts that the stderr text matches `checkGuideMinimum` output and that stdout is non-empty. The tests also assert that the exit code is unaffected. Only the project store is mocked. Fixtures live in temporary directories that `afterEach` removes. No database or production-variable access is involved.

### [NOTE] The test imports a helper from another package by relative path

The test imports `createAdoptionFixture` from `../../../core/tests/helpers/adoptionFixtures.js`. It also reads a fixture file from `core/tests/fixtures`. Eight other test files use the same `core/tests/helpers` path, so this follows the existing convention. A shared test-utils export would be cleaner, but this is not new debt.

### [NOTE] The tests re-derive the expected message from the function under test

Each case computes `expected` by calling `checkGuideMinimum` and then asserts the same string on stderr. The check's own logic is not verified here, and a wrong message would pass. That is acceptable because the check has its own unit tests in core, and these tests exist only to verify the CLI wiring. The `expect(expected).not.toBeNull()` guard prevents a vacuous pass.

### [NOTE] Comment and test cleanups look correct

The header comment now lists the real consumers (`cf detect`, docs map discovery, rule reconciliation). The comprehension-document fixture and assertions were removed from `pureBuild.test.ts`, and the test title was updated to match.

### Run Digest

- Response length: 2569 chars
- Response is newline-free: no
- Tool calls made: 5
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 6
- Tokens — prompt / cached / cache write / completion / reasoning: 190671 / 93590 / 97075 / 2095 / not computed
- Duration: 21.4 s
- Cost: $0.42 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 5
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 5
- Finding-shaped matches — surviving validation: 5

---
docType: review
layer: project
reviewType: code
slice: permissiveness-setting
targetKind: slice
rulesSource: project
conventionsSource: AGENTS.md
projectRules: [testing.md, typescript.md]
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/246-slice.permissiveness-setting.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261019
dateUpdated: 20261019
reviewedSha: 6837256dde28a3175cbd972442eab02c3f8e1db4
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 1
diffTruncated: false
turns: 2
promptTokens: 170846
cachedTokens: 84696
cacheWriteTokens: 86146
completionTokens: 2781
durationSeconds: 23.3
costUsd: 0.383892
costBasis: provider
squadronVersion: 0.23.3
findings:
  - id: F001
    severity: concern
    category: naming
    summary: "`AUTONOMOUS_LEVEL` is actually `cautious`"
    location: "packages/core/tests/services/permissivenessResolver.test.ts:21"
  - id: F002
    severity: concern
    category: typescript
    summary: "Unexplained `as` assertion on the caught error"
    location: "packages/core/src/services/permissivenessResolver.ts:44"
  - id: F003
    severity: concern
    category: testing
    summary: "CLI integration test depends on a pre-built `dist/index.js`"
    location: "packages/cli/tests/integration/build.integration.test.ts:79"
  - id: F004
    severity: concern
    category: design
    summary: "Template engine section metadata contradicts its comment"
    location: "packages/core/src/services/ContextTemplateEngine.ts:112-121"
  - id: F005
    severity: note
    category: error-handling
    summary: "Inconsistent remediation hints between sibling error messages"
    location: "packages/core/src/services/permissivenessResolver.ts:21"
  - id: F006
    severity: note
    category: testing
    summary: "Magic literal `'implementation'` in tests"
    location: "packages/core/tests/services/permissivenessResolver.test.ts (nonApplicable cases)"
  - id: F007
    severity: pass
    category: error-handling
    summary: "Failure handling and extraction"
    location: "packages/core/src/services/ContextIntegrator.ts:114"
---

# Review: code — slice 246

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] `AUTONOMOUS_LEVEL` is actually `cautious`

`FRAGMENT_LEVELS` is `['cautious', 'autonomous']` after `standard` is filtered out of `['cautious','standard','autonomous']`. Destructuring `[AUTONOMOUS_LEVEL] = FRAGMENT_LEVELS` therefore yields `'cautious'`. The failure tests pass because both fixtures exist, so the wrong name is misleading but harmless. A future reorder of `PERMISSIVENESS_LEVELS` would silently change which level these tests exercise. Rename it (for example `SAMPLE_FRAGMENT_LEVEL`) or select the level explicitly.

### [CONCERN] Unexplained `as` assertion on the caught error

`(err as NodeJS.ErrnoException).code` is a type assertion with no comment. The TypeScript rules require a justification for each one. If `err` is not an object, `.code` is read from a non-object. Narrow first with `err instanceof Error && 'code' in err`, or add a comment explaining why the assertion is safe.

### [CONCERN] CLI integration test depends on a pre-built `dist/index.js`

The new tests spawn `../../dist/index.js`. If the CLI has not been built, or the build is stale, they fail with an opaque spawn or module error rather than a clear message. Add a `beforeAll` that checks `dist/index.js` exists and fails with an explicit "run the build first" message. Alternatively, confirm the test pipeline always builds before testing.

### [CONCERN] Template engine section metadata contradicts its comment

The comment says "conditional", but the section is pushed with `conditional: false` and an empty `title`. I did not verify how the section renderer handles an empty title, for example whether it emits a stray heading. The new engine test covers ordering and the empty-fragment case, but I did not confirm that it covers heading rendering. The key `'permissiveness'` and the order `3.5` are also inline literals, whereas the other sections presumably follow a convention. Align the comment with the metadata and check how an empty title renders.

### [NOTE] Inconsistent remediation hints between sibling error messages

The new messages say `cf guides update`, but `resolvePromptFilePath` (moved, unchanged) says `cf guide install`. These may be distinct commands, since install applies when no guide exists and update when a fragment is missing. I did not verify either command name against the CLI. Confirm both are real and that each message points at the right one.

### [NOTE] Magic literal `'implementation'` in tests

The literal `'implementation'` stands for the integrator's default instruction. If that default is exported as a constant, reference it so the test follows any change to the default.

### [PASS] Failure handling and extraction

- **Fail-fast behaviour:** The configured-but-unloadable fragment fails explicitly through a typed `PermissivenessFragmentError`. There is no silent fallback to `standard`, and unrelated errors keep the error-stub behaviour. The tests cover unit, factory, CLI and MCP paths, including missing, unreadable, empty and invalid-config fragments.
- **Circular import:** Moving `resolvePromptFilePath` into `promptFilePath.ts` avoids a circular import, and the re-export keeps the public API unchanged.
- **Constants:** Level constants are defined once and reused by the config enum, the default and the tests.

### Run Digest

- Response length: 3946 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 170846 / 84696 / 86146 / 2781 / not computed
- Duration: 23.3 s
- Cost: $0.38 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7

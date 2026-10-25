---
docType: review
layer: project
reviewType: code
slice: pure-cf-build
targetKind: slice
rulesSource: project
conventionsSource: AGENTS.md
projectRules: [testing.md, typescript.md]
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/268-slice.pure-cf-build.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261025
dateUpdated: 20261025
reviewedSha: 2c4e83669e249327050c35ad32f1b41558864621
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 5
diffTruncated: false
turns: 6
promptTokens: 463429
cachedTokens: 267516
cacheWriteTokens: 195905
completionTokens: 2676
durationSeconds: 29.2
costUsd: 0.84377
costBasis: provider
squadronVersion: 0.24.3
findings:
  - id: F001
    severity: concern
    category: correctness
    summary: "pureBuild test imports `BROWNFIELD_MIN_SOURCE_LINES` from the browser-safe entry, where it is not exported"
    location: "packages/mcp-server/tests/integration/pureBuild.test.ts:12"
  - id: F002
    severity: concern
    category: testing
    summary: "Golden-file test claims a pre-268 baseline but compares against fixtures I did not verify"
    location: "packages/core/tests/pure-build-golden.test.ts:14"
  - id: F003
    severity: note
    category: testing
    summary: "Test coverage for the removed behavior is replaced by negative assertions only"
    location: "packages/mcp-server/tests/integration/pureBuild.test.ts"
  - id: F004
    severity: note
    category: design
    summary: "Dead-code removal looks complete"
    location: "packages/core/src/adoption/contracts.ts"
---

# Review: code — slice 268

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] pureBuild test imports `BROWNFIELD_MIN_SOURCE_LINES` from the browser-safe entry, where it is not exported

The test imports `BROWNFIELD_MIN_SOURCE_LINES` from `@context-forge/core`. I found that constant only in `adoption/adoptionOutcome.ts`, and `adoption/index.ts` re-exports that file. The only place `adoption/index.ts` is re-exported is `packages/core/src/node.ts:61`, which is the `@context-forge/core/node` entry point. `packages/core/src/index.ts` has no adoption or detection exports. I did not run the test or the typecheck, so this is from reading the source.

If the import resolves to `undefined`:
- `BROWNFIELD_MIN_SOURCE_LINES + 100` evaluates to `NaN`.
- `Array.from({ length: NaN })` yields an empty array, so `src/big.ts` is written empty.
- The checkout is then not brownfield.
- All four tests would pass vacuously. The purity assertions would no longer show that a brownfield checkout builds without writes, `sq` runs or facts.

If it does resolve, it would only be through a path I didn't find. Import it from `@context-forge/core/node`, which the test already uses for `FileProjectStore`. Better, add a precondition assertion that the generated source is at or above the threshold, so the fixture can't silently stop being brownfield.

### [CONCERN] Golden-file test claims a pre-268 baseline but compares against fixtures I did not verify

The comment says the golden outputs were "captured on the pre-268 build". The fixtures (`fixtures/pure-build-golden/*.golden.md`) are not in the reviewed diff, because `.md` files are excluded. I could not confirm they contain no machine-specific content other than `projectPath`. `dateProject` is pinned, but any other time- or environment-dependent text would make the test flaky. The test also swaps in `<PROJECT_PATH>` with `split().join()`, so a path that is a prefix of another path in the output would be substituted incorrectly. Check that the goldens are stable across machines.

### [NOTE] Test coverage for the removed behavior is replaced by negative assertions only

Deleting the resolver, facts and squadron probe along with their tests is consistent with the slice. The `pureBuild.test.ts` and golden tests cover the new "pure" contract. The fake `sq` on PATH and the file-tree snapshot are a good mechanical guard. `process.env.PATH` is mutated in `beforeAll` and restored in `afterAll`, which is fine.

### [NOTE] Dead-code removal looks complete

A grep of `packages/**/*.ts` found no remaining references to `BROWNFIELD_ADOPTION_INSTRUCTION`, `SquadronProbe`, `adoptionStateWrites`, `writeAdoptionState`, `adoptionFacts`, or `fileComprehension` as a data field. The remaining `COMPREHENSION_PROFILE_VARIABLE` and `findComprehensionAnalysis` in `detection/` are still exported from `detection/index.ts`. They now look unused by any build path, so they may be candidates for follow-up removal. `AdoptionError` is retained, with its doc comment updated.

### Run Digest

- Response length: 3297 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 463429 / 267516 / 195905 / 2676 / not computed
- Duration: 29.2 s
- Cost: $0.84 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 4
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 4
- Finding-shaped matches — surviving validation: 4

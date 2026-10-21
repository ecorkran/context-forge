---
docType: review
layer: project
reviewType: code
slice: detection-and-adoption-state
targetKind: slice
rulesSource: project
conventionsSource: AGENTS.md
projectRules: [testing.md, typescript.md]
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/261-slice.detection-and-adoption-state.md
aiModel: deepseek/deepseek-v4.1-flash
aiProfile: openrouter
status: complete
dateCreated: 20261021
dateUpdated: 20261021
reviewedSha: f8657488c9ba11423f1f548e42599caae26fd3d5
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 37
diffTruncated: false
turns: 20
promptTokens: 1244652
cachedTokens: 1096064
completionTokens: 56884
reasoningTokens: 52324
durationSeconds: 249.0
costUsd: 0.056096
costBasis: alias_pricing
squadronVersion: 0.23.6
findings:
  - id: F001
    severity: concern
    category: error-handling
    summary: "Facts failures after the state write silently degrade to the error stub while `in_progress` stays persisted"
    location: "packages/core/src/adoption/adoptionResolver.ts#renderFacts"
  - id: F002
    severity: concern
    category: naming-structure
    summary: "Stray backup test file committed alongside the real one"
    location: "packages/core/tests/services/CoreServiceFactory.test.ts-E"
  - id: F003
    severity: concern
    category: typescript
    summary: "`ADOPTION_STATES` / `AdoptionState` are reachable twice through the `@context-forge/core/node` star exports"
    location: "packages/core/src/adoption/adoptionState.ts:5"
  - id: F004
    severity: concern
    category: testing
    summary: "`afterEach` in the parity test dereferences `checkout` before it is assigned"
    location: "packages/mcp-server/tests/integration/adoptionParity.test.ts:41"
  - id: F005
    severity: note
    category: consistency
    summary: "Facts list relative paths for docs/ADRs/rules but absolute paths for CI"
    location: "packages/core/src/detection/presentPaths.ts#presentPaths"
  - id: F006
    severity: note
    category: documentation
    summary: "The squadron bullet is a hardcoded placeholder in shipped prompt output"
    location: "packages/core/src/adoption/adoptionFacts.ts#renderSquadronFact"
  - id: F007
    severity: note
    category: duplication
    summary: "Duplicated exhaustiveness switches over `AdoptionOutcome`"
    location: "packages/core/src/adoption/adoptionFacts.ts#describeSourceVolume"
  - id: F008
    severity: note
    category: testing
    summary: "MCP integration test reaches into the core package's fixtures"
    location: "packages/mcp-server/tests/integration/adoptionParity.test.ts:24-28"
  - id: F009
    severity: pass
    category: testing
    summary: "Tests accompany the implementation and cover the decision order end to end"
    location: "packages/core/tests/adoption/adoptionBuild.integration.test.ts"
---

# Review: code — slice 261

**Verdict:** CONCERNS
**Model:** deepseek/deepseek-v4.1-flash

## Findings

### [CONCERN] Facts failures after the state write silently degrade to the error stub while `in_progress` stays persisted

`renderFacts` calls `presentPaths(...)` and `recognizeCi(...)`, which deliberately rethrow non-ENOENT filesystem errors as **plain** `Error`s (`packages/core/src/detection/presentPaths.ts` — `pathPresent` rethrows, and `packages/core/tests/detection/presentPaths.test.ts` asserts an ENOTDIR throw; `recognizeCi`'s `listYamlFiles` also rethrows). Only `planningArtifacts.listFileNames` and `sourceVolume.walkFailure` wrap their errors in `AdoptionError`.

That matters because the resolver runs `persistInProgress(checkoutPath)` **before** `renderFacts` (adoptionResolver.ts, step 5 then step 6). If a project has a regular file named `docs`/`adr` (or any other non-ENOENT error on a probed path), the raw error escapes the resolver, hits `ContextIntegrator.generateContextFromProject`'s generic `catch`, and is converted to the error-stub string — the build neither fails loudly nor rethrows, even though `adoption.state = in_progress` has already been written to `.context-forge.toml`. The next build then resumes the brownfield prompt from a half-completed adoption, and the user never saw an `AdoptionError` with a remedy.

The codebase's stated policy for this module is the opposite (contracts.ts: "The build rethrows it instead of falling back to the concept prompt"; `persistInProgress`'s comment: "a failed write stops the build"). Either wrap the facts-gathering calls (`presentPaths` ×3, `recognizeCi`) in `AdoptionError` with the same remedy text, or gather the facts *before* persisting the state so a failure precedes the write.

### [CONCERN] Stray backup test file committed alongside the real one

`packages/core/tests/services/CoreServiceFactory.test.ts-E` is a byte-for-byte copy of the pre-change `CoreServiceFactory.test.ts` (its header is literally the old blob `e6539010`), still calling `createContextPipeline(FIXTURE_PROJECT_PATH)` with the now-removed single-argument signature. It is dead code: the vitest `include` pattern (`tests/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts}`) and TS's extension set both skip it, so it never runs or compiles, and no test would catch it going stale. It duplicates an entire test file (AGENTS.md: "Do not duplicate logic. Respect DRY") and would become a second broken copy the moment someone renames the referenced symbols. Delete it.

### [CONCERN] `ADOPTION_STATES` / `AdoptionState` are reachable twice through the `@context-forge/core/node` star exports

`adoptionState.ts` re-exports `ADOPTION_STATES` and `AdoptionState` from `../config/ConfigKeys.js`, and `adoption/index.ts` re-exports `adoptionState.js`. `node.ts` then does `export * from './config/index.js'` *and* `export * from './adoption/index.js'`, both of which now surface those two identical names (as `ConfigKeys.ts` explains, they were moved there specifically because `adoptionState.ts` imports `ConfigManager`). Two star exports of the same name are what `TS2308` ("Module … has already exported a member named …") exists for; I could not run `tsc` here, so I have not verified whether the compiler treats the aliases-to-the-same-declaration case as ambiguous — if it does, `pnpm build` in `packages/core` fails and the whole slice is unbuildable. At minimum the re-export is redundant: `contracts.ts`/`adoptionResolver.ts` can import `ADOPTION_STATES`/`AdoptionState` from `../config/ConfigKeys.js` directly (contracts.ts already documents that it "imports nothing" to keep the graph clean), and `adoptionState.ts` can stay a pure helper module. `packages/core/tests/adoption/adoptionState.test.ts` imports these names from `../../src/adoption/index.js`, so the test will keep the duplication alive either way.

### [CONCERN] `afterEach` in the parity test dereferences `checkout` before it is assigned

`checkout` is a module-level `let checkout: string` assigned only inside the single test body, but `afterEach` unconditionally runs `fs.rmSync(checkout, { recursive: true, force: true })`. If `createBrownfieldCheckout()` (or the `client.callTool` call) throws, `afterEach` runs with `checkout === undefined` and throws a `TypeError`, which vitest reports in place of the real failure — exactly the masking AGENTS.md's "get the actual error message before attempting any fix" is about. Guard it (`if (checkout) fs.rmSync(...)`) or assign `checkout` in a `beforeEach`. The same test also leaks a mutated `projects.json` into `fixtureEnv.tempDir` on failure, though `fixtureEnv.cleanup()` covers that.

### [NOTE] Facts list relative paths for docs/ADRs/rules but absolute paths for CI

`presentPaths` returns the *candidate* strings it was given (relative, e.g. `README.md`, `docs`, `.github/copilot-instructions.md`), while `recognizeCi` returns absolute paths, so one Adoption Facts section mixes `- Docs: README.md` with `- CI: /abs/path/.github/workflows/ci.yml`. The integration test asserts both forms (`expect(output).toContain(join(root, '.github/workflows/ci.yml'))`), so this is currently intended — but for a prompt consumed by a model working inside the checkout, the absolute paths are noise. Consider normalizing to candidate-relative form.

### [NOTE] The squadron bullet is a hardcoded placeholder in shipped prompt output

`renderSquadronFact` emits a fixed sentence stating that this `cf` version does not run squadron's probe. The comment marks it as slice-262-owned, which is fine, but the text asserts a capability claim about the running binary that the renderer cannot know. Keep the slice-262 deadline in view — or make the bullet's presence a caller decision — so the sentence cannot outlive the condition it describes.

### [NOTE] Duplicated exhaustiveness switches over `AdoptionOutcome`

`describeOutcome` and `describeSourceVolume` each carry their own `switch` over the same union with an identical `const unhandled: never` default. That is two places to update when slice 263 adds a kind. A single `describe(outcome) => { line, sourceVolume }` would keep the compiler enforced guarantee in one spot and remove the second `JSON.stringify(unhandled)` throw, which is unreachable in both.

### [NOTE] MCP integration test reaches into the core package's fixtures

`BROWNFIELD_GUIDE` resolves to `../../../core/tests/fixtures/brownfield-guide/...`, a path that crosses package boundaries and depends on `packages/core`'s test layout staying put (and on the core package being present in the checkout, which it is in the monorepo but not for a published `@context-forge/mcp`). It is an integration test, so the coupling is tolerable, but a local fixture under `packages/mcp-server/tests/fixtures/` would decouple the two packages' test trees.

### [PASS] Tests accompany the implementation and cover the decision order end to end

Each new module has a focused unit test (`adoptionOutcome.test.ts` pins the threshold, the "artifacts win over 5000 lines", and both programming-error throws; `adoptionState.test.ts` pins the malformed-TOML vs. hand-edited-value distinction; `sourceVolume.test.ts` pins exclusions, symlinks, the capped stop, and both failure modes) plus numbered integration cases 1–13 through the real pipeline, including monorepo scoping, shallow clones, the read-only path, and the guide-without-profile failure. The `ContextIntegrator` tests assert both the swap-and-filter behavior and the "no silent fallback" rethrow, and the mocks use `importOriginal` where real behavior is still wanted. This is test-with-implementation, not test-after.

### Run Digest

- Response length: 8957 chars
- Response is newline-free: no
- Tool calls made: 37
- Tool calls failed: 0
- Stop reason: stop
- Output budget: 384000 tokens
- System prompt: custom
- Settings sources: n/a (non-SDK)
- Reasoning characters: 216605
- Effort: backend default
- Turns: 20
- Tokens — prompt / cached / cache write / completion / reasoning: 1244652 / 1096064 / not computed / 56884 / 52324
- Duration: 249.0 s
- Cost: $0.06 (alias_pricing)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 9
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 9
- Finding-shaped matches — surviving validation: 9

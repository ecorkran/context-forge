---
docType: review
layer: project
reviewType: code
slice: squadron-path
targetKind: slice
rulesSource: project
conventionsSource: AGENTS.md
projectRules: [testing.md, typescript.md]
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/262-slice.squadron-path.md
aiModel: deepseek/deepseek-v4.1-flash
aiProfile: openrouter
status: complete
dateCreated: 20261022
dateUpdated: 20261022
reviewedSha: d15ad406bafd1927c57ef4c114a4caac7335b435
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 32
diffTruncated: false
turns: 17
promptTokens: 1380648
cachedTokens: 1259776
completionTokens: 81328
reasoningTokens: 77612
durationSeconds: 411.9
costUsd: 0.06614
costBasis: alias_pricing
squadronVersion: 0.23.7
findings:
  - id: F001
    severity: concern
    category: error-handling
    summary: "`Math.max(...)` spread in `fenceFor` can throw on large probe output"
    location: "packages/core/src/adoption/adoptionFacts.ts:66"
  - id: F002
    severity: note
    category: error-handling
    summary: "`ENOENT` cannot distinguish a missing `sq` from a missing working directory"
    location: "packages/core/src/detection/squadronProbe.ts:115"
  - id: F003
    severity: note
    category: naming
    summary: "One constant serves both JSON indentation and markdown bullet indentation"
    location: "packages/core/src/adoption/adoptionFacts.ts:38"
  - id: F004
    severity: pass
    category: testing
    summary: "Test coverage matches the design's test list, with tests written alongside the change"
    location: "packages/core/tests/detection/squadronProbe.test.ts"
  - id: F005
    severity: pass
    category: correctness
    summary: "Facts gathering still precedes the state write, and `fileComprehension` stays derived"
    location: "packages/core/src/adoption/adoptionResolver.ts:119-123"
---

# Review: code — slice 262

**Verdict:** CONCERNS
**Model:** deepseek/deepseek-v4.1-flash

## Findings

### [CONCERN] `Math.max(...)` spread in `fenceFor` can throw on large probe output

`const longestRun = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));` spreads one argument per backtick run into a function call. V8 caps the argument count (roughly 10⁵); beyond it `Math.max(...)` throws `RangeError: Maximum call stack size exceeded`. The input is bounded only by `SQUADRON_PROBE_MAX_BUFFER_BYTES` (1 MiB, `squadronProbe.ts:10`), so a probe JSON containing on the order of 10⁵ backtick runs is enough — e.g. a large string field full of backticks or backtick-heavy `entry` values. The throw escapes `renderAdoptionFacts` → `renderFacts` and is not an `AdoptionError`, so `ContextIntegrator.generateContextFromProject` (`ContextIntegrator.ts:104-116`) does not rethrow it: the build silently degrades to the error stub instead of the brownfield prompt. The whole point of `fenceFor` is to make arbitrary JSON safe to embed, so a crash on large-but-valid input defeats its purpose. A fold avoids the argument-count limit entirely:

```ts
let longestRun = 0;
for (const run of text.match(/`+/g) ?? []) longestRun = Math.max(longestRun, run.length);
```

(The likelihood is low — real probe output has few backticks — but the fix is one loop and the failure is a lost build.)

### [NOTE] `ENOENT` cannot distinguish a missing `sq` from a missing working directory

`else if (error.code === 'ENOENT') { resolve({ kind: 'not-found' }); }` maps every spawn-time `ENOENT` to "`sq` was not found on PATH" (rendered at `adoptionFacts.ts:42`). Node also reports `ENOENT` when the `cwd` passed to `execFile` does not exist (a long-standing child_process behavior; I could not confirm it from this repo, only from general Node knowledge), and the callback's error carries no field that separates the two cases. `checkoutPath` is the worktree path when a worktree is selected (`ContextIntegrator.ts:130-131`) while the guide check reads `projectPath`, so a stale worktree path plus an explicit `--it brownfield-adoption` build would state a reason that is factually wrong ("`sq` was not found on PATH" when `sq` is installed). The design (D4/D6) requires a *stated* reason; it does not license a wrong one. Checking the cwd (`statSync`/`pathPresent` on `checkoutPath` before spawning, or distinguishing on the error message) would make the statement accurate. Low impact, flagged for awareness only.

### [NOTE] One constant serves both JSON indentation and markdown bullet indentation

`JSON_INDENT = '  '` is used for the JSON code block (`adoptionFacts.ts:83-87`) and also as the nesting indent for warning bullets (`adoptionFacts.ts:74`, via `renderProbeWarnings`). The two happen to be the same width today but mean different things — one is code-block indentation, the other is markdown list nesting (which must be at least the `- ` marker width, 2, to stay inside the parent bullet). A future change to the JSON indent would silently re-nest the warning list, and the name would then be actively misleading for half its uses. Two names (`JSON_INDENT`, `LIST_INDENT`) would keep the intent legible.

### [PASS] Test coverage matches the design's test list, with tests written alongside the change

Every branch the design's Technical Requirements name is covered by a test that lands with its implementation: `classifyProbeRun` for each `ProbeRun` kind and each D2 step (including `[1]`/`null`/`"x"` and `2`/`missing`/`"1"` for the version check), stderr handling (verbatim, trailing whitespace trimmed, blank lines dropped), `renderSquadronFacts` for both outcomes with and without warnings plus the fence-length rule, `findComprehensionAnalysis` (match, highest index, numeric vs string ordering at 999/1000, wrong `docType` skipped, case-insensitive name, missing directory, non-ENOENT `AdoptionError`), and `runProbeProcess` (not-found, exit codes, stdout/stderr capture, cwd, timeout, buffer overflow) against a fake script run via `process.execPath` — so no test mutates `PATH` (D9) and none depends on the machine's `sq`. The resolver tests assert the probe runs exactly once on the checkout and *never* on greenfield, planned, closed or non-Phase-0 builds, which is the slice's central no-spawn guarantee.

### [PASS] Facts gathering still precedes the state write, and `fileComprehension` stays derived

The comprehension lookup is added to the existing `Promise.all` inside `renderFacts`, so it runs in step 6, i.e. before `persistInProgress` — 261's ordering guarantee ("a probe failure must not leave `in_progress` persisted for a build that produced no prompt") is preserved, and a non-ENOENT read error thrown as `AdoptionError` still stops the build before any write. The value is returned only when defined (no `fileComprehension: undefined` key), copied into `enhancedData` beside `adoptionFacts` (`ContextIntegrator.ts:159-160`) — after `applyProfileFiltering` has run, and `fileComprehension` is not in `PROJECT_FIELDS`, so it can neither be cleared by profile filtering nor stored or set by hand, as D5/D7 require.

### Run Digest

- Response length: 6145 chars
- Response is newline-free: no
- Tool calls made: 32
- Tool calls failed: 0
- Stop reason: stop
- Output budget: 384000 tokens
- System prompt: custom
- Settings sources: n/a (non-SDK)
- Reasoning characters: 311274
- Effort: backend default
- Turns: 17
- Tokens — prompt / cached / cache write / completion / reasoning: 1380648 / 1259776 / not computed / 81328 / 77612
- Duration: 411.9 s
- Cost: $0.07 (alias_pricing)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 5
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 5
- Finding-shaped matches — surviving validation: 5

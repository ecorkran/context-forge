---
docType: tasks
slice: squadron-path
project: context-forge
lld: user/slices/262-slice.squadron-path.md
dependencies:
- 261
projectState: main after slice 261 (complete). `adoption/` selects the brownfield prompt on
  Phase 0 builds and renders Adoption Facts with a fixed "Squadron: unavailable" bullet
  (`renderSquadronFact` in `adoptionFacts.ts`). No code runs `sq`. Design reviewed (round 2
  CONCERNS; the open concern, the `runSquadronProbe` test seam, is resolved in this file).
dateCreated: 20261021
dateUpdated: 20261022
status: complete
---

## Context Summary

- Slice 262 runs `sq probe --json` on every build that selects the brownfield prompt and puts its JSON (or a stated "Squadron: unavailable" reason) plus its stderr lines into Adoption Facts. It also resolves `fileComprehension` to squadron 362's newest comprehension document and shows it as a `Comprehension:` line in Project Context.
- The design's D1–D9, API Contracts, Success Criteria and Verification Walkthrough are the spec. Do not re-derive them and do not widen scope (Excluded list: no interpretation of probe fields beyond `probe_version`, no squadron steps, no `--embed`, no change to 261's detection, outcome order, state or guide check).
- Dependencies: slice 261 (complete). No released squadron has `sq probe` (squadron 366 is unreleased); every automated test uses a fake probe or a fake executable. The machine's `sq` (0.23.6) has no `probe` command, so walkthrough step 1's "unavailable" path is reachable without a special install.
- Core export split: `adoption/` and `detection/` are fs/process-dependent and are exported from `packages/core/src/node.ts` only, through `adoption/index.ts` and `detection/index.ts`.
- Import direction (261 F005): `services/ContextIntegrator.ts` imports from `adoption/contracts.ts` only. `contracts.ts` may import types only; it gets `ProbeOutcome` with `import type` from `detection/squadronProbe.ts`, which imports nothing from `adoption/` or `services/`.
- Missing-file rule (260/261): `ENOENT` means "not present"; every other filesystem error throws. Use `isEnoent` from `detection/pathPresent.ts`; no `existsSync`.
- `ContextIntegrator.ts` is already 397 lines. Add only the one `fileComprehension` copy line there.
- Use the local build (`node packages/cli/dist/index.js`, alias `cfl`). Run `pnpm -r build` before tests that import `@context-forge/core` from `dist` (mcp-server, cli).

### Resolutions of gaps in the design (no product decision; flagged for PM approval with this breakdown)

- **R1 — probe process seam (review round 2 CONCERN).** `squadronProbe.ts` exports `runProbeProcess(command, cwd, limits) → Promise<ProbeRun>`, the only code that calls `execFile`. `runSquadronProbe(checkoutPath)` calls it with `SQUADRON_PROBE_COMMAND` and the default limits, then `classifyProbeRun`. The fake-executable tests call `runProbeProcess` with `{ file: process.execPath, args: [fakeScript, ...] }` and a small timeout, so they need no `PATH` change, no `chmod` and no 10 s wait, and run the same on every OS. `runProbeProcess` is exported from the module for tests but not re-exported from `detection/index.ts`.
- **R2 — probe injection on the MCP side.** D9 wires `squadronProbe` through `createContextPipeline`, but the MCP path (`generateContext` in `packages/mcp-server/src/tools/contextTools.ts`) calls `createContextPipeline` itself, so the parity test could not give both paths the same fake. The seam is at server registration, so the test still drives `context_build` through `client.callTool`: `registerContextTools(server, options?: { squadronProbe?: SquadronProbe })` hands the option to the `context_build` and `template_preview` handlers, which pass it to `generateContext` (new trailing `options?: { squadronProbe? }`), which passes it to `createContextPipeline`. The test helper `createIntegrationClient` accepts the same option. Production callers pass nothing.
- **R3 — fixture location.** D8 names `packages/core/src/detection/__fixtures__/`. This repo keeps test fixtures in `packages/core/tests/fixtures/` and has no `__fixtures__` directory, so the vendored contract example goes in `packages/core/tests/fixtures/squadron-probe/` (`v1.json` + `README.md`).
- **R4 — existing tests that would spawn the real `sq`.** After this slice, any test that selects the brownfield prompt through the default probe runs the machine's `sq`. 261's resolver tests, `adoptionBuild.integration.test.ts` and the parity test are changed to inject a fake probe (Tasks 5T, 10).

## Tasks

- [x] **Task 0: Slice branch** (effort: 1)
  - [x] Read `cf config get git.integration_branch`; empty means the target is `main`.
  - [x] Create `262-slice.squadron-path` from the target if it does not exist, otherwise switch to it.
  - [x] Success: `git branch --show-current` prints `262-slice.squadron-path`.

### Probe types and classification (Development Approach step 1)

- [x] **Task 1: `squadronProbe.ts` types, constants and `classifyProbeRun`** (effort: 2)
  - [x] Create `packages/core/src/detection/squadronProbe.ts` with a header comment naming slice 262 D1–D3.
  - [x] Constants, each defined once here: `SQUADRON_PROBE_COMMAND` (`{ file: 'sq', args: ['probe', '--json'] }`), `SUPPORTED_PROBE_VERSION` (1), `SQUADRON_PROBE_TIMEOUT_MS` (10 000), `SQUADRON_PROBE_MAX_BUFFER_BYTES` (1 MiB).
  - [x] Types `ProbeRun`, `ProbeUnavailableReason`, `ProbeOutcome` exactly as in the design's API Contracts.
  - [x] `classifyProbeRun(run)`: pure; the six D2 steps in order, with an exhaustive `switch` on `run.kind` (`never` default, as `isSelected` in `adoptionResolver.ts` does).
    1. Parse with `JSON.parse(stdout.trim())` inside a `try` that catches only the `SyntaxError` and returns `unreadable-output` (comment why swallowing is correct). Parsed value is `unknown`; a plain object is non-null, not an array, typeof `'object'`. No `any`.
    2. `unsupported-version.value`: the value's `JSON.stringify` when present, `'missing'` when the key is absent.
    3. `available.json` is `stdout.trim()` unchanged, never re-serialized.
  - [x] `warnings` on every outcome come from one helper: split stderr on `\n`, trim trailing whitespace from each line, drop empty lines, otherwise verbatim (D3). `not-found` and `could-not-run` have no stderr, so their `warnings` is `[]`.
  - [x] Success: `pnpm --filter @context-forge/core typecheck` passes; file under ~150 lines.

- [x] **Task 1T: `classifyProbeRun` tests** (effort: 2)
  - [x] Create `packages/core/tests/detection/squadronProbe.test.ts` with a `describe('classifyProbeRun')`:
    1. `not-found` → unavailable, reason `not-found`, warnings `[]`.
    2. `could-not-run` with detail `ETIMEDOUT` → unavailable, reason carries the detail.
    3. Exit 2 with stderr `No such command 'probe'.` → `non-zero-exit` 2; the stderr line is a warning.
    4. Exit 0, stdout `not json` → `unreadable-output`.
    5. Exit 0, stdout `[1]`, `null` and `"x"` (three cases) → `unreadable-output`.
    6. Exit 0, `{"probe_version":2}` → `unsupported-version` with value `2`; `{}` → value `missing`; `{"probe_version":"1"}` → value `"1"` (string is not the number 1).
    7. Exit 0, `  {"probe_version":1,"x":null}\n` → available, `json` equals the trimmed text byte for byte.
    8. Stderr `"WARNING a  \n\n  \nWARNING b\n"` on an available run → warnings `['WARNING a', 'WARNING b']` (leading text and inner spacing kept).
  - [x] Success: the new tests pass.

- [x] **Task 1C: Commit** — `feat: add squadron probe result classifier`

- [x] **Task 2: `runProbeProcess` and `runSquadronProbe`** (effort: 2)
  - [x] In `squadronProbe.ts`, add `runProbeProcess(command: { file: string; args: readonly string[] }, cwd: string, limits: { timeoutMs: number; maxBufferBytes: number }) → Promise<ProbeRun>` (R1). It calls `execFile` from `node:child_process` (no shell, no `env` option) with `cwd`, `timeout`, `maxBuffer` and `encoding: 'utf8'`, and resolves (never rejects):
    1. error `code === 'ENOENT'` → `{ kind: 'not-found' }`;
    2. no error, or numeric `error.code` → `{ kind: 'exited', exitCode, stdout, stderr }` (0 when no error);
    3. any other error → `{ kind: 'could-not-run', detail }`, `detail` = the string `code`, else the `signal`, else the error message.
  - [x] Add `runSquadronProbe(checkoutPath)`: `runProbeProcess(SQUADRON_PROBE_COMMAND, checkoutPath, { timeoutMs: SQUADRON_PROBE_TIMEOUT_MS, maxBufferBytes: SQUADRON_PROBE_MAX_BUFFER_BYTES })`, then `classifyProbeRun`.
  - [x] Export `runSquadronProbe`, `classifyProbeRun`, the constants and the three types from `detection/index.ts`. Do not re-export `runProbeProcess`.
  - [x] Success: `pnpm -r build` passes.

- [x] **Task 2T: Fake-executable tests for `runProbeProcess`** (effort: 2)
  - [x] In `squadronProbe.test.ts`, add `describe('runProbeProcess')`. Each test writes a small `.mjs` script into a temp dir and runs it as `{ file: process.execPath, args: [script] }` (R1). Remove the temp dir in `afterEach`.
    1. Not found: `{ file: 'cf-test-no-such-command-262', args: [] }` → `not-found`.
    2. Exit 0 with stdout and stderr → `exited`, code 0, both captured exactly.
    3. Exit 3 → `exited`, code 3, stderr captured.
    4. `cwd`: the script prints `process.cwd()`; stdout equals the temp dir's real path (`fs.realpathSync`, for macOS `/private/var`).
    5. Timeout: script waits 5 s; limits `{ timeoutMs: 200, … }` → `could-not-run`, detail is a non-empty string.
    6. Buffer: script prints 2 KB; `maxBufferBytes: 1024` → `could-not-run`.
  - [x] One test that `runSquadronProbe` returns `unavailable` without throwing when run in a temp dir (any reason: it depends on the machine's `sq`, so assert only `kind`).
  - [x] Success: tests pass and the file runs in under ~3 s.

- [x] **Task 2C: Commit** — `feat: add squadron probe runner`

### Contract fixture and test (step 2)

- [x] **Task 3: Vendored contract example** (effort: 1)
  - [x] Copy the v1 JSON example from squadron's `project-documents/user/reference/capability-probe-contract.md`, as revised on squadron's `366-slice.dispatcher-routing-and-documentation` branch, verbatim into `packages/core/tests/fixtures/squadron-probe/v1.json` (R3). Read it from the local squadron checkout `../squadron` (`git show 366-slice.dispatcher-routing-and-documentation:project-documents/user/reference/capability-probe-contract.md` in it). If the checkout or branch is missing, write `BLOCKED:` naming it under this task and stop.
  - [x] Add `README.md` beside it with YAML frontmatter per `file-naming-conventions.md`: the source file, the squadron branch and commit it was copied from, and the rule "update only together with the contract".
  - [x] Success: `v1.json` parses as JSON and its `probe_version` is 1.

- [x] **Task 3T: Contract test** (effort: 2)
  - [x] Create `packages/core/tests/detection/squadronProbe.contract.test.ts`. Hold the v1 field names once, as the expected key sets in the test: top level `probe_version`, `sq_version`, `surfaces`, `graph`, `baseline`; each surface entry `analysis_skill_installed`, `entry`, `concept`, `understand_plugin_installed`, `graph_build`; `graph` `present`, `path`, `commit`, `commits_behind`; `baseline` `available`.
  - [x] Assert (D8):
    1. The fixture has exactly these keys at each level, and every entry under `surfaces` has exactly the surface key set (surface names are not checked).
    2. `classifyProbeRun({ kind: 'exited', exitCode: 0, stdout: fixtureText, stderr: '' })` → available, `json` equals `fixtureText.trim()`.
    3. The fixture with `probe_version` set to 2 → unavailable, `unsupported-version`.
  - [x] Success: passes; the field names appear nowhere in `packages/core/src` (`grep -r analysis_skill_installed packages/core/src` is empty).

- [x] **Task 3C: Commit** — `test: add squadron probe v1 contract fixture and test`

### Comprehension document (step 3)

- [x] **Task 4: `comprehensionAnalysis.ts`** (effort: 2)
  - [x] Create `packages/core/src/detection/comprehensionAnalysis.ts` (D5). Defined once here: `COMPREHENSION_FILE_PATTERN` (`/^(\d+)-analysis\.codebase-comprehension\.md$/i`), `COMPREHENSION_DOC_TYPE` (`'analysis'`), `COMPREHENSION_PROFILE_VARIABLE` (`'fileComprehension'`), and the directory segments (`project-documents`, `user/analysis`) as constants.
  - [x] `findComprehensionAnalysis(checkoutPath)`:
    1. `readdir` of `{checkout}/project-documents/user/analysis`; `ENOENT` → `undefined`.
    2. Keep matching names; sort by the numeric index, highest first.
    3. For each, read the file and parse with `parseFrontmatterText` (`introspection/parsers/frontmatterParser.ts`); the first whose `docType`, trimmed and lowercased, equals `COMPREHENSION_DOC_TYPE` wins.
    4. Return `user/analysis/{filename}` (posix separators, relative to `project-documents/`), or `undefined`.
    5. Any non-ENOENT error from `readdir` or `readFile` → `AdoptionError` naming the path, with `cause` (as 261's reads do). A file deleted between `readdir` and `readFile` (ENOENT) is skipped.
  - [x] Export the function and `COMPREHENSION_PROFILE_VARIABLE` from `detection/index.ts`.
  - [x] Success: `pnpm -r build` passes; file under ~80 lines.

- [x] **Task 4T: `findComprehensionAnalysis` tests** (effort: 2)
  - [x] Create `packages/core/tests/detection/comprehensionAnalysis.test.ts`. Fixture files use the frontmatter squadron 362's skill writes (`docType: analysis` plus the usual fields), copied from a real 362 output if the squadron checkout has one, else built from `file-naming-conventions.md`.
    1. One match → `user/analysis/944-analysis.codebase-comprehension.md`.
    2. `940-…` and `944-…` → 944. `1000-…` and `999-…` → 1000 (numeric, not string, order).
    3. Highest index with `docType: notes` → the next one.
    4. `944-Analysis.Codebase-Comprehension.md` → matched.
    5. Non-matching names only (`944-analysis.other.md`) → `undefined`.
    6. No `user/analysis/` directory → `undefined`.
    7. `analysis/` dir with mode `000` → throws `AdoptionError` (`it.skipIf` root or win32, as 261's permission tests do).
  - [x] Success: the new tests pass.

- [x] **Task 4C: Commit** — `feat: resolve squadron comprehension analysis document`

### Probe through the resolver (steps 4–5)

- [x] **Task 5: `renderSquadronFacts` and the probe in resolver step 6** (effort: 3)
  - [x] In `packages/core/src/adoption/adoptionFacts.ts`, delete `renderSquadronFact` and 261's fixed text. Add `renderSquadronFacts(outcome: ProbeOutcome): string[]` returning the section's lines, already prefixed, exactly in D6's layout:
    1. Available: `- Squadron probe (\`sq probe --json\`), verbatim:`, the fenced `json` block indented two spaces, then the warnings lines.
    2. Unavailable: `- Squadron: unavailable. {reason}.`, then the warnings lines only when there are any.
    3. Warnings: `- Probe warnings (stderr, verbatim): none`, or `- Probe warnings (stderr, verbatim):` followed by one nested `  - {line}` per warning.
  - [x] One `describeUnavailableReason(reason)` with an exhaustive `switch` holds the five D2 reason texts. The "could not run" text builds "10 s" and "1 MiB" from `SQUADRON_PROBE_TIMEOUT_MS` and `SQUADRON_PROBE_MAX_BUFFER_BYTES`, not literals.
  - [x] Fence: one backtick longer than the longest backtick run in the JSON, minimum three.
  - [x] `AdoptionFactsInput` gains `probe: ProbeOutcome`. In `renderAdoptionFacts`, drop the squadron entry from `bullets` and append `...renderSquadronFacts(input.probe)` after the mapped bullets, so its lines are not prefixed twice.
  - [x] In `adoption/contracts.ts`, add `SquadronProbe = (checkoutPath: string) => Promise<ProbeOutcome>` (`import type` only). Update the file's header comment: it imports types only.
  - [x] `createAdoptionResolver(options: { stateWrites; squadronProbe: SquadronProbe })` — required here. In `renderFacts`, run `readHistory` and `options.squadronProbe(checkoutPath)` concurrently with `Promise.all` and pass `probe` to `renderAdoptionFacts`. Facts (including the probe) are still gathered before `persistInProgress`, as 261's comment requires.
  - [x] `createContextPipeline` options gain `squadronProbe?: SquadronProbe`; pass `options.squadronProbe ?? runSquadronProbe` to `createAdoptionResolver`. Document the option in the JSDoc.
  - [x] Success: `pnpm -r typecheck` and `pnpm -r build` pass.

- [x] **Task 5T: Renderer and resolver probe tests** (effort: 2)
  - [x] In `packages/core/tests/adoption/adoptionFacts.test.ts`, replace the `renderSquadronFact` test and pass a `probe` in the shared `render()` input. Add:
    1. Available, no warnings → the JSON block equals the input `json`; the warnings line reads `none`.
    2. Available with two warnings → two nested bullets in order.
    3. Each of the five reasons → `- Squadron: unavailable. {text}.` with the expected text; `non-zero-exit` with a stderr line also shows it; `not-found` shows no warnings line.
    4. JSON containing ` ``` ` inside a string value → four-backtick fence; JSON containing ```` ```` ```` → five.
  - [x] In `packages/core/tests/adoption/adoptionResolver.test.ts`, add a shared fake probe factory that records the paths it was called with and returns a given `ProbeOutcome`. Pass it to every `createAdoptionResolver` call (R4). Add:
    1. Selected build → the probe was called once with the checkout path; facts contain its rendering.
    2. Greenfield, already-planned, adoption-closed and a Phase 2 instruction → the probe was never called.
    3. Fake probe returning `unavailable` → selection still succeeds (D4).
  - [x] `packages/core/tests/adoption/adoptionBuild.integration.test.ts`: pass a fake probe returning `{ kind: 'unavailable', reason: { kind: 'not-found' }, warnings: [] }` to every `createContextPipeline` call (R4). Update any assertion on the old squadron text to the D6 text.
  - [x] `grep -rn "does not run squadron" packages` finds nothing.
  - [x] Success: `pnpm --filter @context-forge/core test` passes.

- [x] **Task 5C: Commit** — `feat: render squadron probe output in adoption facts`

### Comprehension through the resolver and prompt (step 5)

- [x] **Task 6: `fileComprehension` in resolver step 6** (effort: 2)
  - [x] In `adoption/contracts.ts`, add `fileComprehension?: string` on the selected branch of `AdoptionSelection`, as in API Contracts.
  - [x] `assertGuideSupportsAdoption` returns the `brownfield-adoption` profile's variable list (the `ProfileMap` entry it already reads) instead of `void`. No second parse of the guide.
  - [x] In `renderFacts`, add `findComprehensionAnalysis(checkoutPath)` to the `Promise.all`, only when the profile includes `COMPREHENSION_PROFILE_VARIABLE` (else `undefined`). Return `{ facts, fileComprehension }`.
  - [x] The returned selection includes `fileComprehension` only when defined (no `fileComprehension: undefined` key).
  - [x] Success: `pnpm -r typecheck` passes; `adoptionResolver.ts` under ~180 lines.

- [x] **Task 6T: Resolver comprehension tests** (effort: 1)
  - [x] In `adoptionResolver.test.ts`:
    1. Comprehension document present and profile lists `fileComprehension` → `fileComprehension` set.
    2. Same document, guide fixture whose profile omits `fileComprehension` (a copy of `tests/fixtures/brownfield-guide` with that word removed) → no `fileComprehension` key.
  - [x] Success: all adoption tests pass.

- [x] **Task 6C: Commit** — `feat: resolve fileComprehension in the adoption resolver`

- [x] **Task 7: Data type, integrator and Project Context line** (effort: 1)
  - [x] `EnhancedContextData` (`types/context.ts`) gains `fileComprehension?: string` with a one-line comment: derived per build, never stored. Do not add it to `PROJECT_FIELDS`.
  - [x] `ContextIntegrator.ts`: beside the `adoptionFacts` line, set `enhancedData.fileComprehension` when `adoption?.selected` and the value is defined. Nothing else changes there.
  - [x] `SectionBuilder.buildProjectInfoSection`: push `Comprehension: {path}` directly after the `Slice Plan:` line when set and non-blank, same guard style.
  - [x] Test in `packages/core/tests/services/SectionBuilder.test.ts`: `Comprehension:` appears right after `Slice Plan:` when set; absent when undefined or blank.
  - [x] Success: `pnpm -r typecheck` and `pnpm -r build` pass; the new SectionBuilder test passes.

- [x] **Task 7C: Commit** — `feat: show the comprehension document in Project Context`

- [x] **Task 8: MCP probe option (R2)** (effort: 1)
  - [x] Export `SquadronProbe` (via `adoption/index.ts`) and `runSquadronProbe` from `@context-forge/core/node`; confirm with `pnpm -r build`.
  - [x] In `packages/mcp-server/src/tools/contextTools.ts`: `generateContext` gains a trailing `options?: { squadronProbe?: SquadronProbe }`, passed to `createContextPipeline`; `registerContextTools(server, options?)` takes the same option and both the `context_build` and `template_preview` handlers pass it to `generateContext`. No production caller changes.
  - [x] `createIntegrationClient` in `packages/mcp-server/tests/helpers/integrationSetup.ts` accepts the same optional option and passes it to `registerContextTools`.
  - [x] Success: `pnpm -r typecheck` passes; `packages/cli/tests/commands/build.test.ts`'s `toHaveBeenCalledWith` assertion still passes unchanged (the CLI passes no probe).

- [x] **Task 8C: Commit** — `feat(mcp): accept a squadron probe option for context tools`

### Integration and parity (step 6)

- [x] **Task 9: Pipeline integration tests** (effort: 2)
  - [x] In `packages/core/tests/pipeline-integration.test.ts`, add a `describe('brownfield build with an injected squadron probe')` that builds a temp brownfield checkout (copy the setup in `adoptionBuild.integration.test.ts`: the `brownfield-guide` fixture and 2100 generated source lines) through `createContextPipeline(dir, { adoptionStateWrites: 'read-only', squadronProbe: fake })`:
    1. Available fake with a null field and one WARNING line → prompt contains the JSON block and that line.
    2. Unavailable fake (`non-zero-exit` 2 with stderr) → `- Squadron: unavailable.` with the reason and the stderr line.
    3. `project-documents/user/analysis/944-analysis.codebase-comprehension.md` present → `Comprehension: user/analysis/944-analysis.codebase-comprehension.md` in Project Context.
    4. Absent → no `Comprehension` text anywhere in the prompt.
  - [x] If the file would pass ~300 lines, put these in a new `packages/core/tests/adoption/squadronPath.integration.test.ts` instead.
  - [x] Success: passes.

- [x] **Task 9C: Commit** — `test: cover squadron probe and comprehension in pipeline integration`

- [x] **Task 10: Parity test extension** (effort: 1)
  - [x] In `packages/mcp-server/tests/integration/adoptionParity.test.ts`, pass one fake probe (available, with a warning) to both `createIntegrationClient({ squadronProbe })` in `beforeAll` and the `createContextPipeline` call, keep the MCP side on `client.callTool({ name: 'context_build', … })`, and add the comprehension document to the checkout. Assert the prompts are identical and both contain the JSON block and the `Comprehension:` line.
  - [x] Success: `pnpm -r build` then `pnpm --filter @context-forge/mcp-server test` passes.

- [x] **Task 10C: Commit** — `test: extend CLI/MCP parity test to the squadron path`

### Verification

- [x] **Task 11: Full verification and walkthrough** (effort: 3)
  - [x] Run format, lint, `pnpm -r typecheck`, `pnpm -r build`, `pnpm -r test`. All pass.
  - [x] New source files are under ~300 lines (`wc -l`); `ContextIntegrator.ts` grew by the `fileComprehension` line only.
  - [x] Non-brownfield output unchanged: `cfl build --json` in this repo (planned, never selects the brownfield prompt) from the target read in Task 0 (temporary `git worktree add`, removed afterward) and from the slice branch are byte-identical.
  - [x] Walkthrough step 1 with the local build in a brownfield clone (a public repo over 2000 source lines, `--depth 1` into `/tmp/bf`, `cfl init`, guide v0.22.2+): with `PATH=/usr/bin:/bin` → "`sq` was not found on PATH"; with the installed `sq` 0.23.6 (no `probe`) → `non-zero-exit` and Typer's stderr line. Use `--json` and extract Adoption Facts if plain `cfl build` prints only a summary.
  - [x] Walkthrough steps 2–4 need a squadron that includes slice 366. Install it from the squadron checkout's `366-slice.dispatcher-routing-and-documentation` branch into a throwaway venv and put that `sq` first on PATH for these steps only. Step 2's live run (pre-authorized): `claude -p "/cf:build"` in `/tmp/bf` with a `cf` shim for the local build on PATH; record whether the agent finds its surface entry and names the squadron path without running the probe. Step 4: if `/sq:analysis understand` can't run headless, place a 362-format document by hand and record that. If the 366 branch can't be installed, write `BLOCKED:` naming the failure under this task.
  - [x] Full run: `pnpm -r typecheck`, `pnpm -r build`, `pnpm -r test` and eslint all pass (core 2024 tests, mcp-server 240, cli 866); the repo has no separate format script.
  - [x] Source sizes: `squadronProbe.ts` 137 lines, `comprehensionAnalysis.ts` 65, `adoptionFacts.ts` 175, `adoptionResolver.ts` 169; `ContextIntegrator.ts` 397 -> 398 (the `fileComprehension` line only).
  - [x] Non-brownfield output: `cf build --json` in this repo is byte-identical from main and from the slice branch (each built in turn, compared with `cmp`; no worktree).
  - [x] Step 1 (`expressjs/express` clone, guide v0.22.5, isolated `CONTEXT_FORGE_DATA_DIR`, `PATH=/usr/bin:/bin`): facts show "Squadron: unavailable. `sq` was not found on PATH."; brownfield output 2246+ lines; `adoption.state` set to `in_progress`.
  - [x] Step 1 variant (installed `sq` without probe, `non-zero-exit`): not reachable, since installed `sq` 0.23.7 has `sq probe`; covered by the `classifyProbeRun` and `runProbeProcess` unit tests.
  - [x] Steps 2–3 (installed `sq` 0.23.7): facts contain the probe JSON verbatim (`graph.present` false, nulls as null) and "Probe warnings (stderr, verbatim): none".
  - [x] Step 2 live run (`claude -p "/cf:build"`, `cf` shim, tools limited to cf/Read/Glob/Grep): the agent named the squadron path from the verbatim probe, found the `claude-code` surface entry (`analysis_skill_installed` and `understand_plugin_installed` true), saw `graph.present` false, asked once whether to build the graph with `/understand`, and did not run the probe itself.
  - [x] Step 4: `/sq:analysis understand` not run headless; a 362-format document (squadron's `944-analysis.codebase-comprehension.md`) placed by hand in `project-documents/user/analysis/`; build showed `Comprehension: user/analysis/944-analysis.codebase-comprehension.md` in Project Context; removing it removed the line. The no-document case is covered by integration tests.
  - [x] Record each step's outcome under this task. Any defect is fixed in its own commit typed by what it is.
  - [x] In the slice design, record R1–R4 under D1, D8 and D9 as implementation notes (the `runProbeProcess` seam, the fixture location, the MCP registration option, the fake probe in existing tests).
  - [x] Success: all automated checks pass, each walkthrough step's outcome or `BLOCKED:` line is recorded, and the design names R1–R4.

- [x] **Task 11C: Commit** — `docs: record slice 262 verification walkthrough`

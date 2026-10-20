---
docType: slice-design
slice: squadron-path
project: context-forge
parent: project-documents/user/architecture/260-slices.brownfield-adoption.md
dependencies:
- 261
interfaces:
- 265
dateCreated: 20261020
dateUpdated: 20261020
status: not_started
turns: 36
promptTokens: 2393178
cachedTokens: 2285740
cacheWriteTokens: 107378
completionTokens: 26325
durationSeconds: 249.4
costUsd: 1.843236
usageRounds: 1
pricedRounds: 1
---

# Slice Design: squadron-path

## Overview

Slice 261 builds the brownfield adoption prompt with an **Adoption Facts** section whose squadron bullet always says "unavailable, this cf version does not run the probe". The guide prompt therefore always takes the CF-only path.

This slice replaces that bullet with the real thing. On every build that selects the brownfield prompt, cf runs `sq probe --json` in the checkout, checks `probe_version`, and appends either:

- the probe's JSON verbatim, plus any warnings the probe wrote to stderr, or
- a plain "Squadron: unavailable" statement with the reason (not installed, exited non-zero, timed out, unreadable output, unsupported version), plus any stderr lines.

It also resolves the new `fileComprehension` variable to squadron 362's newest `{n}-analysis.codebase-comprehension.md`, by filename and `docType`, and passes nothing when none exists.

cf never interprets the probe beyond its version. Which surface the agent is on, whether the graph needs building, and which path to take are the guide prompt's job (arch: facts in core, judgement in the prompt).

## Value

- **Squadron becomes the normal adoption path.** With squadron installed on a surface the probe lists, guide v0.22.2's brownfield prompt sees the probe output and runs the squadron steps: graph, `entry`, `concept`, then a re-run of `cf build`.
- **The re-run picks up squadron's analysis.** After `/sq:analysis understand` writes its comprehension document, the next `cf build` names it as `Comprehension:` in the Project Context, and the prompt uses it as evidence for the architecture.
- **Nothing about squadron is silent.** Every probe failure is a stated reason, and every null field arrives with the probe's own stderr explanation beside it.

## Technical Scope

Included:
- `detection/squadronProbe.ts`: run `sq probe --json` and classify the result into a `ProbeOutcome` (D1–D4).
- `detection/comprehensionAnalysis.ts`: find squadron 362's comprehension document (D5).
- Replace 261's squadron bullet in `renderAdoptionFacts` with the probe section (D6).
- Resolver step 6 (261 Data Flow) gathers the probe and the comprehension document beside the other render-only facts. `AdoptionSelection` gains `fileComprehension`.
- `EnhancedContextData.fileComprehension`, a `Comprehension:` line in the Project Context section, and a `comprehension` template alias.
- A vendored copy of the probe contract's v1 JSON example as a test fixture, and the contract test against it (D8).

Excluded:
- Interpreting `surfaces`, `graph`, `baseline` or any null field. cf reads `probe_version` only.
- Running any squadron step (`graph_build`, `entry`, `concept`). The agent does that, as the guide prompt says.
- `cf build --embed` for the comprehension document (D7).
- Any change to detection, the outcome order, adoption state or the guide check (all 261).
- Probing on builds that don't select the brownfield prompt. Greenfield, planned and Phase 1–7 builds never spawn `sq`.

## Dependencies

### Prerequisites
- **Slice 261:** `adoption/` module, `createAdoptionResolver`, `renderAdoptionFacts` with the squadron bullet in its own function, `AdoptionSelection`, `AdoptionError`, `createContextPipeline(projectPath, options)`.
- **Squadron with slice 366** (`sq probe`). It's implemented on squadron's `366-slice.dispatcher-routing-and-documentation` branch (`src/squadron/probe/`) and is not yet released. cf doesn't need it to build or test: every test uses a fake probe (D9). Without it, users get "unavailable" with a reason.
- **ai-project-guide ≥ v0.22.2** (unchanged from 261): the brownfield prompt reads the probe output from Adoption Facts and lists `fileComprehension` in the `brownfield-adoption` profile.

### Interfaces Required
- **Probe contract** `capability-probe-contract.md`, `probe_version` 1. Field names locked at squadron commit 32b3c609. Squadron 366's revision keeps every name and widens `analysis_skill_installed` and `understand_plugin_installed` to "bool or null"; the fixture (D8) uses the revised document.
- Readings from squadron 366's design (squadron-brownfield 4b3afa91), confirmed against its probe code. cf doesn't act on any of them; they shape the test fixtures and the walkthrough:
  - `graph.path` is null whenever `graph.present` is false.
  - `analysis_skill_installed` on `claude-code` is true only with a 366-era `sq/analysis.md` dispatcher that routes `understand`.
  - `understand_plugin_installed` means installed, not enabled.
  - Exit 0 whenever the object is built; a field it can't determine is null and gets one WARNING log line on stderr; exit 1 with an error on stderr and nothing on stdout when the probe breaks.
  - The probe resolves the project from its working directory (`Path.cwd()` → git toplevel), so cf must run it with `cwd` set to the checkout.
- **Squadron 362's output:** `project-documents/user/analysis/{index}-analysis.codebase-comprehension.md`, frontmatter `docType: analysis`. Each run takes a new index (lowest unused ≥ 940) and never overwrites.
- `parseFrontmatterText` (`introspection/parsers/frontmatterParser.ts`), `ContextProfileParser` (already used by 261's guide check).

## Architecture

### Component Structure

```
packages/core/src/detection/
  squadronProbe.ts          SQUADRON_PROBE_COMMAND, SUPPORTED_PROBE_VERSION, limits (D1, D3)
                            runSquadronProbe(checkoutPath) → Promise<ProbeOutcome>
                            classifyProbeRun(run: ProbeRun) → ProbeOutcome      (pure)
  comprehensionAnalysis.ts  findComprehensionAnalysis(checkoutPath) → Promise<string | undefined>  (D5)
packages/core/src/adoption/
  adoptionFacts.ts          renderSquadronFacts(outcome: ProbeOutcome) replaces 261's fixed bullet (D6)
  adoptionResolver.ts       step 6 also runs the probe and finds the comprehension document
  contracts.ts              AdoptionSelection gains fileComprehension?; SquadronProbe type
packages/core/src/services/
  ContextIntegrator.ts      copies selection.fileComprehension into enhancedData
  SectionBuilder.ts         "Comprehension: …" line in Project Context
  TemplateProcessor.ts      `comprehension` alias
  CoreServiceFactory.ts     createContextPipeline options gain squadronProbe? (default runSquadronProbe)
packages/core/src/types/context.ts
                            EnhancedContextData.fileComprehension?: string
```

The probe and the comprehension lookup are facts, so they sit in `detection/` with 261's other facts. The probe's process call is a thin wrapper around a pure classifier, so every outcome is tested without spawning anything.

### Data Flow

```
adoptionResolver(projectPath, checkoutPath, instruction)     (261 steps 1–5 unchanged)
  6. render-only facts, gathered concurrently:
       history, docs, ADRs, rule files, CI                    (261)
       squadronProbe(checkoutPath)                            → ProbeOutcome
         execFile('sq', ['probe','--json'], { cwd: checkoutPath, timeout, maxBuffer })
         → ProbeRun → classifyProbeRun → { kind: 'available', json, warnings }
                                       | { kind: 'unavailable', reason, warnings }
       profile lists fileComprehension?                       (profile parsed by 261's guide check)
         yes → findComprehensionAnalysis(checkoutPath)        → 'user/analysis/944-…md' | undefined
         no  → undefined
     renderAdoptionFacts(…, probe)
  └─ { selected: true, instruction, facts, fileComprehension? }
integrator: enhancedData.fileComprehension = selection.fileComprehension   (only when defined)
SectionBuilder: Project Context → "Comprehension: user/analysis/944-analysis.codebase-comprehension.md"
```

The probe runs on every build that selects the brownfield prompt, including `template_preview` (the probe writes nothing) and an explicit `--it brownfield-adoption`. It isn't cached: the graph and installs change during adoption, and the re-run after squadron's steps must see the new state.

### State Management

None. The probe outcome and the comprehension path are recomputed on every selected build and never stored.

## Technical Decisions

### D1 — Running the probe
Status: decided
- `execFile` from `node:child_process` (no shell), command `SQUADRON_PROBE_COMMAND = { file: 'sq', args: ['probe', '--json'] }`, `cwd: checkoutPath`. The checkout is where adoption runs, and the probe resolves its project from its working directory.
- Limits, each one constant in `squadronProbe.ts`: `SQUADRON_PROBE_TIMEOUT_MS` (10 s; the probe runs a few read-only git commands) and `SQUADRON_PROBE_MAX_BUFFER_BYTES` (1 MiB).
- The wrapper turns the call into a `ProbeRun` and nothing else:
  - `{ kind: 'not-found' }` for ENOENT,
  - `{ kind: 'timed-out' }` when the timeout kills it,
  - `{ kind: 'spawn-failed', message }` for any other spawn error (EACCES, buffer overflow),
  - `{ kind: 'exited', exitCode, stdout, stderr }`.
- No environment changes. Squadron's log format (text or JSON) is the user's setting, and D3 carries its lines either way.
- Rejected: `gitExec`; it's git-specific (credential env, network hints). Rejected: a shell string; nothing here needs a shell.

### D2 — Classification and the version check
Status: decided
- `classifyProbeRun` is pure and returns `ProbeOutcome`:
  ```ts
  type ProbeOutcome =
    | { kind: 'available'; json: string; warnings: string[] }
    | { kind: 'unavailable'; reason: ProbeUnavailableReason; warnings: string[] };
  ```
- In order:
  1. `not-found` → unavailable, "`sq` was not found on PATH".
  2. `timed-out` → unavailable, "`sq probe` did not finish within 10 s".
  3. `spawn-failed` → unavailable, "`sq probe` could not run: {message}".
  4. Non-zero exit → unavailable, "`sq probe --json` exited with code {n}". A squadron older than the probe lands here (Typer's "No such command", exit 2), and its stderr line says so.
  5. `JSON.parse(stdout.trim())` throws, or the result isn't a plain object → unavailable, "`sq probe --json` printed output that is not a JSON object".
  6. `probe_version` isn't the number `SUPPORTED_PROBE_VERSION` (1) → unavailable, "`sq probe` reports probe_version {value}; this cf supports 1". A missing value reads as "missing".
  7. Otherwise available, with `json` = `stdout.trim()`, unchanged.
- `ProbeUnavailableReason` is a discriminated union (`kind` per case above, with its data), rendered to text in one place (D6), so no reason text is written twice.
- Only `probe_version` is checked. The contract guarantees the shape for a version, squadron's own contract test (366 D11) enforces it, and the guide prompt is the only reader of the other fields. Checking more fields would duplicate squadron's test and reject the additive fields its versioning rules allow.
- Rejected: scraping a JSON object out of noisy stdout. The contract says stdout holds exactly one object; anything else is a broken probe and is reported as such.

### D3 — Stderr is carried, not parsed
Status: decided
- The probe explains each null field in a WARNING line on stderr, and a failed probe explains itself there too. cf carries stderr into the facts with both outcomes, so a null is never left unexplained and a failure keeps squadron's own message.
- Lines are taken verbatim: split on newlines, trailing whitespace trimmed, empty lines dropped. cf doesn't match the log format or tie a line to a field. The format depends on squadron's log settings, and matching it would break when squadron changes it.
- `MAX_PROBE_WARNING_LINES` (20) caps the list. Past it, one line says "… {n} more stderr lines omitted". The probe writes one line per undeterminable field, so the cap is only hit by something unusual, such as a traceback.

### D4 — The probe never fails the build
Status: decided
- Every failure in D2 is an `unavailable` outcome, rendered with its reason. The arch requires a stated "squadron unavailable", never a silent skip and never a build failure; the CF-only path is a full path.
- This isn't a silent fallback: the reason is in the prompt, and the guide prompt has the agent say in one line why it took the CF-only path.

### D5 — Resolving `fileComprehension`
Status: decided
- `findComprehensionAnalysis(checkoutPath)` lists `project-documents/user/analysis/` in the checkout and keeps filenames matching `^(\d+)-analysis\.codebase-comprehension\.md$` (case-insensitive). Squadron 362 writes exactly that name.
- Candidates are tried from the highest index down. The first whose frontmatter has `docType: analysis` (trimmed, case-insensitive, via `parseFrontmatterText`) wins. Each 362 run takes a new index and never overwrites, so the highest index is the newest analysis.
- Returns the path relative to `project-documents/` (`user/analysis/944-analysis.codebase-comprehension.md`), the form the prompt already uses for task files. Returns `undefined` when the directory is missing or nothing matches. Other read errors throw `AdoptionError` naming the path, as 261's D2 and D6 do for their reads.
- Resolved only when the guide's `brownfield-adoption` profile lists `fileComprehension`. The resolver already parses that profile for 261's guide check, so the guide stays the owner of what the profile carries.
- Absent → the field stays undefined: no `Comprehension:` line, no placeholder, no empty string in the output.
- Derived on each build and never stored: it isn't added to `PROJECT_FIELDS`, so it can't be set by hand or go stale, and 261's `applyProfileFiltering` (which clears only stored artifact fields) never touches it. Rejected: a stored project field, for the reasons 261's D6 rejects `fileArch` pointers.
- It's independent of the probe. A comprehension document left by an earlier run is passed even when the probe now reports squadron unavailable; the prompt treats it as evidence either way.

### D6 — Rendering the squadron part of Adoption Facts
Status: decided
- `renderSquadronFacts(outcome)` replaces 261's fixed bullet; nothing else in the section changes.
- Available:
  ````
  - Squadron probe (`sq probe --json`), verbatim:
    ```json
    {"probe_version":1,"sq_version":"…","surfaces":{…},"graph":{…},"baseline":{…}}
    ```
  - Probe warnings (stderr, verbatim): none
  ````
  With warnings, each line becomes a nested bullet under "Probe warnings (stderr, verbatim):".
- Unavailable: `- Squadron: unavailable. {reason}.`, then the stderr lines as above when there are any. The words "Squadron: unavailable" match the case the guide prompt names ("the section says squadron is absent or unreadable").
- The fence around the JSON is one backtick longer than the longest run of backticks in it (minimum three), so no string value inside the JSON can close it early.
- 261's "This cf version does not run squadron's capability probe" text is removed.

### D7 — `fileComprehension` in the prompt, not in `--embed`
Status: decided
- `EnhancedContextData.fileComprehension?: string`. `SectionBuilder.buildProjectInfoSection` adds `Comprehension: {path}` after `Slice Plan:` when set. `TemplateProcessor` adds the alias `comprehension`, following `concept`, `arch` and `plan`.
- `cf build --embed` doesn't embed it. The embedder works from stored `ProjectData` fields, and brownfield adoption needs an agent that can read the repository anyway, so a model without file access can't use the brownfield prompt. Embedding would need a new path through the embedder for no real user.

### D8 — Contract test against a vendored contract example
Status: decided
- cf's tests can't read the squadron repository. The contract's v1 JSON example is copied verbatim into `packages/core/src/detection/__fixtures__/squadron-probe-v1.json`. A sibling `README.md` records the source (squadron `project-documents/user/reference/capability-probe-contract.md`, as revised in slice 366) and the rule: update it only together with the contract.
- `squadronProbe.contract.test.ts` holds the v1 field names once, as the test's expected set: `probe_version`, `sq_version`, `surfaces.<s>.{analysis_skill_installed, entry, concept, understand_plugin_installed, graph_build}`, `graph.{present, path, commit, commits_behind}`, `baseline.{available}`. It asserts:
  - the fixture has exactly these keys at every level, for every surface entry (surface names aren't checked; the contract says so);
  - `classifyProbeRun` on the fixture, exit 0, gives `available` with the fixture text unchanged;
  - the fixture with `probe_version` 2 gives `unavailable`.
- The field list exists only in the test. cf's runtime reads `probe_version` alone, so a renamed field breaks this test and the guide prompt, never cf's code.
- One live test runs the real `sq probe --json` and asserts it classifies as `available` with the same top-level keys. It runs only when `sq` is on PATH (`it.skipIf`, reported as skipped), so CI without squadron stays green and a developer machine with squadron catches drift. 265's real-repo runs are the end-to-end check.

### D9 — Probe injection for tests
Status: decided
- `SquadronProbe = (checkoutPath: string) => Promise<ProbeOutcome>` in `adoption/contracts.ts`. `createAdoptionResolver({ stateWrites, squadronProbe })` takes it, and `createContextPipeline` options gain `squadronProbe?: SquadronProbe`, defaulting to `runSquadronProbe`.
- Without this, every build test that selects the brownfield prompt would run whatever `sq` the machine has, and its output would depend on that machine's installs and graph. Integration tests pass a fake; `cf build` and `context_build` use the default.
- Rejected: putting a fake `sq` on `PATH` in tests. It mutates process environment across a test file and differs by OS.

### Patterns and Conventions
- Constants defined once in `squadronProbe.ts`: the command, `SUPPORTED_PROBE_VERSION`, timeout, buffer, warning-line cap. The filename pattern and `docType` value are defined once in `comprehensionAnalysis.ts`.
- `ProbeRun`, `ProbeOutcome` and `ProbeUnavailableReason` are discriminated unions, switched exhaustively.
- The parsed probe value is `unknown`, narrowed to a plain object before `probe_version` is read. No `any`.

## Implementation Details

### API Contracts

```ts
// detection/squadronProbe.ts
export const SUPPORTED_PROBE_VERSION = 1;
export type ProbeRun =
  | { kind: 'not-found' }
  | { kind: 'timed-out' }
  | { kind: 'spawn-failed'; message: string }
  | { kind: 'exited'; exitCode: number; stdout: string; stderr: string };
export type ProbeUnavailableReason =
  | { kind: 'not-found' }
  | { kind: 'timed-out' }
  | { kind: 'spawn-failed'; message: string }
  | { kind: 'non-zero-exit'; exitCode: number }
  | { kind: 'unreadable-output' }
  | { kind: 'unsupported-version'; value: string };   // "missing" when absent
export type ProbeOutcome =
  | { kind: 'available'; json: string; warnings: string[] }
  | { kind: 'unavailable'; reason: ProbeUnavailableReason; warnings: string[] };
export function classifyProbeRun(run: ProbeRun): ProbeOutcome;
export function runSquadronProbe(checkoutPath: string): Promise<ProbeOutcome>;

// detection/comprehensionAnalysis.ts
export function findComprehensionAnalysis(checkoutPath: string): Promise<string | undefined>;

// adoption/contracts.ts (261, extended)
export type SquadronProbe = (checkoutPath: string) => Promise<ProbeOutcome>;
export type AdoptionSelection =
  | { selected: false }
  | { selected: true; instruction: typeof BROWNFIELD_ADOPTION_INSTRUCTION; facts: string;
      fileComprehension?: string };
```

## Integration Points

### Provides to Other Slices
- **265 (end-to-end verification):** the squadron path end to end. Its squadron run checks the probe section and the `Comprehension:` line on a real repository.
- **Guide prompt:** the probe JSON and stderr lines in Adoption Facts, and `fileComprehension` in the Project Context. The prompt's "Do not run the probe yourself" holds because cf always supplies one or the other statement.

### Consumes from Other Slices
- **261:** the resolver's step 6, `renderAdoptionFacts`, `AdoptionSelection`, `AdoptionError`, the parsed profile from the guide check, and `createContextPipeline`'s options. 261's selection rule, state and guide check are unchanged.
- **Squadron 366 / probe contract v1:** a squadron without the probe gives "unavailable" with its exit code and stderr. A future `probe_version` 2 gives "unavailable" until cf adds support.
- **Squadron 362:** the comprehension filename and `docType`. If squadron renames either, nothing resolves and the prompt works from the repo alone. The fixture tests for D5 use the exact name and frontmatter 362's skill writes.

## Success Criteria

### Functional Requirements
- On a build that selects the brownfield prompt, Adoption Facts holds exactly one of:
  - the probe JSON verbatim, with stderr warnings or "none";
  - "Squadron: unavailable." with the right reason for each case: `sq` missing, non-zero exit, timeout, non-JSON output, a JSON non-object, `probe_version` 2 or missing. Any stderr lines are included.
- A probe that exits 0 with a null field and a WARNING line shows both the JSON and that line.
- `fileComprehension`:
  - one comprehension document present → `Comprehension: user/analysis/{n}-analysis.codebase-comprehension.md` in Project Context;
  - several → the highest index; a highest-index file with the wrong `docType` is skipped for the next;
  - none, or no `user/analysis/` directory → no `Comprehension:` line and no placeholder text anywhere;
  - a guide profile without `fileComprehension` → not resolved.
- Greenfield, planned and non-Phase-0 builds never spawn `sq` (asserted with a fake probe that records calls).
- CLI and MCP builds of the same fixture with the same fake probe are identical (261's parity test, extended).

### Technical Requirements
- Unit tests: `classifyProbeRun` for every `ProbeRun` and every D2 branch; stderr handling (verbatim, blank lines dropped, cap and omitted count); `renderSquadronFacts` for both outcomes, with and without warnings, and the fence-length rule; `findComprehensionAnalysis` (match, highest index, wrong `docType` skipped, case-insensitive name, missing directory, non-ENOENT error throws `AdoptionError`); `runSquadronProbe` against a small fake executable for not-found, exit codes, stderr capture and timeout.
- Contract test and live test (D8).
- Integration tests in `pipeline-integration.test.ts` with an injected probe: available, unavailable, comprehension present and absent.
- `pnpm -r build`, lint, typecheck and all existing tests pass. 261's tests that asserted the fixed squadron bullet are updated to the D6 text.

### Integration Requirements
- 261's behavior is otherwise unchanged: selection, state writes, the guide check and every non-brownfield build produce the same output as before this slice.
- With squadron 366's probe installed, guide v0.22.2's prompt takes the squadron path on a listed surface with `analysis_skill_installed` true (Walkthrough step 2).

### Verification Walkthrough

Use the local build: `alias cfl="node $PWD/packages/cli/dist/index.js"` from the repo root after `pnpm -r build`. Guide ≥ v0.22.2. The squadron steps need a squadron install that includes slice 366 (until it's released, install from the squadron `366-slice.dispatcher-routing-and-documentation` branch) with the analysis pack installed for Claude Code.

1. **No squadron.** In a brownfield fixture repo (261's walkthrough step 2: a clone over 2000 source lines, `cfl init`), with `sq` not on PATH:
   ```bash
   PATH=/usr/bin:/bin cfl build | sed -n '/### Adoption Facts/,/^### [^A]/p'
   # expect: "- Squadron: unavailable. `sq` was not found on PATH."
   # and no "Comprehension:" line in Project Context
   ```
2. **Squadron available, squadron path taken.**
   ```bash
   sq probe --json | jq .probe_version          # expect: 1
   cfl build | sed -n '/### Adoption Facts/,/^### [^A]/p'
   # expect: "Squadron probe (`sq probe --json`), verbatim:" and a json block equal to `sq probe --json`
   #         "Probe warnings (stderr, verbatim): none" (or the probe's own WARNING lines)
   ```
   Run `/cf:build` in Claude Code in that repo. Expect the agent to find its `claude-code` entry and say it is taking the squadron path. With no graph, it asks the one "Build the graph?" question. It must not run the probe itself.
3. **A null field explained.** Delete the graph's `meta.json` (`.understand-anything/meta.json`), keeping `knowledge-graph.json`, then `cfl build`. Expect `"commit":null` in the JSON and a warning line such as `graph commit unknown: … is absent` under "Probe warnings".
4. **Comprehension resolves.** After `/sq:analysis understand` writes `project-documents/user/analysis/9nn-analysis.codebase-comprehension.md`:
   ```bash
   cfl build | grep '^Comprehension:'
   # expect: Comprehension: user/analysis/9nn-analysis.codebase-comprehension.md (the highest index)
   ```
5. **Unsupported version and broken output** are covered by unit tests on `classifyProbeRun`, not manual steps.

## Risk Assessment

### Technical Risks
- **MCP server PATH.** An MCP client may launch cf's MCP server with a smaller PATH than the user's shell, so `context_build` reports "`sq` was not found on PATH" while `cf build` finds it.
- **Contract drift.** The fixture is a copy. A squadron change that bumps nothing but renames a field would pass cf's contract test until someone updates the fixture.

### Mitigation Strategies
- The not-found reason names PATH, so the cause is visible in the prompt and the agent says it. 265 checks the MCP path on a real setup. If it proves common, an `sq` path setting is a follow-up, not part of this slice.
- Squadron's own contract test (366 D11) fails on a rename against the same document, and its versioning rules forbid renaming without a version bump. cf's live test catches drift on any machine with `sq` installed.

## Implementation Notes

### Development Approach
1. `squadronProbe.ts`: types, constants, `classifyProbeRun` with unit tests; then `runSquadronProbe` with the fake-executable tests.
2. Vendored fixture, its README, the contract test and the live test.
3. `comprehensionAnalysis.ts` with tests.
4. `renderSquadronFacts`; update 261's renderer tests.
5. Resolver step 6, `SquadronProbe` injection through `createAdoptionResolver` and `createContextPipeline`, `AdoptionSelection.fileComprehension`, integrator, `SectionBuilder`, `TemplateProcessor` alias.
6. Integration tests with an injected probe, the parity-test extension, then the walkthrough.

Effort: 2/5.

### Special Considerations
- The probe adds one process spawn to each brownfield build, at most 10 s when it hangs and typically well under a second. Builds that don't select the brownfield prompt pay nothing.
- The probe reads the user's home directory (installed commands and plugins). cf passes its output through and stores nothing.

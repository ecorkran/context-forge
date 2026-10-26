---
docType: tasks
slice: adoption-primitives-for-sq-onboard
project: context-forge
lld: user/slices/271-slice.adoption-primitives-for-sq-onboard.md
dependencies:
- collapse-adoption-state
- pure-cf-build
projectState: main after slice 269 (collapse adoption state, merged). `adoption/`
  exports `readAdoptionOptOut`, `readPlanningFacts` (absolute paths), `decideStage`,
  `decideOutcome`, `legacyAdoptionStateNotice` and the line constants in `adoptionLines.ts`,
  where `adoptionNavLines` maps outcomes to lines inline. `detection/comprehensionAnalysis.ts`
  still exists and is exported. `cf init` warns and exits 0 on a failed step. `cf
  prompt get` resolves the project from `--project` or cwd only. `findProjectByCwd`
  reads `process.cwd()` directly. With `--json` in argv, `handleError` writes its
  own JSON shape to stderr. Global `cf` is the published npm package, not the local
  build.
dateCreated: 20261025
dateUpdated: 20261026
status: complete
turns: 39
promptTokens: 3343512
cachedTokens: 3223934
cacheWriteTokens: 119502
completionTokens: 36489
durationSeconds: 324.4
costUsd: 2.331174
usageRounds: 3
pricedRounds: 3
usageByModel:
  claude-opus-5-5:
    rounds: 3
    costUsd: 2.3311746
    completionTokens: 36489
revision_number: 2
---

## Context Summary

- Slice 271 gives `sq onboard` read-only primitives from cf: a detection report (`cf detect` / MCP `project_detect`), `cf init --json` with a non-zero exit on a failed step, and `cf prompt get --comprehension` with an Adoption Inputs section. cf's onboarding surfaces stop on a brownfield repo, and cf's last squadron file lookup is deleted.
- The slice design (`user/slices/271-slice.adoption-primitives-for-sq-onboard.md`) is the spec. Decisions D1–D10, API Contracts, Success Criteria and the Verification Walkthrough are referenced by name below. Read the named section before each task. Copy JSON shapes, error codes and sentences from the design; do not retype them from memory.
- Order follows the design's Development Approach: deletion and ban guard, `outcomeLine`, core report, `cf detect`, `project_detect`, log sinks, `cf init`, prompt delivery, onboarding recipe, validation. Every commit leaves lint, typecheck and tests passing.
- Excluded (design): guide prompt and adoption-guide changes, README and CLI/MCP reference docs, `MIN_GUIDE_VERSION`, and the `pureBuild.test.ts` comprehension fixture (all 272). No `comprehensionPath` input on MCP `prompt_get` (D7). No change to `cf build`, `cf next` routing or the opt-out key. If you find something outside scope, file an issue and continue.
- Local build: run `pnpm -r build`, then test with `node packages/cli/dist/index.js` (written `cf` in the walkthrough). Tests run per package with `pnpm --filter @context-forge/{core|cli|mcp} test [pattern]`. Root `pnpm lint` and `pnpm typecheck` cover the workspace. There is no format script; ESLint is the formatter gate. Tests isolate the project store with `CONTEXT_FORGE_DATA_DIR` (see `packages/cli/tests/integration/build.integration.test.ts`).
- JSON-mode trap: `packages/cli/src/index.ts` calls `setJsonMode()` whenever `--json` is in argv, and `handleError` then writes a different JSON shape to stderr. `cf detect --json` and `cf init --json` must write the D5 envelope to stdout themselves and must never route a `--json` failure through `handleError`.
- Conventions: every literal (codes, labels, sentences, step names, statuses) is defined once and imported, including in tests. No silent fallbacks. No `any`. Source files stay near 300 lines.
- Branch: `271-slice.adoption-primitives-for-sq-onboard`, forked from the target. This file has no merge or push task; Phase 7 merges after code review.
- Next planned slice: 272 (docs and guide alignment). It documents this slice's API Contracts and sends them to squadron.

---

## Tasks

### 1. Branch setup

- [x] **1.1 Create the slice branch** — effort 1
  - [x] Run `pwd` and confirm it is the repo root. Run `cf config get git.integration_branch`. Its value, or `main` when empty, is the target
  - [x] Run `git status --short`. It must be empty. Anything else: stop and commit or report it first
  - [x] Confirm you are on the target, then `git checkout -b 271-slice.adoption-primitives-for-sq-onboard {target}`. If the branch already exists, switch to it
  - [x] **Success:** `git branch --show-current` prints `271-slice.adoption-primitives-for-sq-onboard`

---

### 2. Delete the comprehension lookup and guard the ban (D10)

- [x] **2.1 Delete `comprehensionAnalysis`** — effort 1
  - [x] Delete `packages/core/src/detection/comprehensionAnalysis.ts` and `packages/core/tests/detection/comprehensionAnalysis.test.ts`
  - [x] Remove the `findComprehensionAnalysis` / `COMPREHENSION_PROFILE_VARIABLE` export line from `packages/core/src/detection/index.ts`
  - [x] Leave the comprehension-doc setup in `pureBuild.test.ts` alone (272)
  - [x] **Success:** `grep -rn "comprehensionAnalysis\|findComprehensionAnalysis\|COMPREHENSION_PROFILE_VARIABLE" packages --exclude-dir=node_modules --exclude-dir=dist` returns nothing. `pnpm typecheck` passes

- [x] **2.2 Add the squadron-ban guard test** — effort 2
  - [x] Create `packages/core/tests/squadronBan.test.ts`. Locate the repo's `packages/` directory from the test file's own path (`import.meta.url`), not from cwd
  - [x] Scan every `packages/*/src/**/*.ts` file. Skip `node_modules`, `dist` and every `tests` directory (D10: tests may name squadron patterns)
  - [x] Fail on: the text `codebase-comprehension`; the text `sq probe`; and a process invocation of `sq`, matched as `'sq'` or `"sq"` passed as an argument (e.g. to `execFile`/`spawn`). Define the forbidden patterns once at the top of the file
  - [x] The failure message lists each offending file and line
  - [x] Add one case that runs the same matcher on an in-memory string containing each pattern and asserts it is caught, so the scan can't pass by matching nothing
  - [x] Assert the scan visited at least one file per package (`core`, `cli`, `mcp-server`), so a wrong root fails loudly. The glob also covers any other `packages/*/src`: `packages/context-forge` has none today, and an ignored leftover `packages/electron/src` may exist locally (no matches today). A match in either is a real finding, not a test bug
  - [x] **Success:** `pnpm --filter @context-forge/core test squadronBan` passes

- [x] **2.3 Commit** — `refactor: remove comprehension lookup and guard the squadron ban`
  - [x] `pnpm lint`, `pnpm typecheck` and `pnpm --filter @context-forge/core test` pass first

---

### 3. One outcome-to-line mapping (D9)

- [x] **3.1 Extract `outcomeLine`** — effort 1
  - [x] In `packages/core/src/adoption/adoptionLines.ts`, export `outcomeLine(outcome: AdoptionOutcome): string | null`: `BROWNFIELD_LINE` for `brownfield`, `INCOMPLETE_ADOPTION_LINE` for `adoption-incomplete`, `null` for `opted-out`, `already-planned` and `greenfield`. Use an exhaustive `switch` with a `never` default, as `adoptionNavLines` does
  - [x] Change `adoptionNavLines` and `codeSignalLines` so every outcome-to-line choice goes through `outcomeLine`. Keep their existing behavior: `adoption-incomplete` still returns before any source walk, and a failed walk still returns `inconclusiveDetectionLine`
  - [x] **Success:** `grep -n "BROWNFIELD_LINE\|INCOMPLETE_ADOPTION_LINE" packages/core/src/adoption/adoptionLines.ts` shows each constant used only in its definition and in `outcomeLine`

- [x] **3.2 Test `outcomeLine`** — effort 1
  - [x] In `packages/core/tests/adoption/adoptionLines.test.ts`, one case per outcome kind, asserting against the imported constants or `null`
  - [x] **Success:** existing `adoptionLines` tests and `pnpm --filter @context-forge/core test adoption` pass unchanged. `pnpm --filter @context-forge/cli test next` and `pnpm --filter @context-forge/mcp test workflow` pass

- [x] **3.3 Commit** — `refactor: extract outcomeLine as the one outcome-to-line mapping`

---

### 4. Adoption artifacts (D3 `artifacts`)

- [x] **4.1 Implement `readAdoptionArtifacts`** — effort 2
  - [x] Create `packages/core/src/adoption/adoptionInputs.ts`. Export `AdoptionArtifacts` (`concept: string | null`, `derivedArchitectures: string[]`, `existingStatePlan: string | null`) and `readAdoptionArtifacts(root)`
  - [x] Concept from `resolveConceptPath(root)` (`introspection/ArtifactIntrospector.ts`); the other two from `readPlanningFacts(root)`. Do not scan planning files a second way. Note: `resolveConceptPath` moved to `introspection/parsers/projectGuideFile.ts` to satisfy the D8 import-layer lint rule
  - [x] Convert every path to root-relative with `/` separators (D3). Do the conversion in one exported helper, which `detectProject` reuses for CI and other facts
  - [x] Errors propagate unchanged (`AdoptionError` from `readPlanningFacts`)
  - [x] Export the module from `adoption/index.ts`
  - [x] **Success:** `pnpm typecheck` passes

- [x] **4.2 Test `readAdoptionArtifacts`** — effort 1
  - [x] New `packages/core/tests/adoption/adoptionInputs.test.ts`, using `tests/helpers/adoptionFixtures.ts`
  - [x] Cases: empty directory (all `null` / `[]`); concept only; derived architecture without retroactive plan; complete adoption (all three set). Assert root-relative `/` paths built from the fixture's file-name constants
  - [x] **Success:** `pnpm --filter @context-forge/core test adoptionInputs` passes

- [x] **4.3 Commit** — `feat: add readAdoptionArtifacts`

---

### 5. Report types and error envelope (D3, D5, D8 versioning)

- [x] **5.1 Implement `detectionReport.ts`** — effort 2
  - [x] Create `packages/core/src/adoption/detectionReport.ts` with:
    1. `REPORT_VERSION = 1` and `INIT_REPORT_VERSION = 1`, side by side, each with a comment stating the D3 bump rule
    2. `DETECTION_ERROR_CODES`: `path-not-found`, `invalid-config`, `unreadable-planning`, `source-unmeasurable`, `worktree-of-registered-project`, `internal`, and a `DetectionErrorCode` type derived from it. This is the only place the codes are written
    3. `DetectionError extends Error` with a `code: DetectionErrorCode`
    4. `ProjectDetection` (the result type `detectProject` returns) and `DetectionReport` (the D3 JSON shape), with `facts.source` and `facts.history` as the D3 tagged unions (`measured` / `known` booleans)
    5. `toDetectionReport(detection): DetectionReport`. `outcome` is `AdoptionOutcome.kind` passed straight through, with no second list of outcome values
    6. `serializeDetectionReport(report): string` and `serializeErrorEnvelope(reportVersion, code, message): string`, producing the D5 object `{ reportVersion, error: { code, message } }`. Both use one `JSON.stringify` call with fixed indentation, so CLI and MCP output is byte-identical
  - [x] Map `HistoryFact` to `{ known, … }` here (D3), not in callers
  - [x] Export from `adoption/index.ts`
  - [x] **Success:** `pnpm typecheck` passes

- [x] **5.2 Test the serializers** — effort 1
  - [x] New `packages/core/tests/adoption/detectionReport.test.ts`. Build a `ProjectDetection` by hand for one outcome and assert the serialized JSON matches the D3 shape: field names, `reportVersion`, the `source` and `history` unions both ways (measured/unmeasured, known/unknown)
  - [x] Assert `serializeErrorEnvelope` output parses to exactly `{ reportVersion, error: { code, message } }`, for both version constants
  - [x] **Success:** `pnpm --filter @context-forge/core test detectionReport` passes

- [x] **5.3 Commit** — `feat: add detection report types and error envelope`

---

### 6. `detectProject` (D2, D4, D5)

- [x] **6.1 Implement `detectProject(root)`** — effort 3
  - [x] Create `packages/core/src/adoption/projectDetection.ts`. `root` must be absolute; a non-absolute root is a programming error (throw a plain `Error`), because callers resolve or refuse relative paths (D5)
  - [x] Missing path or not a directory: throw `DetectionError` `path-not-found`, with a message naming the path and which case it is (D2)
  - [x] Gather every fact on every call (D4): `readAdoptionOptOut`, `readPlanningFacts`, `readAdoptionArtifacts`, `measureSourceVolume`, `readHistory`, `presentPaths(root, DOC_PATHS)`, `presentPaths(root, ADR_DIRS)`, `presentPaths(root, RULE_FILE_PATHS)`, `recognizeCi`. Export `DOC_PATHS` and `ADR_DIRS` from `detection/index.ts` if they are not already exported. Note: `detectProject` takes an optional second parameter, a source-volume measurer, for test injection
  - [x] Wrap each `AdoptionError` at its call with that call's code (D5): opt-out read → `invalid-config`; planning facts and artifacts → `unreadable-planning`. Keep the original message and set `cause`. No class-to-code mapping table. Other errors propagate untouched
  - [x] A failed source walk (`AdoptionError` from `measureSourceVolume`) becomes `{ measured: false, reason }`. Then decide the stage with `decideStage`. If the stage is `unplanned`, throw `source-unmeasurable` with the walk's message as is: it already ends with `OVERRIDE_REMEDY` (`detection/sourceVolume.ts`), so do not append it again. Otherwise use the stage as the outcome (D4)
  - [x] When measured, `capped` is true exactly when counting stopped at `BROWNFIELD_MIN_SOURCE_LINES` (read how `measureSourceVolume` reports this; do not recompute)
  - [x] Notices (D3): the legacy notice when `ignoredLegacyValue` is set, then `outcomeLine(outcome)` when not `null`
  - [x] All fact paths root-relative via the 4.1 helper. Root-level CI in a monorepo keeps its climbing `../` path (D2)
  - [x] Write nothing: no config, no store, no git command that writes
  - [x] Export from `adoption/index.ts`
  - [x] **Success:** `pnpm typecheck` passes

- [x] **6.2 Test `detectProject` per outcome** — effort 2
  - [x] New `packages/core/tests/adoption/projectDetection.test.ts`. One case each for `opted-out`, `adoption-incomplete`, `already-planned`, `brownfield`, `greenfield`. Assert `outcome`, `artifacts` and `notices` (against `outcomeLine` and imported constants)
  - [x] Brownfield fixture: write at least `BROWNFIELD_MIN_SOURCE_LINES` non-blank `.ts` lines (import the constant). Assert `capped: true`
  - [x] A non-git directory gives `history.known: false` with a reason
  - [x] A monorepo subdirectory (git root with `.github/workflows/ci.yml`, project in `packages/app`) is judged on the subfolder, and CI is reported as `../../.github/workflows/ci.yml`
  - [x] A stored legacy `adoption.state` value puts the legacy notice first in `notices`
  - [x] Every path in the result except `projectRoot` is relative (assert none starts with `/`)
  - [x] **Success:** `pnpm --filter @context-forge/core test projectDetection` passes

- [x] **6.3 Test `detectProject` errors and the unmeasured walk** — effort 2
  - [x] `path-not-found` for a missing path and for a file path
  - [x] `invalid-config` for an out-of-set `adoption.state` and for unparseable TOML
  - [x] `unreadable-planning` for an unlistable planning directory (permission `000`; skip on platforms where `chmod` has no effect, as existing planning tests do). Note: tested via `ENOTDIR` (a file where `architecture/` should be), not `chmod`
  - [x] A failing source walk, injected the way `adoptionLines.test.ts` injects one: on a planned project the result has `source.measured: false`; on an unplanned project it throws `source-unmeasurable` with `OVERRIDE_REMEDY` in the message.
  - [x] Assert each error's `code` against `DETECTION_ERROR_CODES`
  - [x] **Success:** `pnpm --filter @context-forge/core test adoption` passes

- [x] **6.4 Commit** — `feat: add detectProject`
  - [x] `pnpm lint`, `pnpm typecheck` and `pnpm --filter @context-forge/core test` pass first

---

### 7. `cf detect` (D1, D5, API Contracts)

- [x] **7.1 Implement the command** — effort 2
  - [x] Create `packages/cli/src/commands/detect.ts` and register it in `packages/cli/src/index.ts`. Options: `--path <dir>` (default: the current directory, resolved to absolute) and `--json` (use `withJsonOption`)
  - [x] Never look up a registered project (D1: works unregistered)
  - [x] With `--json`: success writes `serializeDetectionReport` plus a newline to stdout, exit 0. A `DetectionError` writes `serializeErrorEnvelope(REPORT_VERSION, code, message)` to stdout, exit 1. Any other error writes the envelope with code `internal` and the original message, exit 1. Do not call `handleError` in this path (see the JSON-mode trap in Context Summary)
  - [x] Without `--json`: print the outcome and each notice, nothing more (API Contracts). Errors go through `handleError`
  - [x] Add `detect` to any command list the CLI help tests enumerate
  - [x] **Success:** `pnpm -r build`, then `node packages/cli/dist/index.js detect --path /tmp/does-not-exist --json; echo $?` prints a `path-not-found` envelope on stdout and `1`

- [x] **7.2 Test `cf detect`** — effort 2
  - [x] New `packages/cli/tests/commands/detect.test.ts`, following the style of the nearest existing command test
  - [x] `--json` on a greenfield and a brownfield fixture: stdout parses to the D3 shape with the right `outcome`; exit 0
  - [x] Each D5 code reachable from the CLI (`path-not-found`, `invalid-config`, `unreadable-planning`, `source-unmeasurable`, `internal`, forced by mocking `detectProject` with `vi.mock` of `@context-forge/core/node` to throw a plain `Error`): stdout is the envelope, nothing is written to stderr by the error path, exit 1. Note: the `source-unmeasurable` case uses a chmod-000 directory instead of the mock; it is skipped when running as root or on win32.
  - [x] Without `--json`: output holds the outcome and the notices
  - [x] **No-writes test** (Success Criteria): with `CONTEXT_FORGE_DATA_DIR` set to a temp dir, snapshot a brownfield fixture's tree (paths, sizes, mtimes), its `.context-forge.toml` and the store directory, run `cf detect --json`, snapshot again, assert equal. Assert the fixture is still unregistered
  - [x] **Success:** `pnpm --filter @context-forge/cli test detect` passes

- [x] **7.3 Commit** — `feat: add cf detect command`

---

### 8. MCP `project_detect` (D1, D5, API Contracts)

- [x] **8.1 Implement the tool** — effort 2
  - [x] Create `packages/mcp-server/src/tools/detectTools.ts` with `registerDetectTools(server)`, and register it in `packages/mcp-server/src/index.ts` next to `registerProjectTools`
  - [x] Input: `path`, required string. A non-absolute path returns the `path-not-found` envelope, with a message saying the path must be absolute; never resolve it (D5)
  - [x] Success: text result with the `serializeDetectionReport` string. The CLI writes that same string plus one newline. Failure: `isError: true`, text is the envelope. Other errors: envelope with `internal`
  - [x] Annotations: `readOnlyHint: true`. Description says it judges the given directory and works unregistered
  - [x] **Success:** `pnpm typecheck` passes

- [x] **8.2 Test the tool** — effort 1
  - [x] New `packages/mcp-server/tests/detectTools.test.ts`, following `projectTools.test.ts`: success on a greenfield fixture, relative path refused as `path-not-found` with `isError`, a missing absolute path refused the same way
  - [x] **Success:** `pnpm --filter @context-forge/mcp test detectTools` passes

- [x] **8.3 CLI/MCP parity test** — effort 2
  - [x] New `packages/mcp-server/tests/integration/detectParity.test.ts`. For each of the five outcomes, build a fixture, spawn the built CLI (`detect --path <dir> --json`, locate `packages/cli/dist/index.js` as `packages/cli/tests/integration/build.integration.test.ts` does) and call the `project_detect` handler. Assert the strings are byte-identical, allowing only the CLI's trailing newline
  - [x] If `packages/cli/dist/index.js` is missing, the test fails with a message saying to run `pnpm -r build`. It never skips
  - [x] **Success:** after `pnpm -r build`, `pnpm --filter @context-forge/mcp test detectParity` passes

- [x] **8.4 Commit** — `feat: add project_detect MCP tool`. Note: `serverLifecycle.test.ts` tool list gained `project_detect`.

---

### 9. Log sinks for `cf init --json` (D8 "Stdout stays pure JSON")

- [x] **9.1 Add the `LogSink` type** — effort 1
  - [x] Create `packages/cli/src/output/logSink.ts`: `type LogSink = (line: string) => void`, plus `STDOUT_SINK` (wraps `console.log`) and `STDERR_SINK` (writes the line and a newline to `process.stderr`)
  - [x] **Success:** `pnpm typecheck` passes

- [x] **9.2 Thread the sink through the three actions** — effort 2
  - [x] For each action below, add an optional `log: LogSink = STDOUT_SINK` parameter, replace every `console.log` it reaches (including in helpers it calls) with `log`, and add a test in the named file: with a capturing sink, the progress lines go to the sink and `console.log` is not called. Existing callers pass nothing and behave the same
    1. `guidesInstallAction` in `commands/guides.ts`; test in `guides.test.ts`
    2. `installCommandsAction` in `commands/commandInstaller.ts` (in `InstallScopeOptions` or as a parameter). `uninstallCommandsAction` stays unchanged: it logs on its own and `cf init` never calls it; test in `commandInstaller.test.ts`
    3. `setupIdeAction` in `commands/setup-ide.ts`; test in `setup-ide.test.ts`
  - [x] **Success:** `pnpm --filter @context-forge/cli test guides commandInstaller setup-ide` passes

- [x] **9.3 Commit** — `refactor: let guide, command and IDE actions take a log sink`

---

### 10. `cf init` step results, exit code, `--json` and the codebase line (D8, D9)

- [x] **10.1 Extract the init steps** — effort 2
  - [x] Move the step code out of `init.ts` into `packages/cli/src/commands/initSteps.ts`: git init, registration, gitignore, guides, commands, IDE, plus `isGitWorktreeOf`, `isInsideGitWorkTree` and `ensurePersonalConfigGitignored`. A pure move: output, exit codes and order unchanged
  - [x] **Success:** `pnpm --filter @context-forge/cli test init` passes with no test changes; `init.ts` and `initSteps.ts` are each under ~300 lines

- [x] **10.2 Commit** — `refactor: extract cf init steps into initSteps.ts`

- [x] **10.3 Record step results and exit 1 on a failed step** — effort 2
  - [x] In `initSteps.ts`, define the step names `git`, `register`, `gitignore`, `guides`, `commands`, `ide` and statuses `ok`, `skipped`, `failed` once, and a `StepResult` type (`step`, `status`, optional `message`). Each step returns a `StepResult` and takes a `LogSink`
  - [x] Statuses per D8: git already present → `skipped`; "already installed" guides → `skipped`; `--lite` marks `guides`, `commands`, `ide` `skipped`; `--no-ide` marks `commands` and `ide` `skipped`; a target without command delivery (copilot, cursor) marks `commands` `skipped`. A caught step error → `failed` with its message
  - [x] Stop deciding "already installed" from message text. Today `init.ts` matches `'already installed'` in the error from `GuideManager.install` (`core/src/guides/GuideManager.ts`, the `info.installed` check), which is a user-facing label used as logic. Throw a typed `GuideAlreadyInstalledError` there (same message, exported from core) and have the guides step test `instanceof`. Any other caller that matches the message text switches too (`grep -rn "already installed" packages/*/src`). Note: `GuideAlreadyInstalledError` was added to core `GuideManager` and exported.
  - [x] `register` is `ok` for both a new and an existing project. Which one is not in `StepResult`: the step function also returns `registration` (`created` / `existing`) for the top-level field in 10.6. `register` is never `failed`: a registration throw is not caught per step and aborts the command as today (10.6 gives its JSON form)
  - [x] Keep today's human output for each step (success/warn/dim lines) through the sink
  - [x] After all steps run, `process.exitCode = 1` when any step is `failed`, with or without `--json` (D8, deliberate behavior change)
  - [x] The worktree refusal without `--json` stays as today: warning, exit 0
  - [x] **Success:** `pnpm typecheck` passes

- [x] **10.4 Test step results and exit code** — effort 2
  - [x] Extend `packages/cli/tests/commands/init.test.ts`: a forced guide-install failure (e.g. `--strategy bogus`) exits 1 without `--json`; an all-ok run exits 0; `--lite` and `--no-ide` give the `skipped` statuses above; the worktree refusal without `--json` still exits 0. Note: the init tests that asserted call args now expect a trailing log-sink function.
  - [x] **Success:** `pnpm --filter @context-forge/cli test init` passes

- [x] **10.5 Commit** — `feat: record cf init step results and exit 1 on a failed step`

- [x] **10.6 Implement `cf init --json`** — effort 2
  - [x] Add `--json` (`withJsonOption`). In JSON mode pass `STDERR_SINK` to every step, and run `git init` with `stdio: ['ignore', 'pipe', 'pipe']`, writing its output to stderr. Note: it is `stdio: ['ignore', 2, 2]` (stderr's fd) instead of pipes; same effect.
  - [x] Build the result object once, after all steps, and serialize it in one place at the very end of the action, so 10.9 only adds to `notices` before that write and doesn't restructure it
  - [x] On completion write one D8 object to stdout: `reportVersion` (`INIT_REPORT_VERSION`), `projectId`, `projectName`, `projectPath`, `registration` (`created` / `existing`), `steps`, `notices`, `ok`. A failed step is not an error envelope: `ok: false`, exit 1
  - [x] Worktree refusal with `--json`: `serializeErrorEnvelope(INIT_REPORT_VERSION, 'worktree-of-registered-project', …)` on stdout, exit 1. Any other throw before or instead of step results, including a registration throw (D8: no project id exists, so no step-result object is written): the envelope with `internal`, exit 1. Never `handleError` in JSON mode
  - [x] **Success:** `pnpm typecheck` passes

- [x] **10.7 Test `cf init --json`** — effort 2
  - [x] Stdout holds exactly one JSON object and nothing else, for an all-ok run and for a forced guide failure (`guides` step `failed`, `ok: false`, exit 1). Progress text appears only on stderr
  - [x] The worktree refusal gives the envelope with `worktree-of-registered-project`, exit 1. Its shape equals `serializeErrorEnvelope` output (same parser as `cf detect`)
  - [x] A forced registration throw (mock the store's `create`) gives the envelope with `internal`, exit 1, and no step-result object
  - [x] `reportVersion` equals the imported `INIT_REPORT_VERSION`
  - [x] **Success:** `pnpm --filter @context-forge/cli test init` passes

- [x] **10.8 Commit** — `feat: add cf init --json`

- [x] **10.9 Print the codebase line (D9)** — effort 1
  - [x] After the setup steps and before the 10.6 write, call `detectProject(cwd)`. Print `outcomeLine(outcome)` when non-null, through the sink; in JSON mode put it in `notices` instead
  - [x] A detection error prints `inconclusiveDetectionLine(message)` (JSON mode: into `notices`). It is not a step and never sets `failed` or the exit code
  - [x] Tests in `init.test.ts`: brownfield fixture prints `BROWNFIELD_LINE`; greenfield prints neither `BROWNFIELD_LINE` nor `INCOMPLETE_ADOPTION_LINE`; a forced detection error prints the inconclusive line and exits 0; `--json` on brownfield has the line in `notices`
  - [x] **Success:** `pnpm --filter @context-forge/cli test init` passes

- [x] **10.10 Commit** — `feat: print a codebase line from cf init`
  - [x] `pnpm lint`, `pnpm typecheck` and `pnpm --filter @context-forge/cli test` pass first

---

### 11. Prompt delivery: `cf prompt get --path` and `--comprehension` (D7)

- [x] **11.1 Parameterize project lookup by directory** — effort 2
  - [x] Change `findProjectByCwd` in `packages/cli/src/utils/project.ts` to take an optional directory (defaulting to `process.cwd()` at the call, not a magic value). Existing callers are unchanged
  - [x] Add `--path <dir>` to `cf prompt get` (`commands/prompt.ts`). With `--path`, resolve the registered project at that directory through `findProjectByCwd(dir)` (worktree-aware). Without it, resolution is unchanged
  - [x] `--path` together with `--project`: `UserError`. No registered project at `--path`: the existing project-not-found error
  - [x] The resolved project's operation path is the single root for `{project}` substitution and for 11.5
  - [x] Tests in `prompt.test.ts`: from an unrelated cwd, `--path <project>` substitutes that project's name; `--path` + `--project` errors; an unregistered `--path` gives the not-found error
  - [x] **Success:** `pnpm --filter @context-forge/cli test prompt` and `pnpm --filter @context-forge/cli test project` pass

- [x] **11.2 Commit** — `feat: add cf prompt get --path`

- [x] **11.3 Implement `renderAdoptionInputs`** — effort 2
  - [x] In `adoption/adoptionInputs.ts`, add the profile variable constant `COMPREHENSION_PROFILE_VARIABLE = 'fileComprehension'` (D10: the guide's name, written once), the section heading `## Adoption Inputs`, the four labels and the sentence "No codebase comprehension analysis was provided." as constants (API Contracts)
  - [x] `renderAdoptionInputs(root, comprehensionPath: string | null, artifacts: AdoptionArtifacts): string`. The comprehension path shows root-relative with `/` when inside `root`, absolute otherwise. Absent artifacts render `none`. Several derived architectures are joined with `, ` on the one label line
  - [x] Test in `adoptionInputs.test.ts`: with and without a comprehension path, inside and outside the root, with and without each artifact
  - [x] **Success:** `pnpm --filter @context-forge/core test adoptionInputs` passes

- [x] **11.4 Commit** — `feat: add renderAdoptionInputs`

- [x] **11.5 Add `--comprehension` and append the section** — effort 3
  - [x] Read the resolved prompt's context profile with `ContextProfileParser`. If the profile lists `COMPREHENSION_PROFILE_VARIABLE`, append `renderAdoptionInputs(...)` after the substituted prompt, flag or no flag (D7 item 2). Hard-code no prompt key. The profile is read through a new `SystemPromptParser.getProfileVariables(key)` in core
  - [x] `--comprehension <path>`: relative resolves against the project root. Errors (`UserError`, message names the path or key and the reason): profile lacks the variable; `--raw` given; path missing; path is a directory. cf never reads the file and does no containment check. `--raw` alone prints the template with no section
  - [x] **Success:** `pnpm typecheck` passes

- [x] **11.6 Test prompt delivery** — effort 2
  - [x] In `prompt.test.ts`, use a guide fixture that has the `brownfield-adoption` profile with `fileComprehension` (the core fixture `packages/core/tests/fixtures/brownfield-guide/` shows the format; copy or reference it). The CLI tests for the gated section live in a new `prompt.adoption.test.ts` that uses this real brownfield-guide fixture
  - [x] Cases: no flag → section with the no-comprehension sentence; relative path → path shown root-relative; absolute path → accepted; missing path and directory → named errors, exit 1; `--comprehension` on `concept-phase-0` → refused naming the key; `--raw` + `--comprehension` → error; a prompt without the variable and no flag → no section; `--path` from an unrelated cwd → `{project}` and the Adoption Inputs come from the `--path` project
  - [x] **Success:** `pnpm --filter @context-forge/cli test prompt` passes

- [x] **11.7 Commit** — `feat: add cf prompt get --comprehension`

---

### 12. Onboarding stops on brownfield (D6)

- [x] **12.1 Add the detection step to the recipe** — effort 2
  - [x] In `packages/core/src/onboarding/onboardRecipe.ts`, add a step between setup and the build handoff. Step 1's "skip to Step 3" target becomes the new detection step; renumber the handoff
  - [x] Add one per-surface field in `ONBOARD_SURFACES` for how to run detection: Claude command → MCP `project_detect` with `path` set to the current directory, or `cf detect --json`; agent skill → `cf detect --json`; MCP tool → `project_detect`
  - [x] Step text (D6): on `brownfield` or `adoption-incomplete`, print each `notices` entry exactly as given and stop, with no build and no concept conversation; on an error object, show its message and stop; otherwise continue. Name the outcome values from the report; include no example notice text and no adoption wording of its own
  - [x] Add `mcp__context-forge__project_detect` to the Claude command's `allowed-tools`
  - [x] Update `packages/core/tests/onboarding/onboardRecipe.test.ts`: each surface contains the detection step and its surface-specific invocation; the Claude frontmatter lists `project_detect`; no surface contains `BROWNFIELD_LINE` text
  - [x] **Success:** `pnpm --filter @context-forge/core test onboardRecipe` passes

- [x] **12.2 Re-render the committed assets** — effort 1
  - [x] `pnpm -r build`, then `pnpm --filter @context-forge/cli render:onboard`
  - [x] **Success:** `packages/cli/commands/cf/onboard.md` and `packages/cli/commands/codex/cf-onboard/SKILL.md` contain the step; `pnpm --filter @context-forge/cli test onboardRender` and `pnpm --filter @context-forge/mcp test agentOnboardTool` pass

- [x] **12.3 Commit** — `feat: stop onboarding on a brownfield repo using the detection report`

---

### 13. CHANGELOG and validation

- [x] **13.1 CHANGELOG** — effort 1
  - [x] Under `## [Unreleased]` in `CHANGELOG.md`, add concise user-facing entries: `cf detect` and `project_detect`; `cf init --json`; **`cf init` now exits 1 when a setup step fails** (previously a warning and exit 0); `cf prompt get --path` and `--comprehension`; onboarding stops on an existing codebase; comprehension-file lookup removed
  - [x] **Success:** entries present; no version number added

- [x] **13.2 Full suite** — effort 1
  - [x] `pnpm -r build`, `pnpm lint`, `pnpm typecheck`, `pnpm -r test` all pass. Fix any failure in this slice's code before continuing
  - [x] **Success:** all four commands exit 0

- [x] **13.3 Run the Verification Walkthrough steps 1–6 and 8** — effort 2
  - [x] Run each step from the design with `node packages/cli/dist/index.js`, with `CONTEXT_FORGE_DATA_DIR` pointed at a temp dir so the real store is untouched. For step 3's MCP comparison, the 8.3 parity test stands in if no MCP client is at hand; say so in the commit. If `~/source/repos/manta/squadron` is absent for step 1, use another unregistered repo that has CF planning docs and record the substitute in the commit
  - [x] Each result matches the design's expectation. A mismatch in this slice's code is fixed and its test extended; anything else gets an issue. Substitutions: step 3's MCP comparison is covered by the 8.3 `detectParity` test; `cf init` ran with `--no-ide`, so the machine-level commands dir was not touched; step 5 used `concept` instead of `concept-phase-0` because of pre-existing issue #136
  - [x] **Success:** every step's expectation holds; step 8 prints `clean`

- [x] **13.4 Walkthrough step 7: live onboarding stop** — effort 2
  - [x] Put a `cf` shim on `PATH` that exports `CONTEXT_FORGE_DATA_DIR` set to the same temp dir as 13.3 (so step 3's registration is visible and the real store is untouched), then runs `node <repo>/packages/cli/dist/index.js "$@"`. In `/tmp/cf271-bf`, install the local commands with `cf install-commands --local`
  - [x] Run `claude -p "/cf:onboard"` there with the same `CONTEXT_FORGE_DATA_DIR` exported. Expect the brownfield notice printed as given, no build and no concept question. Needs `--setting-sources project,local`; without that flag the user-level older command runs instead
  - [x] If the `claude` CLI is not installed, write `BLOCKED: claude CLI unavailable for walkthrough step 7` under this task and leave it unchecked
  - [x] **Success:** transcript shows the notice and a stop

- [x] **13.5 Commit** — `chore: complete slice 271 validation`
  - [x] Includes the CHANGELOG and any walkthrough fixes. Work ends at this commit on the slice branch

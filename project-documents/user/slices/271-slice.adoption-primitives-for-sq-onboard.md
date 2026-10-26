---
docType: slice-design
slice: adoption-primitives-for-sq-onboard
project: context-forge
parent: project-documents/user/architecture/260-slices.brownfield-adoption.md
dependencies:
- 269
interfaces:
- 272
- 273
dateCreated: 20261025
dateUpdated: 20261026
status: not_started
turns: 62
promptTokens: 5832377
cachedTokens: 5680829
cacheWriteTokens: 151446
completionTokens: 40574
durationSeconds: 482.6
costUsd: 3.159951
usageRounds: 3
pricedRounds: 3
usageByModel:
  claude-opus-5-5:
    rounds: 3
    costUsd: 3.1599512
    completionTokens: 40574
revision_number: 2
---

# Slice Design: Adoption Primitives for sq onboard

## Overview

`sq onboard` will orchestrate adoption, and cf orchestrates nothing (arch amendment 20261025). This slice gives squadron the few read-only things it needs from cf:

1. **A detection report.** `cf detect` (CLI) and `project_detect` (MCP) return the same versioned JSON: the outcome (opted-out, adoption-incomplete, already-planned, brownfield, greenfield), the detection facts, and the paths of adoption artifacts that already exist. It writes nothing and works on an unregistered directory.
2. **`cf init --json`.** It reports the project id and each step's result, and exits non-zero when a step fails. Today a failed guide install only prints a warning.
3. **Adoption prompt delivery.** `cf prompt get brownfield-adoption --comprehension <path>` renders the guide's adoption prompt. It appends an "Adoption Inputs" section with the comprehension path squadron passes, or a plain statement that none was given, plus the concept, derived architectures and existing-state plan cf finds by its own file names.

cf's own surfaces use the same detection function. `cf init` prints one line when it finds an existing codebase. `/cf:onboard`, its Codex variant and `agent_onboard` run `cf detect` after setup, and on a brownfield repo they stop before the concept conversation with one message.

The slice also deletes cf's last squadron knowledge: `detection/comprehensionAnalysis.ts`, which searched for squadron's comprehension file by name. The probe code is already gone (268 D3).

## Value

- **Squadron:** one stable contract to build `sq onboard` on. Squadron gets an outcome, facts and artifact paths without knowing cf's file names, and cf never needs to know squadron's.
- **Users on cf alone:** onboarding no longer starts a greenfield concept conversation on an existing codebase without saying so. It stops with one clear line naming `sq onboard` and the opt-out.
- **Maintainers:** the PM's ban holds in code. No cf source names squadron's files or runs `sq`, and a test fails if that changes.

## Technical Scope

**Included**
- Core: `detectProject(root)`, the report types, `REPORT_VERSION`, and the JSON serializer shared by CLI and MCP.
- Core: `readAdoptionArtifacts(root)` and `renderAdoptionInputs(...)`, shared by the report and prompt delivery.
- CLI: a new `cf detect [--path <dir>] [--json]` command.
- MCP: a new `project_detect` tool.
- CLI: `cf init --json`, a non-zero exit on a failed step, and the one-line codebase notice.
- CLI: `cf prompt get --comprehension <path>`.
- The onboarding recipe (`core/src/onboarding/onboardRecipe.ts`): a detection step after setup, re-rendered to all three surfaces.
- Deleting `detection/comprehensionAnalysis.ts`, its test and its exports.
- A guard test for the squadron ban.

**Excluded**
- Guide prompt and adoption-guide changes, README and CLI reference docs, raising `MIN_GUIDE_VERSION`, and sending the contract to squadron as a finished reference: slice 272.
- A `comprehensionPath` input on the MCP `prompt_get` tool. See D7.
- Any change to `cf build`, `cf next` routing or the opt-out key (268, 269).
- The comprehension doc in later phases: slice 274.

## Dependencies

### Prerequisites
- **269 (complete):** the stage and outcome functions (`readAdoptionOptOut`, `readPlanningFacts`, `decideStage`, `decideOutcome`), the line constants in `adoption/adoptionLines.ts`, and no stored adoption state.
- **268 (complete):** a pure `cf build`. The squadron probe code is already deleted.
- **Guide:** the `Brownfield Adoption` prompt and its `brownfield-adoption` context profile, both shipped in ai-project-guide v0.22.x.

### Interfaces Required
- `detection/`: `measureSourceVolume`, `readHistory`, `presentPaths` with `DOC_PATHS`, `ADR_DIRS` and `RULE_FILE_PATHS`, and `recognizeCi`.
- `introspection/ArtifactIntrospector.resolveConceptPath` for the concept path.
- `services/ContextProfileParser` to read the guide's context profile for a prompt key.
- `config/ConfigManager`, which `readAdoptionOptOut` already uses. It reads `.context-forge.toml` from a directory and needs no project registration.

## Architecture

### Component Structure

```
core/src/adoption/
  projectDetection.ts   detectProject(root) → ProjectDetection          (new)
  detectionReport.ts    REPORT_VERSION, toDetectionReport, DetectionError,
                        DETECTION_ERROR_CODES                          (new)
  adoptionInputs.ts     readAdoptionArtifacts(root), renderAdoptionInputs (new)
  adoptionLines.ts      + outcomeLine(outcome); adoptionNavLines uses it (changed)
core/src/detection/
  comprehensionAnalysis.ts                                             (deleted)

cli/src/commands/
  detect.ts             cf detect                                      (new)
  init.ts               --json, step results, exit code, notice        (changed)
  prompt.ts             get --comprehension                            (changed)
  guides.ts, setup-ide.ts, commandInstaller.ts  accept a log sink      (changed)
mcp-server/src/tools/
  detectTools.ts        project_detect                                 (new)
core/src/onboarding/onboardRecipe.ts   detection step                  (changed)
```

`detectProject` is the only place that gathers facts and decides the outcome for the report and for `cf init`. Navigation keeps `adoptionNavLines` (269), which builds on the same `decideStage` and `decideOutcome` but measures source volume only when it has to. Both map an outcome to its line through one function, `outcomeLine`.

### Data Flow

```
sq onboard ──► cf detect --json ─┐
agent (MCP) ─► project_detect ───┼─► detectProject(root) ─► toDetectionReport ─► JSON (stdout / tool result)
cf init ─────────────────────────┤        │
/cf:onboard step ─► cf detect ───┘        ├─ readAdoptionOptOut   (config, read-only)
                                          ├─ readPlanningFacts    (planning files)
                                          ├─ readAdoptionArtifacts(concept + derived arch + plan)
                                          ├─ measureSourceVolume, readHistory, presentPaths, recognizeCi
                                          └─ decideStage → decideOutcome

sq onboard ──► cf prompt get brownfield-adoption --comprehension <path>
                 ├─ SystemPromptParser → prompt text, {project} substituted (unchanged)
                 ├─ ContextProfileParser: does the profile list fileComprehension?
                 └─ renderAdoptionInputs(root, comprehensionPath, readAdoptionArtifacts(root))
                      → prompt + "## Adoption Inputs" section → stdout
```

### State Management

None. The slice adds no stored state. Every primitive reads the filesystem, config and git. The only writes are the ones `cf init` already makes.

## Technical Decisions

### D1 — Names: `cf detect` and `project_detect`
Status: decided
- CLI: `cf detect [--path <dir>] [--json]`. MCP: `project_detect` with a required `path` input.
- Neither name says "adoption". The report answers "what is in this directory", and `cf init` and onboarding use it outside adoption. `cf project …` subcommands all act on the registered active project, and this command must work before registration, so it is not a `project` subcommand. The MCP name follows the existing `project_*` noun grouping.
- MCP takes `path` as required because the MCP server's working directory is not the user's project. The CLI defaults `--path` to the current directory.
- Squadron initiative 440 asked to confirm names before this design is final. The proposal goes to the `sq` session together with this design (see Implementation Notes). If squadron asks for different names, only this decision and the contract section change.
- Rejected: `cf project state`. It would be the only `project` subcommand that does not need a registered project.

### D2 — The project root is the given directory, as is
Status: decided
- `detectProject(root)` judges the directory it is given. It does not walk up to a registered project or a git root. A CF project in a monorepo subdirectory is judged on that folder (arch, Detection).
- CI is the documented exception. `recognizeCi` also checks the repository root, so a root-level CI file in a monorepo is reported with a relative path that climbs out (`../../.github/workflows/ci.yml`). That is accurate and stays relative to the project root.
- A path that doesn't exist, or isn't a directory, is the error `path-not-found`.

### D3 — Report schema, version 1
Status: decided
- Shape (success):

  ```json
  {
    "reportVersion": 1,
    "projectRoot": "/abs/path/to/project",
    "outcome": "brownfield",
    "facts": {
      "source": { "measured": true, "lines": 2000, "files": 37, "capped": true },
      "history": { "known": true, "commits": 412, "shallow": false },
      "docs": ["README.md", "docs"],
      "adrs": ["docs/adr"],
      "ci": [".github/workflows/ci.yml"],
      "ruleFiles": ["CLAUDE.md"]
    },
    "artifacts": {
      "concept": null,
      "derivedArchitectures": [],
      "existingStatePlan": null
    },
    "notices": ["This project has existing code and no planning artifacts. …"]
  }
  ```

- `outcome` is one of `opted-out`, `adoption-incomplete`, `already-planned`, `brownfield`, `greenfield`, exactly the values of `AdoptionOutcome.kind` (269). The serializer maps the kind straight through, so there is no second list.
- `facts.source`: `{ measured: true, lines, files, capped }` or `{ measured: false, reason }`. `capped: true` labels `lines` as a floor: counting stopped at `BROWNFIELD_MIN_SOURCE_LINES`. When `capped` is false, `lines` is exact.
- `facts.history`: `{ known: true, commits, shallow }` or `{ known: false, reason }`. This is `HistoryFact` with `kind` turned into a boolean so consumers don't need cf's type names.
- `artifacts` holds the three fields the architecture's contract names. `concept`, `derivedArchitectures` and `existingStatePlan` are what `sq onboard` needs to resume an incomplete adoption without knowing cf's file names.
- `notices` holds the legacy `adoption.state` notice (269 D3) when a legacy value is stored, then `outcomeLine(outcome)` when there is one. Squadron may ignore it. cf's onboarding surfaces print it (D6).
- Every path, apart from `projectRoot`, is relative to the project root and uses `/` separators.
- `REPORT_VERSION` goes up when a field is removed or renamed, a type changes, or an outcome value is added, removed or changes meaning. Adding a field is not breaking. Squadron refuses a version it doesn't know (arch contract).

### D4 — Facts are always gathered; only an unplanned project needs the source walk to succeed
Status: decided
- `detectProject` gathers every fact on every call, so the report has one fixed shape. The source walk is bounded (`MAX_WALK_ENTRIES`, and it stops at the threshold), and history has a 5-second git timeout.
- A failed source walk (`AdoptionError` from `measureSourceVolume`) becomes `source: { measured: false, reason }`. If the stage is `unplanned`, the outcome depends on source volume and can't be decided, so the report fails with the error `source-unmeasurable` and its message carries the opt-out remedy. For any other stage, the outcome is already decided and the report succeeds, with the unmeasured fact stated. This is not a fallback: the report never guesses greenfield.
- Rejected: walking only when the stage is `unplanned`, as navigation does. That saves little on planned repos and gives the report a shape that changes with the outcome.

### D5 — Errors are one JSON object with a stable code
Status: decided
- With `--json`, and always on MCP, a failure is `{ "reportVersion": 1, "error": { "code": "<code>", "message": "<text>" } }`. The CLI writes it to stdout, so squadron reads one stream, and exits 1. MCP returns it as the text of an `isError` result.
- Codes (`DETECTION_ERROR_CODES` in `detectionReport.ts`, the one place they are written):
  - `path-not-found`: the path is missing or not a directory, or, on MCP, is not absolute. MCP never resolves a relative path, because the server's working directory isn't the project. The message says which.
  - `invalid-config`: `adoption.state` holds a value outside the allowed set, or the TOML doesn't parse.
  - `unreadable-planning`: a planning directory can't be listed (non-ENOENT).
  - `source-unmeasurable`: D4.
  - `worktree-of-registered-project`: `cf init --json` only (D8).
  - `internal`: the catch-all for any other error. It is applied only at the process boundary (the CLI action and the MCP handler). The message carries the original error, and the exit is still non-zero, so nothing is swallowed.
- One error class, `DetectionError`, carries the code. `detectProject` throws it directly for the first four codes. Where it calls a read function that throws `AdoptionError`, it wraps that error at the call, with that call's code. There is no separate class-to-code mapping table.
- Without `--json`, the CLI prints the message through `handleError`, as other commands do.

### D6 — Onboarding stops on brownfield, using the report's own text
Status: decided
- The recipe gains a step between setup and the build handoff, so it also runs for a project that was already registered (Step 1 skips to it):
  - Claude command: MCP `project_detect` with `path` set to the current directory, or CLI `cf detect --json`. Codex skill: `cf detect --json`. MCP tool: `project_detect`.
  - On `brownfield` or `adoption-incomplete`: print each `notices` entry exactly as given, then stop. Don't build and don't start the concept conversation. **This extends the architecture:** its Onboarding section names only brownfield, and this slice adds `adoption-incomplete`. Stopping there too matches the navigation line 269 defines for that outcome; a concept conversation there would ignore a half-finished adoption.
  - On an error object: show its message and stop.
  - Otherwise, continue to the build handoff.
- The recipe holds no adoption wording of its own. The message comes from `adoptionLines.ts` through the report, so the onboarding surfaces, `cf init` and `cf next` say the same thing. The recipe names no example message, because an example would invite the agent to print it when `notices` is empty.
- The Claude command's `allowed-tools` adds `mcp__context-forge__project_detect`.

### D7 — Prompt delivery: `cf prompt get` with `--comprehension`, gated by the guide's profile
Status: decided
- The slice plan asked whether `cf prompt get` accepting the path is all this needs. Almost. It already renders a prompt by key with `{project}` substituted, and it has no fallback: an unknown key is an error. Four things are missing, and this slice adds them:
  1. **The flag.** `--comprehension <path>` is accepted only when the resolved prompt's context profile (the guide's `context_profiles` table, read with `ContextProfileParser`) lists `fileComprehension`. On any other prompt it is an error naming the key. The guide decides which prompts take a comprehension doc, and cf hard-codes no prompt key.
  2. **The Adoption Inputs section.** For any prompt whose profile lists `fileComprehension`, cf appends `## Adoption Inputs`, flag or no flag. It lists the comprehension path, or the sentence "No codebase comprehension analysis was provided.", and then the concept, derived architectures and existing-state plan from `readAdoptionArtifacts`, each `none` when absent. That is how the profile's other variables (`fileConcept`, `fileArch`, `fileSlicePlan`) reach the prompt now that `cf build` doesn't select it. They come from the files cf already knows by name, not from project fields, which an adopting project hasn't set.
  3. **Path checks.** The path may be absolute or relative; a relative path resolves against the project root. A missing path or a directory is an error (the CLI's existing `UserError`, no new class) whose message names the path and the reason. There is no containment check: cf never reads the file, it only names it to an agent that can already read the disk. Squadron writes the doc inside the project root anyway (`sq` session, 20261026). The section shows the path relative to the project root when it is inside it, and absolute otherwise.
  4. **The project root.** `cf prompt get` gains `--path <dir>`, the same option `cf detect` has. It resolves the registered project at that directory the way cwd resolution works today (`findProjectByCwd`, parameterized with a directory, worktree-aware). Without `--path`, resolution is unchanged (cwd, then the existing fallbacks). The resolved project's operation path is the one root for both `{project}` substitution and `readAdoptionArtifacts`, so the two can't come from different projects. `--path` with `--project` is an error. A directory with no registered project is the existing project-not-found error; `sq onboard` runs `cf init` first. Squadron always passes `--path` (`sq` session, 20261026).
- `--raw` with `--comprehension` is an error: raw output is the unrendered template.
- The section is named "Adoption Inputs", not "Adoption Facts". The Adoption Facts section was the build-time block 268 removed, and the names must not be confused.
- CLI only. Squadron calls cf as a CLI. The MCP `prompt_get` tool returns raw template text with no variable substitution today, and giving it inputs would be a separate change to that tool. The arch requires an MCP twin only for the detection report.
- Rejected: a dedicated `cf adoption prompt` command. It would duplicate prompt lookup, shorthand resolution and guide readiness for one key. Also rejected: keying the section on the prompt name `brownfield-adoption` instead of the profile variable. The profile is the guide's declared contract; a prompt key in cf's code is a label used as logic.

### D8 — `cf init --json` and a non-zero exit on a failed step
Status: decided
- **Scope source.** The slice plan entry for 271 assigns this work: "`cf init` gains `--json` (project id plus each step's result) and exits non-zero when a step fails; today a failed guide install only warns (PM 20261025, from squadron's contract review)". The architecture's adoption flow only says "Register the project", so the plan entry is the authority here. This decision covers only what that entry names.
- `cf init` records a result for each step: `git`, `register`, `gitignore`, `guides`, `commands`, `ide`. Each has a `status` of `ok`, `skipped` or `failed`, and a `message` when one applies. "Guides already installed" is `skipped`. `--lite` and `--no-ide` mark the steps they skip as `skipped`.
- All steps run as today. After the last one, the command exits 1 if any step `failed`, with or without `--json`. This is a deliberate behavior change: today a failed guide install, command install, IDE setup or `git init` prints a warning and exits 0. It goes in the CHANGELOG.
- The worktree refusal ("This looks like a worktree. Run cf worktree init instead."):
  - **Without `--json`:** unchanged. It prints the warning and exits 0. Changing that isn't in the plan entry.
  - **With `--json`:** D5's error object with code `worktree-of-registered-project`, and exit 1. Nothing was registered, so there is no project id to report. The JSON mode is new, so it carries no compatibility constraint.
- JSON shape:

  ```json
  {
    "reportVersion": 1,
    "projectId": "…",
    "projectName": "…",
    "projectPath": "/abs/path",
    "registration": "created",
    "steps": [ { "step": "git", "status": "ok" }, { "step": "guides", "status": "failed", "message": "…" } ],
    "notices": [],
    "ok": false
  }
  ```

  `registration` is `created` or `existing`. `notices` carries the D9 line.
- **Versioning.** `reportVersion` uses the same field name and bump rule as D3, so squadron refuses an unknown version the same way for both commands. Its value is a separate constant, `INIT_REPORT_VERSION`, next to `REPORT_VERSION`, so a change to one report doesn't bump the other.
- **Errors.** Every `cf init --json` failure that happens before or instead of the step results (the worktree refusal, an unreadable store, an unexpected throw) uses D5's envelope exactly: `{ "reportVersion": <INIT_REPORT_VERSION>, "error": { "code", "message" } }` on stdout, exit 1. The serializer is shared with `cf detect`, so squadron parses both with one error reader (`sq` session, 20261026). A failed step is not an error object: it is the step-result JSON above with `"ok": false`, also exit 1.
- **Stdout stays pure JSON.** The guide, command and IDE actions print progress with `console.log`. Each gains an optional log sink parameter that defaults to stdout. `cf init --json` passes a stderr sink, and runs `git init` with piped stdio and its output sent to stderr. Rejected: patching `console.log` for the duration of the command. It is a global side effect, and it leaks if an action throws past the restore.

### D9 — `cf init` prints one line for an existing codebase
Status: decided
- After the setup steps, `cf init` calls `detectProject(cwd)` and prints `outcomeLine(outcome)` when it returns a line: `BROWNFIELD_LINE` for brownfield, `INCOMPLETE_ADOPTION_LINE` for an incomplete adoption, otherwise nothing.
- Detection is advisory here, not a setup step. A detection error prints `inconclusiveDetectionLine(message)`, the line 269 D6 uses for the same case, and doesn't count as a failed step. A detection hint must not fail a registration that worked.
- `outcomeLine` moves the outcome-to-line mapping that `adoptionNavLines` holds into one function. Navigation, init and the report all call it.

### D10 — Delete the comprehension lookup and guard the ban
Status: decided
- Delete `detection/comprehensionAnalysis.ts`, `tests/detection/comprehensionAnalysis.test.ts`, and the `findComprehensionAnalysis` and `COMPREHENSION_PROFILE_VARIABLE` exports from `detection/index.ts` (review 268 F004). The `pureBuild.test.ts` fixture that writes a comprehension doc stays until 272 (slice plan).
- The prompt-delivery code names the profile variable `fileComprehension`, the guide's variable name, in one module constant in `adoptionInputs.ts`. That is the guide's contract, not squadron's file naming.
- Add a guard test in `packages/core/tests` that scans every `packages/*/src/**/*.ts` file and fails on `codebase-comprehension` or a `sq probe` / `'sq'` process invocation. It is a cheap, permanent check on the PM's ban. Test files are excluded, because tests may name squadron's patterns to prove they are absent.

## Implementation Details

### API Contracts

**`cf detect`**

| Input | Meaning |
|---|---|
| `--path <dir>` | Directory to judge. Default: the current directory. Need not be registered. |
| `--json` | Print the D3 report, or the D5 error object. |

Without `--json`, it prints only the outcome and the notices. Every consumer the plan names reads the JSON, so there is no fuller human summary. Exit 0 on success and 1 on error.

**MCP `project_detect`**

| Input | Meaning |
|---|---|
| `path` (required, string) | Absolute directory to judge. A relative path is refused as `path-not-found` (D5). |

Returns the same JSON as `cf detect --json`, as a JSON text result. On failure, `isError: true` with the D5 object as text. `readOnlyHint: true`.

**`cf prompt get <key> [--path <dir>] [--comprehension <path>]`**

`--path` picks the registered project at that directory (D7 item 4); default is today's cwd resolution. `--comprehension` takes an absolute or root-relative file path. Output is the prompt with `{project}` substituted, then:

```markdown
## Adoption Inputs
- Codebase comprehension: project-documents/user/analysis/<file>.md
- Concept: project-documents/user/project-guides/000-concept.<project>.md
- Derived architecture: none
- Existing-state slice plan: none
```

The comprehension line reads "No codebase comprehension analysis was provided." when no path is passed. Labels and sentences are constants in `adoptionInputs.ts`. Errors: `--comprehension` on a prompt whose profile lacks `fileComprehension`, `--comprehension` with `--raw`, a comprehension path that is missing or a directory, `--path` with `--project`, no registered project at `--path` (an existing error), and an unknown key (an existing error).

**`cf init --json`**: D8.

## Integration Points

### Provides to Other Slices
- **272:** the contract to document in the README and CLI/MCP references and to send to squadron. The guide's brownfield prompt is rewritten against the Adoption Inputs section (it drops the Adoption Facts, probe and `cf build` text).
- **273 / squadron 440 (`sq onboard`):** `cf detect --json`, `cf init --json`, and `cf prompt get brownfield-adoption --comprehension <path>`.
- **274:** `readAdoptionArtifacts` and the comprehension-path checks, if later phases receive the doc the same way.

### Consumes from Other Slices
- **269:** the stage and outcome functions, the opt-out reader, and the line constants. No changes beyond extracting `outcomeLine`.
- **Guide:** the `Brownfield Adoption` prompt and its profile row. If the installed guide lacks the prompt, `cf prompt get` fails with its existing error. If the profile row drops `fileComprehension`, `--comprehension` is refused with an error naming the key. Neither case falls back to another prompt.

## Success Criteria

### Functional Requirements
- `cf detect --json` and `project_detect` return byte-identical JSON for the same directory, for each of the five outcomes.
- The report writes nothing. A test snapshots the directory tree (paths, sizes, mtimes), `.context-forge.toml` and the global project store before and after `cf detect` on a brownfield fixture, and they match. The directory is still unregistered afterwards.
- The report works on an unregistered directory, on a directory that is not a git repository (`history.known` false with a reason), and on a monorepo subdirectory (judged on that folder; root CI reported with a `../` path).
- Every path in the report except `projectRoot` is relative to the project root.
- Each D5 error code is produced by a test case, as a JSON object with exit 1.
- A failed source walk on a planned project still gives a report with `source.measured: false`. On an unplanned project it gives `source-unmeasurable`.
- `cf prompt get brownfield-adoption --comprehension <path>` appends Adoption Inputs with that path. Without the flag, it says plainly that none was provided. An absolute path and a root-relative path both work. A missing path or a directory is a named error. `--comprehension` on `concept-phase-0` is an error. Run from an unrelated cwd with `--path <project>`, the output's `{project}` and Adoption Inputs both come from that project.
- `cf init --json` output and its errors carry `reportVersion`, and its error objects match the `cf detect` envelope exactly.
- `cf init --json` prints one JSON object on stdout, with no other output on stdout, and exits 1 when a step fails (for example a guide install forced to fail). Without `--json`, the same failure also exits 1.
- `cf init` on a brownfield fixture prints `BROWNFIELD_LINE`. On a greenfield fixture it prints no adoption line.
- The three rendered onboarding surfaces contain the detection step, and the existing divergence test passes. Running `/cf:onboard` on a brownfield repo prints the notice and stops before any concept question.

### Technical Requirements
- `detectProject` is the only fact-gathering function behind `cf detect`, `project_detect` and `cf init`. `outcomeLine` is the only outcome-to-line mapping.
- No source file under `packages/*/src` names `codebase-comprehension` or invokes `sq`. The D10 guard test catches these known patterns. It is a text scan, so it doesn't prove the ban: a command built from parts, or another squadron file name, would pass it.
- `comprehensionAnalysis.ts`, its test and its exports are gone, and the build, lint and typecheck pass.
- Format, lint, typecheck and the full test suite pass.

### Integration Requirements
- The `sq` session confirmed the command names and report shapes on 20261026. Its requests (the `cf init --json` version field, one error envelope for both commands, relative or absolute `--comprehension` paths) are in D7 and D8.
- 272 can document the contract from this design's API Contracts section without reading the code.

### Verification Walkthrough

Use the local build (`node packages/cli/dist/index.js`, written `cf` below); the global `cf` is the published package. Run `pnpm -r build` first.

1. **Report on an unregistered brownfield repo**
   ```bash
   cf detect --path ~/source/repos/manta/squadron --json
   ```
   Expect `"reportVersion": 1`, `"outcome"` of `brownfield` or `already-planned` (squadron has its own planning docs, so `already-planned` is the likely result), `facts.source.capped: true`, and relative paths throughout. Confirm nothing was written: `git -C ~/source/repos/manta/squadron status --short` is unchanged, and `cf project list` doesn't show it.

2. **Greenfield and errors**
   ```bash
   mkdir /tmp/cf271-empty && cf detect --path /tmp/cf271-empty --json   # outcome greenfield, history.known false
   cf detect --path /tmp/does-not-exist --json; echo "exit=$?"            # error.code path-not-found, exit=1
   ```

3. **Brownfield fixture, MCP parity, init line**
   ```bash
   mkdir /tmp/cf271-bf && cd /tmp/cf271-bf && git init -q
   # write ≥2000 non-blank lines of .ts source, then commit
   cf detect --json > /tmp/cli.json                                     # outcome brownfield
   ```
   Call `project_detect` with `path: "/tmp/cf271-bf"` from an MCP client and diff its result against `/tmp/cli.json`: no difference. Then run `cf init --name cf271-bf` and confirm the last lines include the brownfield notice naming `sq onboard` and the opt-out command.

4. **`cf init --json` and exit codes**
   ```bash
   cd /tmp/cf271-empty && cf init --json --strategy bogus ; echo "exit=$?"   # GuideManager.install rejects the strategy inside the guides step
   ```
   Expect one JSON object on stdout with the `guides` step `failed`, `"ok": false`, and exit=1. Progress text appears on stderr only (`cf init --json 2>/dev/null` prints only the JSON).

5. **Prompt delivery**
   ```bash
   cd /tmp/cf271-bf
   cf prompt get brownfield-adoption | tail -6                          # "No codebase comprehension analysis was provided."
   mkdir -p project-documents/user/analysis && echo '# c' > project-documents/user/analysis/x.md
   cf prompt get brownfield-adoption --comprehension project-documents/user/analysis/x.md | tail -6
   cf prompt get brownfield-adoption --comprehension nope.md; echo "exit=$?"   # named error, exit=1
   cf prompt get concept-phase-0 --comprehension project-documents/user/analysis/x.md; echo "exit=$?"  # refused
   cd ~ && cf prompt get brownfield-adoption --path /tmp/cf271-bf --comprehension /tmp/cf271-bf/project-documents/user/analysis/x.md | tail -6   # cf271-bf's inputs, absolute path accepted
   ```

6. **Opt-out and planned outcomes**
   ```bash
   cf config set adoption.state declined && cf detect --json | grep outcome   # opted-out
   cf config unset adoption.state
   cf detect --path ~/source/repos/manta/context-forge --json | grep outcome   # already-planned
   ```

7. **Onboarding stop.** In a Claude Code session in `/tmp/cf271-bf` (registered in step 3), run `/cf:onboard`. Expect the detection step to run, the brownfield notice to be printed as given, and no build and no concept question.

8. **Ban guard**
   ```bash
   grep -rn "codebase-comprehension\|sq probe" packages/*/src || echo clean
   ```
   Expect `clean`, and the guard test passes in `pnpm -r test`.

## Risk Assessment

### Technical Risks
- **Cross-repo contract.** Squadron builds `sq onboard` against D1–D5 and D8. A late change on either side costs both repos.
- **`cf init` exit code.** Scripts that ran `cf init` and ignored a failed guide install now see exit 1.

### Mitigation Strategies
- Confirm names and shapes with the `sq` session before Phase 5. `reportVersion` lets later changes be detected rather than misread.
- Put the exit-code change in the CHANGELOG. It turns a silent half-setup into a visible failure, which is the point of the change.

## Implementation Notes

### Development Approach
1. Delete `comprehensionAnalysis.ts` and add the ban guard test (D10).
2. Extract `outcomeLine` and switch `adoptionNavLines` to it. Navigation tests stay green.
3. `readAdoptionArtifacts`, `detectProject`, the report serializer and the error codes in core, with unit tests per outcome and per error code.
4. `cf detect`, then `project_detect`, with a CLI/MCP parity test and the no-writes test.
5. Log sinks on the guide, command and IDE actions. Then `cf init` step results, `--json`, the exit code and the D9 line.
6. `cf prompt get --comprehension` and the Adoption Inputs section.
7. The onboarding recipe step, re-rendered with `pnpm --filter @context-forge/cli render:onboard`.
8. Run the walkthrough.

Effort: 3/5. The slice plan said 2/5. Scope matches the plan entry: it assigns the report, prompt delivery, the onboarding stop, `cf init --json` with a non-zero exit, and the deletions. Nothing is added or dropped. Only the estimate differs, because the log sinks that keep `cf init --json` stdout clean (D8) cost more than the entry assumed.

### Special Considerations
- **Interim guide mismatch.** Until 272 ships the reworked guide prompt, the installed `Brownfield Adoption` prompt still expects an Adoption Facts section and stops without one. That is acceptable because no release ships before 272 (the same interim 268 accepted).
- **Contract confirmation.** Done 20261026. The `sq` session confirmed D1–D5, D7 and D8, and its requests are folded into D7 and D8. Send squadron the commit of the final design.

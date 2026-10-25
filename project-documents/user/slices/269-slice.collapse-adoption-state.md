---
docType: slice-design
slice: collapse-adoption-state
project: context-forge
parent: project-documents/user/architecture/260-slices.brownfield-adoption.md
dependencies:
- pure-cf-build
interfaces:
- adoption-primitives-for-sq-onboard
dateCreated: 20261025
dateUpdated: 20261025
status: not_started
turns: 61
promptTokens: 3980315
cachedTokens: 3849041
cacheWriteTokens: 131190
completionTokens: 45551
durationSeconds: 438.7
costUsd: 2.731011
usageRounds: 3
pricedRounds: 3
usageByModel:
  claude-opus-5-5:
    rounds: 3
    costUsd: 2.7310107000000006
    completionTokens: 45551
revision_number: 2
---

# Slice Design: Collapse Adoption State

## Overview
`adoption.state` holds four values: `""`, `in_progress`, `complete` and `declined`. Two of them, `in_progress` and `complete`, record what the project's files already say, and since slice 268 nothing writes them. This slice derives adoption progress from the files every time and keeps one stored value, the opt-out `declined`. The outcome mapping is reworked to the order in the arch's amended Detection section: opted out, adoption incomplete, already planned, then brownfield or greenfield. Stored `in_progress` and `complete` values are ignored with a notice, never an error.

Slice 270 (Remove Adoption Navigation from `cf next`) is folded in. The per-step adoption guidance in `cf next` is deleted in this slice, and navigation gets one line for an unadopted brownfield repo and one for an incomplete adoption. Folding avoids rewiring navigation onto the new outcome only to delete it in the next slice, and it means no release ever ships with navigation that still points at `cf build` for adoption.

## Value
- No stored value can drift from the files. A project with a derived architecture and no retroactive plan is mid-adoption whatever the config says, and a project with a retroactive plan is planned.
- The largest block of untested navigation code goes: `adoptionNavigation.ts` (~240 lines), `routeAdoption` and its gate helper, and their tests.
- 271's state report gets a single derived outcome to read, with no stored state to report or reconcile.

## Technical Scope
**Included**
- `adoption.state` config key: the enum becomes `""` and `declined`, and the description names only the opt-out (D1).
- A read function for the opt-out that tolerates the legacy values and reports them (D2, D3).
- Derived-architecture detection from the `provenance: derived` frontmatter field (D4).
- The reworked outcome mapping in `adoption/adoptionOutcome.ts`, split into a planning stage and the code-signal step (D5).
- Navigation: delete `adoptionNavigation.ts` and `routeAdoption`, and add the two one-line warnings (D6).
- Remedy texts in `detection/sourceVolume.ts` and `detection/planningArtifacts.ts` drop `in_progress`.
- The `adoption.state` row in the README config table.
- Tests: delete those for removed behavior, add those for the derived outcome, the navigation lines and the legacy notice.

**Excluded**
- The detection report command, its MCP tool, and `cf init`'s one line: slice 271.
- The README adoption section, CLI reference and guide prompt: slice 272.
- The retroactive marker and its checker rules: unchanged.

## Dependencies
### Prerequisites
- Slice 268 (complete): no build path reads or writes `adoption.state`, so the key changes meaning with no build caller to migrate.

### Interfaces Required
- `findPlanningArtifacts`, `findArchitectureArtifacts` (`detection/planningArtifacts.ts`).
- `findExistingStatePlan` (`introspection/parsers/existingStatePlan.ts`): the first slice plan with a retroactive entry.
- `measureSourceVolume` (`detection/sourceVolume.ts`): stops counting at the threshold.
- `parseFrontmatter` (`introspection/parsers/frontmatterParser.ts`): never throws; an unreadable file reads as no frontmatter.
- `ConfigManager.get`: returns the stored value without enum validation, so a legacy value is readable after the enum shrinks. `ConfigManager.set` validates against the enum.

## Architecture
### Component Structure
| Module | Change |
|---|---|
| `config/ConfigKeys.ts` | `ADOPTION_STATES` becomes `['', 'declined']`. New `LEGACY_ADOPTION_STATES = ['in_progress', 'complete']`. Description rewritten. The `AdoptionState` type is removed. |
| `adoption/adoptionState.ts` | `readAdoptionState` is replaced by `readAdoptionOptOut`, which returns the opt-out and any ignored legacy value. Adds `legacyAdoptionStateNotice`. |
| `adoption/contracts.ts` | Gains the shared `OVERRIDE_REMEDY` beside `AdoptionError`. `detection/` already imports this file, so no new import direction. |
| `adoption/planningFacts.ts` (new) | `readPlanningFacts(root)`: planning artifacts, derived architectures and the existing-state plan. Read-only. |
| `adoption/adoptionOutcome.ts` | `decideStage` (pure) and `decideOutcome` (pure) with the new order. `adoption-closed` and `adoption-in-progress` kinds removed. |
| `schema/frontmatterSchema.ts` | `DERIVED_PROVENANCE` constant, used by the schema and by `planningFacts`. The "no behavior branches on it" comment is corrected. |
| `introspection/adoptionNavigation.ts` | Deleted. |
| `adoption/adoptionLines.ts` (new) | `adoptionNavLines(projectPath)`: the warnings navigation adds, and whether first-run logic is skipped (D6). |
| `introspection/WorkflowNavigator.ts` | `routeAdoption`, `gateDerivedArchitecture` and `AdoptionRoute` removed; the no-active-slice guard calls `adoptionNavLines`. |

### Data Flow
```
.context-forge.toml ──readAdoptionOptOut──► { optedOut, ignoredLegacyValue }
project-documents/  ──readPlanningFacts──► { artifacts, derivedArchitectures, existingStatePlan }
        │
        ▼
decideStage(optedOut, facts) ─► opted-out | adoption-incomplete | already-planned | unplanned
        │ unplanned only
        ▼
measureSourceVolume ─► decideOutcome ─► … | brownfield | greenfield

cf next / workflow_next ─► adoptionNavLines ─► warnings + skipFirstRun   (271's report uses the same functions)
```

### State Management
One stored value remains: `adoption.state = "declined"`, in the shared project config, written only by the user. Everything else is derived on each read and never stored. Nothing in this slice writes config.

## Technical Decisions

### D1 — Keep `declined` under `adoption.state`
Status: decided
- The opt-out stays `adoption.state = "declined"`. The enum shrinks to `""` and `declined`.
- Every config that already holds `declined` keeps working with no migration code, and every doc, prompt and message that names `cf config set adoption.state declined` stays correct.
- Rejected: a new boolean key (for example `adoption.opt_out`). It reads better, but it needs code to carry `declined` across, keeps the old key registered so `cf config get adoption.state` doesn't fail as unknown, and leaves two keys to describe.
- New description: `Set to "declined" to treat this project as new even when it holds existing code. Empty (default): cf decides from the project's files. The old values in_progress and complete are ignored.`

### D2 — Legacy values are read, ignored and reported, never rejected
Status: decided
- `readAdoptionOptOut(root)` returns `{ optedOut: boolean; ignoredLegacyValue: 'in_progress' | 'complete' | null }`. `in_progress` and `complete` mean "not opted out" and set `ignoredLegacyValue`.
- Any other value outside the enum still throws `AdoptionError`, as today. "Never an error" covers only the two values cf itself used to write.
- `cf config set adoption.state in_progress` is rejected by the enum, so no new legacy value can be written.

### D3 — The legacy notice repeats until the value is removed
Status: decided
- The notice appears wherever the opt-out is read while a legacy value is present, and names the one command that silences it:
  `adoption.state is "in_progress", which is no longer used and is ignored: adoption progress now comes from the project's files. Remove it with: cf config unset adoption.state`
- It is not a one-time notice. Remembering that a notice was shown would need a stored flag, which is the kind of state this slice removes. Only projects that ran adoption under 0.19.x can hold a legacy value, so the repeat reaches few users.
- In this slice the reader is navigation, so the notice is a navigation warning on `cf next` and `workflow_next`. 271's report carries the same text through the same function.
- cf doesn't delete the value itself. Read paths stay read-only (264 D3, 268), and the user acts once.
- Rejected: a `cf check --fix` finding that deletes the value. It adds a rule and a fixer for a value only 0.19.x adopters can have.

### D4 — "Derived" means `provenance: derived` in an architecture file's frontmatter
Status: decided
- `readPlanningFacts` reads the frontmatter of each file `findArchitectureArtifacts` returns, and keeps those whose `provenance` equals `DERIVED_PROVENANCE`. This is the field slice 263 D7 defined and the schema validates.
- Read failures, by call. None of them is new behavior. Each is the existing function's contract.

  | Call | Failure | Result |
  |---|---|---|
  | `findPlanningArtifacts`, `findArchitectureArtifacts` | directory missing (`ENOENT`) | no artifacts |
  | same | any other `readdir` error (`EACCES`, `ENOTDIR`, …) | `AdoptionError` naming the directory, with the opt-out remedy. Propagates to the caller, as today (264 D7). |
  | `parseFrontmatter` on an architecture file | unreadable file, no frontmatter, or malformed frontmatter | not derived |
  | `findExistingStatePlan` | a slice plan that can't be read or parsed | parses to no entries, so it is skipped (264 D7) |

- How a bad architecture file surfaces: a misspelled `provenance` value is a `cf check` finding (the frontmatter rule allows only `derived`). A file with absent or unparseable frontmatter is skipped by `cf check` for every document type, not only architecture files, so it is not reported. Such a file counts as a planning artifact that isn't derived, and the project is navigated as already planned. Nothing is mislabelled as adopted or mid-adoption. The adoption agent writes this frontmatter from the guide's template, so the case is rare. The general gap, `cf check` not reporting documents with missing or unparseable frontmatter, is outside this slice.

### D5 — Split the mapping into a stage and an outcome
Status: decided
- `decideStage({ optedOut, facts })`, checked in order:
  1. `optedOut` → `{ kind: 'opted-out' }`
  2. `derivedArchitectures.length > 0 && existingStatePlan === null` → `{ kind: 'adoption-incomplete', derivedArchitectures }`
  3. `artifacts.length > 0` → `{ kind: 'already-planned', artifacts, existingStatePlan }`
  4. otherwise → `{ kind: 'unplanned' }`
- `decideOutcome({ stage, source? })` returns the stage unchanged for the first three kinds. For `unplanned` it requires `source` and returns `brownfield` or `greenfield` against `BROWNFIELD_MIN_SOURCE_LINES`. A missing `source` when the stage is `unplanned` throws, as today's lazy-input rule does.
- `readPlanningFacts` calls `findPlanningArtifacts`, `findArchitectureArtifacts` and `findExistingStatePlan` as they are today. None of their signatures changes.
- A concept on its own is not a planning artifact. `findPlanningArtifacts` matches only initiative plans, architecture files and slice plans, never `000-concept.*`, so a concept-only project is `unplanned` and is decided by its code signals.
- An opted-out project skips the file reads, as today's `declined` does.
- Split because the stage decides most cases without walking the source tree, and source volume is measured only for `unplanned`. One ordering function serves navigation and 271, with no duplicated logic.
- `AdoptionOutcome` becomes `opted-out | adoption-incomplete | already-planned | brownfield | greenfield`.

### D6 — Navigation: two lines, no adoption steps
Status: decided
- `adoptionNavLines(projectPath)` returns `{ warnings: string[]; skipFirstRun: boolean }`. It reads the opt-out and the planning facts, calls `decideStage`, and measures source volume only for `unplanned`:

  | Outcome | Warning | `skipFirstRun` |
  |---|---|---|
  | `opted-out` | none | false |
  | `adoption-incomplete` | `INCOMPLETE_ADOPTION_LINE` | false |
  | `already-planned` | none | true when `existingStatePlan` is set, else false |
  | `brownfield` | `BROWNFIELD_LINE` | false |
  | `greenfield` | none | false |

  The legacy notice (D3), when present, is added to the warnings in every row.
- Line texts, defined once in `adoption/adoptionLines.ts`:
  - `BROWNFIELD_LINE`: `This project has existing code and no planning artifacts. Adopting an existing codebase arrives with sq onboard. To treat the project as new: cf config set adoption.state declined`
  - `INCOMPLETE_ADOPTION_LINE`: `A derived architecture exists, but no slice plan has retroactive entries, so adoption is incomplete. It resumes through sq onboard. To treat the project as new: cf config set adoption.state declined`
  - `inconclusiveDetectionLine(reason)`: `cf could not tell whether this project holds existing code: <reason>. To treat the project as new: cf config set adoption.state declined`
- Navigation never returns an adoption action. The warnings join `navWarnings` in the no-active-slice guard, where `routeAdoption` runs today, and navigation otherwise proceeds as for any project.
- `skipFirstRun` for an adopted project keeps 264's behavior: first-run logic treats sparse planning state as a fresh project and must not fire for a project whose slice plan records its existing system. Retroactive entries already count as complete, so `cf next` points at the first unbuilt slice.
- An adopted project whose architecture or slice plan isn't registered gets the navigator's ordinary "set the architecture" guidance. 264's dedicated `register-plan` and `plan-new-work` steps go with the rest of the adoption steps.
- The source-volume walk fails in two ways: a non-`ENOENT` read error, and reaching `MAX_WALK_ENTRIES` (20,000) entries before `BROWNFIELD_MIN_SOURCE_LINES`. The cap case is reachable without existing code, for example a concept-only project holding a large asset or data tree. The warning is advisory and must not block `cf next`, so `adoptionNavLines` catches `AdoptionError` from `measureSourceVolume` only, and returns `inconclusiveDetectionLine` with the error's message as the reason, with `skipFirstRun` false. This is a visible warning naming the cause, not a silent fallback. The catch carries a comment saying so. Read errors from the planning-artifact reads still propagate, as today (264 D7). 271's report decides its own handling of the same error.
- Layering: `adoptionNavLines` lives in `adoption/` with the other gathering functions, so `WorkflowNavigator` imports from `adoption/` and 271 imports from the same place. `adoption/planningFacts.ts` reads through `introspection/parsers/` and `detection/`, and neither imports `adoption/` beyond `contracts.ts`, so no file-level import cycle is added.
- Deleted: `adoptionNavigation.ts` entirely (`decideAdoptionNav`, `gatherAdoptionInputs`, `buildAdoptionStepAction`, `UNSET_STATE_WARNING`, `NO_EXISTING_STATE_PLAN_WARNING`, `outsideConceptPhaseWarning`, the step texts), and in `WorkflowNavigator.ts` `routeAdoption`, `gateDerivedArchitecture` and `AdoptionRoute`. `gateBlockAction` stays, because the project's own arch gate uses it; its comment drops the adoption reference.

### Patterns and Conventions
- Literal values are defined once: `ADOPTION_STATES` and `LEGACY_ADOPTION_STATES` in `ConfigKeys.ts`, `DERIVED_PROVENANCE` in `frontmatterSchema.ts`, `OVERRIDE_REMEDY` in `adoption/contracts.ts`, and the navigation lines in `adoption/adoptionLines.ts`.
- The notice text is built in one function, `legacyAdoptionStateNotice(value)`, in `adoption/adoptionState.ts`.
- The stage and outcome functions are pure. Gathering is separate and async, following the existing lazy-input pattern of `decideOutcome`.

## Implementation Details
### Migration Plan
**Config data.** No file is rewritten. Each stored value behaves as follows:

| Stored value | Read result | Visible effect |
|---|---|---|
| absent or `""` | not opted out | none |
| `declined` | opted out | none (unchanged) |
| `in_progress`, `complete` | not opted out | notice on `cf next` / `workflow_next` until `cf config unset adoption.state` |
| anything else | `AdoptionError` (unchanged) | error names the allowed values |

**Code removed**
- `readAdoptionState`, `isAdoptionState`, the `AdoptionState` type and its re-exports from `config/index.ts` and `adoption/adoptionState.ts`.
- `decideOutcome`'s state branches and the `adoption-in-progress` and `adoption-closed` kinds.
- `adoptionNavigation.ts`, `routeAdoption`, `gateDerivedArchitecture`, `AdoptionRoute` (D6).
- The `in_progress` half of `OVERRIDE_REMEDY` in `sourceVolume.ts` and `planningArtifacts.ts`. The remedy becomes `To treat the project as new and skip detection: cf config set adoption.state declined`, defined once in `adoption/contracts.ts` and imported by both.

**Consumers updated**
- `WorkflowNavigator.ts` (D6).
- `packages/core/src/config/index.ts` exports.
- README config table row for `adoption.state`, reworded to the new description. The README's adoption section is left for 272.

**Tests**
- `tests/adoption/adoptionState.test.ts`: rewritten for `readAdoptionOptOut`: absent, `""`, `declined`, each legacy value with its notice, and an unknown value that throws.
- `tests/adoption/adoptionOutcome.test.ts`: rewritten for `decideStage` and `decideOutcome`. Covers each stage in order, opt-out winning over a derived arch, a derived arch plus a retroactive plan giving already-planned, a non-derived arch giving already-planned, and the threshold boundary.
- New `tests/adoption/planningFacts.test.ts`: derived and non-derived architectures, an unreadable architecture file, an existing-state plan, a concept-only repo (`unplanned`), and an empty repo. Fixtures use the real frontmatter layout the guide writes, both compact and with extra fields.
- `tests/config/ConfigKeys.test.ts`: the enum is `["", "declined"]`, setting `in_progress` is rejected, and getting a stored `in_progress` returns it.
- Deleted: `adoptionNavigation.decide.test.ts`, `adoptionNavigation.actions.test.ts`.
- Rewritten for D6's table: `WorkflowNavigator.adoption.test.ts`, CLI `next.adoption.test.ts`, MCP `workflowNextAdoption.test.ts`. Each covers brownfield (one line), adoption incomplete (one line), opted out (no line), greenfield (no line), an adopted project navigated to its first unbuilt slice, and a legacy value (notice). CLI and MCP give the same warnings. `tests/helpers/adoptionFixtures.ts` keeps its optional state, now limited to `declined` and the legacy values.
- `adoptionNavLines` with a source walk that throws (an injected `measureSourceVolume` failure, and a fixture past `MAX_WALK_ENTRIES` with no source): `cf next` succeeds and carries `inconclusiveDetectionLine` naming the cause.
- `cf check` with a stored legacy value: a test runs the checker on a project whose `.context-forge.toml` holds `adoption.state = "in_progress"` and asserts that the findings equal those for the same project without the key.
- `mcp-server/tests/integration/pureBuild.test.ts`: its `in_progress` config stays as a stored legacy value. That the build ignores it is still the point of the test.
- Unchanged: the retroactive navigation and checker tests, which store no adoption state.

## Integration Points
### Provides to Other Slices
- **271:** `readAdoptionOptOut`, `readPlanningFacts`, `decideStage`, `decideOutcome` and `legacyAdoptionStateNotice` behind the detection report. `cf onboard`'s stop message can reuse `BROWNFIELD_LINE`.
- **272:** the final key description, the opt-out command and the two navigation lines for docs.

### Consumes from Other Slices
- 263: the retroactive marker, through `findExistingStatePlan`, and `provenance: derived`.
- 268: no build reader of `adoption.state`.

## Success Criteria
### Functional Requirements
- Each outcome comes from files alone. A derived architecture with no retroactive plan is `adoption-incomplete`. Any other planning artifact is `already-planned`. A project with no planning artifacts, including a concept-only one, is brownfield or greenfield by source volume.
- `adoption.state = "declined"` gives `opted-out` whatever the files say.
- `cf next` and `workflow_next` give `BROWNFIELD_LINE` for an unadopted brownfield repo and `INCOMPLETE_ADOPTION_LINE` for an incomplete adoption, as warnings on otherwise normal navigation. Neither ever recommends an adoption step or `cf build` for adoption.
- An adopted project is navigated like any planned project: `cf next` points at its first unbuilt slice.
- Greenfield and already-planned navigation is unchanged.
- A config holding `in_progress` or `complete` produces no error on `cf next`, `workflow_next`, `cf build`, `cf check` or `cf config get`. `cf next` and `workflow_next` show the legacy notice, and `cf config unset adoption.state` removes it.
- `cf check`'s findings are identical with and without a stored legacy value. `cf check` never reads `adoption.state`, and reads config only through `ConfigManager.get`, which doesn't validate enums.
- `cf config set adoption.state in_progress` (and `complete`) fails with the enum error, which lists `""` and `"declined"`.
- `cf config get adoption.state` shows the D1 description.

### Technical Requirements
- Outside the legacy handling in `ConfigKeys.ts` and `adoptionState.ts`, no source file contains `in_progress` or `complete` as adoption states.
- `adoptionNavigation.ts`, `readAdoptionState` and the config `AdoptionState` type no longer exist. `WorkflowNavigator.ts` has no adoption-specific routing beyond the `adoptionNavLines` call.
- Tests cover every row of the Migration Plan's config table, every `decideStage` branch and every row of D6's table.
- Format, lint, typecheck and the full test suite pass.

### Integration Requirements
- 271 can build its report from `decideOutcome` and the gathering functions alone.

### Verification Walkthrough
Use a scratch copy of a repo with more than 2000 source lines and no `project-documents/user/architecture`, registered with `cf init`. Run the local build: `node packages/cli/dist/index.js` (aliased `cfl` below).

1. **Unadopted brownfield.** `cfl config get adoption.state` shows value `""` and the new description. `cfl next` shows `BROWNFIELD_LINE` and no adoption step.
2. **Legacy value.** Set `[adoption]\nstate = "in_progress"` in `.context-forge.toml` by hand. `cfl next` exits 0 and adds the notice. `cfl check` gives the same findings as before the edit. `cfl config unset adoption.state`, then `cfl next`: the notice is gone. `cfl config set adoption.state complete` fails, listing `""` and `"declined"`.
3. **Incomplete adoption.** Add `project-documents/user/architecture/100-arch.existing.md` with `provenance: derived`. `cfl next` shows `INCOMPLETE_ADOPTION_LINE`.
4. **Adopted.** Add `100-slices.existing.md` with one checked `retroactive` entry and one unchecked new entry. `cfl next` shows no adoption line and points at the new entry once the plan is registered. `shasum .context-forge.toml` before and after shows no write.
5. **Opt-out.** `cfl config set adoption.state declined` on the step 1 repo. `cfl next` shows no adoption line.
6. **MCP parity.** Repeat steps 1 and 2 through `workflow_next`. The warnings match the CLI.

## Risk Assessment
### Technical Risks
- Shipped 0.19.x configs hold `in_progress` or `complete` written by 261–264. An enum that rejected them on read would break `cf next` for those users.
- The derivation depends on `provenance: derived` being present. A derived architecture written without it reads as "already planned".
- `cf next` now walks the source tree for `unplanned` projects, which today's unset-state path does not.

### Mitigation Strategies
- `ConfigManager.get` doesn't validate enums, and `readAdoptionOptOut` handles both legacy values before its enum check (D2). Tests cover reading each legacy value.
- The guide's adoption prompt requires `provenance: derived`, and `cf check` validates the field's value (D4).
- The walk runs only when no planning artifact exists, and stops at `BROWNFIELD_MIN_SOURCE_LINES` and `MAX_WALK_ENTRIES`. A walk failure becomes a visible warning, never a failed `cf next` (D6).

## Implementation Notes
### Development Approach
1. `ConfigKeys.ts` enum, legacy constant and description, then `readAdoptionOptOut`, the notice and the shared remedy constant, with their tests.
2. `DERIVED_PROVENANCE` and `readPlanningFacts` with tests.
3. `decideStage` and `decideOutcome` rework with tests.
4. `adoption/adoptionLines.ts` and the `WorkflowNavigator` change; delete `adoptionNavigation.ts` and its tests; rewrite the navigator, CLI and MCP adoption tests; add the checker test.
5. README config row, then a grep sweep for stale `in_progress`/`complete` adoption text and `cf build` adoption advice in `packages/*/src`.

Effort: 3/5.

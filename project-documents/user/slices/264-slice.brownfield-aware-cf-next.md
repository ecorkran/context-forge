---
docType: slice-design
slice: brownfield-aware-cf-next
project: context-forge
parent: project-documents/user/architecture/260-slices.brownfield-adoption.md
dependencies:
- 261
- 263
interfaces:
- 265
dateCreated: 20261020
dateUpdated: 20261020
status: not_started
turns: 21
promptTokens: 1513735
cachedTokens: 1400510
cacheWriteTokens: 113189
completionTokens: 26430
durationSeconds: 258.6
costUsd: 1.714687
usageRounds: 1
pricedRounds: 1
---

# Slice Design: brownfield-aware-cf-next

## Overview

`cf next` doesn't know about adoption. Its first-run logic (`WorkflowNavigator.detectFirstRunContext`) reads only the phase and which planning files exist, so an adopted project ends up on the wrong recommendation twice:

- **During adoption.** Once the brownfield prompt has written `000-concept`, a Phase 0 project with a concept gets "Advance to Phase 1". Following that advice moves the instruction off Phase 0, and slice 261 (D4) then stops selecting the brownfield prompt. Adoption breaks halfway through.
- **After adoption.** The derived architecture and the existing-state slice plan exist, but nothing points the project at them. The stored instruction is still `Phase 0: Concept`, so `cf next` again says "Advance to Phase 1", and a Phase 0 `cf build` now produces the greenfield concept prompt (261 D4, `complete` doesn't select the brownfield prompt).

This slice makes the navigator read `adoption.state` (261) and the retroactive marker (263):

- **`in_progress`:** recommend the next adoption step. Every step's command is `cf build`, so the instruction stays at Phase 0.
- **`complete`:** skip first-run logic and point at the first new (non-retroactive) entry in the existing-state slice plan. If the plan isn't registered yet, register it first. If it holds no new work, recommend planning some.
- **`""`:** today's navigation, plus one warning in the single case where today's advice would skip detection on an existing codebase (D2).
- **`declined`:** today's navigation, unchanged.

## Value

- **The initiative's goal.** After adoption, `cf next` names the first piece of new work, not Phase 0.
- **Adoption can't be derailed by the navigator.** During adoption, `cf next` keeps the user on `cf build` and the brownfield prompt, and tells them which artifact comes next.
- **Planned and greenfield projects are untouched**, apart from the D2 warning, which `declined` silences.

## Technical Scope

Included:
- A new module `packages/core/src/introspection/adoptionNavigation.ts`: gathers the adoption inputs and decides the adoption recommendation (D1–D6).
- `WorkflowNavigator.computeNext`: one call in the no-active-slice guard, after the existing arch gate. Its result can return an action, add a warning, or skip first-run logic (D1).
- Extraction of the existing `preSlicePlan` gate → `NextAction` mapping into one navigator helper, `gateBlockAction`, used by the existing arch gate and by the adoption arch gate (D4). Internal to `WorkflowNavigator.ts`.
- `findExistingStatePlan` in `introspection/parsers/` (D8), and one additive export beside 261's `findPlanningArtifacts` (Interfaces Required).
- An import-boundary rule in `eslint.config.mjs` (D8).

Excluded:
- Running brownfield detection (the source walk) in `cf next` (D2).
- Any write by `cf next`: no state transition, no pointer or phase change (D3).
- `cf status` / `workflow_status` output. `getStatus` is unchanged.
- `agent_onboard`. Slice 260 made it setup plus a handoff to `cf build`, so it has nothing to branch on.
- Changes to the brownfield guide prompt, and any change to an exported signature of 261 or 263.

## Dependencies

### Prerequisites
- **Slice 261 (designed, not built):** `readAdoptionState`, `ADOPTION_STATES`, `findPlanningArtifacts`, `CONCEPT_PHASE`, the build's Phase 0 eligibility rule (D4 of 261).
- **Slice 263 (designed, not built):** `SlicePlanEntry.retroactive`, retroactive entries parsed as complete, and the build writing `complete` through `completeAdoptionIfPlanRecorded`.
- 264 is implemented after both land (slice plan order). It consumes their exported interfaces as designed and changes none of them.

### Interfaces Required
- **Phase 0 test:** `resolvePhaseValue(project.instruction) === CONCEPT_PHASE`, the exact comparison 261's resolver makes, built from the same two exports. No new helper and no edit to 261's resolver.
- **`findArchitectureArtifacts(root): Promise<string[]>`**, additive in `detection/planningArtifacts.ts` beside `findPlanningArtifacts`. It uses the same `nnn-arch` / `nnn-hld` filename constants, so no pattern is duplicated, and returns matches sorted by index. `findPlanningArtifacts` is unchanged.
- **`findExistingStatePlan(checkoutPath): Promise<string | null>`**, new in `introspection/parsers/` (D8). After it lands, 263's `completeAdoptionIfPlanRecorded` calls it instead of its inline scan, with no change to that function's signature or behavior, so the "existing-state plan" rule lives in one place. This is the only edit to another slice's code.
- Existing: `conceptDocExists`, `findFirstNotCompleteEntry`, `evaluateGate`, `resolveArtifactPath`, `extractSliceIndex` in the navigator.

## Architecture

### Component Structure

```
packages/core/src/introspection/
  adoptionNavigation.ts         new
    gatherAdoptionInputs(project, status) → Promise<AdoptionNavInputs>     (I/O)
    decideAdoptionNav(inputs) → AdoptionNav                                (pure)
  parsers/existingStatePlan.ts  new: findExistingStatePlan                 (D8)
  WorkflowNavigator.ts          computeNext: call in the no-active-slice guard; gateBlockAction helper
packages/core/src/detection/
  planningArtifacts.ts          + findArchitectureArtifacts (additive)
eslint.config.mjs               + import-boundary rule (D8)
```

`WorkflowNavigator.ts` is already over 1000 lines, so the adoption logic gets its own module, as `setupCiOffer.ts` did. The navigator only calls it and routes the result.

### Data Flow

```
cf next / workflow_next → nav.getNext(project)       (project.projectPath is the checkout, via the worktree overlay)
  computeNext
    GUARD no-project-path                             unchanged
    getStatus                                         unchanged
    GUARD no-active-slice
      existing arch gate (project.fileArch)           unchanged; now via gateBlockAction
      gatherAdoptionInputs(project, status)
        readAdoptionState(projectPath)
        'declined' → stop
        ''         → Phase 0 test, conceptDocExists, findPlanningArtifacts (D2), then stop
        in_progress / complete → conceptDocExists, findArchitectureArtifacts, findExistingStatePlan,
                                 registered plan (resolveArtifactPath('fileSlicePlan', …)) and its open entry
      decideAdoptionNav(inputs) → AdoptionNav
        not-adopting → today's flow
        warn         → push warning; today's flow
        recommend    → step 'existing-state-plan' first runs the derived arch's preSlicePlan gate (D4);
                       return the action (or the gate's action)
        adopted      → skip detectFirstRunContext; today's fall-through ("pick your first slice")
    active-slice lifecycle                            unchanged
  getNext: setup-ci offer attached                    unchanged
```

`cf next` and `workflow_next` both call `getNext`, so their recommendations match by construction. A test asserts it.

### State Management

No new state. The navigator reads `adoption.state` and the filesystem, and writes nothing (D3). The transitions remain 261's and 263's.

## Technical Decisions

### D1 — Where adoption routing sits in `computeNext`
Status: decided
- Only in the no-active-slice guard, after the existing `fileArch` gate and before `detectFirstRunContext`. That guard is where first-run logic lives, and both failure modes in the Overview happen there.
- With an active slice, navigation is unchanged in every state. Adoption doesn't set a slice, and 263 already makes a retroactive active slice complete.
- The decision is a discriminated union, switched exhaustively in the navigator:

```ts
type AdoptionNav =
  | { kind: 'not-adopting' }                     // declined, or '' with no warning: today's navigation
  | { kind: 'warn'; warning: string }            // today's navigation plus one warning (D2, D5, D6)
  | { kind: 'recommend'; step: AdoptionNavStep } // navigator builds the action for the step
  | { kind: 'adopted' };                         // complete, plan registered with new work

// Internal to adoptionNavigation.ts; not exposed on NextAction.
type AdoptionNavStep =
  | 'concept' | 'architecture' | 'existing-state-plan' | 'record-completion'   // D4
  | 'register-plan' | 'plan-new-work';                                         // D6
```

- `adopted` only suppresses `detectFirstRunContext`. The existing fall-through then reaches "You have a slice plan but no active slice", which already picks the first not-complete entry. Retroactive entries are checked, so that's the first new entry, with no new code. Its rationale already says to run `cf set phase 4`, which moves the instruction off Phase 0, the move 263 left to this slice.
- Rejected: adding adoption branches inside `detectFirstRunContext`. It's synchronous over six positional arguments, and adoption needs async reads.

### D2 — `cf next` doesn't run brownfield detection; it warns where today's advice would skip it
Status: decided
- `cf next` never walks the source tree. Detection has one owner, the build (261), and can throw `AdoptionError` on a tree it can't judge; `cf next` would then fail on a question it doesn't need answered, or swallow the error.
- **The gap, stated correctly.** With `adoption.state` at `""`, a Phase 0 project that already has a concept gets "Advance to Phase 1". Following it moves the instruction off Phase 0, so no build ever runs detection (261 D4). This is not hypothetical: per the arch's Current State, earlier releases' onboarding ran the greenfield concept conversation without inspecting code, so projects onboarded before this initiative can hold a concept on an existing codebase with the state unset. The arch's "Already planned" rule ("a concept on its own does not count") covers exactly these repos, and sends them to code-signal detection on the next Phase 0 build.
- **Handling.** When the state is `""`, the instruction passes the Phase 0 test, a concept exists, and `findPlanningArtifacts` finds nothing, the result is `warn`. Today's recommendation is kept, with the warning: "adoption.state is unset. If this is an existing codebase, run cf build before advancing the phase: at Phase 0 the build checks for existing code and starts adoption. Advancing skips that check. To mark the project as new and silence this: cf config set adoption.state declined". The `cf build` advice is correct for both outcomes: brownfield starts adoption, greenfield rebuilds the concept prompt and leaves the state unset.
- These are the same conditions under which 261's resolver would run detection, so the warning appears exactly where detection is still pending and nowhere else. With planning artifacts present, the project is "already planned" and detection would not run, so no warning.
- Other unset cases (Phase 0 without a concept → `cf build`, which detects; Phases 1–3) are today's navigation.
- `declined` is a fresh project (261 D3): today's navigation, no warning.
- Rejected: a read-only detection resolver for `cf next`. It's a second caller of the source walk, only to choose wording, and it brings the walk's failure modes into a query command.

### D3 — `cf next` stays read-only; the build records completion
Status: decided
- When the state is `in_progress` and an existing-state plan already exists, `cf next` recommends `cf build` (step `record-completion`). It doesn't call `completeAdoptionIfPlanRecorded`.
- Why: `cf next` and `workflow_next` write nothing today (261 D4 relies on that). The completing build already shows the completion notice and says to run `cf next` (263 D5), so it costs one extra command, once.
- Rejected: completing adoption in `cf next`. A second writer of `adoption.state` and a side effect on a query command.

### D4 — Adoption steps while `in_progress`
Status: decided
Applies when the state is `in_progress` and the instruction passes the Phase 0 test. The first condition that matches decides:

| # | Condition | Step | Recommendation | Command |
|---|---|---|---|---|
| 1 | an existing-state plan exists | `record-completion` | "The existing-state slice plan is written. Run cf build to record adoption as complete." | `cf build` |
| 2 | no concept | `concept` | "Next adoption step: baseline concept." | `cf build` |
| 3 | no architecture artifact | `architecture` | "Next adoption step: architecture derived from the code." | `cf build` |
| 4 | otherwise | `existing-state-plan` | "Next adoption step: existing-state slice plan." | `cf build` |

- Each rationale says that `cf build` assembles the brownfield adoption prompt, which resumes from the artifacts that exist, and gives the exit: `cf config set adoption.state declined`.
- The order is the arch's guide-prompt contract (concept → architecture → existing-state slice plan). Steps name the artifact, not a position ("step N of 3"), so cf carries no step count and no guide wording. A unit test pins the three artifact steps to that order.
- No step sets `phase` or suggests `cf set phase`. The brownfield prompt runs only at Phase 0 (261 D4).
- **Arch gate before step 4.** The derived architecture is gated like any other (263 D7). Before returning step 4, the navigator evaluates `preSlicePlan` for the lowest-index architecture artifact (263 D6's base-100 rule) and returns the gate's action if it blocks, through `gateBlockAction`. The derived arch is usually not registered as `fileArch` during adoption, so the existing gate wouldn't catch it.
- An adopted project starts with no planning artifacts (261 D6), so any architecture present was written during adoption.

### D5 — `in_progress` outside Phase 0 is a warning, not an override
Status: decided
- If the instruction fails the Phase 0 test (the user moved the phase by hand), the result is `warn`: today's navigation plus "adoption.state is in_progress, but the instruction is '{instruction}'. The brownfield adoption prompt runs only in Phase 0. To resume adoption: cf set phase 'Phase 0: Concept'. To stop adopting: cf config set adoption.state declined".
- Why: 261 D4 treats moving the phase as the user's explicit choice. Recommending `cf build` here would build the wrong prompt, and forcing the phase back would override the user.
- The test reads `project.instruction`, the field the build reads, so the two checks can't drift.

### D6 — After adoption (`complete`)
Status: decided
The first condition that matches decides:

| # | Condition | Result |
|---|---|---|
| 1 | no existing-state plan | `warn`: "adoption.state is complete, but no slice plan with retroactive entries was found. To write it: cf config set adoption.state in_progress, then cf build. To treat the project as new: cf config set adoption.state declined" |
| 2 | `fileSlicePlan` unset, or its file doesn't exist | `recommend`, step `register-plan` |
| 3 | the registered plan is the existing-state plan and has no not-complete entry | `recommend`, step `plan-new-work` |
| 4 | otherwise | `adopted` |

- Row 1 only arises from a hand-set state; it gets a warning on today's navigation rather than its own step.
- **`register-plan`:** "Adoption is complete. Register the derived architecture and existing-state slice plan." The command is `cf set arch {archStem}` when an architecture artifact shares the plan's index (263 D6 puts both at 100); `computeAutoSetFields` then sets `fileSlicePlan` too. Otherwise `cf set plan {planStem}`. Stems come from the found paths.
- **`plan-new-work`:** "Adoption is complete. Every entry in {planStem} is recorded history. Plan the first new work as entries after the retroactive ones." One command, `cf set phase 'Phase 3: Slice Planning'`; the rationale says to run `cf build` next, or `cf build` alone if the phase is already Phase 3. 263 D6 puts new work in the same plan, after the retroactive entries.
- **`adopted`:** D1's fall-through: `cf set slice {first new index}`, then `cf set phase 4`.
- A registered plan that isn't the existing-state plan (the PM moved on) goes to `adopted` (row 4), and normal navigation runs on it.

### D7 — Failure modes of the new reads
Status: decided
The adoption decision chooses the recommendation, so a read error is never turned into a warning that quietly changes the answer.

| Case | Behavior | What the user does |
|---|---|---|
| `.context-forge.toml` malformed | 261's parse error propagates (261 D9) | Fix the file |
| `adoption.state` outside `ADOPTION_STATES` (hand-edited) | Configuration error naming the key, the value and the allowed values; never read as `""` | `cf config set adoption.state <value>` |
| Architecture or slice plan directory unreadable (not ENOENT) | Error names the path and code (261 D6) | Fix permissions |
| A slice plan file can't be read | `parseSlicePlan` returns no entries, so that plan isn't the existing-state plan; the registered plan also gets `getStatus`'s per-plan warning (#62) | Fix the plan file |
| Files change between reads | The result may be stale for that one call; `cf next` writes nothing (D3) | Re-run `cf next` |

- `cf next` reports a thrown error through `handleError` (non-zero exit); `workflow_next` through its existing catch as `errorResult("Error: {message}")`. Same message on both surfaces.

### D8 — Dependency direction, enforced by lint
Status: decided
- Layers, lowest first: `introspection/parsers/` → `adoption/` → the rest of `introspection/` (navigator, checker). `adoption/` already imports `introspection/parsers/` (263), and the navigator imports `adoption/`. Every import runs one way across these layers, so there's no package-level cycle.
- `findExistingStatePlan` goes in `introspection/parsers/`, the bottom layer, because both 263's completion function and this navigator need it. Placing it in `adoption/` would make the parsers layer's callers reach up.
- **Mechanical guard:** a `no-restricted-imports` block in `eslint.config.mjs`:
  - files `packages/core/src/adoption/**`: forbid `**/introspection/*` except `**/introspection/parsers/**` and `**/introspection/types*`.
  - files `packages/core/src/introspection/parsers/**`: forbid `**/adoption/**`.
  
  Lint runs in pre-commit and CI, so a later upward import fails the build rather than relying on review.
- Rejected: injecting an adoption port into `WorkflowNavigator`. It removes the import, but changes the constructor at every call site (CLI, MCP and over 60 test constructions) for a direction the lint rule already guarantees.

### Patterns and Conventions
- The step values, the warning texts and the recommendation texts are each defined once, in `adoptionNavigation.ts`.

## Implementation Details

### API Contracts

```ts
// introspection/adoptionNavigation.ts
export interface AdoptionNavInputs {
  state: AdoptionState;
  conceptInstruction: boolean;            // resolvePhaseValue(project.instruction) === CONCEPT_PHASE
  instruction: string;                    // for the D5 warning
  conceptExists: boolean;
  planningArtifactsExist: boolean;        // '' only (D2)
  architecturePaths: string[];            // ascending index
  existingStatePlanPath: string | null;
  registeredPlanPath: string | null;      // fileSlicePlan resolved, file present
  registeredPlanHasOpenEntry: boolean;    // only meaningful when registered === existing-state plan
}
export function gatherAdoptionInputs(project: ResolvedProject, status: WorkflowStatus): Promise<AdoptionNavInputs>;
export function decideAdoptionNav(inputs: AdoptionNavInputs): AdoptionNav;

// introspection/parsers/existingStatePlan.ts
// The first slice plan, by index, with at least one retroactive entry.
export function findExistingStatePlan(checkoutPath: string): Promise<string | null>;
```

`gatherAdoptionInputs` reads only what the state needs (Data Flow) and leaves the other fields empty. `NextAction` keeps its current shape, so `workflow_next` needs no tool change.

## Integration Points

### Provides to Other Slices
- **265 (end-to-end verification):** the "`cf next` points at new work" end state, asserted on `recommendation` and `suggestedCommand`. Its real-repo runs include `cf next` before the first `cf build` on an unset brownfield repo with a concept (D2 warning).

### Consumes from Other Slices
- **261:** `readAdoptionState`, `ADOPTION_STATES`, `CONCEPT_PHASE`, `findPlanningArtifacts` and its filename constants. `declined` = fresh project.
- **263:** `retroactive` entries parsed as complete (so `findFirstNotCompleteEntry` skips them unchanged), and the build writing `complete`. 263's `completeAdoptionIfPlanRecorded` switches to `findExistingStatePlan` (Interfaces Required).
- If 263's guide rule hasn't shipped, the brownfield prompt can't write the marker. Adoption then stays at step `existing-state-plan`, which is the correct report.

### Architecture note (for the PM)
- The arch's "One detection, many consumers" principle lists `cf next` as a consumer of detection. This slice has `cf next` consume detection's persisted result (`adoption.state`) and, while it's unset, point at `cf build` (D2) instead of detecting. Suggested amendment to that bullet: "`cf next` reads the persisted adoption state; it does not run detection." The arch is not edited here.

## Success Criteria

### Functional Requirements
- **Declined:** `cf next` output is identical to today's for every first-run fixture (no phase, Phase 0 with and without concept, Phases 1–3).
- **Unset:** identical to today's for the same fixtures, except Phase 0 with a concept and no planning artifact, which adds the D2 warning to today's recommendation. With a planning artifact present, no warning.
- **`in_progress` at Phase 0:**
  - no concept → step `concept`, command `cf build`
  - concept, no architecture → step `architecture`
  - concept and architecture, no existing-state plan → step `existing-state-plan`
  - with `workflow.review_enabled = true` and the derived arch unreviewed → the preSlicePlan "Review required before creating the slice plan" action instead of step `existing-state-plan`
  - an existing-state plan present → step `record-completion`
  - no step suggests `cf set phase` or sets `phase`
- **`in_progress` outside Phase 0:** today's recommendation for that phase, plus the D5 warning.
- **`complete`:**
  - no existing-state plan → today's navigation plus the D6 row 1 warning
  - plan not registered, same-index arch present → step `register-plan`, `cf set arch 100-arch.{name}`. After running it, the next `cf next` recommends `cf set slice` for the first non-retroactive entry.
  - plan registered with new entries → "Pick slice {first new index}". No "Advance to Phase 1" in any complete-state fixture.
  - plan registered, all entries retroactive → step `plan-new-work`, command `cf set phase 'Phase 3: Slice Planning'`
  - a different plan registered → normal navigation on that plan
- **Active slice set:** recommendations unchanged in every adoption state.
- **Parity:** `workflow_next` returns the same `recommendation`, `suggestedCommand` and warnings as `cf next --json` for every adoption fixture, and the same error message for the out-of-enum `adoption.state` fixture (D7).
- **Read-only:** `adoption.state` and the project record are unchanged after `cf next` in every fixture.

### Technical Requirements
- Unit tests for `decideAdoptionNav`: every row of D4 and D6, the D4 order pin, the D2 and D5 warnings, and `not-adopting` for `declined` and for `""` without the D2 conditions.
- Unit tests for `findExistingStatePlan` (no plan, plan without marker, plan with marker, lowest index wins), with a plan line written exactly as 263's Marker Specification gives it. 263's `completeAdoptionIfPlanRecorded` tests still pass after it delegates.
- Failure-mode tests for D7: an out-of-enum `adoption.state`, and an unreadable plan file.
- Navigator tests (fixtures in temp dirs): each Functional Requirements bullet.
- The D8 lint rule is in `eslint.config.mjs`, and `pnpm lint` passes.
- This repo's `cf next` and `cf next --json` output is unchanged (it has planning artifacts, so no D2 warning).
- `pnpm -r build`, lint, typecheck and existing tests pass.

### Integration Requirements
- 265 can run adoption end to end and reach "`cf next` points at new work" with no manual pointer or state edits beyond the commands `cf next` suggests.

### Verification Walkthrough

Use the local build (the global `cf` is the published package): `alias cfl="node $PWD/packages/cli/dist/index.js"` from the repo root after `pnpm -r build`. Slices 261 and 263 must be implemented, with guide ≥ v0.22.2.

1. **Planned project unchanged.**
   ```bash
   cfl next --json > /tmp/next-before.json   # in this repo, on main before the slice
   cfl next --json > /tmp/next-after.json    # after the slice
   diff /tmp/next-before.json /tmp/next-after.json   # expect: no differences
   ```
2. **Unset state, concept present (D2).** Make a brownfield scratch project as in 261's walkthrough step 2 (`/tmp/bf`), but before any `cfl build` add `project-documents/user/project-guides/000-concept.bf.md` (valid frontmatter). `cfl next`: expect "Advance to Phase 1" plus the D2 warning. `cfl build > /dev/null && cfl config get adoption.state`: expect `in_progress`.
3. **Adoption steps.** `cfl next --json | jq '{recommendation, suggestedCommand}'`: expect "Next adoption step: architecture derived from the code.", `cf build`. Add `project-documents/user/architecture/100-arch.existing.md` with `provenance: derived`; expect "Next adoption step: existing-state slice plan." Remove the concept and re-run to see the `concept` step, then restore it.
4. **Arch gate during adoption.** `cfl config set workflow.review_enabled true && cfl next`. Expect "Review required before creating the slice plan" for architecture 100. Set it back to `false`.
5. **Record completion.** Add `100-slices.existing.md` with the three entries from 263's walkthrough step 1 (100 and 101 retroactive, 102 new).
   ```bash
   cfl next                                      # expect: "The existing-state slice plan is written...", cf build
   cfl config get adoption.state                 # expect: in_progress (cf next wrote nothing)
   cfl build > /dev/null && cfl config get adoption.state   # expect: complete
   ```
6. **Points at new work.**
   ```bash
   cfl next                     # expect: register-plan, "cf set arch 100-arch.existing"
   cfl set arch 100-arch.existing
   cfl next                     # expect: "Pick slice 102: Export to CSV", cf set slice 102
   ```
   This is the initiative's end state: the first piece of new work, not Phase 0.
7. **No new work.** Check entry 102 (`[x]`) and mark it retroactive, then `cfl next`. Expect step `plan-new-work` and `cf set phase 'Phase 3: Slice Planning'`. Undo the edit.
8. **Paused.** `cfl config set adoption.state in_progress && cfl set phase 'Phase 2: Architecture' && cfl next`. Expect the Phase 2 recommendation plus the D5 warning. Restore with `cfl set phase 'Phase 0: Concept'` and `cfl config set adoption.state complete`.
9. **MCP parity.** From an MCP client in `/tmp/bf`, call `workflow_next` at steps 3 and 6 and compare with `cfl next --json`. Expect them to match.

## Implementation Notes

### Development Approach
1. `findExistingStatePlan` in `introspection/parsers/`, switch 263's `completeAdoptionIfPlanRecorded` to it; `findArchitectureArtifacts`; the D8 lint rule. Existing 261/263 tests must still pass.
2. `decideAdoptionNav`, with unit tests for every row.
3. `gatherAdoptionInputs`; extract `gateBlockAction` from the existing arch gate; wire `computeNext` (D1, D4 gate).
4. Navigator fixtures, the failure-mode tests, the parity test, the read-only assertions. Run the walkthrough.

### Special Considerations
- Performance: `declined` and planned projects add one `ConfigManager.get` on the no-active-slice path. With the state unset, the Phase 0 test is in memory; only at Phase 0 with a concept does `findPlanningArtifacts` run (two directory reads). The other adoption reads run only for `in_progress` or `complete`.

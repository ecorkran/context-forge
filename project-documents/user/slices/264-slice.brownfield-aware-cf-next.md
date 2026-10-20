---
docType: slice-design
slice: brownfield-aware-cf-next
project: context-forge
parent: project-documents/user/architecture/260-slices.brownfield-adoption.md
dependencies: [261, 263]
interfaces: [265]
dateCreated: 20261020
dateUpdated: 20261020
status: not_started
---

# Slice Design: brownfield-aware-cf-next

## Overview

`cf next` doesn't know about adoption. Its first-run logic (`WorkflowNavigator.detectFirstRunContext`) reads only the phase and which planning files exist, so an adopted project ends up on the wrong recommendation twice:

- **During adoption.** Once the brownfield prompt has written `000-concept`, a Phase 0 project with a concept gets "Advance to Phase 1". Following that advice moves the instruction off Phase 0, and slice 261 (D4) then stops selecting the brownfield prompt. Adoption breaks halfway through.
- **After adoption.** The derived architecture and the existing-state slice plan exist, but nothing points the project at them. The stored instruction is still `Phase 0: Concept`, so `cf next` again says "Advance to Phase 1", and a Phase 0 `cf build` now produces the greenfield concept prompt (261 D4, `complete` doesn't select the brownfield prompt).

This slice makes the navigator read `adoption.state` (261) and the retroactive marker (263):

- **`in_progress`:** recommend the next adoption step (concept → architecture → existing-state slice plan → record completion). Every step's command is `cf build`, so the instruction stays at Phase 0.
- **`complete`:** skip first-run logic and point at the first new (non-retroactive) entry in the existing-state slice plan. If the plan isn't registered yet, register it first. If it holds no new work, recommend planning some.
- **`""` and `declined`:** today's navigation, unchanged.

## Value

- **The initiative's goal.** After adoption, `cf next` names the first piece of new work, not Phase 0.
- **Adoption can't be derailed by the navigator.** During adoption, `cf next` keeps the user on `cf build` and the brownfield prompt, and tells them which artifact comes next.
- **Planned and greenfield projects are untouched.** Their state is `""` (or `declined`), and the only added cost is one config read on the no-active-slice path.

## Technical Scope

Included:
- A new module `packages/core/src/introspection/adoptionNavigation.ts`: gathers the adoption inputs and decides the adoption recommendation (D1–D5).
- `WorkflowNavigator.computeNext`: one call in the no-active-slice guard, after the existing arch gate. Its result can return an action, add a warning, or skip first-run logic (D1).
- Extraction of the existing `preSlicePlan` gate → `NextAction` mapping into one helper, used by the existing arch gate and by the adoption step that writes the existing-state plan (D4).
- A structured `adoptionStep` field on `NextAction`, so consumers key on it and never on recommendation text (D6).
- Two small changes to the 261/263 `adoption/` code, both extractions with no behavior change (Interfaces Required).

Excluded:
- Running brownfield detection (the source walk) in `cf next`. Detection stays in the build (D2).
- Any write by `cf next`: no state transition, no pointer or phase change (D3).
- `cf status` / `workflow_status` output. `getStatus` is unchanged.
- `agent_onboard`. Slice 260 made it setup plus a handoff to `cf build`, so it has nothing to branch on.
- Changes to the brownfield guide prompt.

## Dependencies

### Prerequisites
- **Slice 261 (designed, not built):** `readAdoptionState`, `ADOPTION_STATES`, `findPlanningArtifacts`, `CONCEPT_PHASE`, the build's Phase 0 eligibility rule (D4 of 261).
- **Slice 263 (designed, not built):** `SlicePlanEntry.retroactive`, retroactive entries parsed as complete, `evaluateEntryGate`, and `completeAdoptionIfPlanRecorded`, which writes `complete`.
- 264 is implemented after both land (slice plan order). If either deviates from its design in the interfaces below, this slice adapts to the code as built.

### Interfaces Required
- **From 261, `isConceptInstruction(instruction): boolean`** exported from `adoption/`. It's the rule 261's resolver already applies (`resolvePhaseValue(instruction) === CONCEPT_PHASE`). If 261 inlines the rule, this slice extracts it into that function and has the resolver call it, so the build and the navigator can't disagree about what "Phase 0" means.
- **From 261, typed planning artifacts.** `findPlanningArtifacts` returns entries with a kind (`'initiative-plan' | 'architecture' | 'slice-plan'`) and a path, rather than bare paths. If 261 ships bare paths, this slice adds the kind in `planningArtifacts.ts`, where the filename patterns already live, and updates its callers. Re-matching filenames in the navigator would duplicate those patterns.
- **From 263, `findExistingStatePlan(checkoutPath): Promise<string | null>`** in `adoption/adoptionCompletion.ts`: the read-only half of `completeAdoptionIfPlanRecorded` (the first slice plan, by index, with at least one retroactive entry). If 263 ships it as one function, this slice splits it, and `completeAdoptionIfPlanRecorded` calls `findExistingStatePlan`. The rule for "the existing-state plan has been written" stays in one place.
- Existing: `conceptDocExists`, `findFirstNotCompleteEntry`, `evaluateGate`, `resolveArtifactPath`, `extractSliceIndex` in the navigator.

## Architecture

### Component Structure

```
packages/core/src/introspection/
  adoptionNavigation.ts    new
    gatherAdoptionInputs(project, status) → Promise<AdoptionNavInputs>     (I/O)
    decideAdoptionNav(inputs) → AdoptionNav                                (pure)
  WorkflowNavigator.ts     computeNext: call in the no-active-slice guard; gateBlockAction(...) helper
  types.ts                 NextAction + adoptionStep?; ADOPTION_NAV_STEP
packages/core/src/adoption/
  index.ts                 exports isConceptInstruction, findExistingStatePlan (extractions)
```

`WorkflowNavigator.ts` is already 1049 lines, so the adoption logic gets its own module, as `setupCiOffer.ts` did. The navigator only calls it and routes the result.

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
        state '' or 'declined' → stop (no further reads)
        conceptDocExists, findPlanningArtifacts, findExistingStatePlan
        registered plan: resolveArtifactPath('fileSlicePlan', …) and whether it is the existing-state plan
        open new entry: findFirstNotCompleteEntry(status.slicePlan.entries) when the registered plan is that plan
      decideAdoptionNav(inputs) → AdoptionNav
        not-adopting → today's flow
        recommend    → step 'existing-state-plan' first runs the derived arch's preSlicePlan gate (D4);
                       return the action (or the gate's action)
        paused       → push warning; today's flow
        adopted      → skip detectFirstRunContext; today's fall-through ("pick your first slice")
    active-slice lifecycle                            unchanged
  getNext: setup-ci offer attached                    unchanged
```

`cf next` and `workflow_next` both call `getNext`, so their recommendations match by construction. A test asserts it.

### State Management

No new state. The navigator reads `adoption.state` and the filesystem, and writes nothing (D3). The transitions remain 261's and 263's: the build writes `in_progress` on detection and `complete` once an existing-state plan exists.

## Technical Decisions

### D1 — Where adoption routing sits in `computeNext`
Status: decided
- Only in the no-active-slice guard, after the existing `fileArch` gate and before `detectFirstRunContext`. That guard is where first-run logic lives, and both failure modes in the Overview happen there.
- With an active slice, navigation is unchanged in every state. Adoption doesn't set a slice. A user who sets one has moved to slice work, and 263 already makes a retroactive active slice complete.
- The decision is a discriminated union, switched exhaustively in the navigator:

```ts
type AdoptionNav =
  | { kind: 'not-adopting' }                     // '' or 'declined': today's navigation
  | { kind: 'recommend'; step: AdoptionNavStep } // navigator builds the action for the step
  | { kind: 'paused'; warning: string }          // in_progress, instruction not Phase 0 (D5)
  | { kind: 'adopted' };                         // complete, plan registered with new work
```

- `adopted` only suppresses `detectFirstRunContext`. The existing fall-through then reaches "You have a slice plan but no active slice", which already picks the first not-complete entry. Retroactive entries are checked, so that's the first new entry, with no new code. Its rationale already says to run `cf set phase 4` after selecting the slice, which moves the instruction off Phase 0. 263 left that move to this slice; this is where it happens.
- Rejected: adding adoption branches inside `detectFirstRunContext`. It's a synchronous function over six positional arguments, and adoption needs async reads it doesn't have.

### D2 — `cf next` doesn't run brownfield detection
Status: decided
- With `adoption.state` at `""`, `cf next` behaves as today. It doesn't walk the source tree to guess whether the project is brownfield.
- Why: detection has one owner, the build (261), and it can throw `AdoptionError` on a tree it can't judge. `cf next` would then either fail on a question it doesn't need answered, or swallow the error. Onboarding hands off to `cf build`, never to `cf next` (260), so the first brownfield build sets `in_progress` before `cf next` matters. In the rare case `cf next` runs first on an unset brownfield repo, it recommends `cf build`, which is correct: the build detects and selects the brownfield prompt.
- `declined` is a fresh project (261 D3) and gets today's navigation.
- Rejected: a read-only detection resolver for `cf next`. It's another caller of the source walk that has nothing to do with its result except change wording.

### D3 — `cf next` stays read-only; the build records completion
Status: decided
- When the state is `in_progress` and an existing-state plan already exists, `cf next` recommends `cf build` (step `record-completion`). It doesn't call `completeAdoptionIfPlanRecorded`.
- Why: `cf next` and `workflow_next` write nothing today (261 D4 relies on that), and the navigator is documented as stateless. A write would also have to be suppressed for read-only callers, which would mean adding 261's `persist`/`read-only` option to the navigator. The completing build already shows the completion notice and says to run `cf next` (263 D5), so it costs one extra command, and only once.
- Rejected: completing adoption in `cf next`. It's one fewer command, at the price of a second writer of `adoption.state` and a side effect on a query command.

### D4 — Adoption steps while `in_progress`
Status: decided
Applies when the state is `in_progress` and `isConceptInstruction(project.instruction)` holds. The first condition that matches decides:

| # | Condition | `adoptionStep` | Recommendation | Command |
|---|---|---|---|---|
| 1 | an existing-state plan exists (`findExistingStatePlan`) | `record-completion` | "The existing-state slice plan is written. Run cf build to record adoption as complete." | `cf build` |
| 2 | no concept (`conceptDocExists`) | `concept` | "Adoption step 1 of 3: baseline concept." | `cf build` |
| 3 | no `architecture` artifact | `architecture` | "Adoption step 2 of 3: architecture derived from the code." | `cf build` |
| 4 | otherwise | `existing-state-plan` | "Adoption step 3 of 3: existing-state slice plan." | `cf build` |

- Each rationale says that `cf build` assembles the brownfield adoption prompt, which resumes from the artifacts that exist, and names the artifact this step produces. It also gives the exit: `cf config set adoption.state declined`.
- The steps mirror the guide prompt's order (arch: concept → architecture → existing-state slice plan). cf names the step, and the prompt does the work. cf hard-codes no guide wording.
- The `phase` field is omitted, and no step suggests `cf set phase`. The brownfield prompt runs only at Phase 0 (261 D4), so every step keeps the instruction there.
- **Arch gate before step 4.** The derived architecture is gated like any other (263 D7). Before returning step 4, the navigator evaluates `preSlicePlan` for the architecture artifact's index. If that gate blocks, it returns the gate's action instead, through the same `gateBlockAction` helper the existing `fileArch` gate uses. The derived arch is usually not registered as `fileArch` during adoption, so the existing gate wouldn't catch it. If the arch is registered, the existing gate runs first, and this check repeats a clearing result at no extra cost.
- An architecture artifact is any entry of kind `architecture` from `findPlanningArtifacts` (`nnn-arch` or `nnn-hld`). An adopted project starts with no planning artifacts (261 D6), so any architecture present was written during adoption. More than one: the gate uses the lowest index, matching 263 D6's base-100 rule.

### D5 — `in_progress` outside Phase 0 is paused, not overridden
Status: decided
- If the instruction isn't the concept phase (the user moved the phase by hand), the result is `paused`. Navigation proceeds as today, with one warning: "adoption.state is in_progress, but the instruction is '{instruction}'. The brownfield adoption prompt runs only in Phase 0. To resume adoption: cf set phase 'Phase 0: Concept'. To stop adopting: cf config set adoption.state declined".
- Why: 261 D4 treats moving the phase as the user's explicit choice and builds that phase's prompt. Recommending `cf build` here would build the wrong prompt, and forcing the phase back would override the user. A warning keeps the choice visible without taking it away.
- The phase check uses `isConceptInstruction` on `project.instruction`, the field the build reads, not `developmentPhase` prefix matching. `computeAutoSetFields` keeps the two fields in sync when the phase is set, and reading the build's field rules out drift between the two checks.

### D6 — After adoption (`complete`)
Status: decided
The first condition that matches decides:

| # | Condition | Result |
|---|---|---|
| 1 | no existing-state plan | `recommend`, step `plan-missing` |
| 2 | `fileSlicePlan` unset, or its file doesn't exist | `recommend`, step `register-plan` |
| 3 | the registered plan is the existing-state plan and has no not-complete entry | `recommend`, step `plan-new-work` |
| 4 | otherwise | `adopted` |

- **`plan-missing`:** the state says complete, but no slice plan has a retroactive entry. This happens when the PM set `complete` by hand. Recommendation: "adoption.state is complete, but no existing-state slice plan (a slice plan with retroactive entries) was found." The rationale gives both ways on: `cf config set adoption.state in_progress`, then `cf build`, to write it; or `declined` to treat the project as new. No command is suggested, because cf can't tell which the PM wants. Navigating as if the project were fresh would be a silent fallback.
- **`register-plan`:** "Adoption is complete. Register the derived architecture and existing-state slice plan." The command is `cf set arch {archStem}` when an architecture artifact shares the plan's index (263 D6 puts both at 100). `computeAutoSetFields` then sets `fileSlicePlan` from it, so one command registers both. With no same-index architecture, the command is `cf set plan {planStem}`. Stems come from the found paths.
- **`plan-new-work`:** the plan records only history. "Adoption is complete. Every entry in {planStem} is recorded history. Plan the first new work as entries after the retroactive ones." Command: `cf set phase 'Phase 3: Slice Planning'`, then `cf build`. This is the one adoption recommendation that moves the phase, because new work starts at slice planning against the derived architecture. 263 D6 puts new work in the same plan, after the retroactive entries.
- **`adopted`:** D1's fall-through. It recommends `cf set slice {first new index}`, then `cf set phase 4`.
- A registered plan that isn't the existing-state plan (the PM moved on to another plan) goes to `adopted` (condition 4). The user's pointer is respected, and normal navigation runs on it.
- With an active slice, none of this applies (D1).

### D7 — `adoptionStep` on `NextAction`
Status: decided
- `NextAction` gains `adoptionStep?: AdoptionNavStep`, set on every `recommend` result. The values are defined once:

```ts
export const ADOPTION_NAV_STEP = {
  Concept: 'concept',
  Architecture: 'architecture',
  ExistingStatePlan: 'existing-state-plan',
  RecordCompletion: 'record-completion',
  PlanMissing: 'plan-missing',
  RegisterPlan: 'register-plan',
  PlanNewWork: 'plan-new-work',
} as const;
export type AdoptionNavStep = (typeof ADOPTION_NAV_STEP)[keyof typeof ADOPTION_NAV_STEP];
```

- Why: an agent following `cf next --json` or `workflow_next` during adoption needs to know which step it's on, and recommendation text is a display label (CLAUDE.md: never use user-accessible labels as logical structure). `pendingDecisions` set the precedent.
- A gate block at step 4 (D4) carries the gate's own fields and no `adoptionStep`, the same as any other gate block.
- Text output: `cf next` prints recommendation, rationale and command as today. It doesn't print the step separately, since the recommendation already names it.

### Patterns and Conventions
- The step values, the paused warning and the recommendation texts are each defined once, in `adoptionNavigation.ts` or `types.ts`.
- Errors from `readAdoptionState`, `findPlanningArtifacts` and `findExistingStatePlan` propagate, so `cf next` fails explicitly. Unlike the setup-ci offer, the adoption decision isn't advisory: it chooses the recommendation, so a filesystem error can't be turned into a warning that quietly changes the answer.

## Implementation Details

### API Contracts

```ts
// introspection/adoptionNavigation.ts
export interface AdoptionNavInputs {
  state: AdoptionState;
  conceptInstruction: boolean;            // isConceptInstruction(project.instruction)
  instruction: string;                    // for the paused warning
  conceptExists: boolean;
  architecturePaths: string[];            // kind 'architecture', ascending index
  existingStatePlanPath: string | null;   // findExistingStatePlan
  registeredPlanPath: string | null;      // fileSlicePlan resolved, file present
  registeredPlanHasOpenEntry: boolean;    // only meaningful when registered === existing-state plan
}
export function gatherAdoptionInputs(project: ResolvedProject, status: WorkflowStatus): Promise<AdoptionNavInputs>;
export function decideAdoptionNav(inputs: AdoptionNavInputs): AdoptionNav;

// introspection/types.ts
interface NextAction { /* existing fields */ adoptionStep?: AdoptionNavStep; }
```

For `""` and `declined`, `gatherAdoptionInputs` stops after the state read and returns the other fields empty. `decideAdoptionNav` reads only `state` for those values.

`workflow_next` returns the `NextAction` as JSON today, so `adoptionStep` reaches MCP clients with no tool change.

## Integration Points

### Provides to Other Slices
- **265 (end-to-end verification):** the "`cf next` points at new work" end state its real-repo runs check, and `adoptionStep` for asserting each step.
- **Guide (ai-project-guide):** `adoptionStep` values, should the brownfield prompt or adoption guide want to tell the agent to check `cf next`. No guide change is required by this slice.

### Consumes from Other Slices
- **261:** `readAdoptionState`, `isConceptInstruction`, `findPlanningArtifacts` with kinds. `declined` = fresh project.
- **263:** `retroactive` entries parsed as complete (so `findFirstNotCompleteEntry` skips them unchanged), `findExistingStatePlan`, and the build writing `complete`.
- If 263's guide rule hasn't shipped, the brownfield prompt can't write the marker (263, Special Considerations). Adoption then stays at step 4 (`existing-state-plan`) even after a plan is written. That's the correct report: no plan with retroactive entries exists.

## Success Criteria

### Functional Requirements
- **Unset or declined:** `cf next` output is identical to today's for every first-run fixture (no phase, Phase 0 with and without concept, Phases 1–3).
- **`in_progress` at Phase 0:**
  - no concept → step `concept`, command `cf build`
  - concept, no architecture → step `architecture`
  - concept and architecture, no existing-state plan → step `existing-state-plan`
  - with `workflow.review_enabled = true` and the derived arch unreviewed → the preSlicePlan "Review required before creating the slice plan" action instead of step `existing-state-plan`
  - an existing-state plan present → step `record-completion`
  - no step suggests `cf set phase` or sets `phase`
- **`in_progress` outside Phase 0:** today's recommendation for that phase, plus the paused warning naming the instruction and both commands.
- **`complete`:**
  - no existing-state plan → step `plan-missing`, no suggested command
  - plan not registered, same-index arch present → step `register-plan`, `cf set arch 100-arch.{name}`. After running it, `fileSlicePlan` is set and the next `cf next` recommends `cf set slice` for the first non-retroactive entry.
  - plan registered with new entries → "Pick slice {first new index}". No "Advance to Phase 1" recommendation in any complete-state fixture.
  - plan registered, all entries retroactive → step `plan-new-work`, command `cf set phase 'Phase 3: Slice Planning'`
  - a different plan registered → normal navigation on that plan
- **Active slice set:** recommendations are unchanged in every adoption state.
- **Parity:** `workflow_next` returns the same `recommendation`, `suggestedCommand` and `adoptionStep` as `cf next --json` for every adoption fixture.
- **Read-only:** `adoption.state` and the project record are unchanged after `cf next` in every fixture.

### Technical Requirements
- Unit tests for `decideAdoptionNav`: every row of D4 and D6, `paused`, and `not-adopting` for `""` and `declined`.
- Navigator tests (fixtures in temp dirs): each Functional Requirements bullet, including the gate-before-step-4 case and the active-slice case.
- A real-format fixture: an existing-state plan line written exactly as 263's Marker Specification gives it.
- This repo's `cf next` and `cf next --json` output is unchanged (state `""`).
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
2. **Adoption steps.** Make a brownfield scratch project as in 261's walkthrough step 2 (`/tmp/bf`, state becomes `in_progress` after the first `cfl build`).
   ```bash
   cd /tmp/bf
   cfl next --json | jq '{recommendation, suggestedCommand, adoptionStep}'
   # expect: adoptionStep "concept", suggestedCommand "cf build"
   ```
   Add `project-documents/user/project-guides/000-concept.bf.md` (any content with valid frontmatter), then run `cfl next` again. Expect step `architecture`, not "Advance to Phase 1". Add `project-documents/user/architecture/100-arch.existing.md` with `provenance: derived`. Expect step `existing-state-plan`.
3. **Arch gate during adoption.** `cfl config set workflow.review_enabled true && cfl next`. Expect "Review required before creating the slice plan" for architecture 100. Set it back to `false`.
4. **Record completion.** Add `100-slices.existing.md` with the three entries from 263's walkthrough step 1 (100 and 101 retroactive, 102 new).
   ```bash
   cfl next --json | jq .adoptionStep            # expect: "record-completion"
   cfl config get adoption.state                 # expect: in_progress (cf next wrote nothing)
   cfl build > /dev/null && cfl config get adoption.state   # expect: complete
   ```
5. **Points at new work.**
   ```bash
   cfl next                     # expect: register-plan, "cf set arch 100-arch.existing"
   cfl set arch 100-arch.existing
   cfl next                     # expect: "Pick slice 102: Export to CSV", cf set slice 102
   ```
   This is the initiative's end state: the first piece of new work, not Phase 0.
6. **No new work.** Check entry 102 (`[x]`) and mark it retroactive, then `cfl next`. Expect step `plan-new-work` and `cf set phase 'Phase 3: Slice Planning'`. Undo the edit.
7. **Paused.** `cfl config set adoption.state in_progress && cfl set phase 'Phase 2: Architecture' && cfl next`. Expect the Phase 2 recommendation plus the paused warning. Restore with `cfl set phase 'Phase 0: Concept'`.
8. **MCP parity.** From an MCP client in `/tmp/bf`, call `workflow_next` at steps 2 and 5 and compare `recommendation`, `suggestedCommand` and `adoptionStep` with `cfl next --json`. Expect them to match.

## Implementation Notes

### Development Approach
1. Confirm or make the three `adoption/` extractions: `isConceptInstruction`, kinded `findPlanningArtifacts`, `findExistingStatePlan`. The existing 261/263 tests must still pass.
2. `ADOPTION_NAV_STEP`, `NextAction.adoptionStep`.
3. `decideAdoptionNav`, with unit tests for every row.
4. `gatherAdoptionInputs`; extract `gateBlockAction` from the existing arch gate; wire `computeNext` (D1, D4 gate).
5. Navigator fixtures, the parity test, the read-only assertions. Run the walkthrough.

### Special Considerations
- Performance: planned and greenfield projects add one `ConfigManager.get` on the no-active-slice path. The adoption reads (`readdir`, one slice plan parse) run only for `in_progress` or `complete`.
- `adoption/` already imports from `introspection/parsers/` (263), and this slice makes `introspection/` import from `adoption/`. Those are different files, so there's no module cycle, but `adoptionNavigation.ts` must import only from `adoption/index.ts` and never the other way round.

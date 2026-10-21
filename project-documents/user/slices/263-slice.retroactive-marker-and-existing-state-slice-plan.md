---
docType: slice-design
slice: retroactive-marker-and-existing-state-slice-plan
project: context-forge
parent: project-documents/user/architecture/260-slices.brownfield-adoption.md
dependencies:
- 261
interfaces:
- 264
dateCreated: 20261020
dateUpdated: 20261020
status: not_started
turns: 35
promptTokens: 2385221
cachedTokens: 2277623
cacheWriteTokens: 107534
completionTokens: 28563
durationSeconds: 321.6
costUsd: 2.72247
usageRounds: 1
pricedRounds: 1
---

# Slice Design: retroactive-marker-and-existing-state-slice-plan

## Overview

An adopted project's existing-state slice plan records built work as completed slices. Today that plan has two problems. With `workflow.review_enabled` on, nothing tells a recorded-history entry apart from executed work, so the gate has no honest answer for it. And nothing marks the moment adoption finishes, so slice 261's `adoption.state` stays `in_progress` until the PM sets it by hand.

This slice defines the **retroactive marker**, a backticked token on a slice plan entry line, and teaches cf to parse it:

- A retroactive entry is complete for every "done" check, because its checkbox must be `[x]` and every existing check already reads the checkbox.
- The review gate **skips** a retroactive entry with its own result kind. It never clears it, never reports it as reviewed, and never treats it as the PM-only `review: none` exemption. This amends the 240 gate rule.
- `cf check` reports a retroactive entry that has a slice design or task file as an error. It also reports a retroactive entry that isn't checked, and one indexed after new work.
- The derived architecture carries `provenance: derived` in frontmatter.
- The first persisting `cf build` that finds a slice plan with a retroactive entry moves `adoption.state` from `in_progress` to `complete`.

The design also fixes the index scheme: retroactive entries take the first indices of the adopted project's first initiative (base 100), and new work follows. A single coarse "existing system" entry is allowed.

## Value

- **An adopted plan can say what exists without lying about review.** The gate reports "retroactive, not reviewed" rather than "reviewed" or "pending review" on dozens of entries.
- **No loophole.** Marking new work retroactive fails `cf check`, because real work has a design or task file, and because retroactive entries must precede every new entry.
- **Adoption finishes on its own.** Writing the existing-state slice plan is the event that completes adoption, so 264 can point `cf next` at new work without a manual step.
- **One spec for three repos.** ai-project-guide writes its retroactive-marker rule from the Marker Specification below (briefing item 6). Squadron's pipeline gates read it through `cf list slices --json`, and squadron 364's "candidates adopt" indexes after it.

## Technical Scope

Included:
- Parser: `slicePlanParser.ts` recognizes the marker and sets `retroactive` on `SlicePlanEntry`. The token is stripped from `description`.
- Review gate: a new `GateSkip` result and one entry-aware entry point, used by both the navigator and the checker.
- Navigator: a retroactive active slice is `complete` with no `preAdvance` gate, and its rationale says it is retroactive.
- Checker: a new `retroactive-entry` rule in its own module, and a `review-gate` info finding that lists the retroactive entries the gate skipped.
- Frontmatter schema: optional `provenance: derived` on `architecture`.
- Adoption completion: one function in `adoption/`, called from 261's build resolver, plus an additive `adoption-completed` outcome and its Adoption Facts text.
- Display: `cf list slices` shows retroactive entries distinctly, and its JSON carries `retroactive`.

Excluded:
- Writing the existing-state slice plan or the derived architecture. The guide's brownfield prompt has the agent write them.
- The guide's retroactive-marker rule text (ai-project-guide, from the spec here).
- Any `cf next` change beyond a retroactive active slice (264).
- A command for setting or clearing the marker. Only the adoption flow writes it, by editing the plan.
- Gating the derived architecture differently. It is ordinary process work and its `arch` review gate applies unchanged (D7).

## Dependencies

### Prerequisites
- **Slice 261:** `adoption/` module (`readAdoptionState`, `writeAdoptionState`, `ADOPTION_STATES`, `findPlanningArtifacts`, `AdoptionOutcome`, `renderAdoptionFacts`, the build resolver and its `adoptionStateWrites` option). 261 has a design but no code yet. This slice builds on its interfaces as designed.
- **Initiative 240 (complete):** `reviewGate.ts`, `ruleReviewGate`, `ruleArchReviewGate`, the navigator gate.

### Interfaces Required
- `parseSlicePlan`, `SlicePlanEntry` (`introspection/parsers/slicePlanParser.ts`, `introspection/types.ts`).
- `evaluateReviewGate`, `GateResult`, `isBlockingGate` (`introspection/reviewGate.ts`).
- `detectDocuments` (`introspection/parsers/documentDetector.ts`) for the design and task file check.
- `FRONTMATTER_SCHEMAS` (`schema/frontmatterSchema.ts`).

## Architecture

### Component Structure

```
packages/core/src/introspection/
  parsers/slicePlanParser.ts   + RETROACTIVE_MARKER_RE; entry.retroactive; token stripped from description
  types.ts                     SlicePlanEntry + retroactive: boolean
  reviewGate.ts                + GateSkip, RETROACTIVE_NOTE, evaluateEntryGate(...)
  retroactiveRules.ts          new: ruleRetroactiveEntries(...) → ConsistencyFinding[]   (D4)
  ConsistencyChecker.ts        calls ruleRetroactiveEntries in checkAll; ruleReviewGate uses evaluateEntryGate
  WorkflowNavigator.ts         deriveSliceStatus: retroactive → complete via evaluateEntryGate
packages/core/src/schema/frontmatterSchema.ts   architecture + provenance?: ['derived']
packages/core/src/adoption/
  adoptionCompletion.ts        new: completeAdoptionIfPlanRecorded(checkoutPath)          (D5)
  adoptionOutcome.ts           AdoptionOutcome + { kind: 'adoption-completed'; planPath }
  adoptionFacts.ts             renders the completion notice
  adoptionResolver.ts          calls completeAdoptionIfPlanRecorded in the decide step
packages/cli/src/commands/slice.ts, output/entryStatusDisplay.ts   display (D8)
```

`ConsistencyChecker.ts` is already 1475 lines, so the new rule lives in its own module and the checker only calls it.

### Data Flow

**Parsing.** `parseSlicePlan` → each entry gets `retroactive` → every consumer of `SlicePlanEntry` (navigator, checker, `cf list slices`, MCP introspection, `ProjectModelBuilder`) sees it. Status still comes from the checkbox, so a valid retroactive entry is `complete` everywhere without consumer changes.

**Gate.**
```
caller has entry → evaluateEntryGate(projectPath, entry, boundary, config)
  entry.retroactive → { status: 'skipped', reason: 'retroactive', rationale }   (no file reads)
  otherwise        → evaluateReviewGate(projectPath, entry.index, boundary, config)   (unchanged)
```

**Checker (`checkAll`).** The per-slice rules run as today, and `ruleReviewGate` gets `skipped` for retroactive entries. Then `ruleRetroactiveEntries` runs once over every parsed plan, so the ordering check can see all plans together.

**Completion (inside 261's resolver, step 2, persisting builds only).**
```
readAdoptionState(checkoutPath) === 'in_progress'
  → completeAdoptionIfPlanRecorded(checkoutPath)
      findExistingStatePlan (264 D8, introspection/parsers/) → plan path with a retroactive entry, or null
      yes → writeAdoptionState(checkoutPath, 'complete') → { completed: true, planPath }
  completed → outcome { kind: 'adoption-completed', planPath }; the brownfield prompt is selected
              one last time, and the Adoption Facts section carries the completion notice
  not completed → 261's flow, unchanged
```

### State Management

- **No new persisted state.** The marker lives in the slice plan line, and provenance lives in the architecture frontmatter. The only state write is 261's `adoption.state`, `in_progress` → `complete`. 261's transition table already reserves that transition for this slice.
- `template_preview` (`read-only`) never completes adoption. It renders 261's `in_progress` flow.

## Technical Decisions

### D1 — Marker format: a backticked token after the entry title
Status: decided
- Format: `N. [x] **(NNN) Title** `retroactive` — description`. The token `` `retroactive` `` comes immediately after the closing `**` of the title, before the description separator.
- Parsing is lenient on formatting and strict on meaning. It matches the token at the start of the text after the title, with any whitespace and in any letter case. The backticks are required, because a bare word "retroactive" is ordinary prose and can begin a description. `RETROACTIVE_MARKER_RE` is defined once in `slicePlanParser.ts`, and the guide rule quotes the same format.
- The token is stripped from `description`.
- Only indexed entries (`PLAN_INDEXED_RE`) carry it. An unindexed entry has no stable index to skip a gate for.
- Why after the title, not a bold prefix (`**RETROACTIVE** **(100) …**`, the #117 grammar): squadron's own plan parser (`stats/planning_docs.py`, `_PLAN_ENTRY`) requires `**(NNN)` right after the checkbox and would silently drop prefixed entries from its stats. A suffix leaves every existing parser (cf before this slice, squadron) reading the entry as an ordinary checked slice. Older readers degrade to "complete, not marked", never to "missing".
- Rejected: a new checkbox character such as `[r]`. Every existing parser would drop the entry.
- Rejected: an inline `Status: retroactive`. `status` has five canonical values, and adding one ripples through every status consumer.
- Rejected: a field in a separate file. The marker must travel with the line it describes.

### D2 — "Done" comes from the checkbox; the marker requires `[x]`
Status: decided
- A retroactive entry must be checked. The parser keeps deriving status from the checkbox, so every existing "done" check counts a valid retroactive entry as complete with no change: `completedSlices`, `deriveEntryStatus`, `findFirstNotCompleteEntry`, `cf list slices`, `cf status`, the MCP introspection count, `ProjectModelBuilder`, and squadron's reads of `cf list slices --json` `status`.
- A retroactive entry with `[ ]` or `[~]` is a checker error (D4). The parser doesn't promote it to complete, because a silent promotion would hide the conflict between the box and the marker.
- One exception needs code: `WorkflowNavigator.deriveSliceStatus` derives the *active* slice's status from its task file, not the checkbox. When the active slice is retroactive (for example after `cf set slice 100`), it returns `complete` through `evaluateEntryGate` (D3), and the rationale appends `RETROACTIVE_NOTE`.

### D3 — The gate skips retroactive entries with a distinct result
Status: decided
- New result kind in `reviewGate.ts`: `GateSkip { status: 'skipped'; reason: 'retroactive'; rationale }`. It isn't `clears` (nothing was reviewed), it isn't `exempt` (that's the PM-only `review: none` and grandfathering), and it isn't blocking (`isBlockingGate` is false).
- One entry point: `evaluateEntryGate(projectPath, entry, boundary, config)`. It returns `GateSkip` for a retroactive entry at every slice-scoped boundary (`preTasks`, `preImplementation`, `preAdvance`), and otherwise delegates to `evaluateReviewGate` unchanged. The navigator and `ruleReviewGate` both call it, so the skip rule is written once. `preSlicePlan` is architecture-scoped, takes no entry, and is unaffected (D7).
- Reporting in `cf check`: when gating is enabled, one `info` finding per plan under rule `review-gate`: "Slices 100–104 are retroactive: recorded history, not reviewed. The review gate skips them." One finding per plan, not per entry, so a 20-entry baseline is one line. Unlike the `review: none` info, it is emitted whether or not the entries are checked, because a retroactive entry is never in flight.
- Rejected: reusing `evaluateExemption`. The arch forbids treating the marker as the review exemption, and the exemption's text and `gateExempt` status would report it as one.

### D4 — Checker rule `retroactive-entry`
Status: decided
`ruleRetroactiveEntries(projectPath, plans)` in `retroactiveRules.ts` runs once per `checkAll` over every parsed slice plan. Every finding is severity `error` and `fixable: false`, because each one needs a decision about which side is wrong:
1. **Has a design or task file:** `detectDocuments` finds `slices/{N}-slice.*.md` or `tasks/{N}-tasks.*.md` for a retroactive entry. "Slice N is marked retroactive but has a slice design / task file. Retroactive entries record work that predates adoption and never have them. Remove the marker, or remove the files if they were created by mistake." This is the rule that closes the gate loophole: new work always produces these files.
2. **Not checked:** the box is `[ ]` or `[~]`. "A retroactive entry records completed work; check it, or remove the marker."
3. **Indexed after new work:** a retroactive entry's index is greater than the lowest index of any non-retroactive, non-deprecated explicit-index entry in any plan. This enforces the arch's rule that retroactive entries precede new work. It also stops a later slice from being marked retroactive after the fact.

Adoption state is not checked here. A project whose `adoption.state` was later cleared or declined keeps a valid plan, and the three structural rules already bound what the marker can do.

### D5 — Adoption completes when a slice plan with a retroactive entry exists
Status: decided
- **Event:** a slice plan in the checkout (any `nnn-slices.*.md` that `findPlanningArtifacts` returns) contains at least one parsed retroactive entry. That is the observable fact that the existing-state plan has been written. A plan with no retroactive entries doesn't count: an adoption that recorded nothing built isn't an existing-state plan.
- **Mechanism:** `completeAdoptionIfPlanRecorded(checkoutPath)` in `adoption/adoptionCompletion.ts` is the entry point 261's resolver calls. The rule itself ("a slice plan with a retroactive entry exists") lives in 264's `findExistingStatePlan` in `introspection/parsers/` (264 D8), which this function delegates to, so `cf next` and the build share one definition. 261's resolver calls it in its decide step when the state is `in_progress` and writes are `persist`. Errors follow 261 D9: a failed write throws `AdoptionError` naming `.context-forge.toml` and the remedy (`cf config set adoption.state complete`).
- **The completing build:** it still selects the brownfield prompt, with outcome `adoption-completed` and the notice "adoption.state was set to complete by this build: existing-state slice plan found at {planPath}. Adoption is finished; run `cf next` for the next step." The agent may still be adding new work in step 3 of the prompt, so the build gives it the same prompt with one new fact rather than switching prompts mid-step. Later builds follow 261 (`complete` doesn't select the brownfield prompt).
- **Why the build:** it is the only writer 261 already has, and the brownfield prompt re-runs `cf build` between steps. `cf next` (264) may call the same function; that's 264's choice, and the function is exported for it.
- Rejected: `cf check --fix`. `fixAction` only edits checkboxes and frontmatter, so it would need a new config-write action for one transition.
- Rejected: a new `cf adoption complete` command. That's a new user-facing command for a step the system can observe.
- Rejected: deriving `complete` at read time without storing it. 264 and squadron read the persisted value.

### D6 — Index scheme: retroactive entries open the first initiative
Status: decided
- An adopted project has no planning artifacts (261 D6), so 100 is free. The derived architecture and the existing-state slice plan take base index 100 (`100-arch.{name}.md`, `100-slices.{name}.md`) under the normal initiative rules. Retroactive entries take 100, 101, … in order, and the PM's new work follows in the same plan, continuing the sequence. More than ten entries overflow into the next band, as the naming conventions already allow.
- A single coarse entry is valid: `1. [x] **(100) Existing System** `retroactive` — the system as built at adoption.` New work then starts at 101.
- Squadron 364 candidates are later initiatives (110+), so they index after every retroactive entry. That relative order is the only property squadron relies on, and D4 rule 3 enforces it.
- Rejected: a reserved band for retroactive work (050–099 or 800–899). 050–099 is for project-level documents, and 800–899 is reserved. A separate band also sits outside the working range that worktree index ranges and initiative numbering assume.

### D7 — Derived architecture provenance
Status: decided
- Frontmatter scalar `provenance: derived` on the architecture document. It is added to the `architecture` schema as optional with `values: ['derived']`, so `cf check` flags a misspelling through the existing `frontmatter-schema` rule.
- Informational only: no behavior branches on it. The derived architecture is an ordinary document. Its `arch` review gate (`preSlicePlan`) applies as for any architecture, because it was written under the process and downstream phases build on it.
- A scalar, not a nested block: the frontmatter parser is flat and drops nested blocks (`frontmatterParser.ts`). Squadron 361's provenance block on a concept is a separate convention that cf doesn't read.

### D8 — Display and JSON
Status: decided
- `SlicePlanEntry.retroactive` flows into `cf list slices --json` with no extra code, since entries are serialized as parsed. Squadron's `SliceEntry` can read it; `status` stays `complete`.
- Text output: `entryStatusDisplay` shows `✓ retroactive` for a checked retroactive entry, so the list doesn't present recorded history as reviewed work.

### Patterns and Conventions
- The marker regex, `RETROACTIVE_NOTE`, the `'retroactive'` skip reason and the `'derived'` provenance value are each defined once.
- New findings use the existing `ConsistencyFinding` shape. The rule id is `retroactive-entry`.

## Implementation Details

### API Contracts

**Marker Specification** (the contract handed to ai-project-guide and squadron):
- A retroactive slice is a slice plan entry, written by the adoption flow only, in the form `N. [x] **(NNN) Title** `retroactive` — description`.
- The entry must be checked, must have an explicit `(NNN)` index, and must have no slice design and no task file.
- Retroactive entries precede all new work in index order. In an adopted project they start at the first initiative's base index (100). One coarse "Existing System" entry is allowed.
- Meaning: the work exists and predates adoption. It counts as complete. It was never reviewed, and the review gate skips it. It is not the `review: none` exemption.
- The derived architecture carries `provenance: derived` in frontmatter.

```ts
// introspection/types.ts
interface SlicePlanEntry { /* existing fields */ retroactive: boolean; }

// introspection/reviewGate.ts
export interface GateSkip { status: 'skipped'; reason: 'retroactive'; rationale: string; }
export type GateResult = GateClearance | GateExemption | GateEvaluation | GateSkip;
export function evaluateEntryGate(
  projectPath: string, entry: SlicePlanEntry, boundary: SliceBoundary, config: ResolvedGate,
): Promise<GateResult>;

// adoption/adoptionCompletion.ts
export function completeAdoptionIfPlanRecorded(checkoutPath: string):
  Promise<{ completed: false } | { completed: true; planPath: string }>;

// adoption/adoptionOutcome.ts (additive to 261)
| { kind: 'adoption-completed'; planPath: string }
```

Every `switch` over `GateResult` and `AdoptionOutcome` stays exhaustive. Adding the kinds makes the compiler list each site to update.

### Database / Storage Schema

`architecture` in `FRONTMATTER_SCHEMAS` gains `provenance: { required: false, values: ['derived'] }`. No existing data changes.

## Integration Points

### Provides to Other Slices
- **264 (brownfield-aware `cf next`):** `entry.retroactive`; the guarantee that retroactive entries are complete and come first; `adoption.state === 'complete'` written automatically; and `completeAdoptionIfPlanRecorded` if `cf next` should complete adoption too. **264 owns what an adopted project's stored `Phase 0` instruction becomes.** After completion, 261 makes a Phase 0 build fall back to the concept prompt, so 264 must recommend leaving Phase 0 for the first new work item.
- **ai-project-guide:** the Marker Specification above, for its retroactive-marker rule and for the brownfield prompt's step 3.
- **Squadron:** `retroactive` in `cf list slices --json`, and the index order for 364's candidates. Squadron's `planning_docs.py` reads the entry unchanged (D1).

### Consumes from Other Slices
- **261:** the resolver's decide step, `writeAdoptionState`, `findPlanningArtifacts`, the outcome union and the renderer. If 261's implementation deviates from its design in these interfaces, this slice adapts to the code as built.

## Success Criteria

### Functional Requirements
- A plan line `1. [x] **(100) Existing System** `retroactive` — …` parses as `retroactive: true`, `status: complete`, with the token removed from the description. The same line in other letter cases or spacing parses the same. A description that merely starts with the word "retroactive" without backticks does not.
- Retroactive entries count as complete in `cf list slices`, `cf status`, `cf next`'s choice of the first incomplete slice, and `cf check`'s plan-status rules. With every entry retroactive and checked, the plan's status rule expects `complete`.
- With `workflow.review_enabled = true`, `cf check` raises no `pending-review` or `review-failed` finding for a retroactive entry. It raises one `review-gate` info per plan naming the retroactive entries as skipped and not reviewed. No output describes a retroactive entry as reviewed, cleared or exempt.
- `cf set slice 100` on a retroactive entry, then `cf next`: the slice is complete, the rationale says it is retroactive, and the recommendation advances.
- `cf check` reports `retroactive-entry` errors for: a retroactive entry with a slice design; one with a task file; an unchecked one; and one indexed after a non-retroactive entry in any plan.
- An `architecture` document with `provenance: derived` validates; `provenance: guessed` gets a `frontmatter-schema` finding.
- With `adoption.state = in_progress`, a persisting `cf build` in Phase 0 after a slice plan with a retroactive entry exists sets the state to `complete` and shows the completion notice in Adoption Facts. `template_preview` leaves the state at `in_progress`. A slice plan with no retroactive entries leaves it at `in_progress`.

### Technical Requirements
- Unit tests: parser (marker forms, prose false positive, unindexed entry ignored, description stripped); `evaluateEntryGate` at each slice boundary; `ruleRetroactiveEntries` (each of the three findings, no findings for a valid plan, deprecated entries ignored by the ordering check); `completeAdoptionIfPlanRecorded` (no plan, plan without marker, plan with marker, write failure → `AdoptionError`); frontmatter schema; renderer for `adoption-completed`; `entryStatusDisplay`.
- Integration fixture: an adopted project with `100-arch` (`provenance: derived`) and `100-slices` holding three retroactive entries and two new ones. Run with review gating on, through `cf check`, `cf list slices --json` and `cf next`.
- A real-format fixture: the plan line exactly as the guide rule writes it (CLAUDE.md parser rule).
- This repo's `cf check` output is unchanged (no plan here uses the marker).
- `pnpm -r build`, lint, typecheck and existing tests pass.

### Integration Requirements
- 264 can read `retroactive` and the `complete` state with no further core change.
- `cf list slices --json` output for existing plans differs only by the added `retroactive: false` field.

### Verification Walkthrough

Use the local build: `alias cfl="node $PWD/packages/cli/dist/index.js"` from the repo root after `pnpm -r build`. Slice 261 must be implemented.

1. **Set up an adopted fixture.** In a scratch copy of a brownfield project at `adoption.state = in_progress` (261's walkthrough step 2 produces one), add `project-documents/user/architecture/100-arch.existing.md` with `provenance: derived`, and `100-slices.existing.md` with:
   ```markdown
   1. [x] **(100) Core Library** `retroactive` — parsing and storage as built.
   2. [x] **(101) CLI** `retroactive` — command surface as built.
   3. [ ] **(102) Export to CSV** — first new work.
   ```
   Point the project at the plan with `cfl set plan project-documents/user/architecture/100-slices.existing.md`.
2. **Adoption completes.**
   ```bash
   cfl build | sed -n '/### Adoption Facts/,/^### /p'
   # expect: "adoption.state was set to complete by this build: existing-state slice plan found at ..."
   cfl config get adoption.state      # expect: complete
   ```
3. **Done checks and display.**
   ```bash
   cfl list slices                    # expect: 100 and 101 "✓ retroactive", 102 next
   cfl list slices --json | jq '.[] | {index, status, retroactive}'   # 100, 101: complete, true
   ```
   (Adjust the `jq` path to the command's actual JSON envelope.)
4. **Gate skips, never reviews.**
   ```bash
   cfl config set workflow.review_enabled true
   cfl check   # expect: one review-gate info "Slices 100–101 are retroactive ... not reviewed"; no pending-review for 100/101
   ```
5. **Loophole closed.** Create `project-documents/user/slices/101-slice.cli.md` and run `cfl check`. Expect a `retroactive-entry` error for slice 101 and a non-zero exit. Delete the file. Then append `4. [x] **(103) Later Work** `retroactive` — …` after the new entry 102 and run `cfl check`. Expect a `retroactive-entry` ordering error for 103. Remove the line.
6. **Active retroactive slice.** `cfl set slice 100 && cfl next`. Expect a complete status with the retroactive note, and a recommendation to move on to 102.

## Risk Assessment

### Technical Risks
- **Dependency on unbuilt 261.** Completion plugs into 261's resolver, which exists only as a design.

### Mitigation Strategies
- 263 is implemented after 261 lands (slice plan order). The completion function is self-contained, and only its single call site touches the resolver. The parser, gate and checker parts don't depend on 261 at all and can be built first.

## Implementation Notes

### Development Approach
1. Parser and `SlicePlanEntry.retroactive`, with tests, including the real-format fixture.
2. `GateSkip` and `evaluateEntryGate`; switch the navigator and `ruleReviewGate` to it; the per-plan `review-gate` info.
3. `retroactiveRules.ts` and its call in `checkAll`.
4. `provenance` in the architecture schema; `entryStatusDisplay`.
5. `adoptionCompletion.ts`, the `adoption-completed` outcome and notice, the resolver call. Requires 261's code.
6. Integration fixture; run the walkthrough.

### Special Considerations
- The marker is a convention cf parses, not a security boundary. Its protection against misuse is structural (D4): a design or task file, or a position after new work, makes it an error.
- After this slice ships, ai-project-guide replaces its "do not invent one" note in `guide.ai-project.brownfield-adoption.md` with the Marker Specification. Until it does, the brownfield prompt can't produce the marker, and adoption never completes automatically.

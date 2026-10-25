---
docType: slice-design
slice: pure-cf-build
project: context-forge
parent: project-documents/user/architecture/260-slices.brownfield-adoption.md
dependencies: []
interfaces:
- collapse-adoption-state
dateCreated: 20261025
dateUpdated: 20261025
status: not_started
turns: 47
promptTokens: 3299518
cachedTokens: 3189518
cacheWriteTokens: 109924
completionTokens: 26035
durationSeconds: 330.6
costUsd: 2.038625
usageRounds: 3
pricedRounds: 3
usageByModel:
  claude-opus-5-5:
    rounds: 3
    costUsd: 2.0386246999999997
    completionTokens: 26035
revision_number: 2
---

# Slice Design: Pure cf build

## Overview
Slices 261–263 put brownfield adoption inside the build pipeline. In Phase 0, `cf build`, `context_build` and `template_preview` run an adoption resolver. It reads `adoption.state`, runs detection, runs `sq probe`, swaps the concept prompt for the `brownfield-adoption` prompt, appends an "Adoption Facts" section, fills `fileComprehension`, and writes `adoption.state` (`in_progress` on first detection, `complete` once a retroactive plan exists).

This slice removes all of that. A build assembles context for the current phase and writes nothing, in Phase 0 as in every other phase. Code that only build-time adoption used is deleted. Detection functions that the 269/271 report consumes stay.

## Value
- `cf build` has one meaning again, and running it never changes project config.
- It removes the largest hidden side effect in cf, and the squadron process spawn on the build path.
- The adoption module shrinks, which leaves 269–271 smaller: they rework detection and state without a build caller to keep working.

## Technical Scope
**Included**
- Remove the adoption hook from the pipeline: `ContextIntegrator.resolveAdoptionFn`, the instruction swap, the `AdoptionError` rethrow, and the `CoreServiceFactory` wiring and options.
- Remove the Adoption Facts section from `ContextTemplateEngine` and the `adoptionFacts` field from `EnhancedContextData`.
- Remove `fileComprehension` from `EnhancedContextData` and the `Comprehension:` line in `SectionBuilder`. Its only producer was the resolver (D4).
- Delete `adoptionResolver.ts`, `adoptionFacts.ts` and `adoptionCompletion.ts`, plus `writeAdoptionState`, `BROWNFIELD_ADOPTION_INSTRUCTION`, the `AdoptionResolver`/`AdoptionSelection`/`SquadronProbe` types, and the `adoption-completed` outcome variant.
- Delete the squadron probe (`detection/squadronProbe.ts`), its tests, its contract test and its fixtures (D3).
- MCP: drop the `adoptionStateWrites` parameter from `generateContext`, and the `ContextToolOptions` probe seam from `registerContextTools`. CLI: drop the `adoptionStateWrites` argument in `build.ts`.
- Tests: delete the tests of deleted code, rewrite tests that used the resolver as a detection harness, and add the purity and byte-identity tests (D5, D6).

**Excluded (owned elsewhere)**
- `adoption.state` semantics, `readAdoptionState`, `decideOutcome`, and the `adoption.state` config key description: slice 269.
- `adoptionNavigation.ts`, `routeAdoption`, and the "run `cf build` to record adoption" text: slice 270.
- The detection report command, prompt delivery by key, and comprehension-path filling: slice 271.
- README, CLI and MCP reference text, the guide's brownfield prompt, and `MIN_GUIDE_VERSION`: slice 272.
- Retroactive entries, the review gate, conventions reconciliation and the docs map: unchanged.
- `MIN_GUIDE_VERSION` and `checkGuideMinimum`, together with the build warning on stderr and beside `context_build`, stay as they are.

## Dependencies
### Prerequisites
- None. Shipped 261–264 and 267 are the code being cut.

### Interfaces Required
- `createContextPipeline` (core) — callers are `cli/src/commands/build.ts` and `mcp-server/src/tools/contextTools.ts` (both `context_build` and `template_preview` go through `generateContext`).
- Kept detection and outcome modules stay exported from `@context-forge/core/node`. Their production consumers after the cut:
  - `pathPresent`: reconciliation, docs map, setup-ci offer, navigation.
  - `presentPaths`: reconciliation (`projectSources`), docs map (`discoverDocs`).
  - `sourceVolume`: docs map (`discoverDocs`).
  - `ciDetection`, `buildManifest`: the setup-ci offer (`setupCiOffer`).
  - `planningArtifacts`: navigation (`adoptionNavigation`, `existingStatePlan`).
  - **No production consumer after the cut; retained for 269/271:** `history` (`readHistory`), `comprehensionAnalysis` (`findComprehensionAnalysis`), and `adoptionOutcome` (`decideOutcome`). The `BROWNFIELD_MIN_SOURCE_LINES` constant is still read by `sourceVolume`. 269 reworks the outcome mapping, and 271's detection report and prompt delivery consume all three.

## Architecture
### Component Structure
After this slice, the build pipeline imports nothing from `adoption/` or `detection/`.

```
cf build ─┐
context_build ─┼─> generateContext / build.ts ─> createContextPipeline(projectPath)
template_preview ┘                                   └─> ContextIntegrator (task files, integration branch, permissiveness)
                                                          └─> ContextTemplateEngine (no Adoption Facts section)
```

What stays in `adoption/` is `contracts.ts` (only `AdoptionError`, still thrown by the kept detection modules), `adoptionState.ts` (read only, used by navigation until 269/270), and `adoptionOutcome.ts` (the outcome mapping that 269 reworks and 271 exposes).

### Data Flow
Before: `instruction` → resolver (state read → planning artifacts → source walk → probe spawn → state write) → maybe a swapped instruction plus facts → map → render.

After: `instruction` → map → render. Phase 0 always resolves to the concept prompt. An explicit `--it brownfield-adoption` (or `instructionType`) is an ordinary instruction lookup with no special case (D2).

### State Management
This slice adds no state. It removes both writers of `adoption.state` (`in_progress` and `complete`). After it, the only way to write the key is a hand `cf config set`. Existing values are left alone: the build ignores them, and navigation still reads them until 270.

## Technical Decisions

### D1 — The build has no adoption seam
Status: decided
- Remove the `resolveAdoptionFn` constructor parameter and its options from `createContextPipeline`. Its signature becomes `createContextPipeline(projectPath)`. Leaving a no-op hook would invite adoption back into the build. The arch rule is that `cf build` assembles and writes nothing.
- Rejected: keeping the resolver behind a read-only mode. That is still detection and probing on every Phase 0 build, which the slice plan forbids.

### D2 — Explicit `brownfield-adoption` instruction gets no special handling
Status: decided
- The build never selects the `brownfield-adoption` profile itself (arch, 20261025). It only honors the key when a user passes it explicitly, as `--it brownfield-adoption` or `instructionType`. That key resolves by name like any other instruction: the guide's prompt plus that profile's artifact filter. The build adds no facts and no comprehension path. If the installed guide has no prompt under that key, the build falls back to the visible "custom instruction" statement (`SectionBuilder.buildInstructionSection`), the same as for any unknown key, and 268 does not change that path. The adoption-specific missing-profile error existed only to guard automatic selection, which is gone.
- **The profile's `fileComprehension` entry is a no-op.** Profile filtering only clears schema artifact fields that the profile omits (`applyProfileFiltering`), and `fileComprehension` is not a schema field. Once D4 deletes it, nothing populates it, nothing renders it, and nothing throws. The output simply has no `Comprehension:` line. This is a stated absence, not a silent fallback, because the prompt defines both missing inputs:
  - No comprehension analysis: "work from the repo alone".
  - No Adoption Facts section: an explicit stop with a named message (arch, settled).
  The agent therefore stops rather than acting on missing facts. D5 checks this once.
- How that prompt is delivered properly belongs to 271. The guide drops its `cf build` steps in 272.
- **Which rule governs the missing-prompt case.** The architecture's "a missing guide prompt is an error, never a fallback" governs adoption-prompt delivery, which 271's primitive owns, and that primitive raises a named error. `cf build`'s generic instruction lookup is not adoption delivery after this slice. Its existing visible "custom instruction" fallback for any unknown key stays as it is, and `brownfield-adoption` is not special-cased (D1, D2).
- **Accepted interim state.** Between 268 and 271, an explicit `brownfield-adoption` build renders the prompt with no facts and no comprehension path, so the prompt stops by its own rule. That is acceptable because no release ships until 272 (Mitigation Strategies), and the only way to reach it is passing the key by hand.
- Rejected: rejecting the instruction in the build with an error. That would put the adoption special case back into the build, which is the very thing being removed.

### D3 — Delete the squadron probe here, not in 271
Status: decided
- The slice plan's rule for 268 is to delete the code only build-time adoption used. `runSquadronProbe` has exactly one consumer, the resolver, through `adoptionFacts` and `CoreServiceFactory`. If it stayed until 271, the code and its contract test would sit orphaned for three slices.
- 271's "Delete cf's squadron probe code" item is then already satisfied. 271 still owns the rest of its scope. The 271 slice plan entry now carries a note saying so, so its design does not re-check deleted code.
- Rejected: leaving the probe to 271. That keeps dead code, plus a test against squadron's contract that guards nothing.

### D4 — Delete `fileComprehension` from the build context
Status: decided
- Its only producer was the resolver. Without one, the field and the `Comprehension:` line in `SectionBuilder` can never render. 271(b) defines how the comprehension path reaches the adoption prompt, and 274 defines how it reaches later phases. Each of them adds what it needs.
- `findComprehensionAnalysis` and `COMPREHENSION_PROFILE_VARIABLE` stay in `detection/` for 271.

### D5 — Purity is proven by behavior, on all three surfaces
Status: decided
- Fixture: a brownfield checkout (≥ `BROWNFIELD_MIN_SOURCE_LINES` non-blank source lines, no planning artifacts) using the existing `brownfield-guide` fixture. A fake `sq` executable placed first on `PATH` writes a marker file whenever it is run.
- All three surfaces share `createContextPipeline`, so only the CLI path varies the state. It runs with no `.context-forge.toml`, then with `adoption.state = "in_progress"`. `complete` adds nothing, because the build no longer reads the key.
- MCP `context_build` and `template_preview` each run once, on the `in_progress` state.
- Every run must show:
  - The checkout's file tree and the bytes of `.context-forge.toml` are unchanged. A file that was absent is still absent.
  - The output contains the concept prompt and not `### Adoption Facts`.
  - The `sq` marker file does not exist.
- Two further checks, each run once:
  - The CLI and MCP `context_build` outputs are equal.
  - An explicit `brownfield-adoption` instruction renders the fixture guide's prompt text with no `Comprehension:` line and no `### Adoption Facts` (D2). The assertion uses `brownfield-guide` fixture text, never the installed guide.
- This replaces `mcp-server/tests/integration/adoptionParity.test.ts`, which proved the opposite behavior.

### D6 — Byte identity is proven against output captured before the cut
Status: decided
- The first task, run before any deletion, captures the current build output in exactly two cases: a greenfield project at Phase 0, and one planned project (with an architecture and slice plan) at Phase 4. It writes them as golden files under `core/tests/fixtures/pure-build-golden/` and adds a test that compares the pipeline output to them. That test must pass on the old code and on the new code. A golden file never changes in this slice. If one has to change, the cut changed behavior, and that is a defect.
- Only greenfield, already-planned and later-phase output must stay byte-identical. Brownfield Phase 0 output changes on purpose (D5).

### Patterns and Conventions
- `AdoptionError` stays in `adoption/contracts.ts`. The file header is rewritten to describe what it holds now; it is no longer a contract with the integrator. Moving the file is not worth the churn while 269 reworks the module.
- Tests that only used the resolver to drive detection are rewritten against the kept functions directly (`decideOutcome`, `findPlanningArtifacts`, `measureSourceVolume`). The case in `core/tests/docs-map/outOfTreeLinks.test.ts` is one of them.

## Implementation Details

### Migration Plan
| Item | Action |
|---|---|
| `core/src/adoption/adoptionResolver.ts`, `adoptionFacts.ts`, `adoptionCompletion.ts` | Delete |
| `core/src/adoption/contracts.ts` | Keep only `AdoptionError` |
| `core/src/adoption/adoptionState.ts` | Delete `writeAdoptionState`; keep the read |
| `core/src/adoption/adoptionOutcome.ts` | Remove the `adoption-completed` variant and its comment |
| `core/src/adoption/index.ts` | Drop the deleted re-exports |
| `core/src/detection/squadronProbe.ts`, `detection/index.ts` probe exports | Delete |
| `core/src/services/CoreServiceFactory.ts` | Remove the adoption wiring and the `options` param |
| `core/src/services/ContextIntegrator.ts` | Remove `resolveAdoptionFn`, the swap and the rethrow |
| `core/src/services/ContextTemplateEngine.ts` | Remove section 3.4 |
| `core/src/services/SectionBuilder.ts`, `core/src/types/context.ts` | Remove `adoptionFacts` and `fileComprehension` |
| `core/src/node.ts` | Update the adoption export comment |
| `cli/src/commands/build.ts` | `createContextPipeline(projectPath)` |
| `mcp-server/src/tools/contextTools.ts` | Drop `adoptionStateWrites`, `ContextToolOptions` and the template_preview comment |
| `mcp-server/tests/helpers/integrationSetup.ts` | Drop the probe option |

**Tests**
- Delete: `core/tests/adoption/adoptionResolver.test.ts`, `adoptionFacts.test.ts`, `adoptionCompletion.test.ts`, `adoptionBuild.integration.test.ts`; `core/tests/detection/squadronProbe*.test.ts`; `core/tests/fixtures/squadron-probe/`; `mcp-server/tests/integration/adoptionParity.test.ts`.
- Edit: `ContextIntegrator.test`, `ContextTemplateEngine.test`, `CoreServiceFactory.test`, `pipeline-integration.test`, `adoptionState.test` (the write cases go), `adoptionOutcome.test`, `docs-map/outOfTreeLinks.test`, `cli/tests/commands/build.test`, `cli/tests/integration/build.integration.test`, `mcp-server/tests/contextTools.test`.
- The `core/tests/fixtures/brownfield-guide` fixture stays; D5 uses it.

**Consumers:** only cf's own CLI and MCP packages import the removed exports. All four packages release in lockstep, so no external caller breaks.

**Behavior preserved:** the D6 golden test. **Behavior changed on purpose:** the D5 purity test.

## Integration Points
### Provides to Other Slices
- **269:** `adoption.state` has no writer other than the user, so 269 changes the key's meaning without a build caller to migrate. The `adoptionOutcome` and `adoptionState` read paths are left for it.
- **270:** navigation is the last consumer of `readAdoptionState`.
- **271:** a build with no adoption logic in it. The kept detection functions and `findComprehensionAnalysis` are ready for the report and for prompt delivery. The squadron probe is already gone (D3).
- **272:** `MIN_GUIDE_VERSION` is untouched, ready to be raised.

### Consumes from Other Slices
- Nothing new.

## Success Criteria
### Functional Requirements
- No `cf build`, `context_build` or `template_preview` path reads or writes `adoption.state`, runs detection or spawns `sq`.
- A Phase 0 build in a brownfield repo returns the concept prompt and writes nothing, whatever `adoption.state` holds.
- Greenfield, already-planned and later-phase builds are byte-identical to the output captured before the cut.
- CLI and MCP `context_build` outputs match.
- The `MIN_GUIDE_VERSION` warning still appears beside the build output (stderr for the CLI, separate from the context for MCP).

### Technical Requirements
- `services/` imports nothing from `adoption/` or `detection/`.
- No exported symbol remains that only the deleted code used. The only exceptions are the three modules listed under Interfaces Required as retained for 269/271: `history`, `comprehensionAnalysis` and `adoptionOutcome`.
- Format, lint, typecheck and the full test suite pass in all packages.

### Integration Requirements
- 269 can start with no build-path code to change.

### Verification Walkthrough
These steps need a local build: `pnpm -r build`. The global `cf` is the published npm build, so the commands run `node packages/cli/dist/index.js` (written `cf` below).

1. **Brownfield build writes nothing.** Take a scratch repo with more than 2000 source lines and no `project-documents/user/architecture` artifacts, registered with `cf init` and in Phase 0:
   ```
   cd /tmp/bf-scratch
   shasum .context-forge.toml        # record (or note it is absent)
   cf build > /tmp/out.md
   shasum .context-forge.toml        # same hash (or still absent)
   grep -c "Adoption Facts" /tmp/out.md   # 0
   ```
   The output is the guide's concept prompt.
2. **A stored state is ignored.** `cf config set adoption.state in_progress`, then `cf build` again. The output is still the concept prompt, and `cf config get adoption.state` still shows `in_progress`. Reset with `cf config set adoption.state ""`.
3. **No probe, MCP matches.** The D5 purity test covers both, using a fake `sq` marker and CLI/MCP parity. Run it with `pnpm --filter @context-forge/mcp test`; it passes.
4. **Greenfield unchanged.** Run `pnpm --filter @context-forge/core test pure-build-golden`. It passes against the golden files committed before the cut.
5. **Code is gone.** `grep -rn "resolveAdoptionFn\|adoptionFacts\|runSquadronProbe\|writeAdoptionState" packages/*/src` prints nothing.

## Risk Assessment
### Technical Risks
- **Between 268 and 270, `cf next` gives broken advice.** Navigation still tells brownfield users to "run `cf build` to record adoption", and the `adoption.state` key description still says the build detects. Neither is true after 268. The guide's brownfield prompt also still points at `cf build` until 272.

### Mitigation Strategies
- No release is cut between 268 and 270. The rework ships as one release, at the latest when 272 lands with the guide release it is coupled to. The check is the PM's release decision, since releases are PM-triggered through `/release`. The release skill has no automated check for this window, and this slice adds none.

## Implementation Notes
### Development Approach
1. Capture the golden files and add the byte-identity test (D6), on the current code. Commit.
2. Remove the pipeline seam (integrator, factory, template engine, context type, SectionBuilder), and update the CLI and MCP callers and their unit tests.
3. Delete the resolver, facts, completion, `writeAdoptionState`, the `adoption-completed` variant and the probe, with their tests. Rewrite the tests that used the resolver as a harness.
4. Add the D5 purity test, which replaces `adoptionParity.test.ts`.
5. Run the full format, lint, typecheck and test pass, then the walkthrough.

Effort: 2/5.

### Special Considerations
- The golden capture in step 1 must run before any edit; otherwise it proves nothing.
- The fake `sq` in D5 must be placed on `PATH` for the test process only, and the MCP tool runs in-process, so it inherits that `PATH`. It must never depend on whether the machine has a real `sq`.

## Design Review Resolution
Final review `268-review.slice.pure-cf-build.md` (claude-sonnet-5-5, CONCERNS, after two P4 revision rounds):
- **Explicit `brownfield-adoption` key falls back instead of erroring:** D2 now says the no-fallback principle governs 271's delivery primitive, not `cf build`'s generic lookup. It also states that the half-working explicit key is an accepted interim state until 271, safe because no release ships before 272.
- **"No orphan exports" contradicts what is kept:** Interfaces Required now names each kept module's production consumer. `history`, `comprehensionAnalysis` and `adoptionOutcome` are listed as having none after the cut and retained for 269/271, and the Technical Requirement names that exception.
- **Test weight (note):** no change. Each test maps to a success criterion.

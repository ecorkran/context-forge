---
docType: review
layer: project
reviewType: code
slice: real-adoption-run-via-sq-onboard
targetKind: slice
rulesSource: project
conventionsSource: AGENTS.md
projectRules: [testing.md, typescript.md]
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/273-slice.real-adoption-run-via-sq-onboard.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261027
dateUpdated: 20261027
reviewedSha: a3cac8e2cbd87cf391a7d14eefab2d56ca1bcfce
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
diffTruncated: false
turns: 3
promptTokens: 112802
cachedTokens: 14693
cacheWriteTokens: 98105
completionTokens: 2715
durationSeconds: 25.0
costUsd: 0.422857
costBasis: provider
squadronVersion: 0.24.5
categoriesNormalized: true
findings:
  - id: F001
    severity: concern
    category: error-handling-observability
    summary: "Stale project returned silently when the re-read fails"
    location: "packages/cli/src/utils/adoptedProject.ts:20"
  - id: F002
    severity: concern
    category: architectural-decay
    summary: "Read-only commands now write project state as a side effect"
    location: "packages/cli/src/utils/adoptedProject.ts:13-20"
  - id: F003
    severity: concern
    category: architectural-decay
    summary: "Utility layer depends on the command layer"
    location: "packages/cli/src/utils/adoptedProject.ts:3"
  - id: F004
    severity: concern
    category: test-debt
    summary: "Wiring in `next` and `task list` has no test of its own"
    location: "packages/cli/tests/integration/noSlicePlanMessage.integration.test.ts"
  - id: F005
    severity: note
    category: type-contract-debt
    summary: "Loosely typed field names in the `setField` callback"
    location: "packages/cli/src/utils/registerAdoptedArtifacts.ts:21"
  - id: F006
    severity: note
    category: consistency-rot
    summary: "`withArticle` and `gatedNoun` are heuristic and string-keyed"
    location: "packages/core/src/introspection/reviewGate.ts:288-296"
  - id: F007
    severity: pass
    category: correctness
    summary: "Shared no-slice-plan message corrects an invalid command"
    location: "packages/cli/src/utils/errors.ts:28"
  - id: F008
    severity: pass
    category: correctness
    summary: "Registration does not guess between several architectures"
    location: "packages/cli/src/utils/registerAdoptedArtifacts.ts:31-41"
---

# Review: code — slice 273

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Stale project returned silently when the re-read fails

After `registerAdoptedArtifacts` reports a change, the helper re-reads the project with `(await resolveProject(...)) ?? project`. If the re-read returns null, it quietly returns the pre-registration project. The caller then runs against stale data. That is the "silent fallback" the project rules forbid. The `cf next` and `cf list` output would look as if registration never happened. Throw a `UserError` instead, for example "Project not found after registering adopted artifacts".

### [CONCERN] Read-only commands now write project state as a side effect

`cf next`, `cf list slices` and `cf list tasks` now call `projectSetAction` on their own, which writes project config. The doc comment says what the helper does. Nothing at the command level tells the user a query command may mutate state. The only signal is the confirmation lines `cf set` happens to print.

The ambiguous case (several derived architectures) writes to stderr on every invocation. It never resolves until the user acts, so each `cf next` or `cf list` call repeats the message. Consider either a dedicated explicit command or a once-only notice.

### [CONCERN] Utility layer depends on the command layer

`utils/adoptedProject.ts` imports `projectSetAction` from `../commands/project.js`, while the commands import the utils. No cycle exists today, because `commands/project.ts` doesn't import this helper. It is still a layering inversion, and one future import of the helper from `project.ts` would create a cycle. Moving the set logic into a shared service, or injecting `setField` from the command layer, would remove the dependency.

### [CONCERN] Wiring in `next` and `task list` has no test of its own

The end-to-end registration test covers only `sliceListAction`. The same helper is wired into `next.ts` and `taskListAction`, but the diff adds nothing for them beyond mocks that return "nothing found". A regression in either call site would go undetected. The `next` path matters most, since that is where #137 showed up as "Create architecture document". There is also no test for the "arch set, concept missing" branch or for the re-read returning null.

### [NOTE] Loosely typed field names in the `setField` callback

`setField` takes `(field: string, value: string)`, while `ARCH_FIELD` and `CONCEPT_FIELD` are plain string constants. A union type such as `'arch' | 'concept'` would let the compiler catch a typo or a renamed alias. The same literals appear again in the user-facing hint `cf set arch <index>`, so the field name is defined in more than one place.

### [NOTE] `withArticle` and `gatedNoun` are heuristic and string-keyed

`withArticle` picks "a" or "an" from the first letter, which breaks for words like "hour" or "unit". That is acceptable for the current review-type vocabulary. `gatedNoun` compares against the literal `'preSlicePlan'`, so the boundary-to-noun mapping lives in a conditional. A lookup keyed on `Boundary` would make the compiler check that every boundary is covered.

### [PASS] Shared no-slice-plan message corrects an invalid command

The old hint, `cf set slicePlan`, named a field that cannot be set. `NO_SLICE_PLAN_MESSAGE` replaces it, with the correct alias `plan`, in both `slice.ts` and `task.ts`. This removes the duplicated string, and a regression test pins the wording.

### [PASS] Registration does not guess between several architectures

Registration happens only when adoption is demonstrably complete, meaning a derived architecture and an existing-state plan both exist. With multiple derived architectures it leaves `arch` unset and names the candidates, which follows the "do not guess" rule. The unit tests use real file layouts and cover the set, already-set, ambiguous and incomplete cases.

### Run Digest

- Response length: 4543 chars
- Response is newline-free: no
- Tool calls made: 2
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 3
- Tokens — prompt / cached / cache write / completion / reasoning: 112802 / 14693 / 98105 / 2715 / not computed
- Duration: 25.0 s
- Cost: $0.42 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 8
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 8
- Finding-shaped matches — surviving validation: 8

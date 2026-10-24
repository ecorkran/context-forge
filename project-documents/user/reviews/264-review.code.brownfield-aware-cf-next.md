---
docType: review
layer: project
reviewType: code
slice: brownfield-aware-cf-next
targetKind: slice
rulesSource: project
conventionsSource: AGENTS.md
projectRules: [testing.md, typescript.md]
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/264-slice.brownfield-aware-cf-next.md
aiModel: deepseek/deepseek-v4.1-flash
aiProfile: openrouter
status: complete
dateCreated: 20261023
dateUpdated: 20261023
reviewedSha: 00d9ba22241e5213f377985be0b865fe7e5e3d5a
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 37
diffTruncated: false
turns: 20
promptTokens: 1697949
cachedTokens: 1468137
completionTokens: 83187
reasoningTokens: 77926
durationSeconds: 1603.3
costUsd: 0.082189
costBasis: alias_pricing
squadronVersion: 0.23.7
findings:
  - id: F001
    severity: concern
    category: testing
    summary: "\"Lowest-index\" ordering is not what the test proves, and the two artifact finders disagree on order"
    location: "packages/core/tests/introspection/existingStatePlan.test.ts:49"
  - id: F002
    severity: concern
    category: design
    summary: "Three copies of the 3-digit index / stem logic"
    location: "packages/core/src/introspection/adoptionNavigation.ts#fileIndex"
  - id: F003
    severity: concern
    category: error-handling
    summary: "`withNavWarnings` replaces `action.warnings` rather than merging"
    location: "packages/core/src/introspection/WorkflowNavigator.ts:107"
  - id: F004
    severity: concern
    category: testing
    summary: "CLI test file spies are installed but never restored"
    location: "packages/cli/tests/commands/next.adoption.test.ts"
  - id: F005
    severity: note
    category: error-handling
    summary: "Ordering of adoption warnings against pre-adoption early returns"
    location: "packages/core/src/introspection/WorkflowNavigator.ts"
  - id: F006
    severity: note
    category: error-handling
    summary: "Error-swallowing in `findExistingStatePlan` could not be verified"
    location: "packages/core/src/introspection/parsers/existingStatePlan.ts"
  - id: F007
    severity: note
    category: testing
    summary: "`adoptionNavigation.ts` diff is truncated at ~line 200 of 244"
    location: "packages/core/src/introspection/adoptionNavigation.ts"
  - id: F008
    severity: note
    category: testing
    summary: "MCP parity test asserts only three fields"
    location: "packages/mcp-server/tests/workflowNextAdoption.test.ts"
  - id: F009
    severity: note
    category: design
    summary: "Exported constant renamed without visible importer updates"
    location: "packages/core/src/detection/planningArtifacts.ts#ARCHITECTURE_FILE_PATTERN"
  - id: F010
    severity: note
    category: design
    summary: "Three filesystem scans per `cf next` invocation"
    location: "packages/core/src/introspection/adoptionNavigation.ts#gatherAdoptionInputs"
---

# Review: code — slice 264

**Verdict:** CONCERNS
**Model:** deepseek/deepseek-v4.1-flash

## Findings

### [CONCERN] "Lowest-index" ordering is not what the test proves, and the two artifact finders disagree on order

The test `returns the lowest-index plan when two carry markers` puts the `200-slices.b.md` plan in `project-documents/user/project-guides` and the `100-slices.a.md` plan in `project-documents/user/architecture`, then expects the `100-` one. That fixture cannot discriminate index ordering from directory ordering: `findPlanningArtifacts` (`packages/core/src/detection/planningArtifacts.ts`) still returns `found.sort()` — a plain lexical sort over absolute paths — and `'.../user/architecture/...' < '.../user/project-guides/...'`, so the `100-` plan sorts first *because of its directory*, not its index. The test would pass unchanged if `findExistingStatePlan` ignored the index entirely. Invert the fixture (lowest index in `project-guides`, higher in `architecture`) or put both plans in one directory so directory order cannot produce the expected result. See AGENTS.md "the test fixture must include the actual format that parser will consume" — same idea for ordering contracts.

Related, and the reason the weak test matters: the new `findArchitectureArtifacts` explicitly sorts by file-name index (`compareByFileIndex`), while `findPlanningArtifacts` still sorts by full path. Two functions returning "planning artifacts ordered ..." now mean different things, and the doc comment on `findArchitectureArtifacts` advertises "ordered by file-name index (R3)" next to a neighbour that is not. Either apply `compareByFileIndex` to both or say plainly in each doc comment which order it guarantees.

### [CONCERN] Three copies of the 3-digit index / stem logic

`packages/core/src/detection/planningArtifacts.ts#compareByFileIndex` computes `basename(a).slice(0, 3)`; `adoptionNavigation.ts#fileIndex` computes the same thing again; `adoptionNavigation.ts#stem` computes `basename(path, '.md')` while `buildRegisterPlanAction` builds `cf set arch ${stem(sameIndexArch)}` from the same basename twice in one function. AGENTS.md is explicit: "Do not duplicate logic. Respect DRY" and "Never scatter comparison values across code." A file-name's index and stem are exactly the kind of thing that should be defined once — `planningArtifacts.ts` already exports `compareByFileIndex`, so exporting `fileIndexOf(path)` / `stemOf(path)` from the same module and importing them in `adoptionNavigation.ts` removes two copies without adding a dependency in the wrong direction. Note also that `compareByFileIndex` is exported but has no consumer outside `planningArtifacts.ts` as far as the diff shows; if nothing else needs it, keep it private.

### [CONCERN] `withNavWarnings` replaces `action.warnings` rather than merging

```ts
function withNavWarnings(action: NextAction, navWarnings: string[]): NextAction {
  return navWarnings.length > 0 ? { ...action, warnings: navWarnings } : action;
}
```

The spread puts `warnings: navWarnings` on top of whatever `warnings` the action already carries. Every call site in this diff wraps a hand-built action that has no warnings, so nothing breaks today — but `buildAdoptionStepAction` (`adoptionNavigation.ts`, whose body is beyond the truncation point in the diff) is free to set its own `warnings`, and if it ever does they are silently dropped. It also attaches the shared, mutable `navWarnings` array by reference rather than copying it. Merge instead — `warnings: [...(action.warnings ?? []), ...navWarnings]` — so the helper stays correct when a builder starts producing warnings.

### [CONCERN] CLI test file spies are installed but never restored

`beforeEach` calls `vi.spyOn(process.stdout, 'write')`, `vi.spyOn(process, 'exit')` and `vi.spyOn(console, 'log'/'error')` with mock implementations, but the file has no `afterEach` and only calls `vi.clearAllMocks()`, which clears call history and not implementations. Within the file this happens to be harmless, but the sibling file `packages/mcp-server/tests/workflowNextAdoption.test.ts` does `vi.restoreAllMocks()` in its `afterEach` — so the two new tests handle the same concern differently, and the CLI one leaves `process.exit` stubbed for anything that runs later in the same module graph. Add `afterEach(() => { vi.restoreAllMocks(); })` for symmetry and safety.

### [NOTE] Ordering of adoption warnings against pre-adoption early returns

Adoption warnings are pushed in `routeAdoption`, which runs after the `preSlicePlan` architecture gate at the top of this guard: `const blocked = this.gateBlockAction(gate, archIndex); if (blocked) return blocked;` returns without `withNavWarnings`. So an adoption warning (e.g. the D2 "adoption.state is unset … advancing skips that check" warning) is not attached on the "Review required before creating the slice plan" path — arguably the path where "advancing skips the detection" is most relevant. This is not a regression (that return already dropped earlier warnings), and it may be intentional, but the D2 text claims the warning protects a specific decision that this branch bypasses. Worth a deliberate decision and a comment, or a test pinning which actions carry warnings and which do not.

### [NOTE] Error-swallowing in `findExistingStatePlan` could not be verified

The new parser file itself does not appear in the diff — only its test (`packages/core/tests/introspection/existingStatePlan.test.ts`) and its two importers. The test `skips a plan that cannot be read and returns the readable marked one (D7)` asserts a silent skip of an unreadable plan. AGENTS.md requires every swallowed exception to re-raise after logging, to handle a named exception with a comment justifying the swallow, or to be a process-boundary handler — and `adoptionCompletion.findRecordedPlan` now delegates straight to this function, so its failure semantics govern both `cf next` and adoption completion. I could not confirm the `try/catch` in `existingStatePlan.ts` logs or documents the skip, nor whether it catches only `EISDIR`/`ENOENT` rather than all errors. The test also only exercises the "directory named like a plan" case, not `EACCES`. Please confirm both; if the catch is broad or silent, that is a `FAIL`-level defect.

### [NOTE] `adoptionNavigation.ts` diff is truncated at ~line 200 of 244

The shown hunk ends mid-`buildRegisterPlanAction` (after `suggestedCommand`), so `buildAdoptionStepAction`, `gatherAdoptionInputs`, and the `plan-new-work` builder — three of the four functions the navigator and the action tests exercise — were not visible to review. The action tests (`adoptionNavigation.actions.test.ts`) assert the recommendation strings, `cf build`, absence of `phase`, presence of the decline command, and a non-empty `summary`, which is a reasonable contract; the `register-plan` tests correctly cover the shared-index and no-shared-index branches. But the builder bodies themselves are unreviewed — in particular whether `buildAdoptionStepAction` covers all five `AdoptionNavStep` values with a `never` default rather than an open-ended `switch`.

### [NOTE] MCP parity test asserts only three fields

`it.each(CASES)` compares `recommendation`, `suggestedCommand` and `warnings` against the navigator's output. `phase`, `rationale` and `summary` are not compared, so a tool that dropped or rewrote `phase` would pass "Parity". Since the point of the file is plumbing parity over every adoption state, comparing the whole action (`expect(actual).toEqual(expected)` after normalising whatever the tool reshapes) is both cheaper to maintain and stricter — the CLI test already asserts the full object in one case. Also note the test is inherently self-referential (tool output vs. navigator output); the docstring acknowledges this, so this is only worth flagging as a limit of the "Parity" success criterion, not a defect.

### [NOTE] Exported constant renamed without visible importer updates

`ARCH_FILE_PATTERN` was exported and is now `ARCHITECTURE_FILE_PATTERN`, with a sibling `SLICE_PLAN_FILE_PATTERN` carved out of the same alternation. The split is correct (`findPlanningArtifacts`'s `isPlanningArtifactName` is exactly equivalent to the old pattern, and `existingStatePlan` needs the slices-only pattern), but the diff does not show any importer being updated. I could not run a repository-wide grep for `ARCH_FILE_PATTERN`, so I cannot say whether anything outside the diff still imports the old name. Confirm there are no stale importers, or keep `ARCH_FILE_PATTERN` as a deprecated alias.

### [NOTE] Three filesystem scans per `cf next` invocation

`routeAdoption` calls `gatherAdoptionInputs`, which (per the imports) reads adoption state, calls `findPlanningArtifacts`, `findArchitectureArtifacts`, and `findExistingStatePlan` — and `findExistingStatePlan` itself reads the planning-artifact directories again. `getNext` has already done a status/detection pass over the same checkout. For a navigator that is documented as read-only and called on every `cf next`, that is three or more redundant directory walks plus one plan parse per request. Not a correctness problem, and probably not worth restructuring now, but the `existing-state-plan` case parses the same plan file twice (once in `getStatus`'s `parseSlicePlanSafe`, once in `findExistingStatePlan`). If `gatherAdoptionInputs` ever grows, consider threading the already-computed `WorkflowStatus` slice-plan entries through rather than re-parsing.

### Run Digest

- Response length: 11116 chars
- Response is newline-free: no
- Tool calls made: 37
- Tool calls failed: 1
- Stop reason: stop
- Output budget: 384000 tokens
- System prompt: custom
- Settings sources: n/a (non-SDK)
- Reasoning characters: 323925
- Effort: backend default
- Turns: 20
- Tokens — prompt / cached / cache write / completion / reasoning: 1697949 / 1468137 / not computed / 83187 / 77926
- Duration: 1603.3 s
- Cost: $0.08 (alias_pricing)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 10
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 10
- Finding-shaped matches — surviving validation: 10

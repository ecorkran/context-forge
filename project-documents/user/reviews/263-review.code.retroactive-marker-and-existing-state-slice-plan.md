---
docType: review
layer: project
reviewType: code
slice: retroactive-marker-and-existing-state-slice-plan
targetKind: slice
rulesSource: project
conventionsSource: AGENTS.md
projectRules: [testing.md, typescript.md]
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/263-slice.retroactive-marker-and-existing-state-slice-plan.md
aiModel: deepseek/deepseek-v4.1-flash
aiProfile: openrouter
status: complete
dateCreated: 20261023
dateUpdated: 20261023
reviewedSha: 92fb6a0e18993c9ae70893fd8f1e01e479dce14c
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 23
diffTruncated: false
turns: 16
promptTokens: 1600585
cachedTokens: 1334784
completionTokens: 53876
reasoningTokens: 51039
durationSeconds: 733.8
costUsd: 0.071104
costBasis: alias_pricing
squadronVersion: 0.23.7
findings:
  - id: F001
    severity: concern
    category: correctness
    summary: "Retroactive active-slice status ignores the checkbox, disagreeing with `cf list slices` and `cf next`"
    location: "packages/core/src/introspection/WorkflowNavigator.ts:755-758"
  - id: F002
    severity: note
    category: dry
    summary: "A fourth copy of the slice-plan filename regex, with a stricter digit count than its siblings"
    location: "packages/core/src/adoption/adoptionCompletion.ts:15"
  - id: F003
    severity: note
    category: design
    summary: "Speculative exported API duplicates the resolver's find-then-persist sequence"
    location: "packages/core/src/adoption/adoptionCompletion.ts:48-55"
  - id: F004
    severity: note
    category: error-handling
    summary: "An existing but unparseable slice plan makes adoption completion silently not happen"
    location: "packages/core/src/adoption/adoptionCompletion.ts:29-31"
  - id: F005
    severity: note
    category: testing
    summary: "Unit-test plan fixtures are not the format production consumes"
    location: "packages/core/tests/introspection/retroactiveRules.test.ts:18-19"
  - id: F006
    severity: pass
    category: design
    summary: "The gate skip is a distinct typed outcome, not folded into `clears` or `exempt`"
    location: "packages/core/src/introspection/reviewGate.ts:205-241"
  - id: F007
    severity: pass
    category: testing
    summary: "Tests accompany the implementation rather than trailing it"
    location: "packages/core/tests/introspection/retroactive.integration.test.ts"
---

# Review: code — slice 263

**Verdict:** CONCERNS
**Model:** deepseek/deepseek-v4.1-flash

## Findings

### [CONCERN] Retroactive active-slice status ignores the checkbox, disagreeing with `cf list slices` and `cf next`

`deriveSliceStatus` returns `{ ...base, status: STATUS.Complete, retroactive: true }` purely from the marker, before the plan entry's `isChecked` is consulted. But `SlicePlanEntry.retroactive` is documented as "The marker says nothing about completion; the checkbox does (D2)" (`packages/core/src/introspection/types.ts:41-44`), and the structural rule in `packages/core/src/introspection/retroactiveRules.ts:109-115` treats an unchecked retroactive entry as an **error**. The two surfaces therefore disagree on the same data:

- `cf status` / `activeSlice`: `complete`
- `cf list slices` (`slice.ts` → `deriveEntryStatus`, which has no retroactive input) and `status.slicePlan.entries` (`resolveEntryStatus`): `not_started`
- `cf check`: `retroactive-entry` error, "marked retroactive but is not checked"

Concrete consequence in `getNext`: the complete-advance branch (`WorkflowNavigator.ts`, `if (slice.status === 'complete' && status.slicePlan)`) calls `findFirstNotCompleteEntry` over `status.slicePlan.entries`, which still sees the same entry as `not_started`. For an active unchecked retroactive slice, `cf next` reports "Advance to slice 100: …" while the project is already on slice 100. Either the navigator should fall through to the normal derivation for an unchecked marker, or `retroactive` should be treated as complete consistently in `resolveEntryStatus`/`deriveEntryStatus`. No test covers the unchecked-retroactive-active-slice case (the navigator tests only use `[x]` entries), so this divergence is currently unpinned.

### [NOTE] A fourth copy of the slice-plan filename regex, with a stricter digit count than its siblings

`SLICE_PLAN_FILE_PATTERN = /^\d{3}-slices\..+\.md$/i` re-states a pattern that already exists in at least three places with a different digit count: `ConsistencyChecker.discoverAllSlicePlans` (`/^\d+-slices\..*\.md$/i`), `packages/cli/src/commands/plan.ts:60` (`/^\d+-slices\..*\.md$/`), and `packages/core/src/schema/resolveFileByIndex.ts:143`. The `\d{3}` form matches the naming convention and `ARCH_FILE_PATTERN`, so the value itself is defensible, but the project rule "Never scatter comparison values across code" applies to filename conventions too — a plan discovered by the checker could be invisible to adoption completion, and there is no shared definition to keep them in step.

### [NOTE] Speculative exported API duplicates the resolver's find-then-persist sequence

`completeAdoptionIfPlanRecorded` has no production caller (the resolver deliberately calls `findRecordedPlan` and `persistAdoptionComplete` separately so it can render facts between them, per R1), and a grep shows only its own test referencing it. The comment explains it is "Exported for 264's `cf next`", but until then this is an unused public export in `packages/core/src/adoption/index.ts` and a second encoding of the same two-step contract. `findRecordedPlan` + `persistAdoptionComplete` already express it; the wrapper adds surface without a consumer.

### [NOTE] An existing but unparseable slice plan makes adoption completion silently not happen

`parseSlicePlan` is documented and implemented as never throwing — it returns an empty result on any read error (`packages/core/src/introspection/parsers/slicePlanParser.ts:132-134`). So if a slice plan exists but cannot be read (EACCES, EISDIR), `findRecordedPlan` returns `null` and the build simply reports "adoption in progress" again with no diagnostic, in contrast to `findPlanningArtifacts`'s `listFileNames`, which deliberately throws an `AdoptionError` for non-ENOENT readdir failures (`packages/core/src/detection/planningArtifacts.ts:24-31`). "Cannot read the plan" and "the plan has no retroactive entry" are indistinguishable here, which is the silent-fallback shape the project rules call out.

### [NOTE] Unit-test plan fixtures are not the format production consumes

The `retro`/`fresh` helpers always emit `1. [...]`, so a multi-entry fixture reads `1. …\n1. …\n1. …` — a shape no real slice plan has. It works because `PLAN_INDEXED_RE` ignores the list ordinal in favour of the parenthesized index, but the project's parsing rule is explicit that "the test fixture must include the actual format that parser will consume in production", and this suite is the one that pins the D4 structural rules. The real-format coverage in `retroactive.integration.test.ts` mitigates it; numbering the helper lines sequentially would remove the gap at no cost.

### [PASS] The gate skip is a distinct typed outcome, not folded into `clears` or `exempt`

Adding `GateSkip` to the `GateResult` union (rather than returning `clears`) keeps "nothing was reviewed" separate from "the review passed and nothing was found", which is the distinction the finding text and `cf next` rationale depend on. `isBlockingGate` is unchanged and correctly returns false for it, `safeEvaluateGate` narrows the delegation to `evaluateEntryGate` only for plan entries (an architecture has no entry), and the error-isolation test in `ConsistencyChecker.reviewGateWidened.test.ts` was correctly retargeted at `evaluateEntryGate` so TD-5 isolation is still exercised.

### [PASS] Tests accompany the implementation rather than trailing it

Every new module has tests written with it: the parser marker (case/whitespace variants, fallback exclusion, no-description case), the three structural rules including cross-plan ordering and the deprecated-boundary exemption, the gate skip at all slice-scoped boundaries plus `preSlicePlan` delegation, adoption completion (including the failed-write remedy and the read-only build), the CLI `--json` field, and the display label. The adopted-project integration test uses the real plan format, real files on disk, and only mocks `FileProjectStore`, which matches the existing `list-derived-status.test.ts` pattern; suite layout (`tests/integration/`, `tests/output/`, `tests/adoption/`) matches the centralized-directory convention.

### Run Digest

- Response length: 6881 chars
- Response is newline-free: no
- Tool calls made: 23
- Tool calls failed: 0
- Stop reason: stop
- Output budget: 384000 tokens
- System prompt: custom
- Settings sources: n/a (non-SDK)
- Reasoning characters: 209483
- Effort: backend default
- Turns: 16
- Tokens — prompt / cached / cache write / completion / reasoning: 1600585 / 1334784 / not computed / 53876 / 51039
- Duration: 733.8 s
- Cost: $0.07 (alias_pricing)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7

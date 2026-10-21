---
docType: review
layer: project
reviewType: tasks
slice: detection-and-adoption-state
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/261-tasks.detection-and-adoption-state.md
aiModel: xiaomi/mimo-v2.6-pro
aiProfile: openrouter
status: complete
dateCreated: 20261021
dateUpdated: 20261021
reviewedSha: f4cb13a656a2d1b33dccb828ae44236fe530253a
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 17
turns: 9
promptTokens: 299859
cachedTokens: 249728
completionTokens: 17099
reasoningTokens: 14519
durationSeconds: 447.6
costUsd: 0.037682
costBasis: alias_pricing
runId: run-20261021-p5-5e2b9ed3
squadronVersion: 0.23.6
findings:
  - id: F001
    severity: concern
    category: testing
    summary: "Restated performance NFR has no tests/load/ coverage and no CI gating"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md:167"
  - id: F002
    severity: note
    category: testing
    summary: "FR \"template_preview … leaves adoption.state unset\" has no automated end-to-end case"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md:332"
  - id: F003
    severity: note
    category: testing
    summary: "FR \"`\\\"\\\"` re-detects\" has no named test case"
    location: "project-documents/user/slices/261-slice.detection-and-adoption-state.md:330"
  - id: F004
    severity: note
    category: code-structure
    summary: "Mutually importing modules between Task 3 and Task 7"
    location: "project-documents/user/tasks/261-tasks.detection-and-adoption-state.md:84"
  - id: F005
    severity: pass
    category: coverage
    summary: "Success criteria fully cross-referenced"
    location: "project-documents/user/tasks/261-tasks.detection-and-adoption-state.md"
  - id: F006
    severity: pass
    category: sequencing
    summary: "Sequencing, test-with pattern and commit checkpoints sound"
    location: "project-documents/user/tasks/261-tasks.detection-and-adoption-state.md"
---

# Review: tasks — slice 261

**Verdict:** CONCERNS
**Model:** xiaomi/mimo-v2.6-pro

## Findings

### [CONCERN] Restated performance NFR has no tests/load/ coverage and no CI gating

D2 restates an NFR — "Performance target: detection adds under one second to a Phase 0 build on a local disk" — and no task in the breakdown covers it with a load test under `tests/load/`, and consequently no CI wiring task gates on one. The design's line "Tests assert the caps, not timings" (same line) conflicts with the standing rule that a restated NFR gets load-test coverage, so the two documents disagree rather than the gap being settled. Resolve one of two ways: (a) add a load-test task under `tests/load/` that exercises `measureSourceVolume` (and a Phase 0 build) against a synthetic tree near `MAX_WALK_ENTRIES` under a generous wall-clock budget, plus a CI wiring task that runs it, or (b) amend the slice design to record explicitly that the cap-based tests are the accepted verification for the sub-second budget, so the NFR is not left asserted-but-unverified. A load test without the CI wiring task would leave the gate implicit, so if (a) is chosen both tasks are needed.

### [NOTE] FR "template_preview … leaves adoption.state unset" has no automated end-to-end case

This functional requirement is covered only in pieces: the resolver's `read-only` semantics (Task 9T, line 196: "read-only + brownfield → selected, state still `''`, no notice"), the wiring assertion that `template_preview` passes `read-only` (Task 11, line 221), and the manual walkthrough step 5 (Task 15, line 263) — which carries a `BLOCKED:` escape hatch, so no automated test may ever exercise the FR end to end. The composition is sound, so this is not a gap in coverage of the mechanism, but the cheapest direct closure is one fixture in Task 12 run through `createContextPipeline(dir, { adoptionStateWrites: 'read-only' })` on a brownfield fixture asserting the brownfield prompt and state `''` afterward.

### [NOTE] FR "`\"\"` re-detects" has no named test case

The override FR names three behaviors; Task 12 case 9 covers `declined` → concept and `in_progress` → brownfield, and Task 1T covers rejection of invalid values and acceptance of `''` via `set`, but no case asserts the transition itself (state set to `declined`/`in_progress`, then `""`, rebuild → detection runs again). It is transitively covered — fixtures 1–3 already run detection with the state at `''` — so this is optional; one added line to Task 12 case 9 would name it explicitly.

### [NOTE] Mutually importing modules between Task 3 and Task 7

Task 3 has `detection/sourceVolume.ts` import `BROWNFIELD_MIN_SOURCE_LINES` from `adoption/adoptionOutcome.ts`, while Task 7 (line 153) types `AdoptionOutcome` with `SourceVolume` from `detection/sourceVolume.ts` — a two-way module reference the design mandates (D1: the constant lives once, in `adoptionOutcome.ts`). It resolves cleanly at runtime only if one edge is type-only (`import type`); a plain value import on the outcome side leaves a real ESM cycle. Worth one clause in Task 7 saying the `SourceVolume` import is type-only. No change to the design's constant placement.

### [PASS] Success criteria fully cross-referenced

Every Functional Requirement maps to a named task: empty/scaffold (Task 12 cases 1–2), brownfield + persist (case 3), shallow clone (case 4), concept-only (case 6), planned with no walk (case 7 + the `measureSourceVolume` spy in Task 9T), monorepo scoping and root CI (case 5), resume (case 8), overrides (case 9 + Task 1T), non-concept phase and explicit `brownfield-adoption` (cases 10–11 + Task 9T), guide-missing-profile/prompt (case 12 + Task 9T/10T + walkthrough step 4). The Technical Requirements' unit-test list maps one-to-one to Tasks 3T, 4T, 5T, 6T, 7T, 8T, 9T; the integration fixture list maps 1:1 to Task 12's twelve expectations; parity is Task 13; caller updates and checks are Tasks 11 and 15. Integration Requirements are covered by `renderSquadronFact()` isolation (Task 8, 262), `adoption/` state API (Task 2, 263/264) and the before/after diff walkthrough (Task 15 step 1). No scope creep: excluded items (squadron probe, `cf next`, `complete` transition, onboarding, rule-file interpretation, `packages/electron/out/`) are consistently respected.

### [PASS] Sequencing, test-with pattern and commit checkpoints sound

Dependencies are respected end to end: Task 1 (constants/key) → 2 (contracts/state) → 3–6 (facts, each with its test task immediately after) → 7 (outcome) → 8 (renderer) → 9 (resolver) → 10–11 (integration and callers) → 12–13 (integration/parity) → 14 (docs) → 15 (verification). No circular task dependencies; the forward reference from Task 3 to Task 7's file is handled by creating `adoptionOutcome.ts` with only the constant first, and it matches the design. Every implementation task is followed by its `T` task. Commit checkpoints (2C, 3C, 5C, 6C, 8C, 9C, 11C, 13C, 14C, 15C) are distributed across the whole breakdown, not batched; the small groupings (1/1T/2/2T at 2C, 4/4T at 5C, 10/10T at 11C) share a semantic commit, a minor divergence from AGENTS' "commit at least once per task" but not a sequencing risk. Task sizes are proportionate — Task 12's twelve fixtures live in one file with a helper, and no task dictates implementation detail beyond what D1–D9 already specify. All referenced code locations (`PHASE_STRINGS`/`ARCHITECTURE_PHASE` in `projectSchema.ts`, `PERMISSIVENESS_LEVELS` in `ConfigKeys.ts`, `resolveInitiativePlanPath` in `ArtifactIntrospector.ts`, `gitExec`, `PROMPT_FILE_RELATIVE_PATH`, the `test-project` fixture prompt file, `createContextPipeline` callers) were verified to exist as cited.

### Run Digest

- Response length: 6930 chars
- Response is newline-free: no
- Tool calls made: 17
- Tool calls failed: 0
- Stop reason: stop
- Output budget: 131072 tokens
- System prompt: custom
- Settings sources: n/a (non-SDK)
- Reasoning characters: 58111
- Effort: backend default
- Turns: 9
- Tokens — prompt / cached / cache write / completion / reasoning: 299859 / 249728 / not computed / 17099 / 14519
- Duration: 447.6 s
- Cost: $0.04 (alias_pricing)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6

---
docType: review
layer: project
reviewType: slice
slice: docs-and-guide-alignment
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/272-slice.docs-and-guide-alignment.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261026
dateUpdated: 20261026
reviewedSha: 6cd407f6c5dcb5167c8030731bc73d1d0ce42458
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 3
turns: 4
promptTokens: 179806
cachedTokens: 90619
cacheWriteTokens: 89181
completionTokens: 4551
durationSeconds: 39.1
costUsd: 0.412039
costBasis: provider
runId: run-20261026-p4-feb3f704
squadronVersion: 0.24.5
findings:
  - id: F001
    severity: pass
    category: architecture-alignment
    summary: "Boundaries and dependency direction match the amended architecture"
    location: "project-documents/user/slices/272-slice.docs-and-guide-alignment.md#Technical Decisions"
  - id: F002
    severity: concern
    category: verification-gap
    summary: "Verification of \"nothing points at `cf build` for adoption\" doesn't cover every location"
    location: "project-documents/user/slices/272-slice.docs-and-guide-alignment.md#Success Criteria"
  - id: F003
    severity: concern
    category: proportionality
    summary: "`docs/ADOPTION-PRIMITIVES.md` restates 271's contract and adds a second place for the schema to drift"
    location: "project-documents/user/slices/272-slice.docs-and-guide-alignment.md#D1 — One contract document, linked from the references"
  - id: F004
    severity: note
    category: scope
    summary: "D4 extends the plan entry with a `cf prompt get` warning, and it is justified"
    location: "project-documents/user/slices/272-slice.docs-and-guide-alignment.md#D4 — Raise `MIN_GUIDE_VERSION`, and warn from `cf prompt get`"
  - id: F005
    severity: note
    category: dependencies
    summary: "The guide release coupling and the blocked version raise are handled coherently"
    location: "project-documents/user/slices/272-slice.docs-and-guide-alignment.md#Special Considerations"
---

# Review: slice — slice 272

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Boundaries and dependency direction match the amended architecture

- **cf and squadron:** cf only documents primitives that squadron calls. D6 hands the contract to squadron and asks nothing back.
- **Guide ownership:** D3 specifies what the prompt must and must not say and routes the wording to ai-project-guide. This matches "Guide owns content, cf owns logic."
- **Behavior:** the slice changes no behavior in `cf build`, `cf next`, `cf detect` or `cf init`.
- **Concept:** D3 keeps the adoption prompt from drafting a concept and sends that step to squadron's concept flow. This matches the architecture's Concept row.
- **Rule files:** D3's use of `cf detect --json` and `facts.ruleFiles` fits "facts in core, judgement in the prompt."
- **Guide minimum:** D4's rule that a missing guide prompt is an error, never a fallback, matches the architecture.

### [CONCERN] Verification of "nothing points at `cf build` for adoption" doesn't cover every location

The architecture assigns 272 the outcome "nothing points at `cf build` for adoption." The grep checks only look in `README.md`, `packages/*/README.md`, `docs` and `packages/*/src`.
- **Skill and recipe files:** `packages/cli/commands/cf/onboard.md`, the Codex variant and other command or skill markdown sit outside `packages/*/src`. They are never checked for stale adoption text.
- **Tests:** a search of the repo found a hit in `packages/core/tests/introspection/WorkflowNavigator.adoption.test.ts`. The grep scope doesn't reach `tests/`, and neither D5 nor the Technical Scope names that file.
- **Walkthrough step 1:** the `cf build` check runs against `README.md` alone, not the CLI or MCP READMEs.

Widen the grep to the whole repo, excluding `project-documents`, `CHANGELOG.md`, `node_modules` and `dist`. Triage each remaining hit as either fixed or intentionally kept, as a test name might be.

### [CONCERN] `docs/ADOPTION-PRIMITIVES.md` restates 271's contract and adds a second place for the schema to drift

The document re-specifies the full report schema, error codes, exit codes, init step names and the `reportVersion` bump rule. 271 already defines these, and they are also defined in code.
- **Reason it exists:** squadron needs a contract in the cf repo, which is reasonable. The README and reference rows only link to it, so the content is written once in this repo.
- **Cost:** a new hand-maintained copy of the schema that must be kept in step with the code, and nothing enforces that after this slice.
- **What to cut:**
  - Document each primitive's inputs, outputs and guarantees only where squadron depends on them.
  - For the full schema, point at the code's report type and `reportVersion` rather than re-listing every field.
  - Keep the JSON examples taken from the local build, since the walkthrough already verifies them.
  - Add a one-line rule that changing the code's schema requires updating this document, or say who owns that rule.

### [NOTE] D4 extends the plan entry with a `cf prompt get` warning, and it is justified

The architecture calls for only a raised minimum. The design states that it adds the warning and gives the reason. `sq onboard` calls neither `cf build` nor `context_build`, so without the warning an old guide gives it the old prompt with no signal.
- **Failure modes:** every case is enumerated: unresolvable project, no guide, missing or unreadable version marker, old version, current version. Each has an explicit exit code and stderr behavior.
- **Effort:** the effort bump from 1/5 to 2/5 is called out.
- **Tests:** the Technical Requirements list a test for each case.

### [NOTE] The guide release coupling and the blocked version raise are handled coherently

The architecture says the cf release and the guide release ship together. The design sends D3 to the guide session early and lets the docs work proceed. It makes the `MIN_GUIDE_VERSION` raise the last task, read from the release tag and never assumed. D6 handles missing peer sessions with a `BLOCKED:` line and leaves the message text for the PM to route. No NFRs are touched by this slice.

### Run Digest

- Response length: 5097 chars
- Response is newline-free: no
- Tool calls made: 3
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 4
- Tokens — prompt / cached / cache write / completion / reasoning: 179806 / 90619 / 89181 / 4551 / not computed
- Duration: 39.1 s
- Cost: $0.41 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 5
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 5
- Finding-shaped matches — surviving validation: 5

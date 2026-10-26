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
reviewedSha: 55bf7f7a245bae1ae9bed73c97a44c484ccd6905
revision_number: 2
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 3
turns: 4
promptTokens: 180280
cachedTokens: 91239
cacheWriteTokens: 89035
completionTokens: 4117
durationSeconds: 42.2
costUsd: 0.407177
costBasis: provider
runId: run-20261026-p4-feb3f704
squadronVersion: 0.24.5
findings:
  - id: F001
    severity: pass
    category: architecture-alignment
    summary: "Alignment with the amended adoption architecture"
    location: "project-documents/user/slices/272-slice.docs-and-guide-alignment.md#D2 — The README section says what cf does alone, and where adoption lives"
  - id: F002
    severity: pass
    category: boundaries
    summary: "Guide boundary and release coupling"
    location: "project-documents/user/slices/272-slice.docs-and-guide-alignment.md#D3 — The guide-side change contract"
  - id: F003
    severity: pass
    category: error-handling
    summary: "Failure modes for the new `cf prompt get` guide-minimum check"
    location: "project-documents/user/slices/272-slice.docs-and-guide-alignment.md#D4 — Raise MIN_GUIDE_VERSION, and warn from cf prompt get"
  - id: F004
    severity: concern
    category: verification
    summary: "Guide-alignment verification can pass on an empty search range"
    location: "project-documents/user/slices/272-slice.docs-and-guide-alignment.md#Verification Walkthrough (step 4)"
  - id: F005
    severity: concern
    category: proportionality
    summary: "The contract document carries more than the architecture requires"
    location: "project-documents/user/slices/272-slice.docs-and-guide-alignment.md#D1 — One contract document, linked from the references"
  - id: F006
    severity: note
    category: dependencies
    summary: "Ordering with the external guide release"
    location: "project-documents/user/slices/272-slice.docs-and-guide-alignment.md#Special Considerations"
---

# Review: slice — slice 272

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Alignment with the amended adoption architecture

D2 and D3 follow the 20261025 amendment. `sq onboard` orchestrates, cf stays read-only, and the opt-out is the only stored value. `cf next` gives one line. The guide prompt starts from the concept squadron's flow wrote and never drafts one (arch Concept row). The "must not" list removes the probe branching, the squadron step list and "Context Forge selects it". Those are the three items the architecture's "Guide prompt contract" and Dependencies sections say 272 must remove. The `brownfield-adoption` profile and its `fileComprehension` variable are left alone, which is consistent with the architecture's rule that `fileComprehension` comes only from squadron's argument.

### [PASS] Guide boundary and release coupling

The guide keeps ownership of the wording. cf supplies a contract of must and must-not items and does not edit the guide repo. This matches "Guide owns content, cf owns logic". The `MIN_GUIDE_VERSION` raise is sequenced last and read from the release tag. That matches the architecture's "ship together" coupling. The slice is also honest that it cannot complete before the guide release exists.

### [PASS] Failure modes for the new `cf prompt get` guide-minimum check

Each case is listed with an explicit outcome: project not resolved, no guide installed, version marker missing or unreadable, older than the minimum, and current. Exit codes and stdout are fixed, so `sq onboard` still receives the prompt. The slice states that this extends the plan entry and gives a concrete reason. Without it, an old guide hands `sq onboard` a prompt that stops on a missing Adoption Facts section, and nothing points at the stale guide. The tests required in Technical Requirements cover each case. Prompt delivery with `--comprehension` is CLI-only in the code I checked, so no MCP twin needs the same warning.

### [CONCERN] Guide-alignment verification can pass on an empty search range

Step 4 extracts the prompt section with `awk '/^##### Brownfield Adoption/,/^##### Conventions/'`, pipes it to `grep`, and prints `clean` when `grep` finds nothing. If the guide renames or re-levels either heading, `awk` prints nothing. `grep` then finds nothing and the step reports `clean` even though the section was never inspected.

The "Technical Requirements" and "Functional Requirements" rely on this check to prove the installed prompt no longer mentions `cf build`, `Adoption Facts` or the probe fields. Project guidance names this as a pitfall: a check that returns empty on bad input needs a positive control. The same pattern applies to the second `grep`, though that one reads a whole file.

Add a positive assertion before the negative one. For example, require that the extracted range is non-empty and contains "Adoption Inputs". Use a single scoped extraction rather than relying on heading levels staying fixed. This is a small edit to the walkthrough.

### [CONCERN] The contract document carries more than the architecture requires

The architecture assigns 272 docs alignment and the guide minimum. The new `docs/ADOPTION-PRIMITIVES.md`, the stderr warning and the squadron hand-off are justified additions, and the slice states the +1 effort. The weight sits in three places that can be trimmed or deferred:

- **JSON examples.** D1 keeps a success and an error example per primitive, and walkthrough step 3 re-verifies them by hand. 271 already owns the schema, and D1 points at `detectionReport.ts` for fields and error codes. One `cf detect --json` success example and one error example is enough to show the shape. Examples for `cf init --json` and `cf prompt get` repeat information that the code definitions and the CLI README rows already carry, and each one is another text that can drift.
- **"Ownership" rule.** The opening rule ("a change to those definitions updates this document in the same commit") is a process mechanism with no enforcement. The same rule already applies to any doc a code change makes stale. Cut it unless it is backed by a check.
- **D5 triage.** The triage records the search date and lists kept hits with reasons. This is useful as an implementation checklist but does not belong in the design. Move it to the task file and keep only the instruction to fix or justify each hit.

None of these blocks progress. Trimming them keeps the doc-only slice proportionate and reduces drift between the contract document and the code.

### [NOTE] Ordering with the external guide release

The slice cannot be complete until the ai-project-guide release exists. The design handles this correctly by landing docs work first and making the version raise a blocked last task. It also tells the guide session early (D6), so the release can proceed in parallel. No change needed.

### Run Digest

- Response length: 6000 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 180280 / 91239 / 89035 / 4117 / not computed
- Duration: 42.2 s
- Cost: $0.41 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6

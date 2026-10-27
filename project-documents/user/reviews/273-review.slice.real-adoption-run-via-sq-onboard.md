---
docType: review
layer: project
reviewType: slice
slice: real-adoption-run-via-sq-onboard
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/273-slice.real-adoption-run-via-sq-onboard.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261027
dateUpdated: 20261027
reviewedSha: fe0ae25d956e779cd2cb1d809f8fd802d986c7ef
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 97636
cachedTokens: 11220
cacheWriteTokens: 86412
completionTokens: 4097
durationSeconds: 36.0
costUsd: 0.388479
costBasis: provider
runId: run-20261027-p4-3dd6cfaa
squadronVersion: 0.24.5
findings:
  - id: F001
    severity: pass
    category: alignment
    summary: "Exit criterion and end state match the architecture"
    location: "project-documents/user/slices/273-slice.real-adoption-run-via-sq-onboard.md#Overview"
  - id: F002
    severity: pass
    category: integration
    summary: "Pass checks cover the composition points the architecture defines"
    location: "project-documents/user/slices/273-slice.real-adoption-run-via-sq-onboard.md#D5"
  - id: F003
    severity: concern
    category: process-conformance
    summary: "Walkthrough hard-codes `main` and conflicts with fix commits on a slice branch"
    location: "project-documents/user/slices/273-slice.real-adoption-run-via-sq-onboard.md:227"
  - id: F004
    severity: concern
    category: proportionality
    summary: "Design restates content and is heavier than a 2/5 effort run needs"
    location: "project-documents/user/slices/273-slice.real-adoption-run-via-sq-onboard.md#Verification Walkthrough"
  - id: F005
    severity: concern
    category: scope
    summary: "Conventions reconciliation (266) is exercised but outside D6's fix scope"
    location: "project-documents/user/slices/273-slice.real-adoption-run-via-sq-onboard.md#D6"
  - id: F006
    severity: note
    category: error-handling
    summary: "Failure handling for the run is explicit"
    location: "project-documents/user/slices/273-slice.real-adoption-run-via-sq-onboard.md#Risk Assessment"
  - id: F007
    severity: note
    category: dependencies
    summary: "Dependency list omits 268"
    location: "project-documents/user/slices/273-slice.real-adoption-run-via-sq-onboard.md:6-11"
---

# Review: slice — slice 273

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Exit criterion and end state match the architecture

The slice's end state is the architecture's exit criterion: a real repository adopted through `sq onboard`, then a first new slice design on the derived architecture that passes `cf validate design`. It stays within the amended boundaries. cf provides read-only primitives and never invokes squadron. Squadron and guide defects are filed rather than worked around in cf (D6, Consumes). A missing `sq onboard` makes the run `BLOCKED:` and cf takes no workaround. Both match the PM ban and the "squadron is the only adoption path" goal.

### [PASS] Pass checks cover the composition points the architecture defines

Checks 1–10 follow the adoption flow in the architecture. They cover detection on an unregistered directory, register, concept via `artifacts.concept`, resume, the Adoption Inputs prompt, derived architecture and docs map, retroactive entries, `adoption-incomplete` to `already-planned`, `cf next` skipping retroactive entries, and design on the derived architecture. The run excludes behavior that 268–272 already test with fixtures. "Never fabricate intent" is checked in check 6 ("unknown" where the PM said unknown).

### [CONCERN] Walkthrough hard-codes `main` and conflicts with fix commits on a slice branch

Walkthrough step 1 runs `git checkout main` before building the shim. Project git rules say the target comes from `cf config get git.integration_branch`, so `main` may be the wrong branch. Slice implementation also happens on `273-slice.…`, and D6 expects cf fixes to be committed one per defect. The shim points at this checkout's `dist/`, so the branch checked out determines which fixes are live on resume. The design doesn't say where fix commits land or which branch the shim builds from. Replace the checkout with "build from the slice branch carrying the fixes" and state that D6 fix commits go on that branch.

### [CONCERN] Design restates content and is heavier than a 2/5 effort run needs

Several sections repeat each other, and the slice adds no new cf component.
- The Verification Walkthrough re-lists D5's checks as commands.
- The Component Structure diagram repeats D2 and the 271 contract.
- Data Flow is one line pointing at D5.
- D6 re-summarises 265 D5's rules inline while saying they "apply unchanged".
- Technical Requirements restate what D6 already requires.
- Check 1's "`sq onboard --path` leaves `git status` and the project list unchanged" tests squadron's read-only behavior, which belongs to squadron 440. It is not a cf composition point.

Cut or defer:
- Reduce the walkthrough to the commands that aren't already in D5 (shim setup, resume).
- Drop the Data Flow stub.
- Reference 265 D5 by link, and list only the two changes.
- Drop the squadron-owned half of check 1 (squadron's own criterion covers it), or mark it as observation only.

### [CONCERN] Conventions reconciliation (266) is exercised but outside D6's fix scope

D2 has the PM answer the rules-reconciliation offer, and the architecture lists reconciliation as a CF-owned part of the adoption flow. D6's scope for "the initiative's cf code" names 261, 263, 264, 267, 268, 269, 271 and 272 and omits 266. A defect surfaced at that offer has no stated disposition, and no D5 check covers it. Either add 266 to D6's scope, or say that a reconciliation defect is filed and not fixed here.

### [NOTE] Failure handling for the run is explicit

The slice adds no new I/O path or message type. Run-level failures each have a handling strategy:
- Missing prerequisite or squadron defect: `BLOCKED:`.
- Network failure on guide install: retry.
- Session interruption: resume, since steps are computed from files.
- Review gate: run the review, and a gate that still blocks afterwards is a defect.
- Private repository: the report carries no code.

No architecture NFR applies to this path.

### [NOTE] Dependency list omits 268

Check 9 relies on `cf build` being pure (268), but the frontmatter `dependencies` lists 263, 267, 269, 271 and 272 only. This is low risk because 268 is a prerequisite of 269 and 271 by the architecture's ordering. Adding it would still make the dependency explicit.

### Run Digest

- Response length: 5037 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 97636 / 11220 / 86412 / 4097 / not computed
- Duration: 36.0 s
- Cost: $0.39 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7

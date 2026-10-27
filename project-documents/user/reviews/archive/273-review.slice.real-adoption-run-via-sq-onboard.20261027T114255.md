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
reviewedSha: 031136b59d145b2757439a0dc49fafd0d354af00
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 98726
cachedTokens: 8842
cacheWriteTokens: 89880
completionTokens: 3492
durationSeconds: 34.3
costUsd: 0.396066
costBasis: provider
runId: run-20261027-p4-3dd6cfaa
squadronVersion: 0.24.5
findings:
  - id: F001
    severity: pass
    category: alignment
    summary: "Scope matches the architecture's exit criterion"
    location: "project-documents/user/slices/273-slice.real-adoption-run-via-sq-onboard.md#Overview"
  - id: F002
    severity: pass
    category: dependency-direction
    summary: "Layer boundaries and the squadron ban are respected"
    location: "project-documents/user/slices/273-slice.real-adoption-run-via-sq-onboard.md#D6, #Consumes-from-Other-Slices"
  - id: F003
    severity: concern
    category: proportionality
    summary: "Design is heavier than a 2/5 run-and-report slice needs"
    location: "project-documents/user/slices/273-slice.real-adoption-run-via-sq-onboard.md#Architecture, #D5, #D6, #Verification-Walkthrough"
  - id: F004
    severity: concern
    category: under-specification
    summary: "Check 10 has no verification step for its outside-the-repo clause"
    location: "project-documents/user/slices/273-slice.real-adoption-run-via-sq-onboard.md:171, :277-281"
  - id: F005
    severity: concern
    category: hidden-dependency
    summary: "Check 8 needs an MCP client the Prerequisites don't list"
    location: "project-documents/user/slices/273-slice.real-adoption-run-via-sq-onboard.md:58, :169"
  - id: F006
    severity: note
    category: dependencies
    summary: "Frontmatter dependencies are narrower than the consumed interfaces"
    location: "project-documents/user/slices/273-slice.real-adoption-run-via-sq-onboard.md:6-8"
  - id: F007
    severity: pass
    category: error-handling
    summary: "Failure handling for an interrupted or blocked run is explicit"
    location: "project-documents/user/slices/273-slice.real-adoption-run-via-sq-onboard.md#D3, #D6, #Mitigation-Strategies"
---

# Review: slice — slice 273

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Scope matches the architecture's exit criterion

The slice's end state is a real repository adopted through `sq onboard`, then a first new slice design that passes `cf validate design`. This is the exit criterion word for word (260-arch, Anticipated Slices). The slice adds no cf components and no cf features. D6 sends any change to a decided behavior, option or format to an issue, which fits the arch's "files record state, cf orchestrates nothing" amendment.

### [PASS] Layer boundaries and the squadron ban are respected

Squadron calls cf and cf never calls squadron. Squadron and guide defects are filed in their own repositories, and cf adds no workaround. A missing `sq onboard` blocks the run with a `BLOCKED:` line, and cf does not drive adoption itself. This matches the PM ban of 20261025 and the Responsibility Split table. The data-flow checks use only primitives the architecture names: the detection report, `artifacts.concept`, the prompt's Adoption Inputs section, and retroactive entries.

### [CONCERN] Design is heavier than a 2/5 run-and-report slice needs

The slice delivers one live run, regression-tested fixes, and one short report. The document restates material that lives elsewhere or says the same thing twice:
- **Component Structure and Data Flow** redraw squadron 440's flow and the cf contract. Data Flow's seven steps are then repeated as D5 checks 1–9.
- **Verification Walkthrough** is a third copy of the same sequence, with commands. Keep it only as the operator script.
- **D5 checks 1 and 2** re-test behavior that 271 and 440 already cover with fixtures ("no writes on detect", "cf init steps ok"). D5's own preamble says fixture-covered behavior is not re-checked.
- **D6** re-derives 265 D5's disposition taxonomy in eight bullets.

Cut Data Flow and the Component Structure diagram, and point to `docs/ADOPTION-PRIMITIVES.md` and 440. Fold checks 1–2 into the setup record. Reduce D6 to "265 D5 applies; evidence goes in the report" plus the constant-tuning evidence rule, which is the one new rule.

### [CONCERN] Check 10 has no verification step for its outside-the-repo clause

Check 10 says nothing outside the repository changed except the cf project store and the review file. Walkthrough step 6 runs only `git -C <root> status --short`, which cannot see writes outside the repo. This matters because D2 relies on the clean-write guarantee. Squadron's plugin and analysis pack and the user-level commands directory are plausible stray-write sites, and the real project store is in use. Either narrow check 10 to what `git status` shows, or name the evidence for the outside-the-repo clause. One option is a before-and-after listing of the project store and the user-level commands directory.

### [CONCERN] Check 8 needs an MCP client the Prerequisites don't list

Technical Scope excludes the MCP `project_detect` path and says the run "uses one surface". Check 8 then requires `workflow_next` to be "checked once from an MCP client". Prerequisites do not list an MCP client or a cf MCP server install. Nothing says what happens if one is unavailable, and the failure could block a pass for reasons unrelated to adoption. Either add the MCP client and server to Prerequisites, or drop the check. The parity tests in 269 and 271 already cover the MCP side.

### [NOTE] Frontmatter dependencies are narrower than the consumed interfaces

Frontmatter lists only 271 and 272. The Interfaces Required section also consumes 263, 267, 269 and the 240 gate, and Prerequisites depend on squadron 440. Listing the cf slices there would make the slice-plan dependency graph match the prose. Squadron 440 cannot be expressed as a cf slice index.

### [PASS] Failure handling for an interrupted or blocked run is explicit

The slice adds no new I/O path or message type. For the existing ones, a session that ends early resumes from the files (D3, and 440 D1). Squadron defects block with a named `BLOCKED:` line. A cf defect gets a fix, a test written against the real input's format, and a re-run of the affected checks. A gate that blocks even after a passing review is classed as a defect. No NFR in the architecture applies to this path, so none needs restating.

### Run Digest

- Response length: 5183 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 98726 / 8842 / 89880 / 3492 / not computed
- Duration: 34.3 s
- Cost: $0.40 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7

---
docType: review
layer: project
reviewType: slice
slice: permissiveness-setting
targetKind: slice
rulesSource: project
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/246-slice.permissiveness-setting.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261019
dateUpdated: 20261019
reviewedSha: dd1775770abc57fe15a0653bd1dd894f71edf737
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 6
turns: 7
promptTokens: 295470
cachedTokens: 216349
cacheWriteTokens: 79111
completionTokens: 2745
durationSeconds: 31.1
costUsd: 0.366262
costBasis: provider
squadronVersion: 0.23.2
findings:
  - id: F001
    severity: pass
    category: architecture-alignment
    summary: "Delivery mechanism and boundaries match the plan entry"
    location: "project-documents/user/slices/246-slice.permissiveness-setting.md#Technical Decisions"
  - id: F002
    severity: concern
    category: dependencies
    summary: "Cross-repo prerequisite is soft, and the plan's effort and risk assume it"
    location: "project-documents/user/slices/246-slice.permissiveness-setting.md#Dependencies"
  - id: F003
    severity: concern
    category: error-handling
    summary: "Failure modes for the new guide-file read are only partly enumerated"
    location: "project-documents/user/slices/246-slice.permissiveness-setting.md#D6"
  - id: F004
    severity: concern
    category: under-specification
    summary: "Applicable-phase mechanism is under-specified for how the phase is obtained"
    location: "project-documents/user/slices/246-slice.permissiveness-setting.md#Architecture"
  - id: F005
    severity: concern
    category: proportionality
    summary: "Slight overweight: configuration and abstraction beyond what is needed now"
    location: "project-documents/user/slices/246-slice.permissiveness-setting.md#Technical Decisions"
  - id: F006
    severity: note
    category: scope
    summary: "Level semantics rest on guide wording not yet written"
    location: "project-documents/user/slices/246-slice.permissiveness-setting.md#D1"
  - id: F007
    severity: note
    category: integration
    summary: "Worktree-scoped resolution is consistent with the architecture"
    location: "project-documents/user/slices/246-slice.permissiveness-setting.md#State Management"
---

# Review: slice — slice 246

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Delivery mechanism and boundaries match the plan entry

D3, D5 and D7 follow the slice plan entry: `cf build` and `context_build` read config on every build, the fragment is added only in design, task and implementation phases, and wording stays in ai-project-guide. Excluding `cf next`, `cf check` and `BLOCKED:` enforcement keeps the setting out of the deterministic gating layer defined in the architecture. The setting does not touch `WorkflowNavigator` or `ConsistencyChecker`, so the architecture's dependency directions are intact.

### [CONCERN] Cross-repo prerequisite is soft, and the plan's effort and risk assume it

The feature cannot be used until ai-project-guide ships the `cautious` and `autonomous` fragments. The design treats this as a prerequisite but gives it no owner, no tracking issue and no completion check. Implementation step 6 ("raise the two fragments with ai-project-guide") comes last. Without that, "done" for 246 can leave a key that fails the build (D6) for anyone who sets it. Move the guide request to the start of the work, and have the slice record the issue reference and the guide version that satisfies the prerequisite. D6's error message should also say that the installed guide predates the feature, not only that the file is missing.

### [CONCERN] Failure modes for the new guide-file read are only partly enumerated

D6 covers a missing fragment. The design adds one new I/O path, reading `<guide rules>/permissiveness/<level>.md`, and its other failure cases have no stated handling:
- The guide directory itself cannot be located.
- The file exists but cannot be read (permissions, encoding).
- The file exists but is empty or whitespace-only. The resolver's contract returns an empty string for "nothing applies", so an empty fragment would silently look like `standard`. That is the silent fallback D6 forbids.

State that each of these fails with a named error, as D6 does for the missing file. Add the empty-file case to the test list.

### [CONCERN] Applicable-phase mechanism is under-specified for how the phase is obtained

The resolver takes "the phase", but the design does not say where the phase comes from during a build, or what happens when it is unknown, unset or ambiguous (for example a worktree-scoped phase). The success criterion that default-level output is byte-identical in every phase depends on this. State the phase source, and state the behavior when no phase can be determined: omit the section, or fail explicitly. The project's no-silent-fallback rule makes silent omission questionable.

### [CONCERN] Slight overweight: configuration and abstraction beyond what is needed now

Three things can be cut or simplified:
- The new resolver service plus an injected function on `ContextIntegrator` and a new conditional template section follow existing patterns. They are acceptable, but the design should say why the fragment cannot be fetched inside the existing integrator path without a separate service file.
- The Technical Requirements list a six-part test matrix, including a CLI and MCP parity test. Since both use `createContextPipeline`, one pipeline-level test plus the CLI and MCP smoke tests would cover it.
- The "README and config reference docs" item and the seven-step walkthrough largely restate behavior already in the success criteria. Trim the walkthrough to the steps that exercise distinct paths.

None of this is blocking. The point is to avoid mechanism count and prose that exceed the 3/5 effort assigned in the plan.

### [NOTE] Level semantics rest on guide wording not yet written

D1 defines `cautious` as "waits readily, including at phase boundaries" and `autonomous` as suppressing waits. The behavior depends entirely on guide text that does not yet exist. This is consistent with the plan, which assigns wording to ai-project-guide. The risk is that `cautious` in phases 4 to 6 adds waiting that the baseline rule calls invalid, which would conflict with the baseline. Settle that conflict in the guide request, not in cf.

### [NOTE] Worktree-scoped resolution is consistent with the architecture

Per-checkout key resolution matches the worktree scoping established in 180 and cited in the architecture's Related Work. The success criteria include a worktree-specific test.

### Run Digest

- Response length: 5440 chars
- Response is newline-free: no
- Tool calls made: 6
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 7
- Tokens — prompt / cached / cache write / completion / reasoning: 295470 / 216349 / 79111 / 2745 / not computed
- Duration: 31.1 s
- Cost: $0.37 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7

---
docType: review
layer: project
reviewType: tasks
slice: onboarding-consolidation
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/260-tasks.onboarding-consolidation.md
aiModel: claude-haiku-5-5
aiProfile: sdk
status: complete
dateCreated: 20261020
dateUpdated: 20261020
reviewedSha: 8cee2e67c2fac88ec79688c955324a8f3a1adbad
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 138586
cachedTokens: 57314
cacheWriteTokens: 81268
completionTokens: 13968
durationSeconds: 66.2
costUsd: 0.024542
costBasis: provider
runId: run-20261020-p5-2eb33972
squadronVersion: 0.23.5
findings:
  - id: F001
    severity: pass
    category: uncategorized
    summary: "All success criteria and technical requirements are traced to tasks"
    location: "project-documents/user/tasks/260-tasks.onboarding-consolidation.md:39-252"
  - id: F002
    severity: concern
    category: uncategorized
    summary: "README changes exceed the design's stated scope"
    location: "project-documents/user/tasks/260-tasks.onboarding-consolidation.md:238"
  - id: F003
    severity: concern
    category: uncategorized
    summary: "Design commits to an arch doc update that no task performs"
    location: "project-documents/user/slices/260-slice.onboarding-consolidation.md:289"
  - id: F004
    severity: concern
    category: uncategorized
    summary: "Browser-safe export of the offer evaluator is not specified"
    location: "project-documents/user/tasks/260-tasks.onboarding-consolidation.md:110"
  - id: F005
    severity: concern
    category: uncategorized
    summary: "Greenfield criterion has no executed verification"
    location: "project-documents/user/tasks/260-tasks.onboarding-consolidation.md:249"
  - id: F006
    severity: concern
    category: uncategorized
    summary: "Broad catch in the offer path does not state how it meets the exception rules"
    location: "project-documents/user/tasks/260-tasks.onboarding-consolidation.md:113"
  - id: F007
    severity: note
    category: uncategorized
    summary: "`local` guide marker handling is not in the design's result list"
    location: "project-documents/user/tasks/260-tasks.onboarding-consolidation.md:213"
  - id: F008
    severity: note
    category: uncategorized
    summary: "Commit checkpoints are per group, not per task"
    location: "project-documents/user/tasks/260-tasks.onboarding-consolidation.md:92"
  - id: F009
    severity: note
    category: uncategorized
    summary: "Some effort-1 tasks could be merged"
    location: "project-documents/user/tasks/260-tasks.onboarding-consolidation.md:46"
  - id: F010
    severity: note
    category: uncategorized
    summary: "Helper files are not in the design's component structure"
    location: "project-documents/user/tasks/260-tasks.onboarding-consolidation.md:47"
---

# Review: tasks — slice 260

**Verdict:** CONCERNS
**Model:** claude-haiku-5-5

## Findings

### [PASS] All success criteria and technical requirements are traced to tasks

Checked each Functional, Technical and Integration criterion from the slice design. Recipe rendering (10–12), CI recognition and tests (3, 3T), the offer and its I/O-warning paths (6, 6T, 7, 7T), `cf next` and `workflow_next` (8, 9), the config key (4), the guide minimum warning in both surfaces (13–15), the drift test and installer check (11T), the README (16), and the full verification walkthrough (17) all have tasks. There is no NFR, so no load test is required.

### [CONCERN] README changes exceed the design's stated scope

Task 16 updates the `/cf:onboard` row in the Slash Commands table. The design allows "one updated onboarding section" plus "one line" for the config key, and its success check says "no other README sections change." The Slash Commands row is a second section that the design excludes. Either drop that sub-item or amend the design to include it.

### [CONCERN] Design commits to an arch doc update that no task performs

The Integration Points section says the repository-root CI exception "is also recorded in the arch's detection section." No task edits the architecture document, and no success criterion covers it. Add a sub-item to Task 3 or Task 16, or remove the claim from the design.

### [CONCERN] Browser-safe export of the offer evaluator is not specified

`setupCiOffer.ts` lives in `introspection/`, and it calls the fs-dependent `recognizeCi` and `hasBuildManifest`. Task 5 confirms that `introspection/index.ts` is browser-safe. Task 6 never says where `evaluateSetupCiOffer` is exported. The Context Summary says fs-dependent modules go in `node.ts`, but Task 6 does not repeat that rule. An implementer following Task 6 literally could add it to the browser-safe barrel. Add an explicit instruction to export it from `node.ts` only.

### [CONCERN] Greenfield criterion has no executed verification

The success criterion "A greenfield run ... goes: setup, then `cf build`, then the concept prompt's opening question" is only checked by Walkthrough steps 3–4, which Task 17 defers with "do not mark them done unless actually run." Live runs are pre-authorized, so the implementer should run them, or the task should name who does and where the result is recorded. As written, the criterion can silently remain unverified.

### [CONCERN] Broad catch in the offer path does not state how it meets the exception rules

Task 6 wraps all three filesystem checks in one try/catch that converts every error into a warning. The project's exception rules require either logging at ERROR and re-raising, or catching a specific exception with a comment. The design asks for "any other filesystem error" to become a warning, so the behavior is correct. The task should still say how the catch complies: narrow it to the fs error codes that are handled, or log at ERROR before returning the warning.

### [NOTE] `local` guide marker handling is not in the design's result list

D8 lists three outcomes: at or above the minimum, below it, and unknown (`null`). Task 13 adds a fourth case, the `local` marker, and treats it as unknown. The task's reasoning is sound, since `isNewerVersion` would otherwise report a local install as older than the minimum. Record this decision in D8 so the design and the task agree.

### [NOTE] Commit checkpoints are per group, not per task

Commits are spread across the plan, not batched at the end, which meets the distribution check. But Tasks 1–3E (eight items) share one commit, and so do 13–15. The project rule asks for at least one commit per task. Consider a commit after Task 2T, so the manifest check is committed before the CI recognizer.

### [NOTE] Some effort-1 tasks could be merged

Tasks 1/1T (path-presence helper and its six tests), 2/2T (manifest check) and 3E (re-export) are small and tightly coupled to Task 3. Merging 1 and 2 into one task, and folding 3E into Task 3, would cut three task headers without changing the work.

### [NOTE] Helper files are not in the design's component structure

`detection/pathPresent.ts` and `detection/index.ts` are not listed in the design's Component Structure. Both are reasonable, and the design's "missing file means not present" rule supports the helper. The `lstat`/`stat` detail in the Context Summary is an implementation choice rather than a design requirement. Add the two files to the design's component list so the file set matches what the task creates.

### Run Digest

- Response length: 5682 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 138586 / 57314 / 81268 / 13968 / not computed
- Duration: 66.2 s
- Cost: $0.02 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 10
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 10
- Finding-shaped matches — surviving validation: 10

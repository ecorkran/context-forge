---
docType: review
layer: project
reviewType: tasks
slice: guide-update-branch-guard
project: squadron
verdict: CONCERNS
sourceDocument: project-documents/user/tasks/916-tasks.guide-update-branch-guard.md
aiModel: z-ai/glm-5.1
status: complete
dateCreated: 20260713
dateUpdated: 20260713
findings:
  - id: F001
    severity: concern
    category: completeness
    summary: "TarballStrategy guard evaluation contradicts success criterion"
    location: packages/core/src/guides/GuideManager.ts
  - id: F002
    severity: concern
    category: completeness
    summary: "Error remediation text requirement not captured in task 2.5"
    location: packages/core/src/guides/branchGuard.ts
  - id: F003
    severity: pass
    category: test-coverage
    summary: "Test-with pattern consistently applied"
    location: unverified
  - id: F004
    severity: pass
    category: version-control
    summary: "Commit checkpoints well distributed throughout task sequence"
    location: unverified
  - id: F005
    severity: pass
    category: test-coverage
    summary: "Decision table test coverage is comprehensive"
    location: packages/core/tests/guides/branchGuard.test.ts
---

# Review: tasks — slice 916

**Verdict:** CONCERNS
**Model:** z-ai/glm-5.1

## Findings

### [CONCERN] TarballStrategy guard evaluation contradicts success criterion

The slice design's success criterion states: *"TarballStrategy-installed guides (manual strategy) are entirely unaffected — no guard evaluation overhead or behavior change, since that strategy never commits."* The Technical Scope section reinforces this: *"TarballStrategy — does no git commit, unaffected, no guard needed."*

However, Task 3.3 explicitly directs the implementer to *"Confirm (by reading, not by writing new code) that evaluateBranchGuard() is called unconditionally in update() regardless of info.method, so a manual-strategy project still gets guard evaluation."* Task 3.1 wires the guard without any strategy-type conditional.

This creates a real behavioral conflict: a TarballStrategy user on `main` with `git.integration_branch` set would be **blocked** from updating guides, even though TarballStrategy never commits. Similarly, a TarballStrategy user on a descendant branch would receive a **warn** prompt for an operation that cannot produce the harm the guard is designed to prevent. Both contradict "no guard evaluation overhead or behavior change."

The task breakdown needs to either: (a) add a conditional skip of the guard when `info.method === 'manual'`, matching the success criterion; or (b) the success criterion needs to be renegotiated to reflect universal guard evaluation. As written, implementing the tasks as specified would fail the TarballStrategy success criterion.

### [CONCERN] Error remediation text requirement not captured in task 2.5

The slice design's CLI Interface Changes section specifies that `BranchGuardBlockedError` should surface *"a suggested remediation (switch to the trunk branch, or unset git.integration_branch if that's not actually desired). For the detached-HEAD variant (current === 'HEAD'), the remediation instead suggests checking out a branch before updating."*

Task 2.5 only requires error messages that *"name both"* trunk/current and *"distinguish the detached-HEAD case in the message text."* No remediation instructions are specified. Task 4.1 acknowledges the gap with a *"confirm the error message text is sufficiently actionable as-is; if not, adjust"* approach, but this "check and maybe fix" pattern doesn't guarantee the remediation text will be included — it defers a concrete requirement to an ad-hoc judgment call.

The tasks should explicitly require the remediation text in Task 2.5's error class specifications, or add a dedicated sub-task to write and test the remediation content. Without this, a junior AI implementing the tasks literally could produce error messages that name the branches but offer no guidance on how to resolve the situation.

### [PASS] Test-with pattern consistently applied

Every implementation task is immediately followed by its corresponding test task: 2.1→2.2, 2.3→2.4, 2.5→2.6, 3.1→3.2, 4.1+4.2→4.3, 5.1+5.2→5.3. This is well-executed and ensures test coverage is built incrementally alongside implementation rather than deferred.

### [PASS] Commit checkpoints well distributed throughout task sequence

Commits are placed after each coherent unit of work: Task 2.7 (core guard module), Task 3.4 (GuideManager wiring), Task 4.4 (CLI changes), Task 5.4 (MCP changes), Task 7.3 (docs). This provides good rollback granularity and avoids the anti-pattern of batching all commits at the end.

### [PASS] Decision table test coverage is comprehensive

Task 2.4 lists 11 test cases covering every row of the decision table from the slice design, including edge cases like detached HEAD with trunk set (verifying evaluation order), `isAncestor` rejection propagation, and omitted `configManager`. This aligns directly with the technical requirement for *"full unit test coverage of the decision table"* and includes the `merge-base --is-ancestor` exit code >1 case that the design specifically calls out as needing assertion as a thrown error rather than a warn verdict.

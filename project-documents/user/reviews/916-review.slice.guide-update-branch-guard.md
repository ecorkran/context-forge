---
docType: review
layer: project
reviewType: slice
slice: guide-update-branch-guard
project: squadron
verdict: CONCERNS
sourceDocument: project-documents/user/slices/916-slice.guide-update-branch-guard.md
aiModel: z-ai/glm-5.1
status: complete
dateCreated: 20260713
dateUpdated: 20260713
findings:
  - id: F001
    severity: pass
    category: architectural-alignment
    summary: "Alignment with architectural principles"
    location: 916-slice.guide-update-branch-guard.md#Overview
  - id: F002
    severity: pass
    category: layer-boundaries
    summary: "Layer responsibility separation maintained"
    location: 916-slice.guide-update-branch-guard.md#Patterns and Conventions
  - id: F003
    severity: pass
    category: api-design
    summary: "Additive, non-breaking API design"
    location: 916-slice.guide-update-branch-guard.md#Data Flow
  - id: F004
    severity: concern
    category: error-handling
    summary: "Failure modes not enumerated for new git subprocess I/O paths"
    location: 916-slice.guide-update-branch-guard.md#Data Flow
  - id: F005
    severity: concern
    category: specification-gap
    summary: "Detached HEAD not addressed in the decision table"
    location: 916-slice.guide-update-branch-guard.md#Technical Decisions
  - id: F006
    severity: concern
    category: error-handling
    summary: "merge-base --is-ancestor exit code >1 conflated with exit code 1"
    location: 916-slice.guide-update-branch-guard.md#Technical Decisions
---

# Review: slice — slice 916

**Verdict:** CONCERNS
**Model:** z-ai/glm-5.1

## Findings

### [PASS] Alignment with architectural principles

The slice aligns with all three principles in the parent architecture: it is themed around a single concern (branch guard), has explicit success criteria (not open-ended), and requires test coverage for the decision table before behavior changes ship. The change falls squarely within the architecture's scope of "developer experience improvements" and "hard-coded values → configuration" (respecting the `git.integration_branch` config key added by 914).

### [PASS] Layer responsibility separation maintained

Core decision logic lives in `branchGuard.ts` with no CLI or MCP concerns leaking in. The discriminated error types (`BranchGuardBlockedError`, `BranchGuardWarnError`) let CLI and MCP layers handle surfacing independently. The `opts?: { confirmed?: boolean }` parameter is threaded through the `GuideManager` API boundary rather than reaching across layers. This is a clean pattern.

### [PASS] Additive, non-breaking API design

The new `opts` parameter on `GuideManager.update()` is optional. Existing callers that don't pass it get today's behavior on `proceed` paths and correct tightening (block/warn instead of silent commit) on guard-triggering paths. No existing contract is violated.

### [CONCERN] Failure modes not enumerated for new git subprocess I/O paths

The slice introduces two new git subprocess invocations (`git rev-parse --abbrev-ref HEAD` and `git merge-base --is-ancestor <trunk> HEAD`) but does not explicitly enumerate what happens when these calls fail, hang, or return unexpected results. Specifically: (1) If `git rev-parse` fails because the project directory is not a git repo or `.git` is corrupted, `gitExec` will throw — the document mentions that callers already have uniform error surfacing, but this is implicit rather than enumerated as a failure mode with a handling strategy. (2) No timeout or hang strategy is specified for either subprocess call (e.g., git prompting for SSH credentials and blocking indefinitely). (3) The `execFile`-based local wrapper for `merge-base` has no specified error handling if the child process fails to spawn or is killed. Per review criteria, each new I/O path should have its failure modes enumerated with an explicit handling strategy.

### [CONCERN] Detached HEAD not addressed in the decision table

When the repository is in a detached HEAD state, `git rev-parse --abbrev-ref HEAD` returns the literal string `HEAD` rather than a branch name. The decision table has no row for `current === 'HEAD'`. The flow would fall through to the `merge-base --is-ancestor` check, which may behave unexpectedly against a detached HEAD (it checks commit ancestry, not branch names, so it could succeed — but the resulting `warn` verdict would carry `current: 'HEAD'` in its error shape, producing confusing user-facing messages like "current branch is HEAD"). The slice should explicitly define the expected outcome for detached HEAD, whether that's `block`, `warn('unrelated')`, or a dedicated handling path.

### [CONCERN] merge-base --is-ancestor exit code >1 conflated with exit code 1

The decision table states "exit code non-zero → warn (ancestry: 'unrelated')" which lumps exit code 1 (not an ancestor — the expected "false" result) together with exit code >1 (actual git error — e.g., invalid ref name, corrupted object store). The document correctly identifies that `gitExec`'s throw-on-nonzero contract must be bypassed for this command, and calls for a local `execFile` wrapper, but does not specify that the wrapper must distinguish exit code 1 from exit code >1. If a real git error (exit code 128, for example) is silently treated as "unrelated ancestry" and the user confirms, the guard would proceed to commit despite a potentially corrupt or ambiguous repository state. The implementation note should specify tripartite handling: exit 0 → descends, exit 1 → unrelated, exit >1 → throw/propagate as an unexpected error rather than a warn.

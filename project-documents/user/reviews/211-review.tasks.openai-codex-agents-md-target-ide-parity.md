---
docType: review
layer: project
reviewType: tasks
slice: openai-codex-agents-md-target-ide-parity
project: context-forge
verdict: CONCERNS
sourceDocument: project-documents/user/tasks/211-tasks.openai-codex-agents-md-target-ide-parity.md
aiModel: claude-sonnet-5
status: complete
dateCreated: 20260802
dateUpdated: 20260802
findings:
  - id: F001
    severity: concern
    category: sequencing
    summary: "Section 10 depends on a parameter Section 11 hasn't introduced yet"
    location: project-documents/user/tasks/211-tasks.openai-codex-agents-md-target-ide-parity.md:238
  - id: F002
    severity: concern
    category: task-completability
    summary: "Tasks requiring a live third-party agent session lack a feasibility fallback"
    location: project-documents/user/tasks/211-tasks.openai-codex-agents-md-target-ide-parity.md:57-61
  - id: F003
    severity: concern
    category: test-coverage
    summary: "Success criterion \"`cf init --ide codex`/`cursor` run end-to-end\" has no dedicated automated test"
    location: project-documents/user/tasks/211-tasks.openai-codex-agents-md-target-ide-parity.md:310-312
  - id: F004
    severity: pass
    category: sequencing
    summary: "Discovery gate correctly precedes its dependents"
    location: project-documents/user/tasks/211-tasks.openai-codex-agents-md-target-ide-parity.md:48-69
  - id: F005
    severity: pass
    category: process
    summary: "Test-with pattern and commit distribution"
    location: project-documents/user/tasks/211-tasks.openai-codex-agents-md-target-ide-parity.md
  - id: F006
    severity: pass
    category: completeness
    summary: "No NFR/load-test gap"
    location: unverified
---

# Review: tasks — slice 211

**Verdict:** CONCERNS
**Model:** claude-sonnet-5

## Findings

### [CONCERN] Section 10 depends on a parameter Section 11 hasn't introduced yet

Task 10.1 instructs: "call `emit_agents_md` for always-on rules (with the scoped index suppressed — see 11.1)". The `include_scoped_index` parameter that makes suppression possible is not added to `emit_agents_md` until task 11.1 (line 262), two sections later. Per the design (Migration section), the cursor branch of the guide script did not previously call `emit_agents_md` at all — so there is no "existing default" for 10.1 to fall back on the way Section 9's agents-target call can. If Section 10 is executed and committed as its own unit (as the section/commit boundaries imply — `feat(guide): split cursor rules between AGENTS.md and .cursor/rules`), the resulting `AGENTS.md` will include the `## Additional Rules` index, directly contradicting task 10.3's own verification step ("`AGENTS.md` present with no `## Additional Rules` section"). Either Section 11's parameter work needs to move before/into Section 10, or 10.1 needs to explicitly fold in the parameter addition (with 11.1 reduced to wiring `copilot`'s `false` and the marker rename).

### [CONCERN] Tasks requiring a live third-party agent session lack a feasibility fallback

Tasks 2.2 ("Open a Codex session … Ask Codex to …") and 10.3 ("Manual: open a real Cursor session … confirm …") assume the implementing agent has interactive access to a separate vendor product (OpenAI Codex, Cursor). The design itself lists these under "Manual (cannot be automated in CI)" (slice design lines 266–268), so this is a known constraint, but the task breakdown only provides an escalation path for the *outcome* of that session ("If neither is discovered → STOP and report", 2.3) — not for the case where a junior AI executing this checklist has no mechanism to open such a session at all. As written, a junior AI following the checklist literally has no defined action when it reaches "Open a Codex session" and cannot do so. This should either name who performs the manual step (PM / human tester) or state explicitly that these bullets are handed off outside the automated task loop.

### [CONCERN] Success criterion "`cf init --ide codex`/`cursor` run end-to-end" has no dedicated automated test

The slice design's third success criterion is `cf init --ide codex` and `cf init --ide cursor` running end-to-end on a fresh directory. `init.ts` forwards `opts.ide` straight to `setupIdeAction` with no validation of its own (confirmed by reading `packages/cli/src/commands/init.ts:139-142`), so correctness rides entirely on `setupIdeAction`. Section 5.2 unit-tests `setupIdeAction` directly for `codex`/`agents`/`cursor`, which is good, but there is no task that unit-tests `init.ts`'s own wrapper (e.g., that `--ide codex` reaches `setupIdeAction` and that the init-level completion message, which echoes the *raw, unnormalized* `ideTarget` at `init.ts:142` rather than the normalized value `setupIdeAction` uses internally, doesn't produce a confusing double completion line). Coverage for this criterion is currently only the manual walkthrough in task 13.2. That may be an acceptable trade-off given init.ts needs no code change, but it's worth an explicit call-out rather than leaving the criterion verified solely by a manual script run.

### [PASS] Discovery gate correctly precedes its dependents

Section 2 (Codex skills discovery confirmation, Decision 6) is sequenced before Section 9, which explicitly says "Requires the path confirmed in 2.3" (line 218). The escalation path for a negative/ambiguous discovery result ("STOP and report to the Project Manager") is present and correctly prevents downstream work from proceeding on an unconfirmed assumption.

### [PASS] Test-with pattern and commit distribution

Every implementation subsection (3, 4, 5, 6, 7) is immediately followed by its own test subsection before the section's commit checkpoint, and commits are spread across essentially every section (3 through 12) rather than batched at the end — Section 13 is reserved for final integration/merge only, which matches the "distributed checkpoints" expectation.

### [PASS] No NFR/load-test gap

The slice design contains no performance/scale NFR restatement (it is a CLI/file-emission feature, not a throughput or latency concern), so the absence of a `tests/load/` task and CI-gating task is correct rather than a gap.

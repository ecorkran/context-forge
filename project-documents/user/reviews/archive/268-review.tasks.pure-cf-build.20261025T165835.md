---
docType: review
layer: project
reviewType: tasks
slice: pure-cf-build
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/268-tasks.pure-cf-build.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261025
dateUpdated: 20261025
reviewedSha: d45c34cbea40321f8afc47bcb7cc5108e593412a
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 96247
cachedTokens: 8843
cacheWriteTokens: 87400
completionTokens: 6534
durationSeconds: 52.7
costUsd: 0.416565
costBasis: provider
runId: run-20261025-p5-2a7d0b92
squadronVersion: 0.24.1
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success criteria are fully covered and traceable"
    location: "project-documents/user/tasks/268-tasks.pure-cf-build.md:47-204"
  - id: F002
    severity: concern
    category: commit-checkpoints
    summary: "Section 3 batches about 20 files across three packages into one commit"
    location: "project-documents/user/tasks/268-tasks.pure-cf-build.md:83"
  - id: F003
    severity: concern
    category: sequencing
    summary: "Section 3 contradicts itself on typecheck, and never says to rebuild core"
    location: "project-documents/user/tasks/268-tasks.pure-cf-build.md:83, 112, 120"
  - id: F004
    severity: note
    category: task-clarity
    summary: "5.1 sends the implementer to git history for a file deleted three sections earlier"
    location: "project-documents/user/tasks/268-tasks.pure-cf-build.md:118, 175"
  - id: F005
    severity: note
    category: proportionality
    summary: "Several section 4 tasks are small enough to merge"
    location: "project-documents/user/tasks/268-tasks.pure-cf-build.md:153-168"
  - id: F006
    severity: note
    category: coverage
    summary: "The `MIN_GUIDE_VERSION` criterion has no dedicated check"
    location: "project-documents/user/tasks/268-tasks.pure-cf-build.md:111, 119, 203"
---

# Review: tasks — slice 268

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success criteria are fully covered and traceable

- **No read, write, detection or `sq`:** tasks 3.3, 3.5, 3.6 and 5.1.
- **Phase 0 returns the concept prompt and writes nothing:** the 5.1 snapshot and output assertions.
- **Byte identity:** golden capture in 2.1–2.3, rechecked in 3.7 and 6.1.
- **CLI and MCP parity:** the 5.1 parity check.
- **`MIN_GUIDE_VERSION` warning:** kept by 3.5 and 3.6, which preserve the existing guide-warning assertions. 6.3 checks it by hand.
- **`services/` imports nothing from `adoption/` or `detection/`:** the 3.3 and 6.2 greps.
- **No orphan exports:** the 6.2 export audit.
- **Full suite passes:** 3.7 and 6.1.
- **Verification Walkthrough:** 6.3.

Tasks 4.6, 6.2 and 6.3 trace to the Migration Plan, the Technical Requirements and the Walkthrough, so I found no scope creep. The golden capture runs before any edit. In section 4, `adoptionCompletion`, which uses the writer and the `adoption-completed` variant, is deleted (4.1) before the writer (4.3) and the variant (4.4). The probe's consumers are deleted in 4.1 before the probe itself in 4.5.

### [CONCERN] Section 3 batches about 20 files across three packages into one commit

Tasks 3.1–3.6 stay uncommitted until 3.7. The stated reason is that the integrator, factory and both callers are coupled. That holds for 3.3–3.6, but 3.1 (SectionBuilder) and 3.2 (ContextTemplateEngine) can each be committed alone.
- Each removes a render path while the context fields still exist, so each compiles on its own.
- The golden test can run after each.

Commit 3.1 and 3.2 individually, or together as `refactor: drop comprehension line and adoption facts section`. Keep the single commit for 3.3–3.6, which really is atomic. This also narrows the revert surface if the golden test fails.

### [CONCERN] Section 3 contradicts itself on typecheck, and never says to rebuild core

The section note says cli and mcp typecheck "may fail until 3.6". But 3.5 requires `pnpm --filter @context-forge/cli typecheck` to pass, and 3.6 requires the same for mcp. A junior will not know which statement to follow if 3.5's typecheck fails.

The tasks also never say whether cli and mcp resolve `@context-forge/core` from source or from `dist`. If they use `dist`, a stale build of core makes the 3.5 and 3.6 success checks measure the old signature. Do one of these:
- Add "run `pnpm --filter @context-forge/core build` first" to 3.5 and 3.6.
- State that the workspace resolves core from source.

Then make the section note consistent with the per-task success lines.

### [NOTE] 5.1 sends the implementer to git history for a file deleted three sections earlier

3.6 deletes `adoptionParity.test.ts`. 5.1 then says to reuse its checkout pattern "see git history" and gives no ref. Either add the retrieval command (for example `git show {2.3-commit}:packages/mcp-server/tests/integration/adoptionParity.test.ts`), or have 3.6 stop deleting the file. In that case 5.1 would delete it after copying the pattern.

Two related points about 5.1:
- After 4.5 nothing can spawn `sq`, so the marker assertion is a regression guard. It cannot fail today. That is fine and matches D5.
- The mutation check proves only the snapshot assertion, not the marker.

### [NOTE] Several section 4 tasks are small enough to merge

- 4.4 removes one union member. It is only reachable through the completion module deleted in 4.1.
- 4.6 is a comment-only edit.

Folding 4.4 into 4.1 and 4.6 into 4.2 would cut two tasks and two commits without losing a checkpoint. Section 3 also lists exact test-case names to delete, such as "puts Comprehension right after Slice Plan". That is more detail than the slice requires. "Delete the cases that assert Comprehension rendering" is enough.

### [NOTE] The `MIN_GUIDE_VERSION` criterion has no dedicated check

The criterion rests on existing assertions that 3.5 and 3.6 retain, plus a manual check in 6.3 "when it applies". If the deleted `adoptionParity.test.ts` or the trimmed `build.integration.test.ts` held the only end-to-end coverage, the criterion would be unguarded. Have 3.5 and 3.6 confirm at least one remaining assertion covers each surface: stderr for the CLI, a separate field for MCP.

### Run Digest

- Response length: 5166 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 96247 / 8843 / 87400 / 6534 / not computed
- Duration: 52.7 s
- Cost: $0.42 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 6
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 6
- Finding-shaped matches — surviving validation: 6

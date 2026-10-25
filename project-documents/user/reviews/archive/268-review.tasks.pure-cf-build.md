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
reviewedSha: 1e99600c9671389dcfbf24780b2fc98e14c2bd7b
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 96576
cachedTokens: 11222
cacheWriteTokens: 85350
completionTokens: 5273
durationSeconds: 46.2
costUsd: 0.395992
costBasis: provider
runId: run-20261025-p5-2a7d0b92
squadronVersion: 0.24.1
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success-criteria coverage is complete"
    location: "project-documents/user/tasks/268-tasks.pure-cf-build.md:48-205"
  - id: F002
    severity: concern
    category: sequencing
    summary: "6.1 \"guide-warning tests unchanged\" can conflict with 3.5/3.6 edits"
    location: "project-documents/user/tasks/268-tasks.pure-cf-build.md:194"
  - id: F003
    severity: note
    category: completeness
    summary: "Export cleanup in 4.2 and 4.4 relies on the compiler"
    location: "project-documents/user/tasks/268-tasks.pure-cf-build.md:149-168"
  - id: F004
    severity: note
    category: process
    summary: "Branch creation with an uncommitted modification to this task file"
    location: "project-documents/user/tasks/268-tasks.pure-cf-build.md:53"
  - id: F005
    severity: pass
    category: sequencing
    summary: "Sequencing, sizing and commit cadence are sound"
    location: "project-documents/user/tasks/268-tasks.pure-cf-build.md:82-170"
---

# Review: tasks — slice 268

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success-criteria coverage is complete

- **No read, write, detection or `sq` spawn:** tasks 3.3 and 3.6 remove the code, and 5.1 proves it with a snapshot check and a fake `sq` marker on every run.
- **Phase 0 returns the concept prompt whatever `adoption.state` holds:** 5.1 runs with no `.context-forge.toml` and with `in_progress`.
- **Byte identity:** section 2 captures the golden files before any edit. Checks 3.7 and 6.1 confirm they are unchanged.
- **CLI and MCP outputs match:** the 5.1 parity check.
- **`MIN_GUIDE_VERSION` warning:** 6.1 and 6.3.
- **`services/` imports nothing from `adoption/` or `detection/`:** the 3.3 and 6.2 greps.
- **No orphan exports:** the 6.2 export audit, which names the `history`, `comprehensionAnalysis` and `adoptionOutcome` exceptions.
- **Lint, typecheck and tests:** 3.7 and 6.1.

I found no scope creep. Each task maps to a Migration Plan row or to D5/D6.

### [CONCERN] 6.1 "guide-warning tests unchanged" can conflict with 3.5/3.6 edits

- Task 6.1 requires that `git diff {target} -- <file>` shows the two guide-warning cases were not edited. Those cases live in `cli/tests/commands/build.test.ts` and `mcp-server/tests/contextTools.test.ts`.
- Tasks 3.5 and 3.6 edit both files. 3.5 says to "update mocks or expectations to the one-argument call." If the guide-warning case shares a mock or `createContextPipeline` expectation, that case has to change, and 6.1 would then fail.
- The check should say: the case's assertions on the warning text and stream are unchanged. Edits to shared mock setup or call-arity expectations are allowed.
- Alternatively, 3.5 and 3.6 should state that edits must leave these two cases byte-for-byte untouched, and what to do if they can't.

### [NOTE] Export cleanup in 4.2 and 4.4 relies on the compiler

- Tasks 4.2 and 4.4 name `adoption/index.ts` and `detection/index.ts` only partly. `core/src/node.ts` also re-exports adoption and detection symbols.
- 4.4 does not mention `node.ts` at all. 4.2 touches `node.ts` only to change a comment, not to drop re-exports.
- The typecheck success criteria will catch a leftover re-export, so this is not a gap. Adding "drop re-exports of deleted symbols from `node.ts`" to 4.2 and 4.4 would save the implementer a failed typecheck.

### [NOTE] Branch creation with an uncommitted modification to this task file

- `git status` shows this task file as modified on `main`.
- Task 1.1 forks the slice branch from the target. The uncommitted review edits would then travel onto the slice branch and be committed with implementation work.
- Commit the planning edits to the target before task 1.1. This is a pre-implementation housekeeping step, not a defect in the breakdown.

### [PASS] Sequencing, sizing and commit cadence are sound

- **Golden capture first:** it runs before any source edit and is committed on its own (2.3).
- **Compile-coupled changes:** 3.3–3.6 commit together at 3.7, with the reason stated. The core-build step and the expected cross-package typecheck failures are called out.
- **Deletions:** each of 4.1–4.4 leaves the workspace compiling and commits on its own.
- **Purity test:** it follows the deletions and replaces the removed `adoptionParity` test. It includes a mutation check to prove it can fail.
- **Task 3.3:** it bundles integrator, factory and four test files. It is the densest task, but it is one coherent compile unit and shouldn't be split.
- **Proportionality:** one task file for an effort-2 slice is appropriate. The only mild overlap is the full build/lint/test pass in both 3.7 and 6.1. The 3.7 pass guards the large intermediate commit, so keep it.
- **Load tests:** the slice states no NFR, so neither a load test nor CI wiring is needed.

### Run Digest

- Response length: 4401 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 96576 / 11222 / 85350 / 5273 / not computed
- Duration: 46.2 s
- Cost: $0.40 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 5
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 5
- Finding-shaped matches — surviving validation: 5

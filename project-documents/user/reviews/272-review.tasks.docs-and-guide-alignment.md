---
docType: review
layer: project
reviewType: tasks
slice: docs-and-guide-alignment
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/272-tasks.docs-and-guide-alignment.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261026
dateUpdated: 20261026
reviewedSha: b99cc35c2164e8d2fc78cd76c51aa35ad2bc59d6
revision_number: 2
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 8
turns: 9
promptTokens: 265559
cachedTokens: 174803
cacheWriteTokens: 90748
completionTokens: 4436
durationSeconds: 40.9
costUsd: 0.42558
costBasis: provider
runId: run-20261026-p5-f0c76bb8
squadronVersion: 0.24.5
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success-criteria coverage is complete"
    location: "project-documents/user/tasks/272-tasks.docs-and-guide-alignment.md"
  - id: F002
    severity: pass
    category: sequencing
    summary: "Sequencing, dependencies and checkpoints are sound"
    location: "project-documents/user/tasks/272-tasks.docs-and-guide-alignment.md"
  - id: F003
    severity: pass
    category: accuracy
    summary: "Referenced files, package names and fixture lines exist as stated"
    location: "packages/core/tests/fixtures/brownfield-guide/project-documents/ai-project-guide/project-guides/prompt.ai-project.system.md:45"
  - id: F004
    severity: concern
    category: proportionality
    summary: "Task granularity is heavier than the slice needs"
    location: "project-documents/user/tasks/272-tasks.docs-and-guide-alignment.md:117-133"
  - id: F005
    severity: concern
    category: proportionality
    summary: "Some steps dictate implementation detail the slice does not require"
    location: "project-documents/user/tasks/272-tasks.docs-and-guide-alignment.md:97, 109-110, 190"
  - id: F006
    severity: concern
    category: clarity
    summary: "Task 2.1 repeats D3 content and sends an unverified checklist"
    location: "project-documents/user/tasks/272-tasks.docs-and-guide-alignment.md:64-70"
  - id: F007
    severity: note
    category: sequencing
    summary: "Task 11 reads the committed guide state without a documented rollback for 11.2–11.3"
    location: "project-documents/user/tasks/272-tasks.docs-and-guide-alignment.md:187-191, 203"
---

# Review: tasks — slice 272

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success-criteria coverage is complete

Each Functional, Technical and Integration requirement maps to a task:
- **Stale-text search and fixtures:** 3.1–3.3 and 9.1.
- **Reference rows and links:** 6.1, 7.1 and 8.1. Their success checks cover walkthrough step 2.
- **JSON examples matching the build:** 5.1–5.2.
- **Guide contents, delivered prompt and `MIN_GUIDE_VERSION`:** 11.1–11.3 (walkthrough steps 4–6).
- **Each D4 case:** 4.2.
- **`pureBuild.test.ts`:** 3.2.
- **Suite and golden tests:** 12.1.
- **Hand-offs:** 2.1 and 10.1.

Every task traces back to a criterion or decision, so I found no scope creep.

### [PASS] Sequencing, dependencies and checkpoints are sound

- The external-release dependency is isolated in task 11, with a `BLOCKED:` path.
- Task 12.1 is explicitly allowed to run when 11 is blocked.
- The commit hash from 5.2 feeds 10.1, and the prior version recorded in 11.1 feeds 11.3.
- The `cf prompt get` warning (task 4) lands before the contract document (task 5) that describes it.
- Commits fall at 3.3, 4.2, 5.2, 6.1, 7.1, 8.1, 9.1 (conditional), 11.3 and 12.1, so they are spread through the file.
- The merge and push rule is respected.
- I found no circular dependencies.

### [PASS] Referenced files, package names and fixture lines exist as stated

- Line 45 of all three fixture stubs contains "Use the Adoption Facts section below", as task 3.1 says.
- The filter names `@context-forge/core`, `@context-forge/cli` and `@context-forge/mcp` match the package manifests, and `packages/mcp-server` is the `mcp` package.
- `checkGuideMinimum` is imported from `@context-forge/core/node` in `packages/cli/src/commands/build.ts:2`.
- `prompt.adoption.test.ts`, `guideMinimum.test.ts`, `detectTools.ts`, `agentOnboardTool.ts` and `presentPaths.ts` all exist.

### [CONCERN] Task granularity is heavier than the slice needs

The breakdown has 12 task groups and 17 subtasks for a slice whose code change is a few lines plus one stderr warning. Cut or merge these:
- **5.1 and 5.2:** merge them. Capturing the two JSON outputs has no commit of its own and exists only to feed the document. It can be the first step of 5.2.
- **Task 1:** fold the branch setup into the first working task as its first step. The design's own sequence has no separate branch step.
- **Task 9:** keep the sweep, but present it as the closing step of 8.1 or 12.1. It is a single grep-and-triage with a conditional commit, and 12.1 already re-runs step 1.
- **Effort ratings:** the ratings add little because almost every item is 1–2.

### [CONCERN] Some steps dictate implementation detail the slice does not require

- **4.1 (line 97):** it prescribes where to put a shared `Warning: ` prefix constant ("for example in `output/` or `utils/guideReady.ts`"). The repo's single-definition rule already covers this, and the example paths invite the agent to create a new file for a one-line string.
- **4.2 (lines 109–110):** the contingency for "if case 5 does not behave as D4 describes" duplicates the existing "report differences" rule in the Context Summary.
- **11.1 (line 190):** the `git checkout -- … && git clean -fd …` undo recipe is more procedure than the step needs. "Revert the guide directory to its pre-update state" is enough.

Trim these to the outcome plus the rule they depend on.

### [CONCERN] Task 2.1 repeats D3 content and sends an unverified checklist

- **Redundant instructions:** 2.1 tells the agent to copy four named D3 parts, add an opening line, and add D3's verification list taken from a Success Criteria bullet. The verification list is already inside the "Functional Requirement" the step names, and the "Do not include any example version number" bullet restates the hallucination-trap rule already in project guidelines.
- **Vague reference:** the pointer to "the Functional Requirement that begins 'In the installed guide at the new minimum'" is fragile. Name the bullet and the grep terms once.
- **Fix:** simplify 2.1 to "send D3 in full plus the Success Criteria forbidden-string list, and ask for the release tag".

### [NOTE] Task 11 reads the committed guide state without a documented rollback for 11.2–11.3

- **Gap:** 11.1 says to leave 11.1–11.3 unchecked if the release lacks D3. It does not say what to do if 11.3's step 5 or 6 fails after 11.2 has already edited `MIN_GUIDE_VERSION`.
- **Why it matters:** the commit in 11.3 would not happen, but the raised constant would sit uncommitted.
- **Fix:** one clause, "do not commit; report the failure to the PM", would close it.

### Run Digest

- Response length: 5614 chars
- Response is newline-free: no
- Tool calls made: 8
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 9
- Tokens — prompt / cached / cache write / completion / reasoning: 265559 / 174803 / 90748 / 4436 / not computed
- Duration: 40.9 s
- Cost: $0.43 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7

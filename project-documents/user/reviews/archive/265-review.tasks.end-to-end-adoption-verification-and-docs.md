---
docType: review
layer: project
reviewType: tasks
slice: end-to-end-adoption-verification-and-docs
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/265-tasks.end-to-end-adoption-verification-and-docs.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261023
dateUpdated: 20261023
reviewedSha: 3d88efab9d99569a8788b93eeb21bc7f3c545471
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 96773
cachedTokens: 11222
cacheWriteTokens: 85547
completionTokens: 4688
durationSeconds: 39.0
costUsd: 0.390932
costBasis: provider
runId: run-20261024-p56-a717819c
squadronVersion: 0.23.7
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success criteria are traced to tasks"
    location: "project-documents/user/tasks/265-tasks.end-to-end-adoption-verification-and-docs.md:48-166"
  - id: F002
    severity: pass
    category: sequencing
    summary: "Sequencing and commit distribution"
    location: "project-documents/user/tasks/265-tasks.end-to-end-adoption-verification-and-docs.md:61-158"
  - id: F003
    severity: concern
    category: sequencing
    summary: "First-build Adoption Facts is never captured at the moment it exists"
    location: "project-documents/user/tasks/265-tasks.end-to-end-adoption-verification-and-docs.md:89-104"
  - id: F004
    severity: concern
    category: correctness
    summary: "Task 11 hardcodes `main` as the target"
    location: "project-documents/user/tasks/265-tasks.end-to-end-adoption-verification-and-docs.md:162"
  - id: F005
    severity: concern
    category: task-sizing
    summary: "Task 6 is overweight and should be split"
    location: "project-documents/user/tasks/265-tasks.end-to-end-adoption-verification-and-docs.md:108-119"
  - id: F006
    severity: concern
    category: sequencing
    summary: "Task 3 needs a fresh copy that Task 2 never creates"
    location: "project-documents/user/tasks/265-tasks.end-to-end-adoption-verification-and-docs.md:66-75"
  - id: F007
    severity: note
    category: task-sizing
    summary: "Task 4 is a procedure, not a completable unit"
    location: "project-documents/user/tasks/265-tasks.end-to-end-adoption-verification-and-docs.md:79-85"
  - id: F008
    severity: note
    category: clarity
    summary: "Vague references the implementer must resolve"
    location: "project-documents/user/tasks/265-tasks.end-to-end-adoption-verification-and-docs.md:56,130"
  - id: F009
    severity: note
    category: proportionality
    summary: "Proportionality"
    location: "project-documents/user/tasks/265-tasks.end-to-end-adoption-verification-and-docs.md:48-166"
---

# Review: tasks — slice 265

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success criteria are traced to tasks

- **Greenfield run:** Tasks 2-3.
- **CF-only and squadron runs, including the D4 checks and source counts:** Tasks 5, 5R, 6 and 6R.
- **Every defect has a disposition, and each fix has a failing-first test:** Task 4.
- **Build, lint, typecheck and tests, plus this repo's `cf build` and `cf next --json` unchanged:** Tasks 0 and 11.
- **Report with frontmatter validation:** Tasks 1, 5R, 6R and 10.
- **Docs, one home per fact:** Tasks 7-9.

Nothing is scope creep. The slice states no NFR, so no load test or CI-gating task is required.

### [PASS] Sequencing and commit distribution

- Each run is followed by its recording task, and each recording task commits.
- The three doc tasks each commit separately, and the report is finalized before the full validation in Task 11.
- Commits are spread through the file, not batched at the end.
- No circular dependencies. Tasks 3, 5 and 6 point forward to Task 4's procedure, which is acceptable for a reusable procedure.

### [CONCERN] First-build Adoption Facts is never captured at the moment it exists

- Task 5R copies "the first build's Adoption Facts section verbatim" into the report. This happens after the whole session, when `adoption.state` is already `in_progress` or `complete`. Any later `cfl build` shows different facts.
- Task 5 has no step to save the first build's output. The agent runs that build inside the session, and the second terminal only runs `next`, `config get` and `check`.
- As written, Task 5R can't be done faithfully. Task 7's README example output also depends on that verbatim excerpt.
- Add a Task 5 step to capture the first build's Adoption Facts, for example by running `cfl build` in the second terminal before the session's first build. Alternatively, save the agent's build output to a file. Then have Task 5R copy from that file.

### [CONCERN] Task 11 hardcodes `main` as the target

- The step says "If `git diff main --stat -- packages` is empty (no code fixes were made)". Task 0 correctly reads `cf config get git.integration_branch` to find the target. When an integration branch is configured, diffing against `main` would include unrelated work and give a wrong answer.
- Use the target determined in Task 0 instead of the literal `main`.

### [CONCERN] Task 6 is overweight and should be split

- Task 6 combines these in one task:
  - Repository selection and a probe prerequisite check.
  - A live session.
  - The D4 checks and the source count.
  - Squadron-specific checks and the monorepo check.
  - A separate MCP-over-stdio procedure with two environments and an Inspector CLI.
  - The defect loop.
- The MCP PATH check is a self-contained procedure. It could run after the session ends, so a failure there needn't block the rest.
- Split it into its own task, "Task 6M: MCP PATH check", placed between Tasks 6 and 6R.
- The Inspector command line is more implementation detail than the slice requires. D4 only asks for `context_build` from an MCP client under two PATH conditions. Keep the check and its pass condition, and let the implementer confirm the flags.

### [CONCERN] Task 3 needs a fresh copy that Task 2 never creates

- Task 3 starts Claude Code "in a fresh copy of the scaffold" for `/cf:onboard`. Task 2 creates and registers only one directory.
- The copy is never created. Because `/cf:onboard` runs `cf init` itself, the copy will also register a project. Neither Task 3 nor Task 10 unregisters it. Task 3's `cf project rm` covers only the Task 2 project, and Task 10 only checks that the project list is clean.
- Add a Task 2 step to make the second copy, and a Task 3 step to unregister it.

### [NOTE] Task 4 is a procedure, not a completable unit

- The checklist item is conditional ("if none, mark done with 'no defects found'"). It is sequenced after the first task that references it, and it has no commit of its own.
- It works, and it keeps the loop in one place (DRY).
- One adjustment would help: state that it is checked off only after Task 6 (or the last run), so a checker doesn't tick it early.

### [NOTE] Vague references the implementer must resolve

- **Guide version (line 56):** "`cf guides` / the installed guide's version file" doesn't name the command output or file to read. Name the exact source before the run.
- **Task 7's blocked case (line 130):** it says the task "is finished after the CF-only run" but also "uses prose only". Say plainly that a blocked Task 5 yields a README section with no example output, and that Task 7 stays unchecked until the excerpt exists or the PM accepts the prose-only form.

### [NOTE] Proportionality

- The file has 13 tasks in a single file. That is reasonable for a slice whose work is mostly run time and documentation.
- Tasks 10 (effort 1) and 11 could merge if the PM wants fewer tasks. I'd keep them separate, because each has a distinct commit.
- There are no excess test tasks, and tests appear only inside Task 4's defect loop.

### Run Digest

- Response length: 6443 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 96773 / 11222 / 85547 / 4688 / not computed
- Duration: 39.0 s
- Cost: $0.39 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 9
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 9
- Finding-shaped matches — surviving validation: 9

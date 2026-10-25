---
docType: review
layer: project
reviewType: tasks
slice: docs-and-adr-mapping
conventionsSource: AGENTS.md
projectRules: []
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/tasks/267-tasks.docs-and-adr-mapping.md
aiModel: claude-sonnet-5-5
aiProfile: sdk
status: complete
dateCreated: 20261024
dateUpdated: 20261024
reviewedSha: d1dae85b3397eeaa9ab2b8784bd0f4d0422086a2
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 2
turns: 3
promptTokens: 98568
cachedTokens: 8843
cacheWriteTokens: 89721
completionTokens: 4025
durationSeconds: 33.6
costUsd: 0.400759
costBasis: provider
runId: run-20261025-p5-9001d5c4
squadronVersion: 0.23.7
findings:
  - id: F001
    severity: concern
    category: test-coverage
    summary: "\"Read error leaves the existing map unchanged\" is not tested end to end"
    location: "project-documents/user/tasks/267-tasks.docs-and-adr-mapping.md:93-95"
  - id: F002
    severity: concern
    category: task-sizing
    summary: "Task 4.2 bundles too many responsibilities"
    location: "project-documents/user/tasks/267-tasks.docs-and-adr-mapping.md:130-138"
  - id: F003
    severity: concern
    category: conventions
    summary: "Misleading commit message in Task 6.1"
    location: "project-documents/user/tasks/267-tasks.docs-and-adr-mapping.md:185"
  - id: F004
    severity: note
    category: scope
    summary: "Task 1.2 is mostly verification of already-true state"
    location: "project-documents/user/tasks/267-tasks.docs-and-adr-mapping.md:51-57"
  - id: F005
    severity: note
    category: proportionality
    summary: "Redundant re-export of `DocsMapError` from `docsMapFile.ts`"
    location: "project-documents/user/tasks/267-tasks.docs-and-adr-mapping.md:65"
  - id: F006
    severity: pass
    category: coverage
    summary: "Success criteria trace to tasks"
    location: "project-documents/user/tasks/267-tasks.docs-and-adr-mapping.md:42-210"
  - id: F007
    severity: pass
    category: sequencing
    summary: "Sequencing and commit cadence"
    location: "project-documents/user/tasks/267-tasks.docs-and-adr-mapping.md:44-210"
---

# Review: tasks — slice 267

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] "Read error leaves the existing map unchanged" is not tested end to end

The functional criterion says a broken or missing block *and* a non-ENOENT read error each fail with a named `DocsMapError` and leave the existing map unchanged.

- **Broken or missing block:** 4.3 (line 145) asserts the file is byte-identical afterwards.
- **Unreadable candidate doc:** 2.4 (lines 93, 95) only checks that `discoverMappedDocs` throws.
- **Writer-level case:** nothing runs `writeDocsMap` against an existing map while a candidate doc is unreadable and then asserts the map bytes are unchanged.
- **Unreadable map file:** 4.2 (line 136) handles a non-ENOENT failure reading the map itself. 4.3 has no case for it. Only write failure is tested (line 148).

Add one 4.3 case for "existing map plus unreadable doc, map byte-identical" and one for an unreadable map file.

### [CONCERN] Task 4.2 bundles too many responsibilities

4.2 covers all of the following in one task:
- The create path: new-file template, frontmatter, directory creation.
- The update path: latin1 read, line splitting that keeps each line's ending, locator error mapping.
- The splice: UTF-8 to latin1 conversion and line-ending reuse.
- The unchanged/changed write decision and error wrapping.
- `index.ts` and the `node.ts` export.

The effort is rated 3 but this is the most intricate task in the slice. For a junior AI, split it into two tasks:
- **4.2a:** create path plus the unchanged check.
- **4.2b:** update/splice path, with the `index.ts` and `node.ts` wiring in a third small step or in 4.2b's last item.

The 4.3 test list already separates these concerns, so the split mirrors it.

### [CONCERN] Misleading commit message in Task 6.1

`test: fix cf check tolerance of out-of-tree links` implies a behavior fix. D6 says tolerance already holds and no rule is added, so this commit only adds a regression test. Use `test: add out-of-tree link regression for cf check`. The `fix:` wording also risks tripping the project's fix-vs-slice rules.

### [NOTE] Task 1.2 is mostly verification of already-true state

The task itself says the three lists are already `export const` and that no code change is expected. The only real change is two comment edits, committed as a standalone `docs:` commit. That commit type is meant for user documents, not source comments.

Keep the verification (the `grep` for `detection/index.ts` guards the package-export boundary). Fold the comment edits into 2.2, or commit them as `refactor:` or `chore:`, and drop the separate commit.

### [NOTE] Redundant re-export of `DocsMapError` from `docsMapFile.ts`

2.1 creates `docsMapError.ts` to avoid an import cycle, then also re-exports the error from `docsMapFile.ts` "because the design places it there". `index.ts` (4.2) already exports it publicly, and no consumer needs the second path. Drop the re-export and note the file-layout deviation from the design instead.

### [PASS] Success criteria trace to tasks

Criterion-to-task mapping:
- **Create map with titles and ADR de-duplication:** 2.2–2.4, 3.1–3.2, 4.2–4.3.
- **`unchanged`, mtime, `updated`, bytes outside the block preserved:** 4.3.
- **Originals not modified (hashing):** 5.2.
- **Broken or missing block (each locator state):** 4.3.
- **Monorepo subdirectory:** 5.2.
- **`cf check` zero findings, `ProjectModel` exclusion, 261 outcome unchanged:** 6.1.
- **261 tests unchanged, lists not package-exported, `ideInstall` untouched:** 1.2, 4.1, 5.2, 8.1.
- **README entry:** 7.1.
- **Verification Walkthrough:** 8.2.

The single gap is the unreadable-doc case in the first finding. Every task traces to a criterion or to the Development Approach. No load-test task is needed because the slice states no NFR.

### [PASS] Sequencing and commit cadence

- **Dependencies:** they run in order and are acyclic: lists, then discovery and titles, then render, then writer, then CLI, then regression fixture, then docs, then final verification.
- **Test-with pattern:** each implementation group is followed immediately by its tests (2.4, 3.2, 4.3, 5.2).
- **Commits:** there is one commit per group, spread across the file rather than batched at the end.
- **Merge or push:** none appears, per the project rule.

### Run Digest

- Response length: 5155 chars
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
- Tokens — prompt / cached / cache write / completion / reasoning: 98568 / 8843 / 89721 / 4025 / not computed
- Duration: 33.6 s
- Cost: $0.40 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7

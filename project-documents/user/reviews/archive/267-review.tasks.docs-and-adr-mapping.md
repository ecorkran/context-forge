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
reviewedSha: 606df18491c5346b9d2f2ce67d192aaeba4753c7
revision_number: 1
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 4
turns: 5
promptTokens: 181717
cachedTokens: 91631
cacheWriteTokens: 90080
completionTokens: 4628
durationSeconds: 38.2
costUsd: 0.416507
costBasis: provider
runId: run-20261025-p5-9001d5c4
squadronVersion: 0.23.7
findings:
  - id: F001
    severity: pass
    category: coverage
    summary: "Success-criteria coverage is complete"
    location: "project-documents/user/tasks/267-tasks.docs-and-adr-mapping.md"
  - id: F002
    severity: concern
    category: clarity
    summary: "`renderManagedBlock` takes a `root` parameter that nothing in the task uses"
    location: "project-documents/user/tasks/267-tasks.docs-and-adr-mapping.md:98-103"
  - id: F003
    severity: concern
    category: correctness
    summary: "Encoding of a newly created map file is unspecified"
    location: "project-documents/user/tasks/267-tasks.docs-and-adr-mapping.md:127"
  - id: F004
    severity: concern
    category: sequencing
    summary: "Tasks 4.2 and 4.3 build one function with no test between them"
    location: "project-documents/user/tasks/267-tasks.docs-and-adr-mapping.md:124-136"
  - id: F005
    severity: note
    category: clarity
    summary: "Task 2.2's success line is muddled"
    location: "project-documents/user/tasks/267-tasks.docs-and-adr-mapping.md:70"
  - id: F006
    severity: note
    category: proportionality
    summary: "Proportionality is acceptable"
    location: "project-documents/user/tasks/267-tasks.docs-and-adr-mapping.md"
  - id: F007
    severity: note
    category: verification
    summary: "Referenced commands and helpers exist"
    location: "package.json:10-11"
---

# Review: tasks — slice 267

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [PASS] Success-criteria coverage is complete

Each success criterion from the slice design maps to a task.
- **Create, update and unchanged behaviour:** 4.4 and 5.2.
- **Originals not modified (hash check):** 5.2.
- **Broken block and non-ENOENT read error leave the map unchanged:** 2.4 and 4.4.
- **Monorepo subdirectory project:** 5.2.
- **`cf check` reports nothing for out-of-tree links, 261 outcome unchanged, map absent from `ProjectModel`:** 6.1.
- **No change under `ideInstall/`:** the explicit checks in 4.1, 4.3, 5.2 and 8.1.
- **README entry:** 7.1.
- **Workspace lint, typecheck and tests, and the Verification Walkthrough:** 8.1 and 8.2.

The "export 261's lists inside core" step needs no task. The task file's `projectState` says the lists are already `export const` and not re-exported, so the `pnpm test` run in 8.1 covers that integration requirement. No task is untraceable to the design. The only addition is `docsMapError.ts`, which 2.1 justifies as a way to avoid an import cycle.

### [CONCERN] `renderManagedBlock` takes a `root` parameter that nothing in the task uses

Task 3.1 keeps the design's signature `renderManagedBlock(docs, mapDir, root)`. It also says the function is pure and computes relativity "from the map's directory relative to `root`". Task 4.2 passes `mapDir = DOCS_MAP_DIR`, which is already root-relative, and test 3.2 uses a root-relative map directory. As written, `root` has no use, and the instruction leaves it unclear whether `mapDir` is absolute or root-relative. A junior will have to guess. Either state that `mapDir` is root-relative and drop `root`, or state what `root` is for.

### [CONCERN] Encoding of a newly created map file is unspecified

Task 4.3 spells out the latin1 round trip for an existing map. Task 4.2, the create path, says nothing about the write encoding. Using latin1 there would corrupt non-ASCII titles, because the rendered block is a UTF-8 string. The create tests in 4.4 do not use a non-ASCII title either. Add a line to 4.2 saying the new file is written as UTF-8, and add a non-ASCII title to the create test in 4.4.

### [CONCERN] Tasks 4.2 and 4.3 build one function with no test between them

`writeDocsMap` is split into a create path (4.2) and an update path (4.3). Neither has a test until 4.4. Tasks 2.1, 2.2 and 2.3 form a similar three-task run before 2.4. Task 2.1 is also tiny, containing only types, an error class and one constant, and could merge into 2.2. Consider merging 4.2 and 4.3 into one task and 2.1 into 2.2. If the split stays, add a brief interim check, such as a create-only smoke test in 4.2.

### [NOTE] Task 2.2's success line is muddled

The line reads "returns entries without titles filled … or with titles once 2.3 lands". That does not describe a verifiable end state for 2.2, because `MappedDoc.title` is non-optional. Say instead that 2.2 produces the path and kind list, and that 2.3 completes `MappedDoc`.

### [NOTE] Proportionality is acceptable

There are eight task groups in one file, matching the design's component list. The test cases track the design's Technical Requirements list. Some steps prescribe low-level detail, such as `lstat`/`Dirent`, the latin1 `Buffer` conversion and the `%20` encoding. Each of these follows a design decision (D2, D3 or D4), so I would not cut them. No load-test or CI task is needed, because the slice states no NFR.

### [NOTE] Referenced commands and helpers exist

`pnpm lint` and `pnpm typecheck` exist at the root. Both `@context-forge/core` and `@context-forge/cli` define `typecheck` scripts, so the `pnpm --filter @context-forge/core typecheck` call in 2.1 is valid. `resolvePathedProject` exists in `packages/cli/src/utils/project.ts`, which is the helper Task 5.1 points to for the error wording.

### Run Digest

- Response length: 4707 chars
- Response is newline-free: no
- Tool calls made: 4
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: 5
- Tokens — prompt / cached / cache write / completion / reasoning: 181717 / 91631 / 90080 / 4628 / not computed
- Duration: 38.2 s
- Cost: $0.42 (provider)
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 7
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 7
- Finding-shaped matches — surviving validation: 7

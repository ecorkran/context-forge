---
docType: review
layer: project
reviewType: tasks
slice: config-key-scope-classification-shared-vs-personal
project: squadron
verdict: CONCERNS
sourceDocument: project-documents/user/tasks/915-tasks.config-key-scope-classification-shared-vs-personal.md
aiModel: z-ai/glm-5.1
status: complete
dateCreated: 20260713
dateUpdated: 20260713
findings:
  - id: F001
    severity: concern
    category: coverage-gap
    summary: "Missing `list()` implementation task — slice Technical Scope explicitly requires it"
    location: packages/core/src/config/ConfigManager.ts
  - id: F002
    severity: pass
    category: coverage
    summary: "All six functional success criteria map to specific tasks with tests"
    location: unverified
  - id: F003
    severity: pass
    category: test-sequencing
    summary: "Test-with pattern is consistently followed"
    location: unverified
  - id: F004
    severity: pass
    category: commit-cadence
    summary: "Commit checkpoints are distributed throughout, not batched at the end"
    location: unverified
  - id: F005
    severity: pass
    category: sequencing
    summary: "Task sequencing respects dependencies with no circular paths"
    location: unverified
  - id: F006
    severity: pass
    category: alignment
    summary: "Collision semantics in migrate-personal match the slice design exactly"
    location: packages/cli/src/commands/config.ts
  - id: F007
    severity: note
    category: documentation
    summary: "Key count discrepancy between projectState and task enumeration"
    location: unverified
---

# Review: tasks — slice 915

**Verdict:** CONCERNS
**Model:** z-ai/glm-5.1

## Findings

### [CONCERN] Missing `list()` implementation task — slice Technical Scope explicitly requires it

The slice design's Technical Scope states: *"Update `ConfigManager.get/set/delete/list` to route project-scoped reads/writes to the correct file automatically."* Tasks 4.1 and 4.2 cover `get()`, `set()`, and `delete()` routing, but no task addresses updating `list()`. Task 4.3 includes a test asserting `list()` returns the correct `source`, but the implementation that would make that test pass is never tasked. If `list()` reads project config files directly (rather than delegating to `get()` per key), it needs its own routing logic to read from both `.context-forge.local.toml` and `.context-forge.toml`, merge results with correct precedence, and return the appropriate `source` tag (`'project-personal'` vs `'project'`). Without an explicit implementation task, a junior AI would have no guidance on what code to write for `list()` — only a test that would fail. Either Task 4.1 or 4.2 should be expanded to include `list()` routing, or a new task should be inserted between 4.2 and 4.3.

### [PASS] All six functional success criteria map to specific tasks with tests

Each functional requirement from the slice design traces directly: FR1/FR2 (personal vs shared write routing) → Tasks 4.2 + 4.3; FR3 (get resolves from all sources) → Tasks 4.1 + 4.3; FR4 (cf init gitignores) → Tasks 7.1 + 7.2; FR5 (cf check warning) → Tasks 5.1 + 5.2; FR6 (migrate-personal + subsequent check clean) → Tasks 6.1 + 6.2. No functional success criterion is left uncovered.

### [PASS] Test-with pattern is consistently followed

Every implementation task is immediately followed by its corresponding test task: 2.1→2.2, 3.1→3.2, 4.1+4.2→4.3, 5.1→5.2, 6.1→6.2, 7.1→7.2, 8.1→8.2. No test is decoupled from its implementation or deferred to a later section.

### [PASS] Commit checkpoints are distributed throughout, not batched at the end

Commits occur at Tasks 4.4, 5.3, 6.3, 7.3, and 8.3 — five checkpoints spread across the body of work, each following a logical chunk of functionality (registry+routing, ConsistencyChecker, migrate-personal, gitignore, MCP). No commit is deferred past the point where a coherent, test-green increment exists.

### [PASS] Task sequencing respects dependencies with no circular paths

The dependency chain is acyclic: Task 2 (scope field) and Task 3 (path helper) are independent prerequisites for Task 4 (ConfigManager routing). Task 5 (ConsistencyChecker) depends on the scope field from Task 2. Task 6 (migrate-personal) depends on ConfigManager routing from Task 4. Task 7 (gitignore) is independent of 2–6. Task 8 (MCP) depends on Task 3's path helper and Task 4's ConfigResult.source update. Task 9 (verification) depends on all prior tasks. No circular dependencies exist.

### [PASS] Collision semantics in migrate-personal match the slice design exactly

Task 6.1 specifies three collision cases (absent from personal → move; identical value → delete shared only; different value → skip and report) with the exact same semantics as the slice design's Migration Plan collision-semantics paragraph, including the write-personal-then-delete-shared ordering and per-key error isolation. No drift between design and implementation task.

### [NOTE] Key count discrepancy between projectState and task enumeration

The projectState frontmatter says "all 11 existing keys are undifferentiated," but Task 2.1 enumerates 13 shared keys + 1 personal key = 14 total. The slice design's classification table also lists 14 entries (using `workflow.review_gates.*.threshold` as shorthand for the four gate-specific keys). This is likely a stale count in the projectState rather than a task error — and since `scope` is a required field with no default, the compiler will catch any missing entry regardless. Not actionable for the task breakdown, but worth noting for document consistency.

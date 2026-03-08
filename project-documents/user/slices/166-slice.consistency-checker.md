---
docType: slice
dateCreated: 20260307
dateUpdated: 20260307
status: in-progress
project: context-forge
parent: 160-arch.project-workflow-system
slice: 166-slice.consistency-checker
dependencies: [163-slice.artifact-introspection-engine]
---

# Slice 166: Consistency Checker

## Overview

A detection-and-fix service that compares related artifact states within a project and flags mismatches. For example: a task file with all items complete but the slice still unchecked in the slice plan, or a slice frontmatter status field that doesn't match the computed state.

The introspection engine (slice 163) already provides all the read-side parsing. This slice adds the comparison logic and optional write-back corrections.

## Value

Catches drift between what happened and what got recorded. Reduces the "wait, is this actually done?" uncertainty that accumulates over a project's lifetime. Low effort since it's a thin consumer of introspection.

## Technical Scope

### Core: `ConsistencyChecker` class (`packages/core/src/introspection/ConsistencyChecker.ts`)

New class that consumes `IArtifactIntrospector` and implements the detection rules. Lives alongside `WorkflowNavigator` and `FutureWorkCollector` in the introspection module.

**Constructor:** Takes an `IArtifactIntrospector` instance (dependency injection, matching `WorkflowNavigator` pattern).

**Primary method:** `check(project: ProjectData): Promise<ConsistencyCheckResult>`

Runs all detection rules against a single project. Returns structured findings.

**Fix method:** `fix(project: ProjectData): Promise<ConsistencyFixResult>`

Runs `check()` first, then applies non-destructive corrections to any fixable findings.

### Detection Rules

Each rule compares two related artifact states and produces zero or more `ConsistencyFinding` objects.

**Rule 1: Task completion vs. slice plan checkbox**
- Parse task file → get `inferredStatus`
- Parse slice plan → find entry by slice index → get `isChecked`
- Mismatch: tasks complete but slice unchecked (warning), or slice checked but tasks incomplete (error)

**Rule 2: Slice frontmatter status vs. computed state**
- Parse slice design frontmatter → get `status` field
- Compute expected status from task completion and slice plan state
- Mismatch: frontmatter says "complete" but tasks are incomplete (error), frontmatter says "in-progress" but all tasks are done (warning)

**Rule 3: Task file exists but slice plan entry missing**
- If a task file exists for the active slice index but no slice plan entry references that index → info-level finding
- Inverse: slice plan entry exists but no task file → info-level finding (expected during early phases)

**Rule 4: Slice plan checkbox vs. slice frontmatter status**
- Slice plan entry checked but frontmatter status is not "complete" → warning
- Frontmatter status is "complete" but slice plan entry unchecked → warning

### Fix Capabilities

Each finding has a `fixable: boolean` property and, if fixable, a `fixAction` descriptor.

**Fixable actions:**
- Update a markdown checkbox in a slice plan (`[ ]` → `[x]` or `[x]` → `[ ]`)
- Update a YAML frontmatter `status` field in a slice design file

**Not fixable (info only):**
- Missing artifacts (won't create files)
- Ambiguous state (multiple task files with conflicting status)

**Write-back implementation:** A separate `MarkdownWriter` utility handles the file modifications:
- `updateCheckbox(filePath, lineIndex, checked: boolean)` — reads file, modifies the specific line, writes back
- `updateFrontmatterField(filePath, key, value)` — reads file, finds the frontmatter key, replaces the value, writes back

Both operations are line-level replacements — they read the full file, modify the target line, and write the full file back. No partial writes or streaming.

### Types (`packages/core/src/introspection/types.ts`)

```typescript
type ConsistencySeverity = 'info' | 'warning' | 'error';

interface ConsistencyFinding {
  rule: string;           // e.g., 'task-vs-plan', 'frontmatter-vs-computed'
  severity: ConsistencySeverity;
  location: string;       // file path where the mismatch was found
  description: string;    // human-readable description
  suggestedFix: string;   // human-readable fix instruction
  fixable: boolean;       // whether auto-fix can correct this
  fixAction?: {           // machine-readable fix descriptor
    type: 'update-checkbox' | 'update-frontmatter';
    filePath: string;
    detail: Record<string, unknown>;
  };
}

interface ConsistencyCheckResult {
  projectPath: string;
  findings: ConsistencyFinding[];
  totalFindings: number;
  errors: number;
  warnings: number;
  infos: number;
  summary: string;        // e.g., "3 findings: 1 error, 2 warnings"
}

interface ConsistencyFixResult extends ConsistencyCheckResult {
  fixed: number;          // count of successfully applied fixes
  fixErrors: string[];    // any fix operations that failed
}
```

### MCP Tool: `workflow_check` (`packages/mcp-server/src/tools/workflowTools.ts`)

Register alongside existing workflow tools.

```
Tool: workflow_check
Input:
  projectId?: string    — omit to use default_project
  fix?: boolean         — apply non-destructive corrections (default: false)
Output: ConsistencyCheckResult or ConsistencyFixResult (JSON)
Annotations: readOnlyHint: false (since fix can write), openWorldHint: false
```

When `fix` is not set, check `workflow.auto_fix` config key. If true, behave as if `fix: true`.

### CLI Command: `cf check` (`packages/cli/src/commands/check.ts`)

Already stubbed. Replace the placeholder with real implementation.

```
cf check [--fix] [--json] [--project <id>]
```

**Terminal output (non-JSON):**
```
Consistency Check: my-project
  ⚠ Task file 165-tasks complete (12/12) but slice unchecked in plan
    → Fix: check the slice plan entry for (165) in 160-slices.project-workflow-system.md
  ✓ No frontmatter mismatches
  ℹ Slice plan entry (168) has no task file yet

3 findings: 0 errors, 1 warning, 1 info
```

With `--fix`:
```
Consistency Check: my-project (fix mode)
  ⚠ Task file 165-tasks complete (12/12) but slice unchecked in plan
    → Fixed: checked entry (165) in 160-slices.project-workflow-system.md
  ℹ Slice plan entry (168) has no task file yet (not fixable)

Fixed 1 of 2 findings
```

### Config Key: `workflow.auto_fix`

Add to `CONFIG_KEYS` in `packages/core/src/config/ConfigKeys.ts`:

```typescript
'workflow.auto_fix': {
  type: 'boolean',
  default: false,
  description: 'Automatically apply non-destructive corrections when running consistency checks',
}
```

## Dependencies

- **Slice 163 (Artifact Introspection Engine)** — provides `IArtifactIntrospector`, all parsers, `DocumentDetectionResult`, types. Already complete.
- **Config system** — for `workflow.auto_fix` key. Already exists.
- **`resolveArtifactPath`** — for resolving stems to file paths. Already exists.

No new external dependencies required.

## Architecture

### Data Flow

```
ProjectData
  │
  ├─→ ArtifactIntrospector.parseSlicePlan()  ─→ SlicePlanResult
  ├─→ ArtifactIntrospector.parseTaskFile()   ─→ TaskFileResult
  ├─→ ArtifactIntrospector.parseFrontmatter() ─→ FrontmatterResult
  ├─→ ArtifactIntrospector.detectDocuments()  ─→ DocumentDetectionResult
  │
  └─→ ConsistencyChecker.check()
        ├─→ runs detection rules against parsed data
        ├─→ collects ConsistencyFinding[]
        └─→ returns ConsistencyCheckResult

ConsistencyChecker.fix()
  ├─→ check() first
  ├─→ filter fixable findings
  ├─→ MarkdownWriter.updateCheckbox() / .updateFrontmatterField()
  └─→ returns ConsistencyFixResult
```

### Component Placement

| Component | Package | Path |
|-----------|---------|------|
| `ConsistencyChecker` | core | `src/introspection/ConsistencyChecker.ts` |
| `MarkdownWriter` | core | `src/introspection/writers/markdownWriter.ts` |
| Types | core | `src/introspection/types.ts` (extend existing) |
| MCP tool | mcp-server | `src/tools/workflowTools.ts` (add to existing) |
| CLI command | cli | `src/commands/check.ts` (replace stub) |
| Config key | core | `src/config/ConfigKeys.ts` (add entry) |

### Exports

Add to `packages/core/src/introspection/index.ts`:
- `ConsistencyChecker`

Add to `packages/core/src/node.ts`:
- Re-export `ConsistencyChecker`

## Implementation Notes

- `ConsistencyChecker` takes `IArtifactIntrospector` in constructor (same pattern as `WorkflowNavigator`). This enables test mocking.
- Detection rules should be individual private methods for readability and testability. Each returns `ConsistencyFinding[]`.
- `MarkdownWriter` is separated from `ConsistencyChecker` to keep concerns clean (detection vs. mutation).
- The frontmatter parser currently returns flat `Record<string, string>`. The `status` field comparison should normalize case (`Complete` → `complete`).
- `check()` should gracefully handle missing artifacts — a missing task file is itself a finding, not a crash.
- The `check()` method operates on a single project. The MCP and CLI layers handle project resolution (same pattern as existing workflow tools).
- All file writes use atomic read-modify-write (read full file → modify target line → write full file). No streaming or partial writes.

## Success Criteria

- [ ] Detects task-vs-plan mismatch (tasks complete but slice unchecked, and vice versa)
- [ ] Detects frontmatter-vs-computed status mismatch
- [ ] Detects missing artifacts (task file without plan entry, plan entry without task file)
- [ ] Detects plan-checkbox-vs-frontmatter inconsistency
- [ ] Returns structured `ConsistencyCheckResult` with severity, location, description, and suggested fix
- [ ] `fix` mode correctly updates markdown checkboxes in slice plan files
- [ ] `fix` mode correctly updates YAML frontmatter `status` field
- [ ] Does not modify files unless `--fix` flag or `workflow.auto_fix` config is set
- [ ] Handles missing artifacts gracefully (finding, not crash)
- [ ] MCP `workflow_check` tool registered and functional
- [ ] CLI `cf check` replaces stub with real output
- [ ] Config key `workflow.auto_fix` registered
- [ ] Unit tests for each detection rule
- [ ] Unit tests for `MarkdownWriter` operations
- [ ] Integration test for full check → fix cycle

## Effort

2/5 — Thin consumer of existing introspection infrastructure. Detection rules are straightforward comparisons. Write-back is the only novel part and is limited to line-level text replacement.

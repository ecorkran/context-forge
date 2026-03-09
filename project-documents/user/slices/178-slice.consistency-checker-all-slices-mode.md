---
docType: slice
dateCreated: 20260309
dateUpdated: 20260309
status: not_started
project: context-forge
parent: 160-arch.project-workflow-system
slice: 178-slice.consistency-checker-all-slices-mode
dependencies: [166-slice.consistency-checker]
---

# Slice 178: Consistency Checker — All-Slices Mode

## Overview

The current `ConsistencyChecker` only inspects the active slice (`project.fileSlice`), requiring manual slice switching to scan the whole project. This slice extends the checker to iterate across all entries in the slice plan, adds three new detection rules, and introduces a fix log for observability and safety.

## Value

- `cf check` and `workflow_check` report the full project picture without requiring slice switching
- New rules catch structural issues (duplicate indices, stale aggregate status) that single-slice mode can't detect
- Fix log provides audit trail and safety when applying corrections across many files

## Technical Scope

### 1. New method: `checkAll(project)` on `ConsistencyChecker`

**Location:** `packages/core/src/introspection/ConsistencyChecker.ts`

Add a new public method alongside existing `check()` and `fix()`:

```ts
async checkAll(project: ProjectData): Promise<ConsistencyCheckResult>
```

**Behavior:**
1. Parse the slice plan via `safeParseSlicePlan(project, projectPath)`
2. For each entry with a materialized index, call `detectDocuments(projectPath, entry.index)` to find its artifacts
3. Run the existing 5 rules against each slice (reusing the private rule methods)
4. Run the 3 new aggregate rules (see below)
5. Aggregate all findings into a single `ConsistencyCheckResult`

The existing `check(project)` method remains unchanged — it continues to check only the active slice. This preserves backward compatibility and provides a `--slice` narrowing option.

**Finding attribution:** Each `ConsistencyFinding` already has `rule` and `location`. For all-slices mode, prefix `description` with the slice index so findings are attributable: e.g., `"[175] Tasks complete but slice unchecked in plan"`.

### 2. New method: `fixAll(project)` on `ConsistencyChecker`

```ts
async fixAll(project: ProjectData): Promise<ConsistencyFixResult>
```

Calls `checkAll()` then applies fixes — same pattern as existing `fix()`. Returns the full `ConsistencyFixResult` with `fixLog` entries.

### 3. New detection rules

#### Rule 6: Duplicate slice index detection

**Rule name:** `duplicate-index`
**Severity:** error
**Location:** slice plan file path

Scan all entries in the parsed slice plan for duplicate `index` values. Two entries with the same parenthesized index (e.g., both claiming `(168)`) is always an error.

```
description: "Duplicate slice index 168: 'Foo' and 'Bar'"
suggestedFix: "Renumber one of the entries"
fixable: false
```

#### Rule 7: Slice plan status vs. all-entries-complete

**Rule name:** `plan-status-vs-entries`
**Severity:** warning
**Location:** slice plan file path

Parse frontmatter of the slice plan file. If `status: complete` but some entries are unchecked, or if `status` is not `complete` but all entries are checked — flag mismatch.

```
fixable: true
fixAction: { type: 'update-frontmatter', filePath: slicePlanPath, detail: { key: 'status', value: computed } }
```

#### Rule 8: Architecture file status vs. all-plans-complete

**Rule name:** `arch-status-vs-plans`
**Severity:** warning
**Location:** architecture file path

Look up the architecture document referenced by the slice plan's `parent` frontmatter. If the arch file's frontmatter `status: complete` but any of its slice plans have unchecked entries, or vice versa — flag mismatch.

This requires resolving the arch file path. Use the existing `detectDocuments` / `resolveArtifactPath` infrastructure.

```
fixable: true (frontmatter update on arch file)
```

### 4. Fix log and safety

**Current state:** `FixLogEntry` has `rule`, `action`, `filePath`, `field`, `before`, `after`. This is sufficient per-fix but needs aggregate reporting.

**Design decisions for safety:**

1. **Dry-run is the default.** `checkAll()` returns findings with `suggestedFix` text. No files are modified. This is already the existing pattern — `fix()` is opt-in.

2. **Fix log summary.** The `ConsistencyFixResult` already contains `fixLog: FixLogEntry[]` and `fixErrors: string[]`. For all-slices mode, the same structure works — the log will simply have more entries. The CLI already renders each entry with `before → after`. No type changes needed.

3. **No cascading fixes.** The fixer runs a single pass — `checkAll()` then fix each finding. It does **not** re-check after fixes. This prevents cascading: if fixing slice A's plan checkbox could invalidate slice B's frontmatter status, that will be caught on the next run, not in a recursive loop. This is a deliberate design choice to keep behavior predictable.

4. **CLI confirmation for fix-all.** When `--fix` is used without `--slice`, the CLI prints a summary of what will be fixed and asks for `y/N` confirmation before applying. The `--yes` flag bypasses this. This prevents silent mass mutation.

5. **JSON mode for programmatic review.** `--json` output includes the full `fixLog` array, allowing external tools to audit changes.

### 5. CLI changes: `cf check`

**Location:** `packages/cli/src/commands/check.ts`

Current flags: `--json`, `--project`, `--fix`

**New behavior:**
- Default mode becomes all-slices (calls `checkAll()` / `fixAll()`)
- Add `--slice <index>` flag to narrow to a single slice (calls existing `check()` / `fix()` after temporarily setting `project.fileSlice`)
- Add `--yes` flag to skip fix confirmation in all-slices mode

**Output changes:**
- Group findings by slice index in terminal output (header per slice)
- Show aggregate summary at the end: `"Checked N slices: X errors, Y warnings, Z info"`
- In fix mode without `--yes`: print planned fixes summary, prompt `y/N`, then apply

### 6. MCP tool changes: `workflow_check`

**Location:** `packages/mcp-server/src/tools/workflowTools.ts`

**Input schema update:**
- Add optional `sliceIndex?: number` parameter
- If `sliceIndex` is provided, check only that slice (existing behavior)
- If omitted, run all-slices mode (new default)

**Output:** Same `ConsistencyCheckResult` / `ConsistencyFixResult` structure — no breaking changes.

No confirmation prompt in MCP mode (the calling agent decides whether to fix). The existing `fix` boolean parameter controls this.

### 7. Type changes

**Location:** `packages/core/src/introspection/types.ts`

No new types needed. The existing `ConsistencyCheckResult`, `ConsistencyFixResult`, `ConsistencyFinding`, and `FixLogEntry` types are sufficient. The new rules produce findings with the same shape.

## Data Flow

```
cf check (no --slice)
  → ConsistencyChecker.checkAll(project)
    → parseSlicePlan() → entries[]
    → for each entry: detectDocuments(), parseTaskFile(), parseFrontmatter()
    → run rules 1-5 per slice
    → run rules 6-8 on aggregate data
    → return ConsistencyCheckResult with all findings
  → CLI groups by slice, displays summary
  → if --fix: prompt y/N, then fixAll()

cf check --slice 175
  → ConsistencyChecker.check(project)  [existing behavior]
  → CLI displays single-slice results
```

## Success Criteria

1. `cf check` (no flags) iterates all slices in the plan and reports findings across all of them
2. `cf check --slice 175` narrows to slice 175 only (backward-compatible)
3. Duplicate index detection catches two entries with the same `(NNN)` index
4. Plan status vs. entries-complete rule catches mismatches in both directions
5. Architecture status vs. plans-complete rule catches mismatches
6. `cf check --fix` in all-slices mode prompts for confirmation before applying
7. `cf check --fix --yes` skips confirmation
8. `workflow_check` MCP tool defaults to all-slices; `sliceIndex` parameter narrows scope
9. Fix log entries are present in both terminal and JSON output
10. No cascading — single pass only

## Dependencies

- **166-slice.consistency-checker** (complete) — provides `ConsistencyChecker`, `MarkdownWriter`, rules 1-5, `FixLogEntry`
- **163-slice.artifact-introspection-engine** (complete) — provides `IArtifactIntrospector`, parsers

## Effort

2/5 — The infrastructure exists. This is iteration logic + 3 new rules + CLI/MCP flag plumbing.

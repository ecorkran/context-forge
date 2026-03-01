---
docType: slice-design
slice: mcp-introspection-tools
project: context-forge
parent: user/architecture/160-slices.project-workflow-system.md
dependencies: [163-artifact-introspection-engine, 161-schema-standardization]
interfaces: [context-visualizer, 168-integration-testing]
status: not-started
dateCreated: 20260301
dateUpdated: 20260301
---

# Slice Design: MCP Introspection Tools

## Overview

Expose the introspection engine (slice 163) as dedicated MCP tools so any MCP client can access parsed methodology data without importing the `@context-forge/core` npm package. Adds five granular parsing tools, one aggregate `project_structure` tool that returns the full project model (equivalent to `parse.py`'s `build_model()` output), and updates `project_get`'s description to document the existing `introspection` summary field.

## Value

Makes Context Forge the canonical MCP source for methodology introspection data. Any MCP client — Python, browser extension, or another AI agent — can query live project state rather than maintaining its own parser. Specifically enables context-visualizer to consume Context Forge over MCP instead of running parse.py locally. The granular tools also give agents fine-grained access to individual artifacts (e.g., "just show me the task progress for this file") without the overhead of a full project model.

## Technical Scope

### Included

- Five granular MCP tools wrapping individual introspection parsers
- One aggregate `project_structure` tool implementing `build_model()` logic
- Update `project_get` tool description to document the `introspection` field
- New `introspectionTools.ts` file in `packages/mcp-server/src/tools/`
- New `ProjectModelBuilder` service in `packages/core/src/introspection/` for `build_model()` logic
- Types for the project model output shape
- Unit tests for all new tools and the model builder

### Excluded

- Caching or performance optimization (v1 reads files on demand)
- Write-back capabilities (that's slice 166, Consistency Checker)
- Workflow state machine logic (that's slice 165, Workflow Navigator)
- CLI interface for the model builder (parse.py remains for standalone CLI use)

## Dependencies

### Prerequisites

- Slice 163 (Artifact Introspection Engine) — all parsers, types, and `ArtifactIntrospector` class
- Slice 161 (Schema Standardization) — `ProjectData` with artifact reference fields (`fileSlicePlan`, `fileArch`, etc.)
- Slice 162 (Config System) — `resolveProjectId` for `default_project` fallback

### Interfaces Required

- `ArtifactIntrospector` from `@context-forge/core/node` — individual parser delegation
- `FileProjectStore` from `@context-forge/core/node` — project lookup for ID-based tools
- `resolveProjectId` from `./resolveProjectId.js` — shared project ID resolution
- `McpServer.registerTool()` from `@modelcontextprotocol/sdk` — tool registration pattern

## Architecture

### Component Structure

Two new components:

1. **`ProjectModelBuilder`** (`packages/core/src/introspection/ProjectModelBuilder.ts`)
   - Implements the `build_model()` logic from parse.py in TypeScript
   - Scans `project-documents/user/` directory, collects document metadata, groups by initiative bands
   - Returns a typed `ProjectModel` matching parse.py's output shape
   - Lives in core because it's a pure introspection capability (reusable by workflow navigator, consistency checker)

2. **`introspectionTools.ts`** (`packages/mcp-server/src/tools/introspectionTools.ts`)
   - Registers all six introspection MCP tools
   - Thin wrappers: resolve project/path → delegate to `ArtifactIntrospector` or `ProjectModelBuilder` → return JSON
   - Follows the established pattern in `projectTools.ts` (same `errorResult`/`jsonResult` helpers)

### Data Flow

```
MCP Client
  → introspection_* tool call
    → resolveProjectId (if projectId provided)
    → FileProjectStore.getById (if projectId, to get projectPath)
    → ArtifactIntrospector.parse*(filePath) or ProjectModelBuilder.build(projectPath)
    → JSON response
```

For granular tools, the caller provides either:
- A `projectId` + a relative path (resolved against `project.projectPath`)
- Or a direct `filePath` (absolute path — for use without a stored project)

For `project_structure`, the caller provides a `projectId` (resolved to `projectPath`).

## Technical Decisions

### Input Design: `projectId` + relative path OR direct `filePath`

Each granular tool accepts two input patterns:
- `projectId` (optional) + `path` (relative to project root) — the common case when working with a known project
- `filePath` (absolute) — escape hatch for parsing any file, even outside a managed project

If both are provided, `filePath` takes precedence (it's more specific). If neither provides a resolvable absolute path, return an error.

This matches how MCP clients typically interact: Claude Code knows the `projectId` from prior `project_list`/`project_get` calls and can specify relative artifact paths. But a standalone script might pass absolute paths directly.

### `project_structure` Input: `projectId` only

The aggregate tool requires a `projectId` (with `default_project` fallback) because it needs the full `projectPath` to scan the directory tree. No `filePath` shortcut — the whole point is project-level aggregation.

Optional `name` and `description` parameters mirror parse.py's CLI flags for overriding project name and description in the output.

### ProjectModelBuilder Location

In `packages/core/src/introspection/` rather than `packages/mcp-server/` because:
- The logic is pure introspection (reads files, builds data structure)
- Future slices (165 Workflow Navigator, 166 Consistency Checker) will consume it directly
- Testing is cleaner with real fixtures rather than MCP protocol mocking
- The MCP tool is a thin wrapper calling `builder.build(projectPath)`

### Document Scanning and Filename Parsing

`ProjectModelBuilder` needs to replicate parse.py's `scan_directory()` and filename regex patterns (`INDEXED_RE`, `GUIDE_RE`). These are new to the TypeScript codebase — slice 163's parsers work on individual files, not directory scanning with filename metadata extraction.

We'll add:
- `INDEXED_RE` and `GUIDE_RE` regex constants
- A `scanDirectory()` function that walks `project-documents/user/` subdirectories
- A `DocEntry` type for the intermediate document metadata (equivalent to parse.py's `Doc` dataclass)

These live in `ProjectModelBuilder.ts` (module-private) since they're specific to the model builder. If slice 165 or 166 later needs filename parsing, we can extract them.

### Output Shape: Match parse.py

The `ProjectModel` type matches parse.py's `build_model()` output:

```typescript
interface ProjectModel {
  name: string;
  description: string;
  foundation: FoundationEntry[];
  projectArchitecture: ArchEntry[];
  initiatives: Record<string, Initiative>;
  futureSlices: FutureSliceEntry[];
  quality: DocSummary[];
  investigation: DocSummary[];
  maintenance: MaintenanceEntry[];
  devlog: boolean;
}
```

Each sub-type mirrors parse.py's dict shapes:
- `FoundationEntry`: `{ index, name, status, type, dateCreated?, dateUpdated? }`
- `Initiative`: `{ name, arch?, slicePlan?, slices, features }`
- Slice within initiative: `{ index, name, status, tasks?, features?, planned? }`
- Task within slice: `{ index, name, status, taskCount, completedTasks, items? }`

Index values are zero-padded strings (`"163"`) matching parse.py's `f"{doc.index:03d}"` format.

### Reusing Existing Parsers

`ProjectModelBuilder` delegates to the same parser functions from slice 163:
- `parseFrontmatter()` for file metadata extraction
- `parseSlicePlan()` → `parse_plan_slices()` equivalent (renamed in this context)
- `parseFutureWork()` for future work sections
- `parseTaskFile()` / `parseTaskItems()` for task checkbox extraction

New logic unique to the model builder:
- `scanDirectory()` — walks `user/` subdirectories, matches filenames, collects `DocEntry` array
- `buildModel()` — groups documents into bands, constructs initiatives, handles planned-vs-actual slices

### Error Handling

Consistent with slice 163's "graceful degradation" principle:
- Missing files → empty results (never crash)
- Malformed frontmatter → empty `{}` data
- Missing `project-documents/user/` directory → empty model with project name only
- Individual file parse errors → skip that file, continue with others
- Tool-level errors → `isError: true` with descriptive message

## API Contracts

### Granular Introspection Tools

All tools return JSON in the `content[0].text` field. All accept optional `projectId` (with `default_project` fallback) for project-relative path resolution.

#### `introspection_slice_plan`

| Field | Type | Description |
|-------|------|-------------|
| **Input** | | |
| `projectId` | string? | Project ID. Omit to use default_project. |
| `path` | string? | Relative path to slice plan (from project root). |
| `filePath` | string? | Absolute path to slice plan file. Overrides projectId+path. |
| **Output** | `SlicePlanResult` | |
| `.filePath` | string | Resolved file path |
| `.entries[]` | SlicePlanEntry[] | `{ index, name, status, isChecked }` |
| `.totalSlices` | number | Total slice entries found |
| `.completedSlices` | number | Checked entries |

#### `introspection_tasks`

| Field | Type | Description |
|-------|------|-------------|
| **Input** | | |
| `projectId` | string? | Project ID. |
| `path` | string? | Relative path to task file. |
| `filePath` | string? | Absolute path. Overrides projectId+path. |
| **Output** | `TaskFileResult` | |
| `.filePath` | string | Resolved file path |
| `.items[]` | TaskItem[] | `{ name, done }` |
| `.totalTasks` | number | Total checkbox items |
| `.completedTasks` | number | Checked items |
| `.inferredStatus` | string | `'complete'`, `'in-progress'`, or `'not-started'` |

#### `introspection_frontmatter`

| Field | Type | Description |
|-------|------|-------------|
| **Input** | | |
| `projectId` | string? | Project ID. |
| `path` | string? | Relative path to markdown file. |
| `filePath` | string? | Absolute path. Overrides projectId+path. |
| **Output** | `FrontmatterResult` | |
| `.filePath` | string | Resolved file path |
| `.found` | boolean | Whether frontmatter was present |
| `.data` | Record<string, string> | Extracted key-value pairs |

#### `introspection_documents`

| Field | Type | Description |
|-------|------|-------------|
| **Input** | | |
| `projectId` | string? | Project ID. |
| `sliceIndex` | number | Numeric slice index to check (e.g., 163). |
| **Output** | `DocumentDetectionResult` | |
| `.sliceDesign` | string \| null | Relative path if found |
| `.taskFile` | string[] \| null | Relative path(s) if found |
| `.architecture` | string \| null | Relative path if found |
| `.slicePlan` | string \| null | Relative path if found |

Note: `introspection_documents` requires either `projectId` or `projectPath` (absolute). No `filePath` shortcut — it needs a project root to scan directories.

#### `introspection_future_work`

| Field | Type | Description |
|-------|------|-------------|
| **Input** | | |
| `projectId` | string? | Project ID. |
| `path` | string? | Relative path to slice plan. |
| `filePath` | string? | Absolute path. Overrides projectId+path. |
| `nextIndex` | number? | Starting index for auto-numbering unnumbered items. |
| **Output** | `FutureWorkResult` | |
| `.filePath` | string | Resolved file path |
| `.items[]` | FutureWorkItem[] | `{ index, name, done }` |

### Aggregate Tool

#### `project_structure`

| Field | Type | Description |
|-------|------|-------------|
| **Input** | | |
| `projectId` | string? | Project ID. Omit to use default_project. |
| `name` | string? | Override project name in output. |
| `description` | string? | Override project description in output. |
| **Output** | `ProjectModel` | |
| `.name` | string | Project display name |
| `.description` | string | Project description |
| `.foundation[]` | FoundationEntry[] | Foundation docs (index 000-009) |
| `.projectArchitecture[]` | ArchEntry[] | Project-level arch (index 050-099) |
| `.initiatives` | Record<string, Initiative> | Keyed by base index string |
| `.futureSlices[]` | FutureSliceEntry[] | Standalone features not claimed by a slice |
| `.quality[]` | DocSummary[] | Review docs (900+) |
| `.investigation[]` | DocSummary[] | Analysis docs |
| `.maintenance[]` | MaintenanceEntry[] | Maintenance tasks (900+) |
| `.devlog` | boolean | Whether DEVLOG.md exists at project root |

### `project_get` Description Update

Update the `description` field of the existing `project_get` tool to document the `introspection` summary field:

```
'Get full details for a specific Context Forge project by ID. Returns all project fields including configuration, custom data, and timestamps. When the project has a projectPath, the response includes an `introspection` field with: slicePlan (totalSlices, completedSlices, summary), currentTasks (totalTasks, completedTasks, inferredStatus, summary), and artifacts (presence flags for slicePlan, HLD, arch, spec, currentSliceDesign, currentTaskFile). Use project_list first to find project IDs.'
```

## Integration Points

### Provides to Other Slices

- **context-visualizer**: Full project model via `project_structure` MCP tool — replacement for running parse.py locally
- **Slice 165 (Workflow Navigator)**: Will consume `ProjectModelBuilder` directly via core API, not via MCP
- **Slice 166 (Consistency Checker)**: Will consume `ProjectModelBuilder` for full project state comparison
- **Slice 168 (Integration Testing)**: All new tools available for integration test coverage

### Consumes from Other Slices

- **Slice 163**: `ArtifactIntrospector` class and all parser functions
- **Slice 162**: `resolveProjectId` for `default_project` config fallback
- **Slice 161**: `ProjectData` type with artifact reference fields

## Success Criteria

### Functional Requirements

- Each granular tool returns the same typed result as its underlying parser function
- `project_structure` produces output structurally equivalent to parse.py's `build_model()` for the same input directory
- All tools handle missing/malformed files gracefully (error results, never crashes)
- `project_get` description documents the `introspection` field
- Tools work with `default_project` config (no project ID needed if default is set)

### Technical Requirements

- All new tools have unit tests using InMemoryTransport + Client pattern (matching existing MCP test patterns)
- `ProjectModelBuilder` has unit tests against the existing fixture project in `packages/core/tests/fixtures/introspection/project/`
- All existing tests continue to pass (509+ tests across 3 packages)
- Full build clean across all packages
- No new npm dependencies

## Implementation Notes

### Development Approach

Suggested implementation order:

1. **Types**: Add `ProjectModel` and sub-types to `packages/core/src/introspection/types.ts`
2. **ProjectModelBuilder**: Implement `scanDirectory()` + `buildModel()` in core, with tests against fixture project
3. **Path resolution helper**: Shared function for resolving `projectId`+`path` / `filePath` input patterns
4. **Granular MCP tools**: Register five introspection tools in `introspectionTools.ts`, with tests
5. **`project_structure` MCP tool**: Register aggregate tool, with tests
6. **`project_get` description update**: One-line change in `projectTools.ts`
7. **Build and verify**: Full build, all tests pass

### Testing Strategy

- **ProjectModelBuilder unit tests**: Use the existing fixture at `packages/core/tests/fixtures/introspection/project/` (already has `project-documents/user/` with slices, tasks, architecture). May need fixture expansion for foundation docs and operational docs to exercise full model building.
- **MCP tool tests**: Follow the InMemoryTransport + vi.mock pattern from `projectTools.test.ts`. Mock `ArtifactIntrospector` and `ProjectModelBuilder` to test tool wiring, input validation, and error handling.
- **Equivalence test**: Parse the fixture project with both `ProjectModelBuilder` and parse.py, compare output shapes. (Manual validation during development — automated equivalence testing deferred to slice 168.)

### File Summary

| File | Action | Description |
|------|--------|-------------|
| `packages/core/src/introspection/types.ts` | Modify | Add ProjectModel and sub-types |
| `packages/core/src/introspection/ProjectModelBuilder.ts` | Create | scanDirectory + buildModel |
| `packages/core/src/introspection/index.ts` | Modify | Export new model types |
| `packages/core/src/node.ts` | Modify | Export ProjectModelBuilder |
| `packages/core/tests/introspection/ProjectModelBuilder.test.ts` | Create | Unit tests |
| `packages/mcp-server/src/tools/introspectionTools.ts` | Create | 6 MCP tools |
| `packages/mcp-server/src/index.ts` | Modify | Register introspection tools |
| `packages/mcp-server/tests/introspectionTools.test.ts` | Create | MCP tool tests |
| `packages/mcp-server/src/tools/projectTools.ts` | Modify | Update project_get description |

### Special Considerations

- **Response size for `project_structure`**: Large projects may produce substantial JSON. The response could be 50-100KB for a mature project. This is fine for MCP (no response size limit in the spec), but callers should be aware. If this becomes a concern, a future slice could add `include`/`exclude` filters — but not for v1.
- **Fixture expansion**: The existing fixture project has slices, tasks, and architecture. To test foundation docs (000-009), project architecture (050-099), and operational docs (900+), we'll need to add a few fixture files. Keep these minimal — just enough to verify the grouping logic.

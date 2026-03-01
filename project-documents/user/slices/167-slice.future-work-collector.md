---
docType: slice-design
slice: future-work-collector
project: context-forge
parent: user/architecture/160-slices.project-workflow-system.md
dependencies: [163-artifact-introspection, 164-mcp-introspection-tools]
interfaces: [168-integration-testing, context-visualizer]
status: complete
dateCreated: 20260301
dateUpdated: 20260301
---

# Slice Design: Future Work Collector

## Overview

MCP tool (`workflow_future`) that walks all slice plans in a project, extracts "Future Work" sections and standalone future-work files, and returns a consolidated view grouped by source initiative. Each collected item carries source attribution (file, initiative index, initiative name) and preserves original descriptions, dependencies, and effort estimates. Output is structured JSON with a formatted markdown summary field. Project-scoped only (no cross-project variant in v1).

## Value

Future work items accumulate in individual slice plan files and standalone future-work documents. Currently the only way to see the full backlog is to manually scan every file. This tool answers "what's on the backlog?" in a single call — grouped by initiative, with source attribution, in both machine-readable and human-readable formats.

Directly enables:
- **Planning sessions**: PM can review all outstanding future work without file-by-file scanning
- **Visualization**: context-visualizer can render a dedicated "Future Work" view aggregating across all initiatives (currently each initiative shows its own future work inline, but there's no cross-initiative view)
- **Prioritization**: structured output makes it possible to sort, filter, or compare future work items programmatically

## Technical Scope

### Included

- `FutureWorkCollector` service in `packages/core/src/introspection/` — aggregation logic
- `workflow_future` MCP tool in `packages/mcp-server/src/tools/`
- New types for aggregated future work output
- Markdown summary formatter
- Unit tests for collector service and MCP tool

### Excluded

- Cross-project `workflow_future_all` variant (deferred — no current need)
- Promoting future work items into real slices (manual decision, out of scope)
- Write-back or reorganization of future work files (read-only tool)
- Caching (reads files on demand, same pattern as all introspection tools)

## Dependencies

### Prerequisites

- **Slice 163** (Artifact Introspection Engine) — `parseFutureWork()`, `parseSlicePlan()`, `parseFrontmatter()`, `FutureWorkItem` type
- **Slice 164** (MCP Introspection Tools) — `ProjectModelBuilder` with `scanDirectory()` and `buildModel()` which already collects `futureWork` per initiative; tool registration patterns; `resolveProjectId`

### Interfaces Required

- `ProjectModelBuilder` from `@context-forge/core/node` — primary data source; `buildModel()` already populates `Initiative.slicePlan.futureWork` for each initiative
- `ArtifactIntrospector` from `@context-forge/core/node` — for parsing standalone future-work files not captured by `buildModel()`
- `FileProjectStore` from `@context-forge/core/node` — project lookup by ID
- `resolveProjectId` from MCP server — shared project ID resolution with `default_project` fallback

## Architecture

### Data Sources (Hybrid Convention)

Future work items live in two locations:

1. **Inline in slice plans** — `## Future Work` sections at the bottom of `NNN-slices.{name}.md` files. These are already parsed by `parseFutureWork()` and collected by `ProjectModelBuilder.buildModel()` into each `Initiative.slicePlan.futureWork`.

2. **Standalone future-work files** — Files matching `NNN-slices.future.{topic}.md` in the architecture directory. These are slice plan documents that contain only future/backlog items, not active initiative work. Example: `780-slices.future.guide-management.md`.

Both use the same item format: numbered checklist entries with optional `(NNN)` index, description, and `[x]`/`[ ]` completion status. Completed/migrated items stay in the file with `[x]` and a migration note (e.g., "Implemented as slice 162").

### Component Structure

One new component:

**`FutureWorkCollector`** (`packages/core/src/introspection/FutureWorkCollector.ts`)
- Consumes `ProjectModelBuilder.buildModel()` output as primary data source
- Scans for standalone `*-slices.future.*` files not already captured in the model
- Groups all future work by source initiative
- Generates both structured JSON and markdown summary
- Stateless service — reads files on demand, no caching

The MCP tool is a thin wrapper: resolve project → call collector → return JSON.

### Data Flow

```
MCP Client
  → workflow_future(projectId?)
    → resolveProjectId (with default_project fallback)
    → FileProjectStore.getById → projectPath
    → FutureWorkCollector.collect(projectPath)
      → ProjectModelBuilder.buildModel(projectPath)
        → per initiative: Initiative.slicePlan.futureWork (already populated)
      → scan for standalone *-slices.future.* files
        → parseFutureWork() for each
        → parseFrontmatter() for source attribution (parent field)
      → merge, group by initiative, generate markdown
    → JSON response (structured data + markdown summary)
```

### Output Shape

```typescript
/** A single future work item with source attribution */
interface CollectedFutureWorkItem {
  index: string;              // e.g., "781"
  name: string;               // short title
  done: boolean;              // [x] = true
  description?: string;       // full text if available
  sourceFile: string;         // relative path to originating file
  sourceInitiativeIndex: string; // e.g., "140"
  sourceInitiativeName: string;  // e.g., "Context Forge Restructure"
}

/** Future work grouped by source initiative */
interface FutureWorkGroup {
  initiativeIndex: string;    // e.g., "140"
  initiativeName: string;     // e.g., "Context Forge Restructure"
  sourceFile: string;         // the slice plan or standalone file
  items: CollectedFutureWorkItem[];
  totalItems: number;
  pendingItems: number;       // items where done=false
  completedItems: number;     // items where done=true
}

/** Top-level result from workflow_future */
interface FutureWorkCollectorResult {
  projectPath: string;
  groups: FutureWorkGroup[];
  totalItems: number;
  pendingItems: number;
  completedItems: number;
  markdown: string;           // formatted summary
}
```

## Technical Decisions

### Leverage `buildModel()` Rather Than Re-scanning

`ProjectModelBuilder.buildModel()` already walks all slice plans and populates `futureWork` per initiative. Rather than duplicating the file scanning logic, the collector calls `buildModel()` and iterates the initiative map. This ensures consistency with `project_structure` output and avoids maintaining parallel scanning logic.

The only additional scanning needed is for standalone `*-slices.future.*` files, which `buildModel()` may classify differently (as standalone future slices rather than initiative-attached future work). The collector checks for these explicitly.

### Source Attribution from File Path and Frontmatter

Each `FutureWorkGroup` carries `initiativeIndex`, `initiativeName`, and `sourceFile`. These are derived from:
- **For inline future work**: the initiative's base index and name from the `ProjectModel.initiatives` map, and the slice plan file path from `Initiative.slicePlan`
- **For standalone files**: the file's own index band, its `parent` frontmatter field (points to originating arch doc), and the file's title

No per-item attribution beyond what `FutureWorkItem` already carries (index, name, done). The source is the file, not a specific line number.

### Markdown Summary Format

The markdown output is designed for inclusion in planning discussions or tool responses:

```markdown
## Future Work Summary

### 140 — Context Forge Restructure
*Source: user/architecture/140-slices.context-forge-restructure.md*
- [ ] (781) Bundled Prompt System & Guide Install
- [ ] (782) Guide Update & Auto-Update

### 160 — Project Workflow System
*Source: user/architecture/160-slices.project-workflow-system.md*
(no future work items)

**Total: 4 items (2 pending, 2 completed)**
```

Groups with zero pending items can be optionally hidden via a `hideDone` parameter.

### Filter Parameters

The MCP tool accepts optional filter parameters:
- `status`: `"all"` (default), `"pending"`, or `"completed"` — filter items by done state
- `includeMarkdown`: `true` (default) — include the markdown summary field; set `false` to reduce response size for programmatic consumers

### Error Handling

Consistent with the introspection engine's "graceful degradation" principle:
- Project with no slice plans → empty result (`groups: [], totalItems: 0`)
- Malformed future work section → skip that section, continue with others
- Standalone file with missing/invalid frontmatter → use file path as source attribution, empty initiative name
- Tool-level errors (invalid project ID, missing project path) → `isError: true` with descriptive message

## API Contract

### `workflow_future`

| Field | Type | Description |
|-------|------|-------------|
| **Input** | | |
| `projectId` | string? | Project ID. Omit to use `default_project` config. |
| `status` | string? | Filter: `"all"` (default), `"pending"`, `"completed"` |
| `includeMarkdown` | boolean? | Include markdown summary (default `true`) |
| **Output** | `FutureWorkCollectorResult` | |
| `.projectPath` | string | Resolved project path |
| `.groups[]` | FutureWorkGroup[] | Grouped by source initiative |
| `.totalItems` | number | Total future work items across all groups |
| `.pendingItems` | number | Items not yet done |
| `.completedItems` | number | Items marked done/migrated |
| `.markdown` | string | Formatted summary (omitted if `includeMarkdown: false`) |

## Integration Points

### Provides to Other Slices

- **context-visualizer**: Aggregated future work data via `workflow_future` MCP tool — enables a cross-initiative "Future Work" view that doesn't exist today
- **Slice 168 (Integration Testing)**: New tool available for integration test coverage
- **Slice 165 (Workflow Navigator)**: Could consume future work counts to enrich project status (e.g., "plan complete, 6 backlog items") — not a hard interface, just available data

### Consumes from Other Slices

- **Slice 163**: `parseFutureWork()`, `parseFrontmatter()`, `FutureWorkItem` type
- **Slice 164**: `ProjectModelBuilder.buildModel()` for initiative-level future work; tool registration patterns
- **Slice 162**: `resolveProjectId` for `default_project` config fallback

## Success Criteria

### Functional Requirements

- Correctly extracts future work items from inline `## Future Work` sections across all slice plans in a project
- Discovers and parses standalone `*-slices.future.*` files
- Groups results by source initiative with correct attribution (index, name, file)
- Preserves item details: index, name, done status
- Completed/migrated items (marked `[x]`) appear with `done: true`
- Returns both structured JSON and formatted markdown
- `status` filter correctly filters items
- Empty project (no future work anywhere) returns empty result, not error

### Technical Requirements

- `FutureWorkCollector` has unit tests against the existing fixture project (with fixture expansion for standalone future-work files)
- MCP tool has unit tests using `InMemoryTransport` + `Client` pattern
- All existing tests continue to pass (536+ across 3 packages)
- Full build clean across all packages
- No new npm dependencies

## Implementation Notes

### Development Approach

Suggested implementation order:

1. **Types**: Add `CollectedFutureWorkItem`, `FutureWorkGroup`, `FutureWorkCollectorResult` to types
2. **Fixture expansion**: Add a standalone `*-slices.future.*` file to the test fixture project
3. **FutureWorkCollector**: Implement `collect(projectPath)` in core, consuming `buildModel()` output + standalone file scanning
4. **Markdown formatter**: Implement summary generation (can be a method on the collector or a standalone function)
5. **MCP tool**: Register `workflow_future` in a new `workflowTools.ts` (or add to `introspectionTools.ts` — see decision below)
6. **Build and verify**: Full build, all tests pass

### Tool Registration Location

Two options for where to register `workflow_future`:

- **Option A**: New `workflowTools.ts` — separates workflow tools (165, 166, 167) from introspection tools (164). Cleaner as the workflow tool count grows.
- **Option B**: Add to existing `introspectionTools.ts` — fewer files, but mixes concerns.

**Recommendation**: Option A. Slices 165 and 166 will also add `workflow_*` tools. A dedicated `workflowTools.ts` keeps the tool registration organized by capability area. The file starts small (just `workflow_future`) and grows as 165/166 land.

### Testing Strategy

- **FutureWorkCollector unit tests**: Use the existing fixture at `packages/core/tests/fixtures/introspection/project/`. Expand with a standalone `780-slices.future.test-future.md` fixture file containing a mix of pending and completed items. Test: correct grouping, source attribution, done filtering, empty project handling.
- **MCP tool tests**: Follow the `InMemoryTransport` + `vi.mock` pattern. Mock `FutureWorkCollector` to test tool wiring, input validation, filter parameter handling, and error responses.
- **Markdown output tests**: Snapshot or string-match tests for the markdown formatter — verify grouping headers, item formatting, summary counts.

### File Summary

| File | Action | Description |
|------|--------|-------------|
| `packages/core/src/introspection/types.ts` | Modify | Add collected future work types |
| `packages/core/src/introspection/FutureWorkCollector.ts` | Create | Aggregation logic + markdown formatter |
| `packages/core/src/introspection/index.ts` | Modify | Export new types |
| `packages/core/src/node.ts` | Modify | Export FutureWorkCollector |
| `packages/core/tests/introspection/FutureWorkCollector.test.ts` | Create | Unit tests |
| `packages/core/tests/fixtures/introspection/project/project-documents/user/architecture/780-slices.future.test-future.md` | Create | Fixture file |
| `packages/mcp-server/src/tools/workflowTools.ts` | Create | workflow_future MCP tool |
| `packages/mcp-server/src/index.ts` | Modify | Register workflow tools |
| `packages/mcp-server/tests/workflowTools.test.ts` | Create | MCP tool tests |

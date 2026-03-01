---
docType: agent-brief
slice: mcp-introspection-tools
sliceIndex: 164
project: context-forge
dependencies: [163-artifact-introspection-engine, 161-schema-standardization]
dateCreated: 20260301
---

# Agent Brief: MCP Introspection Tools (164)

## Objective

Expose the introspection engine (slice 163) as MCP tools so any MCP client
can access parsed methodology data without importing the npm package.

## What Exists

- Slice 163 implemented: `ArtifactIntrospector` class with `parseSlicePlan`,
  `parseTaskFile`, `parseFrontmatter`, `parseFutureWork`, `detectDocuments`
- These are available via `@context-forge/core/node` but NOT via MCP
- `project_get` returns an `introspection` summary field but its tool
  description doesn't mention it
- MCP tool registration pattern established in
  `packages/mcp-server/src/tools/projectTools.ts` (and siblings)

## What This Slice Adds

### Individual Introspection Tools (granular access)

| MCP Tool | Wraps | Returns |
|----------|-------|---------|
| `introspection_slice_plan` | `parseSlicePlan(filePath)` | Full slice entries: name, index, checkbox state, ordering |
| `introspection_tasks` | `parseTaskFile(filePath)` | Task items with done/not-done, completion counts |
| `introspection_frontmatter` | `parseFrontmatter(filePath)` | Parsed YAML frontmatter key-value pairs |
| `introspection_documents` | `detectDocuments(projectPath, sliceIndex)` | Existence flags for expected methodology files |
| `introspection_future_work` | `parseFutureWork(filePath)` | Future work items with indices and titles |

### Aggregate Tool (full project model)

| MCP Tool | Purpose |
|----------|---------|
| `project_structure` | Returns the complete aggregated project model for a project |

This is the big one. It walks the project's methodology directory and returns
the full structure: foundation docs, project architecture, initiatives with
their slices (including task progress and planned-but-unwritten slices),
future work, operational docs. Output shape should match parse.py's
`build_model()` output — use parse.py as the **reference specification**
for the JSON model structure.

Key sections in the output model:
- `foundation` — core project docs (000-009)
- `projectArchitecture` — HLD and project-level arch (050-099)
- `initiatives` — keyed by base index, each with arch doc, slice plan,
  slices (with nested tasks), future work
- `quality`, `investigation`, `maintenance` — operational (900+)

### Documentation Update

- Update `project_get` tool description to document the `introspection`
  summary field and its shape

## Reference Specification

`parse.py` (provided in project context) is the canonical reference for:
- Filename parsing patterns (INDEXED_RE, GUIDE_RE)
- Slice plan entry extraction (bold-index pattern distinguishing from future work)
- Task checkbox parsing and split-doc merging
- Status normalization rules
- The full `build_model()` aggregation logic and output JSON shape
- Edge cases: non-slice headings filter, heading-based section boundaries,
  auto-indexing for unnumbered future work items

The TypeScript implementation should produce equivalent output for the same
input files. parse.py's parsing behaviors are the acceptance criteria.

## Design Guidance

- Follow the existing MCP tool registration pattern in projectTools.ts
- Each tool takes a `projectId` (resolved to projectPath) or direct file path
- Return typed JSON — document the response schema in each tool's description
  so MCP clients know what they're getting (this was the discoverability gap
  the agent identified)
- Graceful degradation: missing files → clear error result, malformed files →
  partial result with warnings, never crash
- `project_structure` may be expensive for large projects — consider whether
  caching or lazy evaluation is warranted (probably not for v1, but note it)

## Testing

- Test-with pattern: implement each tool, test immediately
- Unit tests for each MCP tool with mock project directory structures
- Integration test: call `project_structure` on a real project directory
  and validate output matches parse.py's output for the same input
- Edge cases: empty project, missing directories, malformed frontmatter,
  split task files
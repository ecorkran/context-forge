---
docType: slice-design
slice: artifact-introspection
project: context-forge
parent: user/architecture/160-slices.project-workflow-system.md
dependencies: [161-project-schema-standardization]
interfaces: [164-workflow-navigator, 165-consistency-checker, 166-future-work-collector]
status: complete
dateCreated: 20260228
dateUpdated: 20260228
---

# Slice 163: Artifact Introspection Engine

## Overview

This slice adds a core module that reads ai-project-guide methodology artifacts from disk and extracts structured information: slice plan entries with completion states, task file completion counts, document existence checks, frontmatter extraction, and future work items. It provides the programmatic "eyes" that slices 164 (Workflow Navigator), 165 (Consistency Checker), and 166 (Future Work Collector) all depend on.

The reference implementation is `parse.py` from the context-visualizer project, which performs this work in Python for a visualization frontend. This slice re-implements the relevant parsing capabilities in TypeScript as a `packages/core` module, adapting the data model for Context Forge's internal API rather than visualization JSON.

## Value

- **Programmatic artifact awareness.** Currently, understanding project state requires manually reading markdown files. This module makes that information available through a typed API — enabling both MCP tool enrichment and downstream workflow tools.
- **Enriched `project_get` responses.** When a project has artifact reference fields populated (`fileSlicePlan`, `fileTasks`, `projectPath`), `project_get` can include computed fields like slice plan completion ("7 of 12 slices complete") and task progress ("current slice: 3 of 15 tasks done").
- **Foundation for three downstream slices.** The workflow navigator, consistency checker, and future work collector are all thin consumers of this module's parsing output. Building introspection as a standalone layer avoids duplicating parsing logic across those slices.
- **Graceful degradation.** Missing or malformed files produce clear "not found" or "parse error" results — never crashes. Projects with no methodology artifacts still work; projects with partial artifacts get partial introspection.

## Technical Scope

### Included

1. **`packages/core/src/introspection/` module** with:
   - `types.ts` — result types for all parsing operations
   - `interfaces.ts` — `IArtifactIntrospector` interface
   - `ArtifactIntrospector.ts` — main implementation
   - `parsers/frontmatterParser.ts` — YAML frontmatter extraction
   - `parsers/slicePlanParser.ts` — slice plan checkbox/entry parsing
   - `parsers/taskFileParser.ts` — task file checkbox parsing
   - `parsers/futureWorkParser.ts` — future work section extraction
   - `parsers/documentDetector.ts` — file existence and directory scanning
   - `parsers/statusNormalizer.ts` — status string normalization
   - `index.ts` — barrel exports

2. **Enriched `project_get` response** — when `projectPath` and artifact references are populated, `project_get` includes an `introspection` computed field with slice plan and task completion summaries

3. **Unit tests** following the test-with pattern, covering each parser and the orchestrator

### Excluded

- **Workflow navigation logic** — that's Slice 164
- **Consistency checking / fix-up** — that's Slice 165
- **Future work aggregation across projects** — that's Slice 166
- **Full markdown AST parsing** — uses regex-based line parsing per architectural guidance
- **Caching** — reads on demand; caching deferred unless profiling shows need
- **MCP tools** — no new MCP tools in this slice; the module is consumed internally and through enriched `project_get`

## Dependencies

### Prerequisites

- **Slice 161 (Project Schema Standardization)** — complete. Provides `fileHLD`, `fileArch`, `fileSlicePlan`, `fileSpec` artifact reference fields on `ProjectData`
- **Node.js `fs` and `path`** — filesystem access for reading artifacts
- No new npm dependencies required

### Interfaces Required

- `ProjectData.projectPath` — absolute path to project root
- `ProjectData.fileSlicePlan` — relative path to slice plan (from projectPath)
- `ProjectData.fileTasks` — current task file name
- `ProjectData.fileSlice` — current slice name
- `ProjectData.fileHLD`, `ProjectData.fileArch`, `ProjectData.fileSpec` — optional artifact references

## Architecture

### Component Structure

```
packages/core/src/introspection/
├── index.ts                      # Barrel exports
├── interfaces.ts                 # IArtifactIntrospector
├── types.ts                      # Result types
├── ArtifactIntrospector.ts       # Orchestrator — delegates to parsers
└── parsers/
    ├── frontmatterParser.ts      # YAML frontmatter extraction
    ├── slicePlanParser.ts        # Slice plan entry parsing
    ├── taskFileParser.ts         # Task checkbox parsing
    ├── futureWorkParser.ts       # Future work section parsing
    ├── documentDetector.ts       # File/directory existence checks
    └── statusNormalizer.ts       # Status string normalization
```

The `ArtifactIntrospector` is the public-facing orchestrator. It accepts a `projectPath` and delegates to individual parsers. Each parser is a pure function (or minimal class) that takes a file path and returns a typed result — keeping parsing logic testable in isolation.

### Data Flow

```
ProjectData (projectPath, fileSlicePlan, fileTasks, etc.)
  │
  ▼
ArtifactIntrospector
  │
  ├──► slicePlanParser(slicePlanPath) ──► SlicePlanResult
  │      └── per-entry: { index, name, status, isChecked }
  │
  ├──► taskFileParser(taskFilePath) ──► TaskFileResult
  │      └── { total, completed, items: [{ name, done }] }
  │
  ├──► frontmatterParser(filePath) ──► FrontmatterResult
  │      └── { status, dateCreated, dateUpdated, project, parent, ... }
  │
  ├──► futureWorkParser(slicePlanPath) ──► FutureWorkResult
  │      └── items: [{ index, name, done }]
  │
  └──► documentDetector(projectPath, index?) ──► DocumentDetectionResult
         └── { sliceExists, taskFileExists, designExists, archExists, ... }
```

Consumers (slices 164–166 and enriched `project_get`) call `ArtifactIntrospector` methods and receive typed result objects. They never interact with parsers directly.

## Technical Decisions

### Parsing Approach: Line-by-Line Regex (from parse.py)

The reference implementation uses line-by-line regex parsing with no markdown AST library. This is the right approach for Context Forge:

- **Checkbox parsing:** `^(?:\s*)-\s+\[([ xX])\]\s+(.+)$` — matches `- [ ] text` and `- [x] text` at any indentation level
- **Slice plan entries:** `^\d+\.\s+\[([ xX])\]\s+\*\*\((\d+)\)\s+(.+?)\*\*` — matches `N. [ ] **(NNN) Name**` format
- **Future work items:** `^\d+\.\s+\[([ xX])\]\s+(.+)$` — numbered checkbox items in `## Future Work` section
- **Frontmatter:** Line-by-line between `---` delimiters, `key: value` extraction (no PyYAML/js-yaml dependency needed)

These patterns are proven in production (context-visualizer uses them on real project files including context-forge itself).

### Frontmatter Parser: Lightweight, No External Dependency

Matching `parse.py`'s approach: read lines between `---` delimiters, split on first `:`, trim values, strip quotes. This avoids adding a YAML parsing dependency for what is always flat key-value frontmatter in our methodology files.

### Status Normalization

Direct port of `parse.py`'s `_STATUS` mapping:

| Input variants | Normalized output |
|---|---|
| `complete`, `completed`, `done` | `complete` |
| `in_progress`, `in-progress`, `in progress`, `active` | `in-progress` |
| `not_started`, `not-started`, `not started`, `ready`, `pending`, `planned` | `not-started` |
| `deprecated` | `deprecated` |

Unknown values default to `not-started`.

### Task Status Inference

When a task file's frontmatter status is `not-started` but checkboxes tell a different story, infer status from checkbox state (matching `parse.py`'s `_task_entry` logic):

- All checkboxes checked → `complete`
- Some checkboxes checked → `in-progress`
- No checkboxes checked → `not-started`

### Document Detection: Convention-Based Path Resolution

The ai-project-guide methodology follows consistent file naming conventions. Given a project path and a slice index (e.g., `163`), the detector checks for:

- `project-documents/user/slices/{index}-slice.*.md`
- `project-documents/user/tasks/{index}-tasks.*.md`
- `project-documents/user/architecture/{index}-arch.*.md`
- `project-documents/user/architecture/{index}-slices.*.md`

Uses glob matching on the `project-documents/user/` subdirectories. The detector also supports an explicit path check (for `fileHLD`, `fileArch`, etc. which are stored as relative paths on `ProjectData`).

### Section-Aware Parsing for Slice Plans

Slice plans contain multiple sections (Foundation Work, Feature Slices, Integration Work, Future Work, Implementation Order, Notes). The parser must distinguish slice entries from non-slice content. Matching `parse.py`:

- Track current heading; skip sections whose headings match `_NON_SLICE_HEADINGS`: "future work", "implementation order", "notes", "parent document"
- Only parse slice entries (`**(NNN) Name**` bold pattern) from slice-content sections
- Future work parsing is a separate function that reads only the `## Future Work` section

### Split Task File Support

Task files can be split across multiple files (e.g., `163-tasks.artifact-introspection-1.md`, `163-tasks.artifact-introspection-2.md`). The task parser should accept multiple file paths and merge their checkbox items, matching `parse.py`'s `_task_entry` merge logic. The document detector identifies split files by glob pattern.

### Node.js-Only Module

Like `StatementManager`, `SystemPromptParser`, and `FileProjectStore`, the introspection module uses `fs` and `path`. It exports from `@context-forge/core/node`, not the browser-safe `@context-forge/core` entry point.

## Implementation Details

### Type Definitions (`types.ts`)

```typescript
/** Result of parsing a single slice plan entry */
export interface SlicePlanEntry {
  index: number;
  name: string;
  status: 'complete' | 'in-progress' | 'not-started' | 'deprecated';
  isChecked: boolean;
}

/** Result of parsing a slice plan document */
export interface SlicePlanResult {
  filePath: string;
  entries: SlicePlanEntry[];
  totalSlices: number;
  completedSlices: number;
}

/** A single task checkbox item */
export interface TaskItem {
  name: string;
  done: boolean;
}

/** Result of parsing a task file (or merged split files) */
export interface TaskFileResult {
  filePath: string;
  items: TaskItem[];
  totalTasks: number;
  completedTasks: number;
  /** Inferred status based on checkbox state */
  inferredStatus: 'complete' | 'in-progress' | 'not-started';
}

/** Extracted YAML frontmatter fields */
export interface FrontmatterData {
  [key: string]: string;
}

/** Result of frontmatter extraction */
export interface FrontmatterResult {
  filePath: string;
  found: boolean;
  data: FrontmatterData;
}

/** A single future work item */
export interface FutureWorkItem {
  index: string;
  name: string;
  done: boolean;
}

/** Result of future work section parsing */
export interface FutureWorkResult {
  filePath: string;
  items: FutureWorkItem[];
}

/** Result of checking what documents exist for a given slice index */
export interface DocumentDetectionResult {
  sliceDesign: string | null;    // path if found, null if not
  taskFile: string[] | null;     // paths (supports split files), null if none
  architecture: string | null;
  slicePlan: string | null;
}

/** Normalized status values */
export type NormalizedStatus = 'complete' | 'in-progress' | 'not-started' | 'deprecated';

/** Introspection summary suitable for enriching project_get */
export interface IntrospectionSummary {
  slicePlan?: {
    totalSlices: number;
    completedSlices: number;
    summary: string;  // e.g., "7 of 12 slices complete"
  };
  currentTasks?: {
    totalTasks: number;
    completedTasks: number;
    inferredStatus: NormalizedStatus;
    summary: string;  // e.g., "3 of 15 tasks done"
  };
  artifacts: {
    hasSlicePlan: boolean;
    hasHLD: boolean;
    hasArch: boolean;
    hasSpec: boolean;
    hasCurrentSliceDesign: boolean;
    hasCurrentTaskFile: boolean;
  };
}
```

### Interface Definition (`interfaces.ts`)

```typescript
export interface IArtifactIntrospector {
  /** Parse a slice plan and return entries with completion state */
  parseSlicePlan(slicePlanPath: string): Promise<SlicePlanResult>;

  /** Parse a task file (or merged split files) and return checkbox items */
  parseTaskFile(taskFilePaths: string | string[]): Promise<TaskFileResult>;

  /** Extract YAML frontmatter from a markdown file */
  parseFrontmatter(filePath: string): Promise<FrontmatterResult>;

  /** Parse the Future Work section from a slice plan */
  parseFutureWork(slicePlanPath: string, nextIndex?: number): Promise<FutureWorkResult>;

  /** Check what methodology documents exist for a given slice index */
  detectDocuments(projectPath: string, sliceIndex: number): Promise<DocumentDetectionResult>;

  /** Generate an introspection summary for a project (for enriching project_get) */
  summarize(project: ProjectData): Promise<IntrospectionSummary>;
}
```

### ArtifactIntrospector Implementation

The orchestrator class implements `IArtifactIntrospector`. Each method delegates to the corresponding parser function. The `summarize()` method combines multiple parser results into an `IntrospectionSummary`:

1. If `project.fileSlicePlan` and `project.projectPath` are set, parse the slice plan
2. If `project.fileTasks` and `project.projectPath` are set, locate and parse the task file
3. Check existence of referenced artifacts (`fileHLD`, `fileArch`, `fileSpec`)
4. Extract the slice index from `project.fileSlice` (parse the `NNN-` prefix)
5. Check for the current slice's design document

Error handling: each operation is individually try/caught. A failure in slice plan parsing doesn't prevent task file parsing. Results indicate what succeeded and what couldn't be read.

### Enriching `project_get`

The MCP server's `project_get` handler gains an optional introspection enrichment step:

```
project_get(id) {
  project = store.getById(id)
  if (project.projectPath) {
    introspector = new ArtifactIntrospector()
    summary = introspector.summarize(project)
    return { ...project, introspection: summary }
  }
  return project
}
```

The `introspection` field is computed on demand — not stored. This follows the architecture's "read-heavy, write-light" principle. The field is only present when `projectPath` is set; projects without a path get no introspection (progressive enrichment).

### Export Strategy

- `IArtifactIntrospector`, result types, and `NormalizedStatus` export from `@context-forge/core` (browser-safe, types only)
- `ArtifactIntrospector` class and parser functions export from `@context-forge/core/node` (Node.js only, uses `fs`)

## Integration Points

### Provides to Other Slices

- **IArtifactIntrospector interface** — the primary contract for slices 164–166
- **SlicePlanResult** — consumed by Workflow Navigator (164) for position computation and Consistency Checker (165) for status comparison
- **TaskFileResult** — consumed by Workflow Navigator (164) for completion state and Consistency Checker (165) for cross-reference
- **FutureWorkResult** — consumed by Future Work Collector (166) for aggregation
- **FrontmatterResult** — consumed by Consistency Checker (165) for status comparison
- **DocumentDetectionResult** — consumed by Workflow Navigator (164) to determine what a slice needs
- **IntrospectionSummary** — consumed by `project_get` MCP tool for enriched responses

### Consumes from Other Slices

- **Slice 161 (complete)** — artifact reference fields on `ProjectData` tell introspection where to look

## Success Criteria

### Functional Requirements

- Slice plan parsing correctly extracts slice names, checkbox states, indices, and ordering from real slice plan files (including this project's own `160-slices.project-workflow-system.md`)
- Task file parsing correctly counts completed vs. total tasks, including support for split task files
- Future work parsing extracts items from the `## Future Work` section with correct index assignment
- Frontmatter extraction reads `status`, `dateCreated`, `dateUpdated`, `project`, `parent` and other fields from YAML headers
- Document detection reliably checks for existence of expected methodology files given a project path and slice index
- Status normalization handles all variant spellings listed in the status mapping table
- Task status inference correctly derives status from checkbox state when frontmatter is absent or ambiguous
- `project_get` response includes `introspection` field with computed summary when `projectPath` is populated

### Technical Requirements

- All parsers handle missing files gracefully (return empty/null results, no throws)
- All parsers handle malformed files gracefully (partial parse results, no throws)
- Unit tests for each parser function with both valid and edge-case inputs
- Tests use fixture files, not inline strings, for realistic parsing validation
- Module exports from `@context-forge/core/node`; types export from `@context-forge/core`
- No new npm dependencies
- All existing tests continue to pass

## Risk Assessment

### Markdown Format Variation

Slice plans and task files follow conventions, but real files have minor variations: different heading levels, inconsistent spacing, trailing punctuation in checkbox text. The regex patterns from `parse.py` have been validated against real context-forge files, mitigating this. Edge cases will be caught by testing against this project's own methodology documents as fixtures.

## Implementation Notes

### Development Approach

Suggested implementation order:

1. **Types and interfaces** — `types.ts`, `interfaces.ts`
2. **Status normalizer** — smallest parser, validates the pattern
3. **Frontmatter parser** — used by several other parsers
4. **Task file parser** — straightforward checkbox counting
5. **Slice plan parser** — section-aware entry extraction
6. **Future work parser** — similar to slice plan but different section/format
7. **Document detector** — glob-based file discovery
8. **ArtifactIntrospector** — orchestrator wiring parsers together
9. **`project_get` enrichment** — MCP server integration
10. **Fixture-based integration tests** — validate against real project files

### Testing Strategy

- **Parser unit tests:** Each parser gets its own test file with fixture markdown files (valid, empty, malformed)
- **Orchestrator tests:** `ArtifactIntrospector` tested with a fixture project directory containing representative methodology files
- **MCP integration:** `project_get` enrichment tested in `packages/mcp-server/tests/` against fixture project
- **Real-world validation:** Include this project's own `160-slices.project-workflow-system.md` as a test fixture to validate against production data

### Reference Implementation Mapping

Key `parse.py` functions → Context Forge equivalents:

| parse.py | Context Forge module | Notes |
|---|---|---|
| `parse_frontmatter()` | `parsers/frontmatterParser.ts` | Direct port |
| `parse_task_items()` | `parsers/taskFileParser.ts` | Direct port |
| `parse_plan_slices()` | `parsers/slicePlanParser.ts` | Direct port |
| `parse_future_work()` | `parsers/futureWorkParser.ts` | Direct port |
| `norm_status()` | `parsers/statusNormalizer.ts` | Direct port |
| `scan_directory()` | `parsers/documentDetector.ts` | Adapted — scans for specific index, not full registry |
| `_task_entry()` | `ArtifactIntrospector.parseTaskFile()` | Merge + status inference logic |
| `build_model()` | Not ported | Visualization-specific; replaced by `summarize()` |

### Effort

3/5 — moderate scope with well-defined parsing patterns from the reference implementation. The main work is porting proven logic, not inventing new algorithms.

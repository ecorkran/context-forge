---
docType: slice-design
slice: project-create-mcp-tool
project: context-forge
parent: user/architecture/200-slices.developer-onboarding.md
dependencies: []
interfaces: [204-onboarding-skill]
dateCreated: 20260314
dateUpdated: 20260315
status: complete
---

# Slice 201: project_create MCP Tool

## Overview

Add a `project_create` MCP tool that enables AI agents to create Context Forge projects conversationally via MCP. This fills the gap where projects can only be created via the CLI (`cf init`). The tool is a thin wrapper over the existing `FileProjectStore.create()` with input validation and duplicate-path detection.

## Value

Enables AI agents to set up CF projects without requiring the user to drop to the CLI. Foundation for the onboarding skill (slice 204) and conversational project creation flows. Also enables programmatic project creation from any MCP client.

## Technical Scope

**Included:**
- New `project_create` tool registered in `projectTools.ts`
- Input validation (required fields, path normalization)
- Duplicate-path detection with clear error messaging
- Sensible defaults (template: `"default"`, instruction: `"implementation"`, developmentPhase: `"Phase 1: Concept"`, dateProject: today)
- Response matching `project_get` shape (full ProjectData + introspection)
- Unit tests

**Excluded:**
- Guide installation, command installation, IDE configuration (separate operations per MCP atomic tool philosophy)
- Interactive prompts or wizard flows
- Directory creation or git initialization (the tool registers a project, it doesn't set up the filesystem)

## Dependencies

### Prerequisites
- None. Builds on existing 160-band infrastructure (`FileProjectStore`, `ArtifactIntrospector`, `registerProjectTools`).

### Interfaces Required
- `FileProjectStore.create(data: CreateProjectData)` — already implemented
- `FileProjectStore.getAll()` — for duplicate-path detection
- `ArtifactIntrospector.summarize(project)` — for enriching response with introspection (same pattern as `project_get`)

## Architecture

### Data Flow

```
MCP Client
  │
  └─ project_create { name, projectPath?, developmentPhase? }
       │
       ├─ Validate required fields (name)
       ├─ Normalize projectPath (resolve, trim)
       ├─ Check for duplicate path via store.getAll()
       │   └─ If duplicate: return errorResult with suggestion to use project_get
       ├─ Set defaults: template="default", instruction="implementation",
       │   developmentPhase="Phase 1: Concept", dateProject=YYYYMMDD
       ├─ store.create(data) → ProjectData
       ├─ Enrich with introspection (if projectPath set)
       └─ Return jsonResult({ ...project, introspection? })
```

## Implementation Details

### Tool Registration

Added to `registerProjectTools()` in `packages/mcp-server/src/tools/projectTools.ts`, following the existing pattern. Placed between `project_list` and `project_get` (logical ordering: list → create → get → update → schema).

### Tool Specification

**Name:** `project_create`
**Title:** `Create Project`

**Parameters:**

| Parameter | Type | Required | Description |
|---|---|---|---|
| `name` | string | yes | Project display name |
| `projectPath` | string | no | Absolute path to project root. When omitted, the project is created without a path (can be set later via `project_update`). |
| `developmentPhase` | string | no | Initial development phase. Defaults to `"Phase 1: Concept"`. |

**Annotations:** `{ destructiveHint: false, idempotentHint: false, openWorldHint: false }`

Not idempotent — calling twice with the same path returns an error on the second call. Not destructive — creates, never deletes or overwrites.

### Input Validation

- `name` is required and must be a non-empty string (after trim)
- `projectPath`, when provided, is resolved to an absolute path via `path.resolve()` and trimmed
- Duplicate-path detection: iterate `store.getAll()`, compare normalized `projectPath`. If match found, return error: `"A project is already registered at this path: '{name}' (ID: {id}). Use project_get to retrieve it."`

### Default Values

| Field | Default | Rationale |
|---|---|---|
| `template` | `"default"` | Standard template, matches CLI behavior |
| `instruction` | `"implementation"` | Default instruction type, matches CLI |
| `developmentPhase` | `"Phase 1: Concept"` | New projects start in concept phase |
| `dateProject` | Today (YYYYMMDD format) | Matches CLI pattern; formatted as `YYYYMMDD` string |
| `fileSlice` | `""` | No active slice on creation |

### Response Shape

Matches `project_get` response: full `ProjectData` object, optionally enriched with `introspection` when `projectPath` is set and introspection succeeds. Introspection failure is non-fatal (graceful degradation, same as `project_get`).

```typescript
// Success response
{
  id: "project_1710...",
  name: "my-project",
  template: "default",
  fileSlice: "",
  fileTasks: "",
  instruction: "implementation",
  developmentPhase: "Phase 1: Concept",
  dateProject: "20260314",
  projectPath: "/Users/user/projects/my-project",
  createdAt: "2026-03-14T...",
  updatedAt: "2026-03-14T...",
  introspection: { ... }  // when projectPath set and introspection succeeds
}
```

### dateProject Formatting

The CLI currently passes `dateProject` as whatever the user provides (often undefined). The slice plan specifies "Sets `dateProject` to today." Format as `YYYYMMDD` string (e.g., `"20260314"`) — this matches the project guide conventions and existing `dateCreated`/`dateUpdated` patterns in document frontmatter.

```typescript
const today = new Date();
const dateProject = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, '0')}${String(today.getDate()).padStart(2, '0')}`;
```

## Integration Points

### Provides to Other Slices
- **204 (Onboarding Skill):** The skill references `project_create` by name and uses it as the first step in conversational onboarding.
- **202 (Smart cf init):** Independent — `cf init` uses `FileProjectStore.create()` directly, not the MCP tool. But both follow the same defaults.

### Consumes from Other Slices
- None. This is a foundation slice with no dependencies on other 200-band slices.

## Success Criteria

1. `project_create` tool registered and callable via MCP
2. Project created with correct defaults (template: `"default"`, instruction: `"implementation"`, developmentPhase: `"Phase 1: Concept"`, dateProject: today as YYYYMMDD)
3. Duplicate path detection returns clear error message with existing project name and ID
4. Response matches `project_get` shape (full ProjectData + introspection when path available)
5. Missing `name` parameter returns clear validation error
6. Existing `project_list`, `project_get`, `project_update`, `project_schema` behavior unchanged
7. Unit tests cover: successful creation, creation with defaults only, duplicate path rejection, missing required params, introspection enrichment

### Verification Walkthrough

#### 1. Create a project with all parameters

```
→ project_create { name: "My CLI Tool", projectPath: "/Users/user/my-cli-tool", developmentPhase: "Phase 2: Specification" }
← {
    id: "project_171...",
    name: "My CLI Tool",
    template: "default",
    fileSlice: "",
    instruction: "implementation",
    developmentPhase: "Phase 2: Specification",
    dateProject: "20260314",
    projectPath: "/Users/user/my-cli-tool",
    ...
  }
```

#### 2. Create a project with minimal parameters

```
→ project_create { name: "Quick Project" }
← {
    id: "project_171...",
    name: "Quick Project",
    template: "default",
    developmentPhase: "Phase 1: Concept",
    dateProject: "20260314",
    projectPath: undefined,
    ...
  }
```

#### 3. Duplicate path detection

```
→ project_create { name: "Another Project", projectPath: "/Users/user/my-cli-tool" }
← Error: A project is already registered at this path: 'My CLI Tool' (ID: project_171...). Use project_get to retrieve it.
```

#### 4. Missing name

```
→ project_create { }
← Error: Project name is required.
```

#### 5. Verify via project_list

```
→ project_list {}
← { projects: [..., { name: "My CLI Tool", ... }], count: N }
```

## Implementation Notes

### File Changes
- **Modified:** `packages/mcp-server/src/tools/projectTools.ts` — add `project_create` tool registration
- **Modified:** `packages/mcp-server/tests/projectTools.test.ts` — add unit tests for `project_create`
- **Modified:** `packages/mcp-server/tests/serverLifecycle.test.ts` — update tool count/list if tested

### Testing Strategy
- Mock `FileProjectStore` (same pattern as existing `projectTools.test.ts`)
- Test cases: successful creation, defaults applied, duplicate path error, missing name error, introspection enrichment, introspection failure graceful degradation
- Existing tests pass unchanged

### Effort
1/5 — Thin wrapper over existing `FileProjectStore.create()`. Follows established patterns in `projectTools.ts`. No new infrastructure.

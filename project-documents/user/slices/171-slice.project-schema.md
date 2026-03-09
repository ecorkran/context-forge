---
docType: slice-design
slice: project-schema
project: context-forge
parent: user/architecture/160-slices.project-workflow-system.md
dependencies: [170-project-model-cleanup]
interfaces: []
dateCreated: 20260305
dateUpdated: 20260305
status: complete
---

# Slice Design: Project Schema Visibility & Smart Field Setting

## Overview

This slice makes the project data model discoverable and ergonomic. Currently, users and agents must read source code to know what fields exist on `ProjectData`, artifact reference fields are silently omitted from `cf project get` output, and `cf project set` requires exact field names and exact value strings. This slice adds schema introspection, complete field display, smart aliases with value resolution, project removal, and Electron refresh — closing the discoverability and usability gaps in the project management surface.

## Value

- **Discoverability**: Users and agents can inspect the full project schema without reading source code — via `cf project --schema` or the `project_schema` MCP tool.
- **Completeness**: `cf project get` shows all populated fields including artifact references, grouped logically.
- **Ergonomics**: `cf project set phase 4` resolves to `Phase 4: Slice Design`. Field aliases (`arch`, `plan`, `hld`, etc.) eliminate memorization of exact field names.
- **Lifecycle**: `cf project rm` provides the inverse of `cf init`.
- **Consistency**: Projects created via CLI/MCP appear in Electron without restart.

## Technical Scope

### Included

- **a)** Schema definition module and CLI/MCP exposure (`cf project --schema`, `project_schema` MCP tool)
- **b)** Updated `cf project get` display showing all populated fields with logical grouping
- **c)** Smart `cf project set` with field aliases, phase/instruction resolution, case-insensitive matching, enum validation
- **d)** `cf project rm` command with confirmation prompt
- **e)** Electron project list refresh on external `projects.json` changes

- **f)** Top-level `cf set` / `cf get` shortcuts (shorthand for `cf project set` / `cf project get`)
- **g)** `cf set --help` and `cf get --help` show available fields/aliases so users can discover what's settable
- **h)** `cf get` shows all fields (including unset ones, displayed as empty/placeholder) so users know what exists
- **i)** Smart value inference — short inputs resolve intelligently (phase numbers, short names already work; extend pattern where useful)

### Excluded

- Changes to the `ProjectData` type itself (no new fields, no field renames — that was slice 161)
- Changes to the config system
- Workflow tools (slices 165, 166)

## Dependencies

### Prerequisites

- **Slice 170** (Project Model Cleanup & CLI Init) — must be complete so we document the clean model. ✅ Complete.
- All foundation slices (161-164, 167-170) are complete.

### Interfaces Required

- `ProjectData` type from `packages/core/src/types/project.ts`
- `FileProjectStore` from `packages/core/src/storage/FileProjectStore.ts`
- `resolveProjectId` from `packages/cli/src/utils/project.ts`
- Electron IPC handlers from `packages/electron/src/main/ipc/projectHandlers.ts`

## Architecture

### Component Structure

```
packages/core/src/schema/
  projectSchema.ts          # Single source of truth: field metadata, aliases,
                            # phase maps, instruction maps, enum definitions

packages/cli/src/commands/
  project.ts                # Extended: --schema flag, rm subcommand,
                            # smart set with alias/resolution

packages/mcp-server/src/tools/
  projectTools.ts           # New: project_schema tool

packages/electron/src/main/ipc/
  projectHandlers.ts        # Add: projects.json file watcher
```

### Data Flow

**Schema query** (`cf project --schema` or `project_schema` MCP tool):
```
SchemaDefinition (core) → formatter (CLI) or JSON response (MCP)
```

**Smart field set** (`cf project set phase 4`):
```
User input ("phase", "4")
  → resolve alias: "phase" → "developmentPhase"
  → resolve value: "4" → "Phase 4: Slice Design"
  → validate: check against enum (if applicable)
  → call projectStore.update()
```

**Electron refresh**:
```
projects.json modified on disk (by CLI/MCP)
  → fs.watch triggers debounced reload
  → IPC event pushes updated list to renderer
  → ProjectSelector re-renders
```

## Technical Decisions

### Schema Definition as Single Source of Truth

Create `packages/core/src/schema/projectSchema.ts` containing:

```typescript
// Field metadata for each ProjectData field
interface FieldDefinition {
  field: string;           // canonical field name (e.g. "developmentPhase")
  type: string;            // display type (e.g. "string", "enum", "object")
  required: boolean;
  group: FieldGroup;       // identity | workflow | artifacts | metadata
  description: string;
  aliases: string[];       // e.g. ["phase"] for developmentPhase
  enumValues?: string[];   // for enum fields
}

type FieldGroup = 'identity' | 'artifacts' | 'workflow' | 'metadata';
```

**Field grouping order** (for display):

1. **Identity**: `name`, `id`, `projectPath`, `template`
2. **Artifacts**: `fileArch`, `fileSlicePlan`, `fileHLD`, `fileSpec`, `fileSlice`, `fileTasks`
3. **Workflow**: `developmentPhase`, `instruction`, `workType`, `dateProject`
4. **Metadata**: `createdAt`, `updatedAt`

**Note:** `customData` sub-fields (`recentEvents`, `additionalNotes`, `availableTools`) are displayed as a nested group within workflow or as a separate "custom" group.

### Field Aliases

| Alias | Canonical Field |
|-------|----------------|
| `phase` | `developmentPhase` |
| `date` | `dateProject` |
| `arch` | `fileArch` |
| `slice` | `fileSlice` |
| `tasks` | `fileTasks` |
| `plan` | `fileSlicePlan` |
| `hld` | `fileHLD` |
| `spec` | `fileSpec` |
| `path` | `projectPath` |

All alias resolution is **case-insensitive**. Canonical field names are also case-insensitive for `cf project set`.

### Phase Resolution

Accepts: phase number (1-7), short name, or full phase string. Case-insensitive.

| Input | Resolves To |
|-------|-------------|
| `1` | `Phase 1: Concept` |
| `2` | `Phase 2: Architecture` |
| `3` | `Phase 3: Slice Planning` |
| `4` | `Phase 4: Slice Design` |
| `5` | `Phase 5: Task Breakdown` |
| `6` | `Phase 6: Implementation` |
| `7` | `Phase 7: Integration` |
| `concept` | `Phase 1: Concept` |
| `architecture` | `Phase 2: Architecture` |
| `slice-planning` | `Phase 3: Slice Planning` |
| `slice-design` | `Phase 4: Slice Design` |
| `task-breakdown` | `Phase 5: Task Breakdown` |
| `implementation` | `Phase 6: Implementation` |
| `integration` | `Phase 7: Integration` |
| `ad-hoc-tasks` | `Ad-Hoc Tasks` |
| `custom-instruction` | `Custom Instruction` |

The phase map is defined in `packages/core/src/schema/projectSchema.ts` — the same map used by the Electron form's `PHASE_OPTIONS`, the CLI resolver, and schema display. The Electron form's `PHASE_OPTIONS` should import from this shared definition in a follow-up if needed (not required for this slice, as Electron form already works — but the core map is the canonical source).

### Instruction Resolution

The `instruction` field currently accepts the same values as `developmentPhase` — the Electron form sets both simultaneously. For `cf project set instruction <value>`, apply the same resolution as phase (number, short name, or full string).

### Enum Validation

Fields with constrained values:
- `workType`: `'start' | 'continue'`
- `developmentPhase`: any value from the phase map
- `instruction`: any value from the phase map

On invalid input, display error with allowed values:
```
Error: Invalid value "foo" for field "workType"
Allowed values: start, continue
```

### Electron Refresh Strategy

Use `fs.watch` on the `projects.json` file path with debounced reload (300ms). When change is detected:
1. Re-read projects from `FileProjectStore`
2. Send IPC event `project:list-changed` to renderer
3. Renderer updates project list state

`fs.watch` is sufficient here — we're watching a single known file, not a directory tree. The watcher is created once in the main process when the app starts.

Fallback: If `fs.watch` proves unreliable on any platform, add a manual "Refresh" button to `ProjectSelector` as backup. Both approaches may coexist.

## Implementation Details

### API Contracts

#### `project_schema` MCP Tool

**Input:** None (no parameters).

**Output:** Structured JSON array of field definitions:
```json
{
  "fields": [
    {
      "field": "name",
      "type": "string",
      "required": true,
      "group": "identity",
      "description": "Project display name",
      "aliases": []
    },
    {
      "field": "developmentPhase",
      "type": "string",
      "required": false,
      "group": "workflow",
      "description": "Current methodology phase",
      "aliases": ["phase"],
      "enumValues": ["Phase 1: Concept", "Phase 2: Architecture", "..."]
    }
  ],
  "aliases": {
    "phase": "developmentPhase",
    "date": "dateProject",
    "arch": "fileArch",
    "slice": "fileSlice",
    "tasks": "fileTasks",
    "plan": "fileSlicePlan",
    "hld": "fileHLD",
    "spec": "fileSpec",
    "path": "projectPath"
  },
  "groups": ["identity", "artifacts", "workflow", "metadata"]
}
```

#### `cf project --schema` CLI Output

Formatted table grouped by category:
```
Project Schema
══════════════

Identity
  name            string    (required)  Project display name
  id              string    (readonly)  Auto-generated project identifier
  projectPath     string    (required)  Absolute path to project directory
                                        Aliases: path
  template        string                Context template name

Artifacts
  fileArch        string                Architecture document path (relative)
                                        Aliases: arch
  fileSlicePlan   string                Slice plan document path (relative)
                                        Aliases: plan
  fileHLD         string                High-level design document path
                                        Aliases: hld
  ...

Workflow
  developmentPhase  string              Current methodology phase
                                        Aliases: phase
                                        Values: Phase 1: Concept, Phase 2: Architecture, ...
  ...
```

#### `cf project rm`

```
Usage: cf project rm [--project <name|id>] [--yes]

Resolves project via --project flag or CWD detection.
Prints project name and path, asks for confirmation unless --yes.
Removes entry from projects.json. Does not delete files on disk.
```

### Updated `cf project get` Display

Current output omits artifact fields. Updated output groups all populated fields:

```
Project: context-forge
═══════════════════════

Identity
  Name          context-forge
  ID            abc-123
  Path          ~/source/repos/manta/context-forge
  Template      templates/react

Artifacts
  Architecture  user/architecture/160-arch.project-workflow-system.md
  Slice Plan    user/architecture/160-slices.project-workflow-system.md
  Slice         171-slice.project-schema
  Tasks         171-tasks.project-schema

Workflow
  Phase         Phase 4: Slice Design
  Instruction   slice-design
  Work Type     continue
  Date          2026-03-04

Metadata
  Created       2026-01-15T10:30:00Z
  Updated       2026-03-04T14:22:00Z
```

Empty groups are omitted. Within a group, empty fields are omitted.

## Integration Points

### Provides to Other Slices

- **Schema definition module** (`packages/core/src/schema/projectSchema.ts`) — canonical field metadata, aliases, phase maps. Consumable by any package that needs to understand the project data model.
- **Electron refresh pattern** — `fs.watch` + IPC event pattern can be reused for other store files if needed.

### Consumes from Other Slices

- **ProjectData type** (slice 161) — field definitions drive the schema metadata
- **FileProjectStore** (slice 161) — CRUD operations for rm and refresh
- **resolveProjectId** (slice 169) — project resolution for rm command
- **CLI formatting utilities** (slice 169) — table rendering, chalk styling

## Success Criteria

### Functional Requirements

- `cf project --schema` displays all fields with types, groups, aliases, and descriptions
- `project_schema` MCP tool returns equivalent structured JSON
- `cf project get` displays all populated fields including artifact references
- Fields are grouped logically (identity, artifacts, workflow, metadata) in formatted output
- `cf project set phase 4` resolves to `Phase 4: Slice Design`
- `cf project set phase implementation` resolves to `Phase 6: Implementation`
- `cf project set date 2026-03-04` sets `dateProject`
- Field names and aliases are case-insensitive
- Invalid enum values produce helpful error with allowed values listed
- Schema definition is single-source (no duplication between CLI and MCP)
- `cf project rm` removes project from store with confirmation prompt
- `cf project rm --yes` skips confirmation
- Projects created via CLI appear in Electron without restart

### Technical Requirements

- Phase and alias maps defined once in `packages/core/src/schema/`
- All existing tests pass with updated display format
- New unit tests for: alias resolution, phase resolution, case-insensitive matching, enum validation, schema output, rm command
- Electron file-watch tests (or manual verification if fs.watch is hard to unit test)

## Implementation Notes

### Development Approach

Suggested implementation order:

1. **Schema definition module** in core — field metadata, aliases, phase maps, enum definitions. This is the foundation everything else imports.
2. **Smart `cf project set`** — alias resolution, phase resolution, case-insensitive matching, validation. Highest ergonomic value.
3. **Updated `cf project get` display** — grouped output with artifact fields. Quick win once schema module exists.
4. **`cf project --schema` CLI command** — formats schema metadata for display.
5. **`project_schema` MCP tool** — returns schema as JSON.
6. **`cf project rm` command** — confirmation prompt, store deletion.
7. **Electron refresh** — `fs.watch` on `projects.json`, IPC event to renderer.

### Special Considerations

- The Electron form's `PHASE_OPTIONS` currently duplicates phase definitions. The core schema module becomes the canonical source. Refactoring the Electron form to import from core is desirable but optional for this slice — the Electron form already works correctly. The important thing is that the core module exists as the source of truth going forward.
- `fs.watch` behavior varies across platforms. On macOS (current primary platform), it's reliable for single-file watching. Linux `inotify` is also reliable. Windows may need `fs.watchFile` as fallback. Start with `fs.watch` and add fallback only if issues arise.
- `cf project rm` must not delete files on disk. It only removes the store entry. This distinction should be clear in the confirmation message: "Remove project 'context-forge' from Context Forge? (files on disk will not be deleted)"

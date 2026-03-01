---
docType: slice-design
slice: project-schema-standardization
project: context-forge
parent: user/architecture/160-slices.project-workflow-system.md
dependencies: []
interfaces: [162-config-system, 163-artifact-introspection-engine]
status: complete
dateCreated: 20260226
dateUpdated: 20260228
---

# Slice 161: Project Schema Standardization

## Overview

This slice normalizes `ProjectData` field naming conventions and adds artifact reference fields. It is the foundational data model change for the 160-band initiative — all subsequent slices (162–167) depend on a stable, consistent schema.

The work is a **schema migration + refactoring** slice: rename three fields, add four new optional fields, update all consumers, and migrate stored project data without breakage.

## Value

- **Consistency**: All file-reference fields follow `fileX` convention; all date fields follow `dateX` convention. Eliminates naming inconsistencies that create cognitive friction and bugs.
- **Artifact awareness**: New `fileHLD`, `fileArch`, `fileSlicePlan`, `fileSpec` fields enable Context Forge to reference project architecture documents — prerequisite for automatic document inclusion in context assembly (Slice 163).
- **Foundation**: Enables Slices 162–167 to build on a clean, predictable data model without working around legacy naming.

## Technical Scope

### Included

1. **Field renames in `ProjectData`** (and all derived types):
   - `slice` → `fileSlice`
   - `taskFile` → `fileTasks`
   - `projectDate` → `dateProject`

2. **New optional fields on `ProjectData`**:
   - `fileHLD?: string`
   - `fileArch?: string`
   - `fileSlicePlan?: string`
   - `fileSpec?: string`

3. **Schema migration** in `FileProjectStore`:
   - Read old-schema JSON without error (map old field names to new)
   - Write new-schema on any create/update
   - Migration is idempotent

4. **Consumer updates** — every file that references the renamed fields

5. **MCP tool schema updates**:
   - `project_update` input schema uses new field names
   - `project_get` / `project_list` output uses new field names
   - New artifact fields are settable via `project_update`

6. **Context pipeline updates**:
   - `ContextData` and `EnhancedContextData` adopt new field names
   - `ContextIntegrator.mapProjectToEnhancedContext()` maps new names
   - `ContextTemplateEngine.validateInputData()` validates `fileSlice` (not `slice`)
   - Template variables updated accordingly

### Excluded

- Automatic inclusion of referenced documents in context assembly (Slice 163)
- Config system changes (Slice 162)
- Any new MCP tools — only schema changes to existing tools
- UI changes (no Electron UI currently active)

## Architecture

### Data Flow: Field Rename Propagation

```
ProjectData (source of truth)
  ├── CreateProjectData (derived via Omit + Pick)
  ├── UpdateProjectData (derived via Partial<Pick>)
  │
  ├── FileProjectStore
  │   ├── migrateProjectFields() — old→new field mapping on read
  │   ├── create() — writes new schema
  │   └── update() — writes new schema
  │
  ├── MCP Tools (projectTools.ts)
  │   ├── ProjectSummary interface
  │   ├── toSummary() mapping function
  │   └── project_update inputSchema (Zod)
  │
  └── Context Pipeline
      ├── ContextData interface
      ├── EnhancedContextData interface
      ├── ContextIntegrator.mapProjectToEnhancedContext()
      ├── ContextIntegrator.mapProjectToContext() (legacy)
      ├── ContextIntegrator.getErrorContext()
      ├── ContextIntegrator.validateProject()
      ├── ContextTemplateEngine.validateInputData()
      ├── ContextTemplateEngine.getErrorContext()
      └── TemplateProcessor (template variable names)
```

### Field Rename Map

| Current Name    | New Name       | Type     | Notes                           |
|-----------------|----------------|----------|---------------------------------|
| `slice`         | `fileSlice`    | `string` | Required field                  |
| `taskFile`      | `fileTasks`    | `string` | Required field (defaults to '') |
| `projectDate`   | `dateProject`  | `string?`| Optional field                  |

### New Fields

| Field Name      | Type     | Purpose                                |
|-----------------|----------|----------------------------------------|
| `fileHLD`       | `string?`| Path to project HLD document           |
| `fileArch`      | `string?`| Path to architecture document          |
| `fileSlicePlan` | `string?`| Path to current slice plan             |
| `fileSpec`      | `string?`| Path to project specification          |

All artifact reference fields store relative paths from the project root (the directory containing `project-documents/`). Example: `project-documents/user/architecture/050-arch.hld-context-forge.md`.

## Technical Decisions

### Template Variable Naming

**Decision:** Template variables in prompt files follow the new field names (`fileSlice`, `fileTasks`, `dateProject`).

**Rationale:** The template system resolves variables from `ContextData`/`EnhancedContextData`. Keeping template variable names aligned with the data model eliminates a mapping layer and reduces confusion. The `TemplateProcessor` already handles `{{variableName}}` resolution directly from the data object.

**Impact:** Any custom prompt templates referencing `{{slice}}`, `{{taskFile}}`, or `{{projectDate}}` must be updated. Since prompt templates are project-local (in `project-documents/`), this is a documentation concern — the migration section covers this.

### Migration Strategy: Read-Normalize, Write-New

**Decision:** `migrateProjectFields()` handles both old and new field names on read; all writes use the new schema exclusively.

**Rationale:** This is the simplest idempotent approach. A project file written with old names gets normalized on read. Once any update is saved, the file contains new names. No separate migration command or bulk-migration step needed — migration happens organically through normal usage.

**Implementation pattern:**
```typescript
function migrateProjectFields(project: Record<string, unknown>): ProjectData {
  return {
    // ...existing migrations...
    // New field renames: prefer new name, fall back to old name
    fileSlice: (project.fileSlice ?? project.slice ?? '') as string,
    fileTasks: (project.fileTasks ?? project.taskFile ?? '') as string,
    dateProject: (project.dateProject ?? project.projectDate) as string | undefined,
    // New artifact fields: default to undefined (truly optional)
    fileHLD: project.fileHLD as string | undefined,
    fileArch: project.fileArch as string | undefined,
    fileSlicePlan: project.fileSlicePlan as string | undefined,
    fileSpec: project.fileSpec as string | undefined,
  };
}
```

### MCP Tool Schema: Clean Break on Input, Backward-Friendly on Output

**Decision:** `project_update` input schema accepts new field names only. `project_get`/`project_list` output uses new field names only.

**Rationale:** MCP tool schemas are defined in code and consumed by AI agents (not persisted). There is no backward-compatibility contract for MCP tool input/output schemas — the tool descriptions and parameter names can change freely between versions. A clean break avoids dual-name confusion.

### ContextData/EnhancedContextData: Rename to Match

**Decision:** `ContextData.slice` → `ContextData.fileSlice`, `ContextData.taskFile` → `ContextData.fileTasks`, `ContextData.projectDate` → `ContextData.dateProject`.

**Rationale:** `ContextData` is an internal intermediate type. There is no external consumer that depends on its shape. Keeping it aligned with `ProjectData` avoids a translation layer.

## Implementation Details

### Migration Plan

#### Source → Destination Field Map

| Source (stored JSON)       | Destination (`ProjectData`) | Migration Logic                        |
|----------------------------|-----------------------------|----------------------------------------|
| `slice` (old)              | `fileSlice`                 | `project.fileSlice ?? project.slice`   |
| `taskFile` (old)           | `fileTasks`                 | `project.fileTasks ?? project.taskFile`|
| `projectDate` (old)        | `dateProject`               | `project.dateProject ?? project.projectDate` |
| (not present)              | `fileHLD`                   | `undefined` if absent                 |
| (not present)              | `fileArch`                  | `undefined` if absent                 |
| (not present)              | `fileSlicePlan`             | `undefined` if absent                 |
| (not present)              | `fileSpec`                  | `undefined` if absent                 |

#### Consumer Update Matrix

| File                                  | Changes Required                                             |
|---------------------------------------|--------------------------------------------------------------|
| `core/src/types/project.ts`           | Rename fields in `ProjectData`, `CreateProjectData`, `UpdateProjectData` |
| `core/src/types/context.ts`           | Rename fields in `ContextData`, `EnhancedContextData`        |
| `core/src/storage/FileProjectStore.ts`| Update `migrateProjectFields()`, `create()` field mapping    |
| `mcp-server/src/tools/projectTools.ts`| Update `ProjectSummary`, `toSummary()`, `project_update` Zod schema |
| `core/src/services/ContextIntegrator.ts` | Update `mapProjectToEnhancedContext()`, `mapProjectToContext()`, `getErrorContext()`, `validateProject()` |
| `core/src/services/ContextTemplateEngine.ts` | Update `validateInputData()`, `getErrorContext()`      |
| `core/src/services/SectionBuilder.ts` | Update any references to `slice`/`taskFile` in template building |
| `core/src/services/TemplateProcessor.ts` | Update template variable resolution if hard-coded        |
| Test files                            | Update all test fixtures and assertions using old field names |

#### Prompt Template Migration

Custom prompt templates in `project-documents/ai-project-guide/` that use `{{slice}}`, `{{taskFile}}`, or `{{projectDate}}` must be updated to `{{fileSlice}}`, `{{fileTasks}}`, `{{dateProject}}`. This is a find-and-replace operation scoped to `.md` files with template variable syntax.

### MCP Tool Schema Updates

**`project_update` — new input fields:**
```typescript
fileSlice: z.string().optional().describe('Current slice name'),
fileTasks: z.string().optional().describe('Task file name'),
dateProject: z.string().optional().describe('Project date string'),
fileHLD: z.string().optional().describe('Path to HLD document (relative to project root)'),
fileArch: z.string().optional().describe('Path to architecture document (relative to project root)'),
fileSlicePlan: z.string().optional().describe('Path to slice plan (relative to project root)'),
fileSpec: z.string().optional().describe('Path to project spec (relative to project root)'),
```

**`project_list` — updated `ProjectSummary`:**
```typescript
interface ProjectSummary {
  id: string;
  name: string;
  fileSlice: string;    // was: slice
  template: string;
  instruction: string;
  isMonorepo: boolean;
  projectPath: string | undefined;
  updatedAt: string;
}
```

## Integration Points

### Provides To

- **Slice 162 (Config System):** Stable `ProjectData` schema with consistent naming for config layer to consume
- **Slice 163 (Artifact Introspection):** `fileHLD`, `fileArch`, `fileSlicePlan`, `fileSpec` fields for automatic document inclusion in context assembly
- **All 160-band slices:** Consistent, predictable field naming

### Consumes From

- **140-band (complete):** `FileProjectStore`, `ContextIntegrator`, `ContextTemplateEngine`, MCP tool registration infrastructure

## Success Criteria

- [x] All `ProjectData` fields follow consistent naming (`fileX` for file references, `dateX` for dates)
- [x] Four new artifact reference fields (`fileHLD`, `fileArch`, `fileSlicePlan`, `fileSpec`) exist on `ProjectData` and are settable via `project_update`
- [x] Stored projects with old field names load correctly (migration on read)
- [x] Migration is idempotent — reading a migrated project produces identical output
- [x] All existing tests pass with updated field names
- [x] `project_get`, `project_list`, `project_update` MCP tools use new field names in both input and output
- [x] Context generation pipeline (`ContextIntegrator` → `ContextTemplateEngine`) produces correct output with renamed fields
- [x] No old field names remain in source code (except inside `migrateProjectFields()` for backward compatibility)
- [x] Build succeeds with no type errors

## Implementation Notes

### Suggested Implementation Order

1. Update `ProjectData`, `CreateProjectData`, `UpdateProjectData` in `project.ts`
2. Update `ContextData`, `EnhancedContextData` in `context.ts`
3. Update `migrateProjectFields()` in `FileProjectStore.ts` (add old→new fallback logic)
4. Update `create()` in `FileProjectStore.ts` (use new field names)
5. Update `ContextIntegrator` mappings and error context
6. Update `ContextTemplateEngine` validation and error context
7. Update `SectionBuilder` and `TemplateProcessor` if they reference old names
8. Update MCP tools (`ProjectSummary`, `toSummary()`, Zod schemas)
9. Update prompt templates (`{{slice}}` → `{{fileSlice}}`, etc.)
10. Update all test files
11. Build and run tests

### Testing Strategy

- **Unit tests**: Verify `migrateProjectFields()` handles all three scenarios:
  1. Old-schema input (only old field names) → produces new field names
  2. New-schema input (only new field names) → produces new field names (idempotent)
  3. Mixed-schema input (both old and new) → new names take precedence
- **Integration tests**: Verify round-trip: create project → read back → fields use new names
- **MCP tool tests**: Verify `project_update` accepts new field names, `project_get` returns new field names
- **Context generation tests**: Verify full context output with renamed fields

### Effort

3/5 — Wide consumer surface but all changes are mechanical renames plus straightforward migration logic. No new architectural patterns introduced.

---
docType: slice-design
slice: smart-field-setting
project: context-forge
parent: user/architecture/160-slices.project-workflow-system.md
dependencies: [171-project-schema]
interfaces: []
dateCreated: 20260306
dateUpdated: 20260305
status: complete
---

# Slice Design: Smart Field Setting

## Overview

This slice extends the schema-driven `cf set` with two remaining capabilities: settable customData sub-fields (`events`, `notes`, `tools`) and index-based file resolution (`cf set slice 171` finds the matching file automatically). A third capability (no-args usage hint) was already implemented during slice 171 refinement.

## Value

- **Full CLI parity with Electron**: All fields settable from the terminal — no need to switch to Electron to update Recent Events, Notes, or Tools.
- **Typing efficiency**: `cf set slice 171` instead of `cf set slice 171-slice.project-schema`. Index-based resolution removes the need to remember or look up full filenames.
- **Discoverability**: customData fields appear in `cf set --help` and `cf get` alongside all other fields.

## Technical Scope

### Included

- **a)** customData sub-fields as schema fields with aliases (`events`, `notes`, `tools`)
- **b)** Index-based file resolution for artifact fields (`cf set slice 171` → scans for `171-slice.*.md`)
- **c)** ~~No-args usage hint~~ (already complete from slice 171 work)

### Excluded

- Cascading/containment set (e.g. `cf set tasks 171:` auto-setting arch, plan, etc.) — future workflow navigator feature
- Changes to the `ProjectData` type (customData structure is already correct)
- MCP tool changes (MCP `project_update` already accepts customData)

## Dependencies

### Prerequisites

- **Slice 171** (Project Schema) — provides `projectSchema.ts`, `projectSetAction`, `buildSettableFieldsHelp`, and the entire set/get infrastructure. Complete.

### Interfaces Required

- `PROJECT_FIELDS` array and `FieldGroup` type from `packages/core/src/schema/projectSchema.ts`
- `projectSetAction` from `packages/cli/src/commands/project.ts`
- `FileProjectStore.update()` which already accepts `{ customData: { ... } }`
- `existsSync`, `readdirSync` from `fs` for index-based file scanning

## Architecture

### Component Changes

```
packages/core/src/schema/
  projectSchema.ts          # Add 'custom' group, three customData fields,
                            # resolveFileIndex() helper

packages/cli/src/commands/
  project.ts                # projectSetAction: handle customData nested write,
                            # handle index-based file resolution for artifact fields
                            # projectGetAction: use schema fields for customData
                            # (replacing hardcoded customEntries)
```

### Part A: customData Sub-Fields in Schema

**Problem**: `customData.recentEvents`, `customData.additionalNotes`, `customData.availableTools` are settable in Electron but not through the CLI schema system. They're nested under `customData` in `ProjectData`, so `projectSetAction`'s current pattern (`store.update(id, { [field]: value })`) doesn't work — it needs to merge into the nested object.

**Solution**: Add a new field group `'custom'` to the schema with three field definitions. Mark these fields with a new `nested` property (or use a naming convention like `customData.recentEvents`) so `projectSetAction` knows to handle them differently.

**Schema additions** (in `projectSchema.ts`):

```typescript
// Update FieldGroup type
export type FieldGroup = 'identity' | 'artifacts' | 'workflow' | 'metadata' | 'custom';

// Add to PROJECT_FIELDS array
{ field: 'customData.recentEvents', type: 'string', required: false, readonly: false,
  group: 'custom', description: 'State summary and recent events',
  aliases: ['events'], label: 'Recent Events' },
{ field: 'customData.additionalNotes', type: 'string', required: false, readonly: false,
  group: 'custom', description: 'Phase instructions and notes',
  aliases: ['notes'], label: 'Notes' },
{ field: 'customData.availableTools', type: 'string', required: false, readonly: false,
  group: 'custom', description: 'Available tools for context',
  aliases: ['tools'], label: 'Tools' },

// Add 'custom' to FIELD_GROUPS
export const FIELD_GROUPS: FieldGroup[] = ['identity', 'artifacts', 'workflow', 'metadata', 'custom'];
```

**Using dot-notation field names** (`customData.recentEvents`) is the simplest approach — it keeps `resolveFieldName` working unchanged (the alias `events` maps to `customData.recentEvents`), and `projectSetAction` can check for the `customData.` prefix to determine nested write behavior.

**Write logic in `projectSetAction`**:

```typescript
if (resolvedField.startsWith('customData.')) {
  const subField = resolvedField.split('.')[1]; // e.g. 'recentEvents'
  const merged = { ...existing.customData, [subField]: resolvedValue };
  await store.update(id, { customData: merged });
} else {
  await store.update(id, { [resolvedField]: resolvedValue });
}
```

**Display in `projectGetAction`**: Replace the hardcoded `customEntries` block with schema-driven rendering using the `'custom'` group — same pattern as other groups, but reading from `customData[subField]` instead of `project[field]`.

### Part B: Index-Based File Resolution

**Problem**: Setting artifact file fields requires typing the full filename: `cf set slice 171-slice.project-schema`. The numeric index prefix is unique and sufficient for identification.

**Solution**: When the value for an artifact field is a bare number (matches `/^\d+$/`), scan the project's document directories for a matching file.

**Field-to-directory mapping**:

| Field | Directory pattern | File pattern |
|-------|------------------|-------------|
| `fileSlice` | `project-documents/user/slices/` | `{index}-slice.*.md` |
| `fileTasks` | `project-documents/user/tasks/` | `{index}-tasks.*.md` |
| `fileArch` | `project-documents/user/architecture/` | `{index}-arch.*.md` |
| `fileSlicePlan` | `project-documents/user/architecture/` | `{index}-slices.*.md` |
| `fileHLD` | `project-documents/user/architecture/` | `{index}-arch.hld-*.md` (or `{index}-hld.*.md`) |
| `fileSpec` | `project-documents/user/architecture/` | `{index}-spec.*.md` |

**Resolution logic** (in `packages/core/src/schema/projectSchema.ts` or a new helper):

```typescript
export function resolveFileByIndex(
  projectPath: string,
  field: string,
  index: string,
): string | null {
  // Map field to directory and file prefix pattern
  // Scan directory for files matching {index}-{doctype}.*.md
  // Return filename (without directory) if exactly one match
  // Return null if no match (caller throws error)
  // Throw if multiple matches (ambiguous)
}
```

**Where it hooks in**: In `projectSetAction`, after field resolution but before the store write. If the resolved field is an artifact field and the value matches `/^\d+$/`, call `resolveFileByIndex`. This requires the project's `projectPath` which is available from the `existing` project data.

**Artifact fields that support index resolution**: `fileSlice`, `fileTasks`, `fileArch`, `fileSlicePlan`, `fileHLD`, `fileSpec`. These are identified by their `group: 'artifacts'` in the schema.

**Stored value**: The resolved filename without the directory prefix — e.g. `171-slice.project-schema` (same format currently stored). Not the full path.

**Edge cases**:
- No match: error with `"No file matching index '171' found in project-documents/user/slices/"`
- Multiple matches: error listing the options (very unlikely given naming conventions)
- Value is not a bare number: no resolution attempted, value used as-is (existing behavior)
- Project has no `projectPath`: error — can't resolve without knowing where to scan

## Success Criteria

### Functional Requirements

- `cf set events "state summary here"` updates `customData.recentEvents`
- `cf set notes "on phase complete..."` updates `customData.additionalNotes`
- `cf set tools "electron, mcp"` updates `customData.availableTools`
- `cf get` displays customData fields in the Custom group (schema-driven, not hardcoded)
- `cf set --help` lists events, notes, tools under Custom group
- `cf project --schema` includes customData fields
- `cf set slice 171` resolves to `171-slice.project-schema` and sets `fileSlice`
- `cf set tasks 171` resolves to `171-tasks.project-schema` and sets `fileTasks`
- `cf set arch 160` resolves to matching architecture file and sets `fileArch`
- `cf set plan 160` resolves to matching slices file and sets `fileSlicePlan`
- Index resolution only triggers for bare numeric values
- Non-numeric values for artifact fields are used as-is (existing behavior preserved)
- Clear error messages for no-match and ambiguous-match cases

### Technical Requirements

- customData fields use dot-notation in schema (`customData.recentEvents`)
- `projectSetAction` handles nested customData writes with merge semantics
- `resolveFileByIndex` is in core (not CLI) so MCP could use it later
- All existing tests pass
- New unit tests for: customData set/get, index resolution (match, no-match, multiple-match, non-numeric passthrough)

## Implementation Notes

### Suggested Task Order

1. **Schema: add custom group and customData fields** — `projectSchema.ts` changes, update `FieldGroup` type, add fields, update `FIELD_GROUPS`
2. **CLI: customData nested write in `projectSetAction`** — detect `customData.` prefix, merge write
3. **CLI: schema-driven customData display in `projectGetAction`** — replace hardcoded `customEntries` with schema group rendering
4. **Core: `resolveFileByIndex` helper** — file scanning logic with field-to-directory mapping
5. **CLI: index resolution in `projectSetAction`** — hook into set flow for artifact fields with numeric values
6. **Tests** — unit tests alongside each step
7. **Build, verify, commit**

### Special Considerations

- The `customData.` dot-notation in field names is a convention within the schema system only. It doesn't affect the `ProjectData` type or the store — the write logic in `projectSetAction` translates it to the correct nested structure.
- The `resolveFileByIndex` helper belongs in core (`packages/core/src/schema/`) rather than CLI, so MCP tools or Electron could reuse it later.
- HLD files may follow either `{index}-arch.hld-*.md` or `{index}-hld.*.md` pattern. The resolver should handle both by scanning for any file starting with `{index}-` in the architecture directory and filtering by the appropriate doc-type keywords.
- The stored value for artifact fields is the filename stem (e.g. `171-slice.project-schema`), not the full relative path. This matches the existing convention used by `cf init` and the Electron form.

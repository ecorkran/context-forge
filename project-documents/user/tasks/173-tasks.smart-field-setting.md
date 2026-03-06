---
slice: smart-field-setting
project: context-forge
lld: user/slices/173-slice.smart-field-setting.md
dependencies: [171-project-schema]
projectState: Slice 171 complete (tasks 11-13). CLI has cf set/get shortcuts, buildSettableFieldsHelp, projectSetAction/projectGetAction shared handlers, git-branch-style project list, cf set --help with field listing, cf get showing all fields. customData displayed via hardcoded block in projectGetAction. 116 CLI tests, 742 total.
dateCreated: 20260306
dateUpdated: 20260305
status: complete
---

## Context Summary

- Extending `cf set` with customData sub-fields and index-based artifact file resolution
- Schema module (`packages/core/src/schema/projectSchema.ts`) is single source of truth for fields, aliases, groups
- `projectSetAction` in `packages/cli/src/commands/project.ts` handles all set logic
- `projectGetAction` handles all get display; customData currently hardcoded, needs schema-driven rendering
- `ProjectData.customData` is `{ recentEvents?, additionalNotes?, availableTools? }` — type already supports these fields
- `FileProjectStore.update()` already accepts `{ customData: { ... } }` — no store changes needed

---

## Task 1: Add customData Fields to Schema Module

**Effort: 1/5**

- [x] **Update `FieldGroup` type in `packages/core/src/schema/projectSchema.ts`**
  - [x] Add `'custom'` to the `FieldGroup` union: `'identity' | 'artifacts' | 'workflow' | 'metadata' | 'custom'`

- [x] **Add three customData field definitions to `PROJECT_FIELDS` array**
  - [x] `customData.recentEvents` — alias: `events`, label: `Recent Events`, group: `custom`
  - [x] `customData.additionalNotes` — alias: `notes`, label: `Notes`, group: `custom`
  - [x] `customData.availableTools` — alias: `tools`, label: `Tools`, group: `custom`
  - [x] All three: `type: 'string'`, `required: false`, `readonly: false`

- [x] **Add `'custom'` to `FIELD_GROUPS` array** (after `'metadata'`)

- [x] **Verify lookup maps build correctly**
  - [x] `resolveFieldName('events')` returns `'customData.recentEvents'`
  - [x] `resolveFieldName('notes')` returns `'customData.additionalNotes'`
  - [x] `resolveFieldName('tools')` returns `'customData.availableTools'`
  - [x] `resolveFieldName('customData.recentEvents')` returns itself (canonical passthrough)

- [x] **Success**: `pnpm --filter @context-forge/core typecheck` passes; existing schema tests pass

---

## Task 2: Schema Module Tests for customData Fields

**Effort: 1/5**

- [x] **Add tests to `packages/core/tests/schema/projectSchema.test.ts`**
  - [x] `resolveFieldName('events')` → `'customData.recentEvents'`
  - [x] `resolveFieldName('notes')` → `'customData.additionalNotes'`
  - [x] `resolveFieldName('tools')` → `'customData.availableTools'`
  - [x] `resolveFieldName('Events')` → `'customData.recentEvents'` (case-insensitive)
  - [x] `getSchema().groups` includes `'custom'`
  - [x] `getSchema().fields` includes all three customData fields
  - [x] `getSchema().aliases` includes `events`, `notes`, `tools` mappings

- [x] **Success**: `pnpm --filter @context-forge/core test` passes

- [x] **Commit**: `feat(core): add customData sub-fields to project schema`

---

## Task 3: customData Nested Write in `projectSetAction`

**Effort: 1/5**

- [x] **Update `projectSetAction` in `packages/cli/src/commands/project.ts`**
  - [x] After resolving field and value, check if `resolvedField.startsWith('customData.')`
  - [x] If yes: extract sub-field name (`resolvedField.split('.')[1]`)
  - [x] Merge into existing customData: `{ ...existing.customData, [subField]: resolvedValue }`
  - [x] Call `store.update(id, { customData: merged })`
  - [x] If no: use existing behavior `store.update(id, { [resolvedField]: resolvedValue })`
  - [x] Print success message using the alias-friendly name (e.g. `Updated events = ... on project ...`)

- [x] **Success**: `cf set events "test"` updates `customData.recentEvents` in the store; `cf set notes "test"` and `cf set tools "test"` likewise

---

## Task 4: Schema-Driven customData Display in `projectGetAction`

**Effort: 1/5**

- [x] **Replace hardcoded customData block in `projectGetAction`**
  - [x] Remove the `const custom = project.customData; if (custom) { ... }` block
  - [x] The `'custom'` group in `FIELD_GROUPS` will be iterated by the existing group loop
  - [x] For fields in the `'custom'` group, read value from `project.customData?.[subField]` instead of `project[field]`
  - [x] Detect `customData.` prefix in field name → extract sub-field, read from `customData` object
  - [x] Unset custom fields show `—` placeholder (same as other fields)

- [x] **Success**: `cf get` shows Custom group with all three fields (populated or `—`); hardcoded block removed

---

## Task 5: customData Set/Get Tests

**Effort: 1/5**

- [x] **Add CLI tests in `packages/cli/tests/commands/shortcuts.test.ts` or `project.test.ts`**
  - [x] `cf set events "state summary"` → calls `store.update` with `{ customData: { recentEvents: 'state summary' } }`
  - [x] `cf set notes "phase notes"` → calls `store.update` with `{ customData: { additionalNotes: 'phase notes' } }`
  - [x] `cf set tools "electron, mcp"` → calls `store.update` with `{ customData: { availableTools: 'electron, mcp' } }`
  - [x] Merge semantics: setting `events` preserves existing `additionalNotes` and `availableTools`
  - [x] `cf get` output contains `Custom` group header
  - [x] `cf set --help` output contains `events`, `notes`, `tools`

- [x] **Update `buildSettableFieldsHelp` test** to expect `Custom` group and aliases

- [x] **Success**: `pnpm --filter @context-forge/cli test` passes

- [x] **Commit**: `feat(cli): settable customData fields via cf set events/notes/tools`

---

## Task 6: Index-Based File Resolution Helper in Core

**Effort: 2/5**

- [x] **Create `resolveFileByIndex` function in `packages/core/src/schema/projectSchema.ts`**
  - [x] Signature: `resolveFileByIndex(projectPath: string, field: string, index: string): string`
  - [x] Define field-to-directory mapping:
    - `fileSlice` → `project-documents/user/slices/`, pattern `{index}-slice.`
    - `fileTasks` → `project-documents/user/tasks/`, pattern `{index}-tasks.`
    - `fileArch` → `project-documents/user/architecture/`, pattern `{index}-arch.`
    - `fileSlicePlan` → `project-documents/user/architecture/`, pattern `{index}-slices.`
    - `fileHLD` → `project-documents/user/architecture/`, pattern `{index}-hld.` (also check `{index}-arch.hld-`)
    - `fileSpec` → `project-documents/user/architecture/`, pattern `{index}-spec.`
  - [x] Scan directory with `readdirSync`, filter files starting with `{index}-{doctype}.`
  - [x] Return filename stem (without `.md` extension) if exactly one match
  - [x] Throw descriptive error if no match (include directory scanned)
  - [x] Throw descriptive error if multiple matches (list the options)
  - [x] If field is not an artifact field, return null (caller uses value as-is)

- [x] **Export from `packages/core/src/schema/projectSchema.ts`** and re-export from core index

- [x] **Success**: function compiles, handles match/no-match/multiple-match cases

---

## Task 7: Index Resolution Tests

**Effort: 2/5**

- [x] **Add tests in `packages/core/tests/schema/projectSchema.test.ts`** (or new file `resolveFileByIndex.test.ts`)
  - [x] Mock `readdirSync` to return controlled file lists
  - [x] Test: `resolveFileByIndex('/project', 'fileSlice', '171')` with `['171-slice.project-schema.md']` → returns `'171-slice.project-schema'`
  - [x] Test: `resolveFileByIndex('/project', 'fileTasks', '171')` with `['171-tasks.project-schema.md']` → returns `'171-tasks.project-schema'`
  - [x] Test: `resolveFileByIndex('/project', 'fileArch', '160')` with `['160-arch.project-workflow-system.md']` → returns `'160-arch.project-workflow-system'`
  - [x] Test: `resolveFileByIndex('/project', 'fileSlicePlan', '160')` with `['160-slices.project-workflow-system.md']` → returns `'160-slices.project-workflow-system'`
  - [x] Test: no match → throws error containing the index and directory
  - [x] Test: multiple matches → throws error listing the files
  - [x] Test: non-artifact field (e.g. `'name'`) → returns null
  - [x] Test: directory doesn't exist → throws error (or returns no match)

- [x] **Success**: `pnpm --filter @context-forge/core test` passes

- [x] **Commit**: `feat(core): add resolveFileByIndex for index-based artifact file resolution`

---

## Task 8: Hook Index Resolution into `projectSetAction`

**Effort: 1/5**

- [x] **Update `projectSetAction` in `packages/cli/src/commands/project.ts`**
  - [x] Import `resolveFileByIndex` from `@context-forge/core`
  - [x] After resolving field name, check if:
    1. Resolved field is in `'artifacts'` group (check `fieldDef?.group === 'artifacts'`)
    2. Value matches `/^\d+$/` (bare number)
    3. Project has `projectPath` set
  - [x] If all three: call `resolveFileByIndex(existing.projectPath, resolvedField, resolvedValue)`
  - [x] If result is non-null, use it as `resolvedValue`
  - [x] If result is null (non-artifact field), use value as-is
  - [x] If `resolveFileByIndex` throws, re-throw as `UserError`

- [x] **Success**: `cf set slice 171` resolves and sets the field; `cf set slice some-name` passes through unchanged

---

## Task 9: Index Resolution CLI Tests

**Effort: 1/5**

- [x] **Add CLI integration tests**
  - [x] Mock `resolveFileByIndex` in CLI test context
  - [x] `cf set slice 171` with mock returning `'171-slice.project-schema'` → calls `store.update` with `{ fileSlice: '171-slice.project-schema' }`
  - [x] `cf set slice some-name` (non-numeric) → calls `store.update` with `{ fileSlice: 'some-name' }` (passthrough)
  - [x] `cf set slice 999` with mock throwing no-match error → prints error message
  - [x] `cf set name 42` (non-artifact field, numeric value) → does NOT trigger index resolution

- [x] **Success**: `pnpm --filter @context-forge/cli test` passes

- [x] **Commit**: `feat(cli): index-based file resolution for cf set artifact fields`

---

## Task 10: Full Build, Test, and Verify

**Effort: 1/5**

- [x] **Full build**: `pnpm build` — all packages compile
- [x] **Full test**: `pnpm test` — all tests pass across all packages
- [x] **Manual verification**:
  - [x] `cf set events "testing events"` → `cf get` shows it under Custom
  - [x] `cf set slice 173` → resolves and sets correctly
  - [x] `cf set --help` shows Custom group with events, notes, tools
  - [x] `cf project --schema` includes custom fields
- [x] **Commit final state if any remaining changes**

---
docType: slice-design
slice: project-model-cleanup-cli
project: context-forge
parent: user/architecture/160-slices.project-workflow-system.md
dependencies: [multi-project-ux-polish]
interfaces: [project-schema-visibility]
dateCreated: 20260304
dateUpdated: 20260304
status: in_progress
---

# Slice Design: Project Model Cleanup & CLI Init

## Overview

Four coordinated changes that simplify the project data model, improve CLI onboarding, and expose MCP server version information:

1. **Remove monorepo fields** — strip `isMonorepo`, `isMonorepoEnabled`, and `customData.monorepoNote` from the entire stack. These fields served an older `project-artifacts/{type}/{project}` path structure that is no longer used.
2. **`cf init` command** — register the current directory as a Context Forge project with sensible defaults.
3. **Deprecate `default_project` config** — warn when it is the actual resolution source, nudging users toward CWD detection.
4. **MCP version tool** — expose server version to MCP clients.

## Value

**Reduced complexity.** Monorepo fields add conditional logic in five core services, two Electron forms, the MCP schema, CLI display, and 21 test files. Removing them eliminates dead code paths that have no active consumers and simplifies every layer of the stack. A richer monorepo model (packages list, workspace locations) is tracked as GitHub issue #39 for when it's actually needed.

**Onboarding.** `cf init` parallels `git init` — a developer runs it once in a project directory, and all subsequent `cf` commands resolve automatically via CWD. No need to manually create projects through the Electron GUI or copy opaque IDs.

**Workflow hygiene.** The `default_project` deprecation warning steers users toward CWD-based resolution, which is more predictable and matches git workflow patterns.

**Client compatibility.** Exposing the MCP server version enables clients to check compatibility and report version mismatches.

## Technical Scope

### Included

**a) Monorepo field removal** — complete removal across all packages:
- Types: `ProjectData`, `CreateProjectData`, `UpdateProjectData`, `ContextData`/`EnhancedContextData`
- Core services: `SectionBuilder`, `ContextTemplateEngine`, `SystemPromptParser`, `ContextIntegrator`, `ProjectPathService`
- MCP: `projectTools.ts` (Zod schemas for `project_update`, `project_list` summary interface)
- CLI: `project.ts` UPDATABLE_FIELDS, display output
- Electron: `ContextBuilderApp.tsx`, `ProjectConfigForm.tsx`, `SettingsDialog.tsx`, `preload.ts`, `globals.d.ts`, `projectPathHandlers.ts`
- Storage: `FileProjectStore` migration function, `default-statements.md`
- All 21 affected test files

**b) `cf init` command** — new CLI command to register CWD as a project.

**c) `default_project` deprecation warning** — warning emitted in CLI `resolveProjectId` when `default` is the resolution source.

**d) MCP `server_version` tool** — lightweight tool returning server name and version.

### Excluded

- Modifications to the prompt file (`prompt.ai-project.system.md`) — the monorepo Context Initialization prompt variant remains in the guide file; guide updates happen in the ai-project-guide repo.
- Richer monorepo data model (GitHub issue #39).
- `project-documents/` directory scaffolding in `cf init` (future slice).
- Removal of `default_project` config key itself — it remains functional, just deprecated.

## Dependencies

### Prerequisites
- Slice 169 (Multi-Project & UX Polish) — provides CWD-based resolution, `findProjectByCwd`, `findByNameOrId`, `ResolutionSource` type.

### Interfaces Required
- `FileProjectStore.create()` — used by `cf init` to create project entries.
- `resolveProjectId` (CLI) — modified to emit deprecation warning.
- `McpServer.registerTool()` — used to register the version tool.

## Architecture

### Component Structure

```
packages/core/src/types/project.ts     ← Remove isMonorepo, isMonorepoEnabled, monorepoNote
packages/core/src/types/context.ts     ← Remove isMonorepo, monorepoNote
packages/core/src/services/
  SectionBuilder.ts                    ← Remove buildMonorepoSection(), monorepo line in projectInfo
  ContextTemplateEngine.ts             ← Remove monorepo section injection, isMonorepo param
  SystemPromptParser.ts                ← Remove isMonorepo param from getContextInitializationPrompt
  ContextIntegrator.ts                 ← Remove isMonorepo from DEFAULT_TEMPLATE and data mapping
  ProjectPathService.ts                ← Remove isMonorepo param from listDirectory
  constants.ts                         ← Remove monorepo-statement default entry
packages/core/src/storage/
  FileProjectStore.ts                  ← Migration: strip monorepo fields on read

packages/cli/src/commands/
  init.ts                              ← NEW: cf init command
  project.ts                           ← Remove monorepo from UPDATABLE_FIELDS and display
packages/cli/src/utils/project.ts      ← Add deprecation warning to resolveProjectId
packages/cli/src/index.ts              ← Register init command

packages/mcp-server/src/tools/
  projectTools.ts                      ← Remove monorepo from Zod schemas and summary
  versionTool.ts                       ← NEW: server_version tool
packages/mcp-server/src/index.ts       ← Register version tool

packages/electron/src/components/
  ContextBuilderApp.tsx                ← Remove isMonorepo/isMonorepoEnabled from state
  forms/ProjectConfigForm.tsx          ← Remove monorepo checkbox, template conditional, note field
  settings/SettingsDialog.tsx          ← Remove monorepo features checkbox
packages/electron/src/preload/preload.ts  ← Remove isMonorepo param from listDirectory
packages/electron/src/globals.d.ts     ← Update listDirectory signature
packages/electron/src/main/ipc/
  projectPathHandlers.ts               ← Remove isMonorepo param from handler

project-documents/user/content/statements/
  default-statements.md                ← Remove monorepo-statement section
```

### Data Flow

**Monorepo removal** is a deletion-only change. No new data flows are introduced. The `isMonorepo` conditional branches are replaced with unconditional behavior:

| Current behavior | After removal |
|---|---|
| `buildMonorepoSection()` called when `isMonorepo` | Section never built |
| Template shown in project info only when monorepo | Template shown when non-default (i.e., `template !== 'default'`) |
| `getContextInitializationPrompt(isMonorepo)` selects variant | Always returns standard prompt (no `isMonorepo` parameter) |
| `listDirectory(path, subdir, isMonorepo)` chooses base path | Always uses `project-documents/user` path (no `isMonorepo` parameter) |
| `monorepo: {bool}` in project info output | Line removed |
| Monorepo section in assembled context | Section never injected |
| `{{#if isMonorepo}}` in DEFAULT_TEMPLATE | Conditional removed; `Monorepo: Yes/No` line removed |
| Monorepo checkbox + template field conditional in Electron | Checkbox removed; template field always enabled |
| `isMonorepoEnabled` toggle in Settings dialog | Checkbox removed |

**`cf init`** creates a new project entry via `FileProjectStore.create()` and prints confirmation. No CWD registration or path-mapping is needed — the existing `findProjectByCwd` in `resolveProjectId` handles resolution by matching `projectPath` against CWD.

**Deprecation warning** is a stderr message emitted by `resolveProjectId` in the CLI when `source === 'default'`.

**Version tool** reads `SERVER_VERSION` (already loaded from `package.json` at startup) and returns it.

## Implementation Details

### a) Monorepo Field Removal

#### Types (`packages/core/src/types/`)

**`project.ts`:**
- Remove `isMonorepo: boolean` from `ProjectData` (line 14)
- Remove `isMonorepoEnabled?: boolean` from `ProjectData` (line 15)
- Remove `monorepoNote?: string` from `customData` in `ProjectData` (line 29)
- Remove `monorepoNote?: string` from `customData` in `CreateProjectData` (line 52)
- Remove `| 'isMonorepo'` and `| 'isMonorepoEnabled'` from `UpdateProjectData` Pick (lines 71-72)

**`context.ts`:**
- Remove `isMonorepo: boolean` (line 15)
- Remove `monorepoNote?: string` from `customData` (line 33)

#### Core Services (`packages/core/src/services/`)

**`SectionBuilder.ts`:**
- Delete `buildMonorepoSection()` method entirely (lines 90-112)
- In `buildProjectInfoSection()`: remove `monorepo: ${data.isMonorepo}` line (line 194). Change template conditional from `if (data.isMonorepo && data.template && data.template !== 'default')` to `if (data.template && data.template !== 'default')` (line 165) — show template whenever it's set and non-default.

**`ContextTemplateEngine.ts`:**
- Remove `isMonorepo` parameter from `getContextInitializationPrompt` call (line 96) — call without argument.
- Remove monorepo section block (lines 114-124) — the `if (data.isMonorepo)` block that pushes the monorepo section.

**`SystemPromptParser.ts`:**
- Remove `isMonorepo` parameter from `getContextInitializationPrompt` signature (line 153). Remove the monorepo-specific prompt lookup branch (lines 156-166). The method always returns the standard prompt.

**`ContextIntegrator.ts`:**
- Remove `{{#if isMonorepo}}Monorepo: Yes{{else}}Monorepo: No{{/if}}` from DEFAULT_TEMPLATE (line 15).
- Remove `isMonorepo: project.isMonorepo || false` from data mapping (lines 114, 140).
- Remove `Monorepo: ${project.isMonorepo ? 'Yes' : 'No'}` from error fallback (line 180).

**`ProjectPathService.ts`:**
- Remove `isMonorepo?: boolean` parameter from `listDirectory` (line 115).
- Replace conditional base path logic (lines 129-131) with: `const basePath = path.join(projectPath, 'project-documents', 'user');` — always use the standard path.

#### Storage (`packages/core/src/storage/`)

**`FileProjectStore.ts`:**
- In `migrateProjectFields()`: remove `isMonorepo` default logic (lines 37-38). Add deletion of monorepo fields so old data doesn't persist:
  ```typescript
  // Strip removed monorepo fields from legacy data
  delete (base as Record<string, unknown>).isMonorepo;
  delete (base as Record<string, unknown>).isMonorepoEnabled;
  if (base.customData) {
    delete (base.customData as Record<string, unknown>).monorepoNote;
  }
  ```
- In `create()`: remove `isMonorepo: data.isMonorepo` and `isMonorepoEnabled: data.isMonorepoEnabled` (lines 116-117).

#### Constants (`packages/core/src/services/constants.ts`)

- Remove `'monorepo-statement'` entry from the default statements map (lines 38-44).

#### Statements

**`default-statements.md`:**
- Remove the "Monorepo Statement" section (lines 27-30): the `<!-- key: monorepo-statement -->` block and its content.

#### MCP Server (`packages/mcp-server/src/tools/`)

**`projectTools.ts`:**
- Remove `isMonorepo` from `ProjectSummary` interface and `toSummary()` function.
- Remove `isMonorepo` and `isMonorepoEnabled` Zod fields from `project_update` input schema.
- Remove `monorepoNote` from `customData` Zod schema in `project_update`.

#### CLI (`packages/cli/src/commands/`)

**`project.ts`:**
- Remove `'isMonorepo'` and `'isMonorepoEnabled'` from `UPDATABLE_FIELDS` set.
- Remove `['Monorepo', project.isMonorepo ? 'true' : '']` from `project get` display fields.

#### Electron (`packages/electron/src/`)

**`components/ContextBuilderApp.tsx`:**
- Remove `isMonorepo: false` from default state objects (lines 18, 55, 179).
- Remove `isMonorepo` and `isMonorepoEnabled` from project-to-form mapping (lines 103-104, 367-368).

**`components/forms/ProjectConfigForm.tsx`:**
- Remove `isMonorepo: initialData?.isMonorepo || false` and `isMonorepoEnabled: initialData?.isMonorepoEnabled` from form state (lines 129-130, 158-159).
- Remove monorepo checkbox UI (line 372-375) and the conditional template/note fields that depend on `formData.isMonorepo` (lines 380-409).
- Remove `isMonorepo` comparison in state-reset check (line 146).
- Enable template field unconditionally (remove `disabled={!formData.isMonorepo}` and related styling).

**`components/settings/SettingsDialog.tsx`:**
- Remove `handleMonorepoModeChange` function (lines 29-32).
- Remove the monorepo features checkbox block (lines 58-76).

**`preload/preload.ts`:**
- Remove `isMonorepo?: boolean` parameter from `listDirectory` call (line 29-30).

**`globals.d.ts`:**
- Remove `isMonorepo?: boolean` from `listDirectory` type (line 36).

**`main/ipc/projectPathHandlers.ts`:**
- Remove `isMonorepo?: boolean` from handler args type (line 41).
- Remove `args.isMonorepo` from `listDirectory` call (line 46).

### b) `cf init` Command

New file: `packages/cli/src/commands/init.ts`

```typescript
// Registers: cf init [--name <name>]
// 1. Resolve CWD as absolute path
// 2. Check if a project with this projectPath already exists (store.getAll(), match path)
//    - If exists: warn and exit (no error, just message)
// 3. Derive name from path.basename(cwd), accept --name override
// 4. Create project via store.create() with:
//    - name: derived or --name
//    - projectPath: cwd
//    - template: 'default'
//    - fileSlice: ''
//    - instruction: 'implementation'
// 5. Print success: "Initialized project '{name}' at {path}"
```

Register in `packages/cli/src/index.ts` — add `registerInitCommand(program)` alongside existing commands.

The command is top-level (`cf init`), not under `cf project`, paralleling `git init` vs `git branch`.

### c) `default_project` Deprecation Warning

In `packages/cli/src/utils/project.ts`, after step 3 resolves via `default_project` (line 98), emit a warning to stderr before returning:

```typescript
console.error(
  'Warning: Resolved via default_project config. ' +
  'Consider using --project or running from within a registered project directory.\n' +
  '  cf init                              # register current directory\n' +
  '  cf project list                      # see registered projects'
);
```

The warning goes to stderr so it doesn't interfere with stdout output (important for `cf build | pbcopy`).

### d) MCP `server_version` Tool

New file: `packages/mcp-server/src/tools/versionTool.ts`

```typescript
// Registers: server_version
// - No input parameters
// - Returns: { name: SERVER_NAME, version: SERVER_VERSION }
// - Annotations: readOnlyHint: true, openWorldHint: false
```

The `SERVER_VERSION` constant is already available in `index.ts`. Either pass it to the registration function or import it. Passing as a parameter is cleaner:

```typescript
export function registerVersionTool(server: McpServer, name: string, version: string): void {
  server.registerTool('server_version', {
    title: 'Server Version',
    description: 'Returns the Context Forge MCP server name and version.',
    inputSchema: {},
    annotations: { readOnlyHint: true, openWorldHint: false },
  }, async () => {
    return { content: [{ type: 'text', text: JSON.stringify({ name, version }) }] };
  });
}
```

Register in `index.ts`: `registerVersionTool(server, SERVER_NAME, SERVER_VERSION);`

## Integration Points

### Provides to Other Slices

- **Slice 171 (Project Schema Visibility):** Cleaner `ProjectData` type without monorepo fields. Schema display and field aliases operate on the simplified model.
- **Slice 172 (Guide Management):** `cf init` creates project entries that guide management tools operate on.

### Consumes from Other Slices

- **Slice 169 (Multi-Project & UX Polish):** CWD-based resolution, `findProjectByCwd`, `ResolutionSource` type, `findByNameOrId`. All consumed by `cf init` (path-exists check) and deprecation warning (source detection).

## Migration Plan

### Data Migration

The `migrateProjectFields()` function in `FileProjectStore` already runs on every read. The migration change is additive: strip `isMonorepo`, `isMonorepoEnabled`, and `customData.monorepoNote` from loaded data. Projects with these fields stored on disk will load without error — the fields are silently dropped.

No write-back migration is needed. Fields are stripped on read; the next `update()` call will naturally persist the cleaned data.

### Behavior Preservation

- **Template visibility:** Currently shown only when `isMonorepo` is true. After: shown when `template !== 'default'`. This is a behavioral change but correct — template is useful information regardless of monorepo status.
- **Context initialization prompt:** Currently selects monorepo variant when `isMonorepo` is true. After: always selects standard variant. The monorepo prompt in the guide file referenced the dead `project-artifacts` path structure, so no project was actually using it correctly.
- **Directory listing:** `ProjectPathService.listDirectory` currently uses `project-artifacts` base path when `isMonorepo` is true. After: always uses `project-documents/user`. Since no project actually uses the `project-artifacts` structure, this is safe.

## Success Criteria

### Functional Requirements
- All monorepo fields removed from types, core services, MCP schemas, CLI, and Electron
- Existing stored projects with `isMonorepo: true/false` load without error
- `cf init` in an unregistered directory creates a project entry with correct name and path
- `cf init` in an already-registered directory warns without creating a duplicate
- `cf init --name "My Project"` uses the provided name
- `cf status` from a directory registered via `cf init` resolves via CWD
- Warning emitted to stderr when `default_project` is the resolution source
- `server_version` MCP tool returns `{ name, version }` matching `package.json`

### Technical Requirements
- All existing tests updated and passing (monorepo field references removed from test fixtures and assertions)
- New tests for `cf init` (success, already-registered, --name override)
- New test for `server_version` tool
- `pnpm build` succeeds across all packages
- `pnpm typecheck` passes (no type errors from removed fields)

## Risk Assessment

### Technical Risks
- **Broad test file changes.** 21 test files reference monorepo fields. Most changes are mechanical (remove field from fixture objects, remove assertion lines), but the volume increases the chance of missing one.

### Mitigation
- Run `pnpm typecheck` after type changes — TypeScript will flag every reference to removed fields.
- Run full test suite (`pnpm test`) after each package's changes, not just at the end.

## Implementation Notes

### Development Approach

Suggested order:

1. **Types first** — remove fields from `ProjectData`, `CreateProjectData`, `UpdateProjectData`, `ContextData`. This breaks the build everywhere monorepo fields are referenced, making it easy to find all consumers.
2. **Core services** — fix `SectionBuilder`, `ContextTemplateEngine`, `SystemPromptParser`, `ContextIntegrator`, `ProjectPathService`, `FileProjectStore`.
3. **Core tests** — update test fixtures and assertions in `packages/core/tests/`.
4. **MCP server** — update `projectTools.ts` schemas, add `versionTool.ts`, update tests.
5. **CLI** — update `project.ts`, add `init.ts`, add deprecation warning, update tests.
6. **Electron** — update components, preload, handlers, update tests.
7. **Statements** — remove `monorepo-statement` from `default-statements.md`.
8. **Full build & test** — `pnpm build && pnpm test` from root.

### Testing Strategy

- **Monorepo removal:** Primarily verified by TypeScript compiler (removed fields cause type errors) plus existing test updates. No new tests needed for the removal itself — we're deleting behavior, not adding it.
- **`cf init`:** Unit tests mocking `FileProjectStore` — test success path, already-registered warning, `--name` override, path resolution.
- **Deprecation warning:** Integration test or unit test verifying stderr output when resolution source is `'default'`.
- **Version tool:** Unit test calling the handler and asserting the response shape.

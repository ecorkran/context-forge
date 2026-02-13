---
item: project-path-awareness
project: context-forge
type: slice
github:
dependencies: []
architecture: 050-arch.prompt-system-decoupling
projectState: Electron+React app. Settings dialog exists with monorepo toggle. No filesystem awareness of project directories.
status: not started
dateCreated: 20260213
dateUpdated: 20260213
---

# Slice Design: Project Path Awareness

## Overview

Context Forge transitions from a closed-world form builder to a project-aware tool. This slice adds the ability for each project to have an associated filesystem path, validated and persisted, enabling downstream features (auto-index resolution, dynamic phase options, browse existing slices) to access project files.

## Architecture Context

This slice implements **Phase 0** of `050-arch.prompt-system-decoupling.md`. It is the foundational prerequisite that unlocks:
- [Issue #25](https://github.com/ecorkran/context-forge/issues/25): Auto-index resolution (scan directories for existing indices)
- [Issue #24](https://github.com/ecorkran/context-forge/issues/24): Dynamic phase options (read prompt files from project)
- [Issue #26](https://github.com/ecorkran/context-forge/issues/26): Browse existing slices/tasks/features from project directory

## Current State

### What exists
- **Settings dialog** (`SettingsDialog.tsx`): modal with single monorepo toggle, opened via gear icon in the Project Configuration header
- **ProjectData** (`types/ProjectData.ts`): 18 fields, no path-related fields
- **Storage**: JSON-based (`projects.json` in userData), atomic writes with backup recovery, three-layer abstraction (IPC → StorageClient → Service)
- **IPC**: 13 channels across storage, statements, system prompts, and utility namespaces
- **Preload**: fully isolated contextBridge with typed API surface
- **Auto-save**: 500ms debounce on form changes, silent background persistence

### What this slice adds
- `projectPath` field on ProjectData
- Path validation service in main process (IPC)
- Preload bridge for path operations
- Settings dialog expansion: folder picker + path display
- Project health indicator in the main form header area

---

## Data Model Changes

### ProjectData additions

```typescript
// Added to ProjectData interface
projectPath?: string;  // Absolute path to project root (contains project-documents/)
```

**Design decisions:**
- **Optional field**: projects without a path continue to work exactly as today. No migration disruption.
- **Project root, not `project-documents/`**: store the root path. The service appends `project-documents/user/` as needed. This keeps the stored value simple and human-readable.
- **Monorepo awareness**: when `isMonorepo` is true, consumers use `project-artifacts/` instead of `project-documents/user/`. The path field itself is always the project root — the subdirectory logic belongs in the consuming service, not the data model.

### Migration

`ElectronProjectStore.migrateProjects()` already handles adding default values for new optional fields. `projectPath` defaults to `undefined` — no special migration logic needed.

---

## Backend Service: ProjectPathService

New main-process service at `src/main/services/project/ProjectPathService.ts`.

### Responsibilities

1. **Validate path**: confirm directory exists, confirm expected structure is present
2. **Health check**: on-demand revalidation of a stored path
3. **Directory listing**: list files in a project subdirectory (foundation for downstream consumers)

### Validation Logic

When the user selects a path, validate:
1. Path exists and is a directory
2. `project-documents/` subdirectory exists within it
3. At least one of the expected `user/` subdirectories exists (`slices/`, `tasks/`, `features/`, `architecture/`)

Validation result:

```typescript
interface PathValidationResult {
  valid: boolean;
  projectPath: string;
  errors: string[];        // Human-readable issues
  structure: {
    hasProjectDocuments: boolean;
    hasUserDir: boolean;
    subdirectories: string[];  // Which of slices/tasks/features/architecture exist
  };
}
```

### Health Check

Same validation logic, called on-demand (not polling). Returns the same `PathValidationResult`. Used by:
- The health indicator on initial project load
- The health indicator when the user clicks it
- Any consumer that needs to verify before performing an operation

### Directory Listing

```typescript
interface DirectoryListResult {
  files: string[];   // Filenames only, not full paths
  error?: string;
}
```

Lists files in `{projectPath}/project-documents/user/{subdirectory}/`. Returns filenames only — consumers parse indices/names from the filenames.

When `isMonorepo` is true, the path becomes `{projectPath}/project-artifacts/{subdirectory}/` instead.

### Constructor

Accepts no stored state — each method receives the path and any flags as arguments. This keeps the service stateless and avoids synchronization issues between projects.

---

## IPC Channels

New channels following the existing handle pattern in `contextServices.ts`:

| Channel | Arguments | Returns |
|---------|-----------|---------|
| `project-path:validate` | `{ path: string }` | `PathValidationResult` |
| `project-path:health-check` | `{ path: string }` | `PathValidationResult` |
| `project-path:list-directory` | `{ path: string, subdirectory: string, isMonorepo?: boolean }` | `DirectoryListResult` |
| `project-path:pick-folder` | none | `{ path: string } \| null` |

The `pick-folder` channel wraps Electron's `dialog.showOpenDialog({ properties: ['openDirectory'] })` so the renderer doesn't need direct dialog access.

### Registration

Add `setupProjectPathHandlers()` function in `src/main/ipc/projectPathService.ts`, called from `main.ts` alongside the existing `setupContextServiceHandlers()`.

---

## Preload Bridge

Add `projectPath` namespace to `window.electronAPI`:

```typescript
projectPath: {
  validate: (path: string) => Promise<PathValidationResult>;
  healthCheck: (path: string) => Promise<PathValidationResult>;
  listDirectory: (path: string, subdirectory: string, isMonorepo?: boolean) => Promise<DirectoryListResult>;
  pickFolder: () => Promise<{ path: string } | null>;
}
```

---

## UI Design

### Settings Dialog Changes

The existing `SettingsDialog.tsx` gains a new section **above** the Repository Type section.

**Project Path Section:**

```
┌─ Project Settings ──────────────────────────────────────────┐
│                                                              │
│  Project Path                                                │
│  ┌──────────────────────────────────────────┐ ┌──────────┐  │
│  │ /Users/me/source/repos/my-project        │ │ Browse…  │  │
│  └──────────────────────────────────────────┘ └──────────┘  │
│  ● Path valid — 4 subdirectories found                      │
│                                                              │
│  ☐ Enable monorepo features for this project                │
│  ...existing monorepo help text...                          │
│                                                              │
│                                              ┌────────┐     │
│                                              │  Done  │     │
│                                              └────────┘     │
└──────────────────────────────────────────────────────────────┘
```

**Behavior:**
- **Text input**: displays current `projectPath` value, read-only (path is set via Browse)
- **Browse button**: triggers `window.electronAPI.projectPath.pickFolder()`, then runs validation
- **Validation feedback**: inline text below the input showing validation result
  - Valid: green text, e.g., "Path valid — 4 subdirectories found"
  - Invalid: red text with specific error, e.g., "project-documents/ directory not found"
  - Empty: neutral text, "No project path set — some features require a path"
- **On valid selection**: updates `projectPath` on the project via `onProjectUpdate({ projectPath: selectedPath })`
- **Clear**: user can clear the field (set `projectPath` to `undefined`) if they no longer want path awareness

### Health Indicator

A small visual indicator near the project name or settings icon in the main form header area. This communicates path health at a glance without cluttering the form.

**States:**
1. **No path set** (neutral): no indicator shown, or a (subtle neutral dot) — absence of a path is not an error
2. **Path valid** (green): small green dot
3. **Path invalid** (red/amber): small indicator that something needs attention

**Behavior:**
- Health check runs when a project is loaded/switched to (if it has a `projectPath`)
- Clicking the indicator opens the Settings dialog to the path section
- Does **not** poll — checks on project load and on user interaction only

**Placement decision**: exact position to be determined during implementation. Candidates:
- Next to the gear icon in the Project Configuration header
- Next to the project name in the selector area
- Inside the gear icon itself (badge/overlay)

The health indicator UX details (exact visual, position, transitions) will be refined during implementation to ensure it feels natural in the existing layout. The key architectural requirement is that the health state is available in the main UI without opening settings.

---

## Data Flow

### Setting a path (happy path)

```
User clicks Browse in Settings
  → pickFolder IPC → Electron dialog.showOpenDialog
  → User selects folder → returns path string
  → validate IPC → ProjectPathService.validate(path)
  → Returns PathValidationResult (valid: true)
  → UI shows success message
  → onProjectUpdate({ projectPath: path })
  → Auto-save persists to projects.json (existing 500ms debounce)
  → Health indicator updates to green
```

### Project switch with path

```
User selects different project in dropdown
  → Form populates with project data (including projectPath)
  → If projectPath is set:
    → healthCheck IPC → ProjectPathService.validate(projectPath)
    → Update health indicator state
  → If projectPath is not set:
    → Health indicator hidden or neutral
```

### Consumer using directory listing (future)

```
Feature requests file list (e.g., auto-index)
  → Checks project has projectPath (bail if not)
  → listDirectory IPC → ProjectPathService.listDirectory(path, 'slices/', isMonorepo)
  → Returns { files: ['100-slice.foundation.md', '101-slice.context-templates.md', ...] }
  → Consumer parses filenames as needed
```

---

## Cross-Slice Dependencies

### This slice provides to consumers:
- `projectPath` field on ProjectData (data model)
- `project-path:validate` and `project-path:health-check` IPC channels
- `project-path:list-directory` IPC channel (foundation primitive)
- `window.electronAPI.projectPath` preload namespace

### This slice depends on:
- Existing storage infrastructure (no changes needed)
- Existing settings dialog structure (extended, not replaced)
- Existing IPC/preload patterns (followed, not changed)

### Downstream consumers (not in this slice):
- **750-feature.auto-index-resolution**: will use `listDirectory` to scan for existing indices
- **752-issue.dynamic-phase-options**: will use `listDirectory` to read prompt files
- Future browse/pick features: will use `listDirectory` with UI components

---

## Backward Compatibility

- `projectPath` is optional — existing projects get `undefined`, behavior unchanged
- Settings dialog adds a section; existing monorepo toggle is unaffected
- No changes to context generation, prompt processing, or template engine
- Health indicator is additive — no existing UI elements are moved or removed
- All new IPC channels are in a new namespace (`project-path:*`) — no conflicts

---

## File Inventory

### New files
- `src/main/services/project/ProjectPathService.ts` — validation and directory listing
- `src/main/services/project/types.ts` — shared types (PathValidationResult, DirectoryListResult)
- `src/main/ipc/projectPathService.ts` — IPC handler registration
- `src/components/settings/ProjectPathSection.tsx` — settings dialog path UI section
- `src/components/settings/HealthIndicator.tsx` — health dot component

### Modified files
- `src/services/storage/types/ProjectData.ts` — add `projectPath` field
- `src/preload/preload.ts` — add `projectPath` namespace
- `src/main/main.ts` — register new IPC handlers
- `src/components/settings/SettingsDialog.tsx` — add ProjectPathSection
- `src/components/ContextBuilderApp.tsx` — add health indicator, health check on project switch

---

## Considerations

- **Path persistence**: the stored path is an absolute filesystem path. If the user moves a project, they need to re-browse. The health indicator makes this obvious and recovery is one click.
- **Network paths**: no special handling. If the OS can access the path via standard `fs` calls, it works. Timeout behavior is OS-dependent.
- **Permissions**: if Context Forge can't read the directory (permissions issue), validation returns an appropriate error. We don't attempt to fix permissions.
- **Relative vs absolute**: always store absolute paths. The folder picker returns absolute paths by default.

---
layer: project
docType: tasks
slice: project-path-awareness
project: context-forge
lld: user/slices/128-slice.project-path-awareness.md
architecture: user/architecture/050-arch.prompt-system-decoupling.md
dependencies: []
status: complete
projectState: Electron+React+TypeScript app (Vite build). Settings dialog exists with monorepo toggle. IPC follows handle/invoke pattern via contextBridge. No filesystem awareness of project directories. Storage is JSON-based with three-layer abstraction (IPC → StorageClient → Service).
dateCreated: 20260213
dateUpdated: 20260213
---

## Context Summary

- Working on slice 128: Project Path Awareness (Phase 0 of prompt-system-decoupling architecture)
- Context Forge is an Electron + React + TypeScript app using Vite, Radix, and Tailwind 4
- IPC pattern: main process handlers registered via `ipcMain.handle()`, renderer calls via `window.electronAPI` (contextBridge)
- Existing IPC namespaces: `storage:*`, `statements:*`, `systemPrompts:*`, plus `ping`, `get-app-version`, `update-window-title`
- Preload bridge at `src/preload/preload.ts` (~23 lines) exposes typed API surface
- IPC handler setup split between `src/main/main.ts` (storage, utility) and `src/main/ipc/contextServices.ts` (statements, prompts)
- Existing services live under `src/main/services/context/` (StatementManager, SystemPromptParser, PromptFileManager)
- `SettingsDialog.tsx` (~92 lines): modal with monorepo toggle, receives `currentProject` and `onProjectUpdate`
- `ContextBuilderApp.tsx` (~456 lines): main orchestrator, manages project switching, auto-save, settings
- `ProjectData` interface (~18 fields) at `src/services/storage/types/ProjectData.ts`, no path-related fields
- This slice delivers: `projectPath` on ProjectData, validation service, IPC channels, preload bridge, settings UI, health indicator
- Downstream consumers (not in scope): Issue #25 (auto-index), Issue #24 (dynamic phases), Issue #26 (browse files)

---

## Task 1: Define Shared Types for Project Path Service

**Owner**: Junior AI
**Dependencies**: None
**Effort**: 1
**Objective**: Create TypeScript types shared between main process and renderer for path validation and directory listing.

**Steps**:
- [x] Create file `src/main/services/project/types.ts`
- [x] Define `PathValidationResult` interface:
  ```typescript
  interface PathValidationResult {
    valid: boolean;
    projectPath: string;
    errors: string[];
    structure: {
      hasProjectDocuments: boolean;
      hasUserDir: boolean;
      subdirectories: string[];  // Which of slices/tasks/features/architecture exist
    };
  }
  ```
- [x] Define `DirectoryListResult` interface:
  ```typescript
  interface DirectoryListResult {
    files: string[];   // Filenames only, not full paths
    error?: string;
  }
  ```
- [x] Export all types

**Success Criteria**:
- [x] Types file compiles without errors
- [x] Both interfaces match the slice design specification exactly
- [x] Types are importable from both main-process and renderer code

---

## Task 2: Add `projectPath` Field to ProjectData

**Owner**: Junior AI
**Dependencies**: None
**Effort**: 1
**Objective**: Add the optional `projectPath` field to the data model so it is persisted with each project.

**Steps**:
- [x] Open `src/services/storage/types/ProjectData.ts`
- [x] Add `projectPath?: string` to the `ProjectData` interface
  - Place it near the `isMonorepo` / `isMonorepoEnabled` fields (related project-level config)
  - Add a brief comment: `/** Absolute path to project root (contains project-documents/) */`
- [x] Add `projectPath` to the `UpdateProjectData` type's pick list so it can be updated via `onProjectUpdate`
- [x] Verify no migration is needed: `projectPath` defaults to `undefined` for existing projects (the existing `ElectronProjectStore.migrateProjects()` handles new optional fields by default)

**Success Criteria**:
- [x] `ProjectData.projectPath` is accessible in TypeScript without errors
- [x] `UpdateProjectData` includes `projectPath` so settings dialog can update it
- [x] Existing projects load without errors (field is optional, defaults to `undefined`)
- [x] Build passes with no type errors

---

## Task 3: Implement ProjectPathService

**Owner**: Junior AI
**Dependencies**: Task 1
**Effort**: 3
**Objective**: Create the main-process service that validates project paths, performs health checks, and lists directory contents.

**Steps**:
- [x] Create file `src/main/services/project/ProjectPathService.ts`
- [x] Import `PathValidationResult` and `DirectoryListResult` from `./types`
- [x] Import `fs.promises` (stat, readdir, access) and `path` from Node builtins
- [x] Define the expected subdirectory names as a constant:
  ```typescript
  const EXPECTED_SUBDIRS = ['slices', 'tasks', 'features', 'architecture'] as const;
  ```
- [x] Implement `validate(projectPath: string): Promise<PathValidationResult>`:
  - Check `projectPath` is a non-empty string
  - Use `fs.promises.stat(projectPath)` to confirm it exists and is a directory
  - Check for `project-documents/` subdirectory within it
  - Check for `project-documents/user/` subdirectory
  - Check which of `EXPECTED_SUBDIRS` exist under `project-documents/user/`
  - Return `PathValidationResult` with `valid: true` if at minimum `project-documents/` exists
  - On any `fs` error (ENOENT, EACCES, etc.), return `valid: false` with descriptive error in `errors[]`
- [x] Implement `healthCheck(projectPath: string): Promise<PathValidationResult>`:
  - Delegate to `validate()` — same logic, same return type
  - This is a separate method for semantic clarity and future extensibility
- [x] Implement `listDirectory(projectPath: string, subdirectory: string, isMonorepo?: boolean): Promise<DirectoryListResult>`:
  - Build full path: if `isMonorepo`, use `{projectPath}/project-artifacts/{subdirectory}/`; otherwise use `{projectPath}/project-documents/user/{subdirectory}/`
  - Use `fs.promises.readdir` to list files
  - Filter to files only (exclude subdirectories) using `withFileTypes: true`
  - Return `{ files: [...] }` with filenames only (not full paths)
  - On error, return `{ files: [], error: descriptiveMessage }`
- [x] Ensure the class is stateless — no constructor state, all data passed per-call
- [x] Sanitize inputs: reject paths containing `..` traversal or null bytes

**Success Criteria**:
- [x] `validate()` correctly identifies valid project structures
- [x] `validate()` returns specific errors for each failure case (not exists, not directory, no project-documents, etc.)
- [x] `listDirectory()` returns filenames from the correct path based on monorepo flag
- [x] All methods handle filesystem errors gracefully (no unhandled promise rejections)
- [x] No hardcoded absolute paths; all paths derived from the `projectPath` argument

---

## Task 4: Register IPC Handlers for Project Path Service

**Owner**: Junior AI
**Dependencies**: Task 3
**Effort**: 2
**Objective**: Expose ProjectPathService to the renderer via Electron IPC channels, plus a folder-picker channel.

**Steps**:
- [x] Create file `src/main/ipc/projectPathService.ts`
- [x] Import `ipcMain`, `dialog`, `BrowserWindow` from `electron`
- [x] Import `ProjectPathService` from `../services/project/ProjectPathService`
- [x] Import types from `../services/project/types`
- [x] Create singleton `ProjectPathService` instance at module level
- [x] Implement `setupProjectPathHandlers()` function that registers four IPC handlers:
  - `project-path:validate` — receives `{ path: string }`, calls `service.validate(path)`, returns `PathValidationResult`
  - `project-path:health-check` — receives `{ path: string }`, calls `service.healthCheck(path)`, returns `PathValidationResult`
  - `project-path:list-directory` — receives `{ path: string, subdirectory: string, isMonorepo?: boolean }`, calls `service.listDirectory(...)`, returns `DirectoryListResult`
  - `project-path:pick-folder` — wraps `dialog.showOpenDialog({ properties: ['openDirectory'] })`, returns `{ path: string }` if user selects a folder, or `null` if canceled
- [x] For `pick-folder`, get the focused `BrowserWindow` to use as parent for the dialog (ensures dialog is modal to the app window)
- [x] Add input validation on each handler: verify expected fields are present, return structured error if not
- [x] Implement `removeProjectPathHandlers()` function that removes all four handlers (following the pattern in `contextServices.ts`)
- [x] Export both `setupProjectPathHandlers` and `removeProjectPathHandlers`

**Steps (registration in main.ts)**:
- [x] Open `src/main/main.ts`
- [x] Import `setupProjectPathHandlers` from `./ipc/projectPathService`
- [x] Call `setupProjectPathHandlers()` in the app initialization section, alongside the existing `setupContextServiceHandlers()` call

**Success Criteria**:
- [x] All four IPC channels are registered when the app starts
- [x] `project-path:pick-folder` opens the native OS folder picker dialog
- [x] Invalid inputs to any handler return a structured error (not an unhandled exception)
- [x] Follows the same conventions as `contextServices.ts` (handle/removeHandler pattern)

---

## Task 5: Update Preload Bridge with projectPath Namespace

**Owner**: Junior AI
**Dependencies**: Task 4
**Effort**: 1
**Objective**: Expose project path IPC calls to the renderer via `window.electronAPI.projectPath`.

**Steps**:
- [x] Open `src/preload/preload.ts`
- [x] Add `projectPath` namespace to the `contextBridge.exposeInMainWorld` call:
  ```typescript
  projectPath: {
    validate: (path: string) => ipcRenderer.invoke('project-path:validate', { path }),
    healthCheck: (path: string) => ipcRenderer.invoke('project-path:health-check', { path }),
    listDirectory: (path: string, subdirectory: string, isMonorepo?: boolean) =>
      ipcRenderer.invoke('project-path:list-directory', { path, subdirectory, isMonorepo }),
    pickFolder: () => ipcRenderer.invoke('project-path:pick-folder'),
  }
  ```
- [x] If a TypeScript declaration file exists for `window.electronAPI` (check for `*.d.ts` or type augmentation), update it to include the `projectPath` namespace with proper return types referencing `PathValidationResult` and `DirectoryListResult`

**Success Criteria**:
- [x] `window.electronAPI.projectPath.validate(...)` is callable from renderer
- [x] `window.electronAPI.projectPath.healthCheck(...)` is callable from renderer
- [x] `window.electronAPI.projectPath.listDirectory(...)` is callable from renderer
- [x] `window.electronAPI.projectPath.pickFolder()` is callable from renderer
- [x] TypeScript types are correctly declared so renderer code gets autocomplete and type checking

---

## Task 6: Create ProjectPathSection Component for Settings Dialog

**Owner**: Junior AI
**Dependencies**: Tasks 2, 5
**Effort**: 3
**Objective**: Build the settings UI section that lets users browse for a project path, see validation results, and clear the path.

**Steps**:
- [x] Create file `src/components/settings/ProjectPathSection.tsx`
- [x] Define props interface:
  ```typescript
  interface ProjectPathSectionProps {
    projectPath?: string;
    onPathChange: (path: string | undefined) => void;
  }
  ```
- [x] Implement component state:
  - `validationResult: PathValidationResult | null` — result of most recent validation
  - `isValidating: boolean` — loading state during validation
- [x] Implement **Browse button** handler:
  - Call `window.electronAPI.projectPath.pickFolder()`
  - If user selects a folder (non-null result), call `window.electronAPI.projectPath.validate(path)`
  - Set `isValidating` during the validation call
  - If valid, call `onPathChange(path)` to update the project
  - Display the validation result regardless of outcome
- [x] Implement **Clear button/action**:
  - Call `onPathChange(undefined)` to remove the path
  - Clear the validation result state
- [x] Implement **validation feedback display**:
  - **Valid**: green text, e.g., "Path valid — {n} subdirectories found" (listing which ones from `structure.subdirectories`)
  - **Invalid**: red text showing first error from `errors[]`
  - **Empty/no path**: neutral text, "No project path set — some features require a path"
  - **Validating**: show a brief loading state
- [x] Render layout:
  - Section heading: "Project Path"
  - Read-only text input displaying current `projectPath` (or placeholder "No path selected")
  - "Browse..." button to the right of the input
  - Validation feedback text below the input
  - Clear affordance (small "×" or "Clear" text button) visible when a path is set
- [x] Run validation on mount if `projectPath` is already set (so users see current status when opening settings)
- [x] Use Tailwind 4 classes consistent with the existing settings dialog styling
- [x] Use existing UI components from the project's component library (check for Button, Input components in `src/components/ui-core/`)

**Success Criteria**:
- [x] Browse button opens native folder picker
- [x] Selected path is validated and feedback is shown immediately
- [x] Valid path updates the project via `onPathChange`
- [x] Invalid path shows specific error but does not update the project
- [x] Clear removes the path and resets feedback
- [x] Existing path shows validation status on mount
- [x] Component is self-contained and ready to embed in SettingsDialog

---

## Task 7: Integrate ProjectPathSection into SettingsDialog

**Owner**: Junior AI
**Dependencies**: Task 6
**Effort**: 1
**Objective**: Add the ProjectPathSection to the existing SettingsDialog above the monorepo toggle.

**Steps**:
- [x] Open `src/components/settings/SettingsDialog.tsx`
- [x] Import `ProjectPathSection` from `./ProjectPathSection`
- [x] Add a handler for path changes:
  - `handlePathChange(path: string | undefined)` calls `onProjectUpdate({ projectPath: path })`
- [x] Insert `<ProjectPathSection>` in the dialog body **above** the Repository Type section:
  - Pass `projectPath={currentProject.projectPath}`
  - Pass `onPathChange={handlePathChange}`
- [x] Only render the section when `currentProject` is not null (same guard as existing content)

**Success Criteria**:
- [x] ProjectPathSection appears above the monorepo toggle in the settings dialog
- [x] Path changes propagate through `onProjectUpdate` to persistence (via existing auto-save)
- [x] Dialog layout is visually consistent (no overlap or spacing issues)
- [x] Existing monorepo toggle functionality is unaffected

---

## Task 8: Create HealthIndicator Component

**Owner**: Junior AI
**Dependencies**: Task 5
**Effort**: 2
**Objective**: Build a small visual indicator component that shows project path health at a glance.

**Steps**:
- [x] Create file `src/components/settings/HealthIndicator.tsx`
- [x] Define props interface:
  ```typescript
  interface HealthIndicatorProps {
    projectPath?: string;
    onClick: () => void;  // Opens settings dialog
  }
  ```
- [x] Implement component state:
  - `status: 'none' | 'valid' | 'invalid' | 'checking'`
- [x] Implement health check logic:
  - On mount and when `projectPath` changes: if `projectPath` is set, call `window.electronAPI.projectPath.healthCheck(projectPath)` and update status
  - If `projectPath` is undefined, set status to `'none'`
- [x] Render based on status:
  - `'none'`: render nothing (no indicator when no path is set)
  - `'valid'`: small green dot/circle (use Tailwind: `bg-green-500 rounded-full w-2.5 h-2.5`)
  - `'invalid'`: small amber/red dot (use Tailwind: `bg-amber-500` or `bg-red-500`)
  - `'checking'`: subtle pulsing animation (Tailwind `animate-pulse`) on neutral dot
- [x] Add `cursor-pointer` and `onClick` handler on the indicator — clicking opens settings
- [x] Add a `title` attribute (tooltip) with status description:
  - Valid: "Project path valid"
  - Invalid: "Project path issue — click to fix"
  - Checking: "Checking project path..."
- [x] Keep the component minimal — no text, just the dot + tooltip

**Success Criteria**:
- [x] Indicator shows correct color for each status
- [x] Health check runs on mount when projectPath is present
- [x] Health check re-runs when projectPath value changes
- [x] Clicking the indicator fires the onClick callback
- [x] No indicator is rendered when projectPath is undefined
- [x] Component is small and visually unobtrusive

---

## Task 9: Integrate HealthIndicator into ContextBuilderApp

**Owner**: Junior AI
**Dependencies**: Tasks 7, 8
**Effort**: 2
**Objective**: Add the health indicator to the main UI and wire up health checks on project switch.

**Steps**:
- [x] Open `src/components/ContextBuilderApp.tsx`
- [x] Import `HealthIndicator` from `./settings/HealthIndicator`
- [x] Place `<HealthIndicator>` near the existing settings gear icon in the Project Configuration header area:
  - Pass `projectPath={currentProject?.projectPath}`
  - Pass `onClick` handler that opens the SettingsDialog (reuse existing settings open mechanism)
- [x] Ensure the `handleProjectUpdate` function already supports `projectPath` updates — it should, since it passes partial updates through to storage. Verify and fix if needed.
- [x] Verify the health indicator updates when:
  - A different project is selected (projectPath changes via prop)
  - The path is set/changed/cleared in Settings (projectPath changes via auto-save round-trip)

**Success Criteria**:
- [x] Health indicator appears next to the gear icon when a project has a path set
- [x] Health indicator is hidden when no path is set
- [x] Indicator shows correct status after project switch
- [x] Clicking the indicator opens the Settings dialog
- [x] Setting/changing/clearing a path in Settings updates the indicator

---

## Task 10: Build Verification and Integration Check

**Owner**: Junior AI
**Dependencies**: Tasks 1-9
**Effort**: 1
**Objective**: Verify the full slice builds and integrates correctly.

**Steps**:
- [x] Run `pnpm build` — fix any TypeScript or build errors
- [x] Verify no regressions in existing functionality:
  - [x] SettingsDialog still opens and monorepo toggle works
  - [x] Project switching still works
  - [x] Auto-save still persists changes
  - [x] Context generation is unchanged
- [x] Verify new functionality connects end-to-end:
  - [x] Settings dialog shows ProjectPathSection
  - [x] Browse button invokes native folder picker
  - [x] Selecting a valid project path shows green validation feedback
  - [x] Selecting an invalid path shows error feedback
  - [x] Health indicator appears in the main UI after setting a path
  - [x] Clearing the path hides the health indicator
- [x] If tests exist (`pnpm test`), run them and verify no failures

**Success Criteria**:
- [x] Build succeeds with no errors (warnings acceptable)
- [x] No regressions in existing features
- [x] New path awareness features are functional end-to-end
- [x] All existing tests pass (if test suite exists)

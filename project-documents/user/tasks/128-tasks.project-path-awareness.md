---
layer: project
docType: tasks
slice: project-path-awareness
project: context-forge
lld: user/slices/128-slice.project-path-awareness.md
architecture: user/architecture/050-arch.prompt-system-decoupling.md
dependencies: []
status: not started
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
- [ ] Create file `src/main/services/project/types.ts`
- [ ] Define `PathValidationResult` interface:
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
- [ ] Define `DirectoryListResult` interface:
  ```typescript
  interface DirectoryListResult {
    files: string[];   // Filenames only, not full paths
    error?: string;
  }
  ```
- [ ] Export all types

**Success Criteria**:
- [ ] Types file compiles without errors
- [ ] Both interfaces match the slice design specification exactly
- [ ] Types are importable from both main-process and renderer code

---

## Task 2: Add `projectPath` Field to ProjectData

**Owner**: Junior AI
**Dependencies**: None
**Effort**: 1
**Objective**: Add the optional `projectPath` field to the data model so it is persisted with each project.

**Steps**:
- [ ] Open `src/services/storage/types/ProjectData.ts`
- [ ] Add `projectPath?: string` to the `ProjectData` interface
  - Place it near the `isMonorepo` / `isMonorepoEnabled` fields (related project-level config)
  - Add a brief comment: `/** Absolute path to project root (contains project-documents/) */`
- [ ] Add `projectPath` to the `UpdateProjectData` type's pick list so it can be updated via `onProjectUpdate`
- [ ] Verify no migration is needed: `projectPath` defaults to `undefined` for existing projects (the existing `ElectronProjectStore.migrateProjects()` handles new optional fields by default)

**Success Criteria**:
- [ ] `ProjectData.projectPath` is accessible in TypeScript without errors
- [ ] `UpdateProjectData` includes `projectPath` so settings dialog can update it
- [ ] Existing projects load without errors (field is optional, defaults to `undefined`)
- [ ] Build passes with no type errors

---

## Task 3: Implement ProjectPathService

**Owner**: Junior AI
**Dependencies**: Task 1
**Effort**: 3
**Objective**: Create the main-process service that validates project paths, performs health checks, and lists directory contents.

**Steps**:
- [ ] Create file `src/main/services/project/ProjectPathService.ts`
- [ ] Import `PathValidationResult` and `DirectoryListResult` from `./types`
- [ ] Import `fs.promises` (stat, readdir, access) and `path` from Node builtins
- [ ] Define the expected subdirectory names as a constant:
  ```typescript
  const EXPECTED_SUBDIRS = ['slices', 'tasks', 'features', 'architecture'] as const;
  ```
- [ ] Implement `validate(projectPath: string): Promise<PathValidationResult>`:
  - Check `projectPath` is a non-empty string
  - Use `fs.promises.stat(projectPath)` to confirm it exists and is a directory
  - Check for `project-documents/` subdirectory within it
  - Check for `project-documents/user/` subdirectory
  - Check which of `EXPECTED_SUBDIRS` exist under `project-documents/user/`
  - Return `PathValidationResult` with `valid: true` if at minimum `project-documents/` exists
  - On any `fs` error (ENOENT, EACCES, etc.), return `valid: false` with descriptive error in `errors[]`
- [ ] Implement `healthCheck(projectPath: string): Promise<PathValidationResult>`:
  - Delegate to `validate()` — same logic, same return type
  - This is a separate method for semantic clarity and future extensibility
- [ ] Implement `listDirectory(projectPath: string, subdirectory: string, isMonorepo?: boolean): Promise<DirectoryListResult>`:
  - Build full path: if `isMonorepo`, use `{projectPath}/project-artifacts/{subdirectory}/`; otherwise use `{projectPath}/project-documents/user/{subdirectory}/`
  - Use `fs.promises.readdir` to list files
  - Filter to files only (exclude subdirectories) using `withFileTypes: true`
  - Return `{ files: [...] }` with filenames only (not full paths)
  - On error, return `{ files: [], error: descriptiveMessage }`
- [ ] Ensure the class is stateless — no constructor state, all data passed per-call
- [ ] Sanitize inputs: reject paths containing `..` traversal or null bytes

**Success Criteria**:
- [ ] `validate()` correctly identifies valid project structures
- [ ] `validate()` returns specific errors for each failure case (not exists, not directory, no project-documents, etc.)
- [ ] `listDirectory()` returns filenames from the correct path based on monorepo flag
- [ ] All methods handle filesystem errors gracefully (no unhandled promise rejections)
- [ ] No hardcoded absolute paths; all paths derived from the `projectPath` argument

---

## Task 4: Register IPC Handlers for Project Path Service

**Owner**: Junior AI
**Dependencies**: Task 3
**Effort**: 2
**Objective**: Expose ProjectPathService to the renderer via Electron IPC channels, plus a folder-picker channel.

**Steps**:
- [ ] Create file `src/main/ipc/projectPathService.ts`
- [ ] Import `ipcMain`, `dialog`, `BrowserWindow` from `electron`
- [ ] Import `ProjectPathService` from `../services/project/ProjectPathService`
- [ ] Import types from `../services/project/types`
- [ ] Create singleton `ProjectPathService` instance at module level
- [ ] Implement `setupProjectPathHandlers()` function that registers four IPC handlers:
  - `project-path:validate` — receives `{ path: string }`, calls `service.validate(path)`, returns `PathValidationResult`
  - `project-path:health-check` — receives `{ path: string }`, calls `service.healthCheck(path)`, returns `PathValidationResult`
  - `project-path:list-directory` — receives `{ path: string, subdirectory: string, isMonorepo?: boolean }`, calls `service.listDirectory(...)`, returns `DirectoryListResult`
  - `project-path:pick-folder` — wraps `dialog.showOpenDialog({ properties: ['openDirectory'] })`, returns `{ path: string }` if user selects a folder, or `null` if canceled
- [ ] For `pick-folder`, get the focused `BrowserWindow` to use as parent for the dialog (ensures dialog is modal to the app window)
- [ ] Add input validation on each handler: verify expected fields are present, return structured error if not
- [ ] Implement `removeProjectPathHandlers()` function that removes all four handlers (following the pattern in `contextServices.ts`)
- [ ] Export both `setupProjectPathHandlers` and `removeProjectPathHandlers`

**Steps (registration in main.ts)**:
- [ ] Open `src/main/main.ts`
- [ ] Import `setupProjectPathHandlers` from `./ipc/projectPathService`
- [ ] Call `setupProjectPathHandlers()` in the app initialization section, alongside the existing `setupContextServiceHandlers()` call

**Success Criteria**:
- [ ] All four IPC channels are registered when the app starts
- [ ] `project-path:pick-folder` opens the native OS folder picker dialog
- [ ] Invalid inputs to any handler return a structured error (not an unhandled exception)
- [ ] Follows the same conventions as `contextServices.ts` (handle/removeHandler pattern)

---

## Task 5: Update Preload Bridge with projectPath Namespace

**Owner**: Junior AI
**Dependencies**: Task 4
**Effort**: 1
**Objective**: Expose project path IPC calls to the renderer via `window.electronAPI.projectPath`.

**Steps**:
- [ ] Open `src/preload/preload.ts`
- [ ] Add `projectPath` namespace to the `contextBridge.exposeInMainWorld` call:
  ```typescript
  projectPath: {
    validate: (path: string) => ipcRenderer.invoke('project-path:validate', { path }),
    healthCheck: (path: string) => ipcRenderer.invoke('project-path:health-check', { path }),
    listDirectory: (path: string, subdirectory: string, isMonorepo?: boolean) =>
      ipcRenderer.invoke('project-path:list-directory', { path, subdirectory, isMonorepo }),
    pickFolder: () => ipcRenderer.invoke('project-path:pick-folder'),
  }
  ```
- [ ] If a TypeScript declaration file exists for `window.electronAPI` (check for `*.d.ts` or type augmentation), update it to include the `projectPath` namespace with proper return types referencing `PathValidationResult` and `DirectoryListResult`

**Success Criteria**:
- [ ] `window.electronAPI.projectPath.validate(...)` is callable from renderer
- [ ] `window.electronAPI.projectPath.healthCheck(...)` is callable from renderer
- [ ] `window.electronAPI.projectPath.listDirectory(...)` is callable from renderer
- [ ] `window.electronAPI.projectPath.pickFolder()` is callable from renderer
- [ ] TypeScript types are correctly declared so renderer code gets autocomplete and type checking

---

## Task 6: Create ProjectPathSection Component for Settings Dialog

**Owner**: Junior AI
**Dependencies**: Tasks 2, 5
**Effort**: 3
**Objective**: Build the settings UI section that lets users browse for a project path, see validation results, and clear the path.

**Steps**:
- [ ] Create file `src/components/settings/ProjectPathSection.tsx`
- [ ] Define props interface:
  ```typescript
  interface ProjectPathSectionProps {
    projectPath?: string;
    onPathChange: (path: string | undefined) => void;
  }
  ```
- [ ] Implement component state:
  - `validationResult: PathValidationResult | null` — result of most recent validation
  - `isValidating: boolean` — loading state during validation
- [ ] Implement **Browse button** handler:
  - Call `window.electronAPI.projectPath.pickFolder()`
  - If user selects a folder (non-null result), call `window.electronAPI.projectPath.validate(path)`
  - Set `isValidating` during the validation call
  - If valid, call `onPathChange(path)` to update the project
  - Display the validation result regardless of outcome
- [ ] Implement **Clear button/action**:
  - Call `onPathChange(undefined)` to remove the path
  - Clear the validation result state
- [ ] Implement **validation feedback display**:
  - **Valid**: green text, e.g., "Path valid — {n} subdirectories found" (listing which ones from `structure.subdirectories`)
  - **Invalid**: red text showing first error from `errors[]`
  - **Empty/no path**: neutral text, "No project path set — some features require a path"
  - **Validating**: show a brief loading state
- [ ] Render layout:
  - Section heading: "Project Path"
  - Read-only text input displaying current `projectPath` (or placeholder "No path selected")
  - "Browse..." button to the right of the input
  - Validation feedback text below the input
  - Clear affordance (small "×" or "Clear" text button) visible when a path is set
- [ ] Run validation on mount if `projectPath` is already set (so users see current status when opening settings)
- [ ] Use Tailwind 4 classes consistent with the existing settings dialog styling
- [ ] Use existing UI components from the project's component library (check for Button, Input components in `src/components/ui-core/`)

**Success Criteria**:
- [ ] Browse button opens native folder picker
- [ ] Selected path is validated and feedback is shown immediately
- [ ] Valid path updates the project via `onPathChange`
- [ ] Invalid path shows specific error but does not update the project
- [ ] Clear removes the path and resets feedback
- [ ] Existing path shows validation status on mount
- [ ] Component is self-contained and ready to embed in SettingsDialog

---

## Task 7: Integrate ProjectPathSection into SettingsDialog

**Owner**: Junior AI
**Dependencies**: Task 6
**Effort**: 1
**Objective**: Add the ProjectPathSection to the existing SettingsDialog above the monorepo toggle.

**Steps**:
- [ ] Open `src/components/settings/SettingsDialog.tsx`
- [ ] Import `ProjectPathSection` from `./ProjectPathSection`
- [ ] Add a handler for path changes:
  - `handlePathChange(path: string | undefined)` calls `onProjectUpdate({ projectPath: path })`
- [ ] Insert `<ProjectPathSection>` in the dialog body **above** the Repository Type section:
  - Pass `projectPath={currentProject.projectPath}`
  - Pass `onPathChange={handlePathChange}`
- [ ] Only render the section when `currentProject` is not null (same guard as existing content)

**Success Criteria**:
- [ ] ProjectPathSection appears above the monorepo toggle in the settings dialog
- [ ] Path changes propagate through `onProjectUpdate` to persistence (via existing auto-save)
- [ ] Dialog layout is visually consistent (no overlap or spacing issues)
- [ ] Existing monorepo toggle functionality is unaffected

---

## Task 8: Create HealthIndicator Component

**Owner**: Junior AI
**Dependencies**: Task 5
**Effort**: 2
**Objective**: Build a small visual indicator component that shows project path health at a glance.

**Steps**:
- [ ] Create file `src/components/settings/HealthIndicator.tsx`
- [ ] Define props interface:
  ```typescript
  interface HealthIndicatorProps {
    projectPath?: string;
    onClick: () => void;  // Opens settings dialog
  }
  ```
- [ ] Implement component state:
  - `status: 'none' | 'valid' | 'invalid' | 'checking'`
- [ ] Implement health check logic:
  - On mount and when `projectPath` changes: if `projectPath` is set, call `window.electronAPI.projectPath.healthCheck(projectPath)` and update status
  - If `projectPath` is undefined, set status to `'none'`
- [ ] Render based on status:
  - `'none'`: render nothing (no indicator when no path is set)
  - `'valid'`: small green dot/circle (use Tailwind: `bg-green-500 rounded-full w-2.5 h-2.5`)
  - `'invalid'`: small amber/red dot (use Tailwind: `bg-amber-500` or `bg-red-500`)
  - `'checking'`: subtle pulsing animation (Tailwind `animate-pulse`) on neutral dot
- [ ] Add `cursor-pointer` and `onClick` handler on the indicator — clicking opens settings
- [ ] Add a `title` attribute (tooltip) with status description:
  - Valid: "Project path valid"
  - Invalid: "Project path issue — click to fix"
  - Checking: "Checking project path..."
- [ ] Keep the component minimal — no text, just the dot + tooltip

**Success Criteria**:
- [ ] Indicator shows correct color for each status
- [ ] Health check runs on mount when projectPath is present
- [ ] Health check re-runs when projectPath value changes
- [ ] Clicking the indicator fires the onClick callback
- [ ] No indicator is rendered when projectPath is undefined
- [ ] Component is small and visually unobtrusive

---

## Task 9: Integrate HealthIndicator into ContextBuilderApp

**Owner**: Junior AI
**Dependencies**: Tasks 7, 8
**Effort**: 2
**Objective**: Add the health indicator to the main UI and wire up health checks on project switch.

**Steps**:
- [ ] Open `src/components/ContextBuilderApp.tsx`
- [ ] Import `HealthIndicator` from `./settings/HealthIndicator`
- [ ] Place `<HealthIndicator>` near the existing settings gear icon in the Project Configuration header area:
  - Pass `projectPath={currentProject?.projectPath}`
  - Pass `onClick` handler that opens the SettingsDialog (reuse existing settings open mechanism)
- [ ] Ensure the `handleProjectUpdate` function already supports `projectPath` updates — it should, since it passes partial updates through to storage. Verify and fix if needed.
- [ ] Verify the health indicator updates when:
  - A different project is selected (projectPath changes via prop)
  - The path is set/changed/cleared in Settings (projectPath changes via auto-save round-trip)

**Success Criteria**:
- [ ] Health indicator appears next to the gear icon when a project has a path set
- [ ] Health indicator is hidden when no path is set
- [ ] Indicator shows correct status after project switch
- [ ] Clicking the indicator opens the Settings dialog
- [ ] Setting/changing/clearing a path in Settings updates the indicator

---

## Task 10: Build Verification and Integration Check

**Owner**: Junior AI
**Dependencies**: Tasks 1-9
**Effort**: 1
**Objective**: Verify the full slice builds and integrates correctly.

**Steps**:
- [ ] Run `pnpm build` — fix any TypeScript or build errors
- [ ] Verify no regressions in existing functionality:
  - SettingsDialog still opens and monorepo toggle works
  - Project switching still works
  - Auto-save still persists changes
  - Context generation is unchanged
- [ ] Verify new functionality connects end-to-end:
  - Settings dialog shows ProjectPathSection
  - Browse button invokes native folder picker
  - Selecting a valid project path shows green validation feedback
  - Selecting an invalid path shows error feedback
  - Health indicator appears in the main UI after setting a path
  - Clearing the path hides the health indicator
- [ ] If tests exist (`pnpm test`), run them and verify no failures

**Success Criteria**:
- [ ] Build succeeds with no errors (warnings acceptable)
- [ ] No regressions in existing features
- [ ] New path awareness features are functional end-to-end
- [ ] All existing tests pass (if test suite exists)

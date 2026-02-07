---
item: persistence
project: context-builder
type: slice-tasks
lldReference: private/slices/050-slice.persistence.md
dependencies: [foundation, context-templates]
projectState: complete
lastUpdated: 2026-02-07
---

# Task Breakdown: Persistence & Multi-Project Foundation

## Context Summary

This slice implements data persistence so users' work survives app restarts. We're building with an implicit project model that works for single-project use immediately but supports multi-project workflows without requiring UI changes. The implementation uses existing ElectronStorageService infrastructure with IPC communication for secure file system access.

Phase 1 focuses on automatic persistence without any UI changes. Phase 2 (future) will add project management UI on top of the same foundation.

## Task List

### Task 1: Create App State Types and Interfaces
**Effort: 1/5**

- [x] **Task 1.1: Create AppState Type Definition**
  - Create `src/services/storage/types/AppState.ts`
  - Define AppState interface with lastActiveProjectId, windowBounds, panelSizes, appVersion, lastOpened
  - Export all types for use in storage services
  - **Success:** TypeScript types compile without errors

- [x] **Task 1.2: Extend ProjectData Type**
  - Update `src/services/storage/types/ProjectData.ts` if needed
  - Ensure all form fields are captured in ProjectData interface
  - Add any missing fields (availableTools, recentEvents, etc.)
  - **Success:** ProjectData type captures all form state

### Task 2: Create PersistentProjectStore Service
**Effort: 3/5**

- [x] **Task 2.1: Create PersistentProjectStore Class Structure**
  - Create `src/services/storage/PersistentProjectStore.ts`
  - Import ElectronStorageService and StorageClient
  - Create class with private storage service instance
  - Add constructor with initialization logic
  - **Success:** Basic class structure exists and compiles

- [x] **Task 2.2: Implement Project Operations**
  - [x] **2.2.1: Implement loadProjects() method**
    - Call ElectronStorageService.readProjects()
    - Handle empty state (return empty array)
    - Add error handling with console logging
    - **Success:** Can load existing projects or return empty array
  
  - [x] **2.2.2: Implement saveProject() method**
    - Validate project data before saving
    - Call ElectronStorageService.writeProjects() with updated array
    - Handle write errors gracefully
    - **Success:** New projects persist to disk
  
  - [x] **2.2.3: Implement updateProject() method**
    - Find project by ID in loaded projects
    - Merge updates with existing data
    - Update the updatedAt timestamp
    - Save entire projects array back to disk
    - **Success:** Project updates persist correctly
  
  - [x] **2.2.4: Implement deleteProject() method**
    - Filter out project by ID
    - Save updated projects array
    - Handle case where project doesn't exist
    - **Success:** Projects can be removed from storage

- [x] **Task 2.3: Implement App State Operations**
  - [x] **2.3.1: Implement getAppState() method**
    - Read from 'app-state.json' file
    - Return default state if file doesn't exist
    - Parse JSON and validate structure
    - **Success:** App state loads or returns defaults
  
  - [x] **2.3.2: Implement updateAppState() method**
    - Merge partial updates with existing state
    - Update lastOpened timestamp
    - Write to 'app-state.json' atomically
    - **Success:** App state changes persist
  
  - [x] **2.3.3: Implement lastActiveProject helpers**
    - Add getLastActiveProject() method
    - Add setLastActiveProject() method
    - These should use app state internally
    - **Success:** Can track which project was last used

- [x] **Task 2.4: Add Utility Methods**
  - [x] **2.4.1: Implement generateId() helper**
    - Create unique project IDs using timestamp + random
    - Format: `project_${Date.now()}_${randomString}`
    - **Success:** Generated IDs are unique
  
  - [x] **2.4.2: Implement createDefaultProject() method**
    - Create project with sensible defaults
    - Set name to "My Project"
    - Initialize all required fields
    - **Success:** Default project has all required fields

### Task 3: Integrate Persistence with ContextBuilderApp
**Effort: 3/5**

- [x] **Task 3.1: Add Persistence State Management**
  - [x] **3.1.1: Add storage service instance**
    - Import PersistentProjectStore in ContextBuilderApp
    - Create instance as component-level constant or context
    - Handle initialization errors
    - **Success:** Storage service available in component
  
  - [x] **3.1.2: Add currentProjectId state**
    - Add useState for tracking current project ID
    - Initialize as null until loaded
    - Update when project changes
    - **Success:** Component tracks active project

- [x] **Task 3.2: Implement Load on Mount**
  - [x] **3.2.1: Create loadLastSession effect**
    - Add useEffect with empty dependency array
    - Load all projects from storage
    - Get last active project ID from app state
    - **Success:** Effect runs once on mount
  
  - [x] **3.2.2: Handle initial project creation**
    - Check if any projects exist
    - If none, create and save default project
    - Set default project as active
    - **Success:** First-time users get a default project
  
  - [x] **3.2.3: Restore last active project**
    - Find project by last active ID
    - Fall back to first project if not found
    - Populate form with project data
    - **Success:** Form shows last session's data

- [x] **Task 3.3: Implement Auto-Save on Change**
  - [x] **3.3.1: Create auto-save effect**
    - Add useEffect watching formData changes
    - Skip if no current project ID
    - Add 500ms debounce timer
    - **Success:** Effect triggers on form changes
  
  - [x] **3.3.2: Implement save logic**
    - Clear previous timer on new changes
    - After debounce, call updateProject()
    - Handle save errors (log, don't crash)
    - **Success:** Changes persist after 500ms pause
  
  - [x] **3.3.3: Update last active project**
    - Call setLastActiveProject on saves
    - Update app state with current timestamp
    - **Success:** App remembers last edited project

- [x] **Task 3.4: Add Loading States** (DEFERRED)
  - [ ] **3.4.1: Add isLoading state** (DEFERRED)
    - Track initial load status
    - Show loading indicator during startup
    - Prevent form interaction while loading
    - **Status:** DEFERRED - marked as simplified, no complex UI states needed
    - **Success:** User sees loading feedback (simplified - no complex UI states)

  - [ ] **3.4.2: Add save indicator** (DEFERRED)
    - Track save status (saving/saved/error)
    - Show subtle indicator (e.g., dot or text)
    - Clear after successful save
    - **Status:** DEFERRED - marked as simplified, no complex UI states needed
    - **Success:** User knows when data is saved (simplified - no complex UI states)


## Task Dependencies

### Sequential Dependencies
- Task 1 (Types) must complete before Task 2 (Store Service)
- Task 2 (Store Service) must complete before Task 3 (Integration)
- Task 5 (IPC Handlers) should complete before Task 3 (Integration)
- Tasks 1-3 must complete before Task 4 (Edge Cases)
- All implementation tasks before Task 6 (Testing)

### Parallel Work Opportunities
- Task 1 (Types) and Task 5 (IPC) can be done in parallel
- Task 4 (Edge Cases) can be developed alongside Task 3 (Integration)

## Success Criteria Summary

Upon completion of all tasks:
- [ ] User data persists between app sessions
- [ ] No explicit save/load actions required
- [ ] App remembers last edited project
- [ ] Graceful handling of storage errors
- [ ] Performance within specified limits (< 50ms saves)
- [ ] Clean foundation for multi-project support

## Implementation Notes

### Key Decisions
- Use debounced auto-save (500ms) to balance responsiveness and performance
- Single implicit project for Phase 1, expandable to multi-project
- Atomic writes to prevent corruption
- Silent error recovery where possible

### Future Considerations (Phase 2)
- Project selector dropdown UI
- Project management operations (new, delete, rename)
- Import/export functionality
- Project templates and presets
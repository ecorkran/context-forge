---
item: foundation
project: context-builder
type: slice
github: 
dependencies: []
projectState: Phase 4 slice design in progress
status: not started
dateCreated: 20250910
dateUpdated: 20250910
---

# Foundation Design: Core Layout Structure & Local Storage

## Overview
Establishes the fundamental application architecture: split-pane layout system for input/output separation and JSON-based local storage for project data persistence.

## Technical Scope
- Split-pane responsive layout (controls left, output right)
- Local storage system using JSON files in app data directory
- Basic application shell with proper window management
- Core data structures and persistence layer

## Architecture

### Layout Components
```
src/components/layout/
├── AppShell.tsx              # Main application container
├── SplitPaneLayout.tsx       # Two-panel layout with resizer
├── LeftPanel.tsx             # Input controls container
└── RightPanel.tsx            # Output display container
```

### Storage System
```
src/services/storage/
├── StorageService.ts         # File system operations
├── ProjectStore.ts           # Project CRUD operations
└── types/ProjectData.ts      # Data schemas
```

## Technical Decisions

### Layout Implementation
- **Split-pane:** Custom CSS Grid implementation with draggable splitter (use radix primitive if available)
- **Responsive:** Default 40/60 split, user-adjustable via drag handle, stack on narrow windows
- **Window:** Minimum 1024x768, default 1440x900

### Storage Architecture
- **Location:** `app.getPath('userData')/context-builder/projects.json`
- **Format:** Single JSON file with project array
- **Backup:** Auto-backup on write operations
- **Schema:**
```typescript
interface ProjectData {
  id: string;
  name: string;
  template: string;
  slice: string;
  isMonorepo: boolean;
  createdAt: string;
  updatedAt: string;
}
```

## Implementation Details

### Layout Structure
```typescript
// AppShell.tsx
<div className="app-container h-screen">
  <SplitPaneLayout>
    <LeftPanel className="min-w-80">
      {/* Form controls rendered here */}
    </LeftPanel>
    <div className="resize-handle cursor-col-resize" onMouseDown={handleDragStart} />
    <RightPanel className="flex-1">
      {/* Output display rendered here */}
    </RightPanel>
  </SplitPaneLayout>
</div>
```

### Storage Operations
```typescript
// Core storage methods
class ProjectStore {
  async load(): Promise<ProjectData[]>
  async save(projects: ProjectData[]): Promise<void>
  async create(project: Omit<ProjectData, 'id'>): Promise<ProjectData>
  async update(id: string, updates: Partial<ProjectData>): Promise<void>
  async delete(id: string): Promise<void>
}
```

## Integration Points

### Provides to Feature Slices
- **Layout Containers:** LeftPanel and RightPanel for content rendering
- **Storage API:** ProjectStore for all project data operations
- **Data Schema:** ProjectData interface for type consistency

### File System Integration
- **Electron Main Process:** File system access via IPC
- **Error Handling:** File corruption detection and recovery
- **Permissions:** Standard user directory access

## Success Criteria

### Layout Requirements
- Split-pane layout renders correctly on all target screen sizes
- Panels maintain proper proportions during window resize
- Layout provides stable containers for feature slice components

### Storage Requirements
- Project data persists between application sessions
- File corruption handled gracefully with user notification
- CRUD operations complete without data loss
- Multiple projects stored and retrieved correctly

## Key Considerations

### Layout Constraints
- Left panel minimum width prevents form control truncation
- Right panel scrolls vertically for long context output
- Window resize maintains usable interface proportions

### Storage Reliability
- Atomic writes prevent data corruption during save operations
- JSON validation on load detects and handles corrupted data
- Backup file created before each write operation
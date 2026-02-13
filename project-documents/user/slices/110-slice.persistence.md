---
item: persistence-and-multiproject
project: context-builder
type: slice
dependencies: [foundation, context-templates]
projectState: Ready for implementation - infrastructure exists
status: not-started
dateCreated: 20250913
dateUpdated: 20250127
---

# Slice Design: Persistence & Multi-Project Foundation

## Problem Statement

Currently, the application loses all user data on restart. Users must re-enter all information every session, making the tool frustrating for real work. We need persistence that works for single-project use immediately but builds toward multi-project support.

## Solution Overview

Implement persistence with an implicit project model that supports both single and multi-project workflows without UI complexity.

## Implementation Strategy

### Phase 1: Persistence with Implicit Project (Immediate)

**Goal:** User's work persists between sessions without any explicit save/load actions.

**Implementation:**
1. **Auto-create default project on first launch**
   ```typescript
   // On app initialization
   const projects = await storageService.loadProjects();
   if (projects.length === 0) {
     const defaultProject = {
       id: generateId(),
       name: 'My Project',
       template: '',
       slice: '',
       instruction: 'implementation',
       workType: 'continue',
       customData: {},
       createdAt: now,
       updatedAt: now
     };
     await storageService.saveProject(defaultProject);
     await storageService.setLastActiveProject(defaultProject.id);
   }
   ```

2. **Load last active project on startup**
   ```typescript
   // In ContextBuilderApp initialization
   useEffect(() => {
     const loadLastSession = async () => {
       const projects = await storageService.loadProjects();
       const lastProjectId = await storageService.getLastActiveProject();
       const currentProject = projects.find(p => p.id === lastProjectId) 
                              || projects[0];
       if (currentProject) {
         setFormData(currentProject);
       }
     };
     loadLastSession();
   }, []);
   ```

3. **Auto-save on every change (debounced)**
   ```typescript
   // Auto-save effect
   useEffect(() => {
     if (!currentProjectId) return;
     
     const saveTimer = setTimeout(async () => {
       await storageService.updateProject(currentProjectId, formData);
     }, 500); // 500ms debounce
     
     return () => clearTimeout(saveTimer);
   }, [formData, currentProjectId]);
   ```

**Files to modify:**
- `src/components/ContextBuilderApp.tsx` - Add persistence hooks
- `src/services/storage/PersistentProjectStore.ts` - New service combining ElectronStorageService
- `src/services/storage/types/AppState.ts` - Add app state types

**Storage structure:**
```
app-data/
  ├── projects.json         # All project data
  └── app-state.json       # Last active project ID, window state, etc.
```

### Phase 2: Multi-Project UI (Next Sprint)

**Goal:** Add project management UI without breaking existing persistence.

**Implementation:**
1. **Project selector dropdown**
   - Lists all projects
   - Shows current project
   - "New Project" option at bottom

2. **Project management actions**
   - Rename project (inline edit in dropdown)
   - Delete project (with confirmation)
   - Duplicate project

3. **Quick project switching**
   - Keyboard shortcuts (Cmd/Ctrl + 1-9)
   - Recent projects submenu

**UI Mockup:**
```
┌─────────────────────────────────┐
│ [My Project ▼]  [➕ New]         │
│ ├── My Project ✓                 │
│ ├── Client ABC                   │
│ ├── Feature XYZ                  │
│ └── + New Project                │
└─────────────────────────────────┘
```

## Data Models

### AppState
```typescript
interface AppState {
  lastActiveProjectId: string;
  windowBounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  panelSizes?: number[];
  appVersion: string;
  lastOpened: string; // ISO date
}
```

### PersistentProjectStore API
```typescript
class PersistentProjectStore {
  // Project operations
  async loadProjects(): Promise<ProjectData[]>
  async saveProject(project: ProjectData): Promise<void>
  async updateProject(id: string, updates: Partial<ProjectData>): Promise<void>
  async deleteProject(id: string): Promise<void>
  
  // App state operations
  async getLastActiveProject(): Promise<string | null>
  async setLastActiveProject(id: string): Promise<void>
  async getAppState(): Promise<AppState>
  async updateAppState(state: Partial<AppState>): Promise<void>
  
  // Utility
  async exportProject(id: string): Promise<string> // JSON export
  async importProject(jsonData: string): Promise<ProjectData>
}
```

## Success Criteria

### Phase 1 (Immediate)
- [x] User's work persists between app restarts
- [x] No data loss on app crash
- [x] Seamless experience - no save/load buttons needed
- [x] Performance: < 50ms save time for typical project

### Phase 2 (Next)
- [ ] Switch between multiple projects
- [ ] Create new projects
- [ ] Delete unwanted projects
- [ ] Clear indication of current project

## Technical Considerations

### Performance
- Debounce saves to avoid excessive disk I/O
- Keep projects.json under 1MB (hundreds of projects)
- Use atomic writes to prevent corruption

### Error Handling
- Gracefully handle corrupted storage files
- Automatic backup before destructive operations
- Clear user feedback on storage errors

### Migration Path
- Phase 1 creates structure that Phase 2 extends
- No data migration needed between phases
- Backward compatible storage format

## Implementation Order

1. **Create PersistentProjectStore service** (2 hours)
   - Combines ElectronStorageService with project logic
   - Handles app state persistence

2. **Integrate with ContextBuilderApp** (1 hour)
   - Load on mount
   - Auto-save on change
   - Handle errors gracefully

3. **Test persistence scenarios** (1 hour)
   - Normal save/load
   - Corruption recovery
   - Migration from empty state

4. **Add loading states** (30 min)
   - Show spinner during initial load
   - Subtle save indicator

Total estimate: ~4.5 hours for Phase 1

## Risks and Mitigations

**Risk:** User loses data if save fails
**Mitigation:** Keep in-memory backup, show clear error messages

**Risk:** Performance impact from frequent saves
**Mitigation:** Debounce, use async I/O, monitor save times

**Risk:** Confusion during transition to multi-project
**Mitigation:** Keep single-project feel until user creates second project

## Future Enhancements

- Cloud sync between devices
- Project templates/presets
- Project history/versions
- Collaborative projects (share via file)
- Project search and tags
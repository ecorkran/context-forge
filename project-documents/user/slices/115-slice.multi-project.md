---
item: multi-project
project: context-builder
type: slice
dependencies: [basic-context-generation, project-configuration-management, persistence]
projectState: Core single-project functionality complete with auto-save persistence
status: not-started
dateCreated: 20250914
dateUpdated: 20250914
---

# Low-Level Design: Multi-Project Support

## Overview

This slice transforms the current single-project application into a multi-project workspace where users can manage multiple projects simultaneously. The existing persistence and auto-save infrastructure provides the foundation, but we need to add project selection UI, project management operations, and proper state isolation between projects.

**User Value:**
- Manage multiple Claude Code projects in one application
- Quick project switching with preserved state
- Independent project configurations without cross-contamination
- Project lifecycle management (create, rename, delete, duplicate)

**Technical Approach:**
- Extend existing PersistentProjectStore with project management UI
- Add project selector dropdown to main application header
- Implement project switching with complete state transitions
- Add project management actions (create, delete, rename, duplicate)
- Maintain backward compatibility with single-project workflows

## Technical Decisions

### Architecture Pattern: Extension over Replacement
- **Decision:** Extend existing architecture rather than rebuild
- **Rationale:** Current persistence and context generation systems are robust
- **Implementation:** Add UI layer on top of existing PersistentProjectStore
- **Trade-offs:** Some complexity in state management, but preserves working functionality

### Project Selection Strategy: Enhanced Project Name Input
- **Decision:** Replace current project name input with enhanced ProjectSelector component
- **Rationale:** Maintains form layout, provides dual functionality (naming + selection), minimal UI disruption
- **Alternative Considered:** Separate header dropdown (rejected: no static header in current design)
- **Implementation:** Enhanced combobox replacing existing name input, with inline management actions

### State Management: Complete Project Switching
- **Decision:** Full state reset when switching projects
- **Rationale:** Prevents data cross-contamination, simpler than partial state management
- **Implementation:** Clear form state → Load new project → Populate form → Update context
- **Performance:** Acceptable for typical project sizes and switching frequency

### Project Operations: Minimal Inline Actions
- **Decision:** Essential operations via small inline icons (+ for new, 🗑 for delete)
- **Rationale:** Unobtrusive, immediate access, no complex menus or dialogs
- **Implementation:** Small icons integrated into enhanced project selector component
- **UX Pattern:** Instant creation/deletion with auto-save, direct name editing for rename

## Component Architecture

### New Components

#### ProjectSelector (Final Design)
```typescript
interface ProjectSelectorProps {
  currentProject: ProjectData | null;
  projects: ProjectData[];
  onProjectSwitch: (projectId: string) => void;
  onProjectCreate: () => void;
  onProjectDelete: (projectId: string) => void;
  onProjectNameChange: (name: string) => void;
}
```

**Final Design Structure:**
```
┌─────────────────────────────────────┬─[+]─[🗑]─┐
│ Current Project Name                │          │  (Closed)
└─────────────────────────────────────┴──────────┘

┌─────────────────────────────────────┬─[+]─[🗑]─┐
│ Current Project Name ✓              │          │  (Open)
├─────────────────────────────────────┼──────────┤
│ My Other Project                    │   📅     │
│ Website Redesign                    │   📅     │  
│ API Integration                     │   📅     │
└─────────────────────────────────────┴──────────┘
```

**Interim Implementation** (using existing controls):
```
Project: [Select: Current Project ▼]  [New] [Delete]

Where:
- Select uses existing manta-templates Select component
- New/Delete are simple Button components
- Project name editing handled via separate input or inline editing
```

#### ProjectManager
```typescript
interface ProjectManagerProps {
  store: PersistentProjectStore;
  onProjectChange: (project: ProjectData | null) => void;
}
```

**Responsibilities:**
- Orchestrate project operations (CRUD)
- Handle project switching state transitions
- Manage error states and user feedback
- Coordinate with persistence layer

### Enhanced Components

#### ContextBuilderApp (Modified)
- Add project selector to header/toolbar area
- Enhance project switching logic
- Handle project-related error states
- Coordinate between ProjectManager and existing form/context components

#### ProjectConfigForm (Enhanced)
- Add visual indicator of current project
- Handle form reset during project switching
- Prevent data loss during transitions
- Maintain existing auto-save behavior per project

## Data Flow

### Project Switching Flow
```
User selects project in dropdown
    ↓
ProjectManager.switchProject(projectId)
    ↓
1. Save current project state (if modified)
2. Clear form state
3. Load new project data from PersistentProjectStore
4. Update app state (currentProjectId)
5. Populate form with new project data
6. Trigger context regeneration
    ↓
UI updates with new project context
```

### Project Creation Flow
```
User clicks "New Project"
    ↓
ProjectManager.createProject()
    ↓
1. Generate new project ID
2. Create default project data structure
3. Save new project to storage
4. Switch to new project (follow switching flow)
5. Focus project name field for immediate editing
```

### Project Management Flow
```
User selects management action (delete/rename/duplicate)
    ↓
Show confirmation dialog (for destructive actions)
    ↓
ProjectManager.performAction(action, projectId, params)
    ↓
1. Execute action via PersistentProjectStore
2. Update project list state
3. Handle edge cases (deleting current project, etc.)
4. Provide user feedback (success/error messages)
5. Update UI state
```

## State Management

### Application State Extension
```typescript
interface AppState {
  // Existing fields
  lastActiveProjectId?: string;
  windowBounds?: WindowBounds;
  panelSizes?: PanelSizes;
  appVersion: string;
  lastOpened: string;
  
  // New fields for multi-project
  projectListExpanded?: boolean;
  lastProjectOperation?: {
    action: 'create' | 'delete' | 'rename' | 'duplicate';
    timestamp: string;
    success: boolean;
  };
}
```

### Component State Management
```typescript
// In ContextBuilderApp
const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
const [projects, setProjects] = useState<ProjectData[]>([]);
const [isProjectSwitching, setIsProjectSwitching] = useState(false);
const [projectError, setProjectError] = useState<string | null>(null);
```

### State Synchronization Points
1. **Project List Sync:** Keep projects array synchronized with storage
2. **Current Project Sync:** Maintain currentProjectId consistency across app state and localStorage
3. **Form State Sync:** Ensure form data matches current project during transitions
4. **Context Sync:** Update context generation when project switches

## UI/UX Specifications

### Project Selector Design
- **Location:** Application header, left side
- **Default State:** Shows current project name with dropdown arrow
- **Hover State:** Subtle highlight, cursor pointer
- **Active State:** Dropdown opened, current project highlighted
- **Loading State:** Spinner when switching projects
- **Error State:** Red border, error message in dropdown

### Project List Display
- **Sorting:** Most recently used first
- **Metadata:** Project name, last modified date
- **Visual Cues:** Current project marked with dot/checkmark
- **Empty State:** "No projects yet" with create button
- **Max Height:** Scrollable if more than 8-10 projects

### Project Management Actions
- **New Project:** Primary action button, always visible
- **Rename:** Inline editing or modal dialog
- **Duplicate:** Creates copy with " (Copy)" suffix
- **Delete:** Confirmation dialog with project name verification
- **Keyboard Shortcuts:** Common shortcuts for power users (Ctrl+N for new, etc.)

### Responsive Behavior
- **Desktop:** Full dropdown with metadata
- **Narrow Windows:** Simplified dropdown, truncated names
- **Mobile/Touch:** Larger touch targets, swipe gestures

## Integration Points

### Existing System Integration
- **PersistentProjectStore:** Leverage all existing CRUD operations
- **ContextBuilderApp:** Add project management without breaking existing flows
- **ProjectConfigForm:** Maintain existing validation and auto-save behavior
- **ContextGeneration:** No changes needed - works with any project data

### Cross-Slice Dependencies
- **Persistence Slice:** Requires PersistentProjectStore functionality
- **Context Templates Slice:** Must work with project switching
- **Future Template Selection:** Will integrate with project-specific template preferences

### External Integrations
- **Electron Main Process:** No additional IPC needed (uses existing storage)
- **File System:** Leverages existing app-state.json and projects.json
- **System Integration:** Potential future integration with OS recent files

## Technical Implementation

### Effort Distribution (1-5 Scale)
- **ProjectSelector Component:** 3/5 (dropdown with actions)
- **ProjectManager Service:** 2/5 (orchestration logic)
- **State Management Integration:** 3/5 (project switching coordination)
- **UI Integration:** 2/5 (header layout, styling)
- **Error Handling & Edge Cases:** 2/5 (delete current project, etc.)
- **Testing & Polish:** 2/5 (user experience refinements)

### Development Phases

#### Phase 1: Interim Implementation (Existing Controls)
- Add basic project selector using existing Select component
- Add simple "New" and "Delete" buttons next to project selector
- Implement project switching logic in ContextBuilderApp
- Basic project management operations (create/delete/switch)
- Test core functionality with placeholder UI

#### Phase 2: Enhanced Component Development
- Develop enhanced ProjectSelector component (final design)
- Integrate inline action icons (+ and 🗑)
- Replace interim controls with polished component
- Add smooth transitions and visual feedback

#### Phase 3: UX Polish and Edge Cases
- Handle edge cases (deleting current project, empty states)
- Add loading states and error handling
- Implement keyboard shortcuts
- Add responsive design considerations

#### Phase 4: Integration Testing
- Test with existing persistence functionality
- Verify context generation works across project switches
- Test auto-save behavior with multiple projects
- Performance testing with many projects

### Key Implementation Considerations

#### Project Switching Performance
- **Challenge:** Form reset and repopulation can feel sluggish
- **Solution:** Show loading state, optimize data loading
- **Measurement:** Target <200ms for project switch

#### Data Isolation
- **Challenge:** Ensure no data bleeding between projects
- **Solution:** Complete form state reset, explicit project ID tracking
- **Verification:** Automated tests for state isolation

#### Error Recovery
- **Challenge:** Project operations can fail (disk full, permissions, etc.)
- **Solution:** Graceful error handling, fallback to previous state
- **UX:** Clear error messages, recovery suggestions

#### Memory Management
- **Challenge:** Holding multiple projects in memory
- **Solution:** Load project list metadata only, full data on demand
- **Optimization:** Limit cached project data, LRU eviction

## Risk Assessment

### Technical Risks
- **State Management Complexity:** Medium risk - existing patterns provide foundation
- **Performance Impact:** Low risk - project switching is infrequent operation
- **Data Loss:** Low risk - existing auto-save and persistence infrastructure is robust

### User Experience Risks
- **Cognitive Load:** Medium risk - multiple projects may confuse some users
- **Accidental Data Loss:** Medium risk - project deletion, switching without saving
- **Workflow Disruption:** Low risk - single-project workflow remains unchanged

### Mitigation Strategies
- Maintain single-project workflow as default (no forced multi-project)
- Clear visual indicators for current project state
- Confirmation dialogs for destructive actions
- Comprehensive undo/recovery mechanisms
- Progressive disclosure of advanced features

## Success Criteria

### Functional Requirements
- ✅ Users can create new projects from the UI
- ✅ Users can switch between projects seamlessly
- ✅ Each project maintains independent configuration
- ✅ Project operations (rename, delete, duplicate) work reliably
- ✅ Current project state is clearly visible
- ✅ All existing single-project functionality is preserved

### Performance Requirements
- Project switching completes in <300ms
- Application supports 50+ projects without performance degradation
- Memory usage remains reasonable with multiple projects loaded
- UI remains responsive during project operations

### User Experience Requirements
- Project selection is discoverable and intuitive
- Error states provide clear feedback and recovery options
- Keyboard shortcuts work for common operations
- Design integrates seamlessly with existing UI
- No learning curve for existing single-project users

## Future Considerations

### Potential Enhancements (Not in Scope)
- Project import/export functionality
- Project templates and presets
- Project collaboration features
- Advanced project organization (folders, tags)
- Project-specific preferences and settings
- Integration with external project management tools

### Architecture Extensibility
- Component architecture supports additional project metadata
- State management can accommodate project-specific preferences
- UI patterns scale to additional project operations
- Storage layer can handle enhanced project data structures

### Migration Path
- Existing single-project users seamlessly upgrade
- Project data format remains backward compatible
- Future enhancements build on established patterns
- Clear upgrade path for advanced features
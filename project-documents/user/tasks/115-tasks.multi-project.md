---
item: multi-project
project: context-builder
type: slice-tasks
lldReference: private/slices/115-slice.multi-project.md
dependencies: [basic-context-generation, project-configuration-management, persistence]
projectState: complete
dateCreated: 20250914
dateUpdated: 20250916
---

# Task Breakdown: Multi-Project Support

## Context Summary

This slice adds multi-project functionality to the existing single-project context-builder application. We will implement this in two phases: first using existing manta-templates controls (Select + Button components) for immediate functionality, then later developing an enhanced ProjectSelector component for the final refined UX.

The implementation leverages existing robust infrastructure:
- ✅ PersistentProjectStore with complete CRUD operations
- ✅ Auto-save system working per-project  
- ✅ Context generation system
- ✅ Form state management

**Key Approach:** Extension over replacement - add multi-project layer on top of proven single-project system without disrupting existing workflows.

## Task List

### Task 1: Project Manager Service
**Effort: 3/5**

- [x] **Task 1.1: Create ProjectManager Service Structure**
  - Create `src/services/project/ProjectManager.ts`
  - Import PersistentProjectStore and required types
  - Create class with private persistentStore instance
  - Add constructor with dependency injection pattern
  - **Success:** Basic service structure exists and compiles

- [x] **Task 1.2: Implement Project Loading and Listing**
  - [x] **1.2.1: Add loadAllProjects() method**
    - Call persistentStore.loadProjects()
    - Add error handling with fallback to empty array
    - Return projects sorted by updatedAt (most recent first)
    - **Success:** Method returns all projects or empty array on error
  
  - [x] **1.2.2: Add getCurrentProject() method**
    - Get current project ID from app state
    - Find project in loaded projects array
    - Return project data or null if not found
    - **Success:** Method returns current project or null consistently
  
  - [x] **1.2.3: Add project metadata helpers**
    - Add getProjectCount() method returning number of projects
    - Add hasMultipleProjects() method returning boolean
    - Add getProjectNames() method returning array of project names
    - **Success:** Helper methods provide accurate project information

- [x] **Task 1.3: Implement Project Switching Logic**
  - [x] **1.3.1: Add switchToProject() method**
    - Validate target project exists
    - Update app state with new lastActiveProjectId  
    - Call persistentStore.setLastActiveProject()
    - Return switched project data
    - **Success:** Method switches active project and updates persistence
  
  - [x] **1.3.2: Add project switching validation**
    - Check if target project exists before switching
    - Handle switching to already-current project (no-op)
    - Add error handling for invalid project IDs
    - **Success:** Switching operations are validated and safe

- [x] **Task 1.4: Implement Project Creation Operations**
  - [x] **1.4.1: Add createNewProject() method**
    - Generate new project ID using persistentStore.generateId()
    - Create default project data with "New Project" name
    - Save project using persistentStore.saveProject()
    - Automatically switch to new project
    - **Success:** New projects are created and become active immediately
  
  - [x] **1.4.2: Add project creation validation**
    - Ensure generated project IDs are unique
    - Validate project data structure before saving
    - Handle creation failures gracefully
    - **Success:** Project creation is reliable and error-resistant

- [x] **Task 1.5: Implement Project Deletion Operations**
  - [x] **1.5.1: Add deleteProject() method**
    - Validate project exists and can be deleted
    - Handle deletion of current project (switch to another first)
    - Call persistentStore.deleteProject()
    - Update app state if deleting current project
    - **Success:** Projects can be deleted safely with proper state management
  
  - [x] **1.5.2: Add deletion safety logic**
    - Prevent deletion when only one project exists
    - Auto-switch to most recent project when deleting current
    - Add confirmation logic for destructive operations
    - **Success:** Deletion operations maintain application consistency

### Task 2: Interim Project Selection UI  
**Effort: 2/5**

- [x] **Task 2.1: Create Basic ProjectSelector Component**
  - Create `src/components/project/ProjectSelector.tsx`
  - Import existing Select, Button components from manta-templates
  - Define ProjectSelectorProps interface with required callbacks
  - Create component structure with Select + New/Delete buttons
  - **Success:** Component renders with existing manta-templates styling

- [x] **Task 2.2: Implement Project Selection Dropdown**
  - [x] **2.2.1: Create project list for Select component**
    - Map projects array to SelectItem components
    - Display project name with last modified info
    - Handle empty project list state
    - Show current project as selected value
    - **Success:** Select dropdown shows all projects with metadata
  
  - [x] **2.2.2: Handle project selection changes**
    - Connect Select onValueChange to onProjectSwitch callback
    - Pass selected project ID to parent component
    - Add loading state during project switching
    - **Success:** Selecting projects from dropdown triggers switch logic
  
  - [x] **2.2.3: Add project selection feedback**
    - Show visual indicator for currently selected project
    - Add subtle loading indicator during switches
    - Handle selection of already-current project gracefully
    - **Success:** User receives clear feedback about project selection state

- [x] **Task 2.3: Implement Project Management Buttons**
  - [x] **2.3.1: Add New Project button**
    - Create Button with "+" text and appropriate styling
    - Connect click handler to onProjectCreate callback
    - Add visual feedback (disable during creation)
    - Position button next to Select component
    - **Success:** "+" button creates projects and provides user feedback
  
  - [x] **2.3.2: Add Delete Project button**  
    - Create Button with "×" text and warning styling
    - Connect click handler to onProjectDelete callback
    - Only show when multiple projects exist
    - Add confirmation dialog for destructive action
    - **Success:** "×" button safely removes projects with confirmation
  
  - [x] **2.3.3: Layout buttons with Select component**
    - Arrange Select and buttons in horizontal layout
    - Use consistent spacing and alignment
    - Ensure responsive behavior on narrow screens
    - Match existing form styling patterns
    - **Success:** Components layout cleanly within existing form structure

- [x] **Task 2.4: Add ProjectSelector Integration Points**
  - [x] **2.4.1: Create component prop interface**
    - Define all required callback props clearly
    - Add optional props for customization
    - Include TypeScript types for all props
    - **Success:** Component interface is complete and type-safe
  
  - [x] **2.4.2: Add error handling props**
    - Add error state prop for displaying errors
    - Add loading state prop for operation feedback
    - Add disabled state prop for preventing interactions
    - **Success:** Component handles all necessary UI states

### Task 3: Integration with ContextBuilderApp
**Effort: 3/5**

- [x] **Task 3.1: Add Multi-Project State Management**
  - [x] **3.1.1: Add project list state to ContextBuilderApp**
    - Add projects useState hook for storing all projects
    - Add loading state for project operations
    - Add error state for project operation failures
    - Initialize with empty array until loaded
    - **Success:** App component tracks all necessary multi-project state
  
  - [x] **3.1.2: Add ProjectManager integration**
    - Import and instantiate ProjectManager in component
    - Create useMemo hook for ProjectManager instance
    - Handle ProjectManager initialization errors
    - **Success:** App component has working ProjectManager instance
  
  - [x] **3.1.3: Update existing project loading logic**
    - Modify existing useEffect to use ProjectManager.loadAllProjects()
    - Update project list state when loading completes
    - Maintain existing single-project fallback behavior
    - **Success:** App loads all projects instead of just creating default

- [x] **Task 3.2: Implement Project Switching Integration**
  - [x] **3.2.1: Create project switch handler**
    - Add handleProjectSwitch function in ContextBuilderApp
    - Call ProjectManager.switchToProject() with selected ID
    - Update currentProjectId state
    - Clear and repopulate form with switched project data
    - **Success:** Project switching updates all application state correctly
  
  - [x] **3.2.2: Add form state reset logic**
    - Clear existing form data before switching projects
    - Load new project data using existing restoration logic
    - Trigger context regeneration after project switch
    - Maintain auto-save behavior for current project
    - **Success:** Form state completely resets during project switches
  
  - [x] **3.2.3: Add switching error handling**
    - Handle project switching failures gracefully
    - Show error messages to user when switches fail
    - Maintain previous project state on switch failure
    - **Success:** Failed project switches don't break application state

- [x] **Task 3.3: Implement Project Creation Integration**
  - [x] **3.3.1: Create project creation handler**
    - Add handleProjectCreate function in ContextBuilderApp
    - Call ProjectManager.createNewProject()
    - Update projects list and currentProjectId state
    - Clear form and populate with new project defaults
    - **Success:** New project creation works end-to-end
  
  - [x] **3.3.2: Add creation success feedback**
    - Update projects list state immediately after creation
    - Switch to new project automatically
    - Focus project name field for immediate editing
    - **Success:** New projects are created and ready for immediate use
  
  - [x] **3.3.3: Handle creation error scenarios**
    - Show error messages when project creation fails
    - Maintain current application state on creation failure
    - Allow retry of failed creation operations
    - **Success:** Project creation failures are handled gracefully

- [x] **Task 3.4: Implement Project Deletion Integration**
  - [x] **3.4.1: Create project deletion handler**
    - Add handleProjectDelete function in ContextBuilderApp
    - Show confirmation dialog before deletion
    - Call ProjectManager.deleteProject() after confirmation
    - Update projects list state after successful deletion
    - **Success:** Project deletion works with user confirmation
  
  - [x] **3.4.2: Handle deletion of current project**
    - Detect when deleting currently active project
    - Switch to another project before deletion
    - Update all application state appropriately
    - **Success:** Deleting current project maintains application consistency
  
  - [x] **3.4.3: Add deletion safety and feedback**
    - Prevent deletion when only one project exists
    - Show clear confirmation with project name
    - Provide success/error feedback after deletion
    - **Success:** Deletion operations are safe and provide clear feedback

- [x] **Task 3.5: Replace Project Name Input with ProjectSelector**
  - [x] **3.5.1: Update ProjectConfigForm to accept ProjectSelector**
    - Modify ProjectConfigForm to accept optional customProjectNameField prop
    - Add conditional rendering for custom vs default project name input
    - Maintain existing form layout and styling
    - **Success:** ProjectConfigForm can use custom project name field
  
  - [x] **3.5.2: Integrate ProjectSelector into form layout**
    - Pass ProjectSelector component as customProjectNameField prop
    - Ensure ProjectSelector receives all necessary props
    - Connect ProjectSelector callbacks to ContextBuilderApp handlers
    - **Success:** ProjectSelector replaces default project name input
  
  - [x] **3.5.3: Test project name editing functionality**
    - Verify project name changes save via auto-save system
    - Test project name editing with multiple projects
    - Ensure name changes update project list display
    - **Success:** Project names can be edited and persist correctly

### Task 4: Edge Case Handling and Testing
**Effort: 2/5**

- [x] **Task 4.1: Handle Single vs Multiple Project States**
  - [x] **4.1.1: Add conditional UI behavior**
    - Hide Delete button when only one project exists
    - Show appropriate messaging for first-time users
    - Maintain single-project workflow for existing users
    - **Success:** UI adapts appropriately to project count
  
  - [x] **4.1.2: Test single project workflows**
    - Verify existing single-project users see no changes
    - Test that single project creation/editing still works
    - Ensure auto-save behavior unchanged for single projects
    - **Success:** Single-project functionality is preserved
  
  - [x] **4.1.3: Test multiple project workflows**
    - Create multiple projects and test switching between them
    - Verify each project maintains independent configuration
    - Test context generation works correctly across projects
    - **Success:** Multiple projects work independently and correctly

- [x] **Task 4.2: Handle Error Scenarios**
  - [x] **4.2.1: Test storage operation failures**
    - Simulate project creation failures
    - Test project deletion failures  
    - Handle project switching failures
    - **Success:** All storage failures handled gracefully with user feedback
  
  - [x] **4.2.2: Test state corruption scenarios**
    - Handle invalid currentProjectId in app state
    - Test recovery when referenced project no longer exists
    - Handle empty or corrupted project list
    - **Success:** App recovers gracefully from corrupted state
  
  - [x] **4.2.3: Test concurrent operation handling**
    - Test rapid project switching
    - Handle overlapping project operations
    - Ensure auto-save doesn't conflict with project switches
    - **Success:** Concurrent operations don't cause data corruption

- [x] **Task 4.3: Performance and User Experience Testing**
  - [x] **4.3.1: Test project switching performance**
    - Measure project switch time (target <300ms)
    - Test with larger numbers of projects (20+ projects)
    - Verify UI remains responsive during operations
    - **Success:** Project operations meet performance targets
  
  - [x] **4.3.2: Test user experience flows**
    - Test complete new user workflow (first project creation)
    - Test power user workflow (multiple project management)
    - Verify keyboard navigation works correctly
    - **Success:** User experience is smooth and intuitive
  
  - [x] **4.3.3: Test form integration**
    - Verify form state resets correctly during project switches
    - Test auto-save behavior across multiple projects
    - Ensure context generation updates appropriately
    - **Success:** Form integration works seamlessly with multi-project

### Task 5: Documentation and Cleanup
**Effort: 1/5**

- [x] **Task 5.1: Update Component Documentation**
  - Add JSDoc comments to ProjectManager service methods
  - Document ProjectSelector component props and usage
  - Update ContextBuilderApp integration points
  - **Success:** All new components are properly documented

- [x] **Task 5.2: Add Integration Examples**
  - Create usage examples for ProjectManager service
  - Document project switching workflow for future developers
  - Add troubleshooting guide for common issues
  - **Success:** Clear examples exist for all major functionality

- [x] **Task 5.3: Clean Up Development Code**
  - Remove any temporary logging or debug code
  - Ensure consistent error handling patterns
  - Verify TypeScript strict mode compliance
  - **Success:** Code is production-ready and follows project standards

## Task Dependencies

### Sequential Dependencies
- Task 1 (ProjectManager Service) must complete before Task 2 (UI Components)
- Task 2 (UI Components) must complete before Task 3 (Integration)
- Task 3 (Integration) must complete before Task 4 (Testing)
- All implementation tasks must complete before Task 5 (Documentation)

### Parallel Work Opportunities
- Task 1.2 (Project Loading) and Task 1.4 (Project Creation) can be developed in parallel
- Task 2.2 (Selection Dropdown) and Task 2.3 (Management Buttons) can be developed in parallel
- Task 4.1 (UI States) and Task 4.2 (Error Scenarios) can be tested in parallel

### Integration Points
- ProjectManager service integrates with existing PersistentProjectStore
- ProjectSelector component uses existing manta-templates Select and Button
- ContextBuilderApp integration maintains existing auto-save and context generation
- All new functionality preserves existing single-project workflows

## Success Criteria Summary

Upon completion of all tasks:
- [x] Users can switch between multiple projects seamlessly
- [x] New projects can be created instantly with single click
- [x] Projects can be deleted safely with confirmation
- [x] Each project maintains independent configuration and context
- [x] All existing single-project functionality is preserved
- [x] Project operations complete within performance targets (<300ms)
- [x] UI provides clear feedback for all project operations
- [x] Application handles all error scenarios gracefully
- [x] Code is well-documented and follows project standards

## Implementation Notes

### Technical Approach
- **Extension Pattern:** All functionality builds on existing robust infrastructure
- **Backward Compatibility:** Single-project users experience no workflow changes
- **Progressive Enhancement:** Multi-project features appear seamlessly for power users
- **Error Resilience:** All operations handle failures gracefully with user feedback

### UI Strategy  
- **Phase 1:** Use existing manta-templates components for immediate functionality
- **Phase 2 (Future):** Develop enhanced ProjectSelector component for refined UX
- **Minimal Disruption:** Project management integrated into existing form layout
- **Clear Feedback:** All operations provide immediate visual confirmation

### Quality Assurance
- Each task includes specific success criteria for validation
- Integration testing ensures no regression of existing functionality
- Performance testing validates user experience targets
- Error scenario testing ensures application stability

This implementation provides immediate multi-project functionality while establishing the foundation for future UX enhancements.
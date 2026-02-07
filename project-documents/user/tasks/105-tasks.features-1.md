---
slice: features-1
project: context-builder
lld: private/slices/045-slice.features.md
dependencies: [foundation]
projectState: complete
lastUpdated: 2026-02-07
---

## Context Summary
- Foundation slice provides storage system, split-pane layout, and basic form components
- Context preview infrastructure exists as placeholder - needs integration with real data
- Focus on integration glue: connecting form inputs to context generation to display output
- Vertical slice approach: complete data flow from form to output before adding advanced features
- Key insight: 80% integration work, 15% form extensions, 5% template processing

## Feature Slice 1: Basic Context Generation Tasks

### Task 1: Extend Project Data Model
**Owner**: Junior AI  
**Effort**: 2  
**Objective**: Add missing fields to project storage for context generation

**Data Model Extensions:**
- [x] **Update ProjectData interface in types/ProjectData.ts**:
  - Add `instruction: string` field for development phase
  - Add `customData?: { recentEvents?: string; additionalNotes?: string }` for user inputs
  - Update type exports and utilities
  - **Success:** TypeScript compilation passes with extended interface

- [x] **Update storage validation**:
  - Extend validation rules in ProjectValidator.ts to include instruction field
  - Add validation for instruction values: "planning", "implementation", "debugging", "testing", "custom"
  - Update error messages for new field validation
  - **Success:** Invalid instruction values are rejected with clear error messages

- [x] **Update storage migrations**:
  - Add migration logic to handle existing projects without new fields
  - Set default values: instruction = "implementation", customData = {}
  - Test migration with existing project data
  - **Success:** Existing projects load correctly with default values for new fields

### Task 2: Create Context Integration Service
**Owner**: Junior AI  
**Effort**: 3  
**Objective**: Build core service to transform project data into context strings

**Task 2.1: Create ContextData Interface**
- [x] **Create ContextData interface file**:
  - File: `src/services/context/types/ContextData.ts`
  - Create directory structure if it doesn't exist: `mkdir -p src/services/context/types`
  - Define interface with exact fields: `projectName`, `template`, `slice`, `instruction`, `isMonorepo`, `recentEvents`, `additionalNotes`
  - All fields should be required strings except `isMonorepo` which is boolean
  - Export interface and create index.ts if needed for clean imports
  - **Success:** Interface compiles without TypeScript errors and can be imported from other files

**Task 2.2: Implement Template Processing Engine**
- [x] **Create template processing utility**:
  - File: `src/services/context/TemplateProcessor.ts`
  - Implement function `processTemplate(template: string, data: ContextData): string`
  - Handle simple variable replacement: find `{{variableName}}` and replace with `data.variableName`
  - Handle boolean conditionals: `{{#if isMonorepo}}Yes{{else}}No{{/if}}` pattern
  - Use string replacement methods, not complex templating libraries
  - **Success:** Can replace all template variables and boolean conditionals correctly

- [x] **Add error handling for template processing**:
  - Handle case where template variable is not found in data
  - Replace missing variables with empty string or appropriate default
  - Log warnings for missing variables but don't throw errors
  - Return processed template even if some variables are missing
  - **Success:** Template processing never crashes and handles missing data gracefully

**Task 2.3: Create Data Mapping Logic**
- [x] **Implement project data to context data mapping**:
  - File: `src/services/context/ContextIntegrator.ts` (create this file first)
  - Create method `mapProjectToContext(project: ProjectData): ContextData`
  - Map `project.name` → `contextData.projectName`
  - Map `project.template` → `contextData.template`
  - Map `project.slice` → `contextData.slice`
  - Map `project.instruction` → `contextData.instruction` (use 'implementation' if missing)
  - Map `project.isMonorepo` → `contextData.isMonorepo`
  - Map `project.customData?.recentEvents || ''` → `contextData.recentEvents`
  - Map `project.customData?.additionalNotes || ''` → `contextData.additionalNotes`
  - **Success:** All project fields map correctly to context data structure

**Task 2.4: Create Main Integration Service**
- [x] **Implement ContextIntegrator class**:
  - File: `src/services/context/ContextIntegrator.ts`
  - Import TemplateProcessor and ContextData types
  - Create class with public method `generateContextFromProject(project: ProjectData): string`
  - Method should: 1) map project to context data, 2) process template with data, 3) return result
  - Handle null/undefined project data by returning error message or empty template
  - **Success:** Service generates complete context string from any valid ProjectData

**Task 2.5: Define Default Template**
- [x] **Create default template constant**:
  - In `src/services/context/ContextIntegrator.ts`
  - Define `DEFAULT_TEMPLATE` as string constant with exact markdown structure shown above
  - Include all template variables: `{{projectName}}`, `{{template}}`, `{{slice}}`, `{{instruction}}`
  - Include boolean conditional: `{{#if isMonorepo}}Monorepo: Yes{{else}}Monorepo: No{{/if}}`
  - Include optional sections for `{{recentEvents}}` and `{{additionalNotes}}`
  - **Success:** Template string renders correctly when processed with sample data

### Task 3: Extend Project Configuration Form
**Owner**: Junior AI  
**Effort**: 2  
**Objective**: Add missing form fields for complete context generation

**Form Field Extensions:**
- [x] **Add instruction field to ProjectConfigForm**:
  - Add Select component for instruction with options: planning, implementation, debugging, testing, custom
  - Include field label "Development Phase:" 
  - Add validation and error display
  - Position after slice field, before monorepo checkbox
  - **Success:** Instruction field renders and saves correctly

- [x] **Add recent events text area**:
  - Add large text area component below main form fields
  - Label: "Recent Events (optional):"
  - Placeholder: "• Recent changes, bug fixes, features added..."
  - Character limit: 500 characters with counter
  - **Success:** Text area saves content to project.customData.recentEvents

- [x] **Add additional notes text area**:
  - Add text area component below recent events
  - Label: "Additional Context (optional):"
  - Placeholder: "Any additional context or specific focus areas..."
  - Character limit: 300 characters with counter
  - **Success:** Text area saves content to project.customData.additionalNotes

**Form Integration:**
- [x] **Wire form fields to project storage**:
  - Update form submission to include new fields
  - Add proper TypeScript typing for form data
  - Test save/load cycle with all new fields
  - **Success:** All form fields persist correctly between app sessions

### Task 4: Connect Context Generation to Preview Display
**Owner**: Junior AI  
**Effort**: 3  
**Objective**: Integrate context generation with existing preview infrastructure

**Task 4.1: Locate and Understand Existing Preview Component**
- [x] **Identify existing preview infrastructure**:
  - Search for existing context output/preview component in `src/components/`
  - Look for components that display context in the right panel of split layout
  - Examine current props and data structure used by preview component
  - Document the component name, location, and current interface
  - **Success:** Can identify exact component and understand how it currently receives data

**Task 4.2: Create Context Generation Hook**
- [x] **Create useContextGeneration hook**:
  - File: `src/hooks/useContextGeneration.ts`
  - Import ContextIntegrator service and ProjectData type
  - Hook accepts `projectData: ProjectData | null` parameter
  - Return object with `{ contextString: string, isLoading: boolean, error: string | null }`
  - Use useEffect to regenerate context when projectData changes
  - **Success:** Hook generates context string when given project data

- [x] **Add loading state management**:
  - Set `isLoading: true` when context generation starts
  - Set `isLoading: false` when generation completes or errors
  - For very fast operations (<50ms), skip loading state to avoid flicker
  - **Success:** Loading state accurately reflects generation status

- [x] **Add error handling in hook**:
  - Wrap ContextIntegrator.generateContextFromProject in try-catch
  - Set error state if generation throws exception
  - Clear error state when new successful generation completes
  - Return previous valid context if generation fails
  - **Success:** Hook never crashes and provides meaningful error information

**Task 4.3: Connect Generation to Preview Component**
- [x] **Integrate hook with preview component**:
  - Import and use useContextGeneration hook in parent component that has project data
  - Pass generated `contextString` to existing preview component
  - Replace any placeholder/mock data with generated context
  - Ensure preview component renders the generated markdown correctly
  - **Success:** Preview component displays generated context instead of placeholder

- [x] **Handle empty and loading states**:
  - Show loading spinner or skeleton when `isLoading` is true
  - Display helpful message when no project is selected or data is missing
  - Show error message when `error` is not null
  - Provide fallback content if context generation fails
  - **Success:** All states (loading, error, empty, success) display appropriately

**Task 4.4: Implement Real-time Form Updates**
- [x] **Add debouncing for form changes**:
  - Install debouncing utility or implement simple debounce function
  - Set 300ms debounce delay for context regeneration
  - Ensure debounce resets if user makes multiple rapid changes
  - Don't debounce the initial load, only subsequent changes
  - **Success:** Context updates smoothly without excessive regeneration

- [x] **Connect form change events**:
  - Identify how project form data flows to parent component
  - Ensure useContextGeneration hook receives updated project data when form changes
  - Test that all form fields (name, template, slice, instruction, monorepo, events, notes) trigger updates
  - Verify updates work for both typing and dropdown selections
  - **Success:** Context preview updates automatically when any form field changes

**Task 4.5: Add Visual Feedback and Polish**
- [x] **Add loading indicators**:
  - Show subtle loading indicator during context generation
  - Use existing design system loading components if available
  - Position loading indicator appropriately in preview area
  - Ensure loading indicator doesn't cause layout shift
  - **Success:** Users can see when context is being regenerated

- [x] **Add error feedback**:
  - Display clear error messages if context generation fails
  - Style error messages consistently with existing error handling
  - Provide "retry" functionality if generation fails
  - Log detailed errors to console for debugging
  - **Success:** Users receive clear feedback when errors occur

### Task 5: Implement Copy Functionality
**Owner**: Junior AI  
**Effort**: 1  
**Objective**: Enable users to copy generated context to clipboard

**Copy Integration:**
- [x] **Wire copy button to generated context**:
  - Locate existing copy button in preview component
  - Connect button to generated context string (not placeholder)
  - Implement clipboard write functionality
  - Add copy success feedback (toast or temporary button state change)
  - **Success:** Copy button copies current generated context to clipboard

- [x] **Add keyboard shortcut support**:
  - Implement Ctrl/Cmd+C keyboard shortcut when preview panel has focus
  - Add visual indication of keyboard shortcut availability
  - Test on both Windows/Linux (Ctrl+C) and macOS (Cmd+C)
  - **Success:** Keyboard shortcut copies context from preview panel

**Copy Validation:**
- [x] **Test copy functionality**:
  - Verify copied content matches displayed content exactly
  - Test with various project configurations and content lengths
  - Ensure copy works with special characters and formatting
  - Test copy success feedback displays correctly
  - **Success:** Copied content is identical to generated context

### Task 6: End-to-End Integration Testing
**Owner**: Junior AI  
**Effort**: 2  
**Objective**: Validate complete vertical slice functionality

**Integration Testing:**
- [x] **Test complete data flow**:
  - Fill out project configuration form with all fields
  - Verify data saves to storage correctly
  - Confirm context generates with all project data
  - Check context displays in preview panel
  - Test copy functionality works with generated content
  - **Success:** Complete workflow works without errors

- [x] **Test edge cases and validation**:
  - Test with empty optional fields (recentEvents, additionalNotes)
  - Test with maximum character limits reached
  - Test with invalid instruction values
  - Verify form validation prevents invalid configurations
  - **Success:** Edge cases handled gracefully with appropriate feedback

**Cross-browser and Platform Testing:**
- [x] **Test on target platforms**:
  - Verify functionality works correctly in Electron on macOS
  - Test keyboard shortcuts work correctly
  - Verify copy functionality works with system clipboard
  - Test form persistence across app restarts
  - **Success:** All functionality works correctly on target platform

### Task 7: Performance Optimization and Polish
**Owner**: Junior AI  
**Effort**: 1  
**Objective**: Ensure smooth user experience and optimal performance

**Performance Optimization:**
- [x] **Optimize context generation performance**:
  - Ensure context generation completes in <100ms for typical projects
  - Implement debouncing for real-time updates (300ms delay)
  - Add loading states for any operations >50ms
  - **Success:** Context updates feel responsive during normal usage

- [x] **Add visual polish**:
  - Ensure form fields have consistent styling with existing design system
  - Add proper focus states and accessibility attributes
  - Verify text area resize behavior works correctly
  - Test character counter display and behavior
  - **Success:** Form fields integrate seamlessly with existing UI design

**Final Validation:**
- [x] **Conduct user experience review**:
  - Verify all form fields are properly labeled and accessible
  - Check that error messages are clear and actionable  
  - Confirm loading and success states provide good feedback
  - Test tab order and keyboard navigation
  - **Success:** User experience is smooth and intuitive

## Task Dependencies and Sequencing

**Critical Path:**
1. Task 1 (Data Model) → Task 2 (Context Service) → Task 4 (Preview Integration)
2. Task 3 (Form Extensions) → Task 4 (Preview Integration) 
3. Task 4 (Preview Integration) → Task 5 (Copy Functionality)
4. Tasks 1-5 → Task 6 (Integration Testing)
5. Task 6 → Task 7 (Optimization)

**Parallel Work Opportunities:**
- Tasks 1 and 3 can be developed in parallel (data model and form changes)
- Task 5 (Copy) can begin once Task 4 preview integration is working
- Task 7 (Polish) can begin once core functionality is complete

**Early Testing Milestones:**
- After Task 2: Context generation service can be unit tested
- After Task 4: End-to-end data flow can be integration tested  
- After Task 5: Complete feature can be user tested

**Success Criteria for Feature Slice 1:**
- [x] User can enter all project details (name, template, slice, instruction, monorepo, events, notes)
- [x] Context generates automatically showing all configured information
- [x] Copy functionality works reliably with generated context
- [x] All project data persists correctly between app sessions
- [x] Form validation prevents invalid configurations with clear feedback
- [x] Real-time preview updates provide responsive user experience
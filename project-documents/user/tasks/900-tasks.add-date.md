---
item: add-date
project: context-builder
type: feature-tasks
lldReference: user/features/754-feature.add-date.md
dependencies: [foundation, context-templates, persistence]
projectState: Core features complete, adding date tracking capability
status: in-progress
lastUpdated: 2025-10-04
github: https://github.com/ecorkran/context-builder/issues/8
---

# Task Breakdown: Add Date Control to Context-Builder UI

## Context Summary

This feature adds date tracking to projects with a date input control that defaults to today's date and integrates into the context output template system. The implementation extends existing ProjectData and ContextData types, adds a form control to ProjectConfigForm, and integrates with the template variable substitution system.

**Current State**: Foundation, context templates, and persistence systems all working. Form infrastructure and auto-save fully operational.

**Target State**: Date field added to projects with HTML5 date input, defaults to current date, persists with project data, and displays in context output as `date: {project-date}`.

**Key Integration Points**: ProjectData types, ContextData types, ProjectConfigForm UI, ContextIntegrator mapping, TemplateProcessor variable substitution, default-statements.md template.

## Task List

### Task 1: Update Data Type Definitions
**Effort**: 1/5

- [x] **Task 1.1: Add projectDate field to ProjectData interface**
  - Open `src/services/storage/types/ProjectData.ts`
  - Add `projectDate?: string;` field with JSDoc comment
  - Comment should specify: "ISO 8601 date string (YYYY-MM-DD)"
  - Ensure field is optional to maintain backward compatibility
  - **Success**: ProjectData interface includes projectDate field, TypeScript compiles without errors

- [x] **Task 1.2: Add projectDate field to ContextData interface**
  - Open `src/services/context/types/ContextData.ts`
  - Add `projectDate?: string;` field with JSDoc comment
  - Comment should specify: "ISO 8601 date for template display"
  - Ensure field is optional for backward compatibility
  - **Success**: ContextData interface includes projectDate field, TypeScript compiles without errors

- [x] **Task 1.3: Verify type changes don't break existing code**
  - Run `pnpm typecheck` to verify no type errors introduced
  - Check that all existing ProjectData and ContextData usage still compiles
  - Verify no breaking changes in dependent code
  - **Success**: TypeScript compilation succeeds with no new errors

### Task 2: Add Date Input to ProjectConfigForm
**Effort**: 2/5

- [x] **Task 2.1: Add date input field to form JSX**
  - Open `src/components/forms/ProjectConfigForm.tsx`
  - Locate appropriate position in form (near project name and slice fields)
  - Add form field structure following existing pattern:
    - Label element with `htmlFor="projectDate"`
    - Input element with `type="date"`, `id="projectDate"`, `name="projectDate"`
  - Use existing form field styling classes
  - **Success**: Date input renders in form with consistent styling

- [x] **Task 2.2: Implement default date logic**
  - Add helper function or constant for current date: `new Date().toISOString().split('T')[0]`
  - Set input value to `projectData.projectDate || defaultDate`
  - Ensure new projects automatically get today's date
  - Ensure existing projects without date field default to today
  - **Success**: Date input always shows a valid date (project date or today)

- [x] **Task 2.3: Wire up onChange handler**
  - Connect input `onChange` event to `onInputChange` callback
  - Pass field name as `'projectDate'` and value as `e.target.value`
  - Follow existing pattern used by other form fields
  - **Success**: Date changes trigger onChange handler and update project data

- [x] **Task 2.4: Verify form field styling and accessibility**
  - Ensure date input matches visual design of other form fields
  - Verify label is properly associated with input (htmlFor/id match)
  - Test keyboard navigation (tab order, enter to open picker)
  - Test dark mode compatibility if applicable
  - **Success**: Date input looks consistent, is accessible, and keyboard-navigable

### Task 3: Update ContextIntegrator to Map Date Field
**Effort**: 1/5

- [x] **Task 3.1: Add projectDate mapping in ContextIntegrator**
  - Open `src/services/context/ContextIntegrator.ts`
  - Locate method that maps ProjectData to ContextData (likely `generateContextFromProject` or similar)
  - Add projectDate to returned ContextData object
  - Use fallback: `projectDate: project.projectDate || new Date().toISOString().split('T')[0]`
  - **Success**: ContextIntegrator passes projectDate to ContextData with fallback to current date

- [x] **Task 3.2: Verify mapping works in context generation pipeline**
  - Test that context generation includes projectDate in ContextData
  - Verify fallback works when project has no date
  - Ensure no errors during context generation
  - **Success**: Context generation pipeline successfully includes projectDate field

### Task 4: Add Template Variable Aliases in TemplateProcessor
**Effort**: 1/5

- [x] **Task 4.1: Add date aliases in createEnhancedData method**
  - Open `src/services/context/TemplateProcessor.ts`
  - Locate `createEnhancedData` method (or similar data enhancement method)
  - Add date alias logic following existing pattern:
    ```typescript
    if (data.projectDate) {
      enhanced['project-date'] = data.projectDate;
      enhanced['projectDate'] = data.projectDate;
      enhanced['projectdate'] = data.projectDate;
    }
    ```
  - Place alongside existing alias code (e.g., development-phase aliases)
  - **Success**: Template processor creates all three date variable aliases

- [x] **Task 4.2: Test template variable substitution**
  - Create test or manually verify `{project-date}` substitutes correctly
  - Verify `{projectDate}` also works (kebab-case alias)
  - Verify `{projectdate}` also works (lowercase alias)
  - Ensure substitution happens during template processing
  - **Success**: All date variable aliases substitute to actual date value

### Task 5: Update Default Statements Template
**Effort**: 1/5

- [x] **Task 5.1: Add date field to project-intro-statement**
  - Open `project-documents/user/content/statements/default-statements.md`
  - Locate project-intro-statement section (marked with HTML comment)
  - Add `date: {project-date}` line after `slice: {slice}`
  - Maintain consistent formatting and spacing
  - **Success**: default-statements.md includes date field in project intro (Actually implemented in SectionBuilder.ts buildProjectInfoSection)

- [x] **Task 5.2: Verify statement file format is valid**
  - Ensure HTML comment markers are intact
  - Verify YAML frontmatter is not disrupted
  - Check that statement key metadata is correct
  - **Success**: Statement file parses correctly, no format errors

### Task 6: Test Auto-Save Integration
**Effort**: 2/5

- [ ] **Task 6.1: Test date field triggers auto-save**
  - Open application and create or load a project
  - Change date value in form
  - Verify auto-save mechanism activates (check for save indicator/message)
  - Verify projectDate field is saved to storage
  - **Success**: Changing date triggers auto-save and persists to storage

- [ ] **Task 6.2: Test date persistence across app restarts**
  - Set a specific date in a project
  - Close and restart the application
  - Load the same project
  - Verify date field shows the previously set date
  - **Success**: Date persists correctly between application sessions

- [ ] **Task 6.3: Test new project default date**
  - Create a new project
  - Verify date field automatically shows today's date
  - Verify date is in YYYY-MM-DD format
  - Save project and verify date persists
  - **Success**: New projects default to current date and save correctly

- [ ] **Task 6.4: Test existing projects without date field**
  - If possible, load an older project created before date field existed
  - Verify form shows today's date as default
  - Change date and save
  - Verify projectDate field now exists in stored data
  - **Success**: Backward compatibility maintained for projects without date

### Task 7: Test Context Output Integration
**Effort**: 2/5

- [ ] **Task 7.1: Verify date appears in context output preview**
  - Open application and load or create a project
  - Set a specific date (e.g., 2025-01-15)
  - Check context output preview panel
  - Verify project information section includes `date: 2025-01-15`
  - **Success**: Date displays correctly in context output

- [ ] **Task 7.2: Test date updates reflect in real-time preview**
  - Change date value in form
  - Observe context output preview panel
  - Verify date value updates immediately in preview
  - Ensure no delay or refresh required
  - **Success**: Context preview updates in real-time when date changes

- [ ] **Task 7.3: Test date formatting in output**
  - Verify date appears in ISO 8601 format (YYYY-MM-DD)
  - Check that date is positioned correctly in project info section
  - Ensure proper spacing and formatting around date line
  - **Success**: Date output is correctly formatted and positioned

- [ ] **Task 7.4: Test copy-to-clipboard functionality**
  - Set a date in project
  - Use copy-to-clipboard feature for context output
  - Paste into text editor
  - Verify date field is included in copied text
  - **Success**: Date field copies correctly with full context output

### Task 8: Multi-Project Testing
**Effort**: 1/5

- [ ] **Task 8.1: Test multiple projects maintain separate dates**
  - Create or load Project A, set date to 2025-01-01
  - Create or load Project B, set date to 2025-02-15
  - Switch back to Project A
  - Verify Project A still shows 2025-01-01
  - Switch to Project B, verify 2025-02-15
  - **Success**: Each project maintains its own independent date

- [ ] **Task 8.2: Test project switching with date field**
  - Load Project A with a specific date
  - Switch to Project B with different date
  - Verify form field updates to show Project B's date
  - Verify context output shows correct date for active project
  - **Success**: Date field updates correctly during project switching

### Task 9: Validation and Edge Case Testing
**Effort**: 2/5

- [ ] **Task 9.1: Test HTML5 date input validation**
  - Attempt to enter invalid date formats (if possible via manual input)
  - Verify HTML5 date input provides format validation
  - Ensure invalid inputs are rejected or sanitized
  - **Success**: Date input only accepts valid dates

- [ ] **Task 9.2: Test date value edge cases**
  - Test with very old dates (e.g., 1900-01-01)
  - Test with far future dates (e.g., 2099-12-31)
  - Test with leap year dates (e.g., 2024-02-29)
  - Verify all valid dates work correctly
  - **Success**: All valid date ranges work without errors

- [ ] **Task 9.3: Test missing date handling**
  - Modify project data to remove projectDate field
  - Load project in application
  - Verify form defaults to today's date
  - Verify context output shows today's date
  - **Success**: Missing dates default gracefully to current date

- [ ] **Task 9.4: Test empty or null date handling**
  - Set projectDate to empty string or null (if possible)
  - Verify application handles gracefully
  - Ensure fallback to current date works
  - **Success**: Empty/null dates handled without errors

### Task 10: Build and Integration Verification
**Effort**: 1/5

- [ ] **Task 10.1: Run full TypeScript type check**
  - Execute `pnpm typecheck`
  - Verify no type errors in entire codebase
  - Fix any type errors if they appear
  - **Success**: TypeScript compilation succeeds with no errors

- [ ] **Task 10.2: Run development build**
  - Execute `pnpm dev` to start development server
  - Verify application launches without errors
  - Check browser console for any warnings or errors
  - Test date feature in running application
  - **Success**: Development build runs successfully with date feature working

- [ ] **Task 10.3: Run production build**
  - Execute `pnpm build`
  - Verify build completes without errors
  - Check for any build warnings related to date feature
  - Test production build if possible
  - **Success**: Production build succeeds with no date-related issues

- [ ] **Task 10.4: Verify no regressions in existing features**
  - Test all existing form fields still work
  - Test context generation for non-date fields
  - Test project switching, creation, deletion
  - Test auto-save for other fields
  - **Success**: All existing functionality continues to work correctly

## Task Dependencies

### Sequential Dependencies
- Task 1 (Type Definitions) must complete before Task 2 (Form UI)
- Task 1 (Type Definitions) must complete before Task 3 (ContextIntegrator)
- Task 2 (Form UI) must complete before Task 6 (Auto-Save Testing)
- Task 3 (ContextIntegrator) must complete before Task 7 (Output Testing)
- Task 4 (Template Variables) must complete before Task 7 (Output Testing)
- Task 5 (Statements Template) must complete before Task 7 (Output Testing)
- Tasks 1-5 must complete before Task 10 (Build Verification)

### Parallel Work Opportunities
- Task 2 (Form UI) and Task 3 (ContextIntegrator) can be developed in parallel after Task 1
- Task 4 (Template Variables) and Task 5 (Statements) can be developed in parallel
- Task 6 (Auto-Save Testing) and Task 7 (Output Testing) can be tested in parallel
- Task 8 (Multi-Project) and Task 9 (Validation) can be tested in parallel

## Success Criteria Summary

Upon completion of all tasks:
- [ ] Date input control appears in project configuration form
- [ ] Date defaults to current date (YYYY-MM-DD) for new projects
- [ ] Date persists with project data via auto-save
- [ ] Date appears in context output in project information section
- [ ] Template variable {project-date} substitutes correctly
- [ ] All three variable aliases work ({project-date}, {projectDate}, {projectdate})
- [ ] Multiple projects maintain independent dates
- [ ] Date updates reflect immediately in context preview
- [ ] All existing functionality remains working
- [ ] No TypeScript errors or console warnings introduced
- [ ] Production build succeeds

## Implementation Notes

### Key Patterns to Follow
- Use existing form field patterns from ProjectConfigForm
- Follow existing template variable alias pattern (see development-phase field)
- Use existing auto-save mechanism (no special date handling needed)
- Maintain optional field types for backward compatibility

### Files to Modify
1. `src/services/storage/types/ProjectData.ts` - Add projectDate field
2. `src/services/context/types/ContextData.ts` - Add projectDate field
3. `src/components/forms/ProjectConfigForm.tsx` - Add date input UI
4. `src/services/context/ContextIntegrator.ts` - Add projectDate mapping
5. `src/services/context/TemplateProcessor.ts` - Add date variable aliases
6. `project-documents/user/content/statements/default-statements.md` - Add date to template

### Testing Approach
- Each task includes specific success criteria for validation
- Manual testing sufficient for UI and integration verification
- Focus on edge cases: missing dates, project switching, persistence
- Verify backward compatibility with existing projects
- Ensure no impact on existing features

This feature is straightforward with low risk - leverages existing infrastructure and follows established patterns throughout the codebase.

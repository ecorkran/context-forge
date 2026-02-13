---
item: naming-schema-controls
project: context-builder
type: tasks
sliceIndex: 900
featureReference: 755-feature.naming-schema-controls.md
dependencies: []
projectState: Maintenance phase - all critical bugs fixed, core features working
status: in-progress
dateCreated: 20251008
dateUpdated: 20251008
---

# Tasks: Naming Schema Controls

## Context Summary

This task file implements the naming schema controls feature (GitHub Issue #9), adding checkbox controls to allow users to include/exclude file and directory naming conventions in the context initialization prompt.

**Feature Location**: `user/features/755-feature.naming-schema-controls.md`

**Implementation Pattern**: Follows the established `isMonorepoEnabled` pattern for feature flags controlling content inclusion.

**Core Components**:
- Data model updates for two boolean fields
- UI checkboxes in project configuration form
- State persistence across sessions
- Conditional content loading in context generation
- Section builder methods for naming convention content

**Default Behavior**: Both checkboxes checked (opt-out pattern, maintains current behavior)

## Phase 1: Data Model & Type Safety

**Effort**: 1/5 (Simple type additions)

### Task 1.1: Update ProjectData Type Definition

- [x] Open `src/services/storage/types/ProjectData.ts`
- [x] Add `includeFileNaming?: boolean` to `ProjectData` interface
- [x] Add `includeDirectoryNaming?: boolean` to `ProjectData` interface
- [x] Update `UpdateProjectData` type to include both new fields in the Pick type
- [x] Verify TypeScript compilation with `pnpm typecheck`
- [x] **Success**: TypeScript builds without errors, new fields available

### Task 1.2: Update EnhancedContextData Type

- [x] Open `src/services/context/types/ContextData.ts`
- [x] Add `includeFileNaming?: boolean` to `EnhancedContextData` interface
- [x] Add `includeDirectoryNaming?: boolean` to `EnhancedContextData` interface
- [x] Verify TypeScript compilation with `pnpm typecheck`
- [x] **Success**: TypeScript builds without errors, new fields available in context data

## Phase 2: UI Components

**Effort**: 2/5 (Simple checkbox addition with state handling)

### Task 2.1: Add Checkboxes to ProjectConfigForm

- [x] Open `src/components/ProjectConfigForm.tsx`
- [x] Locate appropriate insertion point (after existing form fields, before submit button)
- [x] Add container div with appropriate spacing (`space-y-2`)
- [x] Add first checkbox label with:
  - [x] Checkbox input with `type="checkbox"`
  - [x] Checked state: `formData.includeFileNaming ?? true`
  - [x] Change handler: `handleFieldChange('includeFileNaming', e.target.checked)`
  - [x] Styling: `className="h-4 w-4"`
  - [x] Label text: "File naming schema"
- [x] Add second checkbox label with:
  - [x] Checkbox input with `type="checkbox"`
  - [x] Checked state: `formData.includeDirectoryNaming ?? true`
  - [x] Change handler: `handleFieldChange('includeDirectoryNaming', e.target.checked)`
  - [x] Styling: `className="h-4 w-4"`
  - [x] Label text: "Directory naming schema"
- [x] Verify visual appearance in running application
- [x] **Success**: Two checkboxes appear in form, both checked by default, clicking toggles state

### Task 2.2: Verify Form State Handling

- [x] Confirm `handleFieldChange` properly updates form state for new fields
- [x] Test checkbox interactions in UI
- [x] Verify form data includes new fields when changed
- [x] **Success**: Checkboxes update form state correctly, no console errors

## Phase 3: State Persistence

**Effort**: 2/5 (Multiple state management touchpoints)

### Task 3.1: Update Auto-Save Handler

- [x] Open `src/components/ContextBuilderApp.tsx`
- [x] Locate auto-save handler function
- [x] Add `includeFileNaming: formData.includeFileNaming` to updated project object
- [x] Add `includeDirectoryNaming: formData.includeDirectoryNaming` to updated project object
- [x] **Success**: Form changes persist when typing stops

### Task 3.2: Update Project Switching Logic

- [x] Locate project switching handler in `ContextBuilderApp.tsx`
- [x] Ensure `includeFileNaming` is loaded from project data
- [x] Ensure `includeDirectoryNaming` is loaded from project data
- [x] Verify default values (`?? true`) if fields are undefined
- [x] Test switching between projects with different settings
- [x] **Success**: Settings persist when switching between projects

### Task 3.3: Update New Project Creation

- [x] Locate new project creation logic in `ContextBuilderApp.tsx`
- [x] Add `includeFileNaming: true` to initial project data
- [x] Add `includeDirectoryNaming: true` to initial project data
- [x] Create new project and verify defaults
- [x] **Success**: New projects have both checkboxes checked by default

### Task 3.4: Test Persistence Across Sessions

- [ ] Set checkboxes to specific state (e.g., file=true, directory=false)
- [ ] Close and reopen application
- [ ] Verify checkbox states match saved values
- [ ] Test with multiple projects
- [ ] **Success**: Settings persist across application restarts

## Phase 4: Content Loading

**Effort**: 3/5 (File I/O with error handling and fallbacks)

### Task 4.1: Add Frontmatter Stripping Utility

- [x] Open `src/services/context/SectionBuilder.ts`
- [x] Add private method `stripFrontmatter(content: string): string`
- [x] Implement regex to match YAML frontmatter: `/^---\n[\s\S]*?\n---\n/`
- [x] Replace frontmatter with empty string and trim
- [x] Add unit test for frontmatter stripping
- [x] **Success**: Method removes YAML frontmatter from markdown content

### Task 4.2: Add File Naming Section Builder

- [x] In `SectionBuilder.ts`, add method `buildFileNamingSection(): Promise<string>`
- [x] Implement file path construction: `path.join(process.cwd(), 'project-documents', 'file-naming-conventions.md')`
- [x] Add file existence check with `fs.existsSync()`
- [x] If file exists:
  - [x] Read file with `fs.readFileSync(filePath, 'utf-8')`
  - [x] Strip frontmatter using `stripFrontmatter()`
  - [x] Return cleaned content
- [x] If file doesn't exist:
  - [x] Log error: `console.error('ERROR: File naming conventions file not found at:', filePath)`
  - [x] Return explicit error placeholder: `"ERROR: Failed to load file naming conventions from project-documents/file-naming-conventions.md"`
- [x] Add try/catch that re-throws errors with context
- [x] **Success**: Method returns file content or explicit error message (no silent fallbacks)

### Task 4.3: Add Directory Structure Section Builder

- [x] In `SectionBuilder.ts`, add method `buildDirectoryStructureSection(): Promise<string>`
- [x] Implement file path construction: `path.join(process.cwd(), 'project-documents', 'directory-structure.md')`
- [x] Add file existence check with `fs.existsSync()`
- [x] If file exists:
  - [x] Read file with `fs.readFileSync(filePath, 'utf-8')`
  - [x] Strip frontmatter using `stripFrontmatter()`
  - [x] Return cleaned content
- [x] If file doesn't exist:
  - [x] Log error: `console.error('ERROR: Directory structure file not found at:', filePath)`
  - [x] Return explicit error placeholder: `"ERROR: Failed to load directory structure from project-documents/directory-structure.md"`
- [x] Add try/catch that re-throws errors with context
- [x] **Success**: Method returns file content or explicit error message (no silent fallbacks)

### Task 4.4: Remove Silent Fallbacks (Compliance Check)

- [x] Review `buildFileNamingSection()` - verify it returns explicit error, not silent fallback
- [x] Review `buildDirectoryStructureSection()` - verify it returns explicit error, not silent fallback
- [x] Ensure error messages are visible in generated context (prefixed with "ERROR:")
- [x] Verify console.error() calls are present for debugging
- [x] **Success**: No silent fallbacks exist; all failures produce explicit, visible error messages

**Note**: This task ensures compliance with the "never use silent fallback values" rule. Missing files must produce obvious error placeholders, not plausible-looking default content.

### Task 4.5: Test Content Loading and Error Handling

- [ ] Test with existing `file-naming-conventions.md` file - verify content loads correctly
- [ ] Test with missing file - verify "ERROR: Failed to load..." appears in context output
- [ ] Test with file containing frontmatter - verify stripping works correctly
- [ ] Test with file containing no frontmatter - verify content loads unchanged
- [ ] Verify console.error() calls appear in console for missing files
- [ ] Verify error messages are visible and obvious in generated context
- [ ] **Success**: All scenarios handled explicitly; errors are visible, not hidden

## Phase 5: Template Engine Integration

**Effort**: 3/5 (Conditional section logic with proper ordering)

### Task 5.1: Update ContextIntegrator

- [x] Open `src/services/context/ContextIntegrator.ts`
- [x] Locate `transformProjectData` method
- [x] Add `includeFileNaming: project.includeFileNaming` to `EnhancedContextData` object
- [x] Add `includeDirectoryNaming: project.includeDirectoryNaming` to `EnhancedContextData` object
- [x] Verify TypeScript compilation
- [x] **Success**: New fields flow from ProjectData to EnhancedContextData

### Task 5.2: Add File Naming Conditional Section

- [x] Open `src/services/context/ContextTemplateEngine.ts`
- [x] Locate `buildTemplate()` method
- [x] Find section order 2 (context-init) insertion point
- [x] Add conditional check: `if (data.includeFileNaming !== false)`
- [x] Call `await this.sectionBuilder.buildFileNamingSection()`
- [x] If content exists, push section object:
  - [x] `key: 'file-naming'`
  - [x] `title: '### File Naming Conventions'`
  - [x] `content: fileNamingContent`
  - [x] `conditional: true`
  - [x] `condition: () => data.includeFileNaming !== false`
  - [x] `order: 2.1`
- [x] **Success**: File naming section appears when enabled, absent when disabled

### Task 5.3: Add Directory Structure Conditional Section

- [x] In `buildTemplate()` method after file naming section
- [x] Add conditional check: `if (data.includeDirectoryNaming !== false)`
- [x] Call `await this.sectionBuilder.buildDirectoryStructureSection()`
- [x] If content exists, push section object:
  - [x] `key: 'directory-structure'`
  - [x] `title: '### Directory Structure'`
  - [x] `content: dirStructureContent`
  - [x] `conditional: true`
  - [x] `condition: () => data.includeDirectoryNaming !== false`
  - [x] `order: 2.2`
- [x] **Success**: Directory structure section appears when enabled, absent when disabled

### Task 5.4: Verify Section Ordering

- [x] Review existing section order values in template engine
- [x] Confirm 2.1 and 2.2 don't conflict with existing sections
- [x] Adjust if necessary to maintain logical order
- [x] Generate context output and verify section placement
- [x] **Success**: Sections appear in correct position (after context-init, before tools)

## Phase 6: Testing & Validation

**Effort**: 2/5 (Comprehensive manual and integration testing)

### Task 6.1: Test Checkbox UI Behavior

- [ ] Open application in development mode
- [ ] Verify both checkboxes appear in form
- [ ] Verify both default to checked state
- [ ] Click to uncheck "File naming schema"
- [ ] Click to uncheck "Directory naming schema"
- [ ] Click to re-check both
- [ ] Verify no console errors during interactions
- [ ] **Success**: Checkboxes function correctly with smooth UX

### Task 6.2: Test Both Flags Enabled

- [ ] Set both checkboxes to checked
- [ ] Generate context output
- [ ] Verify "File Naming Conventions" section appears
- [ ] Verify "Directory Structure" section appears
- [ ] Verify content is properly formatted
- [ ] Verify sections appear in correct order
- [ ] **Success**: Both sections present with correct content

### Task 6.3: Test Both Flags Disabled

- [ ] Set both checkboxes to unchecked
- [ ] Generate context output
- [ ] Verify "File Naming Conventions" section absent
- [ ] Verify "Directory Structure" section absent
- [ ] Verify rest of context output unaffected
- [ ] **Success**: Both sections absent, output otherwise normal

### Task 6.4: Test Mixed States

- [ ] Test: File naming enabled, Directory disabled
  - [ ] Verify only file naming section appears
- [ ] Test: File naming disabled, Directory enabled
  - [ ] Verify only directory structure section appears
- [ ] Verify each combination produces expected output
- [ ] **Success**: Each flag independently controls its section

### Task 6.5: Test Preview Updates

- [ ] Open context output preview panel
- [ ] Toggle "File naming schema" checkbox
- [ ] Verify preview updates immediately
- [ ] Toggle "Directory naming schema" checkbox
- [ ] Verify preview updates immediately
- [ ] Test rapid toggling
- [ ] **Success**: Preview reflects changes in real-time

### Task 6.6: Test New Project Defaults

- [ ] Create new project
- [ ] Verify both checkboxes checked by default
- [ ] Generate context output
- [ ] Verify both sections appear
- [ ] **Success**: Defaults maintain current behavior (opt-out pattern)

### Task 6.7: Test Project Switching

- [ ] Create Project A with both enabled
- [ ] Create Project B with both disabled
- [ ] Create Project C with mixed state
- [ ] Switch between projects
- [ ] Verify checkbox states match each project
- [ ] Verify context output matches each project
- [ ] **Success**: Settings isolated per-project

### Task 6.8: Test Persistence

- [ ] Set specific checkbox states
- [ ] Close application
- [ ] Reopen application
- [ ] Verify states restored correctly
- [ ] Switch projects and verify each persists
- [ ] **Success**: All settings persist across sessions

### Task 6.9: Test Missing Content Files

- [ ] Temporarily rename `file-naming-conventions.md`
- [ ] Generate context with file naming enabled
- [ ] Verify explicit error message appears: "ERROR: Failed to load file naming conventions..."
- [ ] Verify console error logged with file path
- [ ] Restore file
- [ ] Repeat for `directory-structure.md`
- [ ] Verify error is obvious and impossible to mistake for real content
- [ ] **Success**: Missing files produce explicit, visible error messages (no silent fallbacks)

## Phase 7: Build & Integration

**Effort**: 1/5 (Standard build verification)

### Task 7.1: TypeScript Type Check

- [ ] Run `pnpm typecheck`
- [ ] Verify no new TypeScript errors
- [ ] Fix any type errors if present
- [ ] **Success**: TypeScript compiles without errors

### Task 7.2: Build Application

- [ ] Run `pnpm build`
- [ ] Verify build completes successfully
- [ ] Address any build warnings or errors
- [ ] **Success**: Production build succeeds

### Task 7.3: Run Application in Production Mode

- [ ] Start application in production mode
- [ ] Test all checkbox functionality
- [ ] Test context generation
- [ ] Verify no runtime errors
- [ ] **Success**: Application works in production build

### Task 7.4: Final Integration Test

- [ ] Run through complete user workflow:
  - [ ] Create new project
  - [ ] Configure checkboxes
  - [ ] Generate context
  - [ ] Save project
  - [ ] Switch projects
  - [ ] Restart application
  - [ ] Verify persistence
- [ ] **Success**: End-to-end workflow functions correctly

## Phase 8: Documentation & Cleanup

**Effort**: 1/5 (Update feature status and close issue)

### Task 8.1: Update Feature Document

- [ ] Open `user/features/755-feature.naming-schema-controls.md`
- [ ] Update `status` to `completed`
- [ ] Update `lastUpdated` to completion date
- [ ] Check all success criteria items
- [ ] **Success**: Feature document reflects completion

### Task 8.2: Update Task File

- [ ] Check all completed tasks in this file
- [ ] Update `status` to `completed`
- [ ] Update `lastUpdated` to completion date
- [ ] **Success**: Task file marked complete

### Task 8.3: Close GitHub Issue

- [ ] Review GitHub Issue #9 acceptance criteria
- [ ] Verify all criteria met
- [ ] Add comment summarizing implementation
- [ ] Close issue with reference to completion
- [ ] **Success**: GitHub Issue #9 closed

## Summary

**Total Tasks**: 30 sub-tasks across 8 phases
**Overall Effort**: 15/40 (Medium complexity)
**Estimated Completion**: Sequential implementation, 1-2 development sessions

**Key Dependencies**:
- Phase 1 must complete before Phase 2
- Phases 1-3 must complete before Phase 4-5
- Phase 6 requires all previous phases
- Phase 7-8 are final validation

**Risk Mitigation**:
- Default values maintain current behavior (opt-out pattern)
- Explicit error messages (no silent fallbacks) make debugging easy
- Follows established `isMonorepoEnabled` pattern
- Comprehensive testing phase catches edge cases

**Success Indicators**:
- All TypeScript type checks pass
- Production build succeeds
- All manual tests pass
- Settings persist correctly
- Context output conditionally includes sections
- GitHub Issue #9 closed

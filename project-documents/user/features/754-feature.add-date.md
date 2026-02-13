---
item: add-date
project: context-builder
type: feature
github: https://github.com/ecorkran/context-builder/issues/8
dependencies: [foundation, context-templates]
projectState: Core features complete, adding date tracking capability
status: not-started
lastUpdated: 2025-10-04
---

# Feature: Add Date Control to Context-Builder UI

## User-Provided Concept

Add a date field to the context-builder UI with the following requirements:

### UI Controls
- Add a date input control to the project configuration form
- Default to today's date automatically
- Use YYYY-MM-DD format initially

### Format Support (Future Consideration)
- Consider supporting alternate date formats (MM-DD-YYYY)
- Consider supporting alternate separators (/ instead of -)
- Priority: Get the date working with correct default first

### Field Naming
- Use `{project-date}` as the template variable name
- Follow project conventions for internal naming (projectDate, projectdate, etc.)

### Output Integration
- Pass date field to output preview
- Display in initial project information section alongside:
  - project: {project}
  - Current Slice: {slice}
  - **Date: {project-date}** (new)

### Implementation Notes
- Ensure date persists with project data
- Include in auto-save functionality
- Update ContextData types to include date field
- Update template processor to handle {project-date} variable

## HLD: High-Level Design

### Overview
Add date tracking to projects with a simple date input control that defaults to today's date and integrates into the context output template system.

### Architecture Components

#### 1. Data Layer
- **ProjectData Extension**: Add `projectDate?: string` field
- **ContextData Extension**: Add `projectDate?: string` field for template processing
- **Format**: Store as ISO 8601 date string (YYYY-MM-DD)

#### 2. UI Layer
- **Form Control**: HTML5 `<input type="date">` for native date picker
- **Location**: ProjectConfigForm alongside other metadata fields
- **Default Behavior**: Auto-populate with `new Date().toISOString().split('T')[0]`

#### 3. Template Integration
- **Variable Name**: `{project-date}` in templates
- **Alias Support**: Also support `{projectDate}` and `{projectdate}` for consistency
- **Display Format**: Use stored ISO format initially (future: configurable formatting)

#### 4. Data Flow
```
User Opens Project → Load projectDate OR Default to Today
     ↓
User Edits Form → Auto-save to ProjectData.projectDate
     ↓
Generate Context → Map to ContextData.projectDate
     ↓
Template Processing → Substitute {project-date} variable
     ↓
Output Display → Show in project information section
```

### Integration Points

#### Existing Systems
- **ProjectData** (`src/services/storage/types/ProjectData.ts`): Add date field
- **ContextData** (`src/services/context/types/ContextData.ts`): Add date field
- **ProjectConfigForm** (`src/components/forms/ProjectConfigForm.tsx`): Add date input
- **ContextIntegrator** (`src/services/context/ContextIntegrator.ts`): Map projectDate
- **TemplateProcessor** (`src/services/context/TemplateProcessor.ts`): Add variable alias

#### Template Output Location
Add to project information section in default template:
```markdown
project: {project}
slice: {slice}
date: {project-date}
```

### Future Extensibility
- **Phase 2**: Add date format preference (MM-DD-YYYY, DD-MM-YYYY)
- **Phase 3**: Add separator preference (- vs /)
- **Phase 4**: Add locale-aware date formatting
- **Phase 5**: Add date range support (start/end dates)

## LLD: Low-Level Design

### Type Definitions

#### ProjectData Extension
```typescript
// src/services/storage/types/ProjectData.ts
export interface ProjectData {
  // ... existing fields
  projectDate?: string; // ISO 8601 date (YYYY-MM-DD)
}
```

#### ContextData Extension
```typescript
// src/services/context/types/ContextData.ts
export interface ContextData {
  // ... existing fields
  projectDate?: string; // ISO 8601 date for display
}
```

### UI Implementation

#### Form Component Update
```typescript
// src/components/forms/ProjectConfigForm.tsx
const ProjectConfigForm: React.FC<ProjectConfigFormProps> = ({
  projectData,
  onInputChange
}) => {
  // Default to today's date if not set
  const defaultDate = new Date().toISOString().split('T')[0];
  const currentDate = projectData.projectDate || defaultDate;

  return (
    <form>
      {/* ... existing fields */}

      <div className="form-field">
        <label htmlFor="projectDate">Project Date</label>
        <input
          type="date"
          id="projectDate"
          name="projectDate"
          value={currentDate}
          onChange={(e) => onInputChange('projectDate', e.target.value)}
        />
      </div>

      {/* ... remaining fields */}
    </form>
  );
};
```

#### Styling Considerations
- Use existing form field styling patterns
- Ensure date picker is accessible and keyboard-navigable
- Match visual design of other form controls
- Consider dark mode compatibility

### Data Persistence

#### Auto-Save Integration
- Date changes trigger existing auto-save mechanism
- No special handling needed beyond field addition
- Validation: Ensure valid ISO 8601 date format

#### Default Value Strategy
```typescript
// When creating new project
const newProject: ProjectData = {
  // ... other fields
  projectDate: new Date().toISOString().split('T')[0]
};

// When loading existing project without date
const loadedDate = project.projectDate || new Date().toISOString().split('T')[0];
```

### Template Processing

#### TemplateProcessor Enhancement
```typescript
// src/services/context/TemplateProcessor.ts
private createEnhancedData(data: ContextData): any {
  const enhanced = { ...data };

  // ... existing logic

  // Add date aliases
  if (data.projectDate) {
    enhanced['project-date'] = data.projectDate;
    enhanced['projectDate'] = data.projectDate;
    enhanced['projectdate'] = data.projectDate;
  }

  return enhanced;
}
```

#### ContextIntegrator Mapping
```typescript
// src/services/context/ContextIntegrator.ts
private mapProjectToContextData(project: ProjectData): ContextData {
  return {
    // ... existing mappings
    projectDate: project.projectDate || new Date().toISOString().split('T')[0]
  };
}
```

### Output Format

#### Default Statements Update
```markdown
<!-- src/project-documents/content/statements/default-statements.md -->

<!-- key: project-intro-statement, editable: true -->
project: {project}
slice: {slice}
date: {project-date}

<!-- ... rest of statements -->
```

### Validation & Error Handling

#### Input Validation
- HTML5 date input provides basic format validation
- Additional validation: Ensure date is not in far future (configurable limit)
- Handle invalid dates gracefully with fallback to today

#### Edge Cases
- **Missing Date**: Default to current date
- **Invalid Format**: Sanitize to ISO 8601 or default to current date
- **Browser Compatibility**: HTML5 date input supported in all modern browsers

### Testing Strategy

#### Unit Tests
- Test ProjectData serialization with date field
- Test ContextData mapping includes date
- Test template variable substitution for all aliases
- Test default date generation

#### Integration Tests
- Test form auto-save with date changes
- Test context generation includes date
- Test project loading with/without existing date
- Test date display in output preview

#### Manual Testing
- Verify date picker UI appearance and behavior
- Test date persistence across app restarts
- Verify context output shows correct date
- Test multiple projects maintain separate dates

## Implementation Plan

### Phase 1: Data Layer (30 min)
1. Update ProjectData type with projectDate field
2. Update ContextData type with projectDate field
3. Add tests for type extensions

### Phase 2: UI Layer (45 min)
1. Add date input to ProjectConfigForm
2. Implement default date logic
3. Wire up onChange handler
4. Test form rendering and interaction

### Phase 3: Integration Layer (30 min)
1. Update ContextIntegrator mapping
2. Update TemplateProcessor with date aliases
3. Test context generation pipeline

### Phase 4: Template Update (15 min)
1. Update default-statements.md with date field
2. Test output formatting
3. Verify template variable substitution

### Phase 5: Testing & Polish (30 min)
1. Run full test suite
2. Manual testing across scenarios
3. Fix any edge cases discovered
4. Update documentation if needed

**Total Estimated Effort**: ~2.5 hours

## Success Criteria

- [ ] Date input control appears in project configuration form
- [ ] Date defaults to current date (YYYY-MM-DD) for new projects
- [ ] Date persists with project data via auto-save
- [ ] Date appears in context output in project information section
- [ ] Template variable {project-date} substitutes correctly
- [ ] Multiple projects maintain independent dates
- [ ] All existing functionality remains working
- [ ] No console errors or warnings introduced

## Dependencies

- **Foundation Slice**: Form infrastructure and layout
- **Context Templates**: Template variable substitution system
- **Persistence**: ProjectData storage and retrieval

## Risks & Mitigation

### Low Risk Items
- **Browser Compatibility**: HTML5 date input widely supported
- **Date Format**: ISO 8601 is standard and unambiguous
- **Integration**: Minimal changes to existing code

### Mitigation Strategies
- Use feature detection for date input support (fallback: text input with pattern)
- Validate date format on input and storage
- Comprehensive testing of all integration points

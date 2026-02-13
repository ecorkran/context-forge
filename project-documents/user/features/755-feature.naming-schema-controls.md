---
item: naming-schema-controls
project: context-builder
type: feature
github: https://github.com/ecorkran/context-builder/issues/9
dependencies: []
projectState: Maintenance phase - all critical bugs fixed, core features working
status: in-progress
lastUpdated: 2025-10-07
---

# Feature: Naming Schema Controls

## User-Provided Concept

Add checkbox controls to allow users to include file and directory naming schema in the context initialization prompt.

### Requirements

#### UI Controls
- Add checkbox: "File naming schema"
- Add checkbox: "Directory naming schema"
- Default: Both checked (true)
- Recommendation: Both enabled (true)
- These are per-project settings

#### UI Layout
- Add checkboxes to main project configuration form
- Can be placed at end of form unless logical grouping suggests earlier placement
- Consider grouping checkboxes with groupbox/fieldset or similar UI element
- **If groupbox component doesn't exist**: Create separate issue for generic groupbox component

#### Data Persistence
- Settings stored per-project in ProjectData
- Include in auto-save functionality
- Persist between sessions

#### Context Integration
- When enabled, include relevant naming schema sections in context initialization prompt
- Schema content should come from project configuration or default templates
- Allow dynamic inclusion/exclusion based on checkbox state

#### Implementation Notes
- Update ProjectData interface to include these boolean fields
- Update form to capture checkbox state
- Update context generation to conditionally include naming schemas
- Ensure template processor handles conditional inclusion

#### Acceptance Criteria
- [ ] Checkboxes appear in project configuration UI
- [ ] Both default to checked/enabled state
- [ ] Settings persist with project data
- [ ] Context output includes/excludes naming schemas based on checkbox state
- [ ] Changes reflect immediately in preview
- [ ] UI grouping is logical and clean

## HLD

### System Overview

This feature extends the context generation system to conditionally include naming convention documentation based on user preferences. It follows the established pattern of feature flags controlling content inclusion (similar to `isMonorepoEnabled`).

### Architecture Components

```
┌─────────────────────────────────────────────────────────────┐
│                    ProjectConfigForm.tsx                     │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  □ Include file naming conventions                    │  │
│  │  □ Include directory naming conventions               │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│                   ProjectData.ts                             │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  includeFileNaming?: boolean                          │  │
│  │  includeDirectoryNaming?: boolean                     │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│              ContextTemplateEngine.ts                        │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  buildTemplate() - Add conditional sections:          │  │
│  │  - File naming conventions (if enabled)               │  │
│  │  - Directory naming conventions (if enabled)          │  │
│  └───────────────────────────────────────────────────────┘  │
│                          │                                   │
│                          ▼                                   │
│              SystemPromptParser.ts                           │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  getNamingConventions()                               │  │
│  │  - Parse content from prompt.ai-project.system.md     │  │
│  │  - Or read from project-guides/file-naming-*          │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### Content Sources

Two naming convention documents exist in the project:
1. `project-documents/file-naming-conventions.md` - File and directory naming rules
2. `project-documents/directory-structure.md` - Directory organization and structure

These should be parsed and included in the context initialization prompt when the respective flags are enabled.

### Integration Points

1. **Data Model**: `ProjectData` interface
2. **UI Layer**: `ProjectConfigForm` component
3. **State Management**: `ContextBuilderApp` auto-save and project switching
4. **Context Generation**: `ContextTemplateEngine` template building
5. **Content Parsing**: `SystemPromptParser` or new helper service

## LLD

### 1. Data Model Changes

**File**: `src/services/storage/types/ProjectData.ts`

```typescript
export interface ProjectData {
  // ... existing fields ...
  includeFileNaming?: boolean;
  includeDirectoryNaming?: boolean;
}

export type UpdateProjectData = Partial<Pick<ProjectData,
  'name' | 'template' | 'slice' | 'taskFile' | 'instruction' |
  'developmentPhase' | 'workType' | 'projectDate' | 'isMonorepo' |
  'isMonorepoEnabled' | 'includeFileNaming' | 'includeDirectoryNaming' |
  'customData'
>>;
```

**Default Values**: Both `true` (opt-out pattern, includes by default)

### 2. UI Components

**File**: `src/components/ProjectConfigForm.tsx`

Add checkbox controls after the existing form fields, potentially grouped with other "Context Options" checkboxes:

```tsx
{/* Naming Convention Controls */}
<div className="space-y-2">
  <label className="flex items-center space-x-2">
    <input
      type="checkbox"
      checked={formData.includeFileNaming ?? true}
      onChange={(e) => handleFieldChange('includeFileNaming', e.target.checked)}
      className="h-4 w-4"
    />
    <span className="text-sm">File naming schema</span>
  </label>

  <label className="flex items-center space-x-2">
    <input
      type="checkbox"
      checked={formData.includeDirectoryNaming ?? true}
      onChange={(e) => handleFieldChange('includeDirectoryNaming', e.target.checked)}
      className="h-4 w-4"
    />
    <span className="text-sm">Directory naming schema</span>
  </label>
</div>
```

### 3. State Management

**File**: `src/components/ContextBuilderApp.tsx`

Ensure the new fields are included in:
- Auto-save handler
- Project switching handler
- New project creation

Example auto-save update:
```typescript
const updatedProject = {
  ...currentProject,
  // ... existing fields ...
  includeFileNaming: formData.includeFileNaming,
  includeDirectoryNaming: formData.includeDirectoryNaming
};
```

### 4. Context Template Engine

**File**: `src/services/context/ContextTemplateEngine.ts`

In `buildTemplate()` method, add conditional sections after the context initialization prompt:

```typescript
// After section order 2 (context-init), before section 3 (tools-section)

// 2.1. File naming conventions (conditional)
if (data.includeFileNaming !== false) {  // Default true
  const fileNamingContent = await this.sectionBuilder.buildFileNamingSection();
  if (fileNamingContent) {
    sections.push({
      key: 'file-naming',
      title: '### File Naming Conventions',
      content: fileNamingContent,
      conditional: true,
      condition: () => data.includeFileNaming !== false,
      order: 2.1
    });
  }
}

// 2.2. Directory structure conventions (conditional)
if (data.includeDirectoryNaming !== false) {  // Default true
  const dirStructureContent = await this.sectionBuilder.buildDirectoryStructureSection();
  if (dirStructureContent) {
    sections.push({
      key: 'directory-structure',
      title: '### Directory Structure',
      content: dirStructureContent,
      conditional: true,
      condition: () => data.includeDirectoryNaming !== false,
      order: 2.2
    });
  }
}
```

### 5. Section Builder Extensions

**File**: `src/services/context/SectionBuilder.ts`

Add new methods to build naming convention sections:

```typescript
/**
 * Build file naming conventions section
 */
async buildFileNamingSection(): Promise<string> {
  try {
    const filePath = path.join(
      process.cwd(),
      'project-documents',
      'file-naming-conventions.md'
    );

    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      // Remove YAML frontmatter if present
      return this.stripFrontmatter(content);
    }

    return this.getFallbackFileNaming();
  } catch (error) {
    console.warn('Error loading file naming conventions:', error);
    return this.getFallbackFileNaming();
  }
}

/**
 * Build directory structure section
 */
async buildDirectoryStructureSection(): Promise<string> {
  try {
    const filePath = path.join(
      process.cwd(),
      'project-documents',
      'directory-structure.md'
    );

    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return this.stripFrontmatter(content);
    }

    return this.getFallbackDirectoryStructure();
  } catch (error) {
    console.warn('Error loading directory structure:', error);
    return this.getFallbackDirectoryStructure();
  }
}

/**
 * Remove YAML frontmatter from markdown content
 */
private stripFrontmatter(content: string): string {
  const frontmatterRegex = /^---\n[\s\S]*?\n---\n/;
  return content.replace(frontmatterRegex, '').trim();
}

/**
 * Fallback file naming content
 */
private getFallbackFileNaming(): string {
  return `Follow standard file naming conventions:
- Use kebab-case for files and directories
- Use descriptive names that reflect purpose
- Include appropriate file extensions`;
}

/**
 * Fallback directory structure content
 */
private getFallbackDirectoryStructure(): string {
  return `Follow standard directory structure:
- Organize files logically by feature or function
- Keep related files together
- Use clear hierarchical organization`;
}
```

### 6. Enhanced Context Data

**File**: `src/services/context/types/ContextData.ts`

Add fields to `EnhancedContextData`:

```typescript
export interface EnhancedContextData {
  // ... existing fields ...
  includeFileNaming?: boolean;
  includeDirectoryNaming?: boolean;
}
```

### 7. Context Integrator Update

**File**: `src/services/context/ContextIntegrator.ts`

Update the `transformProjectData` method to include new fields:

```typescript
const enhancedData: EnhancedContextData = {
  // ... existing transformations ...
  includeFileNaming: project.includeFileNaming,
  includeDirectoryNaming: project.includeDirectoryNaming,
};
```

## Implementation Approach

### Phase 1: Data Model & Type Safety
1. Update `ProjectData.ts` with new optional fields
2. Update `EnhancedContextData.ts` with new fields
3. Update all type definitions and exports

### Phase 2: UI Components
1. Add checkboxes to `ProjectConfigForm.tsx`
2. Wire up state handling via `handleFieldChange`
3. Set default values (both `true`)
4. Verify form state updates correctly

### Phase 3: State Persistence
1. Update `ContextBuilderApp.tsx` auto-save handler
2. Update project switching logic
3. Update new project creation logic
4. Test persistence across sessions

### Phase 4: Content Loading
1. Add section builder methods in `SectionBuilder.ts`
2. Implement file reading for naming convention docs
3. Add frontmatter stripping utility
4. Implement fallback content

### Phase 5: Template Engine Integration
1. Update `ContextTemplateEngine.ts` `buildTemplate()` method
2. Add conditional sections with appropriate order values
3. Update `ContextIntegrator.ts` to pass new fields
4. Test conditional inclusion logic

### Phase 6: Testing & Validation
1. Test checkbox UI behavior
2. Test persistence across page refreshes
3. Test context output with both flags enabled
4. Test context output with both flags disabled
5. Test context output with mixed states
6. Verify preview updates in real-time
7. Build and integration test

## Testing Strategy

### Unit Tests
- `ProjectData` type definitions and defaults
- `SectionBuilder` naming convention methods
- `ContextTemplateEngine` conditional section logic

### Integration Tests
- Form state updates persist to ProjectData
- Context output changes based on flag states
- File loading and fallback behavior

### Manual Testing
- Check/uncheck boxes and verify preview updates
- Create new project and verify defaults
- Switch between projects and verify settings persist
- Test with missing/corrupt naming convention files

## Success Criteria

- [x] Feature design document created
- [ ] Data model updated with new fields
- [ ] UI checkboxes added to project form
- [ ] Settings persist per-project
- [ ] Context output conditionally includes naming schemas
- [ ] Preview updates reflect changes immediately
- [ ] Default values are both `true` (opt-out pattern)
- [ ] Fallback content provided for missing files
- [ ] All builds pass
- [ ] All tests pass
- [ ] GitHub Issue #9 closed

## Notes

- Follows established pattern from `isMonorepoEnabled` feature
- Uses opt-out pattern (defaults to `true`) to maintain current behavior
- Naming convention documents already exist in project-documents/
- May need to adjust section order values if conflicts arise
- Consider UI grouping with fieldset if multiple context options grow

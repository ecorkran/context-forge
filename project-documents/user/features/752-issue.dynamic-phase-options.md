---
layer: project
docType: feature
issueNumber: 24
status: backlog
priority: P2
category: feature/enhancement
dateCreated: 20260207
dateUpdated: 20260207
---

# Feature: Dynamic Phase Options (Issue #24)

## Problem
The PHASE_OPTIONS list in ProjectConfigForm.tsx is hardcoded (lines 38-57), making it inflexible and difficult to expand or maintain. As new development phases are added to the system, the UI must be manually updated.

## Goal
Populate PHASE_OPTIONS dynamically from the system instead of maintaining a static list. This removes the need for manual UI updates when phases change and improves overall flexibility.

## Context

### Current Implementation
- **Location**: `src/components/forms/ProjectConfigForm.tsx:38-57`
- **Type**: Static array with 16 hardcoded entries
- **Structure**: Mixed options (phases, dividers) with value/label pairs

### System Source
- Phase definitions exist in `project-documents/project-guides/prompt.ai-project.system.md`
- Current phase sections in prompts file can be parsed to extract phase information

### Current Approach
Static list that requires manual updates whenever:
- New development phases are added
- Phase names change
- Phase ordering changes

## Implementation Notes

- No database yet; continue working with MD files
- Extract phase information from prompts or create additional configuration means
- Maintain backward compatibility with existing saved projects
- UI should continue to support visual separators (dividers in current list)
- Prevent tight coupling between prompt system and UI component

## Success Criteria

- [ ] PHASE_OPTIONS loaded dynamically from system source
- [ ] All existing phase options remain available and functional
- [ ] No manual updates needed when new phases are added to prompts
- [ ] Build passes with no TypeScript errors
- [ ] Existing projects continue to work without changes
- [ ] Phase selection still works correctly in form
- [ ] Character counter and other form functionality unaffected

## Technical Approach (To Be Determined)

### Option A: Parse Prompt File
Extract phase information from prompt.ai-project.system.md section headers during build

### Option B: Create Configuration File
Maintain a separate `phases.config.md` or JSON file as single source of truth

### Option C: Hybrid Approach
Keep a metadata file with phase definitions, derive from prompts as reference

## Dependencies
- No external dependencies (MD parsing already in codebase)
- Can work independently of other slices

## Priority
P2 - Nice-to-have enhancement (current hardcoded approach is functional)

## Notes
- Discuss with PM which configuration approach best fits project architecture
- Consider caching/build-time extraction vs. runtime parsing trade-offs

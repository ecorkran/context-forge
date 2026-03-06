---
docType: slice-design
parent: user/architecture/160-slices.project-workflow-system.md
project: context-forge
sliceIndex: 175
sliceName: context-output-consolidation
dateCreated: 20260306
dateUpdated: 20260306
status: design
---

# Slice 175: Context Output Consolidation & Template Variable Completion

## Overview

The generated context prompt — Context Forge's primary output — currently contains three sections that repeat project/slice/task/phase information with inconsistent field names and missing artifact references. This slice consolidates those sections into a single clean block, adds all artifact fields to the template variable system, and specifies changes needed in the external system prompt file.

## Problem

Running `cf build` today produces output with these issues:

**Triple repetition.** Project identity appears in three places:

1. `SectionBuilder.buildProjectInfoSection()` — the `### Current Work Context [...]` block
2. The `context-initialization` system prompt — "Current work context: Project/Slice/Tasks/Phase" bullet list
3. The `context-initialization` system prompt — "Key project documents: Slice design/Tasks file" section

**Inconsistent field names.** Section 1 uses `currentDate`, `slice`, `taskFile`. Section 2 uses `Slice`, `Tasks`. The schema fields are `dateProject`, `fileSlice`, `fileTasks`.

**Missing artifact fields.** `fileArch` and `fileSlicePlan` exist in `ProjectData` and the schema but are absent from:
- `ContextData` interface (the template variable source)
- `EnhancedContextData` interface
- `TemplateProcessor.createEnhancedData()` variable map
- `SectionBuilder.buildProjectInfoSection()` output
- The `context-initialization` prompt has no placeholders for them

This means `{fileArch}` and `{fileSlicePlan}` in system prompts get no substitution, and the context output never mentions architecture or slice plan documents even when they're populated.

**Obsolete content.**
- `template` field included despite being rarely meaningful (e.g., "templates/react" for a Python project)
- Start/continue distinction in opening statement adds no value
- "slice-based methodology" phrasing references an obsolete distinction (simple methodology was removed)
- Legacy HLD path note is no longer relevant
- Decomposition hint (`if [slice] is provided it can be decomposed...`) is internal knowledge

## Design

### Scope Boundary

This slice modifies **core context assembly code** (`packages/core`). It does NOT modify the system prompt file (`prompt.ai-project.system.md`) which lives in the `ai-project-guide` repository. Changes needed in that file are documented as a spec in the "System Prompt File Spec" section below.

### Change 1: Add artifact fields to context data types

**File:** `packages/core/src/types/context.ts`

Add to `ContextData`:
```
fileArch?: string;
fileSlicePlan?: string;
fileHLD?: string;
fileSpec?: string;
```

These are optional — many projects won't have them populated. `EnhancedContextData` inherits them via `extends`.

### Change 2: Map artifact fields in ContextIntegrator

**File:** `packages/core/src/services/ContextIntegrator.ts`

In `mapProjectToEnhancedContext()` and `mapProjectToContext()`, add:
```
fileArch: project.fileArch || '',
fileSlicePlan: project.fileSlicePlan || '',
fileHLD: project.fileHLD || '',
fileSpec: project.fileSpec || '',
```

### Change 3: Add artifact fields to TemplateProcessor variable map

**File:** `packages/core/src/services/TemplateProcessor.ts`

In `createEnhancedData()`, add the artifact fields and useful aliases:
```
// Artifact aliases for template substitution
enhanced['arch'] = data.fileArch;
enhanced['plan'] = data.fileSlicePlan;
enhanced['hld'] = data.fileHLD;
enhanced['spec'] = data.fileSpec;
```

This ensures system prompts can use `{fileArch}`, `{arch}`, `{fileSlicePlan}`, `{plan}`, etc.

### Change 4: Consolidate project info section

**File:** `packages/core/src/services/SectionBuilder.ts` — `buildProjectInfoSection()`

Replace the current output with a consolidated block that:
- Uses schema field names (`fileSlice` not `slice`, `fileTasks` not `taskFile`, `dateProject` not `currentDate`)
- Includes `fileArch` and `fileSlicePlan` when populated (omit when empty)
- Includes `fileHLD` and `fileSpec` when populated (omit when empty)
- Omits `template` (or includes only when non-empty and not a default/placeholder value)
- Uses a cleaner format (key-value lines, no JSON-like bracket wrapper)

Target output format:
```
### Project Context
Project: context-forge
Phase: Phase 4: Slice Design
Date: 2026-03-05
Slice: 174-slice.cf-slash-commands
Tasks: 174-tasks.cf-slash-commands
Architecture: 160-arch.project-workflow-system
Slice Plan: 160-slices.project-workflow-system
```

Only populated fields appear. No brackets, no commas. Clean key-value pairs that any LLM can parse trivially.

### Change 5: Simplify opening statement

**File:** `packages/core/src/services/constants.ts`

Replace `start-project-statement` and `continue-project-statement` with a single statement:
```
'project-statement': {
  key: 'project-statement',
  content: 'Working on {{projectName}}. Project information, environment context, instructions, and notes follow:',
  description: 'Opening statement for project context',
  editable: true
}
```

**File:** `packages/core/src/services/ContextTemplateEngine.ts` — `buildTemplate()`

Change the `project-intro` section (order 1) to use the single `project-statement` key instead of branching on `workType`.

Keep the old statement keys in `DEFAULT_STATEMENTS` as deprecated aliases (mapping to the same content) for one release cycle, in case users have custom `default-statements.md` files referencing them.

### Change 6: Remove redundant context-init prompt content handling

**File:** `packages/core/src/services/ContextTemplateEngine.ts` — `buildTemplate()`

The `context-init` section (order 2) currently injects the full `context-initialization` prompt from the system prompt file. This prompt contains the repeated project info, resource structure, role instructions, etc.

After this slice, the `context-init` section should:
- Still load the `context-initialization` prompt from the prompt file
- Still process template variables (this is where `{fileArch}` substitution happens)
- No longer duplicate what the consolidated project-info section already provides

The actual deduplication happens in the system prompt file content (Change 7 spec), not in the engine code. The engine's job is to substitute variables correctly — which it will now do for all artifact fields.

### Change 7: System Prompt File Spec (for ai-project-guide maintainer)

**NOT implemented in this slice.** This documents the required changes to `prompt.ai-project.system.md` in the `ai-project-guide` repository.

The `context-initialization` prompt should be updated to:

1. **Remove the repeated project info block.** The "Current work context: Project/Slice/Tasks/Phase" bullets duplicate what `### Project Context` already provides. Remove them.

2. **Remove the resource structure block.** The "Key project documents: Slice design/Tasks file" section duplicates info from the project context block. Remove it.

3. **Remove obsolete content:**
   - "slice-based methodology" phrasing (methodology distinction is obsolete)
   - Decomposition hint (`if [slice] is provided...`)
   - Legacy HLD path note
   - Hardcoded `050-arch.hld-` HLD reference

4. **Add artifact references using template variables.** Where the prompt needs to reference architecture or slice plan, use `{fileArch}` and `{fileSlicePlan}` which will now be substituted:
   ```
   {{#if fileArch}}Architecture: {fileArch}{{/if}}
   {{#if fileSlicePlan}}Slice Plan: {fileSlicePlan}{{/if}}
   ```

5. **Keep the role/instructions content.** The "If you were previously assigned a role..." and "If tasks file is already present..." paragraphs are useful and not duplicative. These should remain.

6. **Keep the granularity guidance.** "Concentrate on the most granular level available" is useful and should remain.

**Interim behavior:** Until the system prompt file is updated, there will be some residual duplication between the consolidated `### Project Context` block and the `context-initialization` prompt. This is acceptable — the duplication is reduced (not tripled), and the new artifact fields will substitute correctly in both places.

**User note — keeping project state current:** Template variable substitution is only as good as the stored project state. When moving between slices, the user (or agent) must update `fileSlice` and `fileTasks` before running `cf build` or using phase prompts — otherwise the old values substitute in. This is equivalent to updating fields in the Electron UI before copying context. The CLI workflow is `cf set slice {n} && cf set tasks {n}` before `cf build`. Workflow Navigator (slice 165) will eventually collapse this into a single "advance to next slice" operation. Until then, this is a training/habit item, not a code gap.

### Change 8: Phase-specific prompts get artifact variables too

The template variable additions (Changes 2-3) automatically benefit all prompts, not just `context-initialization`. This means phase prompts like P4 and P5 that reference `{fileArch}`, `{fileSlicePlan}`, `{nnn}` etc. will get correct substitution.

The `nnn` placeholder used in some prompts (e.g., P4's "nnn-slices.{name}.md") needs a template variable. Add `sliceindex` (already exists from slice parsing) and architecture/plan index extraction:
- Parse `fileArch` like `160-arch.project-workflow-system` to extract index `160`
- Parse `fileSlicePlan` similarly
- Add `archIndex` and `planIndex` as template variables

This allows prompts to use `{archIndex}` where they currently use `nnn`.

### Change 9: Auto-set instruction when phase changes

Setting `developmentPhase` via `cf set phase 6` should also update `instruction` to match. These fields are directly coupled — phase determines which system prompt is used for context generation, and `instruction` is the key that selects that prompt. Currently the user must set both independently, leading to stale instruction values.

**File:** `packages/cli/src/commands/project.ts` — `projectSetAction()`

When `resolvedField === 'developmentPhase'`, also write `instruction` to the same resolved value in the same store update. Log the auto-set so the user sees both fields changed.

**File:** `packages/mcp-server/src/tools/projectTools.ts` — `project_update` handler

If the update payload includes `developmentPhase` but not `instruction`, auto-set `instruction` to the same value. If both are explicitly provided, respect the explicit `instruction` value.

This does NOT apply when setting `instruction` directly — setting instruction alone is a valid use case (e.g., Custom Instruction).

## Data Flow

```
ProjectData (storage)
    |
    v
ContextIntegrator.mapProjectToEnhancedContext()  -- adds fileArch, fileSlicePlan, fileHLD, fileSpec
    |
    v
EnhancedContextData  -- now has all artifact fields
    |
    v
TemplateProcessor.createEnhancedData()  -- adds aliases: arch, plan, hld, spec, archIndex, planIndex
    |
    v
Template variable substitution  -- {fileArch}, {arch}, {archIndex} etc. all resolve
    |
    v
SectionBuilder.buildProjectInfoSection()  -- consolidated block with all fields
ContextTemplateEngine.buildTemplate()  -- single opening statement, sections assembled
    |
    v
Generated context output  -- clean, non-redundant
```

## Files Changed

| File | Change |
|------|--------|
| `packages/core/src/types/context.ts` | Add artifact fields to `ContextData` |
| `packages/core/src/services/ContextIntegrator.ts` | Map artifact fields in both context mappers |
| `packages/core/src/services/TemplateProcessor.ts` | Add artifact fields + aliases + index extraction to variable map |
| `packages/core/src/services/SectionBuilder.ts` | Rewrite `buildProjectInfoSection()` |
| `packages/core/src/services/ContextTemplateEngine.ts` | Single opening statement, simplified context-init handling |
| `packages/core/src/services/constants.ts` | Add unified `project-statement`, deprecate start/continue variants |
| `packages/core/tests/services/SectionBuilder.test.ts` | Update project info section tests |
| `packages/core/tests/services/ContextTemplateEngine.test.ts` | Update opening statement tests |
| `packages/core/tests/services/TemplateProcessor.test.ts` | Add artifact variable substitution tests |
| `packages/core/tests/services/ContextIntegrator.test.ts` | Update context mapping tests |
| `packages/cli/src/commands/project.ts` | Auto-set `instruction` when `developmentPhase` is set |
| `packages/mcp-server/src/tools/projectTools.ts` | Auto-set `instruction` in `project_update` when phase changes |

## Cross-Slice Dependencies

- **Depends on:** 161 (schema standardization — complete), 171 (project schema — complete)
- **Consumed by:** All future context generation. System prompt file update is a separate deliverable for the ai-project-guide maintainer.
- **No breaking changes** to MCP tools, CLI commands, or Electron. The change is in the shape of the generated output, not the API surface.

## Success Criteria

- [ ] Generated context contains project information exactly once (no triple repetition)
- [ ] `fileArch`, `fileSlicePlan`, `fileHLD`, `fileSpec` available as template variables
- [ ] System prompts using `{fileArch}`, `{fileSlicePlan}` etc. get correct substitution
- [ ] `archIndex` and `planIndex` extracted and available as template variables
- [ ] Opening statement simplified (single statement, no start/continue branch)
- [ ] Schema field names used consistently in output (`fileSlice` not `slice`, `dateProject` not `currentDate`)
- [ ] `template` omitted from project context block (or shown only when meaningful)
- [ ] System prompt file changes documented as spec (not implemented)
- [ ] `cf set phase N` auto-sets `instruction` to match; setting `instruction` directly does not touch phase
- [ ] All existing tests pass with updates
- [ ] `cf build` output is visibly cleaner and shorter

## Out of Scope

- Modifying the system prompt file (`prompt.ai-project.system.md`) — that's in `ai-project-guide` repo
- Changing what the Electron UI displays (it doesn't render context output inline)
- Adding new MCP tools or CLI commands
- Removing `workType` from the data model (it's still useful for other purposes, just not for the opening statement)

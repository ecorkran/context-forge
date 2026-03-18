---
docType: slice-design
slice: worktree-aware-prompt-context
project: context-forge
parent: user/architecture/180-slices.initiative-context-worktree.md
dependencies: [185-worktree-aware-context-assembly]
interfaces: []
dateCreated: 20260317
dateUpdated: 20260318
status: complete
---

# Slice 189: Worktree-Aware Prompt Context

## Overview

When `cf build` runs from a worktree, the Phase 2 (Architecture) prompt tells the agent to scan `user/architecture/` for existing files and determine the component name and base index. This fails in worktree scenarios because: (1) the worktree already knows its index range (e.g., 300-499) but doesn't pass it to the template, (2) the agent sees arch files from other worktrees and gets confused, and (3) the prompt template has no worktree-aware path.

This slice injects worktree metadata into the template variable system so phase-specific prompts can use worktree identity (name, index range, archDoc status) without the agent needing to discover it via MCP calls or filesystem scanning.

## Value

Without this fix, agents in worktrees waste tokens discovering context that's already known, read irrelevant arch files from other worktrees' index ranges, and sometimes proceed with placeholder names instead of asking the user. The fix makes worktree-aware builds produce prompts that are immediately actionable.

## Technical Scope

**Included:**
- New worktree-related fields on `ContextData` / `EnhancedContextData`
- Updated `applyWorktreeOverlay` to carry worktree metadata through to the template data
- New computed aliases in `TemplateProcessor.createEnhancedData()` for worktree variables
- Updated Phase 2 prompt template to use worktree variables when available
- Sync bundled prompt asset after template changes

**Excluded:**
- No changes to worktree CRUD, CWD resolution, or storage
- No changes to other phase prompts (Phase 3-7) — those can be enhanced in follow-up work if needed
- No changes to the MCP `context_build` tool handler (it already passes worktreeId through)

## Dependencies

### Prerequisites
- **185 (Worktree-Aware Context Assembly)** — complete. Established `applyWorktreeOverlay` pattern.

### Interfaces Required
- `ContextData` type (extended with optional worktree fields)
- `TemplateProcessor.createEnhancedData()` (adds computed aliases)
- `applyWorktreeOverlay()` in `packages/core/src/utils/worktree-overlay.ts`
- Phase 2 section of `prompt.ai-project.system.md`

## Architecture

### Current Data Flow (the gap)

```
ProjectData + worktreeId
    → applyWorktreeOverlay()
        → maps: archDoc→fileArch, slicePlan→fileSlicePlan, etc.
        → does NOT carry: worktree name, index range, worktree path
    → ContextIntegrator.mapToContextData()
        → maps ProjectData fields to ContextData
        → no worktree fields exist on ContextData
    → TemplateProcessor.createEnhancedData()
        → creates aliases: arch, archIndex, slice, sliceindex, etc.
        → no worktree aliases exist
    → Phase 2 prompt template
        → uses {project}, {component-name} (unresolved placeholder)
        → agent must discover component name and index range manually
```

### Proposed Data Flow

```
ProjectData + worktreeId
    → applyWorktreeOverlay()
        → maps workflow fields (unchanged)
        → NEW: copies worktree name, index range to ProjectData extension fields
    → ContextIntegrator.mapToContextData()
        → maps new worktree fields to ContextData
    → TemplateProcessor.createEnhancedData()
        → NEW: creates worktree aliases (worktreeName, worktreeRange, etc.)
    → Phase 2 prompt template
        → NEW: {{#if worktreeName}}uses worktree context{{else}}scan directory{{/if}}
```

### Data Model Changes

**`ContextData` (add optional fields):**
```typescript
export interface ContextData {
  // ... existing fields ...
  worktreeName?: string;          // e.g., "world-server"
  worktreeIndexStart?: number;    // e.g., 300
  worktreeIndexEnd?: number;      // e.g., 499
}
```

**`ContextIntegrator.mapToContextData()` (accept worktreeId):**

Rather than adding convention fields to `ProjectData`, `mapToContextData` accepts an optional `worktreeId` parameter and looks up the worktree metadata directly from `project.worktrees[]`:

```typescript
mapToContextData(project: ProjectData, worktreeId?: string): ContextData {
  // ... existing mapping ...
  if (worktreeId) {
    const wt = (project.worktrees ?? []).find(w => w.id === worktreeId);
    if (wt) {
      data.worktreeName = wt.name;
      data.worktreeIndexStart = wt.indexRange[0];
      data.worktreeIndexEnd = wt.indexRange[1];
    }
  }
  return data;
}
```

`applyWorktreeOverlay` remains unchanged — it handles workflow field mapping only. The worktree identity flows through a separate path, keeping concerns separated.

**`TemplateProcessor.createEnhancedData()` (add aliases):**
```typescript
if (data.worktreeName) {
  enhanced['worktreeName'] = data.worktreeName;
  enhanced['worktree-name'] = data.worktreeName;
}
if (data.worktreeIndexStart !== undefined) {
  enhanced['worktreeIndexStart'] = data.worktreeIndexStart;
  enhanced['worktreeIndexEnd'] = data.worktreeIndexEnd;
  enhanced['worktreeRange'] = `${data.worktreeIndexStart}-${data.worktreeIndexEnd}`;
  enhanced['worktree-range'] = `${data.worktreeIndexStart}-${data.worktreeIndexEnd}`;
}
```

### Prompt Template Changes (Phase 2)

The Phase 2 section in `prompt.ai-project.system.md` gains a conditional block:

```markdown
{{#if worktreeName}}
**Worktree context:** You are working in the `{{worktreeName}}` worktree (index range {{worktreeRange}}).
- Use base index {{worktreeIndexStart}} for this component's architecture document.
- The architecture file should be named `{{worktreeIndexStart}}-arch.<component-name>.md`.
{{#if arch}}
- Architecture document is already set: `{{arch}}`. Review and update it.
{{else}}
- No architecture document exists yet for this worktree. Create one at index {{worktreeIndexStart}}.
{{/if}}
{{else}}
**Before proceeding, determine the component name and base index:**
1. If the project's `fileArch` is already set, use that component name and index.
2. If Additional Instructions below describe the component, derive the name from that description.
3. Otherwise, **stop and ask the Project Manager** what architectural component they want to create.
...existing non-worktree instructions...
{{/if}}
```

This gives worktree-context agents immediate clarity on the component's index and arch status, while preserving the existing behavior for non-worktree builds.

### MCP `context_build` Compatibility

The MCP `context_build` tool already accepts an optional `worktree` parameter and calls `applyWorktreeOverlay`. Once the overlay carries worktree metadata, MCP builds automatically get the same improvement — no MCP tool handler changes needed.

## Success Criteria

1. `cf build` from a worktree with Phase 2 produces a prompt that includes the worktree name and index range
2. `cf build` from a worktree with an arch doc set shows "Architecture document is already set: ..."
3. `cf build` from a worktree without an arch doc shows "No architecture document exists yet... Create one at index NNN"
4. `cf build` from a non-worktree project produces identical output to today (no regression)
5. Template variables `{worktreeName}`, `{worktreeRange}`, `{worktreeIndexStart}`, `{worktreeIndexEnd}` are available in all prompt templates
6. MCP `context_build` with worktree parameter produces the same worktree-aware output
7. Bundled prompt asset synced after template changes

## Verification Walkthrough

#### 1. Build from worktree with arch doc set

```bash
cd ~/source/repos/manta/context-forge   # "default" worktree, range 100-499, arch=180-arch.initiative-context-worktree
cf build --phase architecture
```

Actual output (excerpt):
```
**Worktree context:** You are working in the `default` worktree (index range 100-499).
- Base index for this component's architecture document: 100
- Architecture file naming: `100-arch.<component-name>.md`
- Current arch doc: `180-arch.initiative-context-worktree` (empty means none set yet — create one at index 100)
```
✅ Worktree name, range, and arch doc shown. Non-worktree block absent.

#### 2. Build from worktree with no arch doc

```bash
cd ~/source/repos/manta/context-forge-maintenance   # "maintenance" worktree, range 900-999, no arch set
cf build --phase architecture
```

Actual output (excerpt):
```
**Worktree context:** You are working in the `maintenance` worktree (index range 900-999).
- Base index for this component's architecture document: 900
- Architecture file naming: `900-arch.<component-name>.md`
- Current arch doc: `` (empty means none set yet — create one at index 900)
```
✅ Worktree name and range shown. Empty arch doc field with "create one" guidance.

#### 3. Build from non-worktree project (regression)

```bash
cd ~/source/repos/manta/context-forge
cf build --phase architecture --project context-forge   # forces non-worktree resolution
```

Actual output (excerpt):
```
**Before proceeding, determine the component name and base index:**
1. If the project's `fileArch` is already set, use that component name and index.
...
```
✅ Non-worktree path preserved. No worktree content appears.

#### 4. MCP path

Verified via unit tests (`context_build with worktree` suite in `packages/mcp-server/tests/contextTools.test.ts`). The `generateContextFromProject` spy confirms `worktreeId` is passed through correctly.

**Note on template design:** The original slice design specified nested `{{#if arch}}` inside `{{#if worktreeName}}`, but `TemplateProcessor` does not support nested conditionals (single-pass regex). The implementation uses a flat single `{{#if worktreeName}}...{{else}}...{{/if}}` block where the arch doc field renders as empty string when not set, with inline guidance for the agent.

## Implementation Notes

### File Changes
- **Modified:** `packages/core/src/types/context.ts` — add worktree fields to `ContextData`
- **Modified:** `packages/core/src/utils/worktree-overlay.ts` — carry worktree metadata
- **Modified:** `packages/core/src/services/ContextIntegrator.ts` — map worktree fields to `ContextData`
- **Modified:** `packages/core/src/services/TemplateProcessor.ts` — add worktree aliases
- **Modified:** `prompt.ai-project.system.md` (in ai-project-guide) — Phase 2 conditional block
- **Modified:** `packages/core/assets/prompt.ai-project.system.md` — sync bundled copy

### Testing Strategy
- Unit test `TemplateProcessor` with worktree variables present/absent
- Unit test `applyWorktreeOverlay` returns worktree metadata
- Unit test Phase 2 prompt rendering with/without worktree context
- Integration: `cf build` from worktree produces worktree-aware prompt
- Regression: `cf build` from non-worktree produces unchanged output

### Effort
2/5 — Three type/data changes, one template update, sync bundled asset. No new infrastructure.

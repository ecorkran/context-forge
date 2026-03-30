---
slice: worktree-aware-prompt-context
project: context-forge
lld: user/slices/189-slice.worktree-aware-prompt-context.md
dependencies: [185-worktree-aware-context-assembly]
projectState: Worktree system (180-band) complete. applyWorktreeOverlay maps workflow fields but not worktree identity. ContextIntegrator.mapProjectToEnhancedContext builds EnhancedContextData from ProjectData but has no worktreeId parameter. TemplateProcessor.createEnhancedData creates computed aliases but none for worktree metadata. Phase 2 prompt template has no worktree-aware conditional path.
dateCreated: 20260317
dateUpdated: 20260318
status: complete
docType: tasks
---

## Context Summary
- Working on slice 189: Worktree-Aware Prompt Context
- Problem: `cf build` from a worktree produces Phase 2 prompts with no worktree context — agent must discover index range and component name via MCP/filesystem
- Fix: inject worktree metadata (name, indexRange) into the template variable pipeline
- Data flow: `generateContextFromProject` receives worktreeId → `mapProjectToEnhancedContext` looks up worktree from `project.worktrees[]` → `TemplateProcessor` creates aliases → Phase 2 prompt uses `{{#if worktreeName}}` conditional
- No changes to worktree CRUD, storage, or MCP tool handlers

---

## Section 1: Extend ContextData Type and ContextIntegrator

- [x] **1.1 Add worktree fields to `ContextData`**
  - File: `packages/core/src/types/context.ts`
  - Add three optional fields to `ContextData` interface:
    - `worktreeName?: string` — e.g., "world-server"
    - `worktreeIndexStart?: number` — e.g., 300
    - `worktreeIndexEnd?: number` — e.g., 499
  - [x] Fields added to `ContextData` interface
  - [x] TypeScript compiles with no errors

- [x] **1.2 Thread worktreeId through `generateContextFromProject`**
  - File: `packages/core/src/services/ContextIntegrator.ts`
  - Add optional `worktreeId?: string` parameter to `generateContextFromProject(project, worktreeId?)`
  - Pass `worktreeId` through to `generateWithTemplateEngine(project, worktreeId)`
  - Pass `worktreeId` through to `mapProjectToEnhancedContext(project, worktreeId)`
  - In `mapProjectToEnhancedContext`, look up the worktree from `project.worktrees[]` by id and populate the three new fields on `EnhancedContextData`
  - [x] `generateContextFromProject` accepts optional `worktreeId`
  - [x] `mapProjectToEnhancedContext` populates `worktreeName`, `worktreeIndexStart`, `worktreeIndexEnd` when worktreeId is provided
  - [x] When worktreeId is not provided or worktree not found, fields are undefined (existing behavior)

- [x] **1.3 Pass worktreeId from CLI `build` command**
  - File: `packages/cli/src/commands/build.ts`
  - Pass `worktreeId` as second argument to `integrator.generateContextFromProject(workingCopy, worktreeId)`
  - The `worktreeId` is already resolved at line 36 (`const { id, worktreeId } = await resolveProjectWorktree(...)`)
  - [x] `worktreeId` passed through to `generateContextFromProject`

- [x] **1.4 Pass worktreeId from MCP `context_build` tool**
  - File: `packages/mcp-server/src/tools/contextTools.ts`
  - Check how `context_build` calls `generateContextFromProject` — pass the resolved worktreeId if available
  - [x] MCP `context_build` passes worktreeId when building from a worktree

- [x] **1.5 Unit tests for worktree data flow**
  - Add tests in `packages/core/tests/` verifying:
    - `mapProjectToEnhancedContext` with worktreeId populates worktree fields
    - `mapProjectToEnhancedContext` without worktreeId leaves worktree fields undefined
    - `generateContextFromProject` with worktreeId produces output containing worktree name
  - [x] Tests pass for worktreeId present case
  - [x] Tests pass for worktreeId absent case (regression)

**Commit:** `feat(core): thread worktreeId through context pipeline to template data`

---

## Section 2: Add Template Aliases in TemplateProcessor

- [x] **2.1 Add worktree aliases to `createEnhancedData`**
  - File: `packages/core/src/services/TemplateProcessor.ts`
  - In `createEnhancedData()`, add after the existing date aliases block:
    - If `data.worktreeName` is set: create `worktreeName` and `worktree-name` aliases
    - If `data.worktreeIndexStart` is defined: create `worktreeIndexStart`, `worktreeIndexEnd`, `worktreeRange` (formatted as `"start-end"`), and `worktree-range` aliases
  - [x] Aliases created when worktree fields present
  - [x] No aliases created when worktree fields absent

- [x] **2.2 Unit tests for worktree template aliases**
  - Add tests in `packages/core/tests/services/TemplateProcessor.test.ts`:
    - Template with `{worktreeName}` resolves when worktree data present
    - Template with `{worktreeRange}` resolves to `"300-499"` format
    - Template with `{{#if worktreeName}}` conditional works correctly
    - Template with worktree variables and no worktree data leaves conditionals in the `{{else}}` path
  - [x] All template alias tests pass

**Commit:** `feat(core): add worktree template aliases to TemplateProcessor`

---

## Section 3: Update Phase 2 Prompt Template

- [x] **3.1 Add worktree conditional to Phase 2 prompt**
  - File: `project-documents/ai-project-guide/project-guides/prompt.ai-project.system.md`
  - In the Architecture (Phase 2) section, wrap the existing "Before proceeding, determine the component name and base index" block in a `{{#if worktreeName}}` / `{{else}}` / `{{/if}}` conditional
  - The `{{#if worktreeName}}` branch should include:
    - Worktree name and index range identification
    - Base index for this component's architecture document
    - Conditional on `{{#if arch}}` to show "already set" vs "create one at index"
  - The `{{else}}` branch preserves the existing non-worktree instructions
  - Use the content from the slice design's "Prompt Template Changes (Phase 2)" section as a starting point
  - [x] Worktree conditional block added to Phase 2 section
  - [x] Non-worktree path preserved exactly as before
  - [x] Flat conditional used (nested `{{#if}}` not supported by TemplateProcessor); `{{arch}}` renders inline with guidance text

- [x] **3.2 Verify template syntax**
  - Ensure all `{{#if}}` blocks are properly closed
  - Ensure no existing template variables are broken
  - Run `TemplateProcessor.validateTemplate()` on the Phase 2 section content if possible
  - [x] Template syntax is valid (matched `{{#if}}` / `{{/if}}` pairs)

- [x] **3.3 Sync bundled prompt asset**
  - Copy updated `prompt.ai-project.system.md` from ai-project-guide to `packages/core/assets/prompt.ai-project.system.md`
  - Verify files are identical with `diff`
  - [x] Bundled asset matches source

**Commit:** `feat(core): add worktree-aware conditional to Phase 2 prompt template`

---

## Section 4: Build, Test, and Verify

- [x] **4.1 Run full core package tests**
  - Run `pnpm vitest run` from `packages/core/`
  - All tests must pass including new worktree-related tests
  - [x] All core tests pass

- [x] **4.2 Run full MCP server tests**
  - Run `pnpm vitest run` from `packages/mcp-server/`
  - [x] All MCP tests pass

- [x] **4.3 Run full CLI tests**
  - Run `pnpm vitest run` from `packages/cli/`
  - [x] All CLI tests pass

- [x] **4.4 Run full project build**
  - Run `npm run build` from project root
  - [x] Build completes successfully

**Commit:** (no separate commit — verification only)

---

## Section 5: Verification Walkthrough

Follow the verification walkthrough from the slice design. Update with actual results.

- [x] **5.1 Build from worktree with no arch doc**
  - Set up: navigate to a worktree directory, set phase to 2, ensure no arch is set
  - Run `cf build` and verify output contains worktree name and index range
  - Verify output contains "No architecture document exists yet" with correct index
  - [x] Worktree-aware prompt produced

- [x] **5.2 Build from worktree with arch doc set**
  - Set arch on the worktree (e.g., `cf set arch 300`)
  - Run `cf build` and verify output contains "Architecture document is already set"
  - [x] Arch-aware prompt produced

- [x] **5.3 Build from non-worktree project (regression)**
  - Navigate to a regular project (no worktrees)
  - Run `cf build --phase architecture`
  - Verify output matches existing Phase 2 behavior (no worktree content)
  - [x] No regression in non-worktree builds

- [x] **5.4 Update slice design verification walkthrough**
  - Update the Verification Walkthrough section of the slice design with actual results
  - [x] Walkthrough updated

**Commit:** `docs: update 189 slice design verification walkthrough with actual results`

---

## Section 6: Wrap-Up

- [x] **6.1 Update slice plan**
  - Check off slice 189 in `user/architecture/180-slices.initiative-context-worktree.md`
  - [x] Slice 189 entry marked `[x]`

- [x] **6.2 Update slice design status**
  - Set `status: complete` in `user/slices/189-slice.worktree-aware-prompt-context.md`
  - [x] Status is `complete`

- [x] **6.3 Update task file status**
  - Set `status: complete` in this file's frontmatter
  - [x] Status is `complete`

- [x] **6.4 Write DEVLOG entry**
  - Append entry to `DEVLOG.md` with slice 189 completion summary and commit hashes
  - [x] DEVLOG entry written

**Commit:** `docs: complete slice 189 worktree-aware prompt context`

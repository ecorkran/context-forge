---
docType: tasks
parent: user/slices/175-slice.context-output-consolidation.md
project: context-forge
sliceIndex: 175
sliceName: context-output-consolidation
dependencies: [161, 171]
status: complete
dateUpdated: 20260306
---

# Tasks: Context Output Consolidation & Template Variable Completion

## Context

The generated context prompt repeats project information three times with inconsistent field names and missing artifact references. This task set adds artifact fields (`fileArch`, `fileSlicePlan`, `fileHLD`, `fileSpec`) to the template variable pipeline, consolidates the project info section, simplifies the opening statement, and documents system prompt file changes for the ai-project-guide maintainer.

Changes are primarily in `packages/core`, with one CLI behavior fix in `packages/cli`.

## Tasks

### Task 1: Add artifact fields to ContextData types

- [x] Add optional fields to `ContextData` in `packages/core/src/types/context.ts`:
  - `fileArch?: string`
  - `fileSlicePlan?: string`
  - `fileHLD?: string`
  - `fileSpec?: string`
- [x] Verify `EnhancedContextData` inherits them via `extends` (no additional changes needed)
- [x] Fix any TypeScript compilation errors caused by the new fields (check all files that construct `ContextData` objects — test helpers, factories, etc.)

**Success:** `pnpm build` passes with the new fields. No runtime behavior change yet.

### Task 2: Map artifact fields in ContextIntegrator

- [x] In `packages/core/src/services/ContextIntegrator.ts`, update `mapProjectToEnhancedContext()`:
  - Add `fileArch: project.fileArch || ''`
  - Add `fileSlicePlan: project.fileSlicePlan || ''`
  - Add `fileHLD: project.fileHLD || ''`
  - Add `fileSpec: project.fileSpec || ''`
- [x] Update `mapProjectToContext()` (legacy mapper) with same fields
- [x] Update tests in `packages/core/tests/services/ContextIntegrator.test.ts`:
  - Verify artifact fields are mapped from ProjectData to context data
  - Verify empty strings when ProjectData fields are undefined

**Success:** `pnpm test --filter @context-forge/core` passes. Artifact fields flow from ProjectData to context data.

### Task 3: Add artifact variables and index extraction to TemplateProcessor

- [x] In `packages/core/src/services/TemplateProcessor.ts`, update `createEnhancedData()`:
  - Add artifact field aliases: `arch`, `plan`, `hld`, `spec` mapping to `data.fileArch`, `data.fileSlicePlan`, `data.fileHLD`, `data.fileSpec`
  - Parse `fileArch` to extract index (e.g., `160-arch.project-workflow-system` → `archIndex: '160'`). Use regex `/^(\d+)-/`. Set to empty string if no match.
  - Parse `fileSlicePlan` similarly → `planIndex`
  - Parse `fileHLD` similarly → `hldIndex`
- [x] Update tests in `packages/core/tests/services/TemplateProcessor.test.ts`:
  - Test `{fileArch}` and `{arch}` both resolve to the architecture file value
  - Test `{archIndex}` extracts the numeric prefix
  - Test `{fileSlicePlan}` and `{plan}` both resolve
  - Test `{planIndex}` extracts the numeric prefix
  - Test empty/undefined artifact fields produce empty string substitution (not leftover `{fileArch}`)

**Success:** Template variables `{fileArch}`, `{arch}`, `{archIndex}`, `{fileSlicePlan}`, `{plan}`, `{planIndex}`, `{fileHLD}`, `{hld}`, `{hldIndex}`, `{fileSpec}`, `{spec}` all substitute correctly. Tests pass.

### Task 4: Consolidate project info section in SectionBuilder

- [x] In `packages/core/src/services/SectionBuilder.ts`, rewrite `buildProjectInfoSection()`:
  - Change heading from `### Current Work Context` to `### Project Context`
  - Use key-value line format instead of JSON-like brackets: `Project: {name}`
  - Always include: `Project`, `Phase` (if set), `Date` (if set)
  - Always include: `Slice` (if set, show value; omit if empty), `Tasks` (same)
  - Conditionally include `Architecture` (only when `fileArch` is populated and non-empty)
  - Conditionally include `Slice Plan` (only when `fileSlicePlan` is populated and non-empty)
  - Conditionally include `HLD` (only when `fileHLD` is populated and non-empty)
  - Conditionally include `Spec` (only when `fileSpec` is populated and non-empty)
  - Remove `template` from output (drop the `data.template` line entirely)
  - Use schema field names as labels: `Slice` for `fileSlice`, `Tasks` for `fileTasks`, `Date` for `dateProject`
  - Remove the `currentDate` alias — use `dateProject` directly from data
- [x] Update tests in `packages/core/tests/services/SectionBuilder.test.ts`:
  - Test output includes `### Project Context` heading
  - Test output uses key-value format (no brackets, no commas)
  - Test `Architecture` and `Slice Plan` appear when populated
  - Test `Architecture` and `Slice Plan` are omitted when empty
  - Test `template` does not appear in output
  - Verify the method signature accepts `EnhancedContextData` with artifact fields

**Success:** `buildProjectInfoSection()` returns clean key-value block. No brackets, no template field, artifact fields shown when populated. Tests pass.

### Task 5: Simplify opening statement

- [x] In `packages/core/src/services/constants.ts`:
  - Add new `project-statement` entry to `DEFAULT_STATEMENTS` with content: `'Working on {{projectName}}. Project information, environment context, instructions, and notes follow:'`
  - Keep `start-project-statement` and `continue-project-statement` entries but change their content to match the new `project-statement` content (deprecated aliases for backward compatibility)
- [x] In `packages/core/src/services/ContextTemplateEngine.ts`, update `buildTemplate()`:
  - Change the `project-intro` section to use `'project-statement'` key instead of branching on `data.workType`
  - Remove the `const statementKey = data.workType === 'start' ? ... : ...` conditional
- [x] Update tests in `packages/core/tests/services/ContextTemplateEngine.test.ts`:
  - Test that `project-intro` section uses `project-statement` regardless of `workType`
  - Verify output starts with `Working on {name}` not `Starting work on` or `Continuing work on`

**Success:** Opening statement is always `Working on {name}...` regardless of workType. Tests pass.

### Task 6: Auto-set instruction when phase changes

Setting `developmentPhase` via `cf set phase 6` should also update `instruction` to match. Currently the user must set both fields independently, which leads to stale instruction values (e.g., phase is "Phase 6: Implementation" but instruction is still "slice-design").

- [x] In `packages/cli/src/commands/project.ts`, update `projectSetAction()`:
  - After resolving `developmentPhase` value, also write `instruction` to the same resolved value
  - Apply this only when the field being set is `developmentPhase` (not when setting `instruction` directly)
  - Log the auto-set: e.g., `Updated instruction = Phase 6: Implementation (auto-set from phase)`
- [x] In `packages/mcp-server/src/tools/projectTools.ts`, check if the same auto-set is needed in `project_update` tool:
  - If `developmentPhase` is in the update payload but `instruction` is not, auto-set `instruction` to match
  - If both are provided, respect the explicit `instruction` value
- [x] Add tests:
  - `cf set phase 6` sets both `developmentPhase` and `instruction` to `Phase 6: Implementation`
  - `cf set instruction slice-design` sets only `instruction`, does not touch `developmentPhase`
  - MCP `project_update` with only `developmentPhase` also updates `instruction`

**Success:** `cf set phase 6` updates both fields. `cf get` shows matching phase and instruction. Tests pass.

### Task 7: Build, full test suite, and verify output

- [x] Run `pnpm build` — all packages compile
- [x] Run `pnpm test` — all tests pass across core, CLI, MCP, Electron
- [x] Run `cf build` and verify:
  - Output starts with `Working on {name}...`
  - `### Project Context` block uses key-value format
  - `Architecture` and `Slice Plan` lines appear (assuming they're set on the active project)
  - No `template:` line in the project context block
  - No brackets or commas in the project context block
  - `context-initialization` prompt still renders (with template variables substituted, including artifact fields)
- [x] Verify `cf prompt get P4` and `cf prompt get P5` — confirm `{fileArch}` / `{fileSlicePlan}` / `{sliceindex}` substitutions work in phase prompts

- [x] Verify `cf set phase 6` auto-sets instruction, then `cf get` shows matching values

**Success:** Clean build, all tests pass, `cf build` output is visibly cleaner and shorter, phase prompt variables substitute correctly, phase auto-sets instruction.

### Task 8: Write system prompt file change spec

- [x] Create a markdown section in the slice design document (or a standalone spec note) documenting exactly what changes are needed in `prompt.ai-project.system.md`:
  - Remove repeated "Current work context" bullet list from `context-initialization` prompt
  - Remove "Key project documents" / resource structure block
  - Remove obsolete: "slice-based methodology" phrasing, decomposition hint, legacy HLD path note
  - Add `{fileArch}`, `{fileSlicePlan}` template variables where architecture/plan references are needed
  - Keep: role instructions, granularity guidance, task-focus instructions
- [x] Verify the spec is already captured in the slice design (Change 7 section) — if so, mark this task as confirming it is complete and accurate

**Success:** Spec is documented and ready to hand off to the ai-project-guide maintainer.

### Task 9: Commit and mark slice complete

- [x] Git add and commit all changes from root with semantic message
- [x] Update slice design status to `complete`
- [x] Check off slice 175 in `160-slices.project-workflow-system.md`

---
slice: context-profile-aware-assembly-update
project: context-forge
lld: user/slices/176-slice.context-profile-aware-assembly-update.md
dependencies:
  - 161-schema-standardization
  - 175-context-output-consolidation
projectState: Slice 175 complete. All artifact fields (fileArch, fileSlicePlan, fileHLD, fileSpec) wired through pipeline. Schema field ordering updated (spec→hld→arch→plan→slice→tasks). Ready for profile-aware filtering.
dateCreated: 20260308
dateUpdated: 20260308
status: complete
---

## Context Summary

- Implementing context-profile-aware assembly for context-forge
- Adds `fileConcept` as a new artifact field to `ProjectData` and the full pipeline
- Adds `ContextProfileParser` service: parses YAML profiles block from bundled prompt asset
- Profiles declare which artifact variables each instruction type uses
- `ContextIntegrator` filters out non-profile artifact fields (sets to `''`) before template rendering
- `cf build` gets `--instruction-type` / `--it` flag; `context_build` MCP tool gets `instructionType` param
- No breaking changes: all new parameters are optional; missing profile block → full variable set (safe fallback)
- Next slice: TBD (per slice plan)

---

## Tasks

### T1: Add `fileConcept` to type definitions
- [x] Add `fileConcept?: string` to `ProjectData` in `packages/core/src/types/project.ts`
  - [x] Field added as optional, after `fileSpec` and before `customData`
  - [x] Add `fileConcept` to `UpdateProjectData` `Pick` type
- [x] Add `fileConcept?: string` to `ContextData` in `packages/core/src/types/context.ts`
  - [x] Field is optional, consistent with other artifact fields
- [x] Build passes with no TypeScript errors: `pnpm --filter @context-forge/core build`

### T2: Add `fileConcept` to projectSchema
- [x] Add field definition to `PROJECT_FIELDS` in `packages/core/src/schema/projectSchema.ts`
  - [x] Positioned after `fileHLD`, before `fileArch` (methodology order: spec→hld→**concept**→arch→plan→slice→tasks)
  - [x] Definition: `{ field: 'fileConcept', type: 'string', required: false, readonly: false, group: 'artifacts', description: 'Concept document path (relative)', aliases: ['concept'], label: 'Concept' }`
- [x] `FIELD_ALIASES` auto-includes `concept → fileConcept` (derived from `PROJECT_FIELDS` — no manual change needed)
- [x] `cf project --schema` output lists `fileConcept` in artifacts group

### T3: Wire `fileConcept` through ContextIntegrator and TemplateProcessor
- [x] Map `fileConcept` in `ContextIntegrator.mapProjectToEnhancedContext()` (`packages/core/src/services/ContextIntegrator.ts`)
  - [x] `fileConcept: project.fileConcept || ''`
- [x] Map `fileConcept` in `ContextIntegrator.mapProjectToContext()` (legacy path)
  - [x] `fileConcept: project.fileConcept || ''`
- [x] Add `concept` alias in `TemplateProcessor.createEnhancedData()` (`packages/core/src/services/TemplateProcessor.ts`)
  - [x] `if (data.fileConcept) { enhanced['concept'] = data.fileConcept; }`
- [x] Build passes: `pnpm --filter @context-forge/core build`

### T4: Add `fileConcept` to MCP `project_update` tool
- [x] Add `fileConcept` as optional string to `project_update` input schema in `packages/mcp-server/src/tools/projectTools.ts`
  - [x] Follow pattern of existing artifact fields (`fileArch`, `fileSlicePlan`, etc.)
- [x] Build passes: `pnpm --filter @context-forge/mcp-server build`

### T5: Add context-profiles YAML block to prompt asset file
- [x] Add YAML block to `packages/core/assets/prompt.ai-project.system.md`
  - [x] Block placed before the first `##### ` heading in the file
  - [x] Fence annotation: `` ```yaml type: context-profiles ``
  - [x] Block contains all profiles from the slice design: `implementation`, `task-breakdown`, `slice-design`, `slice-planning`, `architecture`, `concept`, `maintenance`, `analysis-processing`, `integration`, `_default`
  - [x] Each profile lists its `variables` array exactly as specified in the slice design
- [x] File is valid markdown; no heading or frontmatter structure broken

### T6: Implement `ContextProfileParser` service
- [x] Create `packages/core/src/services/ContextProfileParser.ts`
  - [x] `parseProfiles(fileContent: string): ProfileMap` — finds the `context-profiles` fence, extracts content, parses inline YAML
  - [x] `getProfileForInstruction(instruction: string, profiles: ProfileMap): string[]` — normalizes instruction to kebab-case, looks up profile, falls back to `_default`
  - [x] `ProfileMap` type: `Record<string, { variables: string[] }>`
  - [x] Instruction normalization handles: phase strings ("Phase 6: Implementation" → `implementation`), short names, special phases ("Maintenance Task" → `maintenance`, "Perform Routine Maintenance" → `maintenance`, "Analysis Processing" → `analysis-processing`)
  - [x] If profiles block is absent or unparseable: `parseProfiles` returns `{}` (empty map → caller skips filtering)
  - [x] No new dependencies — inline YAML parser only (profiles block is flat key+list structure)
- [x] Export `ContextProfileParser` from `packages/core/src/index.ts` (or `node.ts` as appropriate)
- [x] Build passes

### T7: Unit tests for `ContextProfileParser`
- [x] Create `packages/core/tests/services/ContextProfileParser.test.ts`
  - [x] `parseProfiles` correctly parses the profiles YAML block from a sample file string
  - [x] `parseProfiles` returns `{}` when block is absent
  - [x] `parseProfiles` returns `{}` when block is malformed
  - [x] `getProfileForInstruction('Phase 6: Implementation', profiles)` → `['fileSlicePlan', 'fileSlice', 'fileTasks']`
  - [x] `getProfileForInstruction('implementation', profiles)` → same result (short-name passthrough)
  - [x] `getProfileForInstruction('Maintenance Task', profiles)` → `['fileTasks']`
  - [x] `getProfileForInstruction('Perform Routine Maintenance', profiles)` → `['fileTasks']`
  - [x] `getProfileForInstruction('Analysis Processing', profiles)` → `['fileSlice', 'fileTasks']`
  - [x] `getProfileForInstruction('unknown-type', profiles)` → `_default` variable list
  - [x] All tests pass: `pnpm --filter @context-forge/core test`

### T8: Profile filtering in `ContextIntegrator`
- [x] Modify `mapProjectToEnhancedContext()` in `packages/core/src/services/ContextIntegrator.ts`
  - [x] After building full enhanced context, load profiles from prompt file (same resolved path used for `updateServicePaths`)
  - [x] Call `ContextProfileParser.parseProfiles(fileContent)` (lazy-load, cache in instance variable)
  - [x] If profiles map is non-empty: get allowed vars for `project.instruction` via `getProfileForInstruction`
  - [x] Zero out artifact fields not in allowed vars: `enhancedData[field] = ''` for each of `['fileArch', 'fileSlicePlan', 'fileHLD', 'fileSpec', 'fileSlice', 'fileTasks', 'fileConcept']` not in allowedVars
  - [x] Non-artifact fields (`recentEvents`, `additionalNotes`, `availableTools`, `mcpServers`, metadata) are never zeroed
  - [x] If profiles map is empty (block absent/parse failure): skip filtering entirely — full variable set used
  - [x] Prompt file path resolved from `project.projectPath` using existing `PROMPT_FILE_RELATIVE_PATH` constant; if local file absent, fall back to bundled asset path
- [x] Build passes: `pnpm --filter @context-forge/core build`

### T9: Tests for profile filtering in `ContextIntegrator`
- [x] Add tests to `packages/core/tests/services/ContextIntegrator.test.ts`
  - [x] When instruction = `'Maintenance Task'` and profiles loaded: only `fileTasks` present in enhanced data artifact fields; `fileArch`, `fileSlicePlan` are `''`
  - [x] When instruction = `'Phase 6: Implementation'` and profiles loaded: `fileSlicePlan`, `fileSlice`, `fileTasks` are non-empty if set on project; `fileArch` is `''`
  - [x] When profiles block is absent: all artifact fields pass through unchanged
  - [x] Non-artifact fields (`recentEvents`, `additionalNotes`) unaffected regardless of profile
- [x] All tests pass: `pnpm --filter @context-forge/core test`

### T10: Add `--instruction-type` flag to `cf build`
- [x] Modify `packages/cli/src/commands/build.ts`
  - [x] Add `instructionType?: string` to `BuildOpts` interface
  - [x] Register `--instruction-type <type>` option with alias `--it`
  - [x] When `opts.instructionType` is provided: set `workingCopy.instruction = opts.instructionType` (override without writing to store)
  - [x] Does not override `developmentPhase`; only `instruction` field is touched
- [x] `cf build --instruction-type maintenance` uses `maintenance` instruction for profile lookup
- [x] `cf build --it maintenance` is equivalent
- [x] Build passes: `pnpm --filter @context-forge/cli build`

### T11: Tests for `cf build --instruction-type`
- [x] Add test to `packages/cli/tests/commands/build.test.ts`
  - [x] `--instruction-type maintenance` sets `instruction` to `maintenance` on working copy
  - [x] `--it implementation` sets `instruction` to `implementation`
  - [x] `--instruction-type` does not mutate stored project (verify store `update` not called)
- [x] All tests pass: `pnpm --filter @context-forge/cli test`

### T12: Add `instructionType` parameter to `context_build` MCP tool
- [x] Modify `packages/mcp-server/src/tools/contextTools.ts`
  - [x] Locate `context_build` tool registration; add `instructionType: z.string().optional()` to input schema
  - [x] When `instructionType` provided: pass as override to `generateContext()` via `overrides: { instruction: instructionType }`
  - [x] Does not write to store; override is ephemeral for this call only
- [x] Build passes: `pnpm --filter @context-forge/mcp-server build`

### T13: Tests for `context_build` `instructionType` parameter
- [x] Add tests to `packages/mcp-server/tests/contextTools.test.ts`
  - [x] `instructionType: 'maintenance'` passes `instruction: 'maintenance'` as override
  - [x] Omitting `instructionType` passes no instruction override (project's stored value used)
- [x] All tests pass: `pnpm --filter @context-forge/mcp-server test`

### T14: Full build and test validation pass
- [x] Run full build: `pnpm build` — all packages compile without error
- [x] Run full test suite: `pnpm test` — all tests pass
- [x] Manual smoke test: `cf set instruction "Maintenance Task" && cf build` — output contains only `fileTasks` artifact (no arch/slice-plan lines in project context block)
- [x] Manual smoke test: `cf build --instruction-type implementation` — output includes `fileSlicePlan`, `fileSlice`, `fileTasks`
- [x] Commit with message: `feat(core): add context-profile-aware assembly and fileConcept field`
- [x] Update DEVLOG with entry for this slice

### T15: Update slice and slice plan checklist
- [x] Mark success criteria in `user/slices/176-slice.context-profile-aware-assembly-update.md` as complete
- [x] Mark slice entry in `user/architecture/160-slices.project-workflow-system.md` as complete (update status)
- [x] Update this task file status to `complete`

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
status: not_started
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
- [ ] Add `fileConcept?: string` to `ProjectData` in `packages/core/src/types/project.ts`
  - [ ] Field added as optional, after `fileSpec` and before `customData`
  - [ ] Add `fileConcept` to `UpdateProjectData` `Pick` type
- [ ] Add `fileConcept?: string` to `ContextData` in `packages/core/src/types/context.ts`
  - [ ] Field is optional, consistent with other artifact fields
- [ ] Build passes with no TypeScript errors: `pnpm --filter @context-forge/core build`

### T2: Add `fileConcept` to projectSchema
- [ ] Add field definition to `PROJECT_FIELDS` in `packages/core/src/schema/projectSchema.ts`
  - [ ] Positioned after `fileHLD`, before `fileArch` (methodology order: spec→hld→**concept**→arch→plan→slice→tasks)
  - [ ] Definition: `{ field: 'fileConcept', type: 'string', required: false, readonly: false, group: 'artifacts', description: 'Concept document path (relative)', aliases: ['concept'], label: 'Concept' }`
- [ ] `FIELD_ALIASES` auto-includes `concept → fileConcept` (derived from `PROJECT_FIELDS` — no manual change needed)
- [ ] `cf project --schema` output lists `fileConcept` in artifacts group

### T3: Wire `fileConcept` through ContextIntegrator and TemplateProcessor
- [ ] Map `fileConcept` in `ContextIntegrator.mapProjectToEnhancedContext()` (`packages/core/src/services/ContextIntegrator.ts`)
  - [ ] `fileConcept: project.fileConcept || ''`
- [ ] Map `fileConcept` in `ContextIntegrator.mapProjectToContext()` (legacy path)
  - [ ] `fileConcept: project.fileConcept || ''`
- [ ] Add `concept` alias in `TemplateProcessor.createEnhancedData()` (`packages/core/src/services/TemplateProcessor.ts`)
  - [ ] `if (data.fileConcept) { enhanced['concept'] = data.fileConcept; }`
- [ ] Build passes: `pnpm --filter @context-forge/core build`

### T4: Add `fileConcept` to MCP `project_update` tool
- [ ] Add `fileConcept` as optional string to `project_update` input schema in `packages/mcp-server/src/tools/projectTools.ts`
  - [ ] Follow pattern of existing artifact fields (`fileArch`, `fileSlicePlan`, etc.)
- [ ] Build passes: `pnpm --filter @context-forge/mcp-server build`

### T5: Add context-profiles YAML block to prompt asset file
- [ ] Add YAML block to `packages/core/assets/prompt.ai-project.system.md`
  - [ ] Block placed before the first `##### ` heading in the file
  - [ ] Fence annotation: `` ```yaml type: context-profiles ``
  - [ ] Block contains all profiles from the slice design: `implementation`, `task-breakdown`, `slice-design`, `slice-planning`, `architecture`, `concept`, `maintenance`, `analysis-processing`, `integration`, `_default`
  - [ ] Each profile lists its `variables` array exactly as specified in the slice design
- [ ] File is valid markdown; no heading or frontmatter structure broken

### T6: Implement `ContextProfileParser` service
- [ ] Create `packages/core/src/services/ContextProfileParser.ts`
  - [ ] `parseProfiles(fileContent: string): ProfileMap` — finds the `context-profiles` fence, extracts content, parses inline YAML
  - [ ] `getProfileForInstruction(instruction: string, profiles: ProfileMap): string[]` — normalizes instruction to kebab-case, looks up profile, falls back to `_default`
  - [ ] `ProfileMap` type: `Record<string, { variables: string[] }>`
  - [ ] Instruction normalization handles: phase strings ("Phase 6: Implementation" → `implementation`), short names, special phases ("Maintenance Task" → `maintenance`, "Perform Routine Maintenance" → `maintenance`, "Analysis Processing" → `analysis-processing`)
  - [ ] If profiles block is absent or unparseable: `parseProfiles` returns `{}` (empty map → caller skips filtering)
  - [ ] No new dependencies — inline YAML parser only (profiles block is flat key+list structure)
- [ ] Export `ContextProfileParser` from `packages/core/src/index.ts` (or `node.ts` as appropriate)
- [ ] Build passes

### T7: Unit tests for `ContextProfileParser`
- [ ] Create `packages/core/tests/services/ContextProfileParser.test.ts`
  - [ ] `parseProfiles` correctly parses the profiles YAML block from a sample file string
  - [ ] `parseProfiles` returns `{}` when block is absent
  - [ ] `parseProfiles` returns `{}` when block is malformed
  - [ ] `getProfileForInstruction('Phase 6: Implementation', profiles)` → `['fileSlicePlan', 'fileSlice', 'fileTasks']`
  - [ ] `getProfileForInstruction('implementation', profiles)` → same result (short-name passthrough)
  - [ ] `getProfileForInstruction('Maintenance Task', profiles)` → `['fileTasks']`
  - [ ] `getProfileForInstruction('Perform Routine Maintenance', profiles)` → `['fileTasks']`
  - [ ] `getProfileForInstruction('Analysis Processing', profiles)` → `['fileSlice', 'fileTasks']`
  - [ ] `getProfileForInstruction('unknown-type', profiles)` → `_default` variable list
  - [ ] All tests pass: `pnpm --filter @context-forge/core test`

### T8: Profile filtering in `ContextIntegrator`
- [ ] Modify `mapProjectToEnhancedContext()` in `packages/core/src/services/ContextIntegrator.ts`
  - [ ] After building full enhanced context, load profiles from prompt file (same resolved path used for `updateServicePaths`)
  - [ ] Call `ContextProfileParser.parseProfiles(fileContent)` (lazy-load, cache in instance variable)
  - [ ] If profiles map is non-empty: get allowed vars for `project.instruction` via `getProfileForInstruction`
  - [ ] Zero out artifact fields not in allowed vars: `enhancedData[field] = ''` for each of `['fileArch', 'fileSlicePlan', 'fileHLD', 'fileSpec', 'fileSlice', 'fileTasks', 'fileConcept']` not in allowedVars
  - [ ] Non-artifact fields (`recentEvents`, `additionalNotes`, `availableTools`, `mcpServers`, metadata) are never zeroed
  - [ ] If profiles map is empty (block absent/parse failure): skip filtering entirely — full variable set used
  - [ ] Prompt file path resolved from `project.projectPath` using existing `PROMPT_FILE_RELATIVE_PATH` constant; if local file absent, fall back to bundled asset path
- [ ] Build passes: `pnpm --filter @context-forge/core build`

### T9: Tests for profile filtering in `ContextIntegrator`
- [ ] Add tests to `packages/core/tests/services/ContextIntegrator.test.ts`
  - [ ] When instruction = `'Maintenance Task'` and profiles loaded: only `fileTasks` present in enhanced data artifact fields; `fileArch`, `fileSlicePlan` are `''`
  - [ ] When instruction = `'Phase 6: Implementation'` and profiles loaded: `fileSlicePlan`, `fileSlice`, `fileTasks` are non-empty if set on project; `fileArch` is `''`
  - [ ] When profiles block is absent: all artifact fields pass through unchanged
  - [ ] Non-artifact fields (`recentEvents`, `additionalNotes`) unaffected regardless of profile
- [ ] All tests pass: `pnpm --filter @context-forge/core test`

### T10: Add `--instruction-type` flag to `cf build`
- [ ] Modify `packages/cli/src/commands/build.ts`
  - [ ] Add `instructionType?: string` to `BuildOpts` interface
  - [ ] Register `--instruction-type <type>` option with alias `--it`
  - [ ] When `opts.instructionType` is provided: set `workingCopy.instruction = opts.instructionType` (override without writing to store)
  - [ ] Does not override `developmentPhase`; only `instruction` field is touched
- [ ] `cf build --instruction-type maintenance` uses `maintenance` instruction for profile lookup
- [ ] `cf build --it maintenance` is equivalent
- [ ] Build passes: `pnpm --filter @context-forge/cli build`

### T11: Tests for `cf build --instruction-type`
- [ ] Add test to `packages/cli/tests/commands/build.test.ts`
  - [ ] `--instruction-type maintenance` sets `instruction` to `maintenance` on working copy
  - [ ] `--it implementation` sets `instruction` to `implementation`
  - [ ] `--instruction-type` does not mutate stored project (verify store `update` not called)
- [ ] All tests pass: `pnpm --filter @context-forge/cli test`

### T12: Add `instructionType` parameter to `context_build` MCP tool
- [ ] Modify `packages/mcp-server/src/tools/contextTools.ts`
  - [ ] Locate `context_build` tool registration; add `instructionType: z.string().optional()` to input schema
  - [ ] When `instructionType` provided: pass as override to `generateContext()` via `overrides: { instruction: instructionType }`
  - [ ] Does not write to store; override is ephemeral for this call only
- [ ] Build passes: `pnpm --filter @context-forge/mcp-server build`

### T13: Tests for `context_build` `instructionType` parameter
- [ ] Add tests to `packages/mcp-server/tests/contextTools.test.ts`
  - [ ] `instructionType: 'maintenance'` passes `instruction: 'maintenance'` as override
  - [ ] Omitting `instructionType` passes no instruction override (project's stored value used)
- [ ] All tests pass: `pnpm --filter @context-forge/mcp-server test`

### T14: Full build and test validation pass
- [ ] Run full build: `pnpm build` — all packages compile without error
- [ ] Run full test suite: `pnpm test` — all tests pass
- [ ] Manual smoke test: `cf set instruction "Maintenance Task" && cf build` — output contains only `fileTasks` artifact (no arch/slice-plan lines in project context block)
- [ ] Manual smoke test: `cf build --instruction-type implementation` — output includes `fileSlicePlan`, `fileSlice`, `fileTasks`
- [ ] Commit with message: `feat(core): add context-profile-aware assembly and fileConcept field`
- [ ] Update DEVLOG with entry for this slice

### T15: Update slice and slice plan checklist
- [ ] Mark success criteria in `user/slices/176-slice.context-profile-aware-assembly-update.md` as complete
- [ ] Mark slice entry in `user/architecture/160-slices.project-workflow-system.md` as complete (update status)
- [ ] Update this task file status to `complete`

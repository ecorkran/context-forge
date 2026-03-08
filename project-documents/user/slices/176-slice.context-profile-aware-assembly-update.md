---
docType: slice-design
parent: user/architecture/160-slices.project-workflow-system.md
project: context-forge
sliceIndex: 176
sliceName: context-profile-aware-assembly-update
dateCreated: 20260308
dateUpdated: 20260308
status: complete
dependencies:
  - 161-schema-standardization
  - 175-context-output-consolidation
---

# Slice 176: Context-Profile-Aware Assembly — Update

## Overview

`cf build` and `context_build` currently inject the same document variables for every instruction type. A maintenance task gets the full arch doc + slice plan; an implementation run gets them too even if the agent won't use them. This slice adds *context profiles* — per-instruction-type declarations of which document variables to include — and filters the assembled output accordingly. It also adds `fileConcept` as a new `ProjectData` field so concept documents become first-class template variables.

Context profiles are declared in the bundled prompt asset file (`packages/core/assets/prompt.ai-project.system.md`) as a YAML block, parsed at runtime. Adding or removing a profile requires only a prompt-file edit — no code change.

## Problem

Slice 175 consolidated project info and wired all artifact fields as template variables. Every `cf build` call now populates `fileArch`, `fileSlicePlan`, `fileHLD`, `fileSpec`, `fileSlice`, and `fileTasks` and injects them into the assembled context regardless of which instruction type is active.

For a **Maintenance Task** or **Perform Routine Maintenance** instruction, injecting arch/slice plan context actively misdirects agents — they frame maintenance work as architectural or slice-level work. For **Analysis Processing**, the arch doc is similarly irrelevant. For **Concept Creation**, the spec and slice fields are noise.

The inverse is also true: a concept instruction could benefit from `fileConcept` (the concept document itself), which currently has no field in `ProjectData`.

## Scope

**In this slice:**
- `fileConcept` field added to `ProjectData` schema and wired through the pipeline
- Context profiles table defined in the prompt asset file (YAML block)
- Runtime parser reads profiles from the asset file
- `ContextIntegrator.mapProjectToEnhancedContext()` filters variables to active profile
- `cf build --instruction-type <type>` flag respected for profile lookup
- `context_build` MCP tool respects profile filtering
- Tests for profile parsing and filtering

**Out of scope:**
- Modifying the system prompt file in the `ai-project-guide` repo (separate deliverable)
- Changing the profile definition format from YAML (YAML is sufficient; consider structured data only if parsing proves fragile)
- Auto-detecting the "best" instruction type — that's a Workflow Navigator concern
- Profile inheritance or extension

## Design

### 1. `fileConcept` Field

Add to `ProjectData` and the type/schema pipeline:

```
fileConcept?: string;   // relative path to concept document, e.g. "user/project-guides/001-concept.my-project.md"
```

**Files to change:**
- `packages/core/src/types/project.ts` — add `fileConcept?`
- `packages/core/src/types/context.ts` — add `fileConcept?` to `ContextData`
- `packages/core/src/schema/projectSchema.ts` — add field definition (`group: 'artifacts'`, alias `concept`)
- `packages/core/src/services/ContextIntegrator.ts` — map `project.fileConcept` in both context mappers
- `packages/core/src/services/TemplateProcessor.ts` — add `concept` alias → `fileConcept`
- `packages/core/src/storage/FileProjectStore.ts` — migration: strip stale field if present (not needed since it's new — just ensure read handles `undefined`)
- `packages/mcp-server/src/tools/projectTools.ts` — add `fileConcept` to `project_update` input schema

Schema migration: `fileConcept` is optional with no stored default; existing projects load fine without it.

### 2. Context Profiles Table in Prompt Asset File

A YAML code block at the top of `packages/core/assets/prompt.ai-project.system.md`, parsed by `ContextProfileParser`. The block is fenced as `yaml type: context-profiles` so the parser can locate it without scanning all headings.

```yaml
context-profiles:
  implementation:
    variables: [fileSlicePlan, fileSlice, fileTasks]
  task-breakdown:
    variables: [fileSlicePlan, fileSlice, fileTasks]
  slice-design:
    variables: [fileArch, fileSlicePlan]
  slice-planning:
    variables: [fileArch, fileHLD, fileSpec]
  architecture:
    variables: [fileHLD, fileSpec]
  concept:
    variables: [fileConcept, fileSpec]
  maintenance:
    variables: [fileTasks]
  analysis-processing:
    variables: [fileSlice, fileTasks]
  integration:
    variables: [fileSlicePlan, fileSlice, fileTasks]
  _default:
    variables: [fileArch, fileSlicePlan, fileSlice, fileTasks]
```

The `_default` profile is used when the active instruction type has no explicit profile entry. All matched variables are included; unmatched artifact fields are set to empty string `''` in the context map so template conditionals (`{{#if fileArch}}`) evaluate to false.

### 3. ContextProfileParser

New file: `packages/core/src/services/ContextProfileParser.ts`

```
class ContextProfileParser {
  parseProfiles(fileContent: string): ProfileMap
  getProfileForInstruction(instruction: string, profiles: ProfileMap): string[]
}

type ProfileMap = Record<string, { variables: string[] }>
```

- `parseProfiles()` finds the `context-profiles` YAML block by scanning for the fence `` ```yaml type: context-profiles ``, extracts content between opening and closing fences, and parses with `smol-toml` or a lightweight inline YAML parser (since TOML and YAML are different — use a small inline key: value parser rather than importing a new dependency).
- `getProfileForInstruction()` normalises the instruction string to kebab-case and looks up the profile. Falls back to `_default` if not found.

**Instruction normalisation** (reuses existing `PHASE_MAP` logic):
- "Phase 6: Implementation" → `implementation`
- "Maintenance Task" → `maintenance`
- "Perform Routine Maintenance" → `maintenance`
- "Analysis Processing" → `analysis-processing`
- Numbers / P-shortcuts map through PHASE_MAP first

### 4. Profile Filtering in ContextIntegrator

`mapProjectToEnhancedContext()` receives the active instruction (already available as `project.instruction`) and the parsed profiles. Variables not in the active profile are zeroed:

```
// After building full enhanced context map:
const allowedVars = profileParser.getProfileForInstruction(project.instruction, profiles);
const artifactFields = ['fileArch', 'fileSlicePlan', 'fileHLD', 'fileSpec', 'fileSlice', 'fileTasks', 'fileConcept'];
for (const field of artifactFields) {
  if (!allowedVars.includes(field)) {
    enhancedData[field] = '';   // template conditionals evaluate to false
  }
}
```

This does **not** affect `recentEvents`, `additionalNotes`, `availableTools`, `mcpServers`, or metadata fields — only the document artifact variables.

`ContextIntegrator` loads profiles lazily on first call (cached). If the prompt file is missing or the profiles block is absent, filtering is skipped (full variable set used — safe fallback).

### 5. `cf build --instruction-type` flag

**File:** `packages/cli/src/commands/build.ts`

Add `--instruction-type <type>` option (alias `--it`). When provided, overrides `project.instruction` for the context assembly call without writing to the store. This allows "what would a maintenance context look like?" queries without mutating the project.

If not provided, behaviour is unchanged — uses `project.instruction`.

### 6. `context_build` MCP Tool — `instructionType` Parameter

**File:** `packages/mcp-server/src/tools/contextTools.ts`

Add optional `instructionType` string parameter to `context_build` input schema. When provided, it overrides `project.instruction` for this call only. Same semantics as the CLI flag.

### 7. Profile File Location

Profiles are parsed from the same resolved prompt file path that `SystemPromptParser` uses:
- Local install: `{projectPath}/project-documents/ai-project-guide/prompt.ai-project.system.md`
- Bundled fallback: `packages/core/assets/prompt.ai-project.system.md`

`ContextProfileParser` receives the same resolved path used by `SystemPromptParser`. This shares the resolution logic already in `ContextIntegrator.generateWithTemplateEngine()`.

## Data Flow

```
ProjectData (instruction field)
    |
    v
ContextProfileParser.parseProfiles(promptFilePath)  -- reads profiles from YAML block
    |
    v
ProfileMap  -- { instruction-key: { variables: [...] } }
    |
    v
ContextIntegrator.mapProjectToEnhancedContext()
  -- builds full EnhancedContextData (all fields populated from project)
  -- getProfileForInstruction(instruction) → allowedVars
  -- zero out artifact fields not in allowedVars
    |
    v
EnhancedContextData  -- filtered: inactive artifact fields = ''
    |
    v
TemplateProcessor / SectionBuilder / ContextTemplateEngine
  -- template conditionals work correctly (empty string = falsy)
    |
    v
Generated context output  -- only profile-relevant documents injected
```

## Files Changed

| File | Change |
|------|--------|
| `packages/core/src/types/project.ts` | Add `fileConcept?` field |
| `packages/core/src/types/context.ts` | Add `fileConcept?` to `ContextData` |
| `packages/core/src/schema/projectSchema.ts` | Add `fileConcept` field definition (artifacts group) |
| `packages/core/src/services/ContextIntegrator.ts` | Map `fileConcept`; load profiles; filter artifact fields |
| `packages/core/src/services/TemplateProcessor.ts` | Add `concept` alias for `fileConcept` |
| `packages/core/src/services/ContextProfileParser.ts` | **NEW** — profile parsing and instruction lookup |
| `packages/core/assets/prompt.ai-project.system.md` | Add `context-profiles` YAML block |
| `packages/mcp-server/src/tools/projectTools.ts` | Add `fileConcept` to `project_update` schema |
| `packages/mcp-server/src/tools/contextTools.ts` | Add `instructionType` parameter to `context_build` |
| `packages/cli/src/commands/build.ts` | Add `--instruction-type` / `--it` flag |
| `packages/core/tests/services/ContextProfileParser.test.ts` | **NEW** — unit tests for parsing and lookup |
| `packages/core/tests/services/ContextIntegrator.test.ts` | Add profile filtering tests |
| `packages/mcp-server/tests/contextTools.test.ts` | Add `instructionType` parameter tests |
| `packages/cli/tests/commands/build.test.ts` | Add `--instruction-type` flag tests |

## YAML Block Format Details

The profiles block must appear before the first `##### ` heading so the parser can find it without ambiguity. Placement in the YAML frontmatter is not suitable (frontmatter parsers expect flat key-value pairs). The block is a standard markdown code fence with a type annotation:

````
```yaml type: context-profiles
context-profiles:
  implementation:
    variables: [fileSlicePlan, fileSlice, fileTasks]
  ...
  _default:
    variables: [fileArch, fileSlicePlan, fileSlice, fileTasks]
```
````

Parser locates the block by searching for the literal string ` ```yaml type: context-profiles` — simple and unambiguous.

**Inline YAML parsing approach:** The profiles block contains only string lists under string keys — no nested maps, no anchors, no multiline values. A purpose-built parser (20–30 lines) is simpler and faster than importing a full YAML parser. Pattern: match `  key:` lines and `    - value` or `    variables: [...]` lines.

## Cross-Slice Dependencies

- **Depends on:** 161 (schema standardization — complete), 175 (context output consolidation — complete)
- **No breaking changes** to MCP tools or CLI. The `instructionType` / `--instruction-type` parameters are additive.
- **Note:** The profiles block in the bundled asset file is new content; the `ai-project-guide` maintainer should replicate it in the installed guide when updating.

## Success Criteria

- [x] `fileConcept` field exists in `ProjectData`, settable via `cf set concept {path}` / `project_update`, available as `{fileConcept}` and `{concept}` template variables
- [x] Schema migration: existing projects load without error; `fileConcept` defaults to `undefined`
- [x] Context profiles YAML block present in `packages/core/assets/prompt.ai-project.system.md`
- [x] `ContextProfileParser` correctly parses the profiles block and resolves instruction strings to variable lists
- [x] `cf build` with instruction = "Maintenance Task" produces context with only `fileTasks` in artifact section (no arch doc, no slice plan)
- [x] `cf build` with instruction = "Phase 6: Implementation" produces context with `fileSlicePlan`, `fileSlice`, `fileTasks`
- [x] `cf build --instruction-type maintenance` overrides without writing to store
- [x] `context_build` with `instructionType: "maintenance"` parameter produces filtered output
- [x] Variables not in active profile are absent from generated context (not empty lines)
- [x] Profile lookup falls back to `_default` for unknown instruction types
- [x] If profile block is absent/unparseable, full variable set is used (no crash)
- [x] All existing tests pass with updates

## Out of Scope

- Modifying installed `ai-project-guide/prompt.ai-project.system.md` (that's a guide repo task)
- Profile inheritance or per-project profile overrides
- Exposing profiles as an MCP tool / `cf profiles list` command
- Changing profile syntax to TOML (YAML is sufficient for the simple structure needed)

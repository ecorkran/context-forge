---
docType: tasks
slice: mcp-server-context-tools
project: context-forge
lldRef: user/slices/146-slice.mcp-context-tools.md
dependencies: [mcp-server-project-tools, core-orchestration-extraction]
projectState: Slice 145 complete — MCP server operational with 3 project tools (project_list, project_get, project_update). Core orchestration pipeline fully extracted to @context-forge/core. ContextIntegrator.generateContextFromProject() is the primary API. createContextPipeline() factory available from @context-forge/core/node.
dateCreated: 20260220
dateUpdated: 20260220
status: complete
---

# Tasks: Slice 146 — MCP Server — Context Tools

## Context

Implement four MCP tools (`context_build`, `template_preview`, `prompt_list`, `prompt_get`) in `packages/mcp-server` that wrap the core orchestration layer. These expose the full context assembly pipeline via MCP protocol. After this slice, Claude Code can generate complete context prompts — the primary value proposition of the restructure.

Key references:
- Slice design: `user/slices/146-slice.mcp-context-tools.md`
- Slice 145 tasks (pattern reference): `user/tasks/145-tasks.mcp-server-project-tools.md`
- Core orchestration: `packages/core/src/services/ContextIntegrator.ts`, `CoreServiceFactory.ts`
- Prompt system: `packages/core/src/services/SystemPromptParser.ts`
- MCP tool guide: `ai-project-guide/tool-guides/mcp/01-overview.md`

Core API summary (for implementing agent):
- `createContextPipeline(projectPath: string)` → `{ engine: ContextTemplateEngine, integrator: ContextIntegrator }` (from `@context-forge/core/node`)
- `ContextIntegrator.generateContextFromProject(project: ProjectData)` → `Promise<string>` — the primary generation method
- `SystemPromptParser(filePath).getAllPrompts()` → `Promise<SystemPrompt[]>` — template enumeration
- `PROMPT_FILE_RELATIVE_PATH` constant → `'project-documents/ai-project-guide/project-guides/prompt.ai-project.system.md'` (from `@context-forge/core`)
- Templates are **sections within a single prompt file** parsed by `#####` headers, not separate files

---

## Phase 1: Core API Inspection and Shared Helpers

### Task 1: Inspect Core APIs and Verify Integration Path

- [x] Read `packages/core/src/services/CoreServiceFactory.ts` to confirm `createContextPipeline` signature and behavior
- [x] Read `packages/core/src/services/ContextIntegrator.ts` to confirm `generateContextFromProject` accepts `ProjectData` and returns a string
- [x] Read `packages/core/src/services/SystemPromptParser.ts` to confirm `getAllPrompts()` returns `SystemPrompt[]` and understand the `SystemPrompt` shape (`name`, `key`, `content`, `parameters`)
- [x] Read `packages/core/src/services/constants.ts` to confirm `PROMPT_FILE_RELATIVE_PATH` value
- [x] Verify that `ContextIntegrator` handles the `projectPath` → service path update internally (via `updateServicePaths`)
- [x] Verify that `createContextPipeline` and `SystemPromptParser` are exported from `@context-forge/core/node`
- [x] Verify that `PROMPT_FILE_RELATIVE_PATH` and `ProjectData` type are exported from `@context-forge/core`
- **Success**: Clear understanding of exact import paths and call signatures. No unknown APIs remain.

### Task 2: Create `contextTools.ts` with Shared Helpers

- [x] Create `packages/mcp-server/src/tools/contextTools.ts`
- [x] Export a `registerContextTools(server: McpServer)` function (same pattern as `registerProjectTools`)
- [x] Import `FileProjectStore`, `createContextPipeline`, `SystemPromptParser` from `@context-forge/core/node`
- [x] Import `PROMPT_FILE_RELATIVE_PATH` and `ProjectData` type from `@context-forge/core`
- [x] Import `path` from `node:path`
- [x] Implement shared `errorResult(message)` and `jsonResult(data)` helpers (same pattern as `projectTools.ts`, or factor into a shared utility if preferred)
- [x] Implement shared `generateContext` internal function:
  ```
  async function generateContext(
    projectId: string,
    overrides?: Partial<ProjectData>,
    additionalInstructions?: string
  ): Promise<string>
  ```
  - Load project via `new FileProjectStore().getById(projectId)` — throw/return error if not found or if `projectPath` is missing
  - Create a working copy of the project data
  - Apply any override fields to the working copy (only defined values)
  - Call `createContextPipeline(workingCopy.projectPath)` to get `{ integrator }`
  - Call `integrator.generateContextFromProject(workingCopy)` to get the context string
  - If `additionalInstructions` is provided, append to the context string (with a newline separator)
  - Return the assembled context string
- [x] File compiles (`pnpm --filter context-forge-mcp build`)
- **Success**: `contextTools.ts` exists with `registerContextTools` export and `generateContext` helper. Build succeeds.

### Task 3: Build and Commit Scaffold

- [x] Run `pnpm --filter context-forge-mcp build` — clean build
- [x] Commit: "feat(mcp-server): scaffold contextTools with shared generateContext helper (slice 146)"
- **Success**: Clean build. Commit on branch.

---

## Phase 2: Context Generation Tools — Implementation and Tests

### Task 4: Implement `context_build` Tool

- [x] Register `context_build` tool in `registerContextTools()`:
  - Name: `'context_build'`
  - Title: `'Build Context'`
  - Description: `'Build a complete context prompt for a Context Forge project. This is the primary tool for generating structured context blocks. Optionally override project parameters (slice, instruction, etc.) without modifying the stored project. Returns the assembled context ready for use.'`
  - Input schema (zod): `projectId` (required string), plus optional overrides: `slice`, `taskFile`, `instruction`, `developmentPhase`, `workType` (enum), `additionalInstructions`
  - Annotations: `{ readOnlyHint: false, idempotentHint: true, openWorldHint: false }`
- [x] Handler logic:
  1. Call shared `generateContext(projectId, overrides, additionalInstructions)`
  2. Return the context as a plain text content block: `{ content: [{ type: 'text', text: contextString }] }`
  3. Catch errors and return `{ isError: true }` with descriptive message
- [x] Handle specific error cases:
  - Project not found: reference `project_list` in error message
  - Missing `projectPath`: explain that project needs a configured path
  - Core generation failure: surface the error message from core
- **Success**: `context_build` tool registered and compiles.

### Task 5: Implement `template_preview` Tool

- [x] Register `template_preview` tool in `registerContextTools()`:
  - Name: `'template_preview'`
  - Title: `'Preview Context'`
  - Description: `'Preview a context prompt with specified parameters without modifying the stored project or triggering any side effects. Use this to explore what context would be generated with different configurations before committing to a context_build.'`
  - Input schema: identical to `context_build`
  - Annotations: `{ readOnlyHint: true, idempotentHint: true, openWorldHint: false }`
- [x] Handler logic: delegates to the same `generateContext` helper as `context_build`
  - Same error handling pattern
  - Returns plain text content block (same format as `context_build`)
- **Success**: `template_preview` tool registered and compiles. Shares logic with `context_build`.

### Task 6: Unit Tests for `context_build` and `template_preview`

- [x] Create `packages/mcp-server/src/__tests__/contextTools.test.ts`
- [x] Mock `@context-forge/core/node` to stub `FileProjectStore`, `createContextPipeline`, and `SystemPromptParser`
- [x] Mock `createContextPipeline` to return a mock `integrator` with `generateContextFromProject` that returns a known context string
- [x] Create mock `ProjectData` fixture (must include `projectPath`)
- [x] Set up test client using `InMemoryTransport` (same pattern as `projectTools.test.ts`)
- [x] `context_build` tests:
  - [x] Returns assembled context string for valid project (plain text, not JSON)
  - [x] Applies override parameters (verify the working copy passed to `generateContextFromProject` has overrides applied)
  - [x] Appends `additionalInstructions` when provided
  - [x] Returns `isError: true` for non-existent project ID
  - [x] Returns `isError: true` when project has no `projectPath`
  - [x] Returns `isError: true` on core generation failure (mock throws)
- [x] `template_preview` tests:
  - [x] Returns same output as `context_build` for identical parameters
  - [x] Returns `isError: true` for non-existent project
- [x] Run `pnpm --filter context-forge-mcp test` — all tests pass (both new and existing)
- **Success**: All context generation tool tests pass.

### Task 7: Build and Commit Context Generation Tools

- [x] Run `pnpm --filter context-forge-mcp build` — clean build
- [x] Commit: "feat(mcp-server): implement context_build and template_preview tools with tests (slice 146)"
- **Success**: Clean build, all tests pass, commit on branch.

---

## Phase 3: Prompt Discovery Tools — Implementation and Tests

### Task 8: Implement `prompt_list` Tool

- [x] Register `prompt_list` tool in `registerContextTools()`:
  - Name: `'prompt_list'`
  - Title: `'List Prompts'`
  - Description: `'List available prompt templates for a Context Forge project. Returns template names and metadata. Use prompt_get to retrieve the full content of a specific template.'`
  - Input schema: `projectId` (optional string — if omitted, return error asking for project ID since templates are project-scoped)
  - Annotations: `{ readOnlyHint: true, openWorldHint: false }`
- [x] Handler logic:
  1. Load project via `FileProjectStore.getById(projectId)` — error if not found
  2. Verify `project.projectPath` exists — error if missing
  3. Construct prompt file path: `path.join(project.projectPath, PROMPT_FILE_RELATIVE_PATH)`
  4. Create `SystemPromptParser(promptFilePath)`
  5. Call `parser.getAllPrompts()` to get `SystemPrompt[]`
  6. Map to summary objects: `{ name, key, parameterCount: parameters.length }`
  7. Return JSON: `{ templates: [...], count: N, promptFile: promptFilePath }`
- [x] Error cases:
  - Project not found: same pattern as other tools
  - Missing `projectPath`: descriptive error
  - Prompt file not found or parse failure: surface core error with path for debugging
- **Success**: `prompt_list` tool registered and compiles.

### Task 9: Implement `prompt_get` Tool

- [x] Register `prompt_get` tool in `registerContextTools()`:
  - Name: `'prompt_get'`
  - Title: `'Get Prompt'`
  - Description: `'Get the full content of a specific prompt template. Returns the raw template text. Useful for inspecting what a template contains before building context with it.'`
  - Input schema: `projectId` (required string), `templateName` (required string — name or key to match)
  - Annotations: `{ readOnlyHint: true, openWorldHint: false }`
- [x] Handler logic:
  1. Load project and resolve prompt file path (same as `prompt_list`)
  2. Create `SystemPromptParser(promptFilePath)`
  3. Call `parser.getAllPrompts()` to get all templates
  4. Find matching template: match against `name` (case-insensitive) or `key` (exact match)
  5. If not found: return `isError: true` with message referencing `prompt_list`
  6. Return the template content as plain text: `{ content: [{ type: 'text', text: template.content }] }`
  7. Optionally include template metadata (name, key, parameters) as a JSON header before the content, or return as separate content blocks
- **Success**: `prompt_get` tool registered and compiles.

### Task 10: Unit Tests for `prompt_list` and `prompt_get`

- [x] Add tests to `contextTools.test.ts` (or create a separate `promptTools.test.ts` if the file is getting long)
- [x] Mock `SystemPromptParser` to return known `SystemPrompt[]` fixture data
- [x] `prompt_list` tests:
  - [x] Returns template listing with names, keys, and count
  - [x] Returns `isError: true` for non-existent project
  - [x] Returns `isError: true` when project has no `projectPath`
  - [x] Handles parse errors gracefully (mock throws)
- [x] `prompt_get` tests:
  - [x] Returns template content for valid name match
  - [x] Returns template content for valid key match
  - [x] Returns `isError: true` for non-existent template name (with prompt_list reference)
  - [x] Returns `isError: true` for non-existent project
- [x] Run `pnpm --filter context-forge-mcp test` — all tests pass
- **Success**: All prompt discovery tool tests pass.

### Task 11: Build and Commit Prompt Discovery Tools

- [x] Run `pnpm --filter context-forge-mcp build` — clean build
- [x] Commit: "feat(mcp-server): implement prompt_list and prompt_get tools with tests (slice 146)"
- **Success**: Clean build, all tests pass, commit on branch.

---

## Phase 4: Integration and Final Verification

### Task 12: Wire Context Tools into Server Entry Point

- [x] Edit `packages/mcp-server/src/index.ts`:
  - Add import: `import { registerContextTools } from './tools/contextTools.js';`
  - Add call after `registerProjectTools(server)`: `registerContextTools(server);`
- [x] No other changes to `index.ts`
- **Success**: `index.ts` registers both project and context tools.

### Task 13: Update Server Lifecycle Test

- [x] Edit `packages/mcp-server/src/__tests__/serverLifecycle.test.ts`:
  - Update the `tools/list` assertion to expect all 7 tools (3 project + 4 context):
    `['context_build', 'project_get', 'project_list', 'project_update', 'prompt_get', 'prompt_list', 'template_preview']`
- **Success**: Lifecycle test expects 7 tools.

### Task 14: Full Workspace Build and Test

- [x] Run `pnpm -r build` — full workspace builds cleanly
- [x] Run `pnpm --filter context-forge-mcp test` — all MCP server tests pass (project tools, context tools, lifecycle)
- [x] Verify no regressions: existing project tools tests pass unchanged
- [x] Verify `dist/index.js` exists and contains all tool registrations
- **Success**: Full workspace clean. No regressions. All 7 tools operational.

### Task 15: Final Commit and Documentation Updates

- [x] Commit: "test(mcp-server): update lifecycle test for 7 tools, verify full build (slice 146)"
- [x] Update DEVLOG.md with implementation summary and commit hashes
- [x] Mark slice 146 (item 7) as `[x]` in `140-slices.context-forge-restructure.md`
- **Success**: All commits on branch. DEVLOG updated. Slice marked complete.

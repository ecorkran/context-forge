---
docType: slice-design
slice: mcp-server-context-tools
project: context-forge
parent: user/architecture/140-slices.context-forge-restructure.md
dependencies: [mcp-server-project-tools, core-orchestration-extraction]
interfaces: [mcp-server-state-update-tools, mcp-server-integration-testing]
status: not started
dateCreated: 20260220
dateUpdated: 20260220
---

# Slice 146: MCP Server — Context Tools

## Overview

Add context assembly tools to the MCP server: `context_build`, `template_preview`, `prompt_list`, and `prompt_get`. These wrap the core orchestration layer (`ContextGenerator`, `ContextTemplateEngine`, `ServiceFactory`) to expose the full context assembly pipeline via MCP protocol. After this slice, Claude Code can generate complete context prompts — the primary value proposition of the entire restructure.

## Value

This is the highest-value slice in the restructure initiative. It delivers the core use case: an AI agent or developer can generate a structured context prompt without leaving their IDE or terminal. Specifically:

- Claude Code and Cursor users can invoke `context_build` to get a ready-to-use context block — the operation that previously required switching to the Electron GUI, configuring fields, and clicking copy.
- Agents can self-serve context during long autonomous sessions, approaching the workflow described in the architecture doc: `/newcontext [additional-instructions]`.
- `template_preview` enables dry-run exploration without committing state changes — useful for agents evaluating whether to switch context parameters.
- `prompt_list` and `prompt_get` expose the prompt template system, letting agents discover and inspect available templates rather than requiring hardcoded template names.

## Dependencies

| Dependency | Status | What This Slice Consumes |
|---|---|---|
| Slice 145: MCP Server — Project Tools | Complete | Server infrastructure (`index.ts`, `McpServer` instance, build config, bin entry), `FileProjectStore`, tool registration patterns |
| Slice 143: Core Orchestration Extraction | Complete | `ContextGenerator`, `ContextTemplateEngine`, `ContextIntegrator`, `ServiceFactory` from `@context-forge/core` |
| Slice 142: Core Services Extraction | Complete (transitive) | `TemplateProcessor`, `SystemPromptParser`, `StatementManager`, `SectionBuilder`, `ProjectPathService` |
| Slice 144: Storage Migration | Complete (transitive) | `FileProjectStore`, `getStoragePath()` |

No new external packages required — this slice uses the same MCP SDK and zod already installed by slice 145.

## Architecture

### Component Structure

```
packages/mcp-server/
  src/
    index.ts                  — (existing) Add registerContextTools(server) call
    tools/
      projectTools.ts         — (existing, unchanged)
      contextTools.ts         — NEW: registerContextTools(server)
```

The pattern mirrors slice 145: a single `contextTools.ts` file exports a registration function that takes the `McpServer` instance. The entry point (`index.ts`) calls this alongside the existing `registerProjectTools`.

### Data Flow

#### `context_build` Flow

```
MCP Client (Claude Code)
  │
  ▼
context_build tool handler
  │
  ├── FileProjectStore.getById(projectId)     → ProjectData
  │
  ├── Apply parameter overrides (slice, instruction, etc.)
  │
  ├── ServiceFactory.create(projectData)       → service instances
  │
  ├── ContextGenerator.generate(projectData, services)
  │     │
  │     ├── SystemPromptParser.parse()         → system prompt sections
  │     ├── StatementManager.load()            → template statements
  │     ├── TemplateProcessor.process()        → variable substitution
  │     ├── ContextTemplateEngine.assemble()   → structured sections
  │     └── ContextIntegrator.integrate()      → final context string
  │
  └── Return assembled context as text content
```

#### `template_preview` Flow

Identical to `context_build` except:
1. Overrides are applied to a **copy** of the project data (not persisted)
2. The response is explicitly labeled as a preview
3. No state mutations occur

#### `prompt_list` / `prompt_get` Flow

```
MCP Client
  │
  ▼
prompt_list / prompt_get tool handler
  │
  ├── Resolve prompt template directory from project config
  │
  ├── SystemPromptParser (or direct fs read)
  │     → list template files, or read + parse a specific template
  │
  └── Return template listing or template content
```

## Technical Decisions

### Core Service Instantiation Strategy

The core orchestration layer uses `ServiceFactory` to create service instances from project data. The MCP tool handlers follow a straightforward pattern:

1. Load project data from `FileProjectStore`
2. Create services via `ServiceFactory`
3. Call `ContextGenerator.generate()`
4. Return the result

This is intentionally simple — the orchestration complexity lives in core, not in the MCP layer. The MCP tools are thin wrappers, consistent with slice 145's approach.

**Key implementation detail**: The implementing agent must inspect the actual `ServiceFactory`, `ContextGenerator`, and related APIs in `packages/core/src/` to determine exact constructor signatures, method names, and required parameters. The core extraction slices preserved the original API surface, but the precise call pattern (e.g., whether `ContextGenerator` is instantiated per-call or reused, whether `ServiceFactory.create()` returns an object or individual services) depends on the extracted code. The slice design describes the data flow; the task breakdown will specify exact wiring once the agent reads the source.

### Override Parameters for `context_build`

The tool accepts optional override parameters that temporarily modify context generation without persisting changes to the project. This supports the agent workflow of "build me a context for this specific scenario" without requiring a `project_update` → `context_build` → `project_update` round-trip.

Overrides apply to a working copy of the project data. The stored project is not modified.

### `template_preview` vs `context_build`

Both generate context output. The distinction:

- `context_build` is the production operation — "give me the context I need right now."
- `template_preview` is the exploration operation — "show me what context *would* look like with these parameters."

Functionally, `template_preview` is `context_build` with all parameters treated as overrides against a temporary copy. The separation exists for semantic clarity in tool descriptions (agents benefit from understanding intent) and for annotations (`template_preview` gets `readOnlyHint: true`; `context_build` does not, since future slices may add state-tracking side effects like "last built at" timestamps).

### Prompt Template Discovery

`prompt_list` and `prompt_get` expose the project's prompt template system. The exact mechanism depends on how `SystemPromptParser` and the template directory are structured in core — the implementation agent will need to inspect:

- How templates are discovered (directory listing? config-defined list?)
- What metadata is available per template (name, description, variable list?)
- Whether templates are project-scoped or global

The tool design below accounts for both possibilities with a project-scoped approach (templates resolved relative to a project's configured paths) and a fallback for listing templates without a project context.

### Error Handling

Consistent with slice 145's patterns:

- Missing project → `{ isError: true }` with helpful message referencing `project_list`
- Core service failures (missing template files, parse errors) → `{ isError: true }` with the error message from core, wrapped in a user-friendly explanation
- No swallowed errors — surface everything the agent needs to diagnose issues

### Logging

Same as slice 145: `console.error()` with `[context-forge-mcp]` prefix. No logging library.

## Tool Specifications

### `context_build`

Generates a complete context prompt from project state with optional parameter overrides.

**Description**: `"Build a complete context prompt for a Context Forge project. This is the primary tool for generating structured context blocks. Optionally override project parameters (slice, instruction, etc.) without modifying the stored project. Returns the assembled context ready for use."`

**Input Schema**:
```typescript
inputSchema: z.object({
  projectId: z.string().describe(
    'Project ID to build context for. Use project_list to find IDs.'
  ),
  slice: z.string().optional().describe(
    'Override: slice name for this context build (does not modify stored project)'
  ),
  taskFile: z.string().optional().describe(
    'Override: task file name'
  ),
  instruction: z.string().optional().describe(
    'Override: instruction type (e.g., implementation, design, review)'
  ),
  developmentPhase: z.string().optional().describe(
    'Override: development phase'
  ),
  workType: z.enum(['start', 'continue']).optional().describe(
    'Override: whether starting or continuing work'
  ),
  additionalInstructions: z.string().optional().describe(
    'Additional instructions to append to the generated context'
  ),
})
```

**Annotations**: `{ readOnlyHint: false, idempotentHint: true, openWorldHint: false }`

Note: `readOnlyHint: false` because future slices (147: State Update Tools) may add side effects like "last context built at" tracking. For now the tool is effectively read-only, but the annotation leaves room for that evolution without a breaking change.

**Behavior**:
1. Load project via `FileProjectStore.getById(projectId)` — error if not found
2. Create a working copy of the project data
3. Apply any override parameters to the working copy
4. Instantiate services via `ServiceFactory` using the working copy
5. Call `ContextGenerator.generate()` (or equivalent orchestration entry point)
6. If `additionalInstructions` is provided, append to the generated context
7. Return the assembled context as text content

**Output** (text content):
The full assembled context string. This is the primary payload — returned as a single text content block, not wrapped in JSON. The agent receives it as directly usable context.

**Error — project not found**: `{ isError: true }` with text: `"Project not found: '{projectId}'. Use the project_list tool to see available projects and their IDs."`

**Error — context generation failure**: `{ isError: true }` with text describing the failure (e.g., missing template file, parse error in system prompt).

### `template_preview`

Preview what a context would look like with given parameters, without any side effects.

**Description**: `"Preview a context prompt with specified parameters without modifying the stored project or triggering any side effects. Use this to explore what context would be generated with different configurations before committing to a context_build."`

**Input Schema**:
```typescript
inputSchema: z.object({
  projectId: z.string().describe(
    'Project ID to preview context for. Use project_list to find IDs.'
  ),
  slice: z.string().optional().describe('Preview with this slice name'),
  taskFile: z.string().optional().describe('Preview with this task file'),
  instruction: z.string().optional().describe('Preview with this instruction type'),
  developmentPhase: z.string().optional().describe('Preview with this development phase'),
  workType: z.enum(['start', 'continue']).optional().describe('Preview with this work type'),
  additionalInstructions: z.string().optional().describe(
    'Additional instructions to include in the preview'
  ),
})
```

**Annotations**: `{ readOnlyHint: true, idempotentHint: true, openWorldHint: false }`

**Behavior**: Identical to `context_build` — loads project, applies overrides to a copy, generates context. The implementation can share or delegate to the same internal function.

**Output** (text content): The assembled context string, same format as `context_build`.

**Errors**: Same as `context_build`.

### `prompt_list`

Lists available prompt templates.

**Description**: `"List available prompt templates for a Context Forge project. Returns template names and metadata. Use prompt_get to retrieve the full content of a specific template."`

**Input Schema**:
```typescript
inputSchema: z.object({
  projectId: z.string().optional().describe(
    'Project ID to list templates for. If omitted, lists templates from the default template directory.'
  ),
})
```

**Annotations**: `{ readOnlyHint: true, openWorldHint: false }`

**Behavior**:
1. If `projectId` provided: load project, resolve template directory from project config
2. If no `projectId`: use the default/global template directory
3. Enumerate available templates (via `SystemPromptParser` directory listing or equivalent core API)
4. Return template listing with available metadata

**Output** (text content, JSON):
```json
{
  "templates": [
    {
      "name": "default",
      "filename": "prompt.ai-project.system.md",
      "path": "/absolute/path/to/template"
    }
  ],
  "count": 1,
  "templateDir": "/absolute/path/to/template/directory"
}
```

The exact metadata fields depend on what the core template system exposes. At minimum: name and path. If templates have descriptions or variable lists, include those.

**Error — project not found**: Same pattern as other tools.

**Error — template directory not found**: `{ isError: true }` with text indicating the configured template path doesn't exist, with the path shown for debugging.

### `prompt_get`

Retrieves a specific prompt template's content.

**Description**: `"Get the full content of a specific prompt template. Returns the raw template text. Useful for inspecting what a template contains before building context with it."`

**Input Schema**:
```typescript
inputSchema: z.object({
  projectId: z.string().optional().describe(
    'Project ID to resolve template paths. If omitted, uses the default template directory.'
  ),
  templateName: z.string().describe(
    'Template name or filename to retrieve. Use prompt_list to see available templates.'
  ),
})
```

**Annotations**: `{ readOnlyHint: true, openWorldHint: false }`

**Behavior**:
1. Resolve template directory (same logic as `prompt_list`)
2. Find the template by name or filename
3. Read and return the template content

**Output** (text content): The raw template file content as a text block.

**Error — template not found**: `{ isError: true }` with text: `"Template not found: '{templateName}'. Use prompt_list to see available templates."`

## Integration Points

### Provides to Other Slices

- **Slice 147 (State Update Tools)**: The context generation infrastructure established here (service instantiation pattern, core API wiring) is reused by `context_summarize` and other state mutation tools. The shared internal function for "load project → create services → run orchestration" can be factored into a helper if 147 needs it.
- **Slice 150 (MCP Integration Testing)**: The context tools are the primary test targets — integration tests will invoke `context_build` against fixture projects and verify the output matches expected context structure.
- **Slice 151 (Documentation and Packaging)**: Tool descriptions and usage patterns from this slice feed directly into the `context-forge-mcp` README.

### Consumes from Other Slices

- **Slice 145 (Project Tools)**: Server infrastructure, `McpServer` instance, tool registration pattern, `FileProjectStore` usage pattern, build configuration, bin entry point.
- **Core package**: `ContextGenerator`, `ContextTemplateEngine`, `ContextIntegrator`, `ServiceFactory`, `SystemPromptParser`, `TemplateProcessor`, `StatementManager`, `SectionBuilder`, `ProjectPathService`, and all associated types.

### Registration in `index.ts`

The existing entry point gains one additional import and one function call:

```typescript
// In index.ts — additions only
import { registerContextTools } from './tools/contextTools.js';

// After registerProjectTools(server):
registerContextTools(server);
```

No other changes to `index.ts`.

## Testing Strategy

### Unit Tests (`src/__tests__/contextTools.test.ts`)

Mock both `FileProjectStore` and the core orchestration services to isolate tool handler logic.

Coverage:
- `context_build`: returns assembled context for valid project, applies overrides correctly, appends additional instructions, returns `isError` for missing project, returns `isError` for core generation failure
- `template_preview`: same behavior as `context_build` (can share test structure), confirms no state mutation
- `prompt_list`: returns template listing, handles empty template directory, handles missing project
- `prompt_get`: returns template content, returns `isError` for missing template

The mocking boundary is important: core orchestration is tested in `packages/core`. These tests verify that the MCP tool handlers correctly call core APIs and format responses — not that core itself works correctly.

### Manual Integration Test

After implementation, verify with MCP Inspector:
```bash
npx @modelcontextprotocol/inspector node packages/mcp-server/dist/index.js
```

Invoke each tool against a real project and verify:
- `context_build` returns a context string that matches what the Electron app produces
- `template_preview` with overrides produces different output than default
- `prompt_list` enumerates the expected templates
- `prompt_get` returns template content

### Build Verification

- `pnpm -r build` succeeds cleanly
- `pnpm --filter context-forge-mcp test` passes
- Existing slice 145 tests continue to pass (no regressions in project tools)

## Success Criteria

1. `contextTools.ts` implements all 4 tools with proper MCP registration
2. `context_build` generates a complete context prompt that matches the core pipeline output
3. `context_build` override parameters apply correctly without modifying stored project state
4. `template_preview` produces identical output to `context_build` with the same parameters
5. `prompt_list` returns available templates with name and path metadata
6. `prompt_get` returns the raw content of a specified template
7. All tools return proper `isError` responses for invalid inputs (missing project, missing template, core failures)
8. `index.ts` registers context tools alongside existing project tools — all 7 tools appear in MCP tool listing
9. Unit tests cover happy path and error cases for all 4 tools
10. Existing project tools tests pass without modification (no regressions)
11. Full workspace build succeeds (`pnpm -r build`)

## Implementation Notes

### Shared Helper Potential

`context_build` and `template_preview` share nearly identical logic. The implementation should factor the common "load project → apply overrides → generate context" flow into a shared internal function rather than duplicating it. Something like:

```typescript
async function generateContext(
  projectId: string,
  overrides?: Partial<ProjectData>,
  additionalInstructions?: string
): Promise<string>
```

This also positions well for slice 147, which will need similar project-loading and service-creation patterns.

### Core API Discovery

The implementing agent must read the actual source in `packages/core/src/` to determine:
- The exact `ContextGenerator` API (constructor args, `generate()` method signature)
- How `ServiceFactory` creates service instances (and what it returns)
- How templates are discovered and enumerated
- Whether there's an existing "build context from project data" convenience method

The data flow described above is based on the architecture documents. The actual call chain may differ slightly based on how the extraction slices organized the code. The task breakdown phase should include a core API inspection task before implementation begins.

### Output Format

`context_build` and `template_preview` return the context as a plain text content block — not JSON-wrapped. This is deliberate: the assembled context is the payload, and wrapping it in JSON would require agents to parse-then-extract, adding unnecessary friction. The agent receives exactly the string it needs to inject as context.

`prompt_list` returns JSON (structured data). `prompt_get` returns plain text (template content).

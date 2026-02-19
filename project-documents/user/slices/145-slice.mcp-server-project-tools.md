---
docType: slice-design
slice: mcp-server-project-tools
project: context-forge
parent: user/architecture/140-slices.context-forge-restructure.md
dependencies: [storage-migration]
interfaces: [mcp-server-context-tools]
status: not started
dateCreated: 20260219
dateUpdated: 20260219
---

# Slice 145: MCP Server — Project Tools

## Overview

First feature slice in the MCP server track. Implements three project management tools (`project_list`, `project_get`, `project_update`) that wrap the core storage layer via the MCP protocol. After this slice, Claude Code and other MCP clients can read and modify project configuration — the first deliverable for the MCP-only developer persona.

## Value

- Unblocks the entire MCP tool surface (slices 146–147 build on this)
- First standalone, usable artifact for non-Electron users
- Validates the storage-layer extraction from slice 144 against a real consumer

## Dependencies

| Dependency | Status | What This Slice Consumes |
|---|---|---|
| Slice 144: Storage Migration | Complete | `FileProjectStore`, `getStoragePath()` from `@context-forge/core/node` |
| `@modelcontextprotocol/server` | Not yet installed | MCP SDK v2 — `McpServer`, `StdioServerTransport` |
| `zod` (v4 via `zod/v4`) | Not yet installed | Input schema validation for `registerTool` |

## Technical Decisions

### SDK Version: v2 (`@modelcontextprotocol/server`)

The MCP TypeScript SDK v2 ships as separate packages. For a stdio-only server, we need:

- `@modelcontextprotocol/server` — `McpServer`, `StdioServerTransport`
- `zod` — required for `registerTool` input schemas (SDK v2 requires `z.object()` wrappers)

**Fallback**: If v2 is not yet stable at implementation time, use the v1 monolithic package `@modelcontextprotocol/sdk` with `import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'` and `import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'`. The `registerTool` API is available in both versions.

### Import Pattern

```typescript
import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';
```

If using v1 fallback:
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
```

### Transport: stdio Only

Stdio transport is the only transport for this slice. Streamable HTTP is future work. The server is spawned as a subprocess by the MCP client (Claude Code, Cursor, etc.).

**Critical**: Never write to stdout — it corrupts the JSON-RPC stream. All diagnostic output goes to stderr.

### File Structure

```
packages/mcp-server/
  src/
    index.ts              — Entry point: shebang, server setup, register tools, connect transport
    tools/
      projectTools.ts     — registerProjectTools(server) — the three project tools
  package.json            — Add @modelcontextprotocol/server, zod
  tsconfig.json           — Already configured (nodenext, strict, ES2023)
```

Rationale: Two source files keeps the entry point focused on server lifecycle while tool implementations stay self-contained. Slice 146 adds `tools/contextTools.ts` without touching `index.ts` structure.

### Logging

All logging via `console.error()` (writes to stderr). No logging library — premature for 3 tools. A `log()` helper that prefixes `[context-forge-mcp]` is sufficient.

## Tool Specifications

### `project_list`

Lists all configured projects with summary fields.

**Input**: None (empty schema)

**Annotations**: `{ readOnlyHint: true, openWorldHint: false }`

**Behavior**:
1. Instantiate `FileProjectStore`
2. Call `store.getAll()`
3. Map each project to summary fields: `id`, `name`, `slice`, `template`, `instruction`, `isMonorepo`, `projectPath`, `updatedAt`
4. Return as JSON text content

**Input Schema**:
```typescript
inputSchema: z.object({})
```

**Output** (text content, JSON):
```json
{
  "projects": [
    {
      "id": "project_1739...",
      "name": "my-project",
      "slice": "auth",
      "template": "default",
      "instruction": "implementation",
      "isMonorepo": false,
      "projectPath": "/path/to/project",
      "updatedAt": "2026-02-19T..."
    }
  ],
  "count": 1
}
```

**Empty state**: Returns `{ "projects": [], "count": 0 }` — not an error.

### `project_get`

Returns full project details by ID.

**Input**: `{ id: string }`

**Annotations**: `{ readOnlyHint: true, openWorldHint: false }`

**Behavior**:
1. Instantiate `FileProjectStore`
2. Call `store.getById(id)`
3. If not found: return MCP error response with helpful message
4. If found: return full `ProjectData` as JSON text content

**Input Schema**:
```typescript
inputSchema: z.object({
  id: z.string().describe('Project ID (e.g., project_1739...). Use project_list to find IDs.')
})
```

**Output** (text content, JSON): Full `ProjectData` object.

**Error**: `{ isError: true }` with text: `"Project not found: '{id}'. Use the project_list tool to see available projects and their IDs."`

### `project_update`

Updates one or more fields on an existing project.

**Input**: `{ id: string }` plus any combination of updatable fields.

**Annotations**: `{ destructiveHint: false, idempotentHint: true, openWorldHint: false }`

**Behavior**:
1. Instantiate `FileProjectStore`
2. Validate `id` exists via `store.getById(id)` — return error if not found
3. Call `store.update(id, updates)`
4. Return the full updated project (read-back via `store.getById(id)`)

**Input Schema**:
```typescript
inputSchema: z.object({
  id: z.string().describe('Project ID to update'),
  name: z.string().optional().describe('Project display name'),
  template: z.string().optional().describe('Template name'),
  slice: z.string().optional().describe('Current slice name'),
  taskFile: z.string().optional().describe('Task file name'),
  instruction: z.string().optional().describe('Instruction type (e.g., implementation, design, review)'),
  developmentPhase: z.string().optional().describe('Current development phase'),
  workType: z.enum(['start', 'continue']).optional().describe('Whether starting or continuing work'),
  projectDate: z.string().optional().describe('Project date string'),
  isMonorepo: z.boolean().optional().describe('Whether project uses monorepo mode'),
  isMonorepoEnabled: z.boolean().optional().describe('Whether monorepo UI is enabled'),
  projectPath: z.string().optional().describe('Absolute path to project root'),
  customData: z.object({
    recentEvents: z.string().optional(),
    additionalNotes: z.string().optional(),
    monorepoNote: z.string().optional(),
    availableTools: z.string().optional(),
  }).optional().describe('Custom data fields for context generation'),
})
```

**Output** (text content, JSON): Full updated `ProjectData` object with confirmation message.

**Error — not found**: Same as `project_get`.

**Error — no update fields**: `{ isError: true }` with text: `"No update fields provided. Specify at least one field to update (e.g., slice, instruction, name)."`

## FileProjectStore Instantiation

Each tool call instantiates a fresh `FileProjectStore()`. This is acceptable because:
- `FileProjectStore` reads from disk on every operation (no in-memory cache that needs warming)
- Lazy initialization cost is negligible (single `readFile` + `JSON.parse`)
- Avoids stale state if another process (Electron app) writes between calls
- No shared mutable state between tool calls

If performance becomes a concern, a shared instance can be introduced in a later slice via a server-scoped singleton.

## Entry Point Design

`src/index.ts` structure:

```
#!/usr/bin/env node

1. Import McpServer, StdioServerTransport, FileProjectStore
2. Create McpServer with name "context-forge-mcp" and version from package.json
3. Call registerProjectTools(server) from tools/projectTools.ts
4. Create StdioServerTransport
5. Connect server to transport
6. Log startup to stderr
```

The shebang line (`#!/usr/bin/env node`) is required because `package.json` declares `"bin": { "context-forge-mcp": "./dist/index.js" }`.

## Error Handling

All tool handlers follow this pattern:

```typescript
try {
  // ... tool logic
  return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
}
```

Not-found errors use specific messages that guide the user to the correct tool (e.g., "Use project_list to find IDs").

## Integration Points

### Consumed by This Slice

| Module | Import Path | Usage |
|---|---|---|
| `FileProjectStore` | `@context-forge/core/node` | Project CRUD in all 3 tools |
| `ProjectData`, `UpdateProjectData` | `@context-forge/core` | Type definitions |

### Consumed by Future Slices

| Consumer | What It Uses |
|---|---|
| Slice 146 (Context Tools) | Server instance pattern, `tools/` directory structure |
| Slice 147 (State Update Tools) | Same patterns, may add `project_create`, `project_delete` |

## Testing Strategy

### Unit Tests (`src/__tests__/projectTools.test.ts`)

Test the tool handler functions directly. Mock `FileProjectStore` to isolate tool logic from filesystem.

Coverage:
- `project_list`: returns formatted summary, handles empty store
- `project_get`: returns full project, returns `isError` for missing ID
- `project_update`: applies updates and returns read-back, returns `isError` for missing ID, returns `isError` when no fields provided

### Manual Integration Test

After implementation, verify with MCP Inspector:
```bash
npx @modelcontextprotocol/inspector node packages/mcp-server/dist/index.js
```

Invoke each tool and verify responses against real data in `~/Library/Preferences/context-forge/projects.json`.

### Build Verification

- `pnpm -r build` must succeed cleanly
- `pnpm --filter context-forge-mcp test` must pass

## Success Criteria

1. `packages/mcp-server` builds cleanly with `@modelcontextprotocol/server` and `zod` as dependencies
2. `context-forge-mcp` binary starts, connects via stdio, and responds to MCP `initialize` handshake
3. `project_list` returns all projects from `FileProjectStore` with summary fields
4. `project_get` returns full `ProjectData` for a valid ID, error for invalid ID
5. `project_update` modifies project fields and returns the updated project, error for invalid ID or no fields
6. All tool responses are valid MCP `CallToolResult` objects
7. Unit tests cover happy path and error cases for all 3 tools
8. No writes to stdout — all logging to stderr
9. Full workspace build succeeds (`pnpm -r build`)

## Implementation Notes

- **Package version**: Read version from `package.json` at runtime (use `createRequire` or a build-time const) for the `McpServer` constructor. Alternatively, hardcode `"0.1.0"` to match the current `package.json` version — this can be automated later.
- **Zod import**: SDK v2 expects `zod/v4` (`import * as z from 'zod/v4'`). If using v1, use `import { z } from 'zod'`. Verify at installation time.
- **TypeScript**: The existing `tsconfig.json` is already configured correctly (`nodenext`, `strict`, `ES2023`). No changes needed.
- **Bin shebang**: The compiled `dist/index.ts` needs `#!/usr/bin/env node` at the top. TypeScript preserves shebang comments during compilation.

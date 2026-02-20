---
docType: tasks
slice: mcp-server-project-tools
project: context-forge
lldRef: user/slices/145-slice.mcp-server-project-tools.md
dependencies: [storage-migration]
projectState: Slice 144 complete — FileProjectStore and core storage available via @context-forge/core/node. packages/mcp-server scaffolded (package.json, tsconfig.json, empty src/index.ts). MCP SDK not yet installed.
dateCreated: 20260219
dateUpdated: 20260219
status: not started
---

# Tasks: Slice 145 — MCP Server — Project Tools

## Context

Implement three MCP tools (`project_list`, `project_get`, `project_update`) in `packages/mcp-server` that wrap `FileProjectStore` from `@context-forge/core/node`. This is the first slice delivering MCP protocol functionality. Transport: stdio. SDK: `@modelcontextprotocol/server` v2 (with v1 fallback).

Key references:
- Slice design: `user/slices/145-slice.mcp-server-project-tools.md`
- MCP tool guide: `ai-project-guide/tool-guides/mcp/01-overview.md`
- Core storage API: `packages/core/src/storage/interfaces.ts`

---

## Phase 1: Dependencies and Server Scaffold

### Task 1: Install MCP SDK and Zod Dependencies

- [ ] Run `pnpm --filter context-forge-mcp add @modelcontextprotocol/server zod`
  - If `@modelcontextprotocol/server` is not available on npm, fall back to `@modelcontextprotocol/sdk`
  - Zod is required for `registerTool` input schemas
- [ ] Verify import resolution: create a minimal test import in `src/index.ts` to confirm `McpServer` and `StdioServerTransport` resolve
  - v2: `import { McpServer, StdioServerTransport } from '@modelcontextprotocol/server'`
  - v1 fallback: `import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'` and `import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'`
- [ ] Verify zod import: `import * as z from 'zod/v4'` (v2) or `import { z } from 'zod'` (v1)
- [ ] Record which SDK version was installed in a brief comment at top of `src/index.ts`
- **Success**: `pnpm --filter context-forge-mcp build` compiles with SDK and zod imports resolving

### Task 2: Create Server Entry Point (`src/index.ts`)

- [ ] Add `#!/usr/bin/env node` shebang as first line
- [ ] Import `McpServer`, `StdioServerTransport` (path depends on v1/v2 per Task 1)
- [ ] Create `McpServer` instance with:
  - `name: 'context-forge-mcp'`
  - `version: '0.1.0'` (matches package.json; can automate later)
- [ ] Create `StdioServerTransport` and call `server.connect(transport)`
- [ ] Add stderr startup log: `console.error('[context-forge-mcp] Server started')`
- [ ] Wrap in async main function with top-level error handling that logs to stderr and exits with code 1
- [ ] Do NOT write anything to stdout — only stderr
- **Success**: File compiles. Server structure is in place (tools not yet registered).

### Task 3: Build and Commit

- [ ] Run `pnpm --filter context-forge-mcp build`
- [ ] Verify `dist/index.js` exists and contains the shebang line
- [ ] Commit: "feat(mcp-server): scaffold MCP server with SDK and stdio transport (slice 145)"
- **Success**: Clean build. Commit on branch.

---

## Phase 2: Tool Implementations

### Task 4: Create `projectTools.ts` and Implement `project_list`

- [ ] Create `packages/mcp-server/src/tools/projectTools.ts`
- [ ] Export a `registerProjectTools(server: McpServer)` function (type `McpServer` from SDK)
- [ ] Register `project_list` tool using `server.registerTool()`:
  - Name: `'project_list'`
  - Title: `'List Projects'`
  - Description: `'List all configured Context Forge projects. Returns project IDs, names, current slices, and other summary fields. Use this to discover available projects before calling project_get or project_update.'`
  - Input schema: `z.object({})`
  - Annotations: `{ readOnlyHint: true, openWorldHint: false }`
- [ ] Handler logic:
  1. Instantiate `FileProjectStore` from `@context-forge/core/node`
  2. Call `store.getAll()`
  3. Map to summary fields: `id`, `name`, `slice`, `template`, `instruction`, `isMonorepo`, `projectPath`, `updatedAt`
  4. Return `{ content: [{ type: 'text', text: JSON.stringify({ projects, count }, null, 2) }] }`
- [ ] Wrap handler body in try/catch — errors return `{ content: [...], isError: true }`
- **Success**: File compiles. `project_list` is registered and returns summary JSON.

### Task 5: Implement `project_get`

- [ ] Register `project_get` tool in `registerProjectTools()`:
  - Name: `'project_get'`
  - Title: `'Get Project'`
  - Description: `'Get full details for a specific Context Forge project by ID. Returns all project fields including configuration, custom data, and timestamps. Use project_list first to find project IDs.'`
  - Input schema: `z.object({ id: z.string().describe('Project ID (e.g., project_1739...). Use project_list to find IDs.') })`
  - Annotations: `{ readOnlyHint: true, openWorldHint: false }`
- [ ] Handler logic:
  1. Instantiate `FileProjectStore`
  2. Call `store.getById(id)`
  3. If undefined: return `isError: true` with message `"Project not found: '{id}'. Use the project_list tool to see available projects and their IDs."`
  4. Return full `ProjectData` as JSON text content
- [ ] Wrap in try/catch per error handling pattern
- **Success**: File compiles. `project_get` returns full project or actionable error.

### Task 6: Implement `project_update`

- [ ] Register `project_update` tool in `registerProjectTools()`:
  - Name: `'project_update'`
  - Title: `'Update Project'`
  - Description: `'Update configuration fields on an existing Context Forge project. Provide the project ID and any fields to change (e.g., slice, instruction, developmentPhase). Returns the full updated project. Does not delete or replace — only modifies specified fields.'`
  - Input schema: Zod object with `id` (required string) plus all `UpdateProjectData` fields as optional (see slice design for full schema)
  - Annotations: `{ destructiveHint: false, idempotentHint: true, openWorldHint: false }`
- [ ] Handler logic:
  1. Instantiate `FileProjectStore`
  2. Extract `id` from input; collect remaining fields as `updates`
  3. If no update fields provided (all undefined after removing `id`): return `isError: true` with message `"No update fields provided. Specify at least one field to update (e.g., slice, instruction, name)."`
  4. Check project exists via `store.getById(id)` — return not-found error if missing
  5. Call `store.update(id, updates)`
  6. Read back via `store.getById(id)` and return the full updated project
- [ ] Wrap in try/catch per error handling pattern
- **Success**: File compiles. `project_update` validates inputs and returns updated project.

### Task 7: Wire Tools and Build

- [ ] In `src/index.ts`, import `registerProjectTools` from `./tools/projectTools.js`
- [ ] Call `registerProjectTools(server)` before `server.connect(transport)`
- [ ] Run `pnpm --filter context-forge-mcp build`
- [ ] Commit: "feat(mcp-server): implement project_list, project_get, project_update tools (slice 145)"
- **Success**: Clean build with all 3 tools registered.

---

## Phase 3: Unit Tests

### Task 8: Unit Tests for `project_list` and `project_get`

- [ ] Create `packages/mcp-server/src/__tests__/projectTools.test.ts`
- [ ] Mock `FileProjectStore` from `@context-forge/core/node` using `vi.mock()`
- [ ] Create mock project data fixture matching `ProjectData` shape
- [ ] `project_list` tests:
  - Returns formatted summary with correct fields and count
  - Returns `{ projects: [], count: 0 }` for empty store (not an error)
- [ ] `project_get` tests:
  - Returns full `ProjectData` for valid ID
  - Returns `isError: true` with helpful message for non-existent ID
- **Success**: All tests pass with `pnpm --filter context-forge-mcp test`

### Task 9: Unit Tests for `project_update`

- [ ] `project_update` tests (in same test file):
  - Applies update and returns full read-back project
  - Returns `isError: true` for non-existent ID
  - Returns `isError: true` when no update fields provided (only `id`)
- [ ] Run `pnpm --filter context-forge-mcp test` — all tests pass
- [ ] Commit: "test(mcp-server): unit tests for project tools (slice 145)"
- **Success**: All unit tests pass. Commit on branch.

Note on test approach: Tests should call the tool handler functions directly. If the SDK's `registerTool` makes direct invocation difficult, extract handler logic into testable functions that `registerProjectTools` wraps. The design allows either approach.

---

## Phase 4: Server Lifecycle Test and Final Verification

### Task 10: Server Lifecycle Test

- [ ] Create `packages/mcp-server/src/__tests__/serverLifecycle.test.ts`
- [ ] Spawn server as child process: `node` with `dist/index.js` (requires build first)
  - Set `CONTEXT_FORGE_DATA_DIR` to a temp directory (isolate from real data)
  - Pre-seed the temp dir with empty `projects.json` (`[]`)
- [ ] Send MCP `initialize` request as JSON-RPC over stdin:
  - `{ "jsonrpc": "2.0", "id": 1, "method": "initialize", "params": { "protocolVersion": "2025-03-26", "capabilities": {}, "clientInfo": { "name": "test-client", "version": "1.0.0" } } }`
- [ ] Parse JSON-RPC response from stdout
- [ ] Assert response contains `serverInfo.name === "context-forge-mcp"`
- [ ] Send `notifications/initialized`: `{ "jsonrpc": "2.0", "method": "notifications/initialized" }`
- [ ] Optionally: send `tools/list` request and assert all 3 tools are present
- [ ] Close stdin and verify process exits with code 0 (or use a timeout)
- [ ] Clean up temp directory in afterEach
- **Success**: Lifecycle test passes — server starts, handshakes, lists tools, exits cleanly.

### Task 11: Full Workspace Build and Test

- [ ] Run `pnpm -r build` — full workspace builds cleanly
- [ ] Run `pnpm --filter context-forge-mcp test` — all MCP server tests pass
- [ ] Run `pnpm -r test` — no regressions in core or Electron tests
- [ ] Verify `dist/index.js` contains shebang and is executable
- **Success**: Full workspace clean. No regressions.

### Task 12: Final Commit

- [ ] Commit: "test(mcp-server): server lifecycle test, verify full build (slice 145)"
- [ ] Update DEVLOG.md with implementation summary and commit hashes
- [ ] Mark slice 145 as `[x]` in `140-slices.context-forge-restructure.md`
- **Success**: All commits on branch. DEVLOG updated. Slice marked complete.

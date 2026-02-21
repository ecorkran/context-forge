---
docType: slice-design
slice: mcp-server-state-tools
project: context-forge
parent: user/architecture/140-slices.context-forge-restructure.md
dependencies: [mcp-server-context-tools, mcp-server-project-tools]
interfaces: [mcp-server-integration-testing]
status: complete
dateCreated: 20260220
dateUpdated: 20260220
---

# Slice 147: MCP Server — State Update Tools

## Overview

Add `context_summarize` to the MCP server — a purpose-built tool for updating a project's session state (recent events, additional notes). This completes the MCP server's tool surface for the v2 scope, delivering the last piece of the agent workflow described in the architecture: the ability to persist session summaries so that subsequent `context_build` calls reflect the latest project state.

## Value

The architecture defines three agent-facing operations:

1. `/newcontext [additional-instructions]` → **`context_build`** (slice 146, complete)
2. `/summarize [additional-state]` → **`context_summarize`** (this slice)
3. State management → **`project_update`** (slice 145, complete)

While `project_update` can technically modify `customData.recentEvents`, it's a generic tool that exposes the full project schema. `context_summarize` provides a streamlined, intent-clear interface that:

- Accepts a natural-language summary and persists it as `recentEvents`, so the next `context_build` call includes the latest session state.
- Optionally accepts `additionalNotes` for supplementary context.
- Returns the updated project as confirmation.
- Is discoverable by agents as a first-class workflow operation rather than a generic mutation.

This completes the "8 tools" MCP server surface. After this slice, the tool surface matches the architecture spec.

## Dependencies

| Dependency | Status | What This Slice Consumes |
|---|---|---|
| Slice 146: MCP Server — Context Tools | Complete | `contextTools.ts` shared helpers (`errorResult`, `textResult`, `jsonResult`), tool registration patterns, `generateContext` helper |
| Slice 145: MCP Server — Project Tools | Complete | Server infrastructure, `FileProjectStore`, `project_update` pattern for state mutation |
| Slice 144: Storage Migration | Complete (transitive) | `FileProjectStore.update()` for persisting changes |

No new external packages required.

## Architecture

### Component Structure

```
packages/mcp-server/
  src/
    index.ts                  — (existing) Add registerStateTools(server) call
    tools/
      projectTools.ts         — (existing, unchanged)
      contextTools.ts         — (existing) Import shared helpers from here
      stateTools.ts           — NEW: registerStateTools(server)
```

Following the established pattern: a single `stateTools.ts` file exports a registration function. The entry point (`index.ts`) calls it alongside the existing registrations.

### Data Flow

#### `context_summarize` Flow

```
MCP Client (Claude Code / Agent)
  │
  ├── Agent generates session summary text
  │
  ▼
context_summarize tool handler
  │
  ├── FileProjectStore.getById(projectId)     → ProjectData (existence check)
  │
  ├── Merge: existing customData + new recentEvents (+ optional additionalNotes)
  │
  ├── FileProjectStore.update(projectId, { customData })
  │
  ├── FileProjectStore.getById(projectId)     → updated ProjectData (read-back)
  │
  └── Return updated project as JSON
```

The flow is intentionally simple — the AI agent does the summarization work, this tool handles persistence. This mirrors how Claude Code's `/compact` works: the model generates the summary, the tool stores it.

## Technical Decisions

### Separate File vs Adding to Existing

**Decision**: Create `stateTools.ts` as a new file rather than adding to `contextTools.ts` or `projectTools.ts`.

Rationale:
- `contextTools.ts` is already 247 lines with 4 tools
- `projectTools.ts` handles CRUD; state tools have different semantics (workflow operations vs generic mutations)
- Keeps files under 300 lines per project guidelines
- Clean separation: project CRUD → `projectTools`, context generation → `contextTools`, workflow state → `stateTools`

### `context_summarize` vs `project_update` for State

`project_update` already supports `customData.recentEvents`. Why add `context_summarize`?

1. **Intent clarity**: An agent calling `context_summarize` is explicitly performing a workflow operation. Calling `project_update({ customData: { recentEvents: "..." } })` is a generic mutation that happens to update state.
2. **Simpler schema**: `context_summarize` takes `projectId` + `summary` + optional `additionalNotes`. No need to construct a nested `customData` object.
3. **Merge semantics**: `context_summarize` replaces `recentEvents` specifically. `project_update` with `customData` would need the caller to decide merge behavior for the entire `customData` object.
4. **Discoverability**: Agents scanning the tool list see `context_summarize` and immediately understand the workflow operation.

### Merge Strategy for `customData`

When `context_summarize` updates `recentEvents`, it preserves the other `customData` fields (`monorepoNote`, `availableTools`). The update is a targeted field replacement within `customData`, not a full `customData` overwrite.

Implementation approach: read current `customData`, spread existing fields, overlay new values, write back as a complete `customData` object.

### Helper Reuse

Import `errorResult` and `jsonResult` from `contextTools.ts` (already exported). No need to duplicate these helpers.

### Error Handling

Consistent with slices 145–146:
- Missing project → `{ isError: true }` referencing `project_list`
- Store failures → `{ isError: true }` with error message
- Empty summary → `{ isError: true }` asking for content

## Tool Specification

### `context_summarize`

Updates the project's session state — primarily the `recentEvents` field in `customData` — so that subsequent `context_build` calls include the latest project state summary.

**Description**: `"Update a project's session state summary. Persists the provided summary text as the project's recent events, which will be included in subsequent context_build output. Use this after significant work milestones, context switches, or to record session progress for continuity. Analogous to Claude Code's /compact but for project-level state."`

**Input Schema**:
```typescript
inputSchema: {
  projectId: z.string().describe(
    'Project ID to update. Use project_list to find IDs.'
  ),
  summary: z.string().describe(
    'Summary of recent events, session progress, or current project state. '
    + 'This replaces the current recentEvents field and will appear in subsequent context_build output.'
  ),
  additionalNotes: z.string().optional().describe(
    'Optional additional notes to persist alongside the summary. '
    + 'Replaces the current additionalNotes field if provided.'
  ),
}
```

**Annotations**: `{ destructiveHint: false, idempotentHint: true, openWorldHint: false }`

**Behavior**:
1. Validate that `summary` is non-empty after trimming — error if blank
2. Load project via `FileProjectStore.getById(projectId)` — error if not found
3. Construct updated `customData` by spreading existing `customData` fields and overlaying:
   - `recentEvents` ← `summary` (always)
   - `additionalNotes` ← `additionalNotes` (only if provided)
4. Call `FileProjectStore.update(projectId, { customData: mergedCustomData })`
5. Read back updated project via `FileProjectStore.getById(projectId)`
6. Return updated project as JSON

**Output** (JSON):
The full updated `ProjectData` object, same format as `project_get` and `project_update` responses. This confirms the update was applied and gives the caller the current state.

**Error — project not found**: `{ isError: true }` with text: `"Project not found: '{projectId}'. Use the project_list tool to see available projects and their IDs."`

**Error — empty summary**: `{ isError: true }` with text: `"Summary text is required. Provide a non-empty summary of recent events or session state."`

**Error — store failure**: `{ isError: true }` with the error message from the store operation.

## Integration Points

### Provides to Other Slices

- **Slice 150 (MCP Integration Testing)**: `context_summarize` is a test target — integration tests will verify that summarize → build round-trip produces context with the updated state.
- **Slice 151 (Documentation and Packaging)**: Tool description and usage patterns for the README.

### Consumes from Other Slices

- **Slice 146 (Context Tools)**: Shared helpers (`errorResult`, `jsonResult`) from `contextTools.ts`.
- **Slice 145 (Project Tools)**: `FileProjectStore` usage pattern, state mutation pattern from `project_update`.

### Registration in `index.ts`

```typescript
// In index.ts — additions only
import { registerStateTools } from './tools/stateTools.js';

// After registerContextTools(server):
registerStateTools(server);
```

## Testing Strategy

### Unit Tests (`src/__tests__/stateTools.test.ts`)

Mock `FileProjectStore` to isolate tool handler logic. Follow the same `InMemoryTransport` + `Client` pattern from slices 145–146.

Coverage:
- `context_summarize`: updates recentEvents and returns full project, preserves other customData fields, updates additionalNotes when provided, returns `isError` for missing project, returns `isError` for empty summary, handles store failure

### Lifecycle Test Update

Update `serverLifecycle.test.ts` to expect 8 tools (add `context_summarize` to the sorted list).

### Build Verification

- `pnpm -r build` succeeds cleanly
- `pnpm --filter context-forge-mcp test` passes
- Existing tests (24 current) continue to pass (no regressions)

## Success Criteria

1. `stateTools.ts` implements `context_summarize` with proper MCP registration
2. `context_summarize` updates `customData.recentEvents` with the provided summary text
3. `context_summarize` preserves other `customData` fields (monorepoNote, availableTools) during update
4. `context_summarize` optionally updates `additionalNotes` when provided
5. `context_summarize` returns the full updated project as JSON (read-back confirmation)
6. Proper `isError` responses for invalid inputs (missing project, empty summary)
7. `index.ts` registers state tools — all 8 tools appear in MCP tool listing
8. Unit tests cover happy path and error cases
9. Existing tests pass without modification (no regressions)
10. Full workspace build succeeds (`pnpm -r build`)

## Implementation Notes

### File Size

`stateTools.ts` will be compact — one tool, ~60-80 lines including imports and helpers. If future slices add more state/workflow tools, this file has room to grow without approaching the 300-line limit.

### Import Pattern

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { FileProjectStore } from '@context-forge/core/node';
import { errorResult, jsonResult } from './contextTools.js';
```

Reusing helpers from `contextTools.ts` avoids duplication.

### `customData` Merge Pattern

```typescript
const mergedCustomData = {
  ...existing.customData,
  recentEvents: summary,
  ...(additionalNotes !== undefined && { additionalNotes }),
};
await store.update(projectId, { customData: mergedCustomData });
```

This preserves `monorepoNote` and `availableTools` while replacing only the targeted fields.

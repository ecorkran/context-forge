---
docType: slice-design
slice: mcp-integration-test
project: context-forge
parent: project-documents/user/architecture/140-slices.context-forge-restructure.md
dependencies: [147-mcp-server-state-tools]
interfaces: [151-documentation-packaging]
status: not started
dateCreated: 20260222
dateUpdated: 20260222
---

# Slice Design: MCP Server Integration Testing

## Overview

Integration tests for `packages/mcp-server` that invoke MCP tools via the SDK's `InMemoryTransport` and verify correct responses against a fixture project with known configuration. Validates that the full tool surface (8 tools) produces expected output when wired to real `@context-forge/core` services — not mocked implementations.

## Value

- **End-to-end confidence**: Existing 31 unit tests use `vi.mock()` to stub `FileProjectStore`, `createContextPipeline`, and `SystemPromptParser`. This slice adds tests that exercise the real core pipeline, catching integration mismatches that mocks hide (e.g., schema drift, path resolution bugs, field mapping errors).
- **Fixture-based verification**: Context output is validated against a known fixture project, making tests deterministic and reproducible without depending on user data.
- **Regression safety**: Protects the MCP server contract as core internals evolve in future slices.

## Technical Scope

### In Scope

1. **Fixture project setup** — A self-contained project directory within `packages/mcp-server/tests/fixtures/` that the MCP tools can read from. Includes `projects.json` (storage file), a `default-statements.md`, and a `prompt.ai-project.system.md` so the full context pipeline can execute.

2. **Integration tests for all 8 tools** — Tests use `InMemoryTransport` (same pattern as existing unit tests) but without `vi.mock()` on core modules. Instead, they use `CONTEXT_FORGE_DATA_DIR` env override to point `FileProjectStore` at the fixture directory.

3. **Context output verification** — `context_build` and `template_preview` output is checked for expected structural elements (project name, slice, instruction text, section headers) rather than exact string matching, to avoid brittle tests that break on formatting changes.

4. **Tool contract tests** — Each tool's input validation, error messages, and output format (JSON vs plain text) are verified against the MCP protocol contract.

### Out of Scope

- Lifecycle/process-spawn tests (already covered by `serverLifecycle.test.ts`)
- Electron integration testing
- Performance benchmarks
- Transport layer testing (stdio, HTTP) — covered by SDK
- Modification of existing unit tests (they remain as-is for fast isolated feedback)

## Technical Design

### Fixture Project Structure

```
packages/mcp-server/tests/fixtures/integration-project/
  projects.json                    # FileProjectStore data file
  integration-project/             # The "project path" directory
    default-statements.md          # StatementManager fixture
    project-documents/
      ai-project-guide/
        project-guides/
          prompt.ai-project.system.md   # SystemPromptParser fixture
```

**`projects.json`** contains a single `ProjectData` entry:
- `id`: `project_integration_001`
- `name`: `integration-test-project`
- `template`: `default`
- `slice`: `100-slice.auth`
- `instruction`: `implementation`
- `projectPath`: absolute path resolved at test runtime via `import.meta.dirname`
- `isMonorepo`: `false`
- `workType`: `continue`
- `customData.recentEvents`: `"Integration test fixture — verifies MCP tool responses."`
- `customData.additionalNotes`: `"Additional notes for integration testing."`

The prompt and statement files can be copied from (or symlinked to) the existing `packages/core/tests/fixtures/test-project/` to avoid duplication. Alternatively, create minimal standalone versions — the key requirement is that they parse correctly and produce deterministic output.

### Test Architecture

#### Environment Isolation

Each test file sets `CONTEXT_FORGE_DATA_DIR` via `vi.stubEnv()` (or direct `process.env` assignment in `beforeAll`) to point at the fixture directory. This causes `FileProjectStore` to read from the fixture `projects.json` instead of the user's real data. The fixture `projects.json` references a `projectPath` that resolves to the fixture's project directory.

**Critical**: The `projectPath` in `projects.json` must be an absolute path. Since fixtures are committed with relative paths, each test's `beforeAll` should:
1. Read the fixture `projects.json`
2. Patch the `projectPath` field to the absolute path of the fixture project directory
3. Write the patched version to a temp copy
4. Set `CONTEXT_FORGE_DATA_DIR` to the temp directory

This avoids modifying committed fixtures and isolates tests from each other.

#### Server/Client Setup

Reuse the existing `createTestClient()` pattern from unit tests, but register **all three** tool groups (`registerProjectTools`, `registerContextTools`, `registerStateTools`) on a single `McpServer` instance — this mirrors the real server configuration and can catch tool registration conflicts.

```typescript
async function createIntegrationClient(): Promise<{ client: Client; cleanup: () => Promise<void> }> {
  const server = new McpServer({ name: 'integration-test', version: '0.1.0' });
  registerProjectTools(server);
  registerContextTools(server);
  registerStateTools(server);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: 'test-client', version: '1.0.0' });
  await client.connect(clientTransport);

  return { client, cleanup: async () => { await client.close(); await server.close(); } };
}
```

### Test Cases by Tool

#### 1. `project_list` (2-3 tests)
- Returns the fixture project in the list with correct summary fields (id, name, slice, template)
- Summary fields exclude `customData`, `createdAt` (contract verification)
- Count matches expected number of fixture projects

#### 2. `project_get` (2-3 tests)
- Returns full `ProjectData` for the fixture project ID, including `customData`
- Returns `isError` for a non-existent ID (same as unit test, but against real store)
- Returned `projectPath` matches the fixture path

#### 3. `project_update` (2-3 tests)
- Updates a field (e.g., `slice`) and read-back shows updated value
- Preserves unmodified fields after update
- State persists: a subsequent `project_get` reflects the update
- **Cleanup**: Restore original `projects.json` in `afterEach` to prevent test ordering issues

#### 4. `context_build` (3-4 tests)
- Returns non-empty plain text context for the fixture project
- Output contains expected structural markers: project name, slice name, instruction-related content
- Override parameters (e.g., `slice: 'override-slice'`) appear in generated output
- `additionalInstructions` are appended to the output

#### 5. `template_preview` (1-2 tests)
- Returns identical output to `context_build` for the same parameters (since they share the `generateContext` helper)
- Override parameters work correctly

#### 6. `prompt_list` (2-3 tests)
- Returns templates parsed from the fixture prompt file
- Each template has `name`, `key`, `parameterCount` fields
- Count matches the number of `#####` sections in the fixture prompt file

#### 7. `prompt_get` (2-3 tests)
- Retrieves a specific template by name (case-insensitive match)
- Retrieves a specific template by key (exact match)
- Returns `isError` for a non-existent template name
- Response includes the template content and metadata header

#### 8. `context_summarize` (2-3 tests)
- Updates `customData.recentEvents` and read-back confirms the change
- Preserves other `customData` fields (`monorepoNote`, `availableTools`)
- Optional `additionalNotes` parameter updates the corresponding field
- **Cleanup**: Restore `projects.json` after mutation tests

### Estimated Test Count

20-28 integration tests across 1-2 test files.

### File Organization

```
packages/mcp-server/tests/
  integration/
    mcpIntegration.test.ts      # All integration tests (or split by tool group)
  fixtures/
    integration-project/
      projects.json
      integration-project/
        default-statements.md
        project-documents/...
  helpers/
    integrationSetup.ts         # createIntegrationClient, fixture path helpers
```

Alternatively, if test count stays under ~30, a single `mcpIntegration.test.ts` file is sufficient (matches the project's preference for fewer, well-organized files over many small ones).

## Cross-Slice Dependencies

- **Depends on**: Slice 147 (MCP Server — State Update Tools) — all 8 tools must be implemented
- **Depends on**: Slice 149 (Core Test Suite) — core services must be tested and stable; the fixture project format is established there
- **Consumed by**: Slice 151 (Documentation and Packaging) — test suite validates the MCP server contract that documentation will describe

## Success Criteria

1. All integration tests pass with `pnpm test` in `packages/mcp-server`
2. Tests exercise real core services (no `vi.mock()` on `@context-forge/core/node`)
3. `context_build` produces output containing the fixture project's name, slice, and instruction content
4. Mutation tools (`project_update`, `context_summarize`) correctly persist and read back changes
5. Error cases (non-existent project, missing project path) return `isError: true` with helpful messages
6. Fixture project is self-contained — tests do not depend on user data or external state
7. Workspace builds clean after all changes

## Effort

2/5 — Moderate scope. Most patterns are established from Slice 149 (core tests) and existing MCP unit tests. Main work is fixture creation and writing the integration test cases.

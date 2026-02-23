---
slice: mcp-integration-test
project: context-forge
lld: user/slices/150-slice.mcp-integration-test.md
dependencies: [147-mcp-server-state-tools, 149-integration-core-test]
projectState: Slices 140-149 complete. Core extraction done, 224 core tests passing. MCP server has 31 unit tests across 3 tool files + 1 lifecycle test. All 8 tools implemented. No integration tests exist yet.
dateCreated: 20260223
dateUpdated: 20260223
status: not started
---

## Context Summary

- Working on mcp-integration-test slice (150)
- All prerequisites complete: core test suite (149), MCP server state tools (147), all 8 MCP tools implemented
- Existing MCP unit tests use `vi.mock()` on `@context-forge/core/node` — this slice adds integration tests with real core services
- Fixture project under `packages/mcp-server/tests/fixtures/integration-project/` with known config
- `InMemoryTransport` + `CONTEXT_FORGE_DATA_DIR` env override for isolation
- This slice delivers 20-28 integration tests covering all 8 MCP tools against real core pipeline
- Next slice: 151 (Documentation and Packaging)

---

## Tasks

### Phase 1: Test Infrastructure

- [ ] **Task 1: Create fixture project directory and files** (Effort: 2/5)
  - Create `packages/mcp-server/tests/fixtures/integration-project/` directory structure per slice design §Fixture Project Structure
  - Create `projects.json` with a single `ProjectData` entry:
    - `id`: `project_integration_001`
    - `name`: `integration-test-project`
    - `template`: `default`
    - `slice`: `100-slice.auth`
    - `instruction`: `implementation`
    - `projectPath`: placeholder (patched at runtime)
    - `isMonorepo`: `false`
    - `workType`: `continue`
    - `customData.recentEvents` and `customData.additionalNotes` with known marker strings
  - Create `integration-project/default-statements.md` — copy or adapt from `packages/core/tests/fixtures/test-project/default-statements.md`, ensuring all 7 default statement keys are present with `## header` + `<!-- key: ..., editable: ... -->` format
  - Create `integration-project/project-documents/ai-project-guide/project-guides/prompt.ai-project.system.md` — copy or adapt from core fixture, ensuring valid YAML frontmatter and at least the `Context Initialization`, `Tool Usage`, and `implementation` sections
  - [ ] Directory structure matches slice design diagram
  - [ ] `projects.json` is valid JSON with all required `ProjectData` fields
  - [ ] Statement and prompt files parse correctly (verified in Task 3)

- [ ] **Task 2: Create integration test helper module** (Effort: 2/5)
  - Create `packages/mcp-server/tests/helpers/integrationSetup.ts`
  - Implement `createIntegrationClient()` per slice design §Server/Client Setup:
    - Creates `McpServer` with all 3 tool groups registered (`registerProjectTools`, `registerContextTools`, `registerStateTools`)
    - Uses `InMemoryTransport.createLinkedPair()` for in-process communication
    - Returns `{ client, cleanup }` where `cleanup` closes both client and server
  - Implement `setupFixtureEnv()` helper:
    - Reads the fixture `projects.json`
    - Patches `projectPath` to absolute path using `import.meta.dirname`
    - Writes patched version to a temp directory (use `fs.mkdtemp`)
    - Sets `CONTEXT_FORGE_DATA_DIR` to the temp directory
    - Returns a cleanup function that restores env and removes temp dir
  - Implement `resetFixtureData()` helper:
    - Re-patches and re-writes `projects.json` to temp dir (for use after mutation tests)
  - [ ] No `any` types
  - [ ] `createIntegrationClient` registers all 3 tool groups
  - [ ] `setupFixtureEnv` produces a temp dir with patched absolute path
  - [ ] File compiles with `pnpm build` in `packages/mcp-server`

- [ ] **Task 3: Smoke test — verify fixture + helper wiring** (Effort: 1/5)
  - Create `packages/mcp-server/tests/integration/mcpIntegration.test.ts` with initial structure
  - Add a `beforeAll` that calls `setupFixtureEnv()` and `createIntegrationClient()`
  - Add a `afterAll` that calls both cleanup functions
  - Write one smoke test: call `project_list` via the client and assert it returns a non-empty array containing the fixture project
  - [ ] Smoke test passes with `pnpm test` in `packages/mcp-server`
  - [ ] Existing 31 unit tests still pass
  - [ ] No `vi.mock()` on `@context-forge/core` in the integration test file

- [ ] **Task 4: Commit — test infrastructure and smoke test** (Effort: 1/5)
  - Stage: fixture directory, helper module, integration test file
  - Verify `pnpm test` passes in `packages/mcp-server`
  - [ ] Clean commit with descriptive message
  - [ ] All tests pass (unit + integration)

### Phase 2: Project Tool Integration Tests

- [ ] **Task 5: `project_list` integration tests** (Effort: 1/5)
  - Add `describe('project_list')` block in `mcpIntegration.test.ts`
  - Test cases (2-3 tests):
    1. Returns fixture project with correct summary fields (id, name, slice, template)
    2. Summary excludes `customData` and `createdAt` (contract verification)
    3. Count matches expected number of fixture projects (1)
  - [ ] All `project_list` tests pass
  - [ ] Assertions verify actual field values against fixture data

- [ ] **Task 6: `project_get` integration tests** (Effort: 1/5)
  - Add `describe('project_get')` block
  - Test cases (2-3 tests):
    1. Returns full `ProjectData` for fixture project ID, including `customData` fields
    2. Returns `isError` with helpful message for non-existent ID
    3. Returned `projectPath` is an absolute path pointing to fixture directory
  - [ ] All `project_get` tests pass
  - [ ] Error case verifies `isError: true` in response

- [ ] **Task 7: `project_update` integration tests** (Effort: 2/5)
  - Add `describe('project_update')` block
  - Test cases (2-3 tests):
    1. Updates `slice` field and subsequent `project_get` returns updated value
    2. Preserves unmodified fields (e.g., `name`, `customData`) after update
    3. State persists across calls (update → get → verify)
  - Call `resetFixtureData()` in `afterEach` to prevent test ordering issues
  - [ ] All `project_update` tests pass
  - [ ] Mutation tests clean up after themselves
  - [ ] Read-back verification confirms persistence

- [ ] **Task 8: Commit — project tool integration tests** (Effort: 1/5)
  - Verify `pnpm test` passes in `packages/mcp-server`
  - [ ] Clean commit with descriptive message
  - [ ] All tests pass

### Phase 3: Context Tool Integration Tests

- [ ] **Task 9: `context_build` integration tests** (Effort: 2/5)
  - Add `describe('context_build')` block
  - Test cases (3-4 tests):
    1. Returns non-empty plain text context for the fixture project
    2. Output contains expected structural markers: project name (`integration-test-project`), slice name (`100-slice.auth`), instruction-related content
    3. Override parameters (e.g., `slice: 'override-slice'`) appear in generated output
    4. `additionalInstructions` parameter content appears in output
  - Use structural/contains assertions — not exact string matching
  - [ ] All `context_build` tests pass
  - [ ] Output verified to contain fixture project markers
  - [ ] Override parameters produce observable changes in output

- [ ] **Task 10: `template_preview` integration tests** (Effort: 1/5)
  - Add `describe('template_preview')` block
  - Test cases (1-2 tests):
    1. Returns output with same structural elements as `context_build` for identical parameters
    2. Override parameters work correctly (e.g., different slice name appears in output)
  - [ ] All `template_preview` tests pass
  - [ ] Output structure matches `context_build` expectations

- [ ] **Task 11: `prompt_list` integration tests** (Effort: 1/5)
  - Add `describe('prompt_list')` block
  - Test cases (2-3 tests):
    1. Returns templates parsed from fixture prompt file
    2. Each template has `name`, `key`, `parameterCount` fields
    3. Count matches number of `#####` sections in the fixture prompt file
  - [ ] All `prompt_list` tests pass
  - [ ] Template count matches fixture file sections

- [ ] **Task 12: `prompt_get` integration tests** (Effort: 1/5)
  - Add `describe('prompt_get')` block
  - Test cases (2-3 tests):
    1. Retrieves a specific template by name (case-insensitive match)
    2. Retrieves a specific template by key (exact match)
    3. Returns `isError` for non-existent template name
  - [ ] All `prompt_get` tests pass
  - [ ] Error case returns `isError: true`

- [ ] **Task 13: Commit — context tool integration tests** (Effort: 1/5)
  - Verify `pnpm test` passes in `packages/mcp-server`
  - [ ] Clean commit with descriptive message
  - [ ] All tests pass

### Phase 4: State Tool Integration Tests

- [ ] **Task 14: `context_summarize` integration tests** (Effort: 2/5)
  - Add `describe('context_summarize')` block
  - Test cases (2-3 tests):
    1. Updates `customData.recentEvents` and `project_get` read-back confirms the change
    2. Preserves other `customData` fields (`additionalNotes`) after summary update
    3. Optional `additionalNotes` parameter updates the corresponding field
  - Call `resetFixtureData()` in `afterEach` to clean up mutations
  - [ ] All `context_summarize` tests pass
  - [ ] Mutation tests clean up after themselves
  - [ ] Read-back verification confirms persistence

- [ ] **Task 15: Commit — state tool integration tests** (Effort: 1/5)
  - Verify `pnpm test` passes in `packages/mcp-server`
  - [ ] Clean commit with descriptive message
  - [ ] All tests pass

### Phase 5: Validation and Finalization

- [ ] **Task 16: Full test suite verification** (Effort: 1/5)
  - Run `pnpm test` in `packages/mcp-server` — all unit + integration tests pass
  - Run `pnpm build` from workspace root — clean build
  - Verify no `vi.mock()` on `@context-forge/core` in any integration test file
  - Verify fixture project is self-contained (no references to user data)
  - [ ] All MCP server tests pass (unit + integration)
  - [ ] Workspace builds clean
  - [ ] No `vi.mock()` on core in integration tests
  - [ ] Fixture is self-contained

- [ ] **Task 17: Final commit and DEVLOG update** (Effort: 1/5)
  - Stage any remaining changes
  - Update DEVLOG with slice 150 completion entry (list commits)
  - Final `pnpm build` verification
  - [ ] DEVLOG updated with Phase 7 completion
  - [ ] Clean commit
  - [ ] All tests pass

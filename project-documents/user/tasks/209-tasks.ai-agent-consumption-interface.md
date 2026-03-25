---
docType: tasks
slice: ai-agent-consumption-interface
project: context-forge
lld: user/slices/209-slice.ai-agent-consumption-interface.md
dependencies: [208]
projectState: Slice 208 complete (compound commands, cf list, slash commands, --json). All 1357 tests passing (716 core, 359 CLI, 176 MCP, 106 electron). Build clean. Version 0.6.23 published.
dateCreated: 20260324
dateUpdated: 20260325
status: complete
---

## Context Summary
- Working on slice 209: AI-Agent Consumption Interface
- Depends on slice 208 (compound commands must be stable before exposing catalog)
- Seven deliverables: `cf help --json`, `cf version --json`, structured JSON errors, MCP `agent_quickstart` tool, idempotency audit, `docs/AGENT-INTEGRATION.md`, package README updates
- Current error handling: `UserError` class in `packages/cli/src/utils/errors.ts`, `handleError()` exits with code 1 and plain text
- MCP tool pattern: `registerXxxTool(server: McpServer)` with `server.registerTool()` — see `agentGuideTool.ts` for reference
- Commander program setup in `packages/cli/src/index.ts` with `.version(version)` already registered

---

## Section 1: Machine-Readable Command Catalog (`cf help --json`)

- [x] **1.1 Implement `cf help --json` command**
  - File: `packages/cli/src/index.ts`
  - Add a `--json` option to the program's help command (or intercept `cf help --json`)
  - Walk Commander's `program.commands` tree recursively to build the catalog
  - Output schema per slice design: `{ version, commands: [{ name, description, args, options, subcommands }] }`
  - Use `printJson` or `JSON.stringify` to stdout
  - Implementation approach: create a helper function `buildCommandCatalog(cmd: Command)` that recursively extracts command metadata
  - Args: extract from `cmd.registeredArguments` — include `name`, `required`, `description`
  - Options: extract from `cmd.options` — include `flag` (long flag string), `description`
  - Subcommands: recurse into `cmd.commands`
  - The `version` field comes from `package.json` (already imported in index.ts)
  - [x] `cf help --json` outputs valid JSON to stdout
  - [x] Catalog includes all registered commands (build, list, concept, slice, etc.)
  - [x] Subcommands are nested correctly (e.g., `list` has `projects`, `slices`, etc.)
  - [x] Args show `required` flag
  - [x] TypeScript compiles

- [x] **1.2 Tests for `cf help --json`**
  - File: `packages/cli/tests/commands/help.test.ts` (new)
  - Test that output is valid JSON
  - Test that output contains `version` field matching package.json
  - Test that `commands` array is non-empty
  - Test that a known command (e.g., `build`) appears with expected structure
  - Test that `list` command has subcommands array
  - Test that command args include `required` field
  - [x] All tests pass
  - [x] TypeScript compiles

**Commit**: `feat(cli): add cf help --json machine-readable command catalog`

---

## Section 2: Version Introspection (`cf version --json`)

- [x] **2.1 Add breaking changes constant**
  - File: `packages/cli/src/utils/breaking-changes.ts` (new)
  - Create a simple constant array:
    ```typescript
    export interface BreakingChange { since: string; change: string; }
    export const BREAKING_CHANGES: BreakingChange[] = [
      { since: '0.6.20', change: 'cf slice list → cf list slices (and other artifact list commands)' },
    ];
    ```
  - This array is manually maintained; cleared on minor version bumps
  - [x] File created with correct types
  - [x] TypeScript compiles

- [x] **2.2 Implement `cf version --json` command**
  - File: `packages/cli/src/index.ts`
  - Add a `version` subcommand (separate from Commander's built-in `--version`)
  - When `--json` is passed, output: `{ name, version, guideVersion, breaking }`
  - `guideVersion`: use the guide status logic from core (or a simpler approach — read the guide's package.json or frontmatter)
  - `breaking`: import from the constant created in 2.1
  - Without `--json`, print human-readable version string (same as current `cf --version`)
  - [x] `cf version --json` outputs valid JSON with all four fields
  - [x] `cf version` (no flag) prints version string
  - [x] `guideVersion` is populated or `null` if guides not installed
  - [x] TypeScript compiles

- [x] **2.3 Tests for `cf version --json`**
  - File: `packages/cli/tests/commands/version.test.ts` (new)
  - Test JSON output contains `name`, `version`, `guideVersion`, `breaking` keys
  - Test `version` matches package.json
  - Test `breaking` is an array
  - Test non-JSON output is a plain string
  - [x] All tests pass

**Commit**: `feat(cli): add cf version --json with breaking changes tracking`

---

## Section 3: Structured JSON Errors

- [x] **3.1 Add error codes to `UserError`**
  - File: `packages/cli/src/utils/errors.ts`
  - Add `ErrorCode` type and optional `code` property to `UserError`:
    ```typescript
    export type ErrorCode = 'PROJECT_NOT_FOUND' | 'FIELD_NOT_FOUND' | 'INVALID_ARGUMENT'
      | 'INVALID_VALUE' | 'MISSING_CONFIG' | 'ARTIFACT_NOT_FOUND' | 'READ_ONLY' | 'ALREADY_EXISTS';
    ```
  - `UserError` constructor: `constructor(message: string, code?: ErrorCode)`
  - Optional `suggestion` property for the fix hint
  - [x] `UserError` accepts optional `code` and `suggestion`
  - [x] Existing `new UserError(msg)` calls still work (code is optional)
  - [x] TypeScript compiles

- [x] **3.2 Add error codes to existing `UserError` throw sites**
  - Files: `packages/cli/src/commands/workflow.ts`, `project.ts`, and other command files
  - Audit all `new UserError(...)` calls and add appropriate error codes
  - Key mappings:
    - `requireNumericIndex()` → `INVALID_ARGUMENT`
    - `projectSetAction` field not found → `FIELD_NOT_FOUND`
    - `projectSetAction` read-only field → `READ_ONLY`
    - Project resolution failures → `PROJECT_NOT_FOUND`
    - Missing config (no project path, etc.) → `MISSING_CONFIG`
    - Artifact index doesn't resolve → `ARTIFACT_NOT_FOUND`
  - Where existing error messages contain a suggestion line, populate the `suggestion` property
  - [x] All `UserError` throw sites have appropriate error codes
  - [x] No existing behavior changed for non-JSON consumers
  - [x] TypeScript compiles

- [x] **3.3 JSON error output in `handleError`**
  - File: `packages/cli/src/utils/errors.ts`
  - Add JSON mode detection: module-level flag `let jsonMode = false` with `export function setJsonMode(): void`
  - Also support `CF_JSON=1` env var as alternative trigger
  - When JSON mode is active and error is `UserError`, output to stderr:
    ```json
    { "error": true, "code": "INVALID_ARGUMENT", "message": "...", "suggestion": "..." }
    ```
  - When JSON mode is active and error is not `UserError`, output:
    ```json
    { "error": true, "code": "UNKNOWN", "message": "..." }
    ```
  - Wire `setJsonMode()` into the `--json` option parsing (in index.ts or a shared pre-parse hook)
  - [x] `handleError` outputs JSON when JSON mode is active
  - [x] `handleError` outputs plain text when JSON mode is not active (unchanged)
  - [x] `CF_JSON=1` env var activates JSON error mode
  - [x] TypeScript compiles

- [x] **3.4 Tests for structured JSON errors**
  - File: `packages/cli/tests/utils/errors.test.ts` (new or extend existing)
  - Test `UserError` with code and suggestion
  - Test `handleError` in JSON mode outputs structured JSON to stderr
  - Test `handleError` in non-JSON mode outputs plain text (regression)
  - Test unknown error in JSON mode outputs `code: "UNKNOWN"`
  - [x] All tests pass

**Commit**: `feat(cli): add structured JSON errors with error codes`

---

## Section 4: MCP `agent_quickstart` Tool

- [x] **4.1 Create `agent_quickstart` MCP tool**
  - New file: `packages/mcp-server/src/tools/agentQuickstartTool.ts`
  - Follow the pattern in `agentGuideTool.ts` and `agentOnboardTool.ts`
  - No input parameters (empty schema)
  - Return structured JSON as a text content block containing the schema from the slice design:
    - `server`, `version`, `capabilities` (grouped by intent), `quickStart` (ordered steps), `cliEquivalents`
  - Build version from package.json (same as `serverVersionTool`)
  - Capabilities groups: projectManagement, contextGeneration, workflowGuidance, introspection, configuration
  - [x] Tool registered and returns structured JSON
  - [x] All capability groups match actual registered tools
  - [x] TypeScript compiles

- [x] **4.2 Register `agent_quickstart` in MCP server index**
  - File: `packages/mcp-server/src/index.ts`
  - Import and call `registerAgentQuickstartTool(server)`
  - Place after `registerAgentOnboardTool` (registration order matters per comment in file)
  - [x] Tool appears in MCP tool list
  - [x] Registration order maintained

- [x] **4.3 Tests for `agent_quickstart`**
  - File: `packages/mcp-server/tests/tools/agentQuickstartTool.test.ts` (new)
  - Test that tool returns valid JSON with expected top-level keys
  - Test that `capabilities` contains expected groups
  - Test that `quickStart` is a non-empty array
  - Test that `cliEquivalents` maps to real tool names
  - [x] All tests pass

**Commit**: `feat(mcp): add agent_quickstart tool for machine consumption`

---

## Section 5: Idempotency Audit

- [x] **5.1 Add idempotency check to `projectSetAction`**
  - File: `packages/cli/src/commands/project.ts`
  - After resolving the new value but before writing, compare with the current value
  - If unchanged: print `"{field} already set to {value}"` to stderr, return without writing (exit 0)
  - Must handle both worktree-scoped and project-scoped fields
  - For worktree fields: compare against current worktree context value
  - For project fields: compare against current project value
  - [x] `cf set slice 208` when already 208 prints "already set" and exits 0
  - [x] `cf set phase P6` when already P6 prints "already set" and exits 0
  - [x] First-time set still works normally
  - [x] TypeScript compiles

- [x] **5.2 Tests for idempotency**
  - File: `packages/cli/tests/commands/project.test.ts` (extend existing)
  - Test: setting same value twice — second call produces "already set" message
  - Test: setting different value — normal "Updated" message
  - [x] All tests pass
  - [x] Existing tests still pass

**Commit**: `fix(cli): add idempotency check to projectSetAction`

---

## Section 6: Agent Integration Documentation

- [x] **6.1 Create `docs/AGENT-INTEGRATION.md`**
  - File: `docs/AGENT-INTEGRATION.md`
  - Content per slice design (< 100 lines):
    - Recommended integration path: MCP server > CLI `--json` > CLI text parsing
    - Command discovery: `cf help --json`
    - Breaking change detection: `cf version --json` → `breaking` array
    - Error handling: `--json` mode, error codes
    - Idempotency guarantees
    - CLI vs MCP: when to use which
  - Target audience: AI agent developers, not end users
  - [x] File created with correct frontmatter
  - [x] Content covers all six topics from slice design
  - [x] Under 100 lines

- [x] **6.2 Link from root README and MCP README**
  - Files: `README.md`, `packages/mcp-server/README.md`
  - Add a brief "AI Agent Integration" section with link to `docs/AGENT-INTEGRATION.md`
  - [x] Links added to both READMEs
  - [x] Links point to correct path

**Commit**: `docs: add agent integration guide`

---

## Section 7: Package README Updates

- [x] **7.1 Update CLI README**
  - File: `packages/cli/README.md`
  - Update Quick Start to show `cf init` as single-command setup
  - Replace old command names (`cf arch list`, `cf slice list`) with current (`cf list initiatives`, `cf list slices`)
  - Add compound commands section (`cf concept`, `cf slice 208`, etc.)
  - Add v0.6 changelog entry covering compound commands, `cf list`, guides uninstall
  - Remove Electron references from Architecture section
  - [x] No references to old command names remain
  - [x] Compound commands documented
  - [x] Changelog updated

- [x] **7.2 Update MCP README**
  - File: `packages/mcp-server/README.md`
  - Add missing tool categories: Workflow (`workflow_status`, `workflow_next`, `workflow_check`), Worktrees (`worktree_*`), Guides (`guide_*`), Meta (`agent_guide`, `agent_onboard`, `agent_quickstart`, `server_version`)
  - Update Prerequisites to recommend `cf guides install` instead of curl bootstrap
  - Remove stale `config_list` reference if present
  - [x] All tool categories listed
  - [x] Prerequisites current

- [x] **7.3 Update Core README**
  - File: `packages/core/README.md`
  - De-emphasize Electron: change "MCP server and Electron desktop app" framing to "MCP server, CLI, and other Node.js consumers"
  - Verify export path examples are current
  - [x] Electron de-emphasized
  - [x] Export paths accurate

**Commit**: `docs: update CLI, MCP, and core package READMEs`

---

## Section 8: Final Validation

- [x] **8.1 Full build and test verification**
  - Run `pnpm build` from project root — verify clean
  - Run `pnpm test` from project root — verify all tests pass
  - [x] Build succeeds with no errors
  - [x] All tests pass (core, CLI, MCP, electron)

- [x] **8.2 Run verification walkthrough**
  - Execute the verification walkthrough from the slice design
  - Update walkthrough with actual commands, expected output, corrections, and caveats
  - [x] All verification steps pass

- [x] **8.3 Update slice design and DEVLOG**
  - Update slice design status to `complete`
  - Check off slice 209 in `200-slices.developer-onboarding.md`
  - Update DEVLOG with implementation summary and commit hashes
  - [x] Slice status updated
  - [x] Slice plan updated
  - [x] DEVLOG updated

**Commit**: `docs: mark slice 209 complete, update DEVLOG`

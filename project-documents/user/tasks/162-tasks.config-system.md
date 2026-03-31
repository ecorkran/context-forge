---
docType: tasks
slice: config-system
project: context-forge
lld: user/slices/162-slice.config-system.md
dependencies: [161-project-schema-standardization]
projectState: Slice 161 complete (schema standardization). Core types, storage, MCP tools all use new field names. All 392 tests pass.
dateCreated: 20260228
dateUpdated: 20260228
status: complete
---

## Context Summary

- Working on **162-slice.config-system** — persistent two-tier TOML configuration
- Slice 161 (project schema standardization) is complete; all tests pass, build succeeds
- This slice adds `packages/core/src/config/` module and three new MCP tools (`config_set`, `config_get`, `config_list`)
- `default_project` config key integration makes `projectId` optional across 7 existing MCP tools
- Dependencies: `smol-toml` (not yet installed), `FileProjectStore`, `getStoragePath()`, `ProjectData.projectPath`
- Next planned slice: 163 (Artifact Introspection Engine)

---

## Tasks

### 1. Setup and Dependencies

- [x] **1.1 Add `smol-toml` dependency to `packages/core`**
  - [x] Run `npm install smol-toml` in `packages/core/`
  - [x] Verify `smol-toml` appears in `packages/core/package.json` dependencies
  - [x] Verify `npm run build` succeeds from project root
  - [x] Commit: `chore(core): add smol-toml dependency`

### 2. Config Paths Module

- [x] **2.1 Create `packages/core/src/config/configPaths.ts`**
  - [x] `getUserConfigPath()` — returns `{getStoragePath()}/config.toml`
  - [x] `getProjectConfigPath(projectPath: string)` — returns `{projectPath}/.context-forge.toml`
  - [x] Both functions reuse `getStoragePath()` from `storage/storagePaths.ts` for user path
  - [x] No file I/O — pure path computation only
  - [x] Success: functions return correct paths; types compile cleanly

### 3. Config Keys Registry

- [x] **3.1 Create `packages/core/src/config/ConfigKeys.ts`**
  - [x] Define `ConfigKeyDefinition` interface: `{ type, default, description, validate?, enum? }`
  - [x] Define `CONFIG_KEYS` record with initial keys per slice design:
    1. `default_project` (string, default `""`)
    2. `guide.auto_update` (boolean, default `false`)
    3. `guide.source` (string, default `""`)
    4. `guide.git_strategy` (string enum `["submodule", "clone", "manual"]`, default `"submodule"`)
  - [x] Export `ConfigKeyDefinition` type and `CONFIG_KEYS` constant
  - [x] Success: types compile; all 4 keys have type, default, and description

### 4. ConfigManager Implementation

- [x] **4.1 Create `packages/core/src/config/ConfigManager.ts`**
  - [x] Implement TOML read utility: parse file with `smol-toml`, return empty object on `ENOENT`
  - [x] Implement TOML write utility: stringify and write, create parent directories if needed
  - [x] Implement dotted key resolution: `resolveKey(obj, "guide.source")` → traverses nested objects
  - [x] Implement dotted key setter: `setKey(obj, "guide.source", value)` → creates intermediate objects
  - [x] Implement `ConfigManager` class with constructor accepting optional `projectPath`
  - [x] Implement `get(key)` method:
    - [x] Reject unknown keys (not in `CONFIG_KEYS`) with explicit error
    - [x] Check project config first (if `projectPath` provided), then user config, then built-in default
    - [x] Return `ConfigResult { key, value, source, description }`
  - [x] Implement `set(key, value, scope)` method:
    - [x] Reject unknown keys with explicit error
    - [x] Validate value type matches `ConfigKeyDefinition.type`
    - [x] Validate against `enum` if defined
    - [x] Run custom `validate` function if defined
    - [x] Reject `scope: "project"` when `projectPath` not provided
    - [x] Read existing TOML, set key, write back
  - [x] Implement `list()` method:
    - [x] Enumerate all keys from `CONFIG_KEYS`
    - [x] Resolve each key's value and source
    - [x] Return `ConfigListEntry[]` with `type` and `defaultValue` included
  - [x] Export `ConfigResult`, `ConfigListEntry`, `ConfigManager`
  - [x] Success: class compiles; all public methods have proper types

### 5. Config Module Barrel and Core Exports

- [x] **5.1 Create `packages/core/src/config/index.ts`**
  - [x] Re-export from `ConfigKeys.ts`: `ConfigKeyDefinition`, `CONFIG_KEYS`
  - [x] Re-export from `ConfigManager.ts`: `ConfigResult`, `ConfigListEntry`, `ConfigManager`
  - [x] Re-export from `configPaths.ts`: `getUserConfigPath`, `getProjectConfigPath`

- [x] **5.2 Export config module from `packages/core/src/node.ts`**
  - [x] Add `export * from './config/index.js'` (Node.js-only export, same pattern as storage)

- [x] **5.3 Build verification**
  - [x] Run `npm run build` from project root
  - [x] Verify no type errors
  - [x] Commit: `feat(core): add config module — ConfigManager, ConfigKeys, configPaths`

### 6. ConfigManager Unit Tests

- [x] **6.1 Create `packages/core/src/__tests__/config/ConfigManager.test.ts`**
  - [x] Test setup: use temp directories via `CONTEXT_FORGE_DATA_DIR` (matching existing storage test pattern)
  - [x] Test `get()` — unknown key returns explicit error
  - [x] Test `get()` — returns built-in default when no config files exist
  - [x] Test `get()` — reads user config value, reports `source: "user"`
  - [x] Test `get()` — reads project config value, reports `source: "project"`
  - [x] Test `get()` — project config overrides user config (precedence)
  - [x] Test `get()` — user config overrides default (precedence)
  - [x] Test `get()` — handles missing config files gracefully (no error)
  - [x] Test `get()` — resolves dotted keys (`guide.source`) from TOML sections
  - [x] Test `set()` — writes to user-level TOML file
  - [x] Test `set()` — writes to project-level TOML file
  - [x] Test `set()` — creates parent directories if config file doesn't exist yet
  - [x] Test `set()` — rejects unknown key
  - [x] Test `set()` — rejects type mismatch (e.g., string value for boolean key)
  - [x] Test `set()` — rejects invalid enum value
  - [x] Test `set()` — rejects project scope when no projectPath provided
  - [x] Test `set()` then `get()` — round-trip for each value type (string, boolean)
  - [x] Test `set()` — preserves existing keys in TOML file when adding new key
  - [x] Test `list()` — returns all registered keys with defaults when no config files
  - [x] Test `list()` — shows correct source for overridden values
  - [x] All tests pass
  - [x] Commit: `test(core): add ConfigManager unit tests`

### 7. MCP Config Tools

- [x] **7.1 Create `packages/mcp-server/src/tools/configTools.ts`**
  - [x] Implement `registerConfigTools(server: McpServer)` following existing tool registration pattern
  - [x] Implement `config_get` tool:
    - [x] Zod schema: `key` (string, required), `projectPath` (string, optional)
    - [x] Annotation: `readOnlyHint: true`
    - [x] Handler: instantiate `ConfigManager`, call `get()`, return JSON result
    - [x] Error handling: return `errorResult` for unknown key
  - [x] Implement `config_set` tool:
    - [x] Zod schema: `key` (string, required), `value` (z.union of string/boolean/number, required), `scope` (z.enum `["user", "project"]`, required), `projectPath` (string, optional)
    - [x] Annotation: `destructiveHint: false`, `idempotentHint: true`
    - [x] Handler: instantiate `ConfigManager`, call `set()`, return confirmation JSON
    - [x] Error handling: return `errorResult` for validation failures
  - [x] Implement `config_list` tool:
    - [x] Zod schema: `projectPath` (string, optional)
    - [x] Annotation: `readOnlyHint: true`
    - [x] Handler: instantiate `ConfigManager`, call `list()`, include config file paths in response
  - [x] Import helpers (`errorResult`, `jsonResult`) from `contextTools.ts`
  - [x] Success: compiles with no type errors

- [x] **7.2 Wire `registerConfigTools` into MCP server**
  - [x] Import `registerConfigTools` in `packages/mcp-server/src/index.ts`
  - [x] Call `registerConfigTools(server)` alongside existing tool registrations
  - [x] Build succeeds
  - [x] Commit: `feat(mcp-server): add config_set, config_get, config_list tools`

### 8. MCP Config Tools Tests

- [x] **8.1 Create `packages/mcp-server/src/__tests__/configTools.test.ts`**
  - [x] Test setup: use InMemoryTransport pattern (matching existing MCP test files)
  - [x] Test `config_get` — returns default value for unconfigured key
  - [x] Test `config_get` — returns user-configured value with source
  - [x] Test `config_get` — returns error for unknown key
  - [x] Test `config_set` — sets user-level value, subsequent `config_get` returns it
  - [x] Test `config_set` — sets project-level value with `projectPath`
  - [x] Test `config_set` — returns error for invalid type
  - [x] Test `config_set` — returns error for invalid enum value
  - [x] Test `config_list` — returns all keys with values and sources
  - [x] All tests pass
  - [x] Commit: `test(mcp-server): add config tools tests`

### 9. default_project Integration — resolveProjectId Helper

- [x] **9.1 Create `packages/mcp-server/src/tools/resolveProjectId.ts`**
  - [x] Implement `resolveProjectId(explicitId?, configProjectPath?)` per slice design
  - [x] Returns `explicitId` immediately if provided
  - [x] Falls back to `ConfigManager.get('default_project')` when `explicitId` undefined
  - [x] Throws descriptive error when neither explicit ID nor default_project configured
  - [x] Success: compiles; logic is straightforward

### 10. default_project Integration — Update Project Tools

- [x] **10.1 Update `projectTools.ts` — make `projectId` optional**
  - [x] `project_get`: change `projectId` from required to optional in Zod schema
  - [x] `project_get`: call `resolveProjectId()` at start of handler
  - [x] `project_update`: change `projectId` from required to optional in Zod schema
  - [x] `project_update`: call `resolveProjectId()` at start of handler
  - [x] Success: both tools work with explicit `projectId` and with config fallback

### 11. default_project Integration — Update Context & State Tools

- [x] **11.1 Update `contextTools.ts` — make `projectId` optional**
  - [x] `context_build`: change `projectId` from required to optional
  - [x] `context_build`: call `resolveProjectId()` at start of handler
  - [x] `template_preview`: change `projectId` from required to optional
  - [x] `template_preview`: call `resolveProjectId()` at start of handler
  - [x] `prompt_list`: change `projectId` from required to optional
  - [x] `prompt_list`: call `resolveProjectId()` at start of handler
  - [x] `prompt_get`: change `projectId` from required to optional
  - [x] `prompt_get`: call `resolveProjectId()` at start of handler

- [x] **11.2 Update `stateTools.ts` — make `projectId` optional**
  - [x] `context_summarize`: change `projectId` from required to optional
  - [x] `context_summarize`: call `resolveProjectId()` at start of handler
  - [x] Success: all 7 tools compile with optional `projectId`
  - [x] Commit: `feat(mcp-server): integrate default_project fallback across MCP tools`

### 12. default_project Integration Tests

- [x] **12.1 Add tests for `resolveProjectId` behavior**
  - [x] Test: returns explicit ID when provided
  - [x] Test: returns configured default_project when explicit ID omitted
  - [x] Test: throws descriptive error when neither provided
  - [x] Test: existing MCP tool tests still pass (no regressions from optional `projectId`)

- [x] **12.2 Update existing MCP tool tests if needed**
  - [x] Verify existing tests still pass with `projectId` now optional
  - [x] Add at least one test per tool file verifying default_project fallback works
  - [x] All tests pass
  - [x] Commit: `test(mcp-server): add default_project integration tests`

### 13. Final Verification

- [x] **13.1 Full build and test pass**
  - [x] Run `npm run build` from project root — no errors
  - [x] Run `npm test` from project root — all tests pass
  - [x] Verify no TypeScript errors (`npx tsc --noEmit` in each package)
  - [x] Commit any remaining fixes
  - [x] Final commit: `feat: complete slice 162 — config system`

---
docType: tasks
slice: config-system
project: context-forge
lld: user/slices/162-slice.config-system.md
dependencies: [161-project-schema-standardization]
projectState: Slice 161 complete (schema standardization). Core types, storage, MCP tools all use new field names. All 392 tests pass.
dateCreated: 20260228
dateUpdated: 20260228
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

- [ ] **1.1 Add `smol-toml` dependency to `packages/core`**
  - [ ] Run `npm install smol-toml` in `packages/core/`
  - [ ] Verify `smol-toml` appears in `packages/core/package.json` dependencies
  - [ ] Verify `npm run build` succeeds from project root
  - [ ] Commit: `chore(core): add smol-toml dependency`

### 2. Config Paths Module

- [ ] **2.1 Create `packages/core/src/config/configPaths.ts`**
  - [ ] `getUserConfigPath()` — returns `{getStoragePath()}/config.toml`
  - [ ] `getProjectConfigPath(projectPath: string)` — returns `{projectPath}/.context-forge.toml`
  - [ ] Both functions reuse `getStoragePath()` from `storage/storagePaths.ts` for user path
  - [ ] No file I/O — pure path computation only
  - [ ] Success: functions return correct paths; types compile cleanly

### 3. Config Keys Registry

- [ ] **3.1 Create `packages/core/src/config/ConfigKeys.ts`**
  - [ ] Define `ConfigKeyDefinition` interface: `{ type, default, description, validate?, enum? }`
  - [ ] Define `CONFIG_KEYS` record with initial keys per slice design:
    1. `default_project` (string, default `""`)
    2. `guide.auto_update` (boolean, default `false`)
    3. `guide.source` (string, default `""`)
    4. `guide.git_strategy` (string enum `["submodule", "clone", "manual"]`, default `"submodule"`)
  - [ ] Export `ConfigKeyDefinition` type and `CONFIG_KEYS` constant
  - [ ] Success: types compile; all 4 keys have type, default, and description

### 4. ConfigManager Implementation

- [ ] **4.1 Create `packages/core/src/config/ConfigManager.ts`**
  - [ ] Implement TOML read utility: parse file with `smol-toml`, return empty object on `ENOENT`
  - [ ] Implement TOML write utility: stringify and write, create parent directories if needed
  - [ ] Implement dotted key resolution: `resolveKey(obj, "guide.source")` → traverses nested objects
  - [ ] Implement dotted key setter: `setKey(obj, "guide.source", value)` → creates intermediate objects
  - [ ] Implement `ConfigManager` class with constructor accepting optional `projectPath`
  - [ ] Implement `get(key)` method:
    - [ ] Reject unknown keys (not in `CONFIG_KEYS`) with explicit error
    - [ ] Check project config first (if `projectPath` provided), then user config, then built-in default
    - [ ] Return `ConfigResult { key, value, source, description }`
  - [ ] Implement `set(key, value, scope)` method:
    - [ ] Reject unknown keys with explicit error
    - [ ] Validate value type matches `ConfigKeyDefinition.type`
    - [ ] Validate against `enum` if defined
    - [ ] Run custom `validate` function if defined
    - [ ] Reject `scope: "project"` when `projectPath` not provided
    - [ ] Read existing TOML, set key, write back
  - [ ] Implement `list()` method:
    - [ ] Enumerate all keys from `CONFIG_KEYS`
    - [ ] Resolve each key's value and source
    - [ ] Return `ConfigListEntry[]` with `type` and `defaultValue` included
  - [ ] Export `ConfigResult`, `ConfigListEntry`, `ConfigManager`
  - [ ] Success: class compiles; all public methods have proper types

### 5. Config Module Barrel and Core Exports

- [ ] **5.1 Create `packages/core/src/config/index.ts`**
  - [ ] Re-export from `ConfigKeys.ts`: `ConfigKeyDefinition`, `CONFIG_KEYS`
  - [ ] Re-export from `ConfigManager.ts`: `ConfigResult`, `ConfigListEntry`, `ConfigManager`
  - [ ] Re-export from `configPaths.ts`: `getUserConfigPath`, `getProjectConfigPath`

- [ ] **5.2 Export config module from `packages/core/src/node.ts`**
  - [ ] Add `export * from './config/index.js'` (Node.js-only export, same pattern as storage)

- [ ] **5.3 Build verification**
  - [ ] Run `npm run build` from project root
  - [ ] Verify no type errors
  - [ ] Commit: `feat(core): add config module — ConfigManager, ConfigKeys, configPaths`

### 6. ConfigManager Unit Tests

- [ ] **6.1 Create `packages/core/src/__tests__/config/ConfigManager.test.ts`**
  - [ ] Test setup: use temp directories via `CONTEXT_FORGE_DATA_DIR` (matching existing storage test pattern)
  - [ ] Test `get()` — unknown key returns explicit error
  - [ ] Test `get()` — returns built-in default when no config files exist
  - [ ] Test `get()` — reads user config value, reports `source: "user"`
  - [ ] Test `get()` — reads project config value, reports `source: "project"`
  - [ ] Test `get()` — project config overrides user config (precedence)
  - [ ] Test `get()` — user config overrides default (precedence)
  - [ ] Test `get()` — handles missing config files gracefully (no error)
  - [ ] Test `get()` — resolves dotted keys (`guide.source`) from TOML sections
  - [ ] Test `set()` — writes to user-level TOML file
  - [ ] Test `set()` — writes to project-level TOML file
  - [ ] Test `set()` — creates parent directories if config file doesn't exist yet
  - [ ] Test `set()` — rejects unknown key
  - [ ] Test `set()` — rejects type mismatch (e.g., string value for boolean key)
  - [ ] Test `set()` — rejects invalid enum value
  - [ ] Test `set()` — rejects project scope when no projectPath provided
  - [ ] Test `set()` then `get()` — round-trip for each value type (string, boolean)
  - [ ] Test `set()` — preserves existing keys in TOML file when adding new key
  - [ ] Test `list()` — returns all registered keys with defaults when no config files
  - [ ] Test `list()` — shows correct source for overridden values
  - [ ] All tests pass
  - [ ] Commit: `test(core): add ConfigManager unit tests`

### 7. MCP Config Tools

- [ ] **7.1 Create `packages/mcp-server/src/tools/configTools.ts`**
  - [ ] Implement `registerConfigTools(server: McpServer)` following existing tool registration pattern
  - [ ] Implement `config_get` tool:
    - [ ] Zod schema: `key` (string, required), `projectPath` (string, optional)
    - [ ] Annotation: `readOnlyHint: true`
    - [ ] Handler: instantiate `ConfigManager`, call `get()`, return JSON result
    - [ ] Error handling: return `errorResult` for unknown key
  - [ ] Implement `config_set` tool:
    - [ ] Zod schema: `key` (string, required), `value` (z.union of string/boolean/number, required), `scope` (z.enum `["user", "project"]`, required), `projectPath` (string, optional)
    - [ ] Annotation: `destructiveHint: false`, `idempotentHint: true`
    - [ ] Handler: instantiate `ConfigManager`, call `set()`, return confirmation JSON
    - [ ] Error handling: return `errorResult` for validation failures
  - [ ] Implement `config_list` tool:
    - [ ] Zod schema: `projectPath` (string, optional)
    - [ ] Annotation: `readOnlyHint: true`
    - [ ] Handler: instantiate `ConfigManager`, call `list()`, include config file paths in response
  - [ ] Import helpers (`errorResult`, `jsonResult`) from `contextTools.ts`
  - [ ] Success: compiles with no type errors

- [ ] **7.2 Wire `registerConfigTools` into MCP server**
  - [ ] Import `registerConfigTools` in `packages/mcp-server/src/index.ts`
  - [ ] Call `registerConfigTools(server)` alongside existing tool registrations
  - [ ] Build succeeds
  - [ ] Commit: `feat(mcp-server): add config_set, config_get, config_list tools`

### 8. MCP Config Tools Tests

- [ ] **8.1 Create `packages/mcp-server/src/__tests__/configTools.test.ts`**
  - [ ] Test setup: use InMemoryTransport pattern (matching existing MCP test files)
  - [ ] Test `config_get` — returns default value for unconfigured key
  - [ ] Test `config_get` — returns user-configured value with source
  - [ ] Test `config_get` — returns error for unknown key
  - [ ] Test `config_set` — sets user-level value, subsequent `config_get` returns it
  - [ ] Test `config_set` — sets project-level value with `projectPath`
  - [ ] Test `config_set` — returns error for invalid type
  - [ ] Test `config_set` — returns error for invalid enum value
  - [ ] Test `config_list` — returns all keys with values and sources
  - [ ] All tests pass
  - [ ] Commit: `test(mcp-server): add config tools tests`

### 9. default_project Integration — resolveProjectId Helper

- [ ] **9.1 Create `packages/mcp-server/src/tools/resolveProjectId.ts`**
  - [ ] Implement `resolveProjectId(explicitId?, configProjectPath?)` per slice design
  - [ ] Returns `explicitId` immediately if provided
  - [ ] Falls back to `ConfigManager.get('default_project')` when `explicitId` undefined
  - [ ] Throws descriptive error when neither explicit ID nor default_project configured
  - [ ] Success: compiles; logic is straightforward

### 10. default_project Integration — Update Project Tools

- [ ] **10.1 Update `projectTools.ts` — make `projectId` optional**
  - [ ] `project_get`: change `projectId` from required to optional in Zod schema
  - [ ] `project_get`: call `resolveProjectId()` at start of handler
  - [ ] `project_update`: change `projectId` from required to optional in Zod schema
  - [ ] `project_update`: call `resolveProjectId()` at start of handler
  - [ ] Success: both tools work with explicit `projectId` and with config fallback

### 11. default_project Integration — Update Context & State Tools

- [ ] **11.1 Update `contextTools.ts` — make `projectId` optional**
  - [ ] `context_build`: change `projectId` from required to optional
  - [ ] `context_build`: call `resolveProjectId()` at start of handler
  - [ ] `template_preview`: change `projectId` from required to optional
  - [ ] `template_preview`: call `resolveProjectId()` at start of handler
  - [ ] `prompt_list`: change `projectId` from required to optional
  - [ ] `prompt_list`: call `resolveProjectId()` at start of handler
  - [ ] `prompt_get`: change `projectId` from required to optional
  - [ ] `prompt_get`: call `resolveProjectId()` at start of handler

- [ ] **11.2 Update `stateTools.ts` — make `projectId` optional**
  - [ ] `context_summarize`: change `projectId` from required to optional
  - [ ] `context_summarize`: call `resolveProjectId()` at start of handler
  - [ ] Success: all 7 tools compile with optional `projectId`
  - [ ] Commit: `feat(mcp-server): integrate default_project fallback across MCP tools`

### 12. default_project Integration Tests

- [ ] **12.1 Add tests for `resolveProjectId` behavior**
  - [ ] Test: returns explicit ID when provided
  - [ ] Test: returns configured default_project when explicit ID omitted
  - [ ] Test: throws descriptive error when neither provided
  - [ ] Test: existing MCP tool tests still pass (no regressions from optional `projectId`)

- [ ] **12.2 Update existing MCP tool tests if needed**
  - [ ] Verify existing tests still pass with `projectId` now optional
  - [ ] Add at least one test per tool file verifying default_project fallback works
  - [ ] All tests pass
  - [ ] Commit: `test(mcp-server): add default_project integration tests`

### 13. Final Verification

- [ ] **13.1 Full build and test pass**
  - [ ] Run `npm run build` from project root — no errors
  - [ ] Run `npm test` from project root — all tests pass
  - [ ] Verify no TypeScript errors (`npx tsc --noEmit` in each package)
  - [ ] Commit any remaining fixes
  - [ ] Final commit: `feat: complete slice 162 — config system`

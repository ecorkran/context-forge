---
docType: slice-design
slice: config-system
project: context-forge
parent: user/architecture/160-slices.project-workflow-system.md
dependencies: [161-project-schema-standardization]
interfaces: [163-artifact-introspection-engine, 164-workflow-navigator, 165-consistency-checker, 780-guide-management]
status: not started
dateCreated: 20260228
dateUpdated: 20260228
---

# Slice 162: Config System

## Overview

This slice adds persistent two-tier TOML configuration to Context Forge. Users set preferences once — at user level (`~/.config/context-forge/config.toml`) or project level (`{projectPath}/.context-forge.toml`) — and those preferences flow into MCP tool behavior without repetitive parameter passing.

Three new MCP tools (`config_set`, `config_get`, `config_list`) manage configuration. A `ConfigManager` in `packages/core/src/config/` implements the resolution chain: MCP tool parameter → project config → user config → built-in default. The config file format is TOML, parsed by `smol-toml` (zero-dependency, spec-compliant).

## Value

- **Eliminates repetitive parameter passing.** The `default_project` config key alone removes the need to pass `projectId` on every MCP tool call — the most common friction point in multi-tool workflows.
- **Foundation for configurable behavior.** Slices 163–166 add workflow tools that need user-tunable settings (`workflow.auto_advance`, `workflow.auto_fix`). The config system provides a uniform mechanism for all such settings.
- **Human-editable persistence.** TOML files are readable, editable, and commentable. Users can inspect and modify configuration without MCP tools.
- **External consumers.** The 780-band guide management slices depend on config keys (`guide.auto_update`, `guide.source`, `guide.git_strategy`) defined here.

## Technical Scope

### Included

1. **`packages/core/src/config/` module** with:
   - `ConfigKeys.ts` — typed key registry with defaults, descriptions, and validators
   - `ConfigManager.ts` — two-tier resolution, read/write, source reporting
   - `configPaths.ts` — user-level and project-level file path resolution
   - `index.ts` — barrel exports

2. **Three new MCP tools** in `packages/mcp-server/src/tools/configTools.ts`:
   - `config_set` — set a key at user or project scope
   - `config_get` — get resolved value with source indication
   - `config_list` — list all keys with values, defaults, and resolution sources

3. **`default_project` integration** — project tools (`project_get`, `project_update`, `context_build`, `template_preview`, `context_summarize`, `prompt_list`, `prompt_get`) fall back to `default_project` config when `projectId` is not provided

4. **Initial config key definitions**:
   - `default_project` — project ID used when `projectId` omitted
   - `guide.auto_update` — whether to auto-update guides (boolean, default: `false`)
   - `guide.source` — guide source URL/path (string, default: `""`)
   - `guide.git_strategy` — guide update strategy (string enum, default: `"submodule"`)

5. **Unit tests** for ConfigManager resolution logic, ConfigKeys validation, and MCP tool behavior

### Excluded

- Guide management features (install, update, sync) — remains at 780-band
- Workflow config keys (`workflow.auto_advance`, `workflow.auto_fix`) — defined by their respective slices (164, 165) using the config key registration mechanism built here
- UI for config management — no Electron UI currently active
- Config file watching / hot reload — read on demand is sufficient (per architectural principle: read-heavy, write-light)

## Dependencies

### Prerequisites

- **Slice 161 (complete):** Standardized `ProjectData` schema. Config keys reference the standardized field names (`fileSlice`, `fileTasks`, etc.). `default_project` resolves against stored project IDs via `FileProjectStore`.
- **`smol-toml` package:** Must be added to `packages/core/package.json`. Zero runtime dependencies — parses and stringifies TOML.

### Interfaces Required

- `FileProjectStore.getById(id)` — to validate `default_project` references a real project
- `getStoragePath()` from `storagePaths.ts` — to determine user-level config directory
- `ProjectData.projectPath` — to determine project-level config file location

## Architecture

### Component Structure

```
packages/core/src/config/
├── ConfigKeys.ts        # Typed key registry: key name → { type, default, description, validate? }
├── ConfigManager.ts     # Resolution chain, TOML read/write, source reporting
├── configPaths.ts       # getUserConfigPath(), getProjectConfigPath(projectPath)
└── index.ts             # Barrel exports

packages/mcp-server/src/tools/
└── configTools.ts       # registerConfigTools(server) — config_set, config_get, config_list
```

`ConfigManager` is instantiated per-request (like `FileProjectStore`) with an optional `projectPath`. When `projectPath` is provided, the project-level config file participates in resolution. When omitted, only user-level config and defaults apply.

### Data Flow

```
MCP tool call (e.g., config_get key="default_project")
  │
  ▼
ConfigManager.get("default_project", { projectPath? })
  │
  ├── 1. Check project config: {projectPath}/.context-forge.toml
  │      (skipped if projectPath not provided)
  │
  ├── 2. Check user config: ~/.config/context-forge/config.toml
  │      (env-paths resolved, same base as project storage)
  │
  └── 3. Return built-in default from ConfigKeys registry
  │
  ▼
Return { key, value, source: "project" | "user" | "default", description }
```

For `config_set`, the write target is determined by the `scope` parameter:

```
config_set(key, value, scope="user")
  │
  ▼
ConfigManager.set(key, value, scope)
  │
  ├── Validate key exists in ConfigKeys registry
  ├── Validate value against key's type and validator
  ├── Read existing TOML file (or start empty)
  ├── Set the key's value (nested keys use TOML sections: guide.source → [guide] source = ...)
  └── Write TOML file back (preserving existing content)
```

### Resolution Precedence

The resolution chain for a config value, in priority order:

1. **MCP tool parameter** (explicit override) — not handled by ConfigManager; the MCP tool handler checks if a parameter was provided and uses it directly, only falling back to config when the parameter is absent.
2. **Project config** (`{projectPath}/.context-forge.toml`) — project-specific overrides.
3. **User config** (`~/.config/context-forge/config.toml`) — user-wide defaults.
4. **Built-in default** — hardcoded in `ConfigKeys` registry.

This matches the familiar CSS specificity model: more specific wins.

## Technical Decisions

### TOML Format with `smol-toml`

**Decision:** Use TOML as the config file format, parsed by `smol-toml`.

**Rationale:**
- TOML is designed for configuration — flat sections, typed values, inline comments.
- `smol-toml` is zero-dependency, spec-compliant (TOML v1.0.0), and fast. It supports both parse and stringify.
- JSON would lose comments. YAML is overly complex. `.env` doesn't support structure.

**Trade-off:** `smol-toml`'s `stringify` does not preserve comments from the original file. When writing back a config file, existing comments are lost. This is acceptable for an MVP — comments are a convenience, not data. If comment preservation becomes important, we can switch to a line-aware approach later.

### Flat Key Namespace with Dot Notation

**Decision:** Config keys use dot-separated namespaces: `default_project`, `guide.auto_update`, `workflow.auto_advance`. In TOML files, dots map to sections:

```toml
default_project = "project_abc123"

[guide]
auto_update = false
source = ""
git_strategy = "submodule"
```

**Rationale:** Dot notation is the natural TOML idiom. It groups related settings visually and allows `config_list` to present keys hierarchically. The `ConfigKeys` registry stores the full dotted key as the key identifier — no separate "namespace" concept.

### ConfigManager Instantiated Per-Request

**Decision:** `ConfigManager` is created fresh per MCP tool call, like `FileProjectStore`.

**Rationale:** Config reads are infrequent, files are small (kilobytes), and there's no state to carry between requests. Creating per-request avoids stale reads and eliminates concurrency concerns. This matches the existing pattern established by `FileProjectStore`.

### default_project Fallback in Project Tools

**Decision:** All MCP tools that accept `projectId` gain optional behavior: if `projectId` is not provided and `default_project` is configured, use the configured default. If neither is provided, return a clear error.

**Implementation approach:** A shared helper function `resolveProjectId(explicitId?, projectPath?)` in the MCP tools layer (not in core) handles this resolution. It reads from ConfigManager only when `explicitId` is undefined.

**Scope of change:** The MCP tool schemas must change `projectId` from required to optional for: `project_get`, `project_update`, `context_build`, `template_preview`, `context_summarize`, `prompt_list`, `prompt_get`. The `project_list` tool does not take `projectId` and is unaffected.

### Config Keys as Static Registry

**Decision:** Config keys are defined as a static `Record<string, ConfigKeyDefinition>` in `ConfigKeys.ts`. New keys are added by modifying this registry.

```typescript
interface ConfigKeyDefinition {
  type: 'string' | 'boolean' | 'number';
  default: string | boolean | number;
  description: string;
  validate?: (value: unknown) => boolean;
  enum?: string[];  // for string keys with restricted values
}
```

**Rationale:** A static registry is simple, type-safe, and discoverable. `config_list` can enumerate all known keys with descriptions and defaults. `config_set` can validate against the registry before writing. Future slices add keys by extending this file — no runtime registration needed.

### User Config Path

**Decision:** User-level config at `{getStoragePath()}/config.toml`. This reuses the `env-paths` resolution from `storagePaths.ts` — on macOS: `~/Library/Preferences/context-forge/config.toml`. Respects `CONTEXT_FORGE_DATA_DIR` override for testing.

**Rationale:** Colocates config with project data (stored at the same base path). One directory for all Context Forge data. `CONTEXT_FORGE_DATA_DIR` override works for both project storage and config in tests.

### Project Config Path

**Decision:** Project-level config at `{projectPath}/.context-forge.toml`. This file lives in the project root (alongside `project-documents/`, `.git/`, etc.).

**Rationale:** Follows the convention of tool config files in project root (`.eslintrc`, `.prettierrc`, `tsconfig.json`). The leading dot keeps it unobtrusive. The file is optional — its absence means "no project overrides."

**Consideration:** The `.context-forge.toml` file should be committed to version control (it's project configuration, not secrets). A note in the MCP tool description should mention this.

## Implementation Details

### ConfigKeys Registry

```typescript
// packages/core/src/config/ConfigKeys.ts

export interface ConfigKeyDefinition {
  type: 'string' | 'boolean' | 'number';
  default: string | boolean | number;
  description: string;
  validate?: (value: unknown) => boolean;
  enum?: string[];
}

export const CONFIG_KEYS: Record<string, ConfigKeyDefinition> = {
  'default_project': {
    type: 'string',
    default: '',
    description: 'Default project ID. Used when projectId is omitted from MCP tool calls.',
  },
  'guide.auto_update': {
    type: 'boolean',
    default: false,
    description: 'Automatically update ai-project-guide on context_build.',
  },
  'guide.source': {
    type: 'string',
    default: '',
    description: 'Git URL or local path for ai-project-guide source.',
  },
  'guide.git_strategy': {
    type: 'string',
    default: 'submodule',
    description: 'How to manage the ai-project-guide directory.',
    enum: ['submodule', 'clone', 'manual'],
  },
};
```

### ConfigManager API

```typescript
// packages/core/src/config/ConfigManager.ts

export interface ConfigResult {
  key: string;
  value: string | boolean | number;
  source: 'project' | 'user' | 'default';
  description: string;
}

export interface ConfigListEntry extends ConfigResult {
  type: string;
  defaultValue: string | boolean | number;
}

export class ConfigManager {
  constructor(projectPath?: string);

  /** Get resolved value for a key. */
  get(key: string): Promise<ConfigResult>;

  /** Set a value at the specified scope. */
  set(key: string, value: string | boolean | number, scope: 'user' | 'project'): Promise<void>;

  /** List all known keys with resolved values and sources. */
  list(): Promise<ConfigListEntry[]>;
}
```

Internal implementation reads TOML files via `smol-toml` parse, resolves nested keys (e.g., `guide.source` → TOML `[guide]` section, `source` key), and writes back with `smol-toml` stringify.

### MCP Tool Specifications

#### config_get

```
Tool: config_get
Description: Get the resolved value of a configuration key. Shows the effective value
  and which level (project, user, or default) it comes from. Use config_list to see
  all available keys.
Input:
  key: string (required) — Config key (e.g., "default_project", "guide.auto_update")
  projectPath: string (optional) — Project path for project-level resolution
Output: JSON { key, value, source, description }
Annotations: readOnlyHint: true
```

#### config_set

```
Tool: config_set
Description: Set a configuration value at user or project level. User-level config
  applies to all projects. Project-level config overrides user-level for that project.
  Use config_list to see available keys and their types.
Input:
  key: string (required) — Config key to set
  value: string | boolean | number (required) — Value to set
  scope: enum["user", "project"] (required) — Where to store the setting
  projectPath: string (optional) — Required when scope is "project"
Output: JSON { key, value, scope, configFile } — confirmation of what was written
Annotations: destructiveHint: false, idempotentHint: true
```

#### config_list

```
Tool: config_list
Description: List all configuration keys with their resolved values, sources, types,
  and defaults. Shows which keys have been overridden at project or user level.
Input:
  projectPath: string (optional) — Include project-level overrides in resolution
Output: JSON { entries: ConfigListEntry[], configFiles: { user, project? } }
Annotations: readOnlyHint: true
```

### default_project Integration

A shared helper in the MCP tools layer:

```typescript
// packages/mcp-server/src/tools/resolveProjectId.ts

export async function resolveProjectId(
  explicitId: string | undefined,
  configProjectPath?: string
): Promise<string> {
  if (explicitId) return explicitId;

  const config = new ConfigManager(configProjectPath);
  const result = await config.get('default_project');

  if (!result.value || result.value === '') {
    throw new Error(
      'No project ID provided and no default_project configured. ' +
      'Either pass projectId or set a default: config_set key="default_project" value="<id>" scope="user"'
    );
  }

  return result.value as string;
}
```

Existing MCP tool schemas change `projectId` from required to optional. Tool handlers call `resolveProjectId()` before proceeding.

### TOML Read/Write

Reading:
```typescript
import { parse } from 'smol-toml';

async function readToml(filePath: string): Promise<Record<string, unknown>> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return parse(content);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw err;
  }
}
```

Resolving a dotted key from a TOML object:
```typescript
function resolveKey(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}
```

Writing a dotted key into a TOML object:
```typescript
function setKey(obj: Record<string, unknown>, key: string, value: unknown): void {
  const parts = key.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current) || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}
```

## Integration Points

### Provides To

- **Slices 163–166 (workflow tools):** Config key registration mechanism and `ConfigManager` API. Each slice adds its own keys to the `CONFIG_KEYS` registry.
- **780-band (guide management):** `guide.*` config keys ready for consumption. Guide management features use `ConfigManager.get('guide.auto_update')` etc. to determine behavior.
- **All existing MCP tools:** `default_project` fallback via `resolveProjectId()` helper.

### Consumes From

- **Slice 161 (complete):** `FileProjectStore` for validating `default_project`, `ProjectData.projectPath` for project-level config location, `getStoragePath()` for user-level config location.

## Success Criteria

- [ ] `config_set` correctly writes values to user-level and project-level TOML files
- [ ] `config_get` returns the correct resolved value with accurate source indication (`project`, `user`, or `default`)
- [ ] `config_list` enumerates all registered keys with values, sources, types, and defaults
- [ ] Resolution precedence is correct: project config overrides user config overrides default
- [ ] Config files are valid TOML, human-readable, and editable
- [ ] Unknown keys are rejected by `config_set` and `config_get` with clear error messages
- [ ] Type validation works: setting a boolean key to a string value is rejected
- [ ] `default_project` is consumed by project tools — omitting `projectId` uses the configured default
- [ ] Missing config files are handled gracefully (treated as empty, not errors)
- [ ] `CONTEXT_FORGE_DATA_DIR` override works for user config path (testability)
- [ ] All new code has unit tests; all existing tests continue to pass
- [ ] Build succeeds with no type errors

## Implementation Notes

### Suggested Implementation Order

1. Add `smol-toml` to `packages/core/package.json`
2. Create `configPaths.ts` — `getUserConfigPath()`, `getProjectConfigPath(projectPath)`
3. Create `ConfigKeys.ts` — key definitions with types, defaults, validators
4. Create `ConfigManager.ts` — get/set/list with TOML read/write and resolution chain
5. Create `config/index.ts` — barrel exports
6. Export from `@context-forge/core/node` entry point
7. Unit tests for ConfigManager (resolution precedence, type validation, missing files, nested keys)
8. Create `configTools.ts` — `registerConfigTools(server)` with three MCP tools
9. Create `resolveProjectId.ts` helper
10. Update existing MCP tools: make `projectId` optional, integrate `resolveProjectId()`
11. Unit tests for config MCP tools
12. Update existing MCP tool tests for optional `projectId` behavior
13. Wire `registerConfigTools` into MCP server `index.ts`
14. Build and run all tests

### Testing Strategy

- **ConfigManager unit tests:** Resolution precedence (project > user > default), missing files, invalid keys, type validation, nested key resolution, write-then-read round trips
- **Config MCP tool tests:** `config_set`/`config_get`/`config_list` via InMemoryTransport (matching existing MCP test pattern)
- **default_project integration tests:** Verify existing tools work without explicit `projectId` when `default_project` is configured; verify clear error when neither is provided
- **Isolation:** Tests use `CONTEXT_FORGE_DATA_DIR` + temp directories (matching existing storage test pattern)

### Effort

2/5 — Well-understood pattern. Small surface area (~4 new core files, 1 new MCP tool file, minor updates to existing tool files). `smol-toml` handles the hard part (parsing). The `default_project` integration touches more files but each change is mechanical.

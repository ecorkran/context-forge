---
docType: slice-design
slice: remove-bundled-prompt-asset
project: context-forge
parent: user/architecture/160-slices.project-workflow-system.md
dependencies: [172-guide-management]
interfaces: []
dateCreated: 20260318
dateUpdated: 20260318
status: not_started
---

# Slice 179: Remove Bundled Prompt Asset

## Overview

Remove the bundled fallback prompt file (`packages/core/assets/prompt.ai-project.system.md`) and the `default_project` config key. Both are vestigial mechanisms that mask misconfiguration instead of surfacing it. `cf init` installs guides automatically; the bundled asset drifts from the live guide, requires manual sync after every prompt change, and has caused incidents where agents modify it directly. The `default_project` config key is the last resolution path that makes the bundled fallback reachable in MCP, and the CLI already emits a deprecation warning when it's used.

## Value

Eliminates the #1 source of prompt file confusion. The bundled asset was modified directly by an agent during slice 189 implementation — an incident that required multiple reverts and guide reinstallation. Removing it eliminates the temptation entirely. Removing `default_project` simplifies the project resolution chain from three steps to two (`--project` flag → CWD match), making the system easier to reason about and removing a code path no one uses.

## Technical Scope

**Included:**
- Delete `packages/core/assets/prompt.ai-project.system.md`
- Remove `BUNDLED_PROMPT_PATH` constant and fallback from `CoreServiceFactory.resolvePromptFilePath()`
- Make `resolvePromptFilePath` throw when no guide is installed
- Update MCP `resolvePromptFileForTools` — error instead of silent bundled fallback
- Remove `default_project` from `CONFIG_KEYS` in `packages/core/src/config/ConfigKeys.ts`
- Remove step 3 (`default_project` config lookup) from CLI `resolveProjectWorktree()` in `packages/cli/src/utils/project.ts`
- Remove step 2 (`default_project` config lookup) from MCP `resolveProjectId()` in `packages/mcp-server/src/tools/resolveProjectId.ts`
- Update all MCP tool `.describe()` strings that reference `default_project`
- Update tests across core, CLI, and MCP packages
- Remove "sync bundled asset" references from documentation

**Excluded:**
- No changes to guide install/update logic
- No changes to `cf init` flow
- No changes to CWD-based project resolution
- No removal of `guide.auto_update` config key (unused but harmless)

## Dependencies

### Prerequisites
- **172 (Guide Management)** — complete. Provides `cf guide install` / `cf guide update` and the guide detection infrastructure.

### Interfaces Required
- `CoreServiceFactory.resolvePromptFilePath()` — modified (no longer accepts missing path)
- `ConfigKeys.ts` — modified (key removed)
- `resolveProjectId()` (MCP) — modified (simpler chain)
- `resolveProjectWorktree()` (CLI) — modified (step 3 removed)

## Architecture

### Migration Plan

This is a removal/simplification slice. The migration is straightforward: delete the fallback paths and make the error cases explicit.

#### 1. Bundled Prompt Asset Removal

**Source (current):**
```
CoreServiceFactory.resolvePromptFilePath(projectPath?)
  → if projectPath && project-local exists → return project-local path
  → else → return BUNDLED_PROMPT_PATH (packages/core/assets/...)
```

**Destination (after):**
```
CoreServiceFactory.resolvePromptFilePath(projectPath)
  → projectPath is required (not optional)
  → if project-local exists → return project-local path
  → else → throw Error("No prompt file found at {path}. Run `cf guide install`.")
```

**Consumers to update:**
- `CoreServiceFactory.createContextPipeline()` — already passes `projectPath` (no change needed, but error now propagates)
- `contextTools.ts: resolvePromptFileForTools()` — remove bundled fallback, let error propagate with user-friendly message
- `contextTools.ts: prompt_list` tool — catch error, return guidance message
- `contextTools.ts: prompt_get` tool — catch error, return guidance message

#### 2. `default_project` Config Key Removal

**Source (current):**

CLI resolution chain (4 steps):
```
1. --project flag → findByNameOrId
2. CWD detection → findProjectByCwd (worktree-aware)
3. default_project config → findByNameOrId  ← REMOVE
4. Throw UserError with guidance
```

MCP resolution chain (3 steps):
```
1. explicitId → return immediately
2. default_project config → return value  ← REMOVE
3. Throw Error with guidance
```

**Destination (after):**

CLI resolution chain (3 steps):
```
1. --project flag → findByNameOrId
2. CWD detection → findProjectByCwd (worktree-aware)
3. Throw UserError with guidance
```

MCP resolution chain (2 steps):
```
1. explicitId → return immediately
2. Throw Error with guidance
```

**Consumers to update:**
- `packages/cli/src/utils/project.ts: resolveProjectWorktree()` — remove step 3 block (lines ~168-188)
- `packages/mcp-server/src/tools/resolveProjectId.ts` — remove step 2 block (lines ~22-28), update error message
- `packages/core/src/config/ConfigKeys.ts` — remove `default_project` entry
- All MCP tool `.describe()` strings mentioning `default_project` — update to say "Omit to resolve from CWD." or similar
- `packages/cli/src/commands/project.ts` — remove `default_project` lookup for `cf project list` active marker
- `packages/cli/src/index.ts` — update help text that references `default_project`

**Error message updates:**

MCP `resolveProjectId` error (after):
```
No project ID provided. Either pass a projectId argument, or ensure the
MCP client is running from a registered project directory.
  Use project_list to see available projects.
  Use project_create to register a new project.
```

CLI `resolveProjectWorktree` step 4 error (after — unchanged, step 3 is simply gone):
```
No project specified and no registered project found at current path.
  cf init                    # register current directory as a project
  --project <name>           # specify a project explicitly
  cf project list            # see registered projects
```

### File Changes

**Deleted:**
- `packages/core/assets/prompt.ai-project.system.md`

**Modified (core):**
- `packages/core/src/services/CoreServiceFactory.ts` — remove `BUNDLED_PROMPT_PATH`, make `projectPath` required, throw on missing guide
- `packages/core/src/config/ConfigKeys.ts` — remove `default_project` key
- `packages/core/src/node.ts` — `resolvePromptFilePath` export unchanged but signature changes

**Modified (CLI):**
- `packages/cli/src/utils/project.ts` — remove step 3 from `resolveProjectWorktree()`
- `packages/cli/src/commands/project.ts` — remove `default_project` active marker logic
- `packages/cli/src/index.ts` — update help text

**Modified (MCP):**
- `packages/mcp-server/src/tools/resolveProjectId.ts` — remove step 2, update error message
- `packages/mcp-server/src/tools/contextTools.ts` — update `resolvePromptFileForTools`, update tool descriptions
- `packages/mcp-server/src/tools/projectTools.ts` — update tool descriptions
- `packages/mcp-server/src/tools/worktreeTools.ts` — update tool descriptions
- `packages/mcp-server/src/tools/workflowTools.ts` — update tool descriptions
- `packages/mcp-server/src/tools/stateTools.ts` — update tool descriptions
- `packages/mcp-server/src/tools/guideTools.ts` — update tool descriptions
- `packages/mcp-server/src/tools/introspectionTools.ts` — update tool descriptions
- `packages/mcp-server/src/tools/configTools.ts` — update description examples

**Modified (tests):**
- `packages/core/tests/services/CoreServiceFactory.test.ts` — update for required projectPath, no bundled fallback
- `packages/core/tests/config/ConfigManager.test.ts` — remove `default_project` test cases, use another key
- `packages/cli/tests/utils/project.test.ts` — remove `default_project` resolution tests
- `packages/cli/tests/commands/project.test.ts` — remove active marker test
- `packages/cli/tests/commands/config.test.ts` — update to use different config key in examples
- `packages/mcp-server/tests/resolveProjectId.test.ts` — remove `default_project` fallback tests, update error test
- `packages/mcp-server/tests/contextTools.test.ts` — remove `default_project` fallback tests, remove bundled prompt mock, update `resolvePromptFilePath` mock
- `packages/mcp-server/tests/projectTools.test.ts` — remove `default_project` fallback tests
- `packages/mcp-server/tests/stateTools.test.ts` — remove `default_project` test
- `packages/mcp-server/tests/workflowTools.test.ts` — remove `default_project` test
- `packages/mcp-server/tests/configTools.test.ts` — update examples to use different key

**Modified (docs):**
- Remove "sync bundled asset" references from slice designs and DEVLOG where they describe ongoing obligations (not historical entries)

## Success Criteria

1. `cf build` in a project with guides installed works identically to today
2. `cf build` in a project without guides produces a clear error mentioning `cf guide install`
3. MCP `prompt_list` / `prompt_get` without a resolvable project return an error, not prompt content
4. MCP `context_build` without a resolvable project returns an error, not context built from bundled prompts
5. No file exists at `packages/core/assets/prompt.ai-project.system.md`
6. `cf config get` no longer lists `default_project`
7. `cf config set default_project foo` returns an error (unknown key)
8. MCP `resolveProjectId` without explicit ID throws with guidance (no `default_project` fallback)
9. All tests pass across core, CLI, and MCP packages
10. No remaining code references to `BUNDLED_PROMPT_PATH` or the bundled asset path

## Verification Walkthrough

#### 1. Normal build (guides installed) — no regression

```bash
cd ~/source/repos/manta/context-forge
cf build --phase architecture
```

Expected: identical output to pre-slice behavior. Worktree context block present.

#### 2. Build without guides — clear error

```bash
# Create a temporary project with no guides
mkdir /tmp/test-no-guide && cd /tmp/test-no-guide && git init
cf init --name test-no-guide
cf build
```

Expected: error message containing "No prompt file found" and "cf guide install".

#### 3. MCP prompt tools without project — error

Via MCP client, call `prompt_list` with no `projectId` from a directory that is not a registered project.

Expected: error response with guidance, not bundled prompt content.

#### 4. Config key removed

```bash
cf config get
```

Expected: `default_project` is not listed.

```bash
cf config set default_project my-project
```

Expected: error about unknown config key.

#### 5. MCP project resolution without explicit ID

Via MCP client, call `project_get` with no `projectId` from a non-project directory.

Expected: error message with guidance to pass `projectId` or use `project_list`. No mention of `default_project`.

#### 6. Verify no bundled asset

```bash
ls packages/core/assets/prompt.ai-project.system.md
```

Expected: "No such file or directory"

## Implementation Notes

### Development Approach

Suggested order:
1. Remove bundled asset file and update `CoreServiceFactory` (smallest blast radius, easy to verify)
2. Update `resolvePromptFileForTools` and MCP prompt tools
3. Remove `default_project` from `ConfigKeys`
4. Update CLI `resolveProjectWorktree` (remove step 3)
5. Update MCP `resolveProjectId` (remove step 2)
6. Bulk-update MCP tool description strings
7. Update all affected tests
8. Clean up documentation references

### Testing Strategy

- Unit tests for `resolvePromptFilePath` with missing guide (expect throw)
- Unit tests for `resolveProjectId` without explicit ID (expect throw, no `default_project` path)
- Unit tests for `resolveProjectWorktree` without CWD match (expect throw, no step 3)
- Integration: `cf build` from project with guides — unchanged output
- Integration: `cf build` from project without guides — error message
- Regression: ensure all existing test suites pass after removals

### Effort
2/5 — Deletion and simplification. Many files touched but changes are mechanical (remove fallback paths, update descriptions, delete tests for removed functionality).

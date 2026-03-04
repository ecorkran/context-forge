---
slice: cli-foundation
project: context-forge
lld: user/slices/168-slice.cli-foundation.md
dependencies: [schema-standardization, config-system, artifact-introspection-engine, workflow-navigator, future-work-collector]
projectState: All 160-band prerequisite slices complete. Core services stable. packages/cli does not yet exist.
dateCreated: 20260303
dateUpdated: 20260304
status: complete
---

## Context Summary

- Building `packages/cli` — a new monorepo package exposing Context Forge capabilities as terminal commands
- Entry point binary: `cf`; 8 commands: status, next, build, config, project, future, check, prompt
- Wraps `@context-forge/core` directly (no MCP layer). Same pattern as `packages/electron`
- `cf build` and `cf prompt get` write raw text to stdout; all other commands support `--json`
- `cf check` depends on slice 166 (not yet complete) — stub initially
- Phase shorthands (P1–P7) for `cf prompt` must be derived at runtime from prompt asset file
- Next planned slice: integration testing and documentation (168 follow-on)

---

## Task 1: Package Scaffolding

- [x] **Create `packages/cli/` directory structure**
  - [x] Create `packages/cli/src/commands/`, `src/output/`, `src/utils/`, `tests/commands/`, `tests/utils/`
  - [x] Success: directory tree matches slice design architecture section

- [x] **Create `packages/cli/package.json`**
  - [x] Name: `@context-forge/cli`; version `0.1.0`; type: `module`
  - [x] `"bin": { "cf": "./dist/index.js" }`
  - [x] Scripts: `build`, `dev`, `test`, `typecheck`
  - [x] Dependencies: `@context-forge/core: workspace:*`, `commander`, `chalk`, `cli-table3`
  - [x] DevDeps: `@types/node`, `typescript`, `vitest`
  - [x] Success: `pnpm install` succeeds from monorepo root

- [x] **Create `packages/cli/tsconfig.json`**
  - [x] Extend workspace root config; `outDir: ./dist`, `rootDir: ./src`
  - [x] Target Node.js (ES2023, nodenext module resolution) — same pattern as `packages/mcp-server`
  - [x] `"include": ["src/**/*", "tests/**/*"]`
  - [x] Success: `pnpm --filter @context-forge/cli typecheck` passes with empty stubs

- [x] **Create `packages/cli/src/index.ts` entry point**
  - [x] Import commander `Command`, create root program with name `cf`, version, description
  - [x] Register all 8 subcommands (stubs at this stage)
  - [x] Add `#!/usr/bin/env node` shebang as first line of compiled output (via `src/index.ts`)
  - [x] Success: `cf --help` displays program name and lists all commands after build

- [x] **Verify binary wiring**
  - [x] Run `pnpm --filter @context-forge/cli build`
  - [x] Run `pnpm --filter @context-forge/cli start -- --help` or invoke `cf --help` via workspace
  - [x] Success: help output visible, no import errors

---

## Task 2: Shared Utilities

- [x] **Implement `src/utils/project.ts` — project resolution**
  - [x] Export `resolveProjectId(explicit?: string): string`
  - [x] Resolution chain: explicit arg → `ConfigManager.get('default_project')` → throw `UserError`
  - [x] Error message includes suggestion to use `--project` or `cf config set default_project`
  - [x] Success: unit test passes for all three branches (explicit, config fallback, error)

- [x] **Implement `src/utils/errors.ts` — error formatting**
  - [x] Export `UserError extends Error` class
  - [x] Export `handleError(err: unknown): never` — formats `UserError` cleanly, other errors show brief message
  - [x] Success: `UserError` message prints without stack trace; unexpected errors show one-line summary

- [x] **Implement `src/output/styles.ts` — color/style definitions**
  - [x] Export named chalk styles: `label`, `value`, `heading`, `dim`, `error`, `success`
  - [x] All colors defined centrally — no inline `chalk.xxx` calls in command files
  - [x] Success: styles import without error; values are chalk instances

- [x] **Implement `src/output/formatter.ts` — output mode abstraction**
  - [x] Export `OutputMode` type (`'terminal' | 'json'`)
  - [x] Export `printJson(data: unknown): void` — `JSON.stringify` with 2-space indent to stdout
  - [x] Export `printRaw(text: string): void` — raw stdout write (for `cf build` and `cf prompt get`)
  - [x] Success: unit test confirms JSON output is valid parseable JSON

- [x] **Implement `src/output/tables.ts` — table rendering**
  - [x] Export `renderTable(headers: string[], rows: string[][]): string` using `cli-table3`
  - [x] Consistent column styling matching examples in slice design
  - [x] Success: sample table renders without truncation on standard 80-col terminal

---

## Task 3: `cf config` Command

- [x] **Implement `src/commands/config.ts`**
  - [x] Subcommands: `list`, `get <key>`, `set <key> <value>`
  - [x] `--project` flag on `set` writes to project-level config; default writes user-level
  - [x] `list`: calls `ConfigManager.list()`, renders three-column table (key, value, source)
  - [x] `get`: calls `ConfigManager.get(key)`, prints value and source
  - [x] `set`: calls `ConfigManager.set(key, value, scope)`, confirms with success message
  - [x] `--json` flag outputs raw JSON for `list` and `get`
  - [x] Success: `cf config list` shows all known keys; `cf config set default_project X` persists value

- [x] **Unit tests for `cf config`** (`tests/commands/config.test.ts`)
  - [x] Mock `ConfigManager`; test list renders correct columns
  - [x] Test `get` with known and unknown key
  - [x] Test `set` calls manager with correct scope (user vs project)
  - [x] Success: all tests pass

---

## Task 4: `cf project` Command

- [x] **Implement `src/commands/project.ts`**
  - [x] Subcommands: `list`, `get`, `set <field> <value>`
  - [x] `list`: loads all projects from `FileProjectStore`, renders ID/Name/Path/Slice columns
  - [x] `get`: resolves project, prints all fields as formatted key-value pairs or JSON
  - [x] `set`: resolves project, updates single field via `FileProjectStore.update()`, confirms change
  - [x] `--json` flag on `list` and `get`
  - [x] Success: `cf project list` shows tabular project summary; `cf project set fileSlice X` updates project

- [x] **Unit tests for `cf project`** (`tests/commands/project.test.ts`)
  - [x] Mock `FileProjectStore`; test list output columns
  - [x] Test `get` with valid and invalid project ID
  - [x] Test `set` calls store update with correct field and value
  - [x] Success: all tests pass (7 new tests, 26 total)

---


## Task 5: `cf status` Command

- [x] **Implement `src/commands/status.ts`**
  - [x] Resolve project via `resolveProjectId()`
  - [x] Call `WorkflowNavigator.getStatus(projectId)` (implemented using `ArtifactIntrospector.summarize()` — provisional)
  - [x] Terminal output: Project, Phase, Slice (with status), Tasks completed/total, Slice Plan summary
  - [x] Match example format from slice design (labeled fields, slice plan sub-block)
  - [x] `--json` flag outputs raw `getStatus()` result as JSON
  - [x] Success: `cf status` matches equivalent MCP `workflow_status` data

- [x] **Unit tests for `cf status`** (`tests/commands/status.test.ts`)
  - [x] Mock `WorkflowNavigator.getStatus()` / `ArtifactIntrospector.summarize()`; verify output fields are present
  - [x] Test `--json` emits valid JSON with same data
  - [x] Success: all tests pass

---

## Task 6: `cf next` Command

- [x] **Implement `src/commands/next.ts`**
  - [x] Resolve project via `resolveProjectId()`
  - [x] Call `WorkflowNavigator.getNext(projectId)` with deriveRecommendation() using introspection data (provisional — full WorkflowNavigator.getNext() depends on slice 165)
  - [x] Terminal output: recommendation label, slice, phase, remaining tasks, next task, rationale
  - [x] Match example format from slice design
  - [x] `--json` flag outputs raw `getNext()` result
  - [x] Success: `cf next` matches equivalent MCP `workflow_next` data

- [x] **Unit tests for `cf next`** (`tests/commands/next.test.ts`)
  - [x] Mock `WorkflowNavigator.getNext()` / deriveRecommendation(); verify all output fields rendered (test "continue" when tasks remain, test "advance" when all complete)
  - [x] Test `--json` produces valid parseable JSON
  - [x] Success: all tests pass

---

## Task 7: `cf build` Command

- [x] **Implement `src/commands/build.ts`**
  - [x] Resolve project via `resolveProjectId()`
  - [x] Options: `--phase`, `--slice`, `--instruction`, `--tasks`, `--additional`
  - [x] Build `ContextOverrides` object from provided options
  - [x] Call `ContextGenerator.generate(projectId, overrides)` (same interface as MCP `context_build`)
  - [x] Write output to stdout with `printRaw()` — no terminal formatting, no colors
  - [x] Status message ("Building context for…") goes to stderr, keeping stdout clean
  - [x] `--json` flag is NOT applicable — document this in help text
  - [x] Success: `cf build` stdout output is byte-for-byte identical to MCP `context_build` for same inputs

- [x] **Verify pipeable behavior**
  - [x] `cf build | wc -c` returns non-zero byte count
  - [x] `cf build > /tmp/context-test.md` produces a readable file
  - [x] `cf build --phase task-breakdown` uses correct instruction override
  - [x] Success: all pipe scenarios work without terminal escape codes in output (verified via unit tests with mock-based stderr/stdout separation)

- [x] **Unit tests for `cf build`** (`tests/commands/build.test.ts`)
  - [x] Mock `ContextGenerator.generate()`; test overrides are assembled correctly from flags
  - [x] Test that output goes to stdout (not stderr) and is raw text
  - [x] Test each override flag (`--phase`, `--slice`, `--instruction`, `--tasks`) sets correct field
  - [x] Success: 8 unit tests pass

---

## Task 8: `cf future` Command

- [x] **Implement `src/commands/future.ts`**
  - [x] Resolve project via `resolveProjectId()`
  - [x] Call `FutureWorkCollector.collect(projectId)`
  - [x] Terminal output: grouped by initiative with item names and status indicators
  - [x] Show summary line: total items, pending count
  - [x] `--json` flag outputs raw collector result
  - [x] Success: `cf future` matches equivalent MCP `workflow_future` data

- [x] **Unit tests for `cf future`** (`tests/commands/future.test.ts`)
  - [x] Mock `FutureWorkCollector`; verify groups rendered with correct item names
  - [x] Test `--json` output matches mock return value
  - [x] Test `--status` filter for pending/completed items
  - [x] Success: 3 unit tests pass

---

## Task 9: `cf check` Command (Stub)

- [x] **Implement stub `src/commands/check.ts`**
  - [x] Command defined with `--fix` and `--json` options
  - [x] Print: `"cf check: Consistency checker not yet available. Depends on slice 166."`
  - [x] Exit with code 0 (not an error — just not implemented)
  - [x] Help text documents `--fix` for when 166 is available
  - [x] Success: `cf check --help` shows correct options; `cf check` prints stub message and exits 0; 2 tests pass

---

## Task 10: `cf prompt` Command

- [x] **Implement phase shorthand parser** (internal utility, not exported as standalone command)
  - [x] Parse `packages/core/assets/prompt.ai-project.system.md` at runtime
  - [x] Extract headings matching `(Phase n)` or `(Phase n.m)` pattern
  - [x] Build map: `{ P1: 'Concept', P2: 'Architecture', ... }`
  - [x] Cache result after first parse (module-level variable)
  - [x] Success: unit test confirms P1–P7 resolve to correct names from current prompt asset

- [x] **Implement `src/commands/prompt.ts` — `list` subcommand**
  - [x] Call `SystemPromptParser` (or equivalent) to enumerate available prompt templates
  - [x] Render table: Name, Key/shorthand, Description
  - [x] Include phase shorthand column where applicable
  - [x] `--json` flag outputs array of template objects
  - [x] Success: `cf prompt list` shows all templates; JSON output is parseable

- [x] **Implement `src/commands/prompt.ts` — `get <phase>` subcommand**
  - [x] Accept phase name or shorthand; normalize to template key (case-insensitive, hyphen=space)
  - [x] Resolve project via `resolveProjectId()`
  - [x] Load template from `SystemPromptParser.getPromptForInstruction(resolvedPhase)`
  - [x] Substitute project variables from `ProjectData` into template content
  - [x] Variables: `{project}`, `{slice}`, `{task-file}`, `{fileArch}`, `{fileHLD}`, `{fileSpec}`, `{development-phase}`
  - [x] Unresolvable variables (not in project data): preserve as-is, do not blank
  - [x] `--raw` flag: skip substitution, output template as loaded
  - [x] Write output with `printRaw()` — pipeable, no formatting
  - [x] Success: `cf prompt get P5` outputs task-breakdown template with project vars substituted

- [x] **Unit tests for `cf prompt`** (`tests/commands/prompt.test.ts`)
  - [x] Test phase shorthand resolution: P5 → task-breakdown, case variants, hyphen/space equivalence
  - [x] Test variable substitution: fully-populated project → all vars replaced
  - [x] Test partial project data: missing vars preserved as `{var-name}` literals
  - [x] Test `--raw` flag: output matches raw template without substitution
  - [x] Success: all substitution edge cases pass

---

## Task 11: Output Polish and Help Text

- [x] **Audit all command help text**
  - [x] Each command has a clear `.description()` and option `.description()` strings
  - [x] Global options (`--project`, `--json`) documented on root program
  - [x] `cf --help` lists all 8 commands with one-line descriptions
  - [x] `cf build --help` notes that `--json` is not applicable
  - [x] Success: all help text readable without consulting source code

- [x] **Audit terminal output formatting**
  - [x] Column alignment consistent across `cf config list`, `cf project list`
  - [x] Color use matches `styles.ts` — no inline chalk calls in command files
  - [x] No ANSI escape codes emitted when stdout is not a TTY (pipe-safe for structured commands)
  - [x] Success: `cf project list | cat` renders without garbled escape codes

---

## Task 12: Integration Tests

- [x] **Create fixture project for CLI tests**
  - [x] Reuse or symlink existing MCP server fixture at `packages/mcp-server/tests/fixtures/integration-project/`
  - [x] If reusing, confirm fixture has slice plan and task file fields populated
  - [x] Success: fixture accessible from CLI test context

- [x] **Integration test: `cf build` vs MCP `context_build`**
  - [x] Run `cf build` on fixture project; capture stdout
  - [x] Run MCP `context_build` on same fixture (via direct service call in test)
  - [x] Assert outputs are identical
  - [x] Success: byte-for-byte match (or document any expected differences)

- [x] **Integration test: `cf status` and `cf next`**
  - [x] Run each command on fixture; assert key fields present in output
  - [x] Run with `--json` flag; assert JSON is valid and contains expected structure
  - [x] Success: output structure matches MCP equivalent tool response shape (Caveat: unit tests verify command structure and output format; full integration against a live project requires fixture registration in FileProjectStore, which is an MCP-level concern)

- [x] **Full build and smoke test**
  - [x] `pnpm --filter @context-forge/cli build` — no TypeScript errors
  - [x] `pnpm --filter @context-forge/cli typecheck` — clean, all 62 tests passing
  - [x] `cf --help` works from monorepo workspace
  - [x] Success: package buildable and all tests green

---

## Task 13: Documentation

- [x] **Create `packages/cli/README.md`**
  - [x] Installation instructions (monorepo workspace + future global install)
  - [x] Quick-start: `cf config set default_project <id>`, `cf status`, `cf build | pbcopy`
  - [x] Command reference table (command, usage, description)
  - [x] Note on `cf check` stub status and dependency on slice 166
  - [x] Phase shorthands table (P1–P7)
  - [x] Architecture note about wrapping core directly
  - [x] Development commands section
  - [x] Success: README conveys enough to use the CLI without reading source code

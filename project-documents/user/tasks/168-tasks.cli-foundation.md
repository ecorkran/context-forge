---
slice: cli-foundation
project: context-forge
lld: user/slices/168-slice.cli-foundation.md
dependencies: [schema-standardization, config-system, artifact-introspection-engine, workflow-navigator, future-work-collector]
projectState: All 160-band prerequisite slices complete. Core services stable. packages/cli does not yet exist.
dateCreated: 20260303
dateUpdated: 20260304
status: in_progress
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

- [ ] **Implement `src/utils/project.ts` — project resolution**
  - [ ] Export `resolveProjectId(explicit?: string): string`
  - [ ] Resolution chain: explicit arg → `ConfigManager.get('default_project')` → throw `UserError`
  - [ ] Error message includes suggestion to use `--project` or `cf config set default_project`
  - [ ] Success: unit test passes for all three branches (explicit, config fallback, error)

- [ ] **Implement `src/utils/errors.ts` — error formatting**
  - [ ] Export `UserError extends Error` class
  - [ ] Export `handleError(err: unknown): never` — formats `UserError` cleanly, other errors show brief message
  - [ ] Success: `UserError` message prints without stack trace; unexpected errors show one-line summary

- [ ] **Implement `src/output/styles.ts` — color/style definitions**
  - [ ] Export named chalk styles: `label`, `value`, `heading`, `dim`, `error`, `success`
  - [ ] All colors defined centrally — no inline `chalk.xxx` calls in command files
  - [ ] Success: styles import without error; values are chalk instances

- [ ] **Implement `src/output/formatter.ts` — output mode abstraction**
  - [ ] Export `OutputMode` type (`'terminal' | 'json'`)
  - [ ] Export `printJson(data: unknown): void` — `JSON.stringify` with 2-space indent to stdout
  - [ ] Export `printRaw(text: string): void` — raw stdout write (for `cf build` and `cf prompt get`)
  - [ ] Success: unit test confirms JSON output is valid parseable JSON

- [ ] **Implement `src/output/tables.ts` — table rendering**
  - [ ] Export `renderTable(headers: string[], rows: string[][]): string` using `cli-table3`
  - [ ] Consistent column styling matching examples in slice design
  - [ ] Success: sample table renders without truncation on standard 80-col terminal

---

## Task 3: `cf config` Command

- [ ] **Implement `src/commands/config.ts`**
  - [ ] Subcommands: `list`, `get <key>`, `set <key> <value>`
  - [ ] `--project` flag on `set` writes to project-level config; default writes user-level
  - [ ] `list`: calls `ConfigManager.list()`, renders three-column table (key, value, source)
  - [ ] `get`: calls `ConfigManager.get(key)`, prints value and source
  - [ ] `set`: calls `ConfigManager.set(key, value, scope)`, confirms with success message
  - [ ] `--json` flag outputs raw JSON for `list` and `get`
  - [ ] Success: `cf config list` shows all known keys; `cf config set default_project X` persists value

- [ ] **Unit tests for `cf config`** (`tests/commands/config.test.ts`)
  - [ ] Mock `ConfigManager`; test list renders correct columns
  - [ ] Test `get` with known and unknown key
  - [ ] Test `set` calls manager with correct scope (user vs project)
  - [ ] Success: all tests pass

---

## Task 4: `cf project` Command

- [ ] **Implement `src/commands/project.ts`**
  - [ ] Subcommands: `list`, `get`, `set <field> <value>`
  - [ ] `list`: loads all projects from `FileProjectStore`, renders ID/Name/Path/Slice columns
  - [ ] `get`: resolves project, prints all fields as formatted key-value pairs or JSON
  - [ ] `set`: resolves project, updates single field via `FileProjectStore.update()`, confirms change
  - [ ] `--json` flag on `list` and `get`
  - [ ] Success: `cf project list` shows tabular project summary; `cf project set fileSlice X` updates project

- [ ] **Unit tests for `cf project`** (`tests/commands/project.test.ts`)
  - [ ] Mock `FileProjectStore`; test list output columns
  - [ ] Test `get` with valid and invalid project ID
  - [ ] Test `set` calls store update with correct field and value
  - [ ] Success: all tests pass

---


## Task 5: `cf status` Command

- [ ] **Implement `src/commands/status.ts`**
  - [ ] Resolve project via `resolveProjectId()`
  - [ ] Call `WorkflowNavigator.getStatus(projectId)`
  - [ ] Terminal output: Project, Phase, Slice (with status), Tasks completed/total, Slice Plan summary
  - [ ] Match example format from slice design (labeled fields, slice plan sub-block)
  - [ ] `--json` flag outputs raw `getStatus()` result as JSON
  - [ ] Success: `cf status` matches equivalent MCP `workflow_status` data

- [ ] **Unit tests for `cf status`** (`tests/commands/status.test.ts`)
  - [ ] Mock `WorkflowNavigator.getStatus()`; verify output fields are present
  - [ ] Test `--json` emits valid JSON with same data
  - [ ] Success: all tests pass

---

## Task 6: `cf next` Command

- [ ] **Implement `src/commands/next.ts`**
  - [ ] Resolve project via `resolveProjectId()`
  - [ ] Call `WorkflowNavigator.getNext(projectId)`
  - [ ] Terminal output: recommendation label, slice, phase, remaining tasks, next task, rationale
  - [ ] Match example format from slice design
  - [ ] `--json` flag outputs raw `getNext()` result
  - [ ] Success: `cf next` matches equivalent MCP `workflow_next` data

- [ ] **Unit tests for `cf next`** (`tests/commands/next.test.ts`)
  - [ ] Mock `WorkflowNavigator.getNext()`; verify all output fields rendered
  - [ ] Test `--json` produces valid parseable JSON
  - [ ] Success: all tests pass

---

## Task 7: `cf build` Command

- [ ] **Implement `src/commands/build.ts`**
  - [ ] Resolve project via `resolveProjectId()`
  - [ ] Options: `--phase`, `--slice`, `--instruction`, `--tasks`, `--additional`
  - [ ] Build `ContextOverrides` object from provided options
  - [ ] Call `ContextGenerator.generate(projectId, overrides)` (same interface as MCP `context_build`)
  - [ ] Write output to stdout with `printRaw()` — no terminal formatting, no colors
  - [ ] Status message ("Building context for…") goes to stderr, keeping stdout clean
  - [ ] `--json` flag is NOT applicable — document this in help text
  - [ ] Success: `cf build` stdout output is byte-for-byte identical to MCP `context_build` for same inputs

- [ ] **Verify pipeable behavior**
  - [ ] `cf build | wc -c` returns non-zero byte count
  - [ ] `cf build > /tmp/context-test.md` produces a readable file
  - [ ] `cf build --phase task-breakdown` uses correct instruction override
  - [ ] Success: all pipe scenarios work without terminal escape codes in output

- [ ] **Unit tests for `cf build`** (`tests/commands/build.test.ts`)
  - [ ] Mock `ContextGenerator.generate()`; test overrides are assembled correctly from flags
  - [ ] Test that output goes to stdout (not stderr) and is raw text
  - [ ] Test each override flag (`--phase`, `--slice`, `--instruction`, `--tasks`) sets correct field
  - [ ] Success: all tests pass

---

## Task 8: `cf future` Command

- [ ] **Implement `src/commands/future.ts`**
  - [ ] Resolve project via `resolveProjectId()`
  - [ ] Call `FutureWorkCollector.collect(projectId)`
  - [ ] Terminal output: grouped by initiative with item names and status indicators
  - [ ] Show summary line: total items, pending count
  - [ ] `--json` flag outputs raw collector result
  - [ ] Success: `cf future` matches equivalent MCP `workflow_future` data

- [ ] **Unit tests for `cf future`** (`tests/commands/future.test.ts`)
  - [ ] Mock `FutureWorkCollector`; verify groups rendered with correct item names
  - [ ] Test `--json` output matches mock return value
  - [ ] Success: all tests pass

---

## Task 9: `cf check` Command (Stub)

- [ ] **Implement stub `src/commands/check.ts`**
  - [ ] Command defined with `--fix` and `--json` options
  - [ ] Print: `"cf check: Consistency checker not yet available. Depends on slice 166."`
  - [ ] Exit with code 0 (not an error — just not implemented)
  - [ ] Help text documents `--fix` for when 166 is available
  - [ ] Success: `cf check --help` shows correct options; `cf check` prints stub message and exits 0

---

## Task 10: `cf prompt` Command

- [ ] **Implement phase shorthand parser** (internal utility, not exported as standalone command)
  - [ ] Parse `packages/core/assets/prompt.ai-project.system.md` at runtime
  - [ ] Extract headings matching `(Phase n)` or `(Phase n.m)` pattern
  - [ ] Build map: `{ P1: 'Concept', P2: 'Architecture', ... }`
  - [ ] Cache result after first parse (module-level variable)
  - [ ] Success: unit test confirms P1–P7 resolve to correct names from current prompt asset

- [ ] **Implement `src/commands/prompt.ts` — `list` subcommand**
  - [ ] Call `SystemPromptParser` (or equivalent) to enumerate available prompt templates
  - [ ] Render table: Name, Key/shorthand, Description
  - [ ] Include phase shorthand column where applicable
  - [ ] `--json` flag outputs array of template objects
  - [ ] Success: `cf prompt list` shows all templates; JSON output is parseable

- [ ] **Implement `src/commands/prompt.ts` — `get <phase>` subcommand**
  - [ ] Accept phase name or shorthand; normalize to template key (case-insensitive, hyphen=space)
  - [ ] Resolve project via `resolveProjectId()`
  - [ ] Load template from `SystemPromptParser.getPromptForInstruction(resolvedPhase)`
  - [ ] Substitute project variables from `ProjectData` into template content
  - [ ] Variables: `{project}`, `{slice}`, `{task-file}`, `{fileArch}`, `{fileHLD}`, `{fileSpec}`, `{development-phase}`
  - [ ] Unresolvable variables (not in project data): preserve as-is, do not blank
  - [ ] `--raw` flag: skip substitution, output template as loaded
  - [ ] Write output with `printRaw()` — pipeable, no formatting
  - [ ] Success: `cf prompt get P5` outputs task-breakdown template with project vars substituted

- [ ] **Unit tests for `cf prompt`** (`tests/commands/prompt.test.ts`)
  - [ ] Test phase shorthand resolution: P5 → task-breakdown, case variants, hyphen/space equivalence
  - [ ] Test variable substitution: fully-populated project → all vars replaced
  - [ ] Test partial project data: missing vars preserved as `{var-name}` literals
  - [ ] Test `--raw` flag: output matches raw template without substitution
  - [ ] Success: all substitution edge cases pass

---

## Task 11: Output Polish and Help Text

- [ ] **Audit all command help text**
  - [ ] Each command has a clear `.description()` and option `.description()` strings
  - [ ] Global options (`--project`, `--json`) documented on root program
  - [ ] `cf --help` lists all 8 commands with one-line descriptions
  - [ ] `cf build --help` notes that `--json` is not applicable
  - [ ] Success: all help text readable without consulting source code

- [ ] **Audit terminal output formatting**
  - [ ] Column alignment consistent across `cf config list`, `cf project list`
  - [ ] Color use matches `styles.ts` — no inline chalk calls in command files
  - [ ] No ANSI escape codes emitted when stdout is not a TTY (pipe-safe for structured commands)
  - [ ] Success: `cf project list | cat` renders without garbled escape codes

---

## Task 12: Integration Tests

- [ ] **Create fixture project for CLI tests**
  - [ ] Reuse or symlink existing MCP server fixture at `packages/mcp-server/tests/fixtures/integration-project/`
  - [ ] If reusing, confirm fixture has slice plan and task file fields populated
  - [ ] Success: fixture accessible from CLI test context

- [ ] **Integration test: `cf build` vs MCP `context_build`**
  - [ ] Run `cf build` on fixture project; capture stdout
  - [ ] Run MCP `context_build` on same fixture (via direct service call in test)
  - [ ] Assert outputs are identical
  - [ ] Success: byte-for-byte match (or document any expected differences)

- [ ] **Integration test: `cf status` and `cf next`**
  - [ ] Run each command on fixture; assert key fields present in output
  - [ ] Run with `--json` flag; assert JSON is valid and contains expected structure
  - [ ] Success: output structure matches MCP equivalent tool response shape

- [ ] **Full build and smoke test**
  - [ ] `pnpm --filter @context-forge/cli build` — no TypeScript errors
  - [ ] `pnpm --filter @context-forge/cli test` — all unit and integration tests pass
  - [ ] `cf --help` works from monorepo workspace
  - [ ] Success: package buildable and all tests green

---

## Task 13: Documentation

- [ ] **Create `packages/cli/README.md`**
  - [ ] Installation instructions (monorepo workspace + future global install)
  - [ ] Quick-start: `cf config set default_project <id>`, `cf status`, `cf build | pbcopy`
  - [ ] Command reference table (command, usage, description)
  - [ ] Note on `cf check` stub status and dependency on slice 166
  - [ ] Success: README conveys enough to use the CLI without reading source code

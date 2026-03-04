---
slice: multi-project-ux-polish
project: context-forge
lld: user/slices/169-slice.multi-project-ux-polish.md
dependencies: [cli-foundation]
projectState: packages/cli exists with 8 commands (v0.1.0). resolveProjectId currently takes optional explicit ID, falls back to config default_project. No CWD detection, no name-based resolution. FileProjectStore has getAll/getById but no findByName. Output uses cli-table3 with basic formatting.
dateCreated: 20260304
dateUpdated: 20260304
status: not_started
---

## Context Summary

- Extending `packages/cli` with CWD-based project detection and name-based resolution
- Adding three-level resolution chain: `--project` flag → CWD match → `default_project` config
- Resolution source tracking (`flag` | `cwd` | `default` | `none`) shown in `cf status`
- `findByNameOrId` and `findProjectByCwd` are CLI-layer utilities using `store.getAll()`
- Compact output formatting across commands, matching orchestration CLI style
- Version bump 0.1.0 → 0.2.0, README changelog
- No changes to `@context-forge/core` public API
- Next planned slice: TBD (165 Workflow Navigator or 166 Consistency Checker)

---

## Task 1: `findByNameOrId` Utility + Tests

**Effort: 1/5**

- [ ] **Add `findByNameOrId` to `src/utils/project.ts`**
  - [ ] Signature: `async function findByNameOrId(nameOrId: string, store: FileProjectStore): Promise<ProjectData | null>`
  - [ ] Try exact ID match via `store.getById(nameOrId)` first
  - [ ] If no ID match, call `store.getAll()` and find case-insensitive name match
  - [ ] Return matched `ProjectData` or `null`
  - [ ] Export the function (used by `resolveProjectId` and other commands)
  - [ ] Success: function exported, handles ID match, name match (case-insensitive), and not-found

- [ ] **Unit tests for `findByNameOrId`**
  - [ ] Test: exact ID match returns correct project
  - [ ] Test: case-insensitive name match returns correct project
  - [ ] Test: no match returns null
  - [ ] Test: ID match takes priority over name match (if both could match)
  - [ ] Success: all tests pass via `pnpm --filter @context-forge/cli test`

---

## Task 2: `findProjectByCwd` Utility + Tests

**Effort: 2/5**

- [ ] **Add `findProjectByCwd` to `src/utils/project.ts`**
  - [ ] Signature: `async function findProjectByCwd(store: FileProjectStore): Promise<ProjectData | null>`
  - [ ] Get all projects via `store.getAll()`
  - [ ] Get `process.cwd()` and match against `project.projectPath`
  - [ ] Match if CWD equals `projectPath` OR CWD starts with `projectPath + '/'` (subdirectory)
  - [ ] Normalize: handle `projectPath` with or without trailing slash
  - [ ] When multiple projects match (nested paths), longest `projectPath` wins
  - [ ] Return best match or `null`
  - [ ] Export the function
  - [ ] Success: function exported, handles exact match, subdirectory match, longest-match, and no-match

- [ ] **Unit tests for `findProjectByCwd`**
  - [ ] Mock `process.cwd()` to control test CWD
  - [ ] Mock store to return test projects with known paths
  - [ ] Test: exact path match returns correct project
  - [ ] Test: subdirectory match returns correct project
  - [ ] Test: longest-match wins when paths overlap (e.g. `/a/b` and `/a/b/c`)
  - [ ] Test: no match returns null
  - [ ] Test: projects without `projectPath` are skipped
  - [ ] Success: all tests pass

- [ ] **Commit**: `feat(cli): add findByNameOrId and findProjectByCwd utilities`

---

## Task 3: Update `resolveProjectId` to Three-Step Chain

**Effort: 2/5**

- [ ] **Refactor `resolveProjectId` in `src/utils/project.ts`**
  - [ ] Add types:
    ```typescript
    type ResolutionSource = 'flag' | 'cwd' | 'default' | 'none';
    interface ResolvedProject { id: string; source: ResolutionSource; }
    ```
  - [ ] Change return type from `Promise<string>` to `Promise<ResolvedProject>`
  - [ ] Update signature to accept `store: FileProjectStore` parameter (callers already have one)
  - [ ] Step 1: if `explicit` provided, use `findByNameOrId(explicit, store)` — throw `UserError` if not found (include hint about `cf project list`)
  - [ ] Step 2: call `findProjectByCwd(store)` — return with `source: 'cwd'` if found
  - [ ] Step 3: read `default_project` config, if set use `findByNameOrId` to resolve — throw if set but not found (stale config), return with `source: 'default'` if found
  - [ ] Step 4: throw `UserError` with actionable guidance (use `--project`, set default, `cf project list`)
  - [ ] Export `ResolutionSource` and `ResolvedProject` types

- [ ] **Update all command files that call `resolveProjectId`**
  - [ ] Each command now passes its `store` instance to `resolveProjectId`
  - [ ] Each command destructures `{ id, source }` from the result (only `cf status` uses `source` initially; others ignore it)
  - [ ] Commands affected: `status.ts`, `next.ts`, `build.ts`, `future.ts`, `check.ts`, `prompt.ts`, `project.ts` (get/set subcommands)
  - [ ] Success: all commands compile and function with the new signature

- [ ] **Update existing `resolveProjectId` tests**
  - [ ] Tests now verify `{ id, source }` return shape
  - [ ] Add test: CWD resolution returns `source: 'cwd'`
  - [ ] Add test: default_project resolution returns `source: 'default'`
  - [ ] Add test: explicit flag resolution returns `source: 'flag'`
  - [ ] Add test: stale `default_project` (name doesn't match any project) throws `UserError`
  - [ ] Add test: no resolution throws `UserError` with guidance text
  - [ ] Success: all unit tests pass, `pnpm --filter @context-forge/cli typecheck` passes

- [ ] **Commit**: `feat(cli): three-step project resolution chain with source tracking`

---

## Task 4: Resolution Indicator in `cf status`

**Effort: 1/5**

- [ ] **Update `cf status` to display resolution source**
  - [ ] After resolving project, include source in header line:
    - `source: 'cwd'` → `(from CWD)`
    - `source: 'default'` → `(default)`
    - `source: 'flag'` → `(--project flag)`
  - [ ] Display as: `Project:  orchestration  (from CWD)`
  - [ ] Include `resolutionSource` in `--json` output
  - [ ] Success: running `cf status` from a project directory shows `(from CWD)`, from elsewhere shows `(default)` or `(--project flag)`

- [ ] **Update `cf status` tests**
  - [ ] Test: resolution source label appears in terminal output
  - [ ] Test: `--json` output includes `resolutionSource` field
  - [ ] Success: all status tests pass

- [ ] **Commit**: `feat(cli): show resolution source in cf status`

---

## Task 5: Name-Based `--project` and `default_project`

**Effort: 1/5**

- [ ] **Verify `--project <name>` works across commands**
  - [ ] Since `resolveProjectId` now uses `findByNameOrId`, `--project context-forge` should resolve by name
  - [ ] Verify `cf config set default_project orchestration` stores the name as-is (already works — config stores raw value)
  - [ ] Verify `cf status --project <name>` resolves correctly
  - [ ] No code change expected — just verification of the Task 3 refactor
  - [ ] Success: `--project` accepts both names and IDs on all commands

- [ ] **Update `UserError` messages to reference names**
  - [ ] Error when project not found: include suggestion to check name spelling + `cf project list`
  - [ ] Error when `default_project` is stale: show the configured value and suggest updating
  - [ ] Success: error messages are actionable with name-based examples

- [ ] **Commit**: `feat(cli): name-based project resolution in --project and default_project`

---

## Task 6: Compact `cf project list` Format

**Effort: 2/5**

- [ ] **Redesign `cf project list` table layout**
  - [ ] Columns: Name, Path, Slice, Default (bullet indicator)
  - [ ] Remove ID column from default display (IDs are machine-generated, not useful in terminal)
  - [ ] Path column: shorten with `~` for home directory (e.g. `~/source/repos/manta/context-forge`)
  - [ ] Default column: show `●` bullet on the project matching `default_project` config value
  - [ ] Read `default_project` from config to determine which project is the default
  - [ ] `--json` output still includes full data (ID, name, path, slice, isDefault)
  - [ ] Success: `cf project list` renders a compact, readable table with default indicator

- [ ] **Update `cf project list` tests**
  - [ ] Test: default indicator appears for the matching project
  - [ ] Test: path is shortened with `~`
  - [ ] Test: `--json` includes `isDefault` field
  - [ ] Success: all project list tests pass

- [ ] **Commit**: `feat(cli): compact cf project list with default indicator`

---

## Task 7: Output Formatting Pass

**Effort: 2/5**

- [ ] **Tighten `cf status` output**
  - [ ] Align labels with consistent padding (no excess spaces)
  - [ ] Group related fields visually (project/phase/slice, then progress, then slice plan)
  - [ ] Single-screen summary: no unnecessary blank lines between groups
  - [ ] Refer to the UI example screenshot in the slice design for target style

- [ ] **Tighten `cf config list` output**
  - [ ] Compact table: Key, Value, Source columns
  - [ ] Source column right-aligned or consistently positioned
  - [ ] No box-drawing characters (use simple aligned text if cli-table3 is too heavy)

- [ ] **Tighten `cf project get` output**
  - [ ] Consistent label width, aligned values
  - [ ] Suppress empty/null fields instead of showing blank values

- [ ] **Standardize error message format**
  - [ ] All `UserError` messages follow pattern: problem statement + newline + actionable suggestion(s)
  - [ ] Suggestion lines indented with `  ` (two spaces)
  - [ ] Review existing error messages across all commands for consistency

- [ ] **Update affected tests if output assertions change**
  - [ ] Success: all tests pass, output is visually tighter across commands

- [ ] **Commit**: `style(cli): tighten output formatting across commands`

---

## Task 8: Version Bump and README Changelog

**Effort: 1/5**

- [ ] **Bump version in `packages/cli/package.json`**
  - [ ] `0.1.0` → `0.2.0`

- [ ] **Add changelog section to `packages/cli/README.md`**
  - [ ] Add `## Changelog` section (or append to existing)
  - [ ] v0.2.0 entry: CWD-based project detection, name-based resolution, compact output, resolution indicators
  - [ ] Document `default_additional_instruction` as a planned config key (not implemented — deferred per slice design)

- [ ] **Update command reference in README if signatures changed**
  - [ ] Verify `--project` description mentions name support
  - [ ] Success: README reflects current command behavior

- [ ] **Commit**: `docs(cli): version 0.2.0 changelog and README updates`

---

## Task 9: Integration Verification

**Effort: 1/5**

- [ ] **Run full test suite**
  - [ ] `pnpm --filter @context-forge/cli test` — all unit tests pass
  - [ ] `pnpm --filter @context-forge/cli typecheck` — no type errors
  - [ ] `pnpm --filter @context-forge/cli build` — compiles successfully

- [ ] **Verify existing integration tests still pass**
  - [ ] `build.integration.test.ts` tests still pass (core pipeline parity)
  - [ ] No regressions in 168-era functionality

- [ ] **Verify all 168 tests pass (no regressions)**
  - [ ] All 62 original tests + new tests added in this slice pass together
  - [ ] Success: `pnpm --filter @context-forge/cli test` shows all passing, zero failures

- [ ] **Commit**: mark slice 169 complete in task file, slice design, and slice plan

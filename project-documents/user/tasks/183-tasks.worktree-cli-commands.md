---
slice: worktree-cli-commands
project: context-forge
lld: user/slices/183-slice.worktree-cli-commands.md
dependencies: [181-worktreecontext-data-model-storage, 182-worktree-discovery-cwd-resolution]
dateCreated: 20260310
dateUpdated: 20260310
status: complete
docType: tasks
---

# Tasks: 183 — Worktree CLI Commands

## Context Summary

- Working on slice 183: Worktree CLI Commands
- Slices 181 (WorktreeService) and 182 (GitWorktreeDiscovery, resolveProjectWorktree) are complete
- This slice delivers `cf worktree init/list/rm`, worktree-aware `cf set`/`cf get`, and `--project-level` escape hatch
- All changes are in `packages/cli` — no core package changes
- Key existing files: `packages/cli/src/commands/project.ts` (projectSetAction, projectGetAction), `packages/cli/src/utils/project.ts` (resolveProjectWorktree — options-object refactor needed), `packages/cli/src/index.ts` (command registration)
- `resolveProjectWorktree` currently has signature `(explicit: string | undefined, store)` — must change to `({ project?, worktree? }, store)` options-object pattern
- `resolveProjectId` wrapper shields all existing callers — they are unaffected by the signature change

---

## Tasks

### 1. Refactor `resolveProjectWorktree` to options-object signature

- [x] In `packages/cli/src/utils/project.ts`:
  - [x] Add `ResolveProjectWorktreeOptions` interface: `{ project?: string; worktree?: string }`
  - [x] Change `resolveProjectWorktree(explicit: string | undefined, store)` → `resolveProjectWorktree(opts: ResolveProjectWorktreeOptions, store)`
    - [x] Replace `explicit` usage with `opts.project`
    - [x] Add `worktree?: string` handling: when resolved via flag or default, if `opts.worktree` provided, call `findWorktreeByNameOrId(projectId, opts.worktree, store)` and attach `worktreeId`
  - [x] Update `resolveProjectId` wrapper: `resolveProjectWorktree({ project: explicit }, store)`
  - [x] Export `ResolveProjectWorktreeOptions`
- [x] Verify: `pnpm --filter @context-forge/cli build` passes (TypeScript catches any missed callers)

### 2. Add `findWorktreeByNameOrId` utility

- [x] In `packages/cli/src/utils/project.ts`:
  - [x] Implement `findWorktreeByNameOrId(projectId: string, nameOrId: string, store: FileProjectStore): Promise<WorktreeContext | undefined>`
    - [x] Load project from store; return `undefined` if project not found
    - [x] Exact ID match first (`wt.id === nameOrId`)
    - [x] Then case-insensitive name match (`wt.name.toLowerCase() === nameOrId.toLowerCase()`)
    - [x] Return `undefined` if neither matches
  - [x] Export `findWorktreeByNameOrId`
  - [x] Import `WorktreeContext` from `@context-forge/core`
- [x] Verify: `pnpm --filter @context-forge/cli build` passes

### 3. Test `resolveProjectWorktree` options-object and `findWorktreeByNameOrId`

- [x] In `packages/cli/tests/utils/project.test.ts`:
  - [x] Update all existing `resolveProjectWorktree` test calls to use `{ project: ... }` options form
  - [x] Add `resolveProjectWorktree` `worktree` option tests:
    - [x] Explicit `--project` + `--worktree` → resolves project by name, attaches `worktreeId` from `findWorktreeByNameOrId`
    - [x] Unknown worktree name → `worktreeId: undefined` (lookup returns `undefined`, function proceeds without worktree)
  - [x] Add `findWorktreeByNameOrId` tests:
    - [x] Exact ID match → returns matching `WorktreeContext`
    - [x] Case-insensitive name match → returns matching `WorktreeContext`
    - [x] ID takes priority over name when both would match different entries
    - [x] Not found → returns `undefined`
    - [x] Project not found → returns `undefined`
- [x] Verify: `pnpm --filter @context-forge/cli test` passes

### 4. Extract `askConfirmation` to shared utility

- [x] Check if `askConfirmation` is already in `packages/cli/src/utils/` or is local to `project.ts`
  - [x] If local: extract to `packages/cli/src/utils/confirm.ts` with named export `askConfirmation`
  - [x] Update `project.ts` to import from `../utils/confirm.js`
  - [x] If already shared: skip this task and note location in task 5
- [x] Verify: `pnpm --filter @context-forge/cli build` passes

### 5. Create `packages/cli/src/commands/worktree.ts` — `cf worktree init`

- [x] Create `packages/cli/src/commands/worktree.ts`
- [x] Import required dependencies:
  - [x] `Command` from `commander`
  - [x] `FileProjectStore`, `WorktreeService`, `GitWorktreeDiscovery`, `resolveFileByIndex` from `@context-forge/core/node`
  - [x] `resolveProjectWorktree`, `findWorktreeByNameOrId` from `../utils/project.js`
  - [x] `handleError`, `UserError` from `../utils/errors.js`
  - [x] `success`, `dim` from `../output/styles.js`
  - [x] `renderTable` from `../output/tables.js`
  - [x] `askConfirmation` from `../utils/confirm.js` (or `project.js` if not extracted in task 4)
- [x] Implement `cf worktree init` subcommand:
  - [x] Options: `--name <name>` (required), `--range <start-end>` (required), `--path <path>`, `--project <name|id>`
  - [x] Parse and validate `--range`:
    - [x] Match `/^\d+-\d+$/`; throw `UserError` on bad format with example: `'Invalid range format. Use start-end, e.g. 100-199'`
    - [x] Parse integers; validate `start <= end`; throw `UserError` if not
  - [x] Resolve project via `resolveProjectWorktree({ project: opts.project }, store)`
  - [x] Load project from store to get `projectPath`
  - [x] Determine path: `opts.path ?? process.cwd()`
  - [x] Validate path via git (step 5 from slice design):
    - [x] `new GitWorktreeDiscovery().listWorktrees(project.projectPath)`
    - [x] Empty array → `console.error('Warning: could not verify path is a git worktree ...')` and proceed
    - [x] Path not in list → throw `UserError` with clear message and `git worktree list` hint
  - [x] Auto-discover `archDoc` and `slicePlan` from range base:
    - [x] Extract base from `start` as string (e.g., `'100'`)
    - [x] Try `resolveFileByIndex(project.projectPath, 'fileArch', base)` → catch errors → `undefined`
    - [x] Try `resolveFileByIndex(project.projectPath, 'fileSlicePlan', base)` → catch errors → `undefined`
  - [x] Call `new WorktreeService(store).addWorktree(projectId, { name, indexRange, worktreePath, archDoc, slicePlan })`
  - [x] Print notices and success message per slice design
- [x] Export `registerWorktreeCommand(program: Command): void`
- [x] Verify: `pnpm --filter @context-forge/cli build` passes

### 6. Add `cf worktree list` subcommand

- [x] In `packages/cli/src/commands/worktree.ts`, add `list` subcommand to the worktree command group:
  - [x] Options: `--project <name|id>`, `--json`
  - [x] Resolve project via `resolveProjectWorktree({ project: opts.project }, store)`
  - [x] Load project from store; extract `project.worktrees ?? []`
  - [x] Get active worktree ID from `resolvedProject.worktreeId`
  - [x] Handle empty list: print `'  No worktree contexts registered for project <name>. Run cf worktree init to create one.'`
  - [x] Build `rows` and `prefixes` arrays:
    - [x] Format range as `[start-end]`
    - [x] Shorten path via `shortenPath()` (import or duplicate from `project.ts` — prefer import/extract if not exported)
    - [x] Active row: all cells wrapped in `success()`, prefix `success('* ')`
    - [x] Inactive row: plain strings, arch/plan show `'—'` if absent, prefix `'  '`
  - [x] `console.log(renderTable(['Name', 'Range', 'Path', 'Arch', 'Plan'], rows, prefixes))`
  - [x] JSON output: `printJson(project.worktrees)` with `worktreeId` of active appended
- [x] Verify: `pnpm --filter @context-forge/cli build` passes

### 7. Add `cf worktree rm` subcommand

- [x] In `packages/cli/src/commands/worktree.ts`, add `rm` subcommand:
  - [x] Arguments: `[name|id]` (optional positional)
  - [x] Options: `--project <name|id>`, `--yes`
  - [x] Resolve project via `resolveProjectWorktree({ project: opts.project }, store)`
  - [x] Resolve target worktree:
    - [x] If `nameOrId` provided → `findWorktreeByNameOrId(projectId, nameOrId, store)`
    - [x] If not provided → use `resolvedProject.worktreeId` if set; else throw `UserError` prompting explicit name/id
    - [x] Not found → throw `UserError` with name and `cf worktree list` hint
  - [x] If `!opts.yes`: print details (name, range, path, project) + safety note + confirm via `askConfirmation`; abort if denied
  - [x] Call `new WorktreeService(store).removeWorktree(projectId, worktreeId)`
  - [x] Print reverse migration notice if `migrated`
  - [x] Print success message
- [x] Verify: `pnpm --filter @context-forge/cli build` passes

### 8. Register `cf worktree` in `index.ts`

- [x] In `packages/cli/src/index.ts`:
  - [x] Import `registerWorktreeCommand` from `./commands/worktree.js`
  - [x] Call `registerWorktreeCommand(program)` alongside other registrations
- [x] Verify: `pnpm --filter @context-forge/cli build` passes; `cf worktree --help` shows subcommands

### 9. Tests for `cf worktree init / list / rm`

- [x] Create `packages/cli/tests/commands/worktree.test.ts`
- [x] Test `cf worktree init`:
  - [x] Bad `--range` format → UserError with format hint
  - [x] `start > end` → UserError
  - [x] Git unavailable (empty array) → warns and proceeds
  - [x] Path not in git worktree list → UserError
  - [x] Success path: calls `WorktreeService.addWorktree` with correct args
  - [x] Migration notice printed when `migrated: true`
  - [x] Overlap warning printed when `overlaps.length > 0`
  - [x] Auto-discovered archDoc/slicePlan included in call
- [x] Test `cf worktree list`:
  - [x] Empty list → prints empty state message
  - [x] Active worktree marked with `* ` prefix, cells in `success()` style
  - [x] Missing arch/plan shows `—`
- [x] Test `cf worktree rm`:
  - [x] Not found → UserError with `cf worktree list` hint
  - [x] `--yes` skips confirmation
  - [x] Reverse migration notice printed when `migrated: true`
  - [x] Without `nameOrId` and no resolved worktreeId → UserError
- [x] Verify: `pnpm --filter @context-forge/cli test` passes

### 10. Make `projectSetAction` worktree-aware

- [x] In `packages/cli/src/commands/project.ts`:
  - [x] Add `WORKTREE_SCOPED_FIELDS` set: `developmentPhase`, `instruction`, `workType`, `fileArch`, `fileSlicePlan`, `fileSlice`, `fileTasks`
  - [x] Add `isWorktreeField(field: string): boolean` helper using the set
  - [x] Add field mapping constant: project field → WorktreeContext field (see slice design table)
  - [x] Update `projectSetAction` signature: add `projectLevel?: boolean` to `opts`
  - [x] Change `resolveProjectId` call → `resolveProjectWorktree({ project: opts.project }, store)` (import `resolveProjectWorktree`)
  - [x] After field resolution, add routing branch:
    - [x] If `worktreeId && isWorktreeField(resolvedField) && !opts.projectLevel`:
      - [x] Map `resolvedField` to `WorktreeContext` field name
      - [x] Call `new WorktreeService(store).updateWorktree(projectId, worktreeId, { [worktreeField]: resolvedValue })`
      - [x] Adjust auto-set calls to also target the worktree context (use `WorktreeService.updateWorktree` instead of `store.update`):
        - [x] `developmentPhase` → auto-set `instruction` on worktree
        - [x] `fileArch` (`archDoc`) → auto-set `slicePlan` on worktree
        - [x] `fileSlice` (`activeSlice`) → auto-set `activeTaskFile` on worktree
      - [x] Print confirmation: `'Updated <alias> = <value> on worktree context "<name>"'`
    - [x] Else: existing `store.update` path unchanged (project-level)
  - [x] Import `WorktreeService`, `WorktreeContext` from `@context-forge/core/node` and `@context-forge/core`
  - [x] Import `resolveProjectWorktree` from `../utils/project.js`
- [x] Add `--project-level` flag to `cf set` shortcut in `index.ts`
- [x] Add `--project-level` flag to `cf project set` subcommand in `project.ts`
- [x] Verify: `pnpm --filter @context-forge/cli build` passes

### 11. Make `projectGetAction` worktree-aware

- [x] In `packages/cli/src/commands/project.ts`:
  - [x] Update `projectGetAction` signature: add `projectLevel?: boolean` to `opts`
  - [x] Change `resolveProjectId` call → `resolveProjectWorktree({ project: opts.project }, store)`
  - [x] When `worktreeId` is resolved and `!opts.projectLevel`:
    - [x] Load worktree context from project
    - [x] Print a "Worktree" header section showing name, range, path
    - [x] For each worktree-scoped field in Workflow and Artifacts groups: read from worktree context if set, fall back to project field
  - [x] `--project-level`: skip worktree overlay, show raw project fields
  - [x] JSON output: include `worktree` key with worktree context object when resolved
- [x] Add `--project-level` flag to `cf get` shortcut in `index.ts`
- [x] Add `--project-level` flag to `cf project get` subcommand in `project.ts`
- [x] Verify: `pnpm --filter @context-forge/cli build` passes

### 12. Tests for worktree-aware `projectSetAction` and `projectGetAction`

- [x] In `packages/cli/tests/commands/project.test.ts` (or create `worktree-set-get.test.ts`):
  - [x] `projectSetAction` — worktree-scoped field with `worktreeId` resolved:
    - [x] `fileSlice` update calls `WorktreeService.updateWorktree` with `activeSlice` field
    - [x] `developmentPhase` update calls `WorktreeService.updateWorktree` with both `developmentPhase` and `instruction`
    - [x] `fileArch` update calls `WorktreeService.updateWorktree` and auto-sets `slicePlan`
    - [x] Auto-set output message says `'on worktree context "Name"'`
  - [x] `projectSetAction` — project-scoped field with `worktreeId` resolved:
    - [x] `name` update routes to `store.update` (project level) even with worktree resolved
  - [x] `projectSetAction` with `--project-level` flag:
    - [x] `fileSlice` with `--project-level` routes to `store.update` (project level)
  - [x] `projectSetAction` without worktree (no `worktreeId`):
    - [x] Behaves exactly as before (backwards compatibility)
  - [x] `projectGetAction` — worktree resolved: shows worktree header + worktree-scoped fields from context
  - [x] `projectGetAction` with `--project-level`: shows project fields regardless
  - [x] `projectGetAction` without worktree: output unchanged from current behavior
- [x] Verify: `pnpm --filter @context-forge/cli test` passes

### 13. Full build and test verification

- [x] Run full build from project root: `pnpm -r build`
- [x] Run full test suite from project root: `pnpm -r test`
- [x] Manual smoke test:
  - [x] `cf worktree --help` shows `init`, `list`, `rm` subcommands
  - [x] `cf worktree init --help` shows `--name`, `--range`, `--path`, `--project` options
  - [x] `cf set --help` shows `--project-level` flag
  - [x] `cf get --help` shows `--project-level` flag
- [x] Update task file status to `complete` in frontmatter
- [x] Commit all changes with semantic message: `feat(cli): add cf worktree commands and worktree-aware set/get`

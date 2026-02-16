---
slice: monorepo-scaffolding
project: context-forge
lld: user/slices/140-slice.monorepo-scaffolding.md
dependencies: []
projectState: Working Electron app with src/ at repo root. No monorepo structure yet. pnpm 10.14.0, TypeScript 5.8, electron-vite, React 19, Electron 37.
dateCreated: 20260215
dateUpdated: 20260215
---

## Context Summary

- Working on **monorepo-scaffolding** slice — the first slice in the Context Forge v2 restructure initiative (140-series)
- Current state: single-package Electron app with all code in `src/` at the repo root
- This slice creates the pnpm workspace monorepo structure (`packages/core`, `packages/mcp-server`, `packages/electron`)
- No logic is moved between packages — this is purely structural (file moves + config changes)
- The Electron app must build and run identically after restructuring
- Next planned slice: Core Types Extraction (141)
- Key risk: electron-vite path resolution breakage when config file moves

---

## Tasks

### Task 1: Create `packages/core/` package
**Objective**: Create the empty `@context-forge/core` package with build configuration.

- [x] Create directory `packages/core/src/`
- [x] Create `packages/core/src/index.ts` with an empty barrel export:
  ```ts
  // @context-forge/core — context assembly engine
  // Populated in subsequent extraction slices
  export {}
  ```
- [x] Create `packages/core/package.json` per the slice design (name: `@context-forge/core`, type: module, private: true, version: 0.1.0)
  - [x] Include scripts: `build`, `dev`, `test`, `typecheck`
  - [x] Include devDependencies: `typescript ~5.8.3`, `vitest ^3.2.1`
- [x] Create `packages/core/tsconfig.json` per the slice design (target: ES2023, module: nodenext, moduleResolution: nodenext)
  - [x] Include: declaration, declarationMap, sourceMap, strict, outDir: ./dist, rootDir: ./src

**Success Criteria**:
- [x] `packages/core/` directory exists with package.json, tsconfig.json, and src/index.ts
- [x] Configuration matches the slice design specifications exactly

---

### Task 2: Create `packages/mcp-server/` package
**Objective**: Create the empty `context-forge-mcp` package with build configuration.

- [x] Create directory `packages/mcp-server/src/`
- [x] Create `packages/mcp-server/src/index.ts` with an empty barrel export:
  ```ts
  // context-forge-mcp — MCP protocol wrapper around @context-forge/core
  // Populated in MCP server slices
  export {}
  ```
- [x] Create `packages/mcp-server/package.json` per the slice design (name: `context-forge-mcp`, type: module, private: true, version: 0.1.0)
  - [x] Include `bin` entry: `"context-forge-mcp": "./dist/index.js"`
  - [x] Include `start` script: `node dist/index.js`
  - [x] Include dependency: `"@context-forge/core": "workspace:*"`
  - [x] Include devDependencies: `typescript ~5.8.3`, `vitest ^3.2.1`
  - [x] Do NOT include MCP SDK dependencies yet (added in a later slice)
- [x] Create `packages/mcp-server/tsconfig.json` per the slice design (same as core: ES2023, nodenext)

**Success Criteria**:
- [x] `packages/mcp-server/` directory exists with package.json, tsconfig.json, and src/index.ts
- [x] `@context-forge/core` listed as workspace dependency
- [x] Configuration matches the slice design specifications exactly

---

### Task 3: Move Electron app into `packages/electron/`
**Objective**: Relocate all existing application source code and build configuration into `packages/electron/` using `git mv` to preserve history.

- [x] Create `packages/electron/` directory
- [x] Move source code: `git mv src/ packages/electron/src/`
- [x] Move build config: `git mv electron.vite.config.ts packages/electron/`
- [x] Move HTML entry: `git mv index.html packages/electron/`
- [x] Move test config: `git mv vitest.config.ts packages/electron/`
- [x] Evaluate and move `public/`:
  - [x] Check if `public/` is referenced by electron-vite renderer build
  - [x] If yes, `git mv public/ packages/electron/public/`
  - [x] If no, leave at root
- [x] Evaluate and move `tests/`:
  - [x] Check what tests exist in root `tests/` directory
  - [x] Move them with the Electron app: `git mv tests/ packages/electron/tests/`
- [x] Evaluate `default-statements.md`:
  - [x] Check if referenced from `src/` code
  - [x] If yes, `git mv default-statements.md packages/electron/`
- [x] Verify no stale source files remain at root that should have moved

**Success Criteria**:
- [x] `packages/electron/src/` contains all previous `src/` contents
- [x] `electron.vite.config.ts`, `index.html`, `vitest.config.ts` are in `packages/electron/`
- [x] All moved files show as renames in `git status` (not delete + add)
- [x] No orphaned source or config files remain at root

---

### Task 4: Create `packages/electron/package.json`
**Objective**: Create the Electron package.json by deriving it from the current root package.json.

- [x] Read the current root `package.json` to capture all fields
- [x] Create `packages/electron/package.json` with:
  - [x] `"name": "@context-forge/electron"`
  - [x] All existing `dependencies` moved from root
  - [x] All existing `devDependencies` moved from root
  - [x] Add `"@context-forge/core": "workspace:*"` to dependencies
  - [x] All existing build/dev/test scripts preserved
  - [x] `main` entry updated for the package-relative path (`./out/main/main.js`)
  - [x] Any electron-builder or packaging config preserved
  - [x] Retain `packageManager` field if appropriate, or let root handle it
- [x] Include the ai-support scripts from `snippets/npm-scripts.ai-support.json.md` (setup-guides, update-guides, etc.) in the scripts block
- [x] Verify the scripts reference correct relative paths from `packages/electron/`

**Success Criteria**:
- [x] `packages/electron/package.json` contains all dependencies from the original root
- [x] `@context-forge/core` is declared as a workspace dependency
- [x] Build scripts (`dev`, `build`, `test`, `lint`) are present and point to correct locations

---

### Task 5: Create `packages/electron/tsconfig.json`
**Objective**: Create the Electron TypeScript configuration derived from the current root tsconfig.json.

- [x] Read the current root `tsconfig.json` to capture all compiler options
- [x] Create `packages/electron/tsconfig.json` preserving existing settings
- [x] Update path aliases to be package-relative:
  - [x] `"@/*"` → `["./src/*"]`
  - [x] `"@main/*"` → `["./src/main/*"]`
  - [x] `"@renderer/*"` → `["./src/renderer/*"]`
  - [x] `"@preload/*"` → `["./src/preload/*"]`
- [x] Do NOT change target/module/lib settings — keep existing values (electron-vite manages these)

**Success Criteria**:
- [x] `packages/electron/tsconfig.json` exists with correct path aliases
- [x] Compiler options match the original root tsconfig (except paths)
- [x] No references to monorepo root paths remain

---

### Task 6: Update root configuration for workspace orchestration
**Objective**: Transform root package.json and pnpm-workspace.yaml into workspace orchestrators.

- [x] Update `pnpm-workspace.yaml`:
  - [x] Add `packages: ['packages/*']`
  - [x] Preserve existing `onlyBuiltDependencies` list
- [x] Update root `package.json`:
  - [x] Set `"private": true`
  - [x] Retain `"packageManager": "pnpm@10.14.0"`
  - [x] Remove all `dependencies` and `devDependencies` (moved to electron)
  - [x] Replace scripts with workspace delegation:
    - [x] `"dev": "pnpm --filter @context-forge/electron dev"`
    - [x] `"build": "pnpm --filter @context-forge/electron build"`
    - [x] `"test": "pnpm -r test"`
    - [x] `"lint": "pnpm -r lint"`
    - [x] `"typecheck": "pnpm -r typecheck"`
  - [x] Preserve ai-support scripts (`setup-guides`, `update-guides`, etc.) in root
  - [x] Remove `main` entry (no longer applicable to root)
- [x] Remove or repurpose root `tsconfig.json`:
  - [x] If electron-vite or other tools reference it, convert to a project-references config pointing to `packages/*/tsconfig.json`
  - [x] If nothing references it, remove it
- [x] Update `.gitignore`:
  - [x] Add `packages/*/dist/` for core and mcp-server build output
  - [x] Verify `packages/electron/out/` is covered (was previously `out/`)

**Success Criteria**:
- [x] Root package.json has no direct dependencies
- [x] Root package.json scripts delegate to workspace packages
- [x] `pnpm-workspace.yaml` declares `packages/*`
- [x] `.gitignore` covers all package build output directories

---

### Task 7: Update electron-vite and vitest path references
**Objective**: Fix all path references in build and test configuration files that broke due to the file move.

- [x] Review `packages/electron/electron.vite.config.ts`:
  - [x] Verify entry points resolve correctly (main, preload, renderer)
  - [x] Verify output directories resolve correctly (`out/` relative to package)
  - [x] Verify alias resolution (e.g., `@/` prefix) points to `packages/electron/src/`
  - [x] Verify `externalizeDepsPlugin()` and any custom plugins still work
  - [x] Fix any broken path references
- [x] Review `packages/electron/vitest.config.ts`:
  - [x] Verify test glob patterns resolve correctly from new location
  - [x] Verify setup file path (`src/test/setup.ts`) resolves correctly
  - [x] Fix any broken path references
- [x] Check `scripts/` directory at root:
  - [x] Identify any scripts that reference `src/` directly
  - [x] Update paths or document needed changes

**Success Criteria**:
- [x] `electron.vite.config.ts` has no broken path references
- [x] `vitest.config.ts` has no broken path references
- [x] All paths resolve relative to `packages/electron/`

---

### Task 8: Install dependencies and build verification
**Objective**: Run pnpm install, build all packages, and verify the Electron app works.

- [ ] Run `pnpm install` from repo root
  - [ ] Verify workspace packages are linked (check `node_modules/@context-forge/`)
  - [ ] Resolve any dependency resolution errors
- [ ] Build `@context-forge/core`:
  - [ ] Run `pnpm --filter @context-forge/core build`
  - [ ] Verify `packages/core/dist/index.js` and `packages/core/dist/index.d.ts` are produced
- [ ] Build `context-forge-mcp`:
  - [ ] Run `pnpm --filter context-forge-mcp build`
  - [ ] Verify `packages/mcp-server/dist/index.js` is produced
- [ ] Build `@context-forge/electron`:
  - [ ] Run `pnpm --filter @context-forge/electron build`
  - [ ] Verify `packages/electron/out/` contains main, preload, and renderer output
  - [ ] Fix any build errors (most likely path resolution issues)
- [ ] Run full workspace build:
  - [ ] Run `pnpm -r build`
  - [ ] Verify topological build order: core → mcp-server → electron

**Success Criteria**:
- [ ] All three packages build without errors
- [ ] `pnpm -r build` completes successfully with correct ordering
- [ ] Workspace symlinks are correctly established

---

### Task 9: Run tests and verify app functionality
**Objective**: Confirm all existing tests pass and the Electron app runs correctly.

- [ ] Run tests:
  - [ ] Execute `pnpm --filter @context-forge/electron test`
  - [ ] All existing tests must pass
  - [ ] Fix any test failures caused by path changes
- [ ] Run typecheck:
  - [ ] Execute `pnpm -r typecheck`
  - [ ] No type errors in any package
- [ ] Verify Electron app launches:
  - [ ] Run `pnpm dev` (or `pnpm --filter @context-forge/electron dev`)
  - [ ] App window opens without errors
  - [ ] Dev console shows no new errors or warnings
- [ ] Verify core app functionality:
  - [ ] Can load existing projects
  - [ ] Can edit project configuration
  - [ ] Can generate context output
  - [ ] Can copy generated context to clipboard
  - [ ] IPC communication between main and renderer works

**Success Criteria**:
- [ ] All existing tests pass
- [ ] Typecheck passes across all packages
- [ ] Electron app launches and all core features work
- [ ] No new warnings or errors in dev console

---

### Task 10: Verify cross-package import resolution
**Objective**: Confirm that workspace packages can import from each other.

- [ ] Verify `@context-forge/core` is resolvable from `packages/electron/`:
  - [ ] Add a temporary test import in a test file or scratch file
  - [ ] Confirm TypeScript resolves the import without errors
  - [ ] Remove the temporary import
- [ ] Verify `@context-forge/core` is resolvable from `packages/mcp-server/`:
  - [ ] Add a temporary test import in `packages/mcp-server/src/index.ts`
  - [ ] Confirm TypeScript resolves the import without errors
  - [ ] Remove the temporary import (restore empty export)
- [ ] Verify `pnpm -r build` still succeeds after resolution check

**Success Criteria**:
- [ ] Both `electron` and `mcp-server` can resolve `@context-forge/core` imports
- [ ] TypeScript path aliases in `packages/electron/` work correctly (`@/`, `@main/`, etc.)
- [ ] Clean build after verification

---

### Task 11: Final cleanup and commit
**Objective**: Clean up any remaining issues and commit the monorepo restructure.

- [ ] Run final checks:
  - [ ] `pnpm -r build` — passes
  - [ ] `pnpm -r typecheck` — passes
  - [ ] `pnpm --filter @context-forge/electron test` — passes
  - [ ] `git status` — no untracked files that should be tracked
- [ ] Verify no stale configuration remains:
  - [ ] Root has no `dependencies` or `devDependencies` in package.json
  - [ ] No orphaned `src/` directory at root
  - [ ] No orphaned `tsconfig.json` at root (unless repurposed as project-references)
  - [ ] `.gitignore` covers `packages/*/dist/` and `packages/electron/out/`
- [ ] Commit all changes with a descriptive message
- [ ] Log any discovered issues to `project-documents/user/maintenance/maintenance-tasks.md`

**Success Criteria**:
- [ ] All builds, tests, and typechecks pass
- [ ] Working tree is clean after commit
- [ ] Monorepo structure matches the slice design's target repository layout

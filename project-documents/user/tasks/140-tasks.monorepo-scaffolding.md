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

- [ ] Create directory `packages/core/src/`
- [ ] Create `packages/core/src/index.ts` with an empty barrel export:
  ```ts
  // @context-forge/core — context assembly engine
  // Populated in subsequent extraction slices
  export {}
  ```
- [ ] Create `packages/core/package.json` per the slice design (name: `@context-forge/core`, type: module, private: true, version: 0.1.0)
  - [ ] Include scripts: `build`, `dev`, `test`, `typecheck`
  - [ ] Include devDependencies: `typescript ~5.8.3`, `vitest ^3.2.1`
- [ ] Create `packages/core/tsconfig.json` per the slice design (target: ES2023, module: nodenext, moduleResolution: nodenext)
  - [ ] Include: declaration, declarationMap, sourceMap, strict, outDir: ./dist, rootDir: ./src

**Success Criteria**:
- [ ] `packages/core/` directory exists with package.json, tsconfig.json, and src/index.ts
- [ ] Configuration matches the slice design specifications exactly

---

### Task 2: Create `packages/mcp-server/` package
**Objective**: Create the empty `context-forge-mcp` package with build configuration.

- [ ] Create directory `packages/mcp-server/src/`
- [ ] Create `packages/mcp-server/src/index.ts` with an empty barrel export:
  ```ts
  // context-forge-mcp — MCP protocol wrapper around @context-forge/core
  // Populated in MCP server slices
  export {}
  ```
- [ ] Create `packages/mcp-server/package.json` per the slice design (name: `context-forge-mcp`, type: module, private: true, version: 0.1.0)
  - [ ] Include `bin` entry: `"context-forge-mcp": "./dist/index.js"`
  - [ ] Include `start` script: `node dist/index.js`
  - [ ] Include dependency: `"@context-forge/core": "workspace:*"`
  - [ ] Include devDependencies: `typescript ~5.8.3`, `vitest ^3.2.1`
  - [ ] Do NOT include MCP SDK dependencies yet (added in a later slice)
- [ ] Create `packages/mcp-server/tsconfig.json` per the slice design (same as core: ES2023, nodenext)

**Success Criteria**:
- [ ] `packages/mcp-server/` directory exists with package.json, tsconfig.json, and src/index.ts
- [ ] `@context-forge/core` listed as workspace dependency
- [ ] Configuration matches the slice design specifications exactly

---

### Task 3: Move Electron app into `packages/electron/`
**Objective**: Relocate all existing application source code and build configuration into `packages/electron/` using `git mv` to preserve history.

- [ ] Create `packages/electron/` directory
- [ ] Move source code: `git mv src/ packages/electron/src/`
- [ ] Move build config: `git mv electron.vite.config.ts packages/electron/`
- [ ] Move HTML entry: `git mv index.html packages/electron/`
- [ ] Move test config: `git mv vitest.config.ts packages/electron/`
- [ ] Evaluate and move `public/`:
  - [ ] Check if `public/` is referenced by electron-vite renderer build
  - [ ] If yes, `git mv public/ packages/electron/public/`
  - [ ] If no, leave at root
- [ ] Evaluate and move `tests/`:
  - [ ] Check what tests exist in root `tests/` directory
  - [ ] Move them with the Electron app: `git mv tests/ packages/electron/tests/`
- [ ] Evaluate `default-statements.md`:
  - [ ] Check if referenced from `src/` code
  - [ ] If yes, `git mv default-statements.md packages/electron/`
- [ ] Verify no stale source files remain at root that should have moved

**Success Criteria**:
- [ ] `packages/electron/src/` contains all previous `src/` contents
- [ ] `electron.vite.config.ts`, `index.html`, `vitest.config.ts` are in `packages/electron/`
- [ ] All moved files show as renames in `git status` (not delete + add)
- [ ] No orphaned source or config files remain at root

---

### Task 4: Create `packages/electron/package.json`
**Objective**: Create the Electron package.json by deriving it from the current root package.json.

- [ ] Read the current root `package.json` to capture all fields
- [ ] Create `packages/electron/package.json` with:
  - [ ] `"name": "@context-forge/electron"`
  - [ ] All existing `dependencies` moved from root
  - [ ] All existing `devDependencies` moved from root
  - [ ] Add `"@context-forge/core": "workspace:*"` to dependencies
  - [ ] All existing build/dev/test scripts preserved
  - [ ] `main` entry updated for the package-relative path (`./out/main/main.js`)
  - [ ] Any electron-builder or packaging config preserved
  - [ ] Retain `packageManager` field if appropriate, or let root handle it
- [ ] Include the ai-support scripts from `snippets/npm-scripts.ai-support.json.md` (setup-guides, update-guides, etc.) in the scripts block
- [ ] Verify the scripts reference correct relative paths from `packages/electron/`

**Success Criteria**:
- [ ] `packages/electron/package.json` contains all dependencies from the original root
- [ ] `@context-forge/core` is declared as a workspace dependency
- [ ] Build scripts (`dev`, `build`, `test`, `lint`) are present and point to correct locations

---

### Task 5: Create `packages/electron/tsconfig.json`
**Objective**: Create the Electron TypeScript configuration derived from the current root tsconfig.json.

- [ ] Read the current root `tsconfig.json` to capture all compiler options
- [ ] Create `packages/electron/tsconfig.json` preserving existing settings
- [ ] Update path aliases to be package-relative:
  - [ ] `"@/*"` → `["./src/*"]`
  - [ ] `"@main/*"` → `["./src/main/*"]`
  - [ ] `"@renderer/*"` → `["./src/renderer/*"]`
  - [ ] `"@preload/*"` → `["./src/preload/*"]`
- [ ] Do NOT change target/module/lib settings — keep existing values (electron-vite manages these)

**Success Criteria**:
- [ ] `packages/electron/tsconfig.json` exists with correct path aliases
- [ ] Compiler options match the original root tsconfig (except paths)
- [ ] No references to monorepo root paths remain

---

### Task 6: Update root configuration for workspace orchestration
**Objective**: Transform root package.json and pnpm-workspace.yaml into workspace orchestrators.

- [ ] Update `pnpm-workspace.yaml`:
  - [ ] Add `packages: ['packages/*']`
  - [ ] Preserve existing `onlyBuiltDependencies` list
- [ ] Update root `package.json`:
  - [ ] Set `"private": true`
  - [ ] Retain `"packageManager": "pnpm@10.14.0"`
  - [ ] Remove all `dependencies` and `devDependencies` (moved to electron)
  - [ ] Replace scripts with workspace delegation:
    - [ ] `"dev": "pnpm --filter @context-forge/electron dev"`
    - [ ] `"build": "pnpm --filter @context-forge/electron build"`
    - [ ] `"test": "pnpm -r test"`
    - [ ] `"lint": "pnpm -r lint"`
    - [ ] `"typecheck": "pnpm -r typecheck"`
  - [ ] Preserve ai-support scripts (`setup-guides`, `update-guides`, etc.) in root
  - [ ] Remove `main` entry (no longer applicable to root)
- [ ] Remove or repurpose root `tsconfig.json`:
  - [ ] If electron-vite or other tools reference it, convert to a project-references config pointing to `packages/*/tsconfig.json`
  - [ ] If nothing references it, remove it
- [ ] Update `.gitignore`:
  - [ ] Add `packages/*/dist/` for core and mcp-server build output
  - [ ] Verify `packages/electron/out/` is covered (was previously `out/`)

**Success Criteria**:
- [ ] Root package.json has no direct dependencies
- [ ] Root package.json scripts delegate to workspace packages
- [ ] `pnpm-workspace.yaml` declares `packages/*`
- [ ] `.gitignore` covers all package build output directories

---

### Task 7: Update electron-vite and vitest path references
**Objective**: Fix all path references in build and test configuration files that broke due to the file move.

- [ ] Review `packages/electron/electron.vite.config.ts`:
  - [ ] Verify entry points resolve correctly (main, preload, renderer)
  - [ ] Verify output directories resolve correctly (`out/` relative to package)
  - [ ] Verify alias resolution (e.g., `@/` prefix) points to `packages/electron/src/`
  - [ ] Verify `externalizeDepsPlugin()` and any custom plugins still work
  - [ ] Fix any broken path references
- [ ] Review `packages/electron/vitest.config.ts`:
  - [ ] Verify test glob patterns resolve correctly from new location
  - [ ] Verify setup file path (`src/test/setup.ts`) resolves correctly
  - [ ] Fix any broken path references
- [ ] Check `scripts/` directory at root:
  - [ ] Identify any scripts that reference `src/` directly
  - [ ] Update paths or document needed changes

**Success Criteria**:
- [ ] `electron.vite.config.ts` has no broken path references
- [ ] `vitest.config.ts` has no broken path references
- [ ] All paths resolve relative to `packages/electron/`

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

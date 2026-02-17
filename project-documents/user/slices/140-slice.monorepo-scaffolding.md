---
docType: slice-design
slice: monorepo-scaffolding
project: context-forge
parent: user/architecture/140-slices.context-forge-restructure.md
dependencies: []
interfaces: [core-types-extraction, core-services-extraction, storage-migration]
status: in-progress
dateCreated: 20260215
dateUpdated: 20260217
---

# Slice Design: Monorepo Scaffolding

## Overview

Create the pnpm workspace monorepo structure for Context Forge. Move the existing `src/` into `packages/electron/` and create empty `packages/core/` and `packages/mcp-server/` packages with build configuration. The Electron app must still build and run identically after this change.

This is the foundational slice that every subsequent restructuring slice depends on. It is purely structural — no logic is moved or modified.

## Value

- **Architectural enablement**: Unblocks all subsequent extraction and feature slices (types, services, orchestration, storage, MCP server)
- **Developer experience**: Establishes the workspace structure that allows packages to import from each other via `@context-forge/core`
- **Zero user-facing change**: The Electron app continues to work identically — this is invisible to end users

## Technical Scope

### Included

- Convert root into a pnpm workspace with `packages/*` glob
- Move existing application code into `packages/electron/`
- Create `packages/core/` with package.json, tsconfig.json, empty `src/index.ts`
- Create `packages/mcp-server/` with package.json, tsconfig.json, empty `src/index.ts`
- Update all path references (tsconfig paths, electron-vite config, import aliases)
- Update root package.json scripts to delegate to workspace packages
- Verify Electron app builds and runs

### Excluded

- Moving any service code between packages (that's slices 2-5)
- Installing MCP SDK dependencies (that's slice 6)
- Any logic changes — this is a pure file-move and configuration exercise

## Dependencies

### Prerequisites

None. This is the first slice in the restructure sequence.

### Interfaces Required

None. This slice only consumes existing codebase structure.

## Architecture

### Repository Structure (After This Slice)

```
context-forge/
├── project-documents/              # Unchanged
│   ├── ai-project-guide/           # Git submodule (unchanged)
│   └── user/                       # Project docs (unchanged)
├── packages/
│   ├── core/                       # NEW — empty package
│   │   ├── src/
│   │   │   └── index.ts            # Empty barrel export
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── mcp-server/                 # NEW — empty package
│   │   ├── src/
│   │   │   └── index.ts            # Empty barrel export
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── electron/                   # MOVED — existing app
│       ├── src/                    # Current src/ contents
│       │   ├── main/
│       │   ├── renderer/
│       │   ├── preload/
│       │   ├── services/
│       │   ├── components/
│       │   ├── pages/
│       │   ├── hooks/
│       │   ├── lib/
│       │   ├── content/
│       │   ├── features/
│       │   └── test/
│       ├── electron.vite.config.ts
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       └── vitest.config.ts
├── content/                        # Unchanged (not part of src/)
├── docs/                           # Unchanged
├── lib/                            # Unchanged
├── public/                         # Evaluate: may move to electron/
├── scripts/                        # Unchanged
├── tests/                          # Evaluate: may move to electron/
├── pnpm-workspace.yaml             # UPDATED
├── package.json                    # UPDATED — workspace root
├── CLAUDE.md                       # Unchanged
├── README.md                       # Unchanged
└── DEVLOG.md                       # Unchanged
```

### Package Configuration

#### Root `package.json`

The root becomes a workspace orchestrator:

- Set `"private": true` (workspace roots are not publishable)
- Retain `packageManager` field (`pnpm@10.14.0`)
- Define convenience scripts that delegate to packages:
  - `"dev": "pnpm --filter @context-forge/electron dev"`
  - `"build": "pnpm --filter @context-forge/electron build"`
  - `"test": "pnpm -r test"`
  - `"lint": "pnpm -r lint"`
  - `"typecheck": "pnpm -r typecheck"`
- Remove direct dependencies (they move to `packages/electron/package.json`)

#### Root `pnpm-workspace.yaml`

```yaml
packages:
  - 'packages/*'

onlyBuiltDependencies:
  - '@tailwindcss/oxide'
  - electron
  - electron-winstaller
  - esbuild
```

The existing `onlyBuiltDependencies` configuration is preserved.

#### `packages/core/package.json`

```json
{
  "name": "@context-forge/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "~5.8.3",
    "vitest": "^3.2.1"
  }
}
```

Note: `private: true` initially. Changes to `false` when ready to publish to npm (slice 12).

#### `packages/core/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "lib": ["ES2023"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

See "ES Target Decision" in Technical Decisions for the rationale behind ES2023/nodenext.

#### `packages/mcp-server/package.json`

```json
{
  "name": "context-forge-mcp",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "dist/index.js",
  "bin": {
    "context-forge-mcp": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "start": "node dist/index.js",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@context-forge/core": "workspace:*"
  },
  "devDependencies": {
    "typescript": "~5.8.3",
    "vitest": "^3.2.1"
  }
}
```

Naming follows [Anthropic's convention](https://github.com/anthropics/skills/blob/main/skills/mcp-builder/reference/node_mcp_server.md): `context-forge-mcp`. The `bin` entry enables `npx context-forge-mcp` after publish. MCP SDK dependencies (`@modelcontextprotocol/server`, `zod`) are added in slice 6.

#### `packages/mcp-server/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "lib": ["ES2023"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "noUnusedLocals": true,
    "noUnusedParameters": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

#### `packages/electron/package.json`

Inherits the current root `package.json` with these changes:

- `"name": "@context-forge/electron"` (scoped, workspace-internal)
- All existing `dependencies` and `devDependencies` move here
- Build scripts remain (`dev`, `build`, `test`, etc.)
- Add `"@context-forge/core": "workspace:*"` to dependencies (initially unused, ready for extraction slices)
- Packaging config (electron-builder) remains here
- The `main` entry point updates to reflect the new `out/` path within the package

#### `packages/electron/tsconfig.json`

Derived from the current root `tsconfig.json`. Path aliases update to be package-relative:

```json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@main/*": ["./src/main/*"],
      "@renderer/*": ["./src/renderer/*"],
      "@preload/*": ["./src/preload/*"]
    }
  }
}
```

The Electron package retains its existing target/module settings — electron-vite manages module format per target (ESM for main, CJS for preload, bundled for renderer). Do not change the Electron tsconfig target to match core/mcp-server; Electron's bundled Node.js version may differ.

#### `packages/electron/electron.vite.config.ts`

The existing config moves into `packages/electron/`. Path references within the config (entry points, output dirs, alias resolution) must be verified against the new package-relative location. Since electron-vite resolves paths relative to the config file location, most paths should work unchanged.

### Files That Stay at Root

- `CLAUDE.md`, `README.md`, `DEVLOG.md`, `ARCHIVE.md` — project-level docs
- `project-documents/` — all project documentation
- `content/` — content assets (referenced by absolute path from Electron, review during implementation)
- `docs/` — documentation
- `lib/` — shared libraries
- `scripts/` — build/utility scripts
- `.gitignore`, `.eslintrc.*`, `.prettierrc.*` — tooling config

### Files That Move to `packages/electron/`

- `src/` (entire directory)
- `electron.vite.config.ts`
- `index.html`
- `vitest.config.ts`
- `default-statements.md` (if referenced from src/)
- `public/` (if used by Electron's renderer build)
- `tests/` (if they test Electron-specific code)

### Files That Need Decision During Implementation

- `public/` — likely moves to electron, but verify asset resolution
- `tests/` — currently at root, contains unit tests for services; some may later belong in `packages/core/` but for this slice they move with Electron
- `content/` — stays at root if referenced by project path, moves if bundled
- `lib/` — evaluate whether it's used at build time or runtime
- `scripts/` — stays at root (build orchestration)

## Technical Decisions

### ES Target Decision

**Decision**: `ES2023` target, `ES2023` lib, `nodenext` module for `core` and `mcp-server`.

The current codebase uses `ES2022`. This is under-targeting for the actual Node.js runtime (v20.19.4). The [TypeScript Node Target Mapping](https://github.com/microsoft/TypeScript/wiki/Node-Target-Mapping) recommends:

| Node.js | Target | Lib | Module |
|---------|--------|-----|--------|
| 18 | ES2022 | ES2022 | node16 |
| 20 | ES2023 | ES2023 | nodenext |
| 22 | ES2023 | ES2023 | nodenext |
| 24 | ES2024 | ES2024 | nodenext |

**Why ES2023, not ES2024/ES2025:**
- ES2023 is the TypeScript-recommended target for Node 20 (current LTS, our runtime)
- ES2023 adds `Array.findLast()`, `Array.findLastIndex()` over ES2022 — useful convenience methods
- ES2024 adds `Object.groupBy()`, `Promise.withResolvers()` — useful but Node 20 support is incomplete for some features
- ES2025 adds iterator helpers and Set methods — TypeScript 5.8 doesn't fully support `ES2025` as a target value, and these features aren't reliably available in Node 20
- If we bump to Node 22+, we can bump to ES2024 with a one-line tsconfig change

**Why `nodenext`, not `bundler`:**
- `nodenext` is the [TypeScript team's recommended module setting](https://www.typescriptlang.org/docs/handbook/modules/guides/choosing-compiler-options.html) for Node.js packages
- It enforces correct ESM import paths (`.js` extensions) which matters for packages that will be published to npm
- `bundler` is appropriate when a bundler (Vite, webpack) handles module resolution — correct for Electron, not for core/mcp-server which compile with plain `tsc`

**Electron package**: Retains its existing target/module settings. Electron-vite handles the compilation — changing those settings is out of scope for this slice and could break the existing build.

### Build Strategy

Each package has its own build:

| Package | Build Tool | Output | Module |
|---------|-----------|--------|--------|
| `core` | `tsc` | `dist/` with `.js` + `.d.ts` | ESM |
| `mcp-server` | `tsc` | `dist/` with `.js` + `.d.ts` | ESM |
| `electron` | `electron-vite` (unchanged) | `out/` (main, preload, renderer) | Mixed |

No Turborepo or nx. Build order is handled by pnpm's built-in topological sort via `pnpm -r build` — it resolves the dependency graph (`core` builds before `mcp-server` and `electron` because they depend on it).

### Module System

- `core` and `mcp-server`: ESM (`"type": "module"`, `"module": "nodenext"`)
- `electron`: retains current configuration (electron-vite handles module format per target — ESM for main, CJS for preload, bundled for renderer)

ESM is the correct choice for `core` and `mcp-server`:
- The [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk) is ESM-only
- Node.js 20+ has stable ESM support
- The [Anthropic MCP server guide](https://github.com/anthropics/skills/blob/main/skills/mcp-builder/reference/node_mcp_server.md) specifies `"type": "module"`

### Package Linking

pnpm workspaces handle cross-package imports automatically. When `packages/electron/package.json` declares `"@context-forge/core": "workspace:*"`, pnpm symlinks the package. No manual `npm link` needed.

During this slice, `packages/electron/` does not yet import from `@context-forge/core` — that happens in slice 2. The dependency declaration is added now so the workspace link is established.

### MCP Server Naming

Per the [Anthropic MCP server guide](https://github.com/anthropics/skills/blob/main/skills/mcp-builder/reference/node_mcp_server.md), server packages use the format `{service}-mcp-server`. Our architecture doc chose the shorter `context-forge-mcp` which is also acceptable and more concise for npm install commands. The package is named `context-forge-mcp` with the bin entry matching.

Tool names will follow Anthropic's snake_case convention with service prefix: `context_build`, `project_get`, `project_list`, etc. (defined in slice 6, not this slice).

## Implementation Details

### Migration Plan

This is a file-move and configuration exercise. No logic changes.

**Step 1: Create workspace structure**
1. Create `packages/` directory
2. Create `packages/core/` with package.json, tsconfig.json, `src/index.ts`
3. Create `packages/mcp-server/` with package.json, tsconfig.json, `src/index.ts`

**Step 2: Move Electron app**
1. Create `packages/electron/`
2. `git mv src/ packages/electron/src/`
3. `git mv electron.vite.config.ts packages/electron/`
4. `git mv index.html packages/electron/`
5. `git mv vitest.config.ts packages/electron/`
6. Evaluate and move `public/`, `tests/`, `default-statements.md` as needed
7. Create `packages/electron/package.json` from root package.json (move dependencies)
8. Create `packages/electron/tsconfig.json` from root tsconfig.json (update paths)

**Step 3: Update root configuration**
1. Update `pnpm-workspace.yaml` to include `packages/*`
2. Simplify root `package.json` to workspace orchestrator
3. Remove root `tsconfig.json` (each package has its own) or convert to project-references root

**Step 4: Update path references**
1. Update electron-vite config paths (entry points, aliases)
2. Update vitest config paths
3. Update any hardcoded paths in scripts
4. Update `.gitignore` for new `dist/` and `out/` locations

**Step 5: Install and verify**
1. Run `pnpm install` from root to establish workspace links
2. Run `pnpm --filter @context-forge/core build` — should compile empty index.ts
3. Run `pnpm --filter @context-forge/electron build` — Electron app must build successfully
4. Run `pnpm --filter @context-forge/electron dev` — app must launch and function
5. Run `pnpm --filter @context-forge/electron test` — existing tests must pass

**Step 6: Verify packaging (if applicable)**
1. If electron-builder is configured, verify that the packaged app still works
2. Update any packaging paths in electron-builder config

### Consumer Updates

No consumer updates needed — this slice only restructures files. All imports within the Electron app remain internal to `packages/electron/`.

### Behavior Verification

The definition of "works identically" for this slice:

1. `pnpm dev` launches the Electron app with hot reload
2. `pnpm build` produces a working Electron build
3. `pnpm test` runs all existing tests and they pass
4. The app can load projects, edit configuration, generate context, and copy to clipboard
5. All IPC communication between main and renderer processes functions
6. No new warnings or errors in dev console or terminal

## Integration Points

### Provides to Other Slices

- **Workspace structure**: All subsequent slices assume `packages/core/`, `packages/mcp-server/`, `packages/electron/` exist
- **Package linkage**: `@context-forge/core` is importable from both `mcp-server` and `electron` via `workspace:*`
- **Build pipeline**: `pnpm -r build` builds packages in correct dependency order
- **TypeScript configuration**: Each package has its own tsconfig with appropriate settings for its runtime target

### Consumes from Other Slices

Nothing — this is the first slice.

## Success Criteria

### Functional Requirements

- [ ] Electron app builds successfully from `packages/electron/`
- [ ] Electron app launches and runs identically to pre-restructure
- [ ] All existing tests pass from their new location
- [ ] `pnpm install` from root correctly links workspace packages
- [ ] `pnpm -r build` builds all three packages in correct order

### Technical Requirements

- [ ] `packages/core/` has valid package.json, tsconfig.json, and compiles
- [ ] `packages/mcp-server/` has valid package.json, tsconfig.json, and compiles
- [ ] `packages/electron/` has all Electron-specific configuration and builds
- [ ] Root package.json is a workspace orchestrator (private, no direct dependencies)
- [ ] pnpm-workspace.yaml correctly defines workspace packages
- [ ] No stale files remain at the root that should have moved
- [ ] `.gitignore` updated for new `dist/` directories in packages

### Integration Requirements

- [ ] `@context-forge/core` is resolvable as an import from `packages/electron/`
- [ ] `@context-forge/core` is resolvable as an import from `packages/mcp-server/`
- [ ] TypeScript path aliases work correctly within `packages/electron/`

## Risk Assessment

### Technical Risks

**Path resolution breakage** — Electron-vite resolves paths relative to config file location. Moving the config file changes the base directory for all relative paths. This is the most likely source of build failures.

### Mitigation

- Test the build incrementally: move config first, fix paths, verify build before continuing
- Keep `git stash` or a branch so the working state can be restored instantly
- Electron-vite uses Vite under the hood — Vite's `root` config option can explicitly set the project root if relative resolution fails

## Implementation Notes

### Development Approach

**Suggested order**: Steps 1-2-3-4-5 as listed in the migration plan. Step 2 (moving the Electron app) is the critical path.

**Testing strategy**: Build and test after each step, not just at the end. The most critical verification point is after Step 4 (path updates) — if the build works there, the rest is mechanical.

### Special Considerations

- **Git history**: Use `git mv` for file moves to preserve history tracking
- **CLAUDE.md references**: The project's CLAUDE.md references `src/` paths conceptually. These do not need updating for this slice — subsequent slices that move logic will update documentation as appropriate.
- **CI/CD**: If any CI scripts reference `src/` directly, they need updating. Check `scripts/` directory.
- **`nodenext` module resolution**: This requires `.js` extensions on relative imports (e.g., `import { Foo } from './types.js'`). For `core` and `mcp-server` this is fine since they start empty. When code is extracted into them (slices 2-5), import paths must include extensions. This is a consideration for those slices, not this one.
- **MCP SDK version awareness**: The MCP TypeScript SDK has v1 and v2 with different import paths and package structures. v1 uses subpath exports from a single package (`@modelcontextprotocol/sdk/server/mcp.js`, `@modelcontextprotocol/sdk/server/stdio.js`). v2 ships as separate packages (`@modelcontextprotocol/server`, `@modelcontextprotocol/client`) with optional middleware packages. As of February 2026, v2 stable may have just landed or be imminent (anticipated Q1 2026); v1.x will receive bug fixes for at least 6 months post-v2. The MCP Server — Project Tools slice must check the actual SDK README at implementation time to determine which version to use — do not rely on cached documentation. The local tool guide at `ai-project-guide/tool-guides/mcp/01-overview.md` provides additional MCP development guidance. This slice only sets up the empty package structure.
- **Transport terminology**: The MCP protocol defines two standard transports: **stdio** (for local process integration — Claude Code, Cursor) and **Streamable HTTP** (for remote/network scenarios). SSE is deprecated as of protocol version 2025-03-26. For Context Forge, stdio is correct and sufficient for the MCP server slices; Streamable HTTP would only matter if Electron connects as an MCP client over HTTP, which is deferred to post-v2.

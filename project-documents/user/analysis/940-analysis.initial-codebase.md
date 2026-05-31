---
layer: user
docType: analysis
topic: initial-codebase
project: context-forge
dateCreated: 20260518
dateUpdated: 20260518
status: complete
---

# Context Forge — Initial Codebase Analysis

<!-- Phase 1: Discovery | Phase 2: Prioritized Findings -->

## Overview

Context Forge is a project context generation and management tool for AI-assisted development. It is a **TypeScript monorepo** (pnpm workspaces) with five packages sharing a single core engine. Users interact via CLI, MCP server, Electron desktop app, or Claude Code slash commands.

---

## Architecture

### Monorepo Structure

```
packages/
├── core/           @context-forge/core        — context engine (shared by all interfaces)
├── cli/            @context-forge/cli         — terminal interface (`cf` command)
├── mcp-server/     @context-forge/mcp         — MCP protocol server (34 tools)
├── electron/       @context-forge/electron    — desktop GUI (Electron + React, secondary priority)
└── context-forge/  @context-forge/context-forge — meta-package (installs CLI + MCP)
```

All interfaces delegate to `@context-forge/core`. The core has dual entry points:
- `index.ts` — browser-safe types and logic (usable in Electron renderer)
- `node.ts` — Node.js-only services (fs, git, child_process)

### Key Subsystems

**Context Generation Pipeline**
`ContextIntegrator` → `SystemPromptParser` → `SectionBuilder` → `ContextTemplateEngine` → `TemplateProcessor`

**Introspection Pipeline**
`ArtifactIntrospector` → `ProjectModelBuilder` → `ConsistencyChecker` → `WorkflowNavigator`

**Storage**
`FileProjectStore` (JSON CRUD) + `FileStorageService` + `backupService` (keeps last 10)

**Configuration**
Two-tier TOML (`~/.config/context-forge/config.toml` + project-level); 50+ keys in `ConfigKeys.ts`

**Worktree Support**
`WorktreeService` + `GitWorktreeDiscovery` — native parallel git worktree management with per-worktree context overlays

---

## Technology Stack

| Concern | Choice |
|---|---|
| Language | TypeScript 5.8.3, strict mode |
| Runtime | Node.js 18+ |
| Module system | ESM (`"type": "module"` everywhere) |
| Package manager | pnpm 10.14.0 |
| Build orchestration | Turbo (local caching via `.turbo/`) |
| Compiler | Direct `tsc` — no bundler for core/cli/mcp |
| CLI framework | Commander 13.1.0 |
| MCP SDK | @modelcontextprotocol/sdk 1.26.0 |
| Validation | Zod 4.1.5 (MCP server) |
| Desktop | Electron 37.4.0 + Vite 7.1.2 + React 19.1.1 |
| Desktop UI | Tailwind CSS 4.1.12, Radix UI, Framer Motion |
| Desktop routing | React Router DOM 7.8.2 |
| Terminal output | Chalk 5.6.2 |
| TOML parsing | smol-toml 1.6.0 |
| Config paths | env-paths 4.0.0 |
| Test runner | Vitest 3.2.1 |

**Core runtime dependencies: 3** (env-paths, smol-toml, tar) — minimal and intentional.

---

## Source Metrics

| Package | Source lines (approx) | Test files | Test lines (approx) |
|---|---|---|---|
| core | 9,157 | 42 | ~14,000 |
| cli | 4,766 | 28 | ~6,000 |
| mcp-server | 2,348 | 13 | ~3,000 |
| electron | 4,413 | 11 | ~1,132 |
| **Total** | **~20,684** | **94** | **~24,132** |

Test-to-source ratio is approximately **1.2:1** by line count (healthy).

---

## Test Coverage

- **Framework:** Vitest (per-package `vitest.config.ts`)
- **Convention:** `tests/` directory per package, mirrors `src/` structure; `.test.ts` suffix
- **Fixtures/helpers:** Present in `tests/fixtures/` and `tests/helpers/`
- **Integration tests:** `tests/integration/` directories present in core and cli

Coverage appears **good for core and cli**; MCP server and Electron have lighter coverage. No CI pipeline enforces this automatically.

---

## CI/CD

**No automated CI/CD pipeline is present.** There are no `.github/workflows/`, `azure-pipelines.yml`, or similar files. Tests run locally only. The `.turbo/` directory indicates local Turbo caching.

Build scripts in root `package.json`:
- `pnpm build` — full monorepo build (recursive)
- `pnpm test` — runs all package tests
- `pnpm typecheck` — TypeScript type checking
- `pnpm lint` — linting (ESLint not confirmed; may be custom)

---

## Code Quality

**Strengths:**
- TypeScript `strict: true` with `noUnusedLocals` and `noUnusedParameters`
- Interface-based service design (testable via DI)
- Pure function parsers in introspection module
- Discriminated unions enforce exhaustiveness at compile time
- Minimal external dependencies
- Clear file naming conventions (kebab-case files, PascalCase types)

**Standards from CLAUDE.md:**
- Max ~300 lines/file, ~50 lines/function
- No magic defaults; no silent fallbacks
- No `any` types
- Explicit error handling

---

## Notable Technical Debt

1. **No CI/CD pipeline** — Tests rely entirely on local developer execution; regressions can ship undetected.
2. **Electron app secondary priority** — UI has noted issues and is not actively maintained. Lint/type errors may accumulate.
3. **Preload script in CJS** — `packages/electron/src/main/preload.ts` compiles as CommonJS (Electron context isolation requirement); inconsistent with rest of codebase.
4. **Two minor extraction TODOs** in `workflowTools.ts` (line 178–180) and CLI `project.ts` (line 194) — path resolution logic duplicated vs core.
5. **No ESLint or Prettier config confirmed** — Code style relies on TypeScript strictness and reviewer discipline rather than automated formatting enforcement.
6. **Turbo config absent from root** — `.turbo/` cache exists but `turbo.json` was not found; may use default pipeline or inline config.

---

## Project Documents

The `project-documents/` directory is a git submodule pointing to the `ai-project-guide` repo. It contains the full development methodology (phases 1–7), tool guides, and process documentation used to develop Context Forge itself.

```
project-documents/ai-project-guide/
├── project-guides/
│   └── guide.ai-project.process.md   — master workflow guide
├── tool-guides/                       — per-tool usage guides
└── ...
```

---

## Deployment

Published to npm under the `@context-forge/` scope. Current version: **0.8.1**.

Publish command: `pnpm publish -r --access public` (requires active npm auth token).

---

## Summary Assessment

Context Forge is a well-architected, actively maintained tool with strong TypeScript discipline, comprehensive tests, and a clean monorepo structure. The primary gaps are the absence of a CI/CD pipeline and the lower-priority Electron package which carries some technical debt. Core, CLI, and MCP server packages are in good shape.

---

---

# Phase 2 — Prioritized Findings

*Processed: 2026-05-18. Source: Phase 1 discovery above.*

---

## Critical Issues (P0 / P1)

### [P1] No CI/CD Pipeline

**Overview:** There are no automated test or build checks on commits or PRs. The root `pnpm lint` delegates to per-package lint scripts, but only the `electron` package has ESLint configured — `core`, `cli`, and `mcp-server` have no linter at all.

**Context:** Regressions in core logic, broken builds, or type errors in CLI/MCP packages can ship to npm without any automated gate. At v0.8.1 with active releases, this is a real risk.

**Conditions:**
- No `.github/workflows/` directory exists.
- `core`, `cli`, `mcp-server` have no `lint` script and no ESLint/Prettier dependency.
- `electron` has ESLint 9 configured but it is not run in CI.
- `pnpm test` and `pnpm typecheck` work locally but are never enforced automatically.

**Recommended action:** Add a GitHub Actions workflow (`ci.yml`) that runs `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm typecheck`, and `pnpm test` on push and PR to `main`.

---

## Additional Issues (P2 / P3)

### [P2] No Linter for Core, CLI, or MCP Server Packages

**Overview:** ESLint is configured only in the `electron` package. The three most-used packages (`core`, `cli`, `mcp-server`) have no linting at all. Code quality relies entirely on TypeScript strictness and manual review.

**Context:** Given the strict TypeScript config this has been adequate, but there is no automated check for things like unused imports that `noUnusedLocals` doesn't catch, style inconsistencies, or rules specific to the Node.js/ESM environment.

**Conditions:**
- `packages/core/package.json`, `packages/cli/package.json`, `packages/mcp-server/package.json` — no `lint` script, no ESLint dependency.
- Root `pnpm lint` runs recursively but produces no output for these packages.

**Recommended action:** Add a shared ESLint flat config at the monorepo root, extend it in each package, and add a `lint` script to core/cli/mcp-server.

---

### [P2] Duplicated Resolution Logic — TODO Items

**Overview:** Two documented TODOs mark logic that should live in `@context-forge/core` but is duplicated in MCP server and CLI packages.

**Locations:**
- [packages/mcp-server/src/tools/workflowTools.ts:27](packages/mcp-server/src/tools/workflowTools.ts#L27) and [line 275](packages/mcp-server/src/tools/workflowTools.ts#L275) — merge logic duplicated; should be extracted to core shared utility (200-slices future work item 7)
- [packages/cli/src/utils/project.ts:97](packages/cli/src/utils/project.ts#L97) — path matching and worktree matching resolution logic; candidate for core extraction (slice-186 follow-up)

**Context:** Not blocking, but violates the DRY principle enforced by CLAUDE.md. If the resolution logic changes in one place, the other may drift.

**Recommended action:** Create a shared utility in `@context-forge/core` for the merge and resolution logic, then update both consumers. Track as a maintenance slice.

---

### [P3] Electron Package Technical Debt

**Overview:** The Electron package is explicitly designated secondary priority and is known to have unresolved issues.

**Context:** The preload script (`packages/electron/src/main/preload.ts`) must compile as CommonJS (Electron context isolation requirement) while the rest of the monorepo is ESM-only. This is not fixable without changing Electron's architecture. ESLint is configured in this package but issues have not been systematically resolved.

**Conditions:**
- `electron.vite.config.ts` handles the CJS/ESM split for the preload
- ESLint 9 with typescript-eslint and react plugins is present but no CI enforces it
- Noted in DEVLOG and CHANGELOG as secondary priority

**Recommended action:** Audit ESLint output in the electron package, fix or suppress with justification. No architectural change needed for the CJS preload — this is an Electron constraint.

---

### [P3] Turbo Configuration

**Overview:** The `.turbo/` cache directory exists and is populated but no `turbo.json` was found at the monorepo root.

**Context:** Turbo may be operating on defaults or the config may be embedded in `package.json`. Without an explicit `turbo.json`, the pipeline topology (task dependencies, cache inputs/outputs) is not visible or reviewable.

**Conditions:**
- `.turbo/` cache directory present
- No `turbo.json` at repo root
- Root `package.json` does not appear to contain a `turbo` key

**Recommended action:** Confirm whether Turbo config is intentionally absent (pure pnpm recursive) or if a `turbo.json` should be added to make task dependency and caching explicit.

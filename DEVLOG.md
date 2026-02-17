# Development Log

A lightweight, append-only record of development activity. Newest entries first.

Format: `## YYYY-MM-DD` followed by brief notes (1-3 lines per session).

---

## 2026-02-17
### Slice 140: Monorepo Scaffolding — Complete
- 8 commits on main (d18e39d → 08e7d2c), foundation slice checked off in 140-slices
- Created pnpm workspace with 3 packages: `@context-forge/core`, `context-forge-mcp`, `@context-forge/electron`
- All packages build in topological order (core → mcp-server → electron), workspace symlinks working
- `.npmrc` with `public-hoist-pattern[]=electron` required — pnpm strict mode prevents electron-vite from resolving the electron binary; hoisting fixes this without affecting published packages
- `electron.vite.config.ts` needed two path fixes after move: vite-plugin-content import (`../../lib/vite/...`) and content alias (`../../content`)
- Root tsconfig.json converted to project-references; root package.json stripped to workspace orchestrator
- 157/163 tests pass (6 pre-existing failures logged to 999-tasks.maintenance-ongoing.md — stale IPC test mocks and prompt path expectations)
- Dependency isolation confirmed: core has zero runtime deps, mcp-server depends only on core — no electron/UI leakage to MCP consumers
- Pending: manual verification of Electron launch + core app functionality
- Next: Slice 2 (Core Types Extraction)

## 2026-02-07

- Reorganized slice 125 for macOS-only focus; deferred Linux (126) and Windows (127)
- Reduced packaging tasks from 64 to ~20 focused items across 5 phases
- Resolved unchecked tasks: deferred 101.10.4, checked 105 criteria, deferred 110 loading states
- Logged 6 test failures (all infrastructure/mocking, no code bugs) to 900-tasks.test-infrastructure-deferred.md
- Increased character limits: Project State, Additional Instructions, Monorepo Structure from 8K → 32K
- Established hybrid PR strategy: batch small changes into tasks, create PRs for feature-complete slices
- Ready to begin Phase 1: unsigned macOS DMG build

## 2025-01-16

- Resumed project after ~2 month hiatus
- Evaluated context-forge vs context-forge-pro state with AI assistance
- Decision: continue in Pro repo, Mac-only packaging initially
- Added DEVLOG.md for better project continuity

## 2025-11-18 (reconstructed from git)

- Last active development before hiatus
- Updated window title to 'Context Forge Pro'
- Initialized ai-project-guide submodule
- Established Pro/Free sync infrastructure

## 2025-11-17 (reconstructed from git)

- Completed maintenance slice (900-tasks.maintenance.md)
- Fixed undo/redo in textarea fields (Issue #21)
- Added development-phase field for context output
- Task file auto-population from slice names

---

*Entries below this line are reconstructed from git history and task files.*

## 2025-10 (summary)

- MVP feature completion
- Multi-project support finalized
- Context generation engine stable
- Monorepo mode settings added

## 2025-09 (summary)

- Initial maintenance infrastructure
- Application menu implementation
- Core slice completion (100-115)

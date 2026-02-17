---
layer: project
docType: maintenance
dateCreated: 20260213
dateUpdated: 20260217
---

# Maintenance Tasks

- [ ] [Issue #27](https://github.com/ecorkran/context-forge/issues/27): Fix TypeScript errors in `src/lib/ui-core/components/form/combobox.tsx` — missing `downshift` module/types and 6 implicit `any` parameters (P2)
- [x] Flush pending saves on app quit (P1) — Added `before-quit` handler in main process that sends `app:flush-save` to renderer, plus `onFlushSave` listener in ContextBuilderApp that performs an immediate save via refs. Implemented 2026-02-13.
- [ ] [Issue #28](https://github.com/ecorkran/context-forge/issues/28): Bypass debounce for discrete settings actions (P2, deferred) — `handleProjectUpdate` should save immediately via `persistentStore.updateProject()` for click-based changes (projectPath, monorepo toggle, dropdowns) rather than relying solely on the 500ms debounced auto-save. The flush-on-quit safety net covers the edge case; this is the principled UX fix.
- [ ] Pre-existing test failures in `IPCIntegration.test.ts` (7 tests) — Tests expect old prompt file path `prompt.ai-project.system.md` but code now uses full path `project-documents/ai-project-guide/project-guides/prompt.ai-project.system.md`. Statement load/save tests expect `'default-statements.md'` but `StatementManagerIPC` no longer provides a default (paths resolved at runtime from projectPath). Context generation test expects old template output format. Mock is also missing `onFlushSave` property causing typecheck failure. Also 1 failure in `ContextIntegrator.test.ts` (no `window.electronAPI` mock for template engine path). Update tests to match current implementation. (P1, discovered during 140-monorepo-scaffolding, expanded during #33 fix)
- [ ] Pre-existing test failure in `storage/integration.test.ts` (1 test) — `should maintain data integrity during failures` expects `'Failed to save project data'` error but gets `'Project with id ... not found'`. Update test expectation. (P2, discovered during 140-monorepo-scaffolding)
- [x] [Issue #33](https://github.com/ecorkran/context-forge/issues/33): Services fall back to `process.cwd()` when no projectPath configured (P1, discovered during 140 manual verification). Fixed 2026-02-17: replaced CWD fallback with explicit errors in constructors (SystemPromptParser, StatementManager, PromptFileManager), added filename guards in IPC handlers, and resolved renderer-side path resolution by joining projectPath with relative path constants in ContextIntegrator.

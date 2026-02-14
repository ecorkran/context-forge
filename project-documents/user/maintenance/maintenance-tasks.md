---
layer: project
docType: maintenance
dateCreated: 20260213
dateUpdated: 20260213
---

# Maintenance Tasks

- [ ] [Issue #27](https://github.com/ecorkran/context-forge/issues/27): Fix TypeScript errors in `src/lib/ui-core/components/form/combobox.tsx` — missing `downshift` module/types and 6 implicit `any` parameters (P2)
- [x] Flush pending saves on app quit (P1) — Added `before-quit` handler in main process that sends `app:flush-save` to renderer, plus `onFlushSave` listener in ContextBuilderApp that performs an immediate save via refs. Implemented 2026-02-13.
- [ ] [Issue #28](https://github.com/ecorkran/context-forge/issues/28): Bypass debounce for discrete settings actions (P2, deferred) — `handleProjectUpdate` should save immediately via `persistentStore.updateProject()` for click-based changes (projectPath, monorepo toggle, dropdowns) rather than relying solely on the 500ms debounced auto-save. The flush-on-quit safety net covers the edge case; this is the principled UX fix.

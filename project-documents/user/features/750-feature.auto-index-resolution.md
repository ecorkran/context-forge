---
layer: project
docType: feature
issueNumber: 25
title: Auto-Resolve File Indices for Artifact Creation
architecture: 050-arch.prompt-system-decoupling
relatedIssues: [24, 25, 26]
dependencies: [128-slice.project-path-awareness]
status: ready
priority: P2
dateCreated: 20260212
dateUpdated: 20260213
---

# Feature: Auto-Resolve File Indices for Artifact Creation

## User-Provided Concept

When creating new project artifacts (slices, tasks, features), the user must manually determine the next available file index by consulting file-naming-conventions.md and inspecting existing files. This is tedious and error-prone.

Example: If I know we need to create slices based on `050-arch.prompt-system-decoupling`, I don't know what the first slice index should be. I have to look it up in file-naming-conventions.md, check the range allocation, scan existing files, and calculate the next number.

The Slice and Task File fields are useful when the user knows the exact filename or wants to reference a particular file. But when working with the project guide to create new things, the user shouldn't have to manually resolve indices.

### Key Points
- Next available index should be determined by evaluating existing filenames + range allocation from file-naming-conventions.md
- Skip(5) spacing between indices may no longer be needed; suffixes can handle gaps if necessary
- Should work for slices, tasks, and features
- System should scan the appropriate `project-documents/user/` subdirectory

## Prerequisites (Resolved)

**Slice 128: Project Path Awareness** delivered all the infrastructure this feature needs:

- `projectPath` field on ProjectData — per-project filesystem path, persisted
- `ProjectPathService.listDirectory()` — lists files in any `project-documents/user/{subdirectory}/` (or `project-artifacts/{subdirectory}/` for monorepo)
- IPC channel `project-path:list-directory` — exposes directory listing to renderer
- Preload binding `window.electronAPI.projectPath.listDirectory()` — callable from React components
- Health indicator — user sees at a glance whether the path is valid
- Shared types at `src/main/services/project/types.ts` — `PathValidationResult`, `DirectoryListResult`

No new IPC channels, preload changes, or filesystem access patterns are needed. This feature builds entirely on existing infrastructure.

## Design

### Index Range Allocations

From `file-naming-conventions.md`:

| Range | Artifact Type | Directory | File Pattern |
|-------|--------------|-----------|--------------|
| 050-089 | Architecture | `architecture/` | `nnn-arch.{name}.md` |
| 100-749 | Slices | `slices/` | `nnn-slice.{name}.md` |
| 750-799 | Standalone features | `features/` | `nnn-feature.{name}.md` |
| 900-939 | Code reviews | `code-reviews/` | `nnn-tasks.code-review.{name}.md` |
| 940-949 | Codebase analysis | `analysis/` | `nnn-analysis.{name}.md` |
| 950-999 | Maintenance | `tasks/` | `nnn-tasks.maintenance.{name}.md` |

### IndexResolver Service

New main-process service at `src/main/services/project/IndexResolverService.ts`. Stateless — receives project path and flags per-call, same pattern as `ProjectPathService`.

**Responsibilities:**
1. Parse existing filenames to extract numeric indices
2. Determine next available index within a given range
3. Generate a suggested filename following naming conventions

**Uses `ProjectPathService.listDirectory()`** — does not duplicate `fs.readdir` logic.

### IPC & Preload

New IPC channel `index-resolver:get-next-index` and preload binding under `window.electronAPI.indexResolver`. Minimal surface — one method covers the primary use case.

### UI Integration

Add an auto-resolve button (small icon) next to the Slice field in `ProjectConfigForm.tsx`. On click:
1. Call `window.electronAPI.indexResolver.getNextIndex(...)` with artifact type and user-provided name
2. Populate the slice field with the suggested filename
3. Existing `generateTaskFileName()` auto-derives the task filename

The button is only enabled when `projectPath` is set and valid. Projects without a path continue to use manual entry with no change in behavior.

### Graceful Degradation

- No `projectPath` set: auto-resolve button hidden or disabled, no disruption
- Path invalid: button disabled, health indicator already signals the issue
- Range exhausted: show inline message, user can still type manually
- Directory empty: return range minimum as first index

## Related

- **Architecture**: `050-arch.prompt-system-decoupling.md`
- **Prerequisite**: `128-slice.project-path-awareness.md` (complete)
- **GitHub Issue**: [#25](https://github.com/ecorkran/context-forge/issues/25)
- **Related Issues**: [#24](https://github.com/ecorkran/context-forge/issues/24) (dynamic phases), [#26](https://github.com/ecorkran/context-forge/issues/26) (browse files)

---
layer: project
docType: feature
issueNumber: 25
title: Auto-Resolve File Indices for Artifact Creation
architecture: 050-arch.prompt-system-decoupling
relatedIssues: [24, 25]
dependencies: []
status: backlog
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

## Complexity: Project Path Dependency

The original concept assumes Context Forge can scan `project-documents/user/` subdirectories to find existing indices. This introduces a fundamental new requirement that the feature document and initial task breakdown did not capture:

### Current State

Context Forge does **not** access project directories today. It is a form-based context builder — the user types filenames (slice, task file, etc.) as plain text. The app has no knowledge of where a project's files actually live on disk.

### What Auto-Index Resolution Requires

To scan for existing file indices, Context Forge needs filesystem access to the target project's `project-documents/user/` tree. This creates several cascading requirements:

1. **Project Path Setting**: The user must be able to specify a local (or network) filesystem path to their project root. This is a new concept for Context Forge — projects currently have no associated path.

2. **Per-Project Storage**: The path will be different for every project. It must be persisted alongside existing project data (project name, slice, task file, phase, etc.) in the same storage mechanism.

3. **UI Considerations**: Path configuration should not clutter the main form. It belongs behind an expandable section, settings icon, or similar — alongside any future per-project settings. There will be related UI tasks for this.

4. **Scope Boundary**: Initially, paths must be local or network-accessible filesystem paths only. Direct repository connections (GitHub, etc.) are explicitly out of scope for this feature and deferred to future work.

5. **Cross-Project Tool**: Context Forge is used across many different projects. The path resolution must be project-aware — switching projects in the selector must also switch the resolved path context.

### Impact on Architecture

This requirement aligns with the broader prompt system decoupling initiative (050-arch). A "project path" is a prerequisite for several future capabilities:
- Auto-index resolution (this feature)
- Dynamic phase option extraction from prompt files (Issue #24)
- Future ConfigProvider implementations that read from project files

### Status

**Awaiting revised approach from Project Manager.** The task breakdown in `750-tasks.auto-index-resolution.md` does not yet reflect these complexities and should not be executed until the approach is finalized.

## Related

- **Architecture**: `050-arch.prompt-system-decoupling.md`
- **GitHub Issue**: [#25](https://github.com/ecorkran/context-forge/issues/25)
- **Related Issue**: [#24](https://github.com/ecorkran/context-forge/issues/24) - Dynamic Phase Options (same decoupling initiative)

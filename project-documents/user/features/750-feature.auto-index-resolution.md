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
dateUpdated: 20260212
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

## Related

- **Architecture**: `050-arch.prompt-system-decoupling.md`
- **GitHub Issue**: [#25](https://github.com/ecorkran/context-forge/issues/25)
- **Related Issue**: [#24](https://github.com/ecorkran/context-forge/issues/24) - Dynamic Phase Options (same decoupling initiative)

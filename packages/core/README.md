# @context-forge/core

The context generation engine that powers Context Forge. Handles template processing, project state management, prompt parsing, section building, and the full context assembly pipeline.

## Overview

This package contains the core logic shared by the [MCP server](../mcp-server/README.md), the [CLI](../cli/README.md), and other Node.js consumers. It has no framework dependencies.

Key capabilities:
- **Context pipeline** — assembles structured context prompts from project configuration, templates, and statements
- **Template processing** — variable substitution (`{{projectName}}`, `{{fileSlice}}`, `{fileArch}`, `{archIndex}`, etc.) with conditional sections and artifact aliases
- **Statement management** — loads and resolves default statements (project intro, tool intro, instruction blocks)
- **Prompt parsing** — reads `prompt.ai-project.system.md` files and extracts named template sections
- **Project storage** — filesystem-backed CRUD for project configuration with backup and migration support

## Export Paths

The package provides two entry points to separate browser-safe code from Node.js-dependent code.

### `@context-forge/core` — Types, interfaces, and browser-safe services

```typescript
import type { ProjectData, UpdateProjectData } from '@context-forge/core';
import type { IProjectStore, IStorageService } from '@context-forge/core';
import { TemplateProcessor, SectionBuilder } from '@context-forge/core';
import { ContextGenerator, ContextIntegrator } from '@context-forge/core';
import { PROMPT_FILE_RELATIVE_PATH, DEFAULT_STATEMENTS } from '@context-forge/core';
```

This entry point contains no `fs` or `path` dependencies and is safe for browser/renderer contexts.

### `@context-forge/core/node` — Node.js implementations

```typescript
import { FileProjectStore, FileStorageService } from '@context-forge/core/node';
import { createContextPipeline } from '@context-forge/core/node';
import { StatementManager, SystemPromptParser } from '@context-forge/core/node';
import { ProjectPathService } from '@context-forge/core/node';
import { getStoragePath } from '@context-forge/core/node';

// Artifact introspection
import { ArtifactIntrospector } from '@context-forge/core/node';
import { buildModel, scanDirectory } from '@context-forge/core/node';
import { parseFrontmatter, parseSlicePlan } from '@context-forge/core/node';
import { parseTaskItems, parseTaskFile } from '@context-forge/core/node';
import { parseFutureWork, detectDocuments } from '@context-forge/core/node';
import { FutureWorkCollector } from '@context-forge/core/node';
```

This entry point includes filesystem-dependent services. Use it in main processes, CLI tools, MCP servers, and tests. Do not import from browser/renderer code.

## Key Services

| Service | Entry Point | Description |
|---------|-------------|-------------|
| `FileProjectStore` | `./node` | Filesystem-backed project CRUD (read, create, update, delete) |
| `createContextPipeline` | `./node` | Factory that wires up all services for a project path and returns a ready-to-use `ContextIntegrator` |
| `StatementManager` | `./node` | Loads and parses `default-statements.md` from a project directory |
| `SystemPromptParser` | `./node` | Parses `prompt.ai-project.system.md` into named template sections |
| `ProjectPathService` | `./node` | Resolves file paths relative to a project root (task files, slice designs, guides) |
| `ContextIntegrator` | `.` | Orchestrates full context generation from a `ProjectData` object |
| `TemplateProcessor` | `.` | Handles `{{variable}}` substitution in template strings, including artifact aliases (`{arch}`, `{plan}`, `{hld}`, `{spec}`) and index extraction (`{archIndex}`, `{planIndex}`) |
| `SectionBuilder` | `.` | Assembles individual context sections (statements, instructions, tools) |
| `ArtifactIntrospector` | `./node` | Parses methodology documents: slice plans, task files, frontmatter, future work, document detection |
| `buildModel` | `./node` | Builds a full `ProjectModel` from a project root path — foundation, initiatives, slices, tasks, future work |
| `FutureWorkCollector` | `./node` | Aggregates future work items across all slice plans; groups by initiative; supports status filtering |

## Usage in the Monorepo

```
packages/
  core/         ← this package
  mcp-server/   depends on @context-forge/core (workspace:*)
  electron/     depends on @context-forge/core (workspace:*)
```

The MCP server, CLI, and Electron app import types from `@context-forge/core` and Node.js services from `@context-forge/core/node`.

## License

MIT

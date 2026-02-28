# @context-forge/core

The context generation engine that powers Context Forge. Handles template processing, project state management, prompt parsing, section building, and the full context assembly pipeline.

## Overview

This package contains the core logic shared by both the [MCP server](../mcp-server/README.md) and the [Electron desktop app](../electron/). It has no Electron dependency and can be used by any Node.js consumer.

Key capabilities:
- **Context pipeline** — assembles structured context prompts from project configuration, templates, and statements
- **Template processing** — variable substitution (`{{projectName}}`, `{{fileSlice}}`, etc.) with conditional sections
- **Statement management** — loads and resolves default statements (start/continue, tool intro, instruction blocks)
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
| `TemplateProcessor` | `.` | Handles `{{variable}}` substitution in template strings |
| `SectionBuilder` | `.` | Assembles individual context sections (statements, instructions, tools) |

## Usage in the Monorepo

```
packages/
  core/         ← this package
  mcp-server/   depends on @context-forge/core (workspace:*)
  electron/     depends on @context-forge/core (workspace:*)
```

Both the MCP server and Electron app import types from `@context-forge/core` and Node.js services from `@context-forge/core/node`. The Electron renderer uses only the browser-safe entry point, with IPC bridges to access Node.js services from the main process.

## License

MIT

# Context Forge MCP — Tool Reference

Complete parameter reference for all tools exposed by the `context-forge-mcp` MCP server. For installation and configuration, see the [MCP server README](../packages/mcp-server/README.md).

---

## Project Tools

### project_list

**List Projects** — List all configured Context Forge projects. Returns project IDs, names, current slices, and other summary fields. Use this to discover available projects before calling `project_get` or `project_update`.

**Parameters:** None

**Returns:** JSON with `projects` array (summary fields) and `count`.

**When to use:** At the start of a session to discover which projects are configured, or to look up a project ID.

---

### project_get

**Get Project** — Get full details for a specific Context Forge project by ID. Returns all project fields including configuration, custom data, and timestamps. Use `project_list` first to find project IDs.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Project ID (e.g., `project_1739...`). Use `project_list` to find IDs. |

**Returns:** Full project data including `customData`, `projectPath`, timestamps, and all configuration fields.

**When to use:** To inspect a project's full configuration before building context or making updates.

---

### project_update

**Update Project** — Update configuration fields on an existing Context Forge project. Provide the project ID and any fields to change (e.g., slice, instruction, developmentPhase). Returns the full updated project. Does not delete or replace — only modifies specified fields.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | Yes | Project ID to update |
| `name` | string | No | Project display name |
| `template` | string | No | Template name |
| `slice` | string | No | Current slice name |
| `taskFile` | string | No | Task file name |
| `instruction` | string | No | Instruction type (e.g., `implementation`, `design`, `review`) |
| `developmentPhase` | string | No | Current development phase |
| `workType` | `"start"` \| `"continue"` | No | Whether starting or continuing work |
| `projectDate` | string | No | Project date string |
| `isMonorepo` | boolean | No | Whether project uses monorepo mode |
| `isMonorepoEnabled` | boolean | No | Whether monorepo UI is enabled |
| `projectPath` | string | No | Absolute path to project root |
| `customData` | object | No | Custom data fields for context generation (see below) |

**`customData` fields:**

| Field | Type | Description |
|-------|------|-------------|
| `recentEvents` | string | Summary of recent project events / session state |
| `additionalNotes` | string | Additional context notes |
| `monorepoNote` | string | Monorepo-specific notes |
| `availableTools` | string | Available tools description |

**Returns:** The full updated project data.

**When to use:** To change the active slice, instruction mode, or other project configuration. For example, when switching to a new task or changing development phase.

---

## Context Tools

### context_build

**Build Context** — Build a complete context prompt for a Context Forge project. This is the primary tool for generating structured context blocks. Optionally override project parameters (slice, instruction, etc.) without modifying the stored project. Returns the assembled context ready for use.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectId` | string | Yes | Project ID. Use `project_list` to find IDs. |
| `slice` | string | No | Override the current slice name |
| `taskFile` | string | No | Override the task file name |
| `instruction` | string | No | Override the instruction type (e.g., `implementation`, `design`, `review`) |
| `developmentPhase` | string | No | Override the current development phase |
| `workType` | `"start"` \| `"continue"` | No | Override whether starting or continuing work |
| `additionalInstructions` | string | No | Additional instructions to append to the generated context |

**Returns:** Plain text context prompt assembled from the project's templates, statements, and configuration.

**When to use:** At the start of a coding session or when you need a fresh context prompt. This is the primary tool — use it to generate the structured context block that gets injected into your AI session.

---

### template_preview

**Preview Context** — Preview a context prompt with specified parameters without modifying the stored project or triggering any side effects. Use this to explore what context would be generated with different configurations before committing to a `context_build`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectId` | string | Yes | Project ID. Use `project_list` to find IDs. |
| `slice` | string | No | Override the current slice name |
| `taskFile` | string | No | Override the task file name |
| `instruction` | string | No | Override the instruction type (e.g., `implementation`, `design`, `review`) |
| `developmentPhase` | string | No | Override the current development phase |
| `workType` | `"start"` \| `"continue"` | No | Override whether starting or continuing work |
| `additionalInstructions` | string | No | Additional instructions to append to the generated context |

**Returns:** Plain text context prompt (same output as `context_build`).

**When to use:** To preview what a context would look like with different parameters before committing. Useful for experimenting with different slice or instruction overrides.

---

### prompt_list

**List Prompts** — List available prompt templates for a Context Forge project. Returns template names and metadata. Use `prompt_get` to retrieve the full content of a specific template.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectId` | string | Yes | Project ID. Use `project_list` to find IDs. |

**Returns:** JSON with `templates` array (each with `name`, `key`, `parameterCount`), `count`, and `promptFile` path.

**When to use:** To discover what prompt templates are available for a project before retrieving a specific one with `prompt_get`.

---

### prompt_get

**Get Prompt** — Get the full content of a specific prompt template. Returns the raw template text. Useful for inspecting what a template contains before building context with it.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectId` | string | Yes | Project ID. Use `project_list` to find IDs. |
| `templateName` | string | Yes | Template name or key to match. Use `prompt_list` to see available templates. |

**Returns:** Template metadata header followed by the raw template content, including any template variables (e.g., `{{projectName}}`, `{{slice}}`).

**When to use:** To inspect the content of a specific prompt template — for example, to understand what variables it uses or what instructions it provides.

---

## State Tools

### context_summarize

**Summarize Context** — Update a project's session state summary. Persists the provided summary text as the project's recent events, which will be included in subsequent `context_build` output. Use this after significant work milestones, context switches, or to record session progress for continuity. Analogous to Claude Code's `/compact` but for project-level state.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `projectId` | string | Yes | Project ID to update. Use `project_list` to find IDs. |
| `summary` | string | Yes | Summary of recent events, session progress, or current project state. Replaces the current `recentEvents` field and will appear in subsequent `context_build` output. |
| `additionalNotes` | string | No | Optional additional notes to persist alongside the summary. Replaces the current `additionalNotes` field if provided. |

**Returns:** The full updated project data.

**When to use:** After completing a significant milestone, switching context, or when approaching context limits. Records what happened in the session so the next `context_build` includes that state. Think of it as a project-level save point.

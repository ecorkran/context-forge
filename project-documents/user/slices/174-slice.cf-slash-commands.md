---
docType: slice-design
slice: cf-slash-commands
project: context-forge
parent: user/architecture/160-slices.project-workflow-system.md
dependencies: [168-cli-foundation]
dateCreated: 20260306
dateUpdated: 20260306
status: in_progress
---

# Slice Design: Claude Code Commands — cf Wrappers

## Overview

Markdown command files for `~/.claude/commands/` (user-level) and `.claude/commands/` (project-level) that expose Context Forge CLI capabilities as Claude Code slash commands. Commands shell out to the globally-installed `cf` CLI using `!` backtick execution, passing `$ARGUMENTS` for parameters. Includes an install/uninstall mechanism via `cf install-commands` and `cf uninstall-commands`.

## Value

Claude Code users get slash-command access to Context Forge without remembering CLI syntax. YAML frontmatter `description` fields enable Claude Code auto-discovery, so Claude can suggest commands contextually. Commands work in any project directory because `cf` is already CWD-aware.

## Technical Scope

**Included:**
- Four command markdown files: `/cf:status`, `/cf:build`, `/cf:next`, `/cf:prompt`
- Source of truth: `packages/cli/commands/cf/` directory in the repo
- `cf install-commands` CLI subcommand — copies command files to target directory
- `cf uninstall-commands` CLI subcommand — removes command files
- `files` entry in `packages/cli/package.json` to include `commands/` in npm package
- Tests for install/uninstall logic

**Excluded:**
- Project-level command installation (`.claude/commands/`) — user installs to `~/.claude/commands/` which works globally
- MCP tool equivalents for install/uninstall (CLI-only is sufficient)
- Auto-install on `cf init` (could be added later)

## Dependencies

### Prerequisites
- CLI Foundation (slice 168) — complete
- `cf` CLI installed globally or via `npx` — commands shell out to `cf`

### Interfaces Required
- `cf status [--json] [--project <name|id>]`
- `cf build [--phase <phase>] [--slice <slice>] [--instruction <instruction>] [--tasks <tasks>] [--additional <text>]`
- `cf next [--json] [--project <name|id>]`
- `cf prompt list [--json]` and `cf prompt get <phase> [--raw]`

## Architecture

### Command File Structure

Commands live in a `cf/` subdirectory, which creates the `/cf:` namespace in Claude Code:

```
packages/cli/commands/
  cf/
    status.md      → /cf:status (project)
    build.md       → /cf:build (project)
    next.md        → /cf:next (project)
    prompt.md      → /cf:prompt (project)
```

When installed to `~/.claude/commands/`, the directory structure is preserved:

```
~/.claude/commands/
  cf/
    status.md
    build.md
    next.md
    prompt.md
```

This makes them appear as `/cf:status`, `/cf:build`, etc. in Claude Code's command list.

### Command File Format

Each command is a markdown file with YAML frontmatter:

```markdown
---
description: Brief description for auto-discovery
argument-hint: [optional args]
allowed-tools: Bash(cf:*)
---

Command prompt body with !`cf ...` execution
```

Key conventions:
- `allowed-tools: Bash(cf:*)` — pre-authorizes `cf` CLI calls so they don't require manual approval each time
- `!` backtick syntax executes shell commands inline and includes their output in the prompt
- `$ARGUMENTS` captures all user input after the slash command
- Commands output instructions for Claude, not just raw CLI output

### Command Specifications

#### `/cf:status`

Shows workflow status for the current project.

```markdown
---
description: Show Context Forge project status (phase, slice, task progress)
allowed-tools: Bash(cf:*)
---

Show the current project status. Here is the current state:

!`cf status 2>/dev/null`

Summarize the project status for me. If there are errors, help me troubleshoot.
```

No arguments needed — `cf` resolves the project from CWD.

#### `/cf:build`

Generates a context prompt. Accepts optional arguments for overrides.

```markdown
---
description: Build a Context Forge context prompt (accepts optional --phase, --slice flags)
argument-hint: [--phase <phase>] [--slice <slice>]
allowed-tools: Bash(cf:*)
---

Build the context prompt for the current project.

!`cf build $ARGUMENTS 2>/dev/null`
```

The build output goes to stdout; the command captures it. Users can pass `--phase implementation` or other flags via `$ARGUMENTS`.

#### `/cf:next`

Shows the recommended next action.

```markdown
---
description: Show recommended next action for the current Context Forge project
allowed-tools: Bash(cf:*)
---

Show the recommended next action:

!`cf next 2>/dev/null`

Based on this recommendation, suggest specific steps I should take.
```

#### `/cf:prompt`

Access prompt templates. Accepts a phase argument to get a specific prompt, or lists available prompts with no args.

```markdown
---
description: Get or list Context Forge prompt templates (e.g., /cf:prompt implementation)
argument-hint: [phase-name | list]
allowed-tools: Bash(cf:*)
---

Get prompt template information.

!`cf prompt ${ARGUMENTS:-list} 2>/dev/null`

If this is a prompt template, present it clearly. If this is a list, summarize the available prompts.
```

### Install/Uninstall CLI Commands

#### `cf install-commands`

```
cf install-commands [--target <dir>]
```

- Default target: `~/.claude/commands/`
- Copies `commands/cf/` directory contents to `<target>/cf/`
- Creates target directories if they don't exist (`mkdirSync` with `recursive: true`)
- Overwrites existing files (idempotent — re-running updates to latest)
- Prints confirmation with list of installed commands

#### `cf uninstall-commands`

```
cf uninstall-commands [--target <dir>]
```

- Default target: `~/.claude/commands/`
- Removes `<target>/cf/status.md`, `<target>/cf/build.md`, `<target>/cf/next.md`, `<target>/cf/prompt.md`
- Removes `<target>/cf/` directory if empty after file removal
- Does not remove other files in `<target>/cf/` (user may have added their own)
- Prints confirmation with list of removed commands
- No error if files don't exist (idempotent)

### Implementation Details

#### Resolving the Source Commands Directory

The install command needs to find the bundled `commands/` directory. Two approaches depending on context:

1. **npm global install**: Commands are in `{packageRoot}/commands/`. Resolve via `import.meta.url` — walk up from `dist/commands/install.js` to the package root.
2. **Development (pnpm workspace)**: Commands are in `packages/cli/commands/`. Same resolution works since `dist/` is inside the package.

Use `fileURLToPath(import.meta.url)` to locate the script, then resolve `../../commands/` relative to the dist output location. This is the same pattern used by `createRequire(import.meta.url)` in `index.ts` for reading `package.json`.

#### Package.json Updates

Add `commands` to the `files` array so they're included in the npm package:

```json
{
  "files": ["dist", "commands", "README.md"]
}
```

#### Registration in index.ts

Add two new top-level commands in `src/index.ts`:

```typescript
import { registerInstallCommandsCommand, registerUninstallCommandsCommand } from './commands/commandInstaller.js';

registerInstallCommandsCommand(program);
registerUninstallCommandsCommand(program);
```

#### Command Installer Module

New file: `packages/cli/src/commands/commandInstaller.ts`

Exports:
- `registerInstallCommandsCommand(program: Command): void`
- `registerUninstallCommandsCommand(program: Command): void`

Internal helpers:
- `getSourceCommandsDir(): string` — resolves the bundled commands directory
- `installCommands(targetDir: string): void` — copies files
- `uninstallCommands(targetDir: string): void` — removes files

Uses `node:fs` (`mkdirSync`, `cpSync`/`copyFileSync`, `rmSync`, `readdirSync`, `existsSync`) and `node:path`. No external dependencies.

## Success Criteria

### Functional Requirements
- `/cf:status` shows project status when invoked from Claude Code in any registered project directory
- `/cf:build` generates context prompt; `$ARGUMENTS` passes through flags like `--phase implementation`
- `/cf:next` shows recommended next action with rationale
- `/cf:prompt` lists templates or gets a specific one based on argument
- `cf install-commands` copies all four command files to `~/.claude/commands/cf/`
- `cf uninstall-commands` removes them cleanly
- Re-running `cf install-commands` updates files (idempotent)
- Commands appear in Claude Code's `/help` output with descriptions

### Technical Requirements
- Command files are valid Claude Code slash command format (YAML frontmatter + markdown body)
- `allowed-tools: Bash(cf:*)` pre-authorizes cf execution
- `2>/dev/null` on cf calls prevents stderr status messages from polluting command output
- Install/uninstall tests cover: fresh install, overwrite, uninstall, uninstall when not installed, custom target directory
- `packages/cli/package.json` includes `commands/` in `files` array
- All existing CLI tests continue to pass

## Implementation Notes

### Development Approach

Suggested task order:
1. Create the four command markdown files in `packages/cli/commands/cf/`
2. Create `commandInstaller.ts` with install/uninstall logic
3. Register commands in `index.ts`
4. Update `package.json` files array
5. Write tests for install/uninstall
6. Manual verification in Claude Code

### Testing Strategy

- Unit tests for `commandInstaller.ts`: mock `fs` operations, verify correct source resolution, target path construction, file copy/remove calls
- Integration test: use a temp directory as target, run install, verify files exist with correct content, run uninstall, verify files removed
- Command files themselves are static markdown — no unit tests needed, but verify they parse as valid YAML frontmatter

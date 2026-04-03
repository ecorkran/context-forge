---
docType: slice-design
slice: 907
component: cli-short-form-options-option-centralization
parent: user/architecture/900-arch.maintenance-and-refactoring.md
project: context-forge
dateCreated: 20260402
dateUpdated: 20260402
status: not_started
---

# Slice 907: CLI Short-Form Options & Option Centralization

## User-Provided Concept

Add standard short-form flags (`-j`, `-p`, `-y`, `-f`, `-a`, `-r`) and centralize the ~70 inline `.option()` registrations into shared helpers so adding or changing a common option is a one-line edit instead of 16.

## Overview

The CLI has 78 option registrations across 16 command files with zero centralization. Only one option (`-o, --override`) has a short form. Common options like `--json` (26 uses), `--project` (29 uses), and `--yes` (5 uses) are copy-pasted with inconsistent descriptions ("Project ID or name" vs "Project name or ID").

This slice introduces a shared `options.ts` module with composable helper functions that register common options on Commander `Command` instances, then migrates all command files to use them.

## Technical Design

### New Module: `packages/cli/src/options.ts`

A single file exporting composable functions that register options on a `Command` and return it for chaining. Each function is the single source of truth for that option's short flag, long flag, description, and value placeholder.

```typescript
import type { Command } from 'commander';

/** -j, --json — Output as JSON */
export function withJsonOption(cmd: Command): Command {
  return cmd.option('-j, --json', 'Output as JSON');
}

/** -p, --project <id> — Project ID or name (overrides default) */
export function withProjectOption(cmd: Command): Command {
  return cmd.option('-p, --project <id>', 'Project ID or name (overrides default)');
}

/** -y, --yes — Skip confirmation prompt */
export function withYesOption(cmd: Command): Command {
  return cmd.option('-y, --yes', 'Skip confirmation prompt');
}

/** -f, --fix — Apply non-destructive corrections */
export function withFixOption(cmd: Command): Command {
  return cmd.option('-f, --fix', 'Apply non-destructive corrections (when available)');
}

/** -a, --all — Show items from all worktrees */
export function withAllOption(cmd: Command): Command {
  return cmd.option('-a, --all', 'Show items from all worktrees');
}

/** -r, --raw — Output raw content without formatting */
export function withRawOption(cmd: Command): Command {
  return cmd.option('-r, --raw', 'Output raw content without formatting');
}

/** --project-level — Force operation at project level (skip worktree routing) */
export function withProjectLevelOption(cmd: Command): Command {
  return cmd.option('--project-level', 'Force operation at project level (skip worktree routing)');
}
```

### Design Decisions

1. **Composable functions, not a config object.** Each helper is a function `(cmd: Command) => Command`. This preserves Commander's builder pattern and avoids inventing a new DSL. Calling site reads naturally: `withJsonOption(withProjectOption(cmd))` or applied sequentially.

2. **No short form for niche options.** Options like `--slice <index>`, `--phase`, `--instruction`, `--worktree`, `--worktrees`, `--project-level`, `--schema`, `--strategy`, `--source`, `--target`, `--lite`, `--no-ide`, `--name`, `--range`, `--path`, `--status`, `--override` remain long-form only. They are either infrequent, command-specific, or would create short-flag collisions.

3. **`--project-level` gets a helper but no short flag.** It appears 6 times across `index.ts` and `project.ts` with inconsistent descriptions, so centralizing it fixes the inconsistency. But it's too rare and niche for a short flag.

4. **Description normalization.** The 29 `--project` registrations currently use at least 3 different description strings. The helper normalizes to a single canonical description.

5. **Commander handles the mapping.** Commander.js natively supports `-j, --json` syntax. The parsed options object still uses the long-form name (`opts.json`, `opts.project`), so action handlers need zero changes.

### Migration Pattern

Each command file changes from:

```typescript
cmd
  .option('--json', 'Output as JSON')
  .option('--project <id>', 'Project ID or name (overrides default)')
```

To:

```typescript
import { withJsonOption, withProjectOption } from '../options.js';

// In registration:
withJsonOption(withProjectOption(cmd))
```

Or applied sequentially for readability in commands with many options:

```typescript
withProjectOption(cmd);
withJsonOption(cmd);
cmd.option('--slice <index>', 'Check only a specific slice by index');
```

### Files to Modify

| File | Changes |
|------|---------|
| `packages/cli/src/options.ts` | **New** — 7 helper functions |
| `packages/cli/src/index.ts` | Replace 6 inline options (get/set/unset shortcuts) |
| `packages/cli/src/commands/build.ts` | Replace `--json`, `--project` (2 of 9 options) |
| `packages/cli/src/commands/check.ts` | Replace `--json`, `--project`, `--yes`, `--fix` (4 of 5 options) |
| `packages/cli/src/commands/config.ts` | Replace `--json`, `--project` |
| `packages/cli/src/commands/future.ts` | Replace `--json`, `--all`, `--project` |
| `packages/cli/src/commands/guides.ts` | Replace `--json`, `--project` (across 4 subcommands) |
| `packages/cli/src/commands/init.ts` | No common options — skip |
| `packages/cli/src/commands/list.ts` | Replace `--json`, `--all`, `--project` (across 7 subcommands) |
| `packages/cli/src/commands/next.ts` | Replace `--json`, `--project` |
| `packages/cli/src/commands/prompt.ts` | Replace `--json`, `--project`, `--raw` |
| `packages/cli/src/commands/project.ts` | Replace `--json`, `--project`, `--yes`, `--project-level` (across 5 subcommands) |
| `packages/cli/src/commands/setup-ide.ts` | Replace `--project`, `--yes` |
| `packages/cli/src/commands/status.ts` | Replace `--json`, `--project` |
| `packages/cli/src/commands/update.ts` | Replace `--json`, `--yes` |
| `packages/cli/src/commands/worktree.ts` | Replace `--project`, `--yes`, `--json` (across 4 subcommands) |
| `packages/cli/src/commands/commandInstaller.ts` | No common options — skip |

### What Does NOT Change

- **Action handler signatures** — Commander parses `-j` and `--json` into the same `opts.json` property. No handler code changes.
- **Command-specific options** — `--slice <index>`, `--phase <phase>`, `--instruction <type>`, `--worktree <name>`, etc. remain inline.
- **`commandCatalog.ts`** — Reads options via Commander introspection after registration, so it works automatically.
- **MCP server** — No options involved.
- **Tests** — Existing CLI tests that pass `--json` or `--project` continue to work. Tests should also verify the new short forms.

## Success Criteria

1. All 6 common options (`--json`, `--project`, `--yes`, `--fix`, `--all`, `--raw`) have short-form flags
2. Each common option is defined in exactly one place (`options.ts`)
3. All 16 command files use the shared helpers (no inline definitions of these 6 options remain)
4. `--project` description is consistent everywhere
5. All existing tests pass without handler changes
6. Short forms work: `cf status -j`, `cf check -f -y`, `cf list slices -p myproject -a`
7. `cf <command> --help` shows both short and long forms

## Verification Walkthrough

1. **Short flags work end-to-end:**
   ```
   cf status -j                    # JSON output
   cf next -j -p context-forge     # JSON + project
   cf list slices -a               # all worktrees
   cf check -f -y                  # fix + yes
   cf prompt get P5 -r             # raw output
   cf update -y                    # auto-install
   ```

2. **Help text shows both forms:**
   ```
   cf status --help
   # Should show: -j, --json    Output as JSON
   # Should show: -p, --project <id>    Project ID or name (overrides default)
   ```

3. **No inline common options remain:**
   ```
   grep -rn "\.option('--json'" packages/cli/src/        # should return 0 results
   grep -rn "\.option('--project " packages/cli/src/     # should return 0 results
   grep -rn "\.option('--yes'" packages/cli/src/         # should return 0 results
   ```

4. **All tests pass:**
   ```
   pnpm --filter @context-forge/cli run test
   ```

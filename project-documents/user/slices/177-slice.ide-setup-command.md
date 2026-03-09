---
docType: slice-design
slice: 177-slice.ide-setup-command
project: context-forge
parent: user/architecture/160-slices.project-workflow-system.md
dependencies: [172-slice.guide-management]
interfaces: []
dateCreated: 20260308
dateUpdated: 20260308
status: not_started
---

# Slice Design: IDE Setup Command

## Overview

Add a `cf setup-ide` CLI command that configures IDE-specific AI integration files for a Context Forge project. Initially supports Claude Code (`--claude` flag); designed to accept other IDE targets in the future. Wraps the existing `setup-ide` bash script from `ai-project-guide/scripts/` with safety guardrails for user-owned files — specifically, backup and confirmation before overwriting an existing `CLAUDE.md`.

## Value

After `cf guides install`, users must manually locate and run `setup-ide` from the correct directory with the right flags. This is the last manual step in an otherwise transparent onboarding flow. `cf setup-ide --claude` eliminates that gap: one discoverable command, CWD-aware, with file-safety guardrails that the raw script lacks.

## Technical Scope

### In Scope

- New CLI command: `cf setup-ide --claude`
- Guide installation detection (reuse `GuideDetector`)
- Pre-run safety check: detect existing `CLAUDE.md`, prompt for confirmation, create `.bak`
- Shell out to the guide's `setup-ide` script with the appropriate arguments
- Error handling: guides not installed, script not found, script exit code non-zero

### Out of Scope

- No MCP tool — this is a one-time terminal operation
- No slash command
- No modifications to the `setup-ide` script itself (that's in ai-project-guide)
- No `--cursor` support in this slice (but the command structure should accommodate it trivially)
- No "smart merge" of existing `CLAUDE.md` sections (future work)

## Dependencies

| Dependency | Status | Notes |
|---|---|---|
| 172 — Guide Management | Complete | Provides `GuideDetector`, `GUIDE_RELATIVE_PATH`, guide path resolution |
| 168 — CLI Foundation | Complete | Commander-based CLI infrastructure |
| ai-project-guide `setup-ide` script | External | Script is maintained in the guide repo; we invoke it, not modify it |

## Architecture

### Command Registration

New file: `packages/cli/src/commands/setup-ide.ts`

Registers `cf setup-ide` with a required positional argument for the IDE target and optional `--project` and `--yes` flags.

```
cf setup-ide claude              # Interactive (prompts if CLAUDE.md exists)
cf setup-ide claude --yes        # Non-interactive (auto-confirm overwrite)
cf setup-ide claude --project X  # Explicit project resolution
```

The IDE target is a positional argument (`claude`), not a flag (`--claude`). This reads more naturally and scales to additional targets without flag explosion. The slice plan description says `--claude` but the positional form is better CLI design — `cf setup-ide claude` vs `cf setup-ide --claude`. Both are equivalent from a user perspective; the positional form is simpler to implement and extend.

### Execution Flow

```
1. Resolve project (--project flag → CWD → default_project)
2. Locate guide directory: join(projectPath, GUIDE_RELATIVE_PATH)
3. Verify guide is installed (GuideDetector.detect())
   → If not installed: error with "Run cf guides install first"
4. Locate setup-ide script: join(guideDir, 'scripts/setup-ide')
   → If not found: error with path
5. Pre-run safety (Claude mode only):
   a. Check for CLAUDE.md at projectPath/CLAUDE.md
   b. If exists and not --yes:
      - Print warning: "CLAUDE.md already exists and will be overwritten"
      - Prompt: "Continue? (y/N)"
      - If N: abort
   c. If exists: copy CLAUDE.md → CLAUDE.md.bak
      - Print: "Backed up CLAUDE.md → CLAUDE.md.bak"
6. Spawn setup-ide script:
   - Command: bash <scriptPath> <target>
   - CWD: projectPath (so setup-ide's project root detection works)
   - Inherit stdio (user sees script output directly)
7. Report success or failure based on exit code
```

### Key Design Decisions

**Shell out vs. reimplement:** Shell out. The `setup-ide` script is 400+ lines of bash with frontmatter parsing, AWK-based path conversion, heading promotion, and IDE-specific logic. Reimplementing it in TypeScript would be substantial, fragile, and would diverge from the guide repo's canonical behavior. The script is designed to be run from a project root directory — we just need to set the CWD correctly.

**Backup before overwrite, not after:** The `.bak` is created before the script runs. If the script fails mid-way, the user still has their original `CLAUDE.md`. The script itself does not create backups.

**Positional argument for IDE target:** `cf setup-ide claude` rather than `cf setup-ide --claude`. Scales naturally: `cf setup-ide cursor`, `cf setup-ide windsurf`. Commander handles this as `<target>` argument with validation against allowed values.

**Interactive prompt via readline:** Use Node.js `readline` for the y/N prompt. The CLI already has a pattern for this in `cf project rm --yes`. Follow the same approach.

**Inherit stdio on spawn:** Use `child_process.execFileSync` (or `spawnSync`) with `stdio: 'inherit'` so the user sees the script's status output directly. No need to capture and relay — the script already prints human-readable progress.

### Error Cases

| Condition | Behavior |
|---|---|
| Guides not installed | `UserError`: "Guides are not installed. Run `cf guides install` first." |
| setup-ide script not found | `UserError`: "setup-ide script not found at {path}. Your guides installation may be incomplete — try `cf guides update`." |
| Invalid IDE target | Commander validation error listing valid targets: `claude` |
| Script exits non-zero | `UserError`: "setup-ide exited with code {N}. Check the output above for details." |
| User declines overwrite | Clean exit with "Aborted." message |
| .bak write fails | `UserError`: "Could not create backup of CLAUDE.md: {error}" |

## Implementation Details

### File Structure

```
packages/cli/src/commands/setup-ide.ts    # Command registration + handler
```

Single file. No new core services needed — this is a CLI-only wrapper using existing infrastructure (`resolveProjectId`, `GuideDetector`, `GUIDE_RELATIVE_PATH`).

### Command Registration

Register in `packages/cli/src/index.ts` alongside other commands. Follow the existing pattern from `registerGuidesCommand`.

```typescript
// In setup-ide.ts
const VALID_TARGETS = ['claude'] as const;

program
  .command('setup-ide')
  .description('Configure IDE-specific AI integration files for the current project')
  .argument('<target>', `IDE target: ${VALID_TARGETS.join(', ')}`)
  .option('--project <id>', 'Project ID or name')
  .option('--yes', 'Skip confirmation prompts')
  .action(async (target, opts) => { ... });
```

### Confirmation Prompt

Reuse or follow the pattern from the existing CLI. Use `readline.createInterface` with a simple y/N question. Default is N (safe default — do nothing unless explicitly confirmed).

### Script Invocation

```typescript
import { execFileSync } from 'node:child_process';

execFileSync('bash', [scriptPath, target], {
  cwd: projectPath,
  stdio: 'inherit',
});
```

Using `execFileSync` with explicit `bash` avoids execute-permission issues on the script file. `stdio: 'inherit'` passes through all output.

## Integration Points

### Consumes

- `resolveProjectId()` from `packages/cli/src/utils/project.ts` — project resolution
- `FileProjectStore` from `@context-forge/core/node` — project data lookup
- `GuideDetector` from `@context-forge/core/node` — guide installation check
- `GUIDE_RELATIVE_PATH` from `@context-forge/core` — guide directory constant
- `UserError`, `handleError` from `packages/cli/src/utils/errors.ts` — error handling

### Provides

Nothing consumed by other slices. This is a leaf command.

## Success Criteria

### Functional

- [ ] `cf setup-ide claude` in a project with guides installed runs the setup-ide script and produces Claude Code config files
- [ ] `cf setup-ide claude` in a project without guides errors with install hint
- [ ] Existing `CLAUDE.md` triggers warning, y/N prompt, and `.bak` creation on confirm
- [ ] `--yes` flag skips the confirmation prompt
- [ ] Missing `CLAUDE.md` proceeds without warning or prompt
- [ ] Invalid target (e.g., `cf setup-ide vim`) produces a clear error listing valid targets
- [ ] Works from any CWD within a registered project (uses project resolution chain)

### Technical

- [ ] Script output streams directly to the terminal (no buffering/capturing)
- [ ] Non-zero script exit code produces a clear error message
- [ ] `.bak` file is created before the script runs (not after)
- [ ] Command is registered and appears in `cf --help`

## Implementation Notes

- Follow the `guides.ts` command pattern for project resolution and guide detection
- The `setup-ide` script expects to be run from the project root — pass `projectPath` as CWD
- The script auto-detects its rules source directory relative to its own location, so no env vars needed
- Total implementation is ~80-100 lines — single file, no new abstractions

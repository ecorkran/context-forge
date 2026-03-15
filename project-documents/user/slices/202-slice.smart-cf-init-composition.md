---
docType: slice-design
slice: smart-cf-init-composition
project: context-forge
parent: user/architecture/200-slices.developer-onboarding.md
dependencies: []
interfaces: [204-onboarding-skill]
dateCreated: 20260315
dateUpdated: 20260315
status: not_started
---

# Slice 202: Smart cf init Composition

## Overview

Extend `cf init` from a minimal project-registration command into a full onboarding sequencer that composes the complete setup flow: git initialization, project creation, guide installation, command installation, and IDE configuration. Detection-based defaults allow safe re-runs. New flags (`--lite`, `--no-ide`, `--ide <target>`, `--name`) give users control over which steps run.

## Value

Collapses five sequential commands (`git init`, `cf init`, `cf guides install`, `cf install-commands`, `cf setup-ide claude`) into one. Safe to run on existing projects — detects state and skips or exits cleanly. Foundation of the CLI-side onboarding story (the MCP-side equivalent is the Onboarding Skill in slice 204).

## Technical Scope

**Included:**
- Extract `guidesInstallAction` from `guides.ts` install handler
- Extract `setupIdeAction` from `setup-ide.ts` command handler
- `installCommands()` already a standalone function in `commandInstaller.ts` — expose thin `installCommandsAction` wrapper for uniform call pattern
- Enhance `cf init` to sequence all steps with detection-based skipping
- New flags: `--lite`, `--no-ide`, `--ide <target>`, `--name`
- Step-level status output (printed, skipped, error)
- Final summary with `cf next` nudge
- Update `init.test.ts` with new test cases

**Excluded:**
- Cursor or other IDE targets (validation extended only to include new targets as they're added; current VALID_TARGETS stays `['claude']`)
- Git commit after init (user's responsibility)
- Any prompts or wizards (non-interactive except for the existing `setup-ide` CLAUDE.md safety check)

## Architecture

### Key Insight: Action Function Extraction

The slice plan states "guidesInstallAction, installCommandsAction, setupIdeAction are already implemented and tested" — they are not yet extracted. The inline logic inside `guides.ts` and `setup-ide.ts` must be refactored into exportable action functions. This is the core refactoring work of this slice.

**Pattern established by `project.ts`:** Functions like `projectSetAction` and `projectGetAction` are exported from their module and called both from their own command handler and from `index.ts` shortcuts. The same pattern applies here.

### File Changes

| File | Change |
|---|---|
| `packages/cli/src/commands/guides.ts` | Extract `guidesInstallAction(projectPath, opts?)` |
| `packages/cli/src/commands/setup-ide.ts` | Extract `setupIdeAction(projectPath, target, opts?)` |
| `packages/cli/src/commands/commandInstaller.ts` | Export thin `installCommandsAction(targetDir?)` wrapper |
| `packages/cli/src/commands/init.ts` | Full rewrite of action handler; add flags |
| `packages/cli/tests/commands/init.test.ts` | Extend with new cases |
| `packages/cli/tests/commands/guides.test.ts` | Add tests for extracted `guidesInstallAction` |
| `packages/cli/tests/commands/setup-ide.test.ts` | Add tests for extracted `setupIdeAction` |

### Action Function Signatures

```typescript
// guides.ts
export async function guidesInstallAction(
  projectPath: string,
  opts?: { strategy?: GuideMethod; source?: string }
): Promise<void>

// setup-ide.ts
export async function setupIdeAction(
  projectPath: string,
  target: string,
  opts?: { yes?: boolean }
): Promise<void>

// commandInstaller.ts
export function installCommandsAction(targetDir?: string): void
```

### Detection Logic

`cf init` runs these detection checks in order before executing steps:

```
1. No .git directory → git init, then continue
2. CF project already registered at CWD → print status, suggest cf status, exit 0
3. CWD is git worktree of a registered project → suggest cf worktree init, exit 0
4. (proceed with project creation + optional steps)
```

Detection for check 3 uses `execFileSync('git', ['worktree', 'list', '--porcelain'])` and parses the output to find worktrees. Cross-references worktree paths against registered project paths in `store.getAll()`.

### Step Execution Flow

```
cf init [--lite] [--no-ide] [--ide <target>] [--name <name>]
  │
  ├─ [detect] no .git?        → git init
  ├─ [detect] CF project here? → print status + cf status hint, exit
  ├─ [detect] git worktree?   → suggest cf worktree init, exit
  │
  ├─ [step 1] create project  (always)
  ├─ [step 2] install guides  (skip if --lite; skip if guides already installed)
  ├─ [step 3] install commands (skip if --lite)
  └─ [step 4] setup-ide       (skip if --lite or --no-ide)
              └─ target: --ide <value> or "claude"
  │
  └─ print summary + cf next nudge
```

### Output Format

Each step prints a status line using `chalk` styles matching the existing pattern in `styles.ts`:

```
✓ git initialized
✓ Project 'my-tool' registered
✓ Guides installed (v1.2.3)
  Guides already installed — skipping
✓ Commands installed (7 files → ~/.claude/commands/cf/)
✓ IDE configured for claude
──────────────────────────────────────
Your project is ready. Run cf next to see recommended next steps.
```

Failures in optional steps (guides, commands, IDE) are printed as warnings, not fatal errors. Project creation failure is fatal (exits with error).

### `--lite` Flag Behavior

`--lite` runs only steps 1–4 (git + project creation), matching current `cf init` behavior exactly. This is the backwards-compatibility path. Existing scripts calling `cf init` will get the full flow by default — this is intentional and documented.

### Git Initialization

```typescript
import { execFileSync } from 'node:child_process';

execFileSync('git', ['init'], { cwd, stdio: 'inherit' });
```

Failure is non-fatal if git is already initialized (the detection check should have caught this, but `git init` on an existing repo is idempotent).

### Worktree Detection

```typescript
function isGitWorktreeOf(cwd: string, registeredPaths: string[]): boolean {
  const output = execFileSync('git', ['worktree', 'list', '--porcelain'], {
    cwd, encoding: 'utf8',
  });
  // Parse 'worktree /path/to/main' lines; first entry is main worktree
  const mainWorktreePath = parseMainWorktreePath(output);
  return registeredPaths.includes(mainWorktreePath) && mainWorktreePath !== cwd;
}
```

Wrapped in try/catch — if git is not available or not a git repo, returns false.

## Integration Points

### Provides to Other Slices
- **204 (Onboarding Skill):** The skill references `cf init` as the CLI fallback when MCP tools are unavailable. The enhanced `cf init` makes that fallback more powerful.

### Consumes from Other Slices
- None. Independent of other 200-band slices.

## Success Criteria

1. `cf init` from empty directory (no git): initializes git, creates project, installs guides, installs commands, configures Claude IDE
2. `cf init` from existing git repo (no CF project): creates project, runs full setup
3. `cf init` on already-registered project: prints status message, suggests `cf status`, exits 0 with no error
4. `cf init` from git worktree of a registered project: prints suggestion to use `cf worktree init`, exits 0
5. `cf init --lite`: creates project entry only (matches current behavior)
6. `cf init --no-ide`: all steps except IDE configuration
7. `cf init --ide <target>`: uses specified target instead of `claude`
8. `cf init --name "My Project"`: uses provided name instead of directory basename
9. Guide installation skipped (with skip message) when guides already present
10. Each step prints a status line (success or skip)
11. Final output includes `cf next` nudge
12. Guides/command/IDE failures are non-fatal warnings; project creation failure is fatal
13. CLAUDE.md with managed marker: overwritten silently, no backup
14. CLAUDE.md without marker, no `.bak`: backed up to `.bak` with printed notice
15. CLAUDE.md without marker, `.bak` exists: backup skipped, "existing backup preserved" notice printed
16. All existing `init.test.ts` tests pass unchanged
17. New unit tests cover: git-init detection, already-registered detection, worktree detection, --lite flag, --no-ide flag, --ide flag, guides-skip detection, step failure handling, all three CLAUDE.md backup cases

## Verification Walkthrough

### 1. Full init from empty directory

```bash
mkdir /tmp/test-init-202 && cd /tmp/test-init-202
cf init --name "Test Project"
```

Expected output (approximate):
```
✓ git initialized
✓ Project 'Test Project' registered
✓ Guides installed (vX.Y.Z)
✓ Commands installed (N files → ~/.claude/commands/cf/)
✓ IDE configured for claude
──────────────────────────────────────
Your project is ready. Run cf next to see recommended next steps.
```

### 2. Re-run on registered project

```bash
cf init --name "Test Project"
```

Expected: prints "Project 'Test Project' is already registered at this path." and exits cleanly.

### 3. Lite mode

```bash
mkdir /tmp/test-lite-202 && cd /tmp/test-lite-202
cf init --lite --name "Lite Project"
```

Expected: only git init + project creation; no guides/commands/IDE output.

### 4. No-IDE mode

```bash
mkdir /tmp/test-no-ide-202 && cd /tmp/test-no-ide-202
cf init --no-ide --name "No-IDE Project"
```

Expected: git init + project + guides + commands. No IDE setup line.

### 5. Verify project registered

```bash
cf status
```

Expected: shows the created project with `Phase 1: Concept`.

## Implementation Notes

### Refactoring Risk

The extraction of `guidesInstallAction` and `setupIdeAction` from their inline handlers is the highest-risk change. The existing `guides.install` and `setup-ide` commands must continue working identically — their action handlers should become thin wrappers that call the extracted functions. Existing tests must pass unchanged.

### Non-Interactive Constraint

`cf init` must not block on interactive prompts during the guide/command/IDE steps. The `setup-ide` CLAUDE.md safety check uses `--yes` when called from `cf init` (i.e., `setupIdeAction(projectPath, target, { yes: true })`). Users who want the interactive check can still run `cf setup-ide claude` directly.

### CLAUDE.md Backup Strategy

The `setupIdeAction` extraction replaces the current simple backup logic with a three-case strategy based on a managed-file marker.

**Marker:** The setup-ide bash script (in the guide repo) writes `[//]: # (context-forge:managed)` immediately after the opening `#` heading in CLAUDE.md. Placement after the heading (not on line 1) avoids interference with tools that treat line 1 specially (parsers, `head`-based detection). The comment is invisible in rendered markdown and carries no semantic weight to an LLM.

Example structure written by the script:
```markdown
# Project Guidelines for Claude

[//]: # (context-forge:managed)

...content...
```

**Detection:** `setupIdeAction` reads the first 20 lines of an existing CLAUDE.md and checks whether any line matches `line.trim() === '[//]: # (context-forge:managed)'`.

**Three cases:**

| Condition | Behavior |
|---|---|
| No existing CLAUDE.md | Proceed silently |
| CLAUDE.md starts with managed marker | CF-owned — skip backup, proceed silently |
| CLAUDE.md exists, no marker, no `.bak` | User-owned, first run — back up to `CLAUDE.md.bak`, print notice |
| CLAUDE.md exists, no marker, `.bak` exists | User-owned, re-run — skip backup, print "existing backup preserved at CLAUDE.md.bak" |

The `--yes` flag (used when called from `cf init`) only bypasses the interactive confirmation prompt. The backup logic above runs regardless of `--yes`.

**Guide repo dependency:** This strategy requires the setup-ide bash script to write the marker as the first line of CLAUDE.md. This is a coordinated change: the script update and this slice can ship independently (the backup logic degrades gracefully to the old behavior when the marker is absent), but full benefit requires both.

### Error Handling

- Steps 2, 3, 4 (guides, commands, IDE): catch errors, print `warn(...)`, continue
- Step 1 (project creation): let errors propagate through `handleError(err)`
- Detection phase: errors (e.g., git not available) treated as negative detection (skip that check, continue)

### Effort

3/5 — Refactoring extraction is the tricky part. The composition logic itself is straightforward. Testing requires mocking `execFileSync` for git detection.

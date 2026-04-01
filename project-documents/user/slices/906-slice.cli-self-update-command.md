---
docType: slice-design
slice: cli-self-update-command
project: context-forge
parent: user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: []
interfaces: []
dateCreated: 20260331
dateUpdated: 20260331
status: complete
---

# Slice Design: CLI Self-Update Command

## Overview

Add a top-level `cf update` command that checks npm for newer versions of the Context Forge packages and prompts the user to install. This is an explicit, user-initiated action — no automatic update checks on startup or in the background.

## Value

Users currently have no built-in way to discover or apply updates. They must manually check npm or remember to run `npm update -g`. A `cf update` command gives users a single, discoverable command to stay current without introducing latency or network dependencies into normal CLI usage.

## Technical Scope

**Included:**
- `cf update` command: check npm registry for latest version, display comparison, prompt to install
- `--yes` flag for non-interactive (CI/scripting) use
- `--json` flag for machine-readable output (version info + update availability)
- Detection of global install method (npm vs pnpm global) to run the correct install command

**Excluded:**
- Automatic/background update checks (startup hooks, periodic checks, etc.)
- Updating `ai-project-guide` — that remains `cf guides update`
- Updating peer packages independently (all three packages share one version; updating `@context-forge/cli` pulls the matching `core` and `mcp`)
- Self-updating from local/dev installs (detect and skip with a message)

## Architecture

### Component Structure

One new file: `packages/cli/src/commands/update.ts`

Exports `registerUpdateCommand(program: Command): void` following the established command registration pattern.

Internal functions:
- `fetchLatestVersion(packageName: string): Promise<string | null>` — calls npm registry
- `detectInstallMethod(): Promise<'npm' | 'pnpm' | 'unknown'>` — determines how `cf` was installed globally
- `runUpdate(method: 'npm' | 'pnpm', packageName: string): Promise<void>` — executes the install command

### Data Flow

```
cf update
  → read local version from package.json (already available via `version` const in index.ts)
  → fetch latest version from npm registry (HTTPS GET to registry.npmjs.org)
  → compare versions
  → if same: print "already up to date" and exit
  → if newer available: show comparison, prompt user (unless --yes)
  → if confirmed: spawn child process to run global install
  → report result
```

## Technical Decisions

### npm Registry Query

Use Node's built-in `https` (or `fetch` if Node 18+ is guaranteed — `engines` field confirms `>=18`) to query:

```
GET https://registry.npmjs.org/@context-forge/cli/latest
```

Response includes `version` field. This is a single lightweight JSON fetch — no need for a library.

Use `globalThis.fetch` (available in Node 18+). No new dependencies needed.

### Version Comparison

Use simple semver string comparison. The `node:` built-in doesn't include semver comparison, but a basic split-and-compare on major.minor.patch is sufficient for our use case (we don't use pre-release tags on published versions). Alternatively, import a tiny semver comparator — but given we control the version format and it's always `x.y.z`, a manual compare keeps dependencies at zero.

Decision: manual `compareSemver(a, b)` — a small utility function (~10 lines) within the command file.

### Install Method Detection

Determine how `cf` was installed globally:
1. Check if `process.argv[1]` (the script path) is under a pnpm global directory (contains `.pnpm` or `pnpm/global`)
2. Otherwise assume npm
3. For local/dev installs (path contains `node_modules` in the repo or is a workspace link), skip update and inform the user

### Running the Update

Use `child_process.execSync` to run the appropriate command:
- npm: `npm install -g @context-forge/cli@latest`
- pnpm: `pnpm add -g @context-forge/cli@latest`

Run synchronously so the user sees the output directly. The update replaces the current binary, but since the current process is already loaded in memory, it completes cleanly.

### Error Handling

- **Network failure:** Catch fetch errors, print a clear message ("Could not reach npm registry — check your network connection"), exit with non-zero code.
- **Unknown install method:** Warn the user and print the manual command they can run.
- **Install failure:** Let the child process output propagate to stderr; catch the error and print a summary.
- **Non-TTY with no `--yes`:** If stdin is not a TTY and `--yes` is not set, print the available update info and exit without prompting (the user can re-run with `--yes`).

## Implementation Details

### Command Registration

In `packages/cli/src/index.ts`, register in the "Setup and administration" section:

```typescript
import { registerUpdateCommand } from './commands/update.js';
// ...
registerUpdateCommand(program);
```

### CLI Interface

```
cf update              # Check for updates, prompt if available
cf update --yes        # Auto-install if update available
cf update --json       # Output version info as JSON (no prompt, no install)
```

### JSON Output Format

```json
{
  "current": "0.6.34",
  "latest": "0.7.0",
  "updateAvailable": true,
  "installMethod": "npm"
}
```

When no update is available, `updateAvailable` is `false` and `latest` equals `current`.

### Text Output Examples

**Up to date:**
```
@context-forge/cli v0.6.34 is up to date.
```

**Update available:**
```
Update available: 0.6.34 → 0.7.0

Install now? (y/N)
```

**After install:**
```
✓ Updated @context-forge/cli to 0.7.0
```

**Dev/local install detected:**
```
Local development install detected — skipping self-update.
  To update, pull the latest changes and rebuild.
```

## Success Criteria

### Functional Requirements
- `cf update` checks npm registry and reports current vs latest version
- When an update is available, user is prompted to install (unless `--yes`)
- `--yes` flag installs without prompting
- `--json` flag outputs structured version info without side effects
- Works correctly for both npm and pnpm global installs
- Gracefully handles: no network, unknown install method, dev/local installs, non-TTY environments

### Technical Requirements
- No new runtime dependencies added to `@context-forge/cli`
- Zero impact on startup time of other commands
- Follows existing CLI patterns (error handling, output styling, commander registration)
- Unit tests for version comparison and install method detection logic

### Verification Walkthrough

1. **Check for updates (no update available):**
   ```bash
   cf update
   ```
   Expected: prints current version and "up to date" message.
   Verified: `@context-forge/cli v0.6.34 is up to date.`

2. **Check for updates (update available):**
   Simulate by temporarily installing an older version, then run:
   ```bash
   cf update
   ```
   Expected: shows version comparison, prompts y/N.
   Note: Not verifiable from dev checkout (local install detection fires first). Covered by unit tests and code review of the action flow.

3. **Non-interactive update:**
   ```bash
   cf update --yes
   ```
   Expected: if update available, installs without prompting. If already current, prints "up to date".
   Note: Same caveat as #2 — global install required for full end-to-end.

4. **JSON output (from global install):**
   ```bash
   cf update --json
   ```
   Expected: JSON object with `current`, `latest`, `updateAvailable`, `installMethod` fields.
   Note: From dev checkout, local install detection fires before JSON output. Requires global install for JSON verification. Unit tests cover the JSON output path.

5. **No network:**
   Disconnect from network, then:
   ```bash
   cf update
   ```
   Expected: clear error message about network, non-zero exit code.
   Note: Requires global install + no network. `fetchLatestVersion` returns null on any fetch error; command calls `handleError` which exits non-zero. Covered by unit tests.

6. **Dev install detection:**
   From a local dev checkout (not globally installed):
   ```bash
   node packages/cli/dist/index.js update
   ```
   Expected: message indicating local dev install, suggests pulling and rebuilding instead.
   Verified: `Local development install detected — skipping self-update. / To update, pull the latest changes and rebuild.`
   Caveat: Detection uses a heuristic — checks for `package.json` in ancestor directories (up to 4 levels) of the script path. Also detects relative paths and project-local `node_modules` paths.

## Implementation Notes

### Development Approach

1. Implement `fetchLatestVersion` and `compareSemver` utilities with tests
2. Implement `detectInstallMethod` with tests
3. Wire up the command with text output, prompting, and `--yes`/`--json` flags
4. Register in `index.ts`
5. Manual end-to-end verification

### Special Considerations

- The update command replaces its own binary. This is safe because the Node process has already loaded the JS into memory, but it's worth noting in case of future changes to how the CLI bootstraps.
- pnpm global installs may use different directory structures across platforms (Linux/macOS vs Windows). The detection heuristic should be tested on the primary development platform (macOS/Darwin) with a note about Windows differences if applicable.

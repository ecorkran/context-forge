---
docType: tasks
slice: cli-self-update-command
project: context-forge
lld: user/slices/906-slice.cli-self-update-command.md
dependencies: []
projectState: CLI has 15+ commands registered via commander pattern in packages/cli/src/commands/. All three published packages (@context-forge/cli, core, mcp) share version 0.6.34. Node >=18 guaranteed (engines field). Existing utilities include askConfirmation (readline prompt), handleError, printJson, output styles.
dateCreated: 20260331
dateUpdated: 20260331
status: complete
---

## Context Summary
- Working on slice 906: CLI Self-Update Command
- Adds `cf update` — top-level command to check npm for newer versions and prompt to install
- No automatic/background update checks; explicit invocation only
- Separate from `cf guides update` (tool vs guide)
- No new runtime dependencies
- Next: implementation (Phase 6)

## Tasks

### 1. Core Utilities

- [x] **Task 1.1: Implement `compareSemver` utility**
  - [x] Create `packages/cli/src/commands/update.ts`
  - [x] Implement `compareSemver(a: string, b: string): number` — returns -1, 0, or 1
  - [x] Splits on `.`, compares major/minor/patch as integers
  - [x] Export for testing
  - [x] SC: function correctly compares versions (e.g., `0.6.34` vs `0.7.0`, `1.0.0` vs `0.9.99`, equal versions)

- [x] **Task 1.2: Implement `fetchLatestVersion`**
  - [x] Implement `fetchLatestVersion(packageName: string): Promise<string | null>`
  - [x] Uses `globalThis.fetch` to GET `https://registry.npmjs.org/{packageName}/latest`
  - [x] Parses JSON response, returns `version` field
  - [x] Returns `null` on any fetch/parse error (network failure, non-200, malformed JSON)
  - [x] Timeout: abort after 10 seconds using `AbortSignal.timeout(10_000)`
  - [x] SC: returns version string on success, null on failure

- [x] **Task 1.3: Implement `detectInstallMethod`**
  - [x] Implement `detectInstallMethod(): { method: 'npm' | 'pnpm' | 'unknown'; isLocal: boolean }`
  - [x] Check `process.argv[1]` for pnpm indicators (`.pnpm` or `pnpm/global` in path)
  - [x] Check for local/dev install: path is under a workspace or contains project-local `node_modules`
  - [x] If local: `isLocal: true`, method can be `'unknown'`
  - [x] If pnpm global: `method: 'pnpm'`, `isLocal: false`
  - [x] Otherwise: `method: 'npm'`, `isLocal: false`
  - [x] SC: correctly classifies npm global, pnpm global, and local dev paths

- [x] **Task 1.4: Tests for core utilities**
  - [x] Create `packages/cli/tests/commands/update.test.ts`
  - [x] `compareSemver` tests: equal versions, major/minor/patch differences, various orderings
  - [x] `fetchLatestVersion` tests: mock `globalThis.fetch` — success returns version string, non-200 returns null, network error returns null, malformed JSON returns null
  - [x] `detectInstallMethod` tests: mock `process.argv[1]` with npm global path, pnpm global path, and local dev path; verify correct classification
  - [x] SC: all tests pass, cover the documented cases from tasks 1.1–1.3
  - [x] Commit: `feat(cli): add update command core utilities`

### 2. Command Implementation

- [x] **Task 2.1: Implement `runUpdate` function**
  - [x] Implement `runUpdate(method: 'npm' | 'pnpm'): void`
  - [x] Uses `child_process.execSync` with `{ stdio: 'inherit' }` so user sees output
  - [x] npm: `npm install -g @context-forge/cli@latest`
  - [x] pnpm: `pnpm add -g @context-forge/cli@latest`
  - [x] Throws on failure (let `execSync` propagate)
  - [x] SC: spawns the correct command for each method

- [x] **Task 2.2: Implement `registerUpdateCommand`**
  - [x] Export `registerUpdateCommand(program: Command): void`
  - [x] Command: `cf update` with description `'Check for updates and install the latest version'`
  - [x] Options: `--yes` (skip prompt, auto-install), `--json` (output JSON, no side effects)
  - [x] Action flow:
    1. Read current version (import from `package.json` via same pattern as `index.ts`)
    2. Call `detectInstallMethod()`
    3. If local dev install: print message per slice design, return
    4. Call `fetchLatestVersion('@context-forge/cli')`
    5. If fetch failed: print network error via `handleError`, exit non-zero
    6. Compare versions with `compareSemver`
    7. If `--json`: print JSON object (`current`, `latest`, `updateAvailable`, `installMethod`), return
    8. If up to date: print styled "up to date" message, return
    9. Print update comparison (`current → latest`)
    10. If `--yes` or non-TTY with `--yes`: proceed to install
    11. If TTY without `--yes`: prompt with `askConfirmation`
    12. If non-TTY without `--yes`: print info and exit (no prompt)
    13. On confirm: call `runUpdate`, print success
    14. On decline: exit cleanly
  - [x] Use existing output styles (`label`, `value`, `dim`, `success`, `warn`) and `printJson`
  - [x] Wrap action in try/catch with `handleError`
  - [x] SC: command handles all six scenarios from the verification walkthrough in the slice design

- [x] **Task 2.3: Register command in CLI entry point**
  - [x] In `packages/cli/src/index.ts`, import `registerUpdateCommand` from `./commands/update.js`
  - [x] Call `registerUpdateCommand(program)` in the "Setup and administration" section
  - [x] SC: `cf update --help` shows the command with correct description and options
  - [x] Commit: `feat(cli): add cf update command`

### 3. Build Verification & Manual Testing

- [x] **Task 3.1: Build and verify**
  - [x] Run `pnpm build` from project root — must succeed with no errors
  - [x] Run `pnpm test` — all existing tests plus new tests pass
  - [x] Run `cf update --json` from a dev checkout — should detect local install or output JSON
  - [x] Run `cf update --help` — shows description and options
  - [x] SC: build passes, tests pass, command is accessible

- [x] **Task 3.2: Update slice status and commit**
  - [x] Set slice design status to `complete` in frontmatter
  - [x] Check off slice 906 in the slice plan (`900-slices.maintenance-and-refactoring.md`)
  - [x] Update task file status to `complete`
  - [x] Commit: `docs: complete slice 906 CLI self-update command`

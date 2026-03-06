---
slice: cf-slash-commands
project: context-forge
lld: user/slices/174-slice.cf-slash-commands.md
dependencies: [168-cli-foundation]
projectState: Slice 173 complete. CLI has cf set/get/build/status/next/prompt/init/guides/config/project/future/check. 767 tests total (430 core, 124 CLI, 107 MCP, 106 Electron). All packages at 0.2.3.
dateCreated: 20260306
dateUpdated: 20260306
status: complete
---

## Context Summary

- Adding Claude Code slash commands that wrap `cf` CLI as `/cf:status`, `/cf:build`, `/cf:next`, `/cf:prompt`
- Command files are markdown with YAML frontmatter, stored in `packages/cli/commands/cf/`
- Install/uninstall via `cf install-commands` / `cf uninstall-commands` copies to `~/.claude/commands/cf/`
- `cf/` subdirectory creates the `/cf:` namespace in Claude Code
- Commands use `!` backtick execution with `allowed-tools: Bash(cf:*)` for pre-authorization
- Dependencies: CLI foundation (168) — complete
- Source resolution uses `import.meta.url` pattern (same as existing `package.json` reading)

---

## Task 1: Create `/cf:status` Command File

**Effort: 1/5**

- [x] **Create `packages/cli/commands/cf/status.md`**
  - [x] Create directory structure `packages/cli/commands/cf/`
  - [x] Add YAML frontmatter with `description`, `allowed-tools: Bash(cf:*)`
  - [x] Add command body that executes `!`\``cf status 2>/dev/null`\` and instructs Claude to summarize
  - [x] Match the specification in slice design section "Command Specifications > /cf:status"

- [x] **Success**: File exists at `packages/cli/commands/cf/status.md` with valid YAML frontmatter

---

## Task 2: Create `/cf:build` Command File

**Effort: 1/5**

- [x] **Create `packages/cli/commands/cf/build.md`**
  - [x] Add YAML frontmatter with `description`, `argument-hint`, `allowed-tools: Bash(cf:*)`
  - [x] Add command body that executes `!`\``cf build $ARGUMENTS 2>/dev/null`\`
  - [x] `argument-hint` should indicate optional `--phase` and `--slice` flags
  - [x] Match the specification in slice design section "Command Specifications > /cf:build"

- [x] **Success**: File exists at `packages/cli/commands/cf/build.md` with valid YAML frontmatter

---

## Task 3: Create `/cf:next` Command File

**Effort: 1/5**

- [x] **Create `packages/cli/commands/cf/next.md`**
  - [x] Add YAML frontmatter with `description`, `allowed-tools: Bash(cf:*)`
  - [x] Add command body that executes `!`\``cf next 2>/dev/null`\` and instructs Claude to suggest steps
  - [x] Match the specification in slice design section "Command Specifications > /cf:next"

- [x] **Success**: File exists at `packages/cli/commands/cf/next.md` with valid YAML frontmatter

---

## Task 4: Create `/cf:prompt` Command File

**Effort: 1/5**

- [x] **Create `packages/cli/commands/cf/prompt.md`**
  - [x] Add YAML frontmatter with `description`, `argument-hint`, `allowed-tools: Bash(cf:*)`
  - [x] Add command body that executes `!`\``cf prompt ${ARGUMENTS:-list} 2>/dev/null`\`
  - [x] Default to `list` when no arguments provided (via `${ARGUMENTS:-list}`)
  - [x] Match the specification in slice design section "Command Specifications > /cf:prompt"

- [x] **Success**: File exists at `packages/cli/commands/cf/prompt.md` with valid YAML frontmatter

- [x] **Commit**: `feat(cli): add Claude Code slash command files for cf wrapper`

---

## Task 5: Create Command Installer Module

**Effort: 2/5**

- [x] **Create `packages/cli/src/commands/commandInstaller.ts`**
  - [x] Implement `getSourceCommandsDir(): string`
    - [x] Use `fileURLToPath(import.meta.url)` to locate the script
    - [x] Resolve `../../commands/` relative to the dist output directory (script is at `dist/commands/commandInstaller.js`)
    - [x] Throw descriptive error if resolved directory does not exist
  - [x] Implement `installCommands(targetDir: string): void`
    - [x] Create `<targetDir>/cf/` with `mkdirSync({ recursive: true })`
    - [x] Read command files from source `cf/` directory with `readdirSync`, filter to `.md` files
    - [x] Copy each `.md` file to `<targetDir>/cf/` using `copyFileSync`
    - [x] Return list of installed filenames for confirmation output
  - [x] Implement `uninstallCommands(targetDir: string): void`
    - [x] Define known command filenames: `['status.md', 'build.md', 'next.md', 'prompt.md']`
    - [x] Remove each file from `<targetDir>/cf/` if it exists (no error if missing)
    - [x] After removal, check if `<targetDir>/cf/` is empty; if so, remove the directory
    - [x] Do not remove user-added files in `<targetDir>/cf/`
    - [x] Return list of removed filenames for confirmation output
  - [x] Export `registerInstallCommandsCommand(program: Command): void`
    - [x] Register `install-commands` command with `--target <dir>` option
    - [x] Default target: `path.join(os.homedir(), '.claude', 'commands')`
    - [x] Call `installCommands(target)`, print success with list of commands
  - [x] Export `registerUninstallCommandsCommand(program: Command): void`
    - [x] Register `uninstall-commands` command with `--target <dir>` option
    - [x] Default target: same as install
    - [x] Call `uninstallCommands(target)`, print success with list of removed commands

- [x] **Success**: Module compiles; `pnpm --filter @context-forge/cli typecheck` passes

---

## Task 6: Register Commands and Update Package Config

**Effort: 1/5**

- [x] **Update `packages/cli/src/index.ts`**
  - [x] Import `registerInstallCommandsCommand` and `registerUninstallCommandsCommand` from `./commands/commandInstaller.js`
  - [x] Call both registration functions with `program` (after existing command registrations)

- [x] **Update `packages/cli/package.json`**
  - [x] Add `"commands"` to the `files` array: `["dist", "commands", "README.md"]`

- [x] **Success**: `pnpm --filter @context-forge/cli build` succeeds; `cf --help` shows `install-commands` and `uninstall-commands`

- [x] **Commit**: `feat(cli): add install-commands and uninstall-commands for Claude Code`

---

## Task 7: Install/Uninstall Tests

**Effort: 2/5**

- [x] **Create `packages/cli/tests/commands/commandInstaller.test.ts`**
  - [x] **Test: `getSourceCommandsDir` resolves to existing directory**
    - [x] Call the function and verify the returned path contains `commands` and the directory exists
  - [x] **Test: fresh install copies all four command files**
    - [x] Use a temp directory as target
    - [x] Call `installCommands(tempDir)`
    - [x] Verify `<tempDir>/cf/status.md`, `build.md`, `next.md`, `prompt.md` all exist
    - [x] Verify file contents match source files
  - [x] **Test: install is idempotent (overwrite)**
    - [x] Run `installCommands(tempDir)` twice
    - [x] Verify files still exist and match source
  - [x] **Test: uninstall removes command files**
    - [x] Install first, then call `uninstallCommands(tempDir)`
    - [x] Verify all four files are removed
    - [x] Verify `<tempDir>/cf/` directory is removed (was empty)
  - [x] **Test: uninstall preserves user-added files**
    - [x] Install, then add a custom file `<tempDir>/cf/custom.md`
    - [x] Call `uninstallCommands(tempDir)`
    - [x] Verify four cf files are removed but `custom.md` and `cf/` directory remain
  - [x] **Test: uninstall when not installed (idempotent)**
    - [x] Call `uninstallCommands(tempDir)` on empty temp directory
    - [x] Verify no error thrown
  - [x] **Test: custom target directory**
    - [x] Pass a non-default temp directory to both install and uninstall
    - [x] Verify files are placed in and removed from the custom location
  - [x] **Test: command files have valid YAML frontmatter**
    - [x] Read each installed `.md` file
    - [x] Verify it starts with `---` and contains `description:` and `allowed-tools:`

- [x] **Success**: `pnpm --filter @context-forge/cli test` passes; all new tests pass

- [x] **Commit**: `test(cli): add install/uninstall command tests`

---

## Task 8: Full Build, Test, and Verify

**Effort: 1/5**

- [x] **Full build**: `pnpm build` — all packages compile
- [x] **Full test**: `pnpm test` — all tests pass across all packages
- [x] **Manual verification** (if Claude Code is available):
  - [x] Run `cf install-commands` and verify files appear in `~/.claude/commands/cf/`
  - [x] Verify `/cf:status` appears in Claude Code (via `/help` or command palette)
  - [x] Run `cf uninstall-commands` and verify files are removed
- [x] **Commit final state if any remaining changes**

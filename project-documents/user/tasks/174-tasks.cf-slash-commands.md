---
slice: cf-slash-commands
project: context-forge
lld: user/slices/174-slice.cf-slash-commands.md
dependencies: [168-cli-foundation]
projectState: Slice 173 complete. CLI has cf set/get/build/status/next/prompt/init/guides/config/project/future/check. 767 tests total (430 core, 124 CLI, 107 MCP, 106 Electron). All packages at 0.2.3.
dateCreated: 20260306
dateUpdated: 20260306
status: in_progress
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

- [ ] **Create `packages/cli/src/commands/commandInstaller.ts`**
  - [ ] Implement `getSourceCommandsDir(): string`
    - [ ] Use `fileURLToPath(import.meta.url)` to locate the script
    - [ ] Resolve `../../commands/` relative to the dist output directory (script is at `dist/commands/commandInstaller.js`)
    - [ ] Throw descriptive error if resolved directory does not exist
  - [ ] Implement `installCommands(targetDir: string): void`
    - [ ] Create `<targetDir>/cf/` with `mkdirSync({ recursive: true })`
    - [ ] Read command files from source `cf/` directory with `readdirSync`, filter to `.md` files
    - [ ] Copy each `.md` file to `<targetDir>/cf/` using `copyFileSync`
    - [ ] Return list of installed filenames for confirmation output
  - [ ] Implement `uninstallCommands(targetDir: string): void`
    - [ ] Define known command filenames: `['status.md', 'build.md', 'next.md', 'prompt.md']`
    - [ ] Remove each file from `<targetDir>/cf/` if it exists (no error if missing)
    - [ ] After removal, check if `<targetDir>/cf/` is empty; if so, remove the directory
    - [ ] Do not remove user-added files in `<targetDir>/cf/`
    - [ ] Return list of removed filenames for confirmation output
  - [ ] Export `registerInstallCommandsCommand(program: Command): void`
    - [ ] Register `install-commands` command with `--target <dir>` option
    - [ ] Default target: `path.join(os.homedir(), '.claude', 'commands')`
    - [ ] Call `installCommands(target)`, print success with list of commands
  - [ ] Export `registerUninstallCommandsCommand(program: Command): void`
    - [ ] Register `uninstall-commands` command with `--target <dir>` option
    - [ ] Default target: same as install
    - [ ] Call `uninstallCommands(target)`, print success with list of removed commands

- [ ] **Success**: Module compiles; `pnpm --filter @context-forge/cli typecheck` passes

---

## Task 6: Register Commands and Update Package Config

**Effort: 1/5**

- [ ] **Update `packages/cli/src/index.ts`**
  - [ ] Import `registerInstallCommandsCommand` and `registerUninstallCommandsCommand` from `./commands/commandInstaller.js`
  - [ ] Call both registration functions with `program` (after existing command registrations)

- [ ] **Update `packages/cli/package.json`**
  - [ ] Add `"commands"` to the `files` array: `["dist", "commands", "README.md"]`

- [ ] **Success**: `pnpm --filter @context-forge/cli build` succeeds; `cf --help` shows `install-commands` and `uninstall-commands`

- [ ] **Commit**: `feat(cli): add install-commands and uninstall-commands for Claude Code`

---

## Task 7: Install/Uninstall Tests

**Effort: 2/5**

- [ ] **Create `packages/cli/tests/commands/commandInstaller.test.ts`**
  - [ ] **Test: `getSourceCommandsDir` resolves to existing directory**
    - [ ] Call the function and verify the returned path contains `commands` and the directory exists
  - [ ] **Test: fresh install copies all four command files**
    - [ ] Use a temp directory as target
    - [ ] Call `installCommands(tempDir)`
    - [ ] Verify `<tempDir>/cf/status.md`, `build.md`, `next.md`, `prompt.md` all exist
    - [ ] Verify file contents match source files
  - [ ] **Test: install is idempotent (overwrite)**
    - [ ] Run `installCommands(tempDir)` twice
    - [ ] Verify files still exist and match source
  - [ ] **Test: uninstall removes command files**
    - [ ] Install first, then call `uninstallCommands(tempDir)`
    - [ ] Verify all four files are removed
    - [ ] Verify `<tempDir>/cf/` directory is removed (was empty)
  - [ ] **Test: uninstall preserves user-added files**
    - [ ] Install, then add a custom file `<tempDir>/cf/custom.md`
    - [ ] Call `uninstallCommands(tempDir)`
    - [ ] Verify four cf files are removed but `custom.md` and `cf/` directory remain
  - [ ] **Test: uninstall when not installed (idempotent)**
    - [ ] Call `uninstallCommands(tempDir)` on empty temp directory
    - [ ] Verify no error thrown
  - [ ] **Test: custom target directory**
    - [ ] Pass a non-default temp directory to both install and uninstall
    - [ ] Verify files are placed in and removed from the custom location
  - [ ] **Test: command files have valid YAML frontmatter**
    - [ ] Read each installed `.md` file
    - [ ] Verify it starts with `---` and contains `description:` and `allowed-tools:`

- [ ] **Success**: `pnpm --filter @context-forge/cli test` passes; all new tests pass

- [ ] **Commit**: `test(cli): add install/uninstall command tests`

---

## Task 8: Full Build, Test, and Verify

**Effort: 1/5**

- [ ] **Full build**: `pnpm build` — all packages compile
- [ ] **Full test**: `pnpm test` — all tests pass across all packages
- [ ] **Manual verification** (if Claude Code is available):
  - [ ] Run `cf install-commands` and verify files appear in `~/.claude/commands/cf/`
  - [ ] Verify `/cf:status` appears in Claude Code (via `/help` or command palette)
  - [ ] Run `cf uninstall-commands` and verify files are removed
- [ ] **Commit final state if any remaining changes**

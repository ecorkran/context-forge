---
slice: 177-slice.ide-setup-command
project: context-forge
lld: user/slices/177-slice.ide-setup-command.md
dependencies: [172-slice.guide-management, 168-slice.cli-foundation]
projectState: "Phase 5 task breakdown for 177. All dependencies complete. CLI infrastructure and guide management in place."
dateCreated: 20260308
dateUpdated: 20260308
status: not_started
---

# Tasks: IDE Setup Command

## Context

Working on slice 177 in project context-forge. This slice adds a `cf setup-ide claude` CLI command that wraps the ai-project-guide `setup-ide` bash script with file-safety guardrails (backup and confirmation before overwriting `CLAUDE.md`). Single new file: `packages/cli/src/commands/setup-ide.ts`. No new core services. Follows patterns established in `guides.ts` and `project.ts`.

**Delivers:** `cf setup-ide claude` command with `--yes` and `--project` options.
**Dependencies:** Guide detection via `GuideDetector`, project resolution via `resolveProjectId`, error handling via `UserError`/`handleError`.

---

## Task 1: Create command file and register

- [ ] **1.1 Create `packages/cli/src/commands/setup-ide.ts` with command skeleton**
  - [ ] Create the file with imports: `Command` from commander, `FileProjectStore` and `GuideDetector` from `@context-forge/core/node`, `GUIDE_RELATIVE_PATH` from `@context-forge/core`, `resolveProjectId` from `../utils/project.js`, `handleError`/`UserError` from `../utils/errors.js`
  - [ ] Define `VALID_TARGETS = ['claude'] as const`
  - [ ] Export `registerSetupIdeCommand(program: Command): void`
  - [ ] Register command: `program.command('setup-ide')` with `.description('Configure IDE-specific AI integration files for the current project')`
  - [ ] Add positional argument: `.argument('<target>', ...)` with description listing valid targets
  - [ ] Add options: `--project <id>` and `--yes`
  - [ ] Add empty action handler that just validates the target against `VALID_TARGETS` and throws `UserError` if invalid
  - [ ] Success: file compiles, exports the register function

- [ ] **1.2 Register command in `packages/cli/src/index.ts`**
  - [ ] Add import: `import { registerSetupIdeCommand } from './commands/setup-ide.js';`
  - [ ] Add registration call: `registerSetupIdeCommand(program);` alongside the other `register*` calls
  - [ ] Success: `pnpm cf setup-ide --help` shows the command with target argument, `--project`, and `--yes` options
  - [ ] Success: `pnpm cf --help` lists `setup-ide` in the command list

**Commit after Task 1.**

---

## Task 2: Implement project and guide resolution

- [ ] **2.1 Add project resolution to the action handler**
  - [ ] Resolve project using `resolveProjectId(opts.project, store)` pattern (same as `guides.ts`)
  - [ ] Look up project via `store.getById(id)`
  - [ ] Throw `UserError` if project not found or has no `projectPath`
  - [ ] Success: `pnpm cf setup-ide claude` resolves project from CWD; `--project` flag overrides

- [ ] **2.2 Add guide installation detection**
  - [ ] Construct guide directory path: `path.join(projectPath, GUIDE_RELATIVE_PATH)`
  - [ ] Use `GuideDetector.detect(guideDir)` (static method) to check installation
  - [ ] If not installed, throw `UserError`: `"Guides are not installed. Run 'cf guides install' first."`
  - [ ] Success: running in a project without guides installed produces the install hint error

- [ ] **2.3 Locate and validate the setup-ide script**
  - [ ] Construct script path: `path.join(guideDir, 'scripts/setup-ide')`
  - [ ] Check file exists with `fs.existsSync(scriptPath)`
  - [ ] If not found, throw `UserError`: `"setup-ide script not found at ${scriptPath}. Your guides installation may be incomplete — try 'cf guides update'."`
  - [ ] Success: running with guides installed but missing script produces the expected error

**Commit after Task 2.**

---

## Task 3: Implement CLAUDE.md safety checks

- [ ] **3.1 Add CLAUDE.md detection and backup logic**
  - [ ] Import `fs` and `path` from node
  - [ ] Construct path: `path.join(projectPath, 'CLAUDE.md')`
  - [ ] Check if file exists with `fs.existsSync`
  - [ ] If exists:
    - [ ] If `--yes` is not set: print warning to stderr, prompt for y/N confirmation using `readline.createInterface` (follow `askConfirmation` pattern from `project.ts`)
    - [ ] If user declines (default N): print "Aborted." and return (clean exit, no error)
    - [ ] Copy file to `CLAUDE.md.bak` using `fs.copyFileSync`
    - [ ] Print to stderr: `"Backed up CLAUDE.md → CLAUDE.md.bak"`
  - [ ] If file does not exist: proceed silently (no warning, no prompt)
  - [ ] Success: existing `CLAUDE.md` triggers prompt; declining aborts; confirming creates `.bak`
  - [ ] Success: `--yes` skips prompt but still creates `.bak`
  - [ ] Success: no `CLAUDE.md` proceeds without any prompt

**Commit after Task 3.**

---

## Task 4: Implement script invocation

- [ ] **4.1 Shell out to setup-ide script**
  - [ ] Import `execFileSync` from `node:child_process`
  - [ ] Call `execFileSync('bash', [scriptPath, target], { cwd: projectPath, stdio: 'inherit' })`
  - [ ] Wrap in try/catch — if the child process throws (non-zero exit), throw `UserError`: `"setup-ide exited with code ${code}. Check the output above for details."`
  - [ ] On success, print a brief completion message to stderr (e.g., `"IDE setup complete for ${target}."`)
  - [ ] Success: running `cf setup-ide claude` in a project with guides installed invokes the script and user sees its output directly in the terminal

- [ ] **4.2 Wrap entire action handler in try/catch with `handleError`**
  - [ ] Follow the pattern from other commands: outer try/catch calling `handleError(err)`
  - [ ] Success: any unhandled error produces a formatted error message, not a stack trace

**Commit after Task 4.**

---

## Task 5: Unit tests

- [ ] **5.1 Create test file `packages/cli/tests/commands/setup-ide.test.ts`**
  - [ ] Follow existing test patterns (e.g., `build.test.ts`, `guides.test.ts` if it exists)
  - [ ] Mock `@context-forge/core/node` — `FileProjectStore`, `GuideDetector`
  - [ ] Mock `node:child_process` — `execFileSync`
  - [ ] Mock `node:fs` — `existsSync`, `copyFileSync`
  - [ ] Mock `resolveProjectId` from `../utils/project.js`
  - [ ] Set up a `createProgram` helper that creates a Commander instance and registers the setup-ide command
  - [ ] Success: test file structure compiles and can be run

- [ ] **5.2 Test: rejects invalid target**
  - [ ] Parse `['node', 'cf', 'setup-ide', 'vim']`
  - [ ] Expect `UserError` with message listing valid targets
  - [ ] Success: test passes

- [ ] **5.3 Test: errors when guides not installed**
  - [ ] Mock `GuideDetector.detect` to return `{ installed: false }`
  - [ ] Parse `['node', 'cf', 'setup-ide', 'claude']`
  - [ ] Expect `UserError` mentioning `cf guides install`
  - [ ] Success: test passes

- [ ] **5.4 Test: errors when script not found**
  - [ ] Mock `GuideDetector.detect` to return `{ installed: true }`
  - [ ] Mock `fs.existsSync` to return `false` for the script path
  - [ ] Expect `UserError` mentioning the script path
  - [ ] Success: test passes

- [ ] **5.5 Test: proceeds without prompt when no CLAUDE.md**
  - [ ] Mock guide detection as installed, script exists
  - [ ] Mock `fs.existsSync` to return `false` for `CLAUDE.md` (true for script)
  - [ ] Expect `execFileSync` called with `['bash', [scriptPath, 'claude']]`
  - [ ] Expect no call to `copyFileSync` (no backup needed)
  - [ ] Success: test passes

- [ ] **5.6 Test: creates .bak and invokes script with --yes when CLAUDE.md exists**
  - [ ] Mock `fs.existsSync` to return `true` for both script and `CLAUDE.md`
  - [ ] Parse with `--yes` flag
  - [ ] Expect `copyFileSync` called with `CLAUDE.md` → `CLAUDE.md.bak`
  - [ ] Expect `execFileSync` called
  - [ ] Success: test passes

- [ ] **5.7 Test: handles non-zero script exit code**
  - [ ] Mock `execFileSync` to throw an error with `status: 1`
  - [ ] Expect error output mentioning exit code
  - [ ] Success: test passes

**Commit after Task 5.**

---

## Task 6: Build verification and cleanup

- [ ] **6.1 Run full test suite**
  - [ ] Run `pnpm test` from project root — all packages must pass
  - [ ] Run `pnpm build` — no compilation errors
  - [ ] Success: all tests pass, build succeeds

- [ ] **6.2 Manual smoke test**
  - [ ] From the context-forge project root: `pnpm cf setup-ide claude --yes`
  - [ ] Verify it runs the setup-ide script and produces output
  - [ ] If `CLAUDE.md` existed, verify `CLAUDE.md.bak` was created
  - [ ] Success: command works end-to-end in a real project

- [ ] **6.3 Update slice design status**
  - [ ] Set `177-slice.ide-setup-command.md` frontmatter `status: complete`
  - [ ] Check off slice plan entry 17 in `160-slices.project-workflow-system.md`
  - [ ] Update DEVLOG with implementation summary and commit hashes

**Final commit after Task 6.**

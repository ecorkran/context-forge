---
slice: 177-slice.ide-setup-command
project: context-forge
lld: user/slices/177-slice.ide-setup-command.md
dependencies: [172-slice.guide-management, 168-slice.cli-foundation]
projectState: "Phase 5 task breakdown for 177. All dependencies complete. CLI infrastructure and guide management in place."
dateCreated: 20260308
dateUpdated: 20260309
status: complete
---

# Tasks: IDE Setup Command

## Context

Working on slice 177 in project context-forge. This slice adds a `cf setup-ide claude` CLI command that wraps the ai-project-guide `setup-ide` bash script with file-safety guardrails (backup and confirmation before overwriting `CLAUDE.md`). Single new file: `packages/cli/src/commands/setup-ide.ts`. No new core services. Follows patterns established in `guides.ts` and `project.ts`.

**Delivers:** `cf setup-ide claude` command with `--yes` and `--project` options.
**Dependencies:** Guide detection via `GuideDetector`, project resolution via `resolveProjectId`, error handling via `UserError`/`handleError`.

---

## Task 1: Create command file and register

- [x] **1.1 Create `packages/cli/src/commands/setup-ide.ts` with command skeleton**
  - [x] Create the file with imports: `Command` from commander, `FileProjectStore` and `GuideDetector` from `@context-forge/core/node`, `GUIDE_RELATIVE_PATH` from `@context-forge/core`, `resolveProjectId` from `../utils/project.js`, `handleError`/`UserError` from `../utils/errors.js`
  - [x] Define `VALID_TARGETS = ['claude'] as const`
  - [x] Export `registerSetupIdeCommand(program: Command): void`
  - [x] Register command: `program.command('setup-ide')` with `.description('Configure IDE-specific AI integration files for the current project')`
  - [x] Add positional argument: `.argument('<target>', ...)` with description listing valid targets
  - [x] Add options: `--project <id>` and `--yes`
  - [x] Add empty action handler that just validates the target against `VALID_TARGETS` and throws `UserError` if invalid
  - [x] Success: file compiles, exports the register function

- [x] **1.2 Register command in `packages/cli/src/index.ts`**
  - [x] Add import: `import { registerSetupIdeCommand } from './commands/setup-ide.js';`
  - [x] Add registration call: `registerSetupIdeCommand(program);` alongside the other `register*` calls
  - [x] Success: `pnpm cf setup-ide --help` shows the command with target argument, `--project`, and `--yes` options
  - [x] Success: `pnpm cf --help` lists `setup-ide` in the command list

**Commit after Task 1.**

---

## Task 2: Implement project and guide resolution

- [x] **2.1 Add project resolution to the action handler**
  - [x] Resolve project using `resolveProjectId(opts.project, store)` pattern (same as `guides.ts`)
  - [x] Look up project via `store.getById(id)`
  - [x] Throw `UserError` if project not found or has no `projectPath`
  - [x] Success: `pnpm cf setup-ide claude` resolves project from CWD; `--project` flag overrides

- [x] **2.2 Add guide installation detection**
  - [x] Construct guide directory path: `path.join(projectPath, GUIDE_RELATIVE_PATH)`
  - [x] Use `GuideDetector.detect(guideDir)` (static method) to check installation
  - [x] If not installed, throw `UserError`: `"Guides are not installed. Run 'cf guides install' first."`
  - [x] Success: running in a project without guides installed produces the install hint error

- [x] **2.3 Locate and validate the setup-ide script**
  - [x] Construct script path: `path.join(guideDir, 'scripts/setup-ide')`
  - [x] Check file exists with `fs.existsSync(scriptPath)`
  - [x] If not found, throw `UserError`: `"setup-ide script not found at ${scriptPath}. Your guides installation may be incomplete — try 'cf guides update'."`
  - [x] Success: running with guides installed but missing script produces the expected error

**Commit after Task 2.**

---

## Task 3: Implement CLAUDE.md safety checks

- [x] **3.1 Add CLAUDE.md detection and backup logic**
  - [x] Import `fs` and `path` from node
  - [x] Construct path: `path.join(projectPath, 'CLAUDE.md')`
  - [x] Check if file exists with `fs.existsSync`
  - [x] If exists:
    - [x] If `--yes` is not set: print warning to stderr, prompt for y/N confirmation using `readline.createInterface` (follow `askConfirmation` pattern from `project.ts`)
    - [x] If user declines (default N): print "Aborted." and return (clean exit, no error)
    - [x] Copy file to `CLAUDE.md.bak` using `fs.copyFileSync`
    - [x] Print to stderr: `"Backed up CLAUDE.md → CLAUDE.md.bak"`
  - [x] If file does not exist: proceed silently (no warning, no prompt)
  - [x] Success: existing `CLAUDE.md` triggers prompt; declining aborts; confirming creates `.bak`
  - [x] Success: `--yes` skips prompt but still creates `.bak`
  - [x] Success: no `CLAUDE.md` proceeds without any prompt

**Commit after Task 3.**

---

## Task 4: Implement script invocation

- [x] **4.1 Shell out to setup-ide script**
  - [x] Import `execFileSync` from `node:child_process`
  - [x] Call `execFileSync('bash', [scriptPath, target], { cwd: projectPath, stdio: 'inherit' })`
  - [x] Wrap in try/catch — if the child process throws (non-zero exit), throw `UserError`: `"setup-ide exited with code ${code}. Check the output above for details."`
  - [x] On success, print a brief completion message to stderr (e.g., `"IDE setup complete for ${target}."`)
  - [x] Success: running `cf setup-ide claude` in a project with guides installed invokes the script and user sees its output directly in the terminal

- [x] **4.2 Wrap entire action handler in try/catch with `handleError`**
  - [x] Follow the pattern from other commands: outer try/catch calling `handleError(err)`
  - [x] Success: any unhandled error produces a formatted error message, not a stack trace

**Commit after Task 4.**

---

## Task 5: Unit tests

- [x] **5.1 Create test file `packages/cli/tests/commands/setup-ide.test.ts`**
  - [x] Follow existing test patterns (e.g., `build.test.ts`, `guides.test.ts` if it exists)
  - [x] Mock `@context-forge/core/node` — `FileProjectStore`, `GuideDetector`
  - [x] Mock `node:child_process` — `execFileSync`
  - [x] Mock `node:fs` — `existsSync`, `copyFileSync`
  - [x] Mock `resolveProjectId` from `../utils/project.js`
  - [x] Set up a `createProgram` helper that creates a Commander instance and registers the setup-ide command
  - [x] Success: test file structure compiles and can be run

- [x] **5.2 Test: rejects invalid target**
  - [x] Parse `['node', 'cf', 'setup-ide', 'vim']`
  - [x] Expect `UserError` with message listing valid targets
  - [x] Success: test passes

- [x] **5.3 Test: errors when guides not installed**
  - [x] Mock `GuideDetector.detect` to return `{ installed: false }`
  - [x] Parse `['node', 'cf', 'setup-ide', 'claude']`
  - [x] Expect `UserError` mentioning `cf guides install`
  - [x] Success: test passes

- [x] **5.4 Test: errors when script not found**
  - [x] Mock `GuideDetector.detect` to return `{ installed: true }`
  - [x] Mock `fs.existsSync` to return `false` for the script path
  - [x] Expect `UserError` mentioning the script path
  - [x] Success: test passes

- [x] **5.5 Test: proceeds without prompt when no CLAUDE.md**
  - [x] Mock guide detection as installed, script exists
  - [x] Mock `fs.existsSync` to return `false` for `CLAUDE.md` (true for script)
  - [x] Expect `execFileSync` called with `['bash', [scriptPath, 'claude']]`
  - [x] Expect no call to `copyFileSync` (no backup needed)
  - [x] Success: test passes

- [x] **5.6 Test: creates .bak and invokes script with --yes when CLAUDE.md exists**
  - [x] Mock `fs.existsSync` to return `true` for both script and `CLAUDE.md`
  - [x] Parse with `--yes` flag
  - [x] Expect `copyFileSync` called with `CLAUDE.md` → `CLAUDE.md.bak`
  - [x] Expect `execFileSync` called
  - [x] Success: test passes

- [x] **5.7 Test: handles non-zero script exit code**
  - [x] Mock `execFileSync` to throw an error with `status: 1`
  - [x] Expect error output mentioning exit code
  - [x] Success: test passes

**Commit after Task 5.**

---

## Task 6: Build verification and cleanup

- [x] **6.1 Run full test suite**
  - [x] Run `pnpm test` from project root — all packages must pass
  - [x] Run `pnpm build` — no compilation errors
  - [x] Success: all tests pass, build succeeds

- [x] **6.2 Manual smoke test**
  - [x] From the context-forge project root: `pnpm cf setup-ide claude --yes`
  - [x] Verify it runs the setup-ide script and produces output
  - [x] If `CLAUDE.md` existed, verify `CLAUDE.md.bak` was created
  - [x] Success: command works end-to-end in a real project

- [x] **6.3 Update slice design status**
  - [x] Set `177-slice.ide-setup-command.md` frontmatter `status: complete`
  - [x] Check off slice plan entry 17 in `160-slices.project-workflow-system.md`
  - [x] Update DEVLOG with implementation summary and commit hashes

**Final commit after Task 6.**

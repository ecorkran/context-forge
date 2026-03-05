---
slice: guide-management
project: context-forge
lld: user/slices/172-slice.guide-management.md
dependencies: [162-config-system, 170-project-model-cleanup]
projectState: >
  Slices 161–171 complete. Config system has guide.* keys defined (guide.source, guide.git_strategy, guide.auto_update).
  CoreServiceFactory already resolves bundled prompt fallback. CLI has 9 registered commands. MCP server has 19 tools.
  673 tests passing (367 core + 101 CLI + 100 MCP + 106 Electron). Branch: 172-slice.guide-management.
dateCreated: 20260305
dateUpdated: 20260305
status: complete
---

## Context Summary
- Working on slice 172: Guide Management
- All prerequisites complete: config system (162) provides `guide.source`, `guide.git_strategy` keys; `cf init` (170) provides `projectPath`
- Bundled prompt fallback already implemented in `CoreServiceFactory.resolvePromptFilePath()` — this slice does NOT need to implement that
- This slice delivers: `GuideDetector`, `GuideManager`, three installation strategies (submodule, clone, tarball), three MCP tools (`guide_status`, `guide_install`, `guide_update`), and CLI command (`cf guides`)
- Source repo: `https://github.com/ecorkran/ai-project-guide.git` with semver tags (v0.9.0 through v0.13.2)
- Next planned slices: 165 (Workflow Navigator), 166 (Consistency Checker)

---

## Tasks

### 1. Core Types and Interfaces

- [x] **Create `packages/core/src/guides/types.ts` with shared types and the strategy interface**
  - [x] Define `GuideInfo` interface (installed, method, version, path, source, latestVersion, updateAvailable, usingBundledPrompt) — see slice design for full shape
  - [x] Define `InstallResult` interface (success, version, method, path)
  - [x] Define `UpdateResult` interface (success, previousVersion, newVersion, method)
  - [x] Define `DetectionResult` interface (method, version, source) — returned by strategy `detect()`
  - [x] Define `InstallStrategy` interface with `install()`, `update()`, `detect()` methods — see slice design
  - [x] Define `GuideMethod` type: `'submodule' | 'clone' | 'manual'`
  - [x] Define constants: `DEFAULT_SOURCE_GIT`, `DEFAULT_SOURCE_API`, `GUIDE_RELATIVE_PATH` (`project-documents/ai-project-guide`), `VERSION_MARKER_FILE` (`.context-forge-guide-version`)
  - [x] Commit: `feat(core): add guide management types and strategy interface`

### 2. Git Shell Helper

- [x] **Create `packages/core/src/guides/gitExec.ts` — safe shell execution wrapper for git commands**
  - [x] Implement `gitExec(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }>` using `child_process.execFile` (not `exec`, to prevent shell injection)
  - [x] Implement `isGitAvailable(): Promise<boolean>` — runs `git --version`, returns true/false
  - [x] Implement `isGitRepo(dir: string): Promise<boolean>` — runs `git rev-parse --is-inside-work-tree` in `dir`
  - [x] All functions should throw descriptive errors (include command and stderr in error message)
  - [x] Commit: `feat(core): add git execution helper for guide management`

- [x] **Test `gitExec` helper**
  - [x] Create `packages/core/tests/guides/gitExec.test.ts`
  - [x] Test `gitExec` calls `execFile` with correct args and cwd
  - [x] Test `gitExec` rejects with descriptive error on non-zero exit
  - [x] Test `isGitAvailable` returns true when git succeeds, false when it fails
  - [x] Test `isGitRepo` returns true inside a git repo, false outside
  - [x] Mock `child_process.execFile` — do not run actual git commands
  - [x] Commit: `test(core): add tests for git execution helper`

### 3. GuideDetector

- [x] **Create `packages/core/src/guides/GuideDetector.ts` — detect guide installation state**
  - [x] Implement `detect(projectPath: string, source?: string): Promise<GuideInfo>`
  - [x] Detection logic (in order):
    1. Check if guide directory exists (`{projectPath}/project-documents/ai-project-guide/`)
    2. If not exists → return `{ installed: false, method: null, usingBundledPrompt: true, ... }`
    3. If exists, check for `.git/` subdirectory → method is `'clone'`
    4. If exists, parse `{projectPath}/.gitmodules` for matching path entry → method is `'submodule'`
    5. If neither → method is `'manual'` (check for `.context-forge-guide-version` marker)
  - [x] Version detection:
    - For submodule/clone: run `git describe --tags --abbrev=0` in the guide directory; null if no tags
    - For manual: read `.context-forge-guide-version` marker file; null if missing
  - [x] Latest version check: run `git ls-remote --tags --sort=-v:refname {source}` and extract highest semver tag. Set `latestVersion: null` on network failure (do not throw)
  - [x] Compute `updateAvailable` by comparing version and latestVersion (semver comparison)
  - [x] Source resolution: use provided `source` param, else use `DEFAULT_SOURCE_GIT` constant
  - [x] Commit: `feat(core): add GuideDetector for installation state detection`

- [x] **Test GuideDetector**
  - [x] Create `packages/core/tests/guides/GuideDetector.test.ts`
  - [x] Test: directory does not exist → installed: false, usingBundledPrompt: true
  - [x] Test: directory exists with `.git/` → method: 'clone', reads version from git tags
  - [x] Test: directory exists with `.gitmodules` entry → method: 'submodule'
  - [x] Test: directory exists with version marker → method: 'manual', reads version from marker
  - [x] Test: directory exists with no indicators → method: 'manual', version: null
  - [x] Test: latest version check failure → latestVersion: null, updateAvailable: false (no throw)
  - [x] Test: updateAvailable correctly computed when latestVersion > version
  - [x] Mock filesystem (`fs.existsSync`, `fs.readFileSync`) and `gitExec`
  - [x] Commit: `test(core): add tests for GuideDetector`

### 4. SubmoduleStrategy

- [x] **Create `packages/core/src/guides/strategies/SubmoduleStrategy.ts`**
  - [x] Implements `InstallStrategy` interface
  - [x] `detect()`: check `.gitmodules` for path match → return `DetectionResult` or null
  - [x] `install()`: verify git available and project is a git repo (error with actionable message if not), run `git submodule add {source} {targetDir}` from project root, return `InstallResult` with version from `git describe --tags`
  - [x] `update()`: run `git submodule update --remote {targetDir}`, return `UpdateResult` with old/new versions
  - [x] Error messages should suggest alternative strategies when submodule prerequisites aren't met
  - [x] Commit: `feat(core): add SubmoduleStrategy for guide installation`

- [x] **Test SubmoduleStrategy**
  - [x] Create `packages/core/tests/guides/strategies/SubmoduleStrategy.test.ts`
  - [x] Test detect: returns result when `.gitmodules` contains path match
  - [x] Test detect: returns null when `.gitmodules` missing or no match
  - [x] Test install: calls correct git commands in correct cwd
  - [x] Test install: errors when git unavailable (with helpful message)
  - [x] Test install: errors when not a git repo (with helpful message suggesting clone/manual)
  - [x] Test update: calls submodule update command, returns old/new versions
  - [x] Mock `gitExec` and filesystem
  - [x] Commit: `test(core): add tests for SubmoduleStrategy`

### 5. CloneStrategy

- [x] **Create `packages/core/src/guides/strategies/CloneStrategy.ts`**
  - [x] Implements `InstallStrategy` interface
  - [x] `detect()`: check for `.git/` subdirectory inside guide dir → return `DetectionResult` or null
  - [x] `install()`: verify git available (error if not), run `git clone {source} {targetDir}`, return `InstallResult`
  - [x] `update()`: run `git -C {targetDir} pull --ff-only`, return `UpdateResult` with old/new versions
  - [x] Commit: `feat(core): add CloneStrategy for guide installation`

- [x] **Test CloneStrategy**
  - [x] Create `packages/core/tests/guides/strategies/CloneStrategy.test.ts`
  - [x] Test detect: returns result when `.git/` exists inside guide dir
  - [x] Test detect: returns null when `.git/` does not exist
  - [x] Test install: calls `git clone` with correct source and target
  - [x] Test install: errors when git unavailable
  - [x] Test update: calls `git pull --ff-only` in target dir, returns versions
  - [x] Mock `gitExec` and filesystem
  - [x] Commit: `test(core): add tests for CloneStrategy`

### 6. TarballStrategy

- [x] **Create `packages/core/src/guides/strategies/TarballStrategy.ts`**
  - [x] Implements `InstallStrategy` interface
  - [x] `detect()`: check for `.context-forge-guide-version` marker file → return `DetectionResult` or null
  - [x] `install()`: fetch latest tag from GitHub API, download tarball from `https://api.github.com/repos/{owner}/{repo}/tarball/{tag}`, extract to target directory using Node.js `node:zlib` (createGunzip) and `tar` package (or built-in stream if feasible), write `.context-forge-guide-version` marker with version, return `InstallResult`
  - [x] `update()`: read current version from marker, fetch latest tag, if same → return no-op result, otherwise download/extract/overwrite, update marker, return `UpdateResult`
  - [x] Parse owner/repo from source URL (support `https://github.com/{owner}/{repo}.git` and `https://github.com/{owner}/{repo}` formats)
  - [x] Commit: `feat(core): add TarballStrategy for guide installation`

- [x] **Test TarballStrategy**
  - [x] Create `packages/core/tests/guides/strategies/TarballStrategy.test.ts`
  - [x] Test detect: returns result when marker file exists
  - [x] Test detect: returns null when marker file missing
  - [x] Test install: calls fetch with correct GitHub API URL, extracts archive, writes marker
  - [x] Test install: handles network failure gracefully (descriptive error)
  - [x] Test update: no-op when already at latest version
  - [x] Test update: downloads and replaces when newer version available
  - [x] Test source URL parsing for owner/repo extraction
  - [x] Mock `fetch` (global or node-fetch) and filesystem operations
  - [x] Commit: `test(core): add tests for TarballStrategy`

### 7. GuideManager

- [x] **Create `packages/core/src/guides/GuideManager.ts` — orchestration layer**
  - [x] Constructor takes `projectPath: string` and optional `configManager?: ConfigManager`
  - [x] `status(): Promise<GuideInfo>` — reads `guide.source` config, delegates to `GuideDetector.detect()`
  - [x] `install(strategyOverride?: GuideMethod, sourceOverride?: string): Promise<InstallResult>` — reads `guide.git_strategy` and `guide.source` from config (overrides take precedence), selects strategy, checks not already installed (error if so), delegates to `strategy.install()`
  - [x] `update(): Promise<UpdateResult>` — detects current installation, checks installed (error if not), selects strategy matching detected method, delegates to `strategy.update()`
  - [x] Strategy selection: map `GuideMethod` → strategy instance (SubmoduleStrategy, CloneStrategy, TarballStrategy)
  - [x] Commit: `feat(core): add GuideManager orchestration layer`

- [x] **Test GuideManager**
  - [x] Create `packages/core/tests/guides/GuideManager.test.ts`
  - [x] Test status: delegates to detector with resolved source from config
  - [x] Test install: reads strategy from config, delegates to correct strategy
  - [x] Test install: strategy/source overrides take precedence over config
  - [x] Test install: errors when guide already installed
  - [x] Test update: detects current method, delegates to matching strategy
  - [x] Test update: errors when guide not installed
  - [x] Mock `GuideDetector`, all strategies, and `ConfigManager`
  - [x] Commit: `test(core): add tests for GuideManager`

### 8. Core Package Exports

- [x] **Create `packages/core/src/guides/index.ts` and wire up exports**
  - [x] Export `GuideManager`, `GuideDetector`, types, and constants from `index.ts`
  - [x] Add `export * from './guides/index.js'` to `packages/core/src/node.ts` (guides are fs-dependent, so node entrypoint only)
  - [x] Export types (`GuideInfo`, `GuideMethod`, `InstallResult`, `UpdateResult`) from `packages/core/src/index.ts` (types are safe for any entrypoint)
  - [x] Verify build passes: `npm run build -w packages/core`
  - [x] Commit: `feat(core): export guide management module`

### 9. MCP Tools

- [x] **Create `packages/mcp-server/src/tools/guideTools.ts` with three MCP tools**
  - [x] `guide_status` tool:
    - Input schema: `{ projectId: z.string() }`
    - Resolves project via `resolveProjectId`, instantiates `GuideManager` with `projectPath`, calls `status()`, returns `GuideInfo` as JSON
    - Annotations: `readOnlyHint: true, openWorldHint: false`
  - [x] `guide_install` tool:
    - Input schema: `{ projectId: z.string(), strategy: z.enum(['submodule','clone','manual']).optional(), source: z.string().optional() }`
    - Resolves project, calls `manager.install(strategy, source)`, returns `InstallResult`
    - Annotations: `readOnlyHint: false`
  - [x] `guide_update` tool:
    - Input schema: `{ projectId: z.string() }`
    - Resolves project, calls `manager.update()`, returns `UpdateResult`
    - Annotations: `readOnlyHint: false`
  - [x] Follow existing pattern from `configTools.ts` for error handling (catch → `errorResult()`)
  - [x] Register in `packages/mcp-server/src/index.ts` (import and call registration function)
  - [x] Commit: `feat(mcp): add guide_status, guide_install, guide_update tools`

- [x] **Test MCP guide tools**
  - [x] Create `packages/mcp-server/tests/guideTools.test.ts`
  - [x] Mock `GuideManager` (constructor and all methods)
  - [x] Test `guide_status`: resolves project, calls status, returns GuideInfo JSON
  - [x] Test `guide_install`: passes strategy/source overrides, returns InstallResult
  - [x] Test `guide_install`: returns error result when already installed
  - [x] Test `guide_update`: returns UpdateResult with versions
  - [x] Test `guide_update`: returns error result when not installed
  - [x] Test error handling: exceptions produce error results, not crashes
  - [x] Follow existing test patterns from `configTools.test.ts`
  - [x] Commit: `test(mcp): add tests for guide MCP tools`

### 10. Update MCP Server Lifecycle Test

- [x] **Update `packages/mcp-server/tests/serverLifecycle.test.ts`**
  - [x] Update expected tool count from 19 to 22 in the test description and assertion
  - [x] Add `'guide_install'`, `'guide_status'`, `'guide_update'` to the sorted tool names array
  - [x] Verify test passes: `npm run test -w packages/mcp-server`
  - [x] Commit: `fix(mcp): update server lifecycle test for 22 tools`

### 11. CLI Command

- [x] **Create `packages/cli/src/commands/guides.ts` — `cf guides` command**
  - [x] Register `guides` command on program with description
  - [x] Bare `cf guides` / `cf guides info` action:
    - Resolve project via `resolveProjectId` (supports `--project` flag)
    - Instantiate `GuideManager`, call `status()`
    - Display formatted output: installed (yes/no), method, version, path, update available, using bundled prompt
    - Support `--json` flag for structured output
  - [x] `cf guides install` subcommand:
    - Options: `--strategy <submodule|clone|manual>`, `--source <url>`, `--project <name|id>`
    - Call `manager.install()`, display result (version, method, path)
    - Error with guidance if already installed
  - [x] `cf guides update` subcommand:
    - Options: `--project <name|id>`
    - Call `manager.update()`, display old→new version
    - Error with guidance if not installed
    - Informational message if already at latest
  - [x] Register in `packages/cli/src/index.ts`: import `registerGuidesCommand`, call it with `program`
  - [x] Commit: `feat(cli): add cf guides command for guide lifecycle management`

- [x] **Test CLI guides command**
  - [x] Create `packages/cli/tests/commands/guides.test.ts`
  - [x] Mock `GuideManager` (status, install, update methods)
  - [x] Test `cf guides`: displays status info in formatted output
  - [x] Test `cf guides --json`: outputs GuideInfo as JSON
  - [x] Test `cf guides install`: calls install with default strategy
  - [x] Test `cf guides install --strategy clone`: passes strategy override
  - [x] Test `cf guides install` when already installed: shows error guidance
  - [x] Test `cf guides update`: calls update, displays version change
  - [x] Test `cf guides update` when not installed: shows error guidance
  - [x] Follow existing test patterns from `project.test.ts`
  - [x] Commit: `test(cli): add tests for cf guides command`

### 12. Final Verification and Commit

- [x] **Full build and test verification**
  - [x] Run `npm run build` from project root — all packages compile
  - [x] Run `npm run test` from project root — all tests pass across all packages
  - [x] Verify no TypeScript errors: `npm run typecheck` (or equivalent)
  - [x] Verify new tool count: 22 MCP tools total (19 existing + guide_status + guide_install + guide_update)
  - [x] Mark slice 172 as complete in `160-slices.project-workflow-system.md` (change `[ ]` to `[x]`)
  - [x] Update slice design status to `complete`
  - [x] Update DEVLOG with implementation summary and commit list
  - [x] Final commit: `docs: mark slice 172 guide management complete`

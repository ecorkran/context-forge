---
docType: slice-design
slice: guide-management
project: context-forge
parent: user/architecture/160-slices.project-workflow-system.md
dependencies: [162-config-system, 170-project-model-cleanup]
interfaces: []
dateCreated: 20260305
dateUpdated: 20260305
status: not_started
---

# Slice Design: Guide Management

## Overview

This slice makes Context Forge usable out of the box by bundling the system prompt (already done) and providing tools to install, inspect, and update the ai-project-guide into project directories. After this slice, a new user can `npx @context-forge/mcp` and get useful context assembly immediately, then progressively adopt the full methodology via `cf guides install`.

## Value

**Eliminates the #1 adoption barrier.** Currently, Context Forge requires a manually installed ai-project-guide before it generates useful context. The bundled prompt fallback (already implemented in `CoreServiceFactory`) handles the zero-config case. This slice adds the progressive adoption path: discover what's installed, install the full guide, and keep it current.

Both humans (`cf guides`) and agents (MCP `guide_*` tools) get first-class access to guide lifecycle management.

## Technical Scope

### Included

- **Guide status detection** — Determine whether a project has ai-project-guide installed, what method was used (submodule, clone, manual/tarball), what version is present, and whether a newer version is available
- **Guide installation** — Download and install ai-project-guide into `{projectPath}/project-documents/ai-project-guide/` using the configured git strategy
- **Guide update** — Update an existing installation to the latest version
- **MCP tools** — `guide_install`, `guide_status`, `guide_update`
- **CLI command** — `cf guides` with `install`, `update`, and bare info display
- **Config key consumption** — Use existing `guide.source`, `guide.git_strategy` config keys

### Excluded

- **Auto-update on startup** — The `guide.auto_update` config key remains defined but unused. Deferred to future demand.
- **Guide scaffolding** — Creating `project-documents/user/` directory structure, templates, or starter files. That's a separate concern.
- **Bundled prompt file** — Already implemented in `CoreServiceFactory.resolvePromptFilePath()`. This slice does not modify that logic.

## Dependencies

### Prerequisites

- **[162] Config System** (complete) — `guide.source`, `guide.git_strategy`, `guide.auto_update` config keys are defined in `ConfigKeys.ts`
- **[170] Project Model Cleanup & CLI Init** (complete) — `cf init` provides `projectPath`, which guide management requires to know where to install

### External

- **GitHub API / git CLI** — Guide installation uses `git` commands (submodule add, clone) or GitHub tarball download
- **ai-project-guide repository** — Source at `https://github.com/ecorkran/ai-project-guide.git`, with semver tags (currently v0.9.0 through v0.13.2)

## Architecture

### Component Structure

```
packages/core/src/guides/
├── GuideManager.ts          # Core guide lifecycle logic
├── GuideDetector.ts         # Detect installation state, method, version
├── strategies/
│   ├── SubmoduleStrategy.ts # git submodule add/update
│   ├── CloneStrategy.ts     # git clone / git pull
│   └── TarballStrategy.ts   # GitHub tarball download & extract
└── index.ts                 # Public exports

packages/mcp-server/src/tools/
└── guideTools.ts            # MCP tool registrations

packages/cli/src/commands/
└── guides.ts                # cf guides command
```

### Data Flow

1. **Status query**: `GuideDetector` inspects `{projectPath}/project-documents/ai-project-guide/` → checks for `.git` directory (clone), `../.gitmodules` entry (submodule), or plain directory (manual) → reads version from git tags or `readme.md` frontmatter → optionally queries remote for latest version
2. **Install**: `GuideManager` reads `guide.git_strategy` config → delegates to appropriate strategy → strategy executes installation → returns result with version info
3. **Update**: `GuideManager` reads current state via `GuideDetector` → delegates to strategy's update method → returns result with old/new version

### Key Design Decisions

**Strategy pattern for git methods.** The three installation methods (submodule, clone, tarball) have different install/update/detect mechanics. A strategy interface keeps each self-contained:

```typescript
interface InstallStrategy {
  install(projectPath: string, source: string, targetDir: string): Promise<InstallResult>;
  update(projectPath: string, targetDir: string): Promise<UpdateResult>;
  detect(projectPath: string, targetDir: string): Promise<DetectionResult | null>;
}
```

**Version detection via git tags.** For submodule and clone installations, the current version is determined by `git describe --tags --abbrev=0` in the guide directory. For tarball installations, version is stored in a `.context-forge-guide-version` marker file written during install. Latest available version is determined by `git ls-remote --tags` against the source repo.

**Shell execution for git operations.** Guide management shells out to `git` rather than using a Node.js git library. Rationale: git is universally available in development environments, the operations are simple (submodule add, clone, pull), and avoiding a library dependency keeps the package lean. Use `child_process.execFile` for safety (no shell injection).

**Target directory is fixed.** The guide always installs to `{projectPath}/project-documents/ai-project-guide/`. This is not configurable — it matches the path that `CoreServiceFactory` and `SystemPromptParser` expect.

## Implementation Details

### GuideDetector

Responsible for answering: "Is a guide installed? How? What version?"

```typescript
interface GuideInfo {
  installed: boolean;
  method: 'submodule' | 'clone' | 'manual' | null;  // null when not installed
  version: string | null;          // e.g., "v0.13.2" or null if undetermined
  path: string;                    // absolute path to guide directory
  source: string;                  // configured or detected remote URL
  latestVersion: string | null;    // latest available version, null if check skipped/failed
  updateAvailable: boolean;        // true if latestVersion > version
  usingBundledPrompt: boolean;     // true if no local guide → CoreServiceFactory falls back to bundled
}
```

Detection logic:
1. Check if `{projectPath}/project-documents/ai-project-guide/` exists
2. If exists, check for `.git/` subdirectory → clone
3. If exists, check parent's `.gitmodules` for matching path entry → submodule
4. If exists but neither → manual/tarball (check for `.context-forge-guide-version` marker)
5. If not exists → not installed, `usingBundledPrompt: true`

### Installation Strategies

**Submodule** (`guide.git_strategy = 'submodule'`, default):
- Install: `git submodule add {source} project-documents/ai-project-guide` from project root
- Update: `git submodule update --remote project-documents/ai-project-guide`
- Requires: project must be a git repository

**Clone** (`guide.git_strategy = 'clone'`):
- Install: `git clone {source} project-documents/ai-project-guide`
- Update: `git -C {targetDir} pull --ff-only`
- Does not modify parent repo's git state

**Tarball/Manual** (`guide.git_strategy = 'manual'`):
- Install: Download tarball from GitHub API (`https://api.github.com/repos/{owner}/{repo}/tarball/{tag}`), extract to target directory, write `.context-forge-guide-version` marker
- Update: Same as install (download latest, replace contents, update marker)
- No git dependency for the guide directory itself

### Default Source Resolution

The `guide.source` config key defaults to `""`. When empty, the default source is `https://github.com/ecorkran/ai-project-guide.git` (for submodule/clone) or the GitHub API equivalent for tarball. This default is defined as a constant in `GuideManager`, not in ConfigKeys (which stores only the override).

### MCP Tools

Three new tools registered in `guideTools.ts`:

**`guide_status`** — Read-only status of the guide installation.
- Input: `{ projectId: string }` (required — no implicit resolution in MCP tools)
- Output: `GuideInfo` as JSON
- Annotations: `readOnlyHint: true`

**`guide_install`** — Install ai-project-guide into the project.
- Input: `{ projectId: string, strategy?: string, source?: string }`
- `strategy` overrides `guide.git_strategy` config for this call
- `source` overrides `guide.source` config for this call
- Output: `{ success: boolean, version: string, method: string, path: string }` or error
- Annotations: `readOnlyHint: false`
- Error if guide is already installed (use `guide_update` instead)

**`guide_update`** — Update an existing installation to the latest version.
- Input: `{ projectId: string }`
- Output: `{ success: boolean, previousVersion: string, newVersion: string, method: string }` or error
- Annotations: `readOnlyHint: false`
- Error if guide is not installed (use `guide_install` instead)
- No-op with informational message if already at latest version

### CLI Command

`cf guides` registered in `packages/cli/src/commands/guides.ts`:

**`cf guides`** (bare / `cf guides info`):
- Resolves project via standard chain (--project / CWD / default)
- Displays: installed (yes/no), method, version, path, update available
- Formatted output with colors; `--json` for structured output

**`cf guides install`**:
- `--strategy <submodule|clone|manual>` — override config
- `--source <url>` — override config
- Resolves project, runs installation, reports result
- Error with guidance if already installed

**`cf guides update`**:
- Resolves project, runs update, reports old→new version
- Error with guidance if not installed
- Informational message if already at latest

### Error Handling

- **git not available**: Check `git --version` before submodule/clone operations. If unavailable, suggest `manual` strategy or install git.
- **Not a git repo**: Submodule strategy requires the project to be a git repository. Detect and suggest `clone` or `manual` strategy instead.
- **Network failure**: Tarball download or `git ls-remote` may fail. Report the error clearly; don't crash. Version check failures should not block status reporting (just set `latestVersion: null`).
- **Already installed / not installed**: `guide_install` when already installed → error with "use guide_update". `guide_update` when not installed → error with "use guide_install". Clear, actionable messages.
- **Permission errors**: File system operations may fail. Report the path and error; don't retry.

## Success Criteria

### Functional Requirements

- `cf guides` (and `guide_status` MCP tool) accurately reports installation state, method, version, and update availability for a project
- `cf guides install` (and `guide_install` MCP tool) successfully installs ai-project-guide using each of the three strategies (submodule, clone, manual)
- `cf guides update` (and `guide_update` MCP tool) updates an existing installation to the latest version
- `guide.git_strategy` config is respected as the default strategy
- `guide.source` config is respected as the source URL override
- After `cf guides install`, `cf build` uses the project-local guide (not the bundled fallback)
- Errors produce clear, actionable messages (not stack traces)

### Technical Requirements

- `GuideManager` and `GuideDetector` in `packages/core` with unit tests
- Strategy implementations with unit tests (mock git/network operations)
- MCP tool tests in `packages/mcp-server`
- CLI command tests in `packages/cli`
- All existing tests continue to pass
- MCP server lifecycle test updated for new tool count (19 → 22)

## Implementation Notes

### Development Approach

Suggested order:
1. `GuideDetector` — detection logic with tests (no side effects, easy to test)
2. Strategy implementations — submodule, clone, tarball with tests (mock shell/network)
3. `GuideManager` — orchestration layer consuming detector + strategies
4. MCP tools — wire up `guide_status`, `guide_install`, `guide_update`
5. CLI command — `cf guides` with subcommands
6. Integration testing — end-to-end with a temp directory

### Testing Strategy

- **Unit tests**: Mock `child_process.execFile` for git commands, mock `fetch` for tarball downloads, mock filesystem for detection
- **Strategy tests**: Each strategy tested in isolation with mocked externals
- **MCP tool tests**: Follow existing pattern in `configTools.test.ts` — mock store and manager, test input validation and response shaping
- **CLI tests**: Follow existing pattern in `project.test.ts` — mock core dependencies, test command parsing and output

### Special Considerations

- **Tarball extraction**: Use Node.js built-in `zlib` + `tar` (via npm `tar` package if needed, or `node:zlib` + stream processing). Evaluate whether `node -e` with `zlib.createGunzip()` + tar stream parsing is sufficient, or if the `tar` npm package is warranted. Prefer zero-dependency if feasible.
- **Submodule in non-git projects**: Some projects using Context Forge may not be git repositories. The submodule strategy must detect this and fail with a helpful message suggesting `clone` or `manual`.
- **CI environments**: `git` may have restricted permissions. The `manual` strategy (tarball) should work in any environment with network access, making it the most portable option.

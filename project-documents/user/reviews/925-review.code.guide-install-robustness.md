---
docType: review
layer: project
reviewType: code
slice: guide-install-robustness
project: context-forge
verdict: CONCERNS
sourceDocument: project-documents/user/slices/925-slice.guide-install-robustness.md
aiModel: z-ai/glm-5.3
status: complete
dateCreated: 20260910
dateUpdated: 20260910
reviewedSha: a91eba9f275a4b0a4cf086deebe3b7d6c1576ef7
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 27
findings:
  - id: F001
    severity: concern
    category: correctness
    summary: "`cf prompt get <P-shorthand>` reads the guide before `ensureGuideReady` runs"
    location: "packages/cli/src/commands/prompt.ts:119-123"
  - id: F002
    severity: concern
    category: performance
    summary: "`ensureCheckout()` adds an unbounded `git ls-remote` to every read command"
    location: "packages/core/src/guides/GuideManager.ts#ensureCheckout"
  - id: F003
    severity: concern
    category: error-handling
    summary: "`initGuideCheckout` appends offline remediation that `gitExec` may already have appended"
    location: "packages/core/src/guides/GuideManager.ts#initGuideCheckout"
  - id: F004
    severity: concern
    category: maintainability
    summary: "Strategy knowledge is duplicated across MCP, CLI, and core instead of derived from one definition"
    location: "packages/mcp-server/src/tools/guideTools.ts:110-112"
  - id: F005
    severity: concern
    category: test-coverage
    summary: "Stale enum fixture in configTools.test.ts not updated with the enum change"
    location: "packages/mcp-server/tests/configTools.test.ts:199"
  - id: F006
    severity: concern
    category: typing
    summary: "`withNotices` return type erases the field it just added"
    location: "packages/mcp-server/src/tools/contextTools.ts#withNotices"
  - id: F007
    severity: note
    category: consistency
    summary: "MCP `guide_status` returns `managedNotice` even when no guide is installed"
    location: "packages/mcp-server/src/tools/guideTools.ts:77-89"
  - id: F008
    severity: note
    category: dead-code
    summary: "`ensureGuideForProject`'s `operationPath` parameter is never supplied"
    location: "packages/mcp-server/src/tools/contextTools.ts#ensureGuideForProject"
  - id: F009
    severity: note
    category: test-hygiene
    summary: "Tests set `process.env.GIT_ALLOW_PROTOCOL` globally and never restore it"
    location: "packages/core/tests/guides/helpers/submoduleFixture.ts#allowLocalSubmoduleTransport"
  - id: F010
    severity: note
    category: typing
    summary: "`normalizeGuideMethod` uses two `as` casts where a `find`-based guard needs none"
    location: "packages/core/src/guides/types.ts#normalizeGuideMethod"
  - id: F011
    severity: pass
    category: test-coverage
    summary: "Real-git fixtures reproduce the #80 condition that mocks cannot, and pin the read-only guarantees"
    location: "packages/core/tests/guides/helpers/submoduleFixture.ts"
  - id: F012
    severity: pass
    category: error-handling
    summary: "Notice-channel discipline is enforced by tests at every boundary"
    location: "packages/cli/tests/commands/guides.test.ts"
  - id: F013
    severity: pass
    category: error-handling
    summary: "Checkout-state switch is compiler-exhaustive and the timeout plumbing is verified at the execFile boundary"
    location: "packages/core/src/guides/GuideManager.ts#ensureCheckout"
---

# Review: code — slice 925

**Verdict:** CONCERNS
**Model:** z-ai/glm-5.3

## Findings

### [CONCERN] `cf prompt get <P-shorthand>` reads the guide before `ensureGuideReady` runs

In the `get <phase>` action, `resolvePhaseInput(phase, opPath)` is called at line 119 *before* `ensureGuideReady` at line 123. `resolvePhaseInput` (packages/cli/src/utils/phaseShorthand.ts) reads the prompt file for shorthand inputs: a `P\d+` input calls `getPhaseShorthands(opPath)`, which does `fs.readFile(path.join(projectPath, PROMPT_FILE_RELATIVE_PATH))`. On a fresh clone with an uninitialized submodule — the exact #80 scenario this slice fixes — `cf prompt get P6` throws a raw ENOENT before the auto-init ever runs. The `list` action is correctly ordered (ensureGuideReady precedes both the parser and `getPhaseShorthands`), so only the `get` path regresses. Move the `ensureGuideReady` call above `resolvePhaseInput`. (Non-shorthand inputs like `implementation` don't read the file in `resolvePhaseInput`, which is why the existing tests — which use named templates — don't catch this.)

### [CONCERN] `ensureCheckout()` adds an unbounded `git ls-remote` to every read command

`ensureCheckout()` calls `this.detector.detect(...)`, and `GuideDetector.detect()` unconditionally runs `fetchLatestVersion(resolvedSource)` (packages/core/src/guides/GuideDetector.ts, both the installed and not-installed branches), which is a `git ls-remote --tags` against GitHub via `gitExec` **with no timeout**. This change therefore adds a network round-trip to every `cf build`, `cf prompt`, `cf setup-ide`, and `context_build`/`prompt_*` MCP call — even when the guide is in sync, and even when no guide is installed at all. It also directly undermines the D10 rationale documented on `GUIDE_INIT_TIMEOUT_MS`: a blackholed proxy that "accepts a connection and never answers" will hang the read command on the ls-remote, the very condition the 60s init timeout was added to prevent. `ensureCheckout` only needs `installed`, `method`, and `checkout`; consider a read-only detection path that skips the latest-version fetch (or bounds/caches it).

### [CONCERN] `initGuideCheckout` appends offline remediation that `gitExec` may already have appended

The catch block re-throws with `GUIDE_OFFLINE_REMEDIATION` appended unconditionally. But `SubmoduleStrategy.init()` → `gitExec()` already wraps failures with `withNetworkErrorHint`, which appends the *same* remediation text whenever the message matches a network pattern — including this diff's own new `/timed out after \d+s/i` pattern. So on the flagship timeout case the user sees the "Check your VPN/proxy connection…" guidance twice (once inside gitExec's hint, once from `initGuideCheckout`), and on a *non-network* failure (e.g., a malformed submodule config) the user gets spurious VPN/proxy advice. The `ensureCheckout` test that exercises a broken remote URL passes only because that git error doesn't match a network pattern, so gitExec skips its hint and the manager's append is the sole source — the duplication is latent. Append conditionally (e.g., only when `withNetworkErrorHint` would not have fired), or drop the manager-level append and rely on gitExec's existing pattern-based hint.

### [CONCERN] Strategy knowledge is duplicated across MCP, CLI, and core instead of derived from one definition

CLAUDE.md: "Never scatter comparison values across code… define it once… Changing a value should require editing exactly one place." The canonical method list now lives in `GUIDE_METHODS`/`GUIDE_METHOD_DEPRECATED_ALIASES` (core, authoritative), `ConfigKeys` enum (intentional, commented), and the MCP `z.enum(['submodule', 'clone', 'tarball', 'manual'])` — a hand-maintained third copy that will silently drift if a method or alias is added (zod v4's `z.enum` accepts a `readonly string[]`, so `[...GUIDE_METHODS, ...Object.keys(GUIDE_METHOD_DEPRECATED_ALIASES)]` is derivable). Two softer instances of the same drift risk: the deprecation warning sentence is spelled independently in packages/cli/src/commands/guides.ts (`guidesInstallAction`) and in `guide_install`'s notice; and the strategy trade-off wording lives in the CLI's `GUIDE_STRATEGIES` while `guide_install`'s tool description paraphrases the same three strategies differently — precisely the drift D8 was written to prevent, but only enforced inside the CLI.

### [CONCERN] Stale enum fixture in configTools.test.ts not updated with the enum change

That line constructs `new Error('Config key "guide.git_strategy" must be one of ["submodule", "clone", "manual"]')`. The diff changed `ConfigKeys` to `enum: ['submodule', 'clone', 'tarball', 'manual']` (packages/core/src/config/ConfigKeys.ts:37), so the real `ConfigManager` message (built from `def.enum` at packages/core/src/config/ConfigManager.ts:101-103) is now `["submodule", "clone", "tarball", "manual"]`. I have not read the surrounding lines, so I can't say whether line 199 is an expected-message assertion (which would now fail) or a mock-rejection fixture (which would pass but silently misdocument the real error). Either way this test encodes the pre-change enum list and should have been updated alongside `ConfigKeys.ts`.

### [CONCERN] `withNotices` return type erases the field it just added

`withNotices<T extends object>(result: T, notices: string[]): T` returns `{ ...result, notices }` — an object that structurally has a `notices: string[]` property — but declares the return type as `T`, erasing that property from the static contract. This is an unsound-by-design signature of the same family as the `as`-assertion smells the TypeScript rules call out: no typed caller can ever read the notice the function just attached, and a future refactor of the tool handlers can't use the type to discover it. Since the "absent when quiet" property matters, prefer `T | (T & { notices: string[] })`, which preserves both the byte-identical quiet case and the notice-bearing case in the type.

### [NOTE] MCP `guide_status` returns `managedNotice` even when no guide is installed

The CLI gates the notice on `info.installed` (and has a test asserting it is not printed when uninstalled), but the MCP handler includes `managedNotice: GUIDE_MANAGED_NOTICE` unconditionally. Telling a user "this directory is managed and overwritten on `cf guides update`" when the directory doesn't exist is noise, and the two surfaces now disagree.

### [NOTE] `ensureGuideForProject`'s `operationPath` parameter is never supplied

Both call sites (`generateContext`, `resolvePromptFileForTools`) pass only `projectPath`, so the worktree-aware `operationPath` parameter is dead. In the CLI, `cf build` explicitly passes `(projectPath, resolveOperationPath(project, worktreeId))`; in MCP, `generateContext` relies on the worktree overlay having already rewritten `workingCopy.projectPath` to the worktree path, which also means `ConfigManager` is constructed against the worktree rather than the project root. The behavior happens to work for the auto-init case, but the asymmetry between the two entry points is worth either closing (pass the pair like the CLI does) or removing the parameter.

### [NOTE] Tests set `process.env.GIT_ALLOW_PROTOCOL` globally and never restore it

`allowLocalSubmoduleTransport()` (and `makeUninitializedClone()` in packages/cli/tests/integration/guideReady.integration.test.ts, which repeats the same line) assigns `process.env.GIT_ALLOW_PROTOCOL = 'file'` as a process-global side effect with no restore in `cleanup()` or `afterEach`. It's also redundant: both files already define a `GIT_ENV` constant containing `GIT_ALLOW_PROTOCOL: 'file'` used for their direct git calls; the global mutation exists only so the product code's own `gitExec` (which inherits `process.env`) permits the local transport. Leaving it set leaks into every later test in the same worker. Consider restoring the previous value in the fixture's `cleanup()`.

### [NOTE] `normalizeGuideMethod` uses two `as` casts where a `find`-based guard needs none

`(GUIDE_METHODS as readonly string[]).includes(candidate)` followed by `return candidate as GuideMethod` is the classic double-cast idiom. `const canonical = GUIDE_METHODS.find((m) => m === candidate); if (canonical) return canonical;` returns the narrowed `GuideMethod` with no assertions, per the project's "prefer type guards" rule. Low impact — the code is otherwise correct and well-tested.

### [PASS] Real-git fixtures reproduce the #80 condition that mocks cannot, and pin the read-only guarantees

The fixture trio (`cloned`/`initialized`/`outOfSync`, each with an asserted `git submodule status` prefix) plus the self-test of the fixtures, the `GuideDetectorCheckout` tests asserting detect() never runs `submodule update` (D1/D2), and the CLI-side integration test running `ensureGuideReady` against a real uninitialized clone are exactly the right testing pattern: the gitlink-present/working-tree-empty state is unreproducible with a mocked filesystem, and the tests prove behavior (stderr-only notices, idempotent second call, checkout left untouched) rather than call counts. The `gitAvailable() ? describe : describe.skip` guard is a clean way to keep the suite green on git-less CI.

### [PASS] Notice-channel discipline is enforced by tests at every boundary

The D4 rule (stdout stays machine-readable) is not just implemented but verified: the CLI alias tests assert the deprecation warning appears on `console.error` and never on stdout, the MCP tests assert `notices` is present after an init/warn and *absent* (not an empty array) when quiet, and `cf build`/`prompt` unit tests were updated to provide the `GuideManager` the new helper path requires. Combined with the stderr-noticed `ensureGuideReady` helper being the single CLI formatting site, the channel contract can't silently drift.

### [PASS] Checkout-state switch is compiler-exhaustive and the timeout plumbing is verified at the execFile boundary

`ensureCheckout`'s switch over `SubmoduleCheckoutState | null` has no default and covers exactly the union, so adding a state fails the build rather than silently falling into "do nothing" — good use of the discriminated-union discipline the TypeScript rules ask for. Likewise `gitExec`'s timeout tests assert the actual options object passed to `execFile` (`timeout`, `killSignal`, and their absence when unbounded) and pin the `killed`-based timeout detection including the negative case (killed without a timeout set must not claim a timeout).

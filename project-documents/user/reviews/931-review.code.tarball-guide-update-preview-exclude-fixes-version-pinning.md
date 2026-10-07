---
docType: review
layer: project
reviewType: code
slice: tarball-guide-update-preview-exclude-fixes-version-pinning
targetKind: slice
rulesSource: project
project: context-forge
verdict: CONCERNS
verdictSource: stated
sourceDocument: project-documents/user/slices/931-slice.tarball-guide-update-preview-exclude-fixes-version-pinning.md
aiModel: claude-sonnet-5-5
status: complete
dateCreated: 20261007
dateUpdated: 20261007
reviewedSha: b02c395020eb490882fb10adeceda420693ae5a5
toolsGiven: [read_file, list_files, grep]
toolCallsMade: 0
diffTruncated: false
durationSeconds: 46.7
squadronVersion: 0.20.1
findings:
  - id: F001
    severity: concern
    category: type-safety
    summary: "Unjustified `as` assertions, including `as never`"
    location: "packages/core/src/guides/tarballSource.ts#openRemoteArchive"
  - id: F002
    severity: concern
    category: api-design
    summary: "Positional parameters on functions with 3+ arguments"
    location: "packages/core/src/guides/tarballSource.ts#resolveTarballSource"
  - id: F003
    severity: concern
    category: error-handling
    summary: "Tarball-only validation runs after the network call in `update`, contradicting `install`"
    location: "packages/core/src/guides/GuideManager.ts#update"
  - id: F004
    severity: concern
    category: error-handling
    summary: "Bare-filename local source falls through to `git ls-remote`"
    location: "packages/core/src/guides/tarballSource.ts#looksLikePath"
  - id: F005
    severity: concern
    category: structure
    summary: "`guides update` action is long and duplicates the prompt literal"
    location: "packages/cli/src/commands/guides.ts#registerGuidesCommand"
  - id: F006
    severity: concern
    category: dry
    summary: "Duplicated semver-sorting logic"
    location: "packages/core/src/guides/tarballSource.ts#listRemoteTags"
  - id: F007
    severity: note
    category: security
    summary: "MCP tools now accept arbitrary local filesystem paths as `source`"
    location: "packages/mcp-server/src/tools/guideTools.ts#SOURCE_PARAM_DESCRIPTION"
  - id: F008
    severity: note
    category: behavior
    summary: "`enablePositionalOptions()` changes parsing for every subcommand"
    location: "packages/cli/src/index.ts"
  - id: F009
    severity: note
    category: ux
    summary: "Exact-match no-op message can mislead when a version is pinned"
    location: "packages/cli/src/commands/guides.ts (update result branches)"
  - id: F010
    severity: pass
    category: error-handling
    summary: "Staging, swap and preview flow"
    location: "packages/core/src/guides/strategies/TarballStrategy.ts#reviewStaged"
  - id: F011
    severity: pass
    category: correctness
    summary: "guide.exclude carve-out and config commit decision"
    location: "packages/core/src/config/guideExclude.ts#protectedProblem"
---

# Review: code — slice 931

**Verdict:** CONCERNS
**Model:** claude-sonnet-5-5

## Findings

### [CONCERN] Unjustified `as` assertions, including `as never`

`Readable.fromWeb(response.body as never)` moved here unchanged from `TarballStrategy`. `as never` silences the type check entirely, and no comment says why it is needed. `configExcludeCommit.ts` has the same problem: `parse(...) as TomlTable` (twice) and `value as TomlTable` in `asTable`. The rules treat `as` as a smell and require a comment when it is unavoidable. Parsed TOML is `unknown`-shaped, so use a small type guard (or a narrowing `isTable`) instead of casting. For `fromWeb`, use the correct `ReadableStream` type, or add a comment explaining the undici/DOM type mismatch.

### [CONCERN] Positional parameters on functions with 3+ arguments

The rules prefer destructured named parameters for 3+ parameters. This applies to `resolveTarballSource(source, version, projectRoot)` and `assertTarballOnlyOptions(method, options, sourceOverride, sourceRoot)`. `InstallStrategy.install` and `InstallStrategy.update` (`types.ts`) also grew a 4th positional argument. `assertTarballOnlyOptions` takes both `options` and `sourceOverride`, which are easy to mix up at call sites. `install` passes `sourceOverride` while `update` passes `opts.source`. An object parameter would remove that ambiguity.

### [CONCERN] Tarball-only validation runs after the network call in `update`, contradicting `install`

In `install`, the comment says the check runs "before the detector's network call, so nothing is fetched for a rejected option". In `update`, `assertTarballOnlyOptions` runs after `detector.detect(...)` and after the branch-guard evaluation. A user passing `--version` to a submodule install therefore pays for a network call first. They can also be asked to confirm the branch guard before being told the option is invalid. The method is only known from `info.method`, so some detection is needed, but the check should come immediately after it and before the guard.

### [CONCERN] Bare-filename local source falls through to `git ls-remote`

`looksLikePath` only matches sources starting with `.`, `/` or `~`, or containing `\`. A typo or missing archive such as `--source guide.tgz` is not detected as a path, so it is passed to `git ls-remote`. The user then gets a confusing git error instead of "file not found". Consider also treating a source with a `.tgz`/`.tar.gz` suffix, or one that does not parse as a URL, as a path.

### [CONCERN] `guides update` action is long and duplicates the prompt literal

The update action now handles source options, the preview confirm, the branch-guard retry and five result branches inline, well past the ~50-line function guideline. The prompt `'Continue? (y/N) '` is hard-coded in both `confirmPreview` and the branch-guard path, and asserted as a literal in tests. Define it once as a constant, and extract result rendering into a `reportUpdateResult` helper.

### [CONCERN] Duplicated semver-sorting logic

The tag comparator duplicates the version parsing in `GuideDetector.isNewerVersion` and `parseHighestTag`. The `v?` strip, split and `Number` mapping now exist in three places. The comparator was moved here rather than introduced, but this change adds more version-comparison logic next to it. Extract one `compareVersions` helper.

### [NOTE] MCP tools now accept arbitrary local filesystem paths as `source`

An MCP client (an agent) can now point `guide_install` or `guide_update` at any local `.tgz`. `resolveTarballSource` explicitly allows paths outside the project root. The extraction uses node-tar defaults, which guard against path traversal. The exposure is limited to which archive gets installed as the guide, and the guide is then committed. Still, this widens what an agent can do, so confirm it is intended for MCP and not just the CLI.

### [NOTE] `enablePositionalOptions()` changes parsing for every subcommand

The fix is correct for `guides --version <tag>`, and the integration test covers it. But root-level options are now honoured only before the subcommand. I did not verify whether any other root option (or a user habit like `cf guides status -v`) relied on appearing after the subcommand. The integration test also requires a prior `pnpm build` and throws otherwise.

### [NOTE] Exact-match no-op message can mislead when a version is pinned

When `--version` equals the installed version and nothing else changed, the strategy returns the plain no-op result. The CLI then prints "already at the latest" even though the user asked for a specific tag, which may not be the latest.

### [PASS] Staging, swap and preview flow

Staging is removed on every non-proceed path, including when `confirm` or the diff throws. Swap-failure restoration was preserved when moved to `tarballSwap.ts`. Archive errors are wrapped with the archive label and keep the original error as `cause`. A multi-root archive is refused. `diffGuideTrees` fails explicitly with the path rather than falling back silently. The tests use real archives and temp git repositories, covering truncation, multi-root, cancel, unchanged, bookkeeping-only and confirm-throws cases.

### [PASS] guide.exclude carve-out and config commit decision

The `project-guides/lint/<language>` carve-out is defined once in `EXCLUDABLE_GUIDE_SUBTREES`. Its error messages and the config-key description both derive from that constant. `decideConfigCommit` only stages `.context-forge.toml` when `guide.exclude` is its sole change, and otherwise reports a notice. Real-repo tests cover this, including a repository with no commits and a user's pre-staged files.

### Run Digest

- Response length: 6547 chars
- Response is newline-free: no
- Tool calls made: 0
- Tool calls failed: 0
- Stop reason: end_turn
- Output budget: backend default
- System prompt: preset+append
- Settings sources: project
- Reasoning characters: 0
- Effort: backend default
- Turns: not computed
- Tokens — prompt / cached / completion / reasoning: not computed / not computed / not computed / not computed
- Duration: 46.7 s
- `## Summary` located: yes
- `## Findings` located: yes
- Finding-shaped matches — whole response: 11
- Finding-shaped matches — inside fences: 0
- Finding-shaped matches — in findings section: 11
- Finding-shaped matches — surviving validation: 11

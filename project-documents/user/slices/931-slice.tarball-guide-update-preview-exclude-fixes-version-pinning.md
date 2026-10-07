---
docType: slice-design
slice: tarball-guide-update-preview-exclude-fixes-version-pinning
project: context-forge
parent: user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: [212, 916, 925]
interfaces: []
dateCreated: 20261006
dateUpdated: 20261007
status: complete
---

# Slice Design: Tarball Guide Update: Preview, Exclude Fixes, Version Pinning

## Overview

Three changes to the tarball install/update path, bundled because they all touch `TarballStrategy`, `GuideManager.update()`, and the `cf guides` / MCP guide-tool surfaces.

- **#110: Preview before swap.** `cf guides update` replaces the guide without saying what changes. The new tree is already built in a staging directory before the rename, so cf can diff staging against the current guide, print added/removed/changed counts, and ask before swapping.
- **#111: Two `guide.exclude` defects.**
  - (a) The whole `project-guides` tree is protected, so a Python project cannot drop `project-guides/lint/csharp`. The error also misstates the problem: it says the entry "would remove project-guides".
  - (b) The re-extract commit made when `guide.exclude` changes leaves out the `.context-forge.toml` edit that caused it.
- **#93: Version pinning and a local tarball source.** `--version <tag>` on install and update, and `--source` accepting a local `.tgz`/`.tar.gz` file.

Everything is tarball-only. Submodule and clone keep today's behavior. A new flag passed to them is an explicit error, never silently ignored.

This is maintenance on the guide install path built in slices 212 and 925, so it belongs in the 900 initiative. Scope note: #110 and #93 add small user-facing capabilities, which goes beyond the 900 architecture's literal list (consolidation, dead code, tests, developer-experience fixes). The PM chose to bundle them here as guide-path work on the same code.

## Value

- Users see the size of a guide update before it lands in their repo, instead of finding out from the git diff afterwards.
- Single-language projects can trim the lint configs they never use, and the trim survives updates.
- The re-extract commit is self-contained: the config change and the guide change it caused land together.
- A guide build can be tested in a real project before it is tagged (local tarball), and a project can install a known version on purpose (`--version`).

## Technical Scope

**Included**
- A preview diff and confirm step on tarball `update` (CLI prompt, `--yes`, MCP auto-confirm with counts in the result).
- A narrowed `guide.exclude` protection rule, plus an accurate error message.
- Staging `.context-forge.toml` into the guide commit when its only change is `guide.exclude`.
- `--version <tag>` on `cf guides install` and `cf guides update`, and a matching `version` parameter on MCP `guide_install` and `guide_update`.
- A local tarball path accepted by `--source` (install and update) and by the MCP `source` parameter. `update` gains `--source`, which it lacks today.
- Splitting `TarballStrategy.ts` (377 lines today) so it stays near the size limit after these additions.
- README `cf guides` section, `guide.exclude` key description, CHANGELOG.

**Excluded**
- Preview on `install`. A fresh install has nothing to compare against.
- Persisting a pinned version in config. `--version` applies to one call only (D4).
- Making lint directories follow `rules.exclude`, as #111 suggests. That couples cf to the guide's rules layout. If wanted, it belongs in the guide's `setup-ide-lint.sh`, which already knows both.
- `--version` for submodule or clone.
- Listing individual changed paths in the preview. Counts only, as #110 asks.

## Dependencies

### Prerequisites
- Slice 212 (`guide.exclude`, exclude record, same-version re-extract): complete.
- Slice 925 (tarball strategy surfacing, staging swap): complete.
- Slice 916 (branch guard on update): complete.

### Interfaces Required
- `parseGuideExclude` / `matchingGuidePatterns` (`packages/core/src/config/guideExclude.ts`).
- `commitPathsIfChanged` (`packages/core/src/guides/gitExec.ts`). It already accepts several paths.
- `evaluateBranchGuard` and `BranchGuardWarnError` (`packages/core/src/guides/branchGuard.ts`). Unchanged.
- `getProjectConfigPath` (`packages/core/src/config/configPaths.ts`) and the TOML reader `ConfigManager` already uses.

## Architecture

### Component Structure

```
packages/core/src/guides/
  strategies/TarballStrategy.ts   install/update orchestration: stage → preview → confirm → swap → commit
  tarballSource.ts       (new)    resolve a source into {kind: remote|local, tag} and open its archive stream
  guideTreeDiff.ts       (new)    diff two directory trees → {added, removed, changed} counts
  GuideManager.ts                 validates tarball-only options; passes version/source/confirm through
  types.ts                        TarballUpdateOptions, GuidePreview, UpdateResult additions
packages/core/src/config/guideExclude.ts   narrowed protection rule
packages/cli/src/commands/guides.ts        --version, --source on update, preview prompt
packages/mcp-server/src/tools/guideTools.ts version/source params, preview in result
```

`downloadAndExtract` turns into an archive-stream opener in `tarballSource.ts`, feeding the same gunzip and `tar.extract({ strip: 1, filter })` pipeline. Remote opens the GitHub tarball response body. Local opens `createReadStream(path)`. `decideTarballEntry` is unchanged. It already assumes one top-level archive directory, which both forms have.

### Data Flow

**Update (tarball):**

1. `GuideManager.update(opts)` resolves exclude and source, detects the install, and runs the branch guard. That order is unchanged.
2. If `opts.version` or a local source is given and the method is not tarball, throw: `--version and local --source apply to tarball installs only (this guide is installed as <method>)`.
3. `TarballStrategy.update` calls `resolveTarballSource(source, version)`:
   - Remote with no version: `fetchLatestTag()` (today's behavior).
   - Remote with a version: the same `ls-remote` tag list, and the tag must be in it. Otherwise throw, naming the tag and the newest available.
   - Local: the tag is always `LOCAL_VERSION_MARKER` (`'local'`). Combining a local source with `--version` is an error (`--version cannot be combined with a local --source; a local archive is always recorded as "local"`), because a label on an unverified archive could later be mistaken for the real release.
4. Short-circuit (remote only): the marker equals the tag and the exclude record equals the configured list, so return "already up to date" without downloading. A local source always stages, because the same `'local'` marker can name different archives.
5. Stage into `.ai-project-guide.staging` (existing).
6. `diffGuideTrees(targetDir, staging)` returns `{ added, removed, changed }`. cf's own bookkeeping files (version marker, exclude record) are ignored.
7. All three counts are zero: remove staging and return `{ unchanged: true }`. No swap, no commit.
8. If `opts.confirm` is present, call `await opts.confirm(preview)`. On `false`, remove staging and return `{ cancelled: true, preview }`. The existing guide is untouched.
9. Swap (existing rename + restore), then commit (step 10). Return the result with `preview`.
10. Commit paths: always the guide dir. Add `.context-forge.toml` when the applied exclude list changed and the config file's diff against HEAD is exclude-only (D3).

**Install (tarball):** the same source resolution (`--version`, local path). No preview step. Commit as today.

### State Management

- **Version marker** (`.context-forge-guide-version`): a remote release tag, or `local`. Read back by `detect()` and status as before. `local` compares unequal to any remote tag, so status reports an update available and a plain `cf guides update` moves to the latest remote release. That is the right default after testing a local build.
- **Exclude record**: unchanged.
- **No new config keys.** A pin is not persisted (D4).

## Technical Decisions

### Technology Choices

No new dependencies. The tree diff compares file size first, then bytes (`Buffer.equals`). The guide is a few MB, so hashing is unnecessary. The local archive goes through the same `tar` + `zlib` pipeline as the remote one.

### Patterns and Conventions

**D1: Protection rule (#111a).** `PROTECTED_GUIDE_PATHS` stays a whole-subtree rule for `scripts` and `project-guides`. One explicit carve-out is added: `EXCLUDABLE_GUIDE_SUBTREES = ['project-guides/lint']`. An entry is allowed when it sits **strictly inside** a carve-out (`project-guides/lint/csharp` is allowed, `project-guides/lint` is refused).
- Why not exclude `lint` itself: `setup-ide-lint.sh` treats a missing lint directory as an error.
- Why not exclude per-language dirs freely: the script only reads `lint/<lang>` for languages it detects in the project. Excluding the lint config for a language the project actually uses is a user mistake the guide script will report. That's acceptable.
- Rules and agents already have their own mechanisms (`rules.exclude`), so they get no carve-out.
- Why an allowlist and not "protect only what cf reads": cf reads one file (`prompt.ai-project.system.md`), but the phase guides, templates and rules are read by people, agents and `setup-ide`. A short allowlist of known-safe subtrees can't drift as the guide adds files. A list of protected files would have to track the guide's file names.
- The error names the actual conflict:
  - `guide.exclude entry "project-guides/rules" is inside project-guides, which cf requires. Only subpaths of project-guides/lint can be excluded.`
  - `guide.exclude entry "project-guides/lint" would remove the whole lint directory. Exclude individual languages instead, e.g. "project-guides/lint/<language>".`

  The placeholder is literal text, not an example value.

**D2: Confirm via callback, not throw-and-retry.** The branch guard throws and the caller re-calls with `confirmed: true`. That's cheap because it runs before any download. Re-calling after a preview would download the archive twice. `update` instead takes `confirm?: (preview: GuidePreview) => Promise<boolean>`:
- The CLI passes a prompt, unless `--yes` was given.
- MCP passes nothing, so the update proceeds and the preview is in the result. MCP has no interactive channel, and the branch guard's throw-and-retry (`confirmed`) exists only for the off-trunk question. A preview that cannot block is acceptable because the swap lands as one git commit that the caller can revert. `confirmed` answers the branch guard only and has no effect on the preview.
- A non-interactive CLI run without `--yes` behaves as the branch guard does today: `askConfirmation` reads stdin.

**D3: Committing the config change (#111b).** When the applied exclude list changes (same-version re-extract, or a version update that also changes excludes), and `.context-forge.toml` is modified, parse its HEAD version and its working version. If they differ only in `guide.exclude`, add the file to the commit paths. Otherwise leave it out and report: `.context-forge.toml has other uncommitted changes; it was left out of the guide commit`. No partial-file staging. `commitPathsIfChanged` already scopes the commit to its pathspecs, so nothing else the user staged is swept in.

**D4: Pins are per call.** `--version` changes what this install or update fetches. It is not written to config. A later plain `update` resolves latest. Reproducible team installs can come later as a `guide.version` key if needed. Nobody has asked for it, and it would need its own rules for interacting with `update`.

**D5: Local source detection.** `--source` is local when it names an existing file. Relative paths resolve against the CLI's working directory, and against the project root for MCP (the server's cwd is not meaningful to the caller). An existing path whose name doesn't end in `.tgz` or `.tar.gz` is refused: `--source <path> is a local file but not a .tgz/.tar.gz archive`. A non-existent path that looks like a path (starts with `.`, `/` or `~`, or contains a backslash) gets a "file not found" error, not the current "cannot parse GitHub owner/repo" error. An archive whose entries are not under a single top-level directory is refused, since `strip: 1` would scatter it. The extract filter records the first path segment of every entry. A second distinct segment aborts the extraction, discards staging and throws, so nothing reaches the guide directory. Paths outside the project root are allowed for the local source, in the CLI and in MCP. Both run with the user's own file access, and the archive is only read, never executed.

**D6: Two prompts, in order.** In the rare case where the branch guard warns (off-trunk update), the user is asked twice:
1. The branch question, before any download.
2. The preview, after staging.

These are different questions at different points. Merging them would force the branch guard to download first, or to change its contract. `--yes` answers both. One `update` never asks the same question twice.

**Failure modes.** Every row ends with the guide directory untouched and staging removed, except the post-swap commit failure.

| Failure | Handling |
|---|---|
| `ls-remote` fails or times out (latest or pinned) | Throw with the git error. Same as today's `fetchLatestTag`. No fallback to a cached or guessed tag. |
| Truncated or corrupt local `.tgz`, or a stream read error mid-extract | Throw naming the file. Staging removed. |
| Archive has more than one top-level directory | Abort extraction, throw (D5). |
| Swap fails | Existing restore of the previous guide runs, then throw. |
| Commit fails after the swap | Throw with the git error. The new guide is in place but uncommitted, and the message says so. No rollback, which matches today. |
| Confirm prompt at closed or non-TTY stdin (EOF) | Counts as decline: staging removed, `cancelled`. It is never an implicit yes. `--yes` is the way to run unattended. |
| `diffGuideTrees` hits an unreadable file | Throw naming the path. Symlinks are compared by link target, not followed. |
| D3: `git show HEAD:` fails (repo has no commits) | Treated as "not in HEAD": the file counts as exclude-only only when `guide.exclude` is its sole key (see Special Considerations). Any other git failure throws. |

**Errors:** All new failures throw with messages that name the flag or key involved. A non-tarball method with `--version` or a local source is an error, not a notice, because ignoring an explicit flag would silently install something other than what was asked.

## Implementation Details

### API Contracts

**CLI**

```
cf guides install [--strategy <method>] [--source <url|path.tgz>] [--version <tag>]
cf guides update  [--source <url|path.tgz>] [--version <tag>] [-y|--yes]
```

Update output when there are changes:

```
Guide update: v0.20.2 → v0.21.0
  12 added, 3 removed, 41 changed
Continue? (y/N)
```

Zero changes print `Guide is already up to date (v0.21.0).` and nothing is committed.

**MCP**
- `guide_install`: add `version?: string`. `source` documentation adds the local path form.
- `guide_update`: add `version?: string` and `source?: string`. The result gains `preview: { added, removed, changed }` (counts) whenever a staging diff ran, and `unchanged: true` when the counts are all zero.

**Core types (`types.ts`)**

```ts
export interface GuidePreview { added: number; removed: number; changed: number }
export interface TarballUpdateOptions {
  version?: string;
  confirm?: (preview: GuidePreview) => Promise<boolean>;
}
// UpdateResult additions
preview?: GuidePreview;
unchanged?: true;
cancelled?: true;
configCommitted?: boolean;  // D3: whether .context-forge.toml went into the guide commit
```

`InstallStrategy.update` and `install` gain an optional trailing `options` parameter. Submodule and clone never receive one, because `GuideManager` rejects tarball-only options first.

## Integration Points

### Provides to Other Slices
- `diffGuideTrees` is general enough for a future worktree-propagation preview. No current consumer.
- The local tarball source gives ai-project-guide a pre-release test path: `pnpm pack`-style or `git archive --prefix=ai-project-guide/` output can be installed directly.

### Consumes from Other Slices
- The branch guard (916) and the staging swap (925) are consumed unchanged.
- The `guide.exclude` parser (212) changes only in its protection rule. Existing valid values stay valid. Previously refused values under `project-guides/lint/<x>` become valid.

## Success Criteria

### Functional Requirements
- A tarball `cf guides update` with changes prints added/removed/changed counts and asks before swapping. Answering no leaves the guide and git untouched, with no staging directory left behind.
- `--yes` skips both the branch-guard question and the preview question.
- MCP `guide_update` proceeds without asking and returns `preview` counts.
- An update with zero differences does not swap or commit, and says the guide is up to date.
- `cf config set guide.exclude "project-guides/lint/csharp"` succeeds.
- `project-guides/lint` and `project-guides/rules` are refused, with the D1 messages.
- After `cf config set guide.exclude …` and `cf guides update`, the re-extract commit contains both the guide change and `.context-forge.toml`, and `git status` is clean. With other uncommitted edits in `.context-forge.toml`, the file is left out and the notice is printed.
- `--version v0.20.1` installs or updates to exactly that tag. A tag that doesn't exist fails, naming it and the newest tag.
- `--source ./ai-project-guide.tgz` installs from the file and records `local`. Adding `--version` to a local source is an error. A later plain update moves to the latest remote release.
- `--version` or a local `--source` on a submodule or clone install fails with the tarball-only error message.

### Technical Requirements
- `TarballStrategy.ts`, `tarballSource.ts` and `guideTreeDiff.ts` are each near or under 300 lines.
- Unit tests:
  - `diffGuideTrees` (added/removed/changed, bookkeeping files ignored).
  - The protection rule (allowed and refused cases, message text).
  - Source resolution (remote latest, remote pinned hit and miss, local file, local non-archive, missing path, local plus `--version` refused).
  - Failure modes: corrupt local archive, multi-top-level archive, EOF at the confirm prompt (declines).
  - The D3 exclude-only config check (exclude-only diff, mixed diff, unmodified file).
- Strategy tests with a local fixture archive, for the decline path (guide unchanged, staging removed) and the unchanged path. The local source makes these testable without network.
- `pnpm -r build`, typecheck, lint and tests all pass.
- Docs: README `cf guides` section (flags, preview, local source), the `guide.exclude` description in `ConfigKeys.ts` (lint carve-out), CHANGELOG.

### Integration Requirements
- Existing `guide.exclude` values, exclude records and version markers keep working with no migration.
- `cf guides info` reports a `local` version unchanged (displayed as-is), and reports an update as available.

### Verification Walkthrough

Verified on 20261007 against the local build with network access. Everything below ran for real; outputs are trimmed to the lines that matter.

**Setup** (isolated, so no real project list is touched). `cf` is an alias for `node packages/cli/dist/index.js`; run `pnpm -r build` first.

```
export CONTEXT_FORGE_DATA_DIR=$(mktemp -d)       # private project store
mkdir proj && cd proj && git init -q && git commit -q --allow-empty -m init
cf init --lite --name scratch                     # registers the project, installs nothing
cf guides install --version v0.20.1               # tarball is the default strategy
git add -A && git commit -q -m setup
```
Expected: `Guide installed successfully.` with `Version:  v0.20.1`, `Method:   tarball`, and a commit `docs: install ai-project-guide v0.20.1`.

1. **Exclude carve-out (#111a)**
   ```
   cf config set guide.exclude "project-guides/lint/csharp,project-guides/lint/dart"   # succeeds
   cf config set guide.exclude "project-guides/lint"
   cf config set guide.exclude "project-guides/rules"
   ```
   Expected: the first prints `Set guide.exclude = ...`. The second fails with `guide.exclude entry "project-guides/lint" would remove the whole lint directory. Exclude individual languages instead, e.g. "project-guides/lint/<language>".` The third fails with `guide.exclude entry "project-guides/rules" is inside project-guides, which cf requires. Only subpaths of project-guides/lint can be excluded.`
2. **Re-extract commit includes config (#111b)** (commit the config first so the tree is clean)
   ```
   cf config set guide.exclude "project-guides/lint/csharp"
   cf guides update --yes
   git show --stat --format=%s HEAD
   git status --short
   ls project-documents/ai-project-guide/project-guides/lint
   ```
   Expected: `Guide re-extracted with updated excludes.`; the commit is `docs: re-extract ai-project-guide v0.20.3 (guide.exclude changed)` and lists `.context-forge.toml`, the exclude record, and the deleted `lint/csharp/...` files; `git status` prints nothing; `ls` shows `dart python typescript` and no `csharp`.
   Left-out case: after a further `cf config set guide.exclude ...` plus `printf '\n[other]\nkey = 1\n' >> .context-forge.toml`, `cf guides update --yes` prints `.context-forge.toml has other uncommitted changes; it was left out of the guide commit`, the commit lists only guide files, and `git status --short` still shows ` M .context-forge.toml`.
3. **Preview and decline (#110)** (reinstall or start from v0.20.1)
   ```
   echo n | cf guides update
   cat project-documents/ai-project-guide/.context-forge-guide-version
   ls -a project-documents/ | grep staging
   cf guides update < /dev/null
   echo y | cf guides update
   cf guides update
   ```
   Expected for `n`: `Guide update: v0.20.1 → v0.20.3`, `  1 added, 0 removed, 3 changed`, `Continue? (y/N) Update cancelled; guide unchanged.`; the marker still reads `v0.20.1`, no staging directory, HEAD unchanged. The `< /dev/null` run declines the same way. `y` prints `Guide updated successfully.` with `Version:  v0.20.1 → v0.20.3`, a `Changes:` line, and commit `docs: update ai-project-guide v0.20.3`. The last run prints `Guide is already at the latest version.` with no prompt and no commit.
   Caveat: that last message comes from the remote short-circuit (installed tag equals latest, no download). The `Guide is already up to date (<version>).` message appears when a download ran and found no differences, which only happens for a local archive or a re-extract.
4. **Local tarball (#93)** (no sibling checkout needed: any single-root `.tgz` works)
   ```
   curl -sL https://api.github.com/repos/ecorkran/ai-project-guide/tarball/v0.20.3 -o /tmp/apg.tgz
   cf guides update --source /tmp/apg.tgz --yes
   cf guides info
   cf guides update --source /tmp/apg.tgz --version v0.20.1 --yes
   cf guides update --version v9.9.9
   cf guides update --source ./nope.tgz
   cf guides update --source README.md
   cf guides update
   ```
   Expected: `Version:  v0.20.3 → local`; `cf guides info` shows `Version:    local` and `Update:     v0.20.3 available`. Then, in order: `--version cannot be combined with a local --source; a local archive is always recorded as "local"`; `--version v9.9.9 not found on the remote; newest available is v0.20.3`; `--source ./nope.tgz: file not found (looked for <absolute path>)`; `--source README.md is a local file but not a .tgz/.tar.gz archive`. The final plain update prints `Version:  local → v0.20.3`.
   Caveat: when the archive's files equal the installed ones (as here), the update shows `Changes:  0 added, 0 removed, 0 changed` but still swaps and commits, because the version marker changed. With identical files *and* identical marker and exclude record it is a true no-op (`unchanged`).
5. **MCP**: with the project behind latest (`cf guides update --version v0.20.1 --yes` first), call `guide_update` with `{"projectId":"scratch"}` through the stdio server. Verified with a small client script using the SDK's `StdioClientTransport`. Result: `previousVersion v0.20.1`, `newVersion v0.20.3`, `committed true`, `preview {added:1, removed:0, changed:3}`, and the update is applied.
6. **Non-tarball**: in a project installed with `cf guides install --strategy submodule`:
   ```
   cf guides update --version v0.20.1
   cf guides update --source /tmp/apg.tgz
   ```
   Expected, for both: `Error: --version and local --source apply to tarball installs only (this guide is installed as submodule)`.

**Defect found by this walkthrough:** the root program's own `--version` swallowed `cf guides install|update --version <tag>` and printed cf's version. Fixed with `enablePositionalOptions()` on the root command; `tests/integration/guidesVersionFlag.integration.test.ts` spawns the built CLI to guard it.

### As-Built Deviations

- **Zero-diff rule (D6), PM-approved 20261007.** Zero file changes is a no-op (`unchanged`) only when the staged version marker and exclude record also equal the installed ones. Otherwise the update swaps and commits with no prompt, because nothing visible changes. Without this, a content-identical update (a `local` install followed by a plain update, or a `guide.exclude` entry that matches no file) left the marker or record stale, so status reported an update forever and every run re-downloaded.
- **`confirm` takes a second argument** `{ from, to }` (`GuideVersionChange`), because the CLI's `Guide update: <from> → <to>` header needs both versions and `GuidePreview` carries only counts. `GuidePreview` and the MCP result shape are unchanged.
- **`local` counts as older than any release** in `isNewerVersion`, so a local install reports an update as available.
- **Left-out config notice** travels as `UpdateResult.configNotice` and is emitted by `guideExcludeNotices`, so CLI stderr and MCP notices share it.

### Code Review Resolution

Resolves `user/reviews/931-review.code.tarball-guide-update-preview-exclude-fixes-version-pinning.md` (verdict CONCERNS, left as written). Fixes landed after the slice commit `b02c395`.

| Finding | Resolution |
| --- | --- |
| F001 `as` assertions | Fixed. TOML `parse()` already returns a record, so both casts are gone and `asTable` is a type guard. `as never` on `Readable.fromWeb` was unnecessary (undici's body type already matches), so it is removed with no replacement. |
| F002 positional params | Fixed for the two new functions: `resolveTarballSource` and `assertTarballOnlyOptions` take an object. `InstallStrategy.install/update` keep the trailing positional `options`, matching how every strategy method is already called. |
| F003 validation order | Fixed. In `update` the tarball-only check now runs right after detection and before the branch guard (the design's "then this check" order is superseded). Detection still runs first because the install method is only known from it. |
| F004 bare filename | Fixed. A source ending in `.tgz` or `.tar.gz` counts as a path, so `--source guide.tgz` reports "file not found". |
| F005 long CLI action | Fixed. The action delegates to `updateWithGuardPrompt` and `reportUpdateResult`; the prompt text is one `CONTINUE_PROMPT` constant. |
| F006 duplicate semver logic | Fixed. `versionTags.ts` holds the one comparator, used by `listRemoteTags` and `isNewerVersion`; the detector's separate `parseHighestTag` is gone (it uses `listRemoteTags`). |
| F007 MCP local paths | Intended, no change. D5 allows archive paths outside the project root for the MCP tools and the CLI alike; the result is still only a guide install that is committed and revertable. |
| F008 positional options | No change. `--version` is the root program's only option, and the integration test covers it. Side effect: `cf guides info -v` after the subcommand is now an unknown option rather than printing the version. |
| F009 pinned no-op message | Fixed. With `--version` given and nothing to do, the CLI prints `Guide is already at <tag>.` instead of "latest". |

## Risk Assessment

### Technical Risks
- Narrowing protection could let an exclude remove something a tool needs. D1 limits the carve-out to `project-guides/lint/<x>`, whose only reader skips languages the project doesn't use.
- Each confirm prompt leaves staging on disk while it waits. A killed process leaves `.ai-project-guide.staging` behind. Today's leftover cleanup at the start of the next stage already covers this.

### Mitigation Strategies
- Exact allowed/refused test cases for D1.
- Decline and kill-mid-prompt behavior covered by the strategy tests with a local fixture archive.

## Implementation Notes

### Development Approach
1. Extract `tarballSource.ts` (stream opener, tag resolution) from `TarballStrategy.ts` with no behavior change. Existing tests stay green.
2. Local source and `--version` in core, then the CLI/MCP wiring. The local fixture archive this produces is reused by the later tests.
3. `guideTreeDiff.ts` and the preview/confirm/unchanged flow in `TarballStrategy.update`, then the CLI prompt and the MCP result.
4. The protection carve-out and messages in `guideExclude.ts`.
5. The D3 config-commit check.
6. Docs and CHANGELOG.

### Special Considerations
- The `ls-remote` tag list already exists in `fetchLatestTag`. Pinned resolution reuses that list rather than adding a second remote call.
- The D3 parse uses `git show HEAD:.context-forge.toml`. A file that is new and not in HEAD counts as exclude-only only when `guide.exclude` is its sole key.

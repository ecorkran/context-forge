---
docType: slice-design
slice: guide-exclude-globs-for-tarball-installs
project: context-forge
parent: project-documents/user/architecture/200-slices.developer-onboarding.md
dependencies: []
interfaces: []
dateCreated: 20261003
dateUpdated: 20261003
status: complete
---

# Slice Design: guide-exclude-globs-for-tarball-installs

## Overview

A tarball install puts the whole ai-project-guide into the project, including all of `tool-guides/` and `framework-guides/`. Most projects use a few of these. This slice adds a `guide.exclude` config key: a comma-separated list of paths relative to the guide root. A tarball install or update skips every archive entry under a listed path, records the list it applied, and re-extracts when the configured list stops matching the recorded one, even when the guide version has not changed.

The feature request came from the ai-project-guide side (PM-approved 20261002).

**Placement.** The PM placed this slice in the 200 (developer onboarding) slice plan as an accepted extension. The 200 architecture treats guide install as an existing mechanism that `cf init` composes. This slice changes what that mechanism writes, not how init composes it, so the init flow and the MCP onboarding tools keep their current shape (see Integration Points).

## Value

- Projects carry only the guide content they use. Less noise in the repo, in diffs on `cf guides update`, and in what agents find when they search the guide.
- A changed exclude list takes effect on the next `cf guides update`, without waiting for a guide release.
- An exclude cannot remove what cf needs to run (`scripts/`, `project-guides/`). Setting one fails at once and names the key.
- Side benefit: tarball install and update stop deleting the existing guide before the new one is ready (see Data Flow). Today a failed download during update leaves the project with no guide.

## Technical Scope

**Included**
- New config key `guide.exclude` (shared project scope), with validation.
- One pattern parser and matcher module in core, used by config validation and by the tarball strategy.
- Tarball install and update skip matching entries. The built-in git-wiring excludes (`.gitmodules`, `.gitignore`, `project-documents`) go through the same matcher.
- An exclude record file in the guide directory, next to the version marker.
- `cf guides update` re-extracts at the same version when the configured excludes differ from the record.
- Tarball install and update extract into a staging directory and swap it into place only after everything succeeds.
- Reporting: excludes that matched nothing, excludes ignored by a non-tarball install, and the applied and pending excludes in `cf guides status`. MCP `guide_install`, `guide_update` and `guide_status` return the same information.

**Excluded**
- Submodule and clone installs. Both ignore the key and say so (see Patterns and Conventions).
- General globbing (`*` inside a segment, `?`, character classes, negation). See Technology Choices.
- Fixing links from shipped guides into excluded content. PM accepted that these links break.
- Any change to the guide repo or its `setup-ide` script.
- Any change to `cf init`'s detection logic.

## Dependencies

### Prerequisites
None. Everything this slice touches exists today.

### Interfaces Required
- `ConfigManager.get('guide.exclude')`: the existing project → user lookup.
- node-tar's `extract({ filter })`, already used by `TarballStrategy`. The filter receives the raw entry path before `strip`, so it still starts with the archive root directory (`{owner}-{repo}-{hash}/`).
- `commitPathIfChanged`, which already commits the guide directory after install and update.

## Architecture

### Component Structure

```
ConfigKeys ('guide.exclude' validate) ──> config/guideExclude.ts
                                            parseGuideExclude()
TarballStrategy (filter, record) ────────>  isExcludedGuidePath()
       ▲                                    PROTECTED_GUIDE_PATHS
       │ constructed with the parsed list
GuideManager (reads config, builds strategy, reports)
       ▲
CLI guides.ts / MCP guideTools.ts (render the result)
```

- **`packages/core/src/config/guideExclude.ts`** (new). It holds the pattern rules in one place:
  - `parseGuideExclude(raw: string): string[]` turns a config string into normalized, deduplicated, sorted patterns. It throws a `GuideExcludeError` that names `guide.exclude` and the bad entry.
  - `isExcludedGuidePath(relativePath: string, patterns: readonly string[]): string | null` returns the pattern that matched, or null. The matched pattern is what lets the strategy report patterns that matched nothing.
  - `PROTECTED_GUIDE_PATHS = ['project-guides', 'scripts']`.
  - It is a pure module with no imports from `guides/`. It lives under `config/` because `guides/` already imports from `config/` (`guides/types.ts` reads `CONFIG_KEYS`). That keeps the dependency direction guides → config, and `config/` imports nothing from the guide domain.
- **`ConfigKeys.ts`** adds `guide.exclude`. Its `validate` calls `parseGuideExclude` and returns the error message.
- **`TarballStrategy`** gets a constructor taking `exclude: readonly string[]`. `isGitWiringEntry` becomes `isSkippedTarballEntry(entryPath, exclude)`. It strips the archive root and checks the built-in `TARBALL_EXCLUDED_ENTRIES` first, then the user list, both through `isExcludedGuidePath`. The prefix logic that is inline today moves into the matcher. Install and update share one private `extractAndSwap(source, tag, targetDir)` that does the staging and swap described below.
- **`GuideManager`** resolves `guide.exclude` the same way as `guide.source`: config read errors propagate, and without a `ConfigManager` the list is empty. It passes the list to `new TarballStrategy(exclude)` in `getStrategy`, and adds the exclude fields to install, update and status results.
- **CLI `guides.ts`** and **MCP `guideTools.ts`** only render the new fields.

The `InstallStrategy` interface does not change. Only the tarball strategy knows about excludes.

### Data Flow

**Staging and swap** (`extractAndSwap`, used by every tarball install and update). This replaces today's "delete the guide directory, then download into it":
1. Remove any leftover staging or previous directory from an earlier crash. Staging is `project-documents/.ai-project-guide.staging`, and previous is `project-documents/.ai-project-guide.previous`. Both are siblings of the guide directory and never inside it.
2. Download and extract into staging with the exclude filter.
3. Write the version marker and the exclude record into staging. Staging is now complete.
4. If the guide directory exists, rename it to previous. Rename staging to the guide directory. Remove previous.
5. If the second rename fails, rename previous back and rethrow.

Any failure in steps 1–3, including a network error, a rate limit or a broken archive, throws with the guide directory untouched. The marker and record are written together before the swap, so the record can never be out of step with the version on disk. Both renames stay inside `project-documents/`, so they are same-filesystem renames.

**Install** (`cf guides install`, `cf init`, MCP `guide_install`):
1. `GuideManager` reads `guide.exclude` and parses it. A bad hand-edited value, or one that covers a protected path, throws before any download.
2. `TarballStrategy.install` runs `extractAndSwap`. The filter drops matching entries and notes which patterns matched.
3. The strategy commits as it does today.
4. The result carries `exclude` (applied list) and `unmatchedExclude` (patterns that matched no entry).

**Update** (`cf guides update`, MCP `guide_update`):
1. `GuideManager` parses the configured list as above.
2. `TarballStrategy.update` reads the version marker and the exclude record. A missing record means nothing was excluded. That is accurate for every install made before this slice.
3. Same version and same list: return early, as today.
4. Same version, different list: `extractAndSwap` the same tag with the new list. The commit message names the change (`docs: re-extract ai-project-guide v0.19.3 (guide.exclude changed)`).
5. Different version: `extractAndSwap` the new tag with the configured list, as today but without the delete-first gap.
6. The result carries `excludeChanged: true` when step 4 ran, plus `exclude` and `unmatchedExclude`.

**Commit failure.** Unchanged from today. If `commitPathIfChanged` throws, the error propagates. The new guide is already in place on disk, so the user can commit it by hand.

**Local edits in the guide directory** are replaced on update, as they are today. The directory is cf-managed, and `GUIDE_MANAGED_NOTICE` already says so in `cf guides status`.

**Status** (`cf guides status`, MCP `guide_status`): `GuideManager.status()` adds `excludeApplied` (read from the record, so it is what is actually on disk) and `excludeConfigured` (from config) to the detector's `GuideInfo`. Status never downloads anything new for this.

### State Management

The only new persistent state is the exclude record: `project-documents/ai-project-guide/.context-forge-guide-exclude`. It holds one normalized pattern per line, sorted. It is written only when the list is not empty. If it is missing, nothing is excluded. It sits inside the guide directory, so update and uninstall replace or remove it with everything else. It is committed with the guide, so a teammate's checkout shows what was excluded. The constant `EXCLUDE_RECORD_FILE` sits next to `VERSION_MARKER_FILE` in `guides/types.ts`.

A hand-deleted record on a filtered install reads as "nothing excluded", so the next update re-extracts with the configured list. That re-creates the record, so the state corrects itself.

Lists are compared as normalized, sorted arrays, so reordering or a trailing slash in config does not trigger a re-extract.

The staging and previous directories exist only while `extractAndSwap` runs, plus after a crash, until the next install or update clears them.

## Technical Decisions

### Technology Choices

**(a) Pattern form: a narrow built-in form, no new dependency.** A pattern is a guide-relative path to a file or directory. Optionally it ends in `/` or `/**`, which mean the same thing as the bare path. A pattern matches a path that equals it or starts with it plus `/`. Examples: `tool-guides`, `tool-guides/`, `tool-guides/**`, `framework-guides/react/`, `CHANGELOG.md`.

Why: the examples in the request (`tool-guides/**`, `tool-guides/some-tool/`) are all prefixes. `path.matchesGlob` needs Node 22, and the floor is 20.18.1. A glob library would add a dependency and a second set of rules for a case nobody asked for. If someone asks for `tool-guides/*-legacy/` later, the parser can grow, because unsupported characters are rejected now (see the parsing rules below) rather than read as literal text.

Rejected: adding `picomatch` or `minimatch`. Real wildcard support for an unproven need.

**(b) A changed key takes effect at the same version** through the exclude record and the comparison in update step 4. No `--force` flag. Running `cf guides update` is the natural move after changing config, and a flag would be one more thing to know.

**(c) Protected paths are refused.** A pattern is rejected when it equals, contains, or sits inside `project-guides` or `scripts`. That covers `scripts/` (cf runs `scripts/setup-ide`), the system prompt cf reads from `project-guides/`, and the templates and phase guides the process depends on. `project-guides/templates/` is refused too. An empty pattern or a bare `**` would cover everything, so both are refused. The error names the key, the entry and the protected path:
`guide.exclude entry "project-guides/templates" would remove project-guides, which cf requires.`
The check runs both when the key is set and when an install or update reads it, so a hand-edited `.context-forge.toml` cannot get around it.

**(d) Scope and syntax.** `ConfigScope.Shared` (`.context-forge.toml`, committed), like `rules.exclude`. The installed guide is committed, so its exclude list has to be shared too. Otherwise one person's update would delete files for everyone. The existing project → user lookup also makes a user-level value act as a default for projects that have not set one. That falls out of how config works and needs no code. Syntax is comma-separated, like `rules.exclude`. Unlike `rules.exclude`, cf is the consumer here, not a literal bash `case`, so parsing is lenient: each entry is trimmed, empty entries from doubled or trailing commas are dropped, and a leading `./` is removed. An empty value or the unset default means nothing is excluded.

Parsing rules, in `parseGuideExclude`:
- Normalize: trim, drop a leading `./`, drop a trailing `/**` or `/`.
- Reject: absolute paths (`/…`, `\…`, `C:`), `..` segments, any other `*`, `?`, `[` or `]`, an empty result after normalizing, and protected-path conflicts.
- Deduplicate and sort.

**(e) `cf guides status` reports excludes.** It shows an `Excluded:` line with the applied list when it is not empty. When config differs from the record it adds `guide.exclude changed — run cf guides update to apply`. For a non-tarball install with the key set, it shows `guide.exclude is set but ignored for submodule installs`.

### Patterns and Conventions

- **Non-tarball installs are never silently ignored.** If `guide.exclude` is set and the method is submodule or clone, install and update results carry `excludeIgnored: true`. The CLI prints a warning and MCP returns it through `withNotices`, the same way the deprecated-alias notice works today. Status shows it as described in (e).
- **Unmatched patterns are reported.** A pattern that matched no archive entry is almost always a typo (`tool-guide/`). It does not stop the install, because the guide may simply have dropped that folder in a new release. It is reported as a warning: `guide.exclude entry "tool-guide" matched nothing in v0.19.3`.
- **Naming.** The key is `guide.exclude`. In code, a parsed list is `exclude: readonly string[]`, the record file constant is `EXCLUDE_RECORD_FILE`, and result fields start with `exclude`.
- **Errors.** Parser errors are `GuideExcludeError` (extends `Error`). The CLI maps them to a user error. Config read errors propagate, matching how `resolveSource` handles them.

## Implementation Details

### API Contracts

New and changed result fields, in `guides/types.ts`:

```ts
interface InstallResult {   // existing fields unchanged
  exclude?: string[];            // tarball: the list applied (absent when empty)
  unmatchedExclude?: string[];   // tarball: patterns that matched no entry
  excludeIgnored?: boolean;      // non-tarball with guide.exclude set
}
interface UpdateResult {    // existing fields unchanged
  exclude?: string[];
  unmatchedExclude?: string[];
  excludeIgnored?: boolean;
  excludeChanged?: boolean;      // re-extracted at the same version
}
interface GuideInfo {       // existing fields unchanged
  excludeApplied: string[];      // from the record; [] when none or non-tarball
  excludeConfigured: string[];   // from config, parsed
}
```

MCP tools return these results as JSON, so the fields show up with no schema change. Warnings go out as notices. The CLI `--json` output for `cf guides status` gains the two `GuideInfo` fields.

CLI output when update re-extracts at the same version:

```
✓ Guide re-extracted with updated excludes.
  Version:  v0.19.3
  Excluded: framework-guides, tool-guides
```

### Database / Storage Schema

Config, in `.context-forge.toml`:

```toml
[guide]
exclude = "tool-guides/**,framework-guides"
```

Record, in `project-documents/ai-project-guide/.context-forge-guide-exclude`:

```
framework-guides
tool-guides
```

## Integration Points

### Provides to Other Slices
- `parseGuideExclude` and `isExcludedGuidePath` are available if another install path wants the same filtering later. Nothing plans to use them.
- The exclude record lets any later tooling see what an install left out.

### Consumes from Other Slices
- Config two-tier lookup and `validate` hook (existing).
- Guide install/update orchestration in `GuideManager` and the branch guard in front of update (existing, unchanged).
- **`cf init` (slice 200 initiative).** Init calls `guidesInstallAction`, so a fresh init with `guide.exclude` already set installs a filtered guide. Init skips guide install when a guide is already present ("Guides already installed — skipping"). Setting or changing `guide.exclude` on an existing project therefore takes effect only through `cf guides update`. Init's detection is unchanged. The `cf guides status` pending line tells the user to run the update.
- **Setup time.** GitHub serves the whole tarball, so the download size does not change. Filtering only cuts what gets written to disk and committed. The staging swap adds two directory renames. The onboarding target ("from `npm install` to useful context output in under two minutes") is unaffected.
- Slice 930's worktree propagation copies IDE files, not the guide. A tarball guide reaches worktrees through git, so excludes reach them the same way. Nothing to integrate.

## Success Criteria

### Functional Requirements
- `cf config set guide.exclude "tool-guides/**,framework-guides"` succeeds. After `cf guides install` with the tarball strategy, neither directory exists in the guide, and everything else does, including `scripts/setup-ide` and `project-guides/prompt.ai-project.system.md`.
- `cf config set guide.exclude scripts` fails with a message naming `guide.exclude` and `scripts`. The same holds for `project-guides`, `project-guides/templates`, `**`, `../x`, `/abs`, `tool-*`.
- A protected or malformed value written directly into `.context-forge.toml` makes install and update fail before any download, with the same message.
- At the same guide version, changing `guide.exclude` and running `cf guides update` re-extracts: newly excluded paths are gone and newly included paths come back. The output says it re-extracted, and the commit message names the exclude change.
- Running `cf guides update` again with no change prints "already at the latest version" and does not re-extract.
- Reordering entries or adding a trailing `/` does not trigger a re-extract.
- An existing tarball install with no record and no key set: update behaves exactly as before.
- A failed download or extract during update leaves the existing guide directory exactly as it was, with no staging or previous directory left behind on the next run.
- A pattern that matches nothing produces a warning naming the pattern. The install still succeeds.
- With a submodule or clone install and the key set: install, update and status each say the key is ignored. No files are filtered.
- `cf guides status` shows the applied excludes, and shows the pending-change line when config differs from the record.
- MCP `guide_install`, `guide_update` and `guide_status` return the new fields and notices.

### Technical Requirements
- `guideExclude.ts` has unit tests covering normalization, every rejection rule, protected-path checks in both directions (ancestor and descendant), and matching (exact file, directory prefix, no false prefix match such as `tool-guides` vs `tool-guides-old/x`).
- The `isGitWiringEntry` tests move to `isSkippedTarballEntry` and still pass unchanged for the built-in entries. New cases cover user patterns on raw entry paths, including the archive root prefix and directory entries ending in `/`.
- `TarballStrategy` tests cover:
  - install writes the record only when the list is not empty;
  - same-version re-extract when the record differs;
  - early return when it matches;
  - a missing record treated as an empty list;
  - unmatched-pattern reporting;
  - a download failure leaving the existing guide untouched;
  - leftover staging and previous directories cleared at the start.
- `ConfigKeys` tests cover `guide.exclude` validation.
- Keep `pnpm -r build` and all package test suites passing.
- Document the key in the config key description, and add a short README note under guide install covering the key, the pattern form, protected paths and the tarball-only limit.

### Integration Requirements
- A fresh `cf init` with a pre-set `guide.exclude` installs a filtered guide (it goes through `GuideManager.install`).
- `cf init` on a project that already has a guide still skips guide install. The new exclude list applies on `cf guides update`.
- `cf setup-ide` still works after an install with excludes, because `scripts/` is protected.

### Verification Walkthrough

Verified 20261003 against the real GitHub tarball (ai-project-guide v0.19.4). Run from scratch projects using the local build. Below, `cf` means:

```bash
CONTEXT_FORGE_DATA_DIR=<scratch>/cfdata node <repo>/packages/cli/dist/index.js
```

The global `cf` is the published build and will not have the key. `CONTEXT_FORGE_DATA_DIR` keeps the scratch projects and user-level config out of your real project store. Each scratch project starts with `git init -q && git commit -q --allow-empty -m init`.

1. **Set up a tarball project.** PASS.
   ```bash
   cf init --strategy tarball
   ls project-documents/ai-project-guide        # framework-guides/ and tool-guides/ present
   git log --oneline -1                         # docs: install ai-project-guide v0.19.4
   ```
2. **Refused excludes.** PASS. Each exits 1:
   ```bash
   cf config set guide.exclude scripts
   # Error: Config key "guide.exclude" validation failed: guide.exclude entry "scripts" would remove scripts, which cf requires.
   cf config set guide.exclude project-guides/templates
   # ... guide.exclude entry "project-guides/templates" would remove project-guides, which cf requires.
   cf config set guide.exclude 'tool-*'
   # ... guide.exclude entry "tool-*" uses a wildcard that is not supported — only a trailing "/" or "/**" is allowed.
   ```
3. **Apply excludes at the same version.** PASS.
   ```bash
   cf config set guide.exclude "tool-guides/**, framework-guides,"
   cf guides info      # "guide.exclude changed — run cf guides update to apply"
   cf guides update
   # Guide re-extracted with updated excludes.
   #   Version:  v0.19.4
   #   Excluded: framework-guides, tool-guides
   #   Commit:   committed (not pushed)
   ls project-documents/ai-project-guide        # no framework-guides/, no tool-guides/
   cat project-documents/ai-project-guide/.context-forge-guide-exclude   # framework-guides, tool-guides
   git log --oneline -1   # docs: re-extract ai-project-guide v0.19.4 (guide.exclude changed)
   ```
   The commit removed 50 files (about 10,300 lines).
4. **No-op update.** PASS. `cf guides update` prints "Guide is already at the latest version." and `git log` shows no new commit.
5. **Un-exclude one path.** PASS. `cf config set guide.exclude framework-guides`, then `cf guides update`, which re-extracts. `tool-guides/` is back and `framework-guides/` is gone.
6. **Typo warning.** PASS. `cf config set guide.exclude tool-guide`, then `cf guides update`. It re-extracts and exits 0. stderr shows `guide.exclude entry "tool-guide" matched nothing in v0.19.4`, and nothing is excluded. `cf guides info` then shows `Excluded:   tool-guide`, which is the applied record.
7. **Failure leaves the guide intact.** PASS, tested two ways:
   - Unreachable source. Run `cf config set guide.source https://github.invalid/nobody/none.git`, change `guide.exclude`, then `cf guides update`. It exits 1 at `git ls-remote` with `Could not resolve host: github.invalid` plus the network hint. The guide listing is unchanged.
   - Download failure after tag resolution. This exercises the staging path. Run `HTTPS_PROXY=http://127.0.0.1:9 GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=http.proxy GIT_CONFIG_VALUE_0="" cf guides update`. git skips the dead proxy, and the tarball download uses it. It exits 1 with `Downloading guide tarball from https://api.github.com/repos/ecorkran/ai-project-guide/tarball/v0.19.4 via proxy (HTTPS_PROXY) failed: fetch failed: connect ECONNREFUSED 127.0.0.1:9`. The guide listing and `.context-forge-guide-exclude` are unchanged, and `ls -a project-documents` shows no staging directory.
   - Leftover cleanup. Create `project-documents/.ai-project-guide.staging/junk` and `project-documents/.ai-project-guide.previous/` by hand, then run `cf config unset guide.source` and `cf guides update`. It succeeds, and `ls -a project-documents` shows only `ai-project-guide` and `user`.
   - Caveat: `NO_PROXY=github.com` does not work as a git-only bypass. undici also applies it to `api.github.com`, so the download skips the proxy and succeeds.
8. **Still works.** PASS. `cf setup-ide claude` and `cf build` both exit 0 with excludes applied.
9. **Non-tarball.** PASS. In a second scratch project, run `cf init --strategy submodule`, then `cf config set guide.exclude tool-guides`. `cf guides info` shows `guide.exclude is set but ignored for submodule installs`. `cf guides update` prints "already at the latest version" and the same warning on stderr. `tool-guides/` is still present.
10. **Hand-edit guard.** PASS. Set `exclude = "scripts"` under `[guide]` in `.context-forge.toml`. Then `cf guides update` and `cf guides info` each exit 1 with only `guide.exclude entry "scripts" would remove scripts, which cf requires.` (no stack trace), before any network call.
11. **Fresh init with the key pre-set.** PASS. In a fresh scratch project, write `.context-forge.toml` with `[guide]` and `exclude = "tool-guides"`, then run `cf init --strategy tarball`. It exits 0, `project-documents/ai-project-guide/tool-guides` does not exist, and the exclude record contains `tool-guides`. With `exclude = "scripts"` pre-set instead, init prints `Guides install failed: guide.exclude entry "scripts" would remove scripts, which cf requires.` and downloads nothing.

## Implementation Notes

### Development Approach
1. `config/guideExclude.ts` and its tests (parser, matcher, protected paths). No I/O, easy to test exhaustively.
2. `guide.exclude` in `ConfigKeys` plus validation tests.
3. `TarballStrategy`: `extractAndSwap` first, with tests for the failure cases. Then the constructor, `isSkippedTarballEntry`, record write/read, same-version re-extract and unmatched tracking. Update the existing tests.
4. `GuideManager`: resolve the key, pass it to the strategy, add `excludeIgnored`, augment `status()`.
5. CLI and MCP rendering, then README and the key description.
6. Run the verification walkthrough against the real GitHub tarball.

Effort: 2/5.

### Special Considerations
- The filter sees raw paths that still include the archive root. The matcher works on guide-relative paths, so `isSkippedTarballEntry` strips the root first, exactly as `isGitWiringEntry` does today.
- Re-extract at the same version downloads the tarball again. That is one request against the 60/hour unauthenticated GitHub limit, the same cost as a normal update.
- Excluding content can break links inside shipped guides, such as a project guide linking into `tool-guides/`. PM accepted this. The README note says so.

### Review Resolution

Responses to `212-review.slice.guide-exclude-globs-for-tarball-installs.md` (CONCERNS):

- **F001 (re-extract failure modes):** addressed. Install and update now go through a staging directory, written in full (marker and record included) before an atomic swap. Commit failure and local edits behave as today, and both are now stated. See Data Flow.
- **F002 (placement in the 200 plan):** addressed. The PM placed the slice there as an accepted extension. See Overview.
- **F003 (init interaction, setup-time target):** addressed. See Integration Points: init skips existing guides, and download size is unchanged.
- **F004 (config → guides dependency):** addressed. The parser moved to `config/guideExclude.ts`, so the dependency runs guides → config only.
- **F005 (missing record):** no change. A missing record is accurate for old installs, and a hand-deleted one corrects itself on the next update.

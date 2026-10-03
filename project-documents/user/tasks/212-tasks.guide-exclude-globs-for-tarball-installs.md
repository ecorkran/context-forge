---
docType: tasks
slice: guide-exclude-globs-for-tarball-installs
project: context-forge
lld: user/slices/212-slice.guide-exclude-globs-for-tarball-installs.md
dependencies: []
projectState: main is at a891d4e, ahead of origin and not pushed; published version is 0.18.3; slice 930 is merged but not released. Tarball install today deletes the guide directory and then downloads into it, and update returns early when the version is unchanged. The 212 design passed review (CONCERNS), and every finding is resolved in its Review Resolution section.
dateCreated: 20261003
dateUpdated: 20261003
status: not_started
---

## Context Summary

- Working on slice 212. It adds a `guide.exclude` config key, so tarball
  installs and updates skip guide paths the project does not want
  (typically most of `tool-guides/` and `framework-guides/`).
- Decisions (a)–(e) in the slice design are settled. Do not reopen them.
  In short:
  - (a) Narrow pattern form, no new dependency. A pattern is a
    guide-relative path. A trailing `/` or `/**` is the same as the bare
    path. A pattern matches a path that equals it or starts with it plus
    `/`. Any other `*`, `?`, `[` or `]` is rejected.
  - (b) An exclude record file next to the version marker. Update
    re-extracts at the same version when the configured list differs from
    the record. No `--force`.
  - (c) `project-guides` and `scripts` are protected. So are an empty
    pattern and `**`. The check runs at `config set` and again whenever
    install or update reads the key.
  - (d) `ConfigScope.Shared`, comma-separated, lenient parsing.
  - (e) `cf guides status` shows the applied list, a pending-change line,
    and an ignored line for non-tarball installs.
- Read the design's Architecture, Data Flow, Technical Decisions and API
  Contracts sections before Part 3. They define the staging and swap
  steps, the exact messages, and the result fields. This file points to
  them rather than repeating them.
- Dependencies: none. This is entry 12 of the 200 slice plan, which has no
  further numbered entries after it.

**Key files**
- `packages/core/src/guides/strategies/TarballStrategy.ts` (239 lines):
  `TARBALL_EXCLUDED_ENTRIES`, `isGitWiringEntry`, `install`, `update`, and
  `downloadAndExtract` (the tar `filter` is at the end).
- `packages/core/src/guides/GuideManager.ts` (385 lines, already over the
  ~300-line target): `status` (line 45), `install` (59), `update` (188),
  `resolveSource` (325), and `getStrategy` (375).
- `packages/core/src/guides/types.ts`: `GuideInfo` (111), `InstallResult`
  (143), `UpdateResult` (169), `VERSION_MARKER_FILE` (225), and
  `guideMethodDeprecationMessage` (54), which shows how a shared message
  is built.
- `packages/core/src/config/ConfigKeys.ts`: the `rules.exclude` entry
  (line 145) is the closest model for the new key.
- `packages/cli/src/commands/guides.ts`: `showStatus`,
  `guidesInstallAction`, and the update action (around line 250).
- `packages/mcp-server/src/tools/guideTools.ts`: `guide_install` already
  uses `withNotices` for the deprecation notice. Copy that pattern.

**Tests**
- `packages/core/tests/guides/strategies/TarballStrategy.test.ts` mocks
  `fs`, `tar`, `stream/promises`, `undici` and `gitExec` at file scope.
  Staging tests stay in this file. Add the fs functions you need
  (`renameSync`, `rmSync`) to the existing `vi.mock('fs', …)` factory and
  assert call order. Do not create real temp directories here.
- New pure-module tests go in `packages/core/tests/config/guideExclude.test.ts`.

**Testing note:** use the local build (`node packages/cli/dist/index.js`).
The global `cf` is the published npm package and will not have the key.

---

## Tasks

### Part 0 — Branch

- [ ] **Task 0: Create the slice branch** (effort: 1)
  - [ ] Run `cf config get git.integration_branch`. If it prints a value,
        STOP and ask the Project Manager. This plan assumes it is empty,
        so the target is `main`.
  - [ ] From a clean `main`, run
        `git checkout -b 212-slice.guide-exclude-globs-for-tarball-installs main`.
        If the branch already exists, switch to it instead.
  - [ ] Success criteria: `git branch --show-current` prints the branch
        name, and the working tree is clean.

### Part 1 — Pattern module (design step 1)

- [ ] **Task 1: Implement `config/guideExclude.ts`** (effort: 2)
  - [ ] Create `packages/core/src/config/guideExclude.ts`. It is a pure
        module and imports nothing from `guides/`. Exports:
    1. `PROTECTED_GUIDE_PATHS = ['project-guides', 'scripts'] as const`.
    2. `class GuideExcludeError extends Error`.
    3. `parseGuideExclude(raw: string): string[]`.
    4. `isExcludedGuidePath(relativePath: string, patterns: readonly string[]): string | null`.
  - [ ] `parseGuideExclude` follows the "Parsing rules" list under design
        decision (d):
    1. Split on `,`. For each entry: trim, then drop it if empty (this
       handles doubled and trailing commas).
    2. Normalize: drop a leading `./`, then a trailing `/**`, then a
       trailing `/`.
    3. Reject an absolute path (starting with `/` or `\`, or with a drive
       prefix like `C:`), any `..` segment, any remaining `*`, `?`, `[`
       or `]`, and an entry that is empty after normalizing. A bare `**`
       falls under the wildcard rule.
    4. Reject protected-path conflicts in both directions: the pattern
       equals a protected path, sits inside one
       (`project-guides/templates`), or contains one (a pattern that is an
       ancestor of a protected path).
    5. Deduplicate and sort.
    6. An empty string returns `[]`.
  - [ ] Every error message starts with `guide.exclude entry "<entry>"`
        and says what is wrong. For a protected path, use the exact form
        from decision (c):
        `guide.exclude entry "project-guides/templates" would remove project-guides, which cf requires.`
  - [ ] `isExcludedGuidePath` takes a guide-relative path with any
        trailing `/` removed. It returns the first pattern `p` where
        `path === p` or `path.startsWith(p + '/')`, or `null` if none
        match.
  - [ ] Export all four from `packages/core/src/config/index.ts`, and make
        sure they reach the package's public index the same way
        `CONFIG_KEYS` does.
  - [ ] Success criteria: `pnpm --filter @context-forge/core build`
        passes.

- [ ] **Task 2: Test `guideExclude.ts`** (effort: 2)
  - [ ] Create `packages/core/tests/config/guideExclude.test.ts` and
        cover:
    1. Normalization: `tool-guides`, `tool-guides/`, `tool-guides/**`,
       `./tool-guides`, and `" tool-guides "` all give `['tool-guides']`.
    2. Lenient list: `"tool-guides/**, framework-guides,"` gives
       `['framework-guides', 'tool-guides']`. So does the same input with
       a doubled comma.
    3. Dedupe and sort: `"b,a,b/"` gives `['a', 'b']`.
    4. Rejections, each checking that the message names `guide.exclude`
       and the entry: `/abs`, `\abs`, `C:/x`, `../x`, `a/../b`, `tool-*`,
       `a?b`, `[ab]`, `**`, and `./`.
    5. Protected paths: `scripts`, `scripts/setup-ide`, `project-guides`,
       `project-guides/templates`, and `project-guides/**` are all
       refused. Each message names the protected path.
    6. Not protected: `scripts-old` and `project-guides-archive` are
       accepted (no false prefix match).
    7. The empty string gives `[]`.
    8. Matching: an exact file (`CHANGELOG.md`), a directory prefix
       (`tool-guides/x/y.md` matches `tool-guides`), the directory itself
       (`tool-guides`), no false prefix (`tool-guides-old/x` does not
       match `tool-guides`), and the matched pattern is returned.
  - [ ] Success criteria: the new test file passes.
  - [ ] Commit: `feat(core): add guide.exclude pattern parser and matcher`

### Part 2 — Config key (design step 2)

- [ ] **Task 3: Add `guide.exclude` to `ConfigKeys`** (effort: 1)
  - [ ] Add the key next to the other `guide.*` keys: `type: 'string'`,
        `default: ''`, `scope: ConfigScope.Shared`.
  - [ ] `validate`: return `'must be a string'` for non-strings. Otherwise
        call `parseGuideExclude`, return `null` on success, and return the
        `GuideExcludeError` message on failure. Rethrow anything that is
        not a `GuideExcludeError`.
  - [ ] Write the `description`. It must cover: comma-separated
        guide-relative paths, a trailing `/` or `/**` allowed, no other
        wildcards, `project-guides` and `scripts` protected, tarball
        installs only, and changes applying on `cf guides update`.
  - [ ] Success criteria: core builds.

- [ ] **Task 4: Test the config key** (effort: 1)
  - [ ] In `packages/core/tests/config/ConfigKeys.test.ts`, add cases:
        `''` is valid, `"tool-guides/**,framework-guides"` is valid,
        `scripts` returns a message containing `scripts`, and `tool-*`
        returns a message. Check that the scope is Shared.
  - [ ] Success criteria: the ConfigKeys tests pass, and the
        ConfigManager tests still pass.
  - [ ] Commit: `feat(core): add guide.exclude config key`

### Part 3 — TarballStrategy (design step 3)

- [ ] **Task 5: Add `EXCLUDE_RECORD_FILE` and the result fields** (effort: 1)
  - [ ] In `guides/types.ts`, add
        `EXCLUDE_RECORD_FILE = '.context-forge-guide-exclude'` next to
        `VERSION_MARKER_FILE`. Give it a one-line doc comment saying the
        record is written only when the list is not empty.
  - [ ] Add the optional fields from the design's API Contracts to
        `InstallResult` (`exclude`, `unmatchedExclude`, `excludeIgnored`)
        and to `UpdateResult` (the same three plus `excludeChanged`). Each
        gets a short doc comment. Leave `GuideInfo` for Task 11.
  - [ ] Success criteria: core builds with no other changes.

- [ ] **Task 6: Replace delete-then-download with `extractAndSwap`** (effort: 3)
  - [ ] In `TarballStrategy`, add a private
        `extractAndSwap(source, tag, targetDir, exclude)` that follows the
        design's "Staging and swap" steps 1–5 exactly. Define staging and
        previous paths as siblings of `targetDir`:
        `join(dirname(targetDir), '.ai-project-guide.staging')` and
        `join(dirname(targetDir), '.ai-project-guide.previous')`. Define
        the two suffixes once, as constants.
  - [ ] Change `downloadAndExtract` to extract into the directory it is
        given (staging). Writing the version marker moves into
        `extractAndSwap`, before the swap.
  - [ ] Point `install` and `update` at `extractAndSwap`. Remove the
        `rmSync(targetDir)` from `update`.
  - [ ] In this task, `exclude` is accepted but not yet used for
        filtering. The filter still calls `isGitWiringEntry`, and no
        record is written yet.
  - [ ] Success criteria: core builds, and the existing TarballStrategy
        tests pass (update their fs mocks or expectations where the write
        target moved from `targetDir` to staging).

- [ ] **Task 7: Test staging and swap** (effort: 2)
  - [ ] In `TarballStrategy.test.ts`, add `renameSync` (and `rmSync` if
        it is missing) to the `fs` mock, then cover:
    1. A successful update runs these in order: clear leftover staging
       and previous, extract into staging, write the marker into staging,
       rename the guide to previous, rename staging to the guide, remove
       previous.
    2. A download failure (`undiciFetch` rejects) throws, and neither
       `renameSync` nor any `rmSync` on `targetDir` is called.
    3. If the second rename throws, the guide is renamed back from
       previous and the error is rethrown.
    4. A first install (the guide directory does not exist) skips the
       first rename.
  - [ ] Success criteria: the TarballStrategy tests pass.
  - [ ] Commit: `fix(core): stage tarball guide extract and swap into place`

- [ ] **Task 8: Filter by `exclude`, write and read the record** (effort: 3)
  - [ ] Add `constructor(private readonly exclude: readonly string[] = [])`.
        The empty default is the real meaning of "nothing excluded", not
        a placeholder. `GuideManager` always passes the parsed list.
  - [ ] Replace `isGitWiringEntry` with exported
        `isSkippedTarballEntry(entryPath, exclude): string | null`. Strip
        the archive root and a leading `./` as today, plus a trailing `/`.
        Check `TARBALL_EXCLUDED_ENTRIES` first, then `exclude`, both
        through `isExcludedGuidePath`. Return the matched pattern or
        `null`. The archive-root entry itself (an empty relative path) is
        never skipped.
  - [ ] In `extractAndSwap`, the tar filter records every user pattern
        that matched in a `Set`. After extract, `unmatchedExclude` is the
        list of patterns not in the set.
  - [ ] Write the record into staging next to the marker (sorted, one per
        line, trailing newline), only when `exclude` is not empty.
  - [ ] `update`: read the record from `targetDir`. A missing file means
        `[]`. Parse its lines with the same normalization (reuse
        `parseGuideExclude` on the lines joined with `,`). Then follow
        design Update steps 3–5: return early only when the version and
        the list both match. A same-version mismatch re-extracts the same
        tag and commits with
        `docs: re-extract ai-project-guide ${tag} (guide.exclude changed)`.
  - [ ] Set `exclude` (only when not empty), `unmatchedExclude` (only when
        not empty) and `excludeChanged` (only on a same-version
        re-extract) on the results.
  - [ ] Check the file length. If `TarballStrategy.ts` goes well past
        ~300 lines, move the download helpers (`describeRateLimit`,
        `activeProxyEnvVars`, `parseGitHubOwnerRepo`) to a sibling
        `tarballDownload.ts` in a separate commit. Do not split it
        otherwise.
  - [ ] Success criteria: core builds.

- [ ] **Task 9: Test filtering and the record** (effort: 2)
  - [ ] Rename the `isGitWiringEntry()` describe block to
        `isSkippedTarballEntry()`. The existing cases for the built-in
        entries keep the same verdicts: truthy where they were `true`,
        `null` where they were `false`.
  - [ ] Add matcher cases on raw entry paths: `${root}/tool-guides/`
        (a directory entry) and `${root}/tool-guides/x/y.md` both return
        `'tool-guides'`, `${root}/tool-guides-old/x` returns `null`, and
        `${root}/` returns `null`.
  - [ ] Add strategy cases:
    1. Install with `exclude` writes the record to staging. Install
       without it writes no record.
    2. Same version, same record: early return, no download, no commit.
    3. Same version, different record: re-extracts, `excludeChanged:
       true`, and the commit message contains `(guide.exclude changed)`.
    4. A missing record with no excludes configured: early return
       (behaves as before).
    5. A record that differs only in order or a trailing `/`: early
       return.
    6. A pattern no entry matches appears in `unmatchedExclude`. Drive
       this through the mocked `extract` filter.
  - [ ] Success criteria: the TarballStrategy tests pass.
  - [ ] Commit: `feat(core): apply guide.exclude in tarball install and update`

### Part 4 — GuideManager (design step 4)

- [ ] **Task 10: Resolve the key and pass it to the strategy** (effort: 2)
  - [ ] Add a private `resolveExclude(): Promise<string[]>` modeled on
        `resolveSource`. Without a `ConfigManager`, return `[]`. Otherwise
        read `guide.exclude`, throw if the value is not a string, and
        return `parseGuideExclude(value)`. Config read errors and
        `GuideExcludeError` propagate.
  - [ ] In `install` and `update`, resolve the exclude list before any
        strategy call, so a bad hand-edited value fails before
        downloading. Pass it to `getStrategy`, which passes it to
        `new TarballStrategy(exclude)`.
  - [ ] For submodule and clone, when the list is not empty, set
        `excludeIgnored: true` on the result. Do not filter anything.
  - [ ] Success criteria: core builds.

- [ ] **Task 11: Add exclude fields to `status()`** (effort: 2)
  - [ ] Add `excludeApplied: string[]` and `excludeConfigured: string[]`
        to `GuideInfo`, as documented in the design's API Contracts.
  - [ ] `GuideDetector.detect` keeps building everything except these two
        fields. Change its return type to
        `Omit<GuideInfo, 'excludeApplied' | 'excludeConfigured'>`, under a
        named alias in `types.ts`, and fix the resulting type errors.
  - [ ] `GuideManager.status()` adds `excludeConfigured` (from
        `resolveExclude`) and `excludeApplied`. `excludeApplied` comes
        from the record when the method is `tarball`; otherwise it is
        `[]`. Read the record through one helper shared with
        `TarballStrategy.update`, exported from `TarballStrategy.ts` (for
        example `readExcludeRecord(targetDir)`), so the parsing lives in
        one place.
  - [ ] Success criteria: core builds, and `pnpm -r build` passes. CLI
        and MCP compile with the new required fields.

- [ ] **Task 12: Test GuideManager** (effort: 2)
  - [ ] In `GuideManager.test.ts`, add:
    1. `install` with a tarball strategy constructs it with the parsed
       list. Use the file's existing strategy-mocking approach.
    2. `install` and `update` with `guide.exclude = "scripts"` reject
       with the protected-path message before any strategy method runs.
    3. A submodule install and update with the key set return
       `excludeIgnored: true`. With it unset, the field is absent.
    4. `status()` returns `excludeConfigured` from config and
       `excludeApplied` from the record, and returns
       `excludeApplied: []` for a submodule install.
  - [ ] Success criteria: core tests pass.
  - [ ] Commit: `feat(core): resolve guide.exclude in GuideManager and status`

### Part 5 — Shared messages, CLI and MCP (design step 5)

- [ ] **Task 13: Add a shared exclude-notice builder** (effort: 1)
  - [ ] In `guides/types.ts`, next to `guideMethodDeprecationMessage`, add
        `guideExcludeNotices(result: { method; exclude?; unmatchedExclude?; excludeIgnored?; newVersion?; version? }): string[]`.
        It returns:
    1. One line per unmatched pattern:
       `guide.exclude entry "<p>" matched nothing in <version>`.
    2. When `excludeIgnored` is set:
       `guide.exclude is set but ignored for <method> installs`.
  - [ ] CLI and MCP both use this function, so the wording lives in one
        place.
  - [ ] Add unit tests in `packages/core/tests/guides/types.test.ts`.
  - [ ] Success criteria: core tests pass.

- [ ] **Task 14: CLI rendering** (effort: 2)
  - [ ] `guidesInstallAction`: after the existing lines, print
        `Excluded:` with the comma-joined `result.exclude` when it is
        present. Print each `guideExcludeNotices` line with `warn` to
        stderr, the same way the deprecation warning is printed.
  - [ ] The update action: when `excludeChanged` is set, print
        `✓ Guide re-extracted with updated excludes.` and the
        `Version:`/`Excluded:` lines shown in the design's API Contracts,
        instead of the "already at the latest version" line. Print the
        notices the same way as for install.
  - [ ] `showStatus` (text mode, installed): if `excludeApplied` is not
        empty, print an `Excluded:` line. If the method is tarball and the
        sorted `excludeConfigured` differs from `excludeApplied`, print
        `guide.exclude changed — run cf guides update to apply` with
        `warn`. If the method is not tarball and `excludeConfigured` is
        not empty, print the ignored message. `--json` needs no change,
        because the fields come through `GuideInfo`.
  - [ ] Map `GuideExcludeError` to the CLI's existing user-error output
        (message only, no stack). Follow how `guides.ts` already reports
        errors from `manager.install`/`update`.
  - [ ] Success criteria: the CLI builds.

- [ ] **Task 15: Test CLI rendering** (effort: 2)
  - [ ] In `packages/cli/tests/commands/guides.test.ts`, add cases:
        install prints `Excluded:` and an unmatched warning, update with
        `excludeChanged` prints the re-extract line, status prints the
        applied, pending and ignored lines, and status `--json` includes
        both new fields.
  - [ ] Success criteria: the CLI tests pass.
  - [ ] Commit: `feat(cli): report guide.exclude in guides install, update, status`

- [ ] **Task 16: MCP rendering** (effort: 1)
  - [ ] In `guideTools.ts`, `guide_install` passes the deprecation notice
        plus `guideExcludeNotices(result)` to `withNotices`. `guide_update`
        wraps its result in `withNotices` with
        `guideExcludeNotices(result)`. `guide_status` needs no change
        beyond the new fields.
  - [ ] Add cases to `packages/mcp-server/tests/guideTools.test.ts`: an
        unmatched pattern and `excludeIgnored` each produce a notice, and
        `guide_status` JSON includes `excludeApplied` and
        `excludeConfigured`.
  - [ ] Success criteria: the MCP tests pass.
  - [ ] Commit: `feat(mcp): surface guide.exclude notices in guide tools`

### Part 6 — Docs and verification (design step 6)

- [ ] **Task 17: README note** (effort: 1)
  - [ ] Under "Choosing a guide install strategy" in `README.md`, add a
        short `guide.exclude` subsection covering: the key and an example,
        the pattern form, the protected paths, tarball only, changes
        applying on `cf guides update`, and that links into excluded
        content break.
  - [ ] Success criteria: the README renders cleanly and the example
        matches the real syntax.
  - [ ] Commit: `docs: document guide.exclude in README`

- [ ] **Task 18: Full build and test pass** (effort: 1)
  - [ ] Run `pnpm -r build`, then the test suites for all packages.
  - [ ] Success criteria: everything passes. Fix any failures before
        moving on.

- [ ] **Task 19: Run the verification walkthrough** (effort: 2)
  - [ ] Run steps 1–10 of the design's Verification Walkthrough against
        the real GitHub tarball, using
        `node packages/cli/dist/index.js` in place of `cf`. Use a scratch
        directory under the session scratchpad rather than `/tmp`.
  - [ ] For step 7, point `guide.source` at an unreachable GitHub-style
        URL, so you do not have to take the network down.
  - [ ] Note each step's actual output in the slice design's
        Verification Walkthrough. Mark a step that cannot be run with the
        reason; do not mark it as passing.
  - [ ] Success criteria: every step behaves as the design says, or a
        deviation is fixed (with a test) or reported to the Project
        Manager.
  - [ ] Commit: `docs: record slice 212 verification results`

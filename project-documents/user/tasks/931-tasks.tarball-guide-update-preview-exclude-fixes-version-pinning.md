---
docType: tasks
slice: tarball-guide-update-preview-exclude-fixes-version-pinning
project: context-forge
lld: user/slices/931-slice.tarball-guide-update-preview-exclude-fixes-version-pinning.md
dependencies: [212, 916, 925]
projectState: main is clean at 1fb0fb5; published version is 0.19.1. TarballStrategy.ts is 377 lines and owns tag lookup, download, extract, staging swap and commit. The 931 design passed review (concerns addressed). cf guides update has no preview, no --version, and no --source; guide.exclude refuses the whole project-guides tree and the re-extract commit omits .context-forge.toml.
dateCreated: 20261006
dateUpdated: 20261007
status: in_progress
---

## Context Summary

- Working on slice 931: three changes to the tarball install/update path.
  Closes GitHub #110 (preview before swap), #111 (two `guide.exclude`
  defects) and #93 (`--version`, local tarball `--source`).
- Decisions D1–D6 in the slice design are settled. Do not reopen them. This
  file references the design rather than repeating it. Read **Data Flow**,
  **Technical Decisions** (D1–D6 and the Failure modes table) and **API
  Contracts** before the task that implements each.
- Everything is tarball-only. Submodule and clone keep today's behavior; a
  tarball-only flag passed to them is an explicit error, never ignored.
- Dependencies: slices 212, 916, 925 (all complete). Next planned slice:
  none scheduled (900 maintenance initiative stays in progress).

**Key files** (all paths under `packages/`)
- `core/src/guides/strategies/TarballStrategy.ts` (377 lines): `install`,
  `update`, `extractAndSwap`, `fetchLatestTag`, `downloadAndExtract`.
- `core/src/guides/GuideManager.ts` (421 lines): `install(strategyOverride,
  sourceOverride)` and `update(opts?: { confirmed })`.
- `core/src/guides/types.ts`: `InstallStrategy`, `UpdateResult`.
- `core/src/guides/gitExec.ts`: `commitPathsIfChanged` (several paths).
- `core/src/config/guideExclude.ts`: `PROTECTED_GUIDE_PATHS`,
  `GuideExcludeError`, `parseGuideExclude`.
- `core/src/config/ConfigKeys.ts` (line ~42): `guide.exclude` description.
- `cli/src/commands/guides.ts` (327 lines): install (line ~219) and update
  (line ~268) commands; `withYesOption` already exists in `options.ts`.
- `mcp-server/src/tools/guideTools.ts`: `guide_install`, `guide_update`.
- Existing tests: `core/tests/guides/strategies/TarballStrategy.test.ts`
  (mocks `fs`, `tar`, `gitExec`), `core/tests/config/guideExclude.test.ts`,
  `core/tests/guides/GuideManager.test.ts`, `cli/tests/commands/guides.test.ts`,
  `mcp-server/tests/guideTools.test.ts`.

**Testing notes**
- Use the local build (`node packages/cli/dist/index.js`); the global `cf`
  is the published npm package.
- `TarballStrategy.test.ts` mocks `fs` and `tar`. New tests that need real
  archives and real temp directories go in new files (real `fs`, temp dirs
  under `os.tmpdir()` via `fs.mkdtempSync`), since `vi.mock` is file-scoped.
- Test file layout for new files in `core/tests/guides/`:
  `tarballSource.test.ts`, `guideTreeDiff.test.ts`,
  `tarballStrategyLocal.test.ts` (real-fs strategy tests),
  `configExcludeCommit.test.ts`; plus a shared fixture helper
  `helpers/guideArchiveFixture.ts` (Task 2).

---

## Tasks

### Part 0 — Branch

- [x] **Task 0: Create the slice branch** (effort: 1)
  - [x] Run `cf config get git.integration_branch`. If it prints a value,
        STOP and ask the Project Manager. The plan assumes it is empty and
        the target is `main`.
  - [x] From a clean `main`, run
        `git checkout -b 931-slice.tarball-guide-update-preview-exclude-fixes-version-pinning main`.
        If the branch already exists, switch to it instead.
  - [x] Success: `git branch --show-current` prints the slice branch name.

### Part 1 — Extract tarballSource.ts (no behavior change)

- [x] **Task 1: Extract archive opening and tag lookup** (effort: 3)
  - [x] Create `core/src/guides/tarballSource.ts`. Move into it, unchanged in
        behavior: `PROXY_ENV_VARS`, `activeProxyEnvVars`, `describeRateLimit`,
        `parseGitHubOwnerRepo`, the tag-list half of `fetchLatestTag`, and the
        HTTP half of `downloadAndExtract` (URL, proxy hint, error wrapping,
        rate-limit message, dispatcher close).
  - [x] Shape the move so the tag list is a separate exported function
        (`listRemoteTags(source)`, newest first) and the latest tag is its
        first element. Design "Special Considerations": pinned resolution
        reuses this one list, with no second remote call.
  - [x] Add an exported stream opener that returns a Node `Readable` of the
        raw `.tar.gz` bytes for a remote tag. `TarballStrategy` keeps the
        `pipeline(stream, createGunzip(), extract({ cwd, strip: 1, filter }))`
        part. The dispatcher must still be closed after the pipeline ends, so
        return an object `{ stream, close }` or accept a callback; choose one
        and use it consistently.
  - [x] Re-export `activeProxyEnvVars`, `describeRateLimit` and
        `parseGitHubOwnerRepo` from `TarballStrategy.ts` (or update imports in
        `core/src/guides/index.ts` and existing tests) so no importer breaks.
  - [x] Success: `pnpm -r build` and the existing
        `TarballStrategy.test.ts` pass with **no edits to test assertions**
        (import paths may change). `TarballStrategy.ts` is under ~300 lines.

- [x] **Task 1T: Tests for the moved helpers** (effort: 2)
  - [x] Create `core/tests/guides/tarballSource.test.ts`. Move the
        `describeRateLimit`, `activeProxyEnvVars` and `parseGitHubOwnerRepo`
        describe blocks out of `TarballStrategy.test.ts` into it (copy, then
        delete the originals once green).
  - [x] Add a test for `listRemoteTags`: given mocked `gitExec` stdout with
        several tags plus a non-semver tag, it returns only semver tags sorted
        newest first; a tag-less remote returns an empty array.
  - [x] Success: all tests pass; no test lost (count before vs after).

- [x] **Task 1C: Commit** — `refactor(core): extract tarballSource from TarballStrategy`

### Part 2 — Local tarball source and --version (core)

- [x] **Task 2: Local-archive fixture helper** (effort: 2)
  - [x] Create `core/tests/guides/helpers/guideArchiveFixture.ts`. It builds a
        real `.tgz` in a temp dir using `tar.create` with a single top-level
        directory (`ai-project-guide/`) containing a small file set (at least:
        `project-guides/lint/csharp/a.txt`, `project-guides/lint/python/b.txt`,
        `project-guides/rules/r.md`, `scripts/s.sh`). Parameters: file map and
        optional second top-level directory (for the multi-root case).
  - [x] Export a helper that also writes a deliberately truncated copy of an
        archive (for the corrupt case).
  - [x] Success: a short self-test (`guideArchiveFixture.test.ts`) extracts the
        fixture with `tar.extract({ strip: 1 })` and finds the expected files.

- [x] **Task 3: Source resolution** (effort: 3)
  - [x] In `tarballSource.ts` add `resolveTarballSource(source, version?,
        projectRoot)` returning a discriminated union
        `{ kind: 'remote'; tag } | { kind: 'local'; path; tag: 'local' }`.
        Add `LOCAL_VERSION_MARKER = 'local'` as the single definition (put it
        beside `VERSION_MARKER_FILE` in `types.ts`).
  - [x] Remote, no version: newest tag from `listRemoteTags` (error
        `Could not determine latest version from remote.` if empty).
  - [x] Remote with version: tag must be in the list; otherwise throw naming
        the requested tag and the newest available tag.
  - [x] Local detection per D5: a source is local when it names an existing
        file. Relative paths resolve against `projectRoot` argument (callers
        pass CLI cwd or the project root). Existing path not ending in `.tgz`
        or `.tar.gz` → throw `--source <path> is a local file but not a
        .tgz/.tar.gz archive`. Non-existent path that starts with `.`, `/`
        or `~`, or contains a backslash → "file not found" error naming the
        path (not the GitHub owner/repo parse error). Paths outside the
        project root are allowed.
  - [x] Local plus `version` → throw `--version cannot be combined with a
        local --source; a local archive is always recorded as "local"`.
  - [x] Add the local stream opener: `createReadStream(path)`; a read error
        mid-stream must surface naming the file (wrap in the pipeline step in
        Task 4).
  - [x] Success: function is pure apart from `existsSync`/`gitExec`; builds.

- [x] **Task 3T: Source resolution tests** (effort: 2)
  - [x] In `tarballSource.test.ts` (temp dirs for local cases, mocked
        `gitExec` for remote): remote latest; remote pinned hit; remote
        pinned miss (message names tag and newest); local `.tgz`; local
        `.tar.gz`; existing non-archive file; missing path-like source;
        owner/repo URL still parsed as remote; local plus version refused;
        relative local path resolved against the given root.
  - [x] Success: all pass; each error message asserted by its flag/key text.

- [x] **Task 4: Types and source/version wiring in TarballStrategy** (effort: 3)
  - [x] Add `TarballUpdateOptions { version?; confirm? }` and extend
        `InstallStrategy.install/update` with an optional trailing `options`
        parameter in `types.ts` (design: Core types). Add `GuidePreview`,
        and the `UpdateResult` fields `preview`, `unchanged`, `cancelled`,
        `configCommitted` now so later tasks only fill them in.
  - [x] `TarballStrategy.install` and `.update` call `resolveTarballSource`
        and use its tag for the marker, commit message and result.
  - [x] `extractAndSwap` takes the resolved source (not a URL + tag) and
        opens the stream via `tarballSource`.
  - [x] Short-circuit "already up to date" only for remote sources (design
        Data Flow step 4). A local source always stages.
  - [x] Success: build passes; existing `TarballStrategy.test.ts` still
        passes (update its mocks only where the call shape changed).

- [x] **Task 4T: Strategy tests with a real local archive** (effort: 2)
  - [x] Create `core/tests/guides/tarballStrategyLocal.test.ts` (real fs, temp
        project dir with a `project-documents/` folder; mock only `gitExec`/
        `commitPathsIfChanged`).
  - [x] Cases: local install records marker `local` and extracts the files;
        local update over an existing guide swaps it; local update with the
        same marker still stages (not short-circuited).
  - [x] Local-marker status (design Integration Requirements): after a local
        install, `TarballStrategy.detect()` returns version `local`;
        `GuideManager` status/info for that install reports an update
        available when the latest remote tag is mocked; a following plain
        update (no `source`, remote mocked via `gitExec` and a stubbed stream
        opener) records the latest remote tag, not `local`.
  - [x] Success: all pass.

- [x] **Task 4B: Archive error handling and multi-root guard** (effort: 3)
  - [x] Wrap the extract pipeline so a gunzip, tar or read error throws
        naming the archive (file path for local, URL for remote), after
        staging is removed.
  - [x] Multi-top-level guard (D5): the extract filter records the first path
        segment of every entry; a second distinct segment aborts extraction,
        removes staging and throws `Archive must contain a single top-level
        directory`.
  - [x] Success: build passes; existing tests still pass.

- [x] **Task 4BT: Archive failure tests** (effort: 2)
  - [x] In `tarballStrategyLocal.test.ts`: corrupt (truncated) archive throws
        naming the file, staging removed, existing guide untouched;
        multi-top-level archive throws, staging removed, guide untouched.
  - [x] Success: all pass; `ls` of the temp project shows no
        `.ai-project-guide.staging` after any failure case.

- [x] **Task 4C: Commit** — `feat(core): add local tarball source and version pinning to TarballStrategy`

### Part 3 — GuideManager validation and CLI/MCP wiring for source and version

- [x] **Task 5: GuideManager passes options through and validates** (effort: 3)
  - [x] `GuideManager.install(strategyOverride, sourceOverride, options?)`
        and `update(opts?)` accept `version` and `source`. `update` gains the
        `source` override (today it only calls `resolveSource()`).
  - [x] After detection (update) or strategy resolution (install): if a
        version is given, or the source is local, and the method is not
        `tarball`, throw `--version and local --source apply to tarball
        installs only (this guide is installed as <method>)`. Update order
        from design step 1 is unchanged: exclude, source, detect, branch
        guard, then this check. For install the check runs before anything
        is downloaded.
  - [x] Tarball-only options are never passed to Submodule/Clone strategies.
  - [x] Pass `projectPath` as the local-path resolution root for MCP callers;
        the CLI passes `process.cwd()` through an explicit option so the two
        do not share a hidden default.
  - [x] Success: builds; no change for callers that pass no new options.

- [x] **Task 5T: GuideManager tests** (effort: 2)
  - [x] In `GuideManager.test.ts`: version on a submodule install throws the
        tarball-only message; local source on a clone install throws; version
        on a tarball install reaches the strategy; `update` with `source`
        override reaches the strategy; no new options leaves existing calls
        unchanged.
  - [x] Success: all pass.

- [x] **Task 6: CLI flags `--version` and `--source`** (effort: 2)
  - [x] `cf guides install`: add `--version <tag>`; update the `--source`
        help text to `<url|path.tgz>`.
  - [x] `cf guides update`: add `--source <url|path.tgz>` and `--version
        <tag>`.
  - [x] Pass `process.cwd()` as the local-path root. Print the resulting
        version in the existing success line.
  - [x] Success: `node packages/cli/dist/index.js guides update --help` lists
        both flags.

- [x] **Task 6T: CLI tests** (effort: 2)
  - [x] In `cli/tests/commands/guides.test.ts` (follow its existing mock
        style): flags are forwarded to `GuideManager`; a thrown
        tarball-only error is printed as a failure with non-zero exit.
  - [x] Success: all pass.

- [x] **Task 7: MCP parameters `version` and `source`** (effort: 2)
  - [x] `guide_install`: add `version?: string`; document the local path form
        in the `source` description.
  - [x] `guide_update`: add `version?: string` and `source?: string`.
  - [x] Local relative paths resolve against the project root (D5).
  - [x] Success: tool schemas list the new parameters.

- [x] **Task 7T: MCP tests** (effort: 2)
  - [x] In `mcp-server/tests/guideTools.test.ts`: parameters reach
        `GuideManager`; the tarball-only error comes back as a tool error.
  - [x] Success: all pass.

- [x] **Task 7C: Commit** — `feat: add --version and local --source to guide install/update`

### Part 4 — Tree diff, preview, confirm

- [ ] **Task 8: guideTreeDiff.ts** (effort: 3)
  - [ ] Create `core/src/guides/guideTreeDiff.ts` exporting
        `diffGuideTrees(currentDir, stagingDir): Promise<GuidePreview>`.
  - [ ] Walk both trees by relative path. `added` = only in staging,
        `removed` = only in current, `changed` = in both and different
        (size compared first, then bytes via `Buffer.equals`).
  - [ ] Ignore cf's own bookkeeping files (`VERSION_MARKER_FILE`,
        `EXCLUDE_RECORD_FILE`) — reference the constants, do not restate
        names.
  - [ ] Symlinks are compared by link target, not followed. An unreadable
        file throws naming the path. A missing `currentDir` (first install
        path) is not an error: everything counts as added.
  - [ ] Success: file under ~150 lines, no dependencies added.

- [ ] **Task 8T: Tree diff tests** (effort: 2)
  - [ ] Create `core/tests/guides/guideTreeDiff.test.ts` with real temp
        trees: identical → all zero; one added; one removed; one changed
        with same size; one changed with different size; bookkeeping files
        differ only → zero; symlink retargeted counts as changed; unreadable
        file throws naming the path (skip on Windows if mode bits are
        unsupported).
  - [ ] Success: all pass.

- [ ] **Task 9: Preview, confirm, unchanged flow in TarballStrategy.update** (effort: 4)
  - [ ] After staging, call `diffGuideTrees(targetDir, staging)` (design
        steps 5–9). All zero → remove staging, return `{ success: true,
        unchanged: true, preview }` with no swap and no commit.
  - [ ] If `options.confirm` is present, `await` it. `false` → remove staging
        and return `{ cancelled: true, preview }`; the guide is untouched.
  - [ ] No `confirm` (MCP) → proceed; the result carries `preview`.
  - [ ] Staging is removed on every exit path, including a throw from
        `confirm`.
  - [ ] Keep `TarballStrategy.ts` near 300 lines: if it grows past that,
        move staging helpers (`siblingPath`, `restorePrevious`) into a
        sibling module `tarballSwap.ts`.
  - [ ] Success: builds; existing tests pass.

- [ ] **Task 9T: Preview flow tests** (effort: 3)
  - [ ] In `tarballStrategyLocal.test.ts`: changes found → `confirm`
        receives the counts; confirm `true` → swapped and committed, result
        has `preview`; confirm `false` → `cancelled`, guide bytes unchanged,
        no staging directory, `commitPathsIfChanged` not called; identical
        archive → `unchanged`, no swap, no commit; no `confirm` provided →
        proceeds with `preview` in result; `confirm` that throws → staging
        removed and error propagates.
  - [ ] Success: all pass.

- [ ] **Task 10: GuideManager confirm pass-through and CLI prompt** (effort: 3)
  - [ ] `GuideManager.update` accepts `confirm` and forwards it to the
        strategy (tarball only; `GuideManager` never sends it to others).
  - [ ] CLI update: build `confirm` from the existing `askConfirmation`
        helper (the one the branch guard uses), skipped when `--yes`. Print
        the header and counts exactly as in the design's API Contracts, then
        `Continue? (y/N)`.
  - [ ] EOF or closed stdin at the prompt counts as decline (D6, Failure
        modes). Verify what `askConfirmation` does on EOF; if it can resolve
        true or hang, fix it in that helper.
  - [ ] `--yes` answers both the branch-guard question and the preview
        question (D6). The two prompts remain separate, in that order.
  - [ ] Print `Guide is already up to date (<version>).` for `unchanged`, and
        a plain "Update cancelled; guide unchanged." for `cancelled`.
  - [ ] Success: manual run against the Task 2 fixture archive shows the
        prompt; answering `n` leaves the guide and git unchanged.

- [ ] **Task 10T: CLI preview tests** (effort: 2)
  - [ ] In `guides.test.ts`: prompt shown with counts; `--yes` skips it;
        decline prints the cancelled line; `unchanged` prints the up-to-date
        line; EOF on stdin declines. Branch-guard-warn plus preview asks two
        questions in order, and `--yes` asks none.
  - [ ] Success: all pass.

- [ ] **Task 11: MCP preview in result** (effort: 1)
  - [ ] `guide_update` passes no `confirm`; the result includes `preview`
        counts when a diff ran and `unchanged: true` when all zero. `confirmed`
        still answers only the branch guard.
  - [ ] Success: builds; result shape matches the design's API Contracts.

- [ ] **Task 11T: MCP preview tests** (effort: 1)
  - [ ] In `guideTools.test.ts`: assert `preview` counts and `unchanged: true`
        appear in the result, and that `confirmed: true` has no effect on the
        preview.
  - [ ] Success: all pass.

- [ ] **Task 11C: Commit** — `feat: preview guide changes before tarball update swap`

### Part 5 — guide.exclude fixes (#111)

- [ ] **Task 12: Narrow the protection rule (D1)** (effort: 3)
  - [ ] In `guideExclude.ts` add `EXCLUDABLE_GUIDE_SUBTREES =
        ['project-guides/lint']`. An entry inside a protected path is allowed
        only when it sits **strictly inside** a carve-out
        (`project-guides/lint/csharp` allowed; `project-guides/lint` refused).
        `scripts` and everything else under `project-guides` stay refused.
  - [ ] Replace the single error with the two D1 messages: the "inside
        project-guides, which cf requires. Only subpaths of
        project-guides/lint can be excluded" form, and the "would remove the
        whole lint directory" form. The `<language>` placeholder is literal
        text in the message.
  - [ ] Derive the allowed-subpath text in the message from the constant;
        do not restate the path.
  - [ ] Update the `guide.exclude` description in `ConfigKeys.ts` to mention
        the lint carve-out.
  - [ ] Success: builds; existing valid values still parse.

- [ ] **Task 12T: Protection rule tests** (effort: 2)
  - [ ] In `guideExclude.test.ts`: allowed — `project-guides/lint/csharp`,
        `project-guides/lint/csharp/**`-style nested entry, a list mixing
        two lint languages. Refused with the exact message — 
        `project-guides/lint`, `project-guides/lint/` (trailing slash),
        `project-guides/rules`, `project-guides`, `scripts`, `scripts/x.sh`.
  - [ ] Update any existing test that asserted the old "would remove
        project-guides" text.
  - [ ] Success: all pass, including `ConfigKeys.test.ts`.

- [ ] **Task 13: Exclude-only config check and commit paths (D3)** (effort: 4)
  - [ ] Add a helper (new file `core/src/guides/configExcludeCommit.ts`) that
        decides whether `.context-forge.toml` is "exclude-only modified":
        read the working file and `git show HEAD:.context-forge.toml`, parse
        both with the TOML reader `ConfigManager` uses, and compare
        everything except `guide.exclude`. Locate the file with
        `getProjectConfigPath`.
  - [ ] Outcomes: unmodified → not added; exclude-only diff → add; any other
        difference → not added and report the notice `.context-forge.toml has
        other uncommitted changes; it was left out of the guide commit`.
  - [ ] File not in HEAD (no commits, or new file): counts as exclude-only
        only when `guide.exclude` is its sole key. Any other `git show`
        failure throws (design Failure modes).
  - [ ] In `TarballStrategy.update`, when the applied exclude list changed
        (same-version re-extract, or version update that also changes
        excludes), pass `[GUIDE_RELATIVE_PATH, configPath]` to
        `commitPathsIfChanged` when the helper says add. Set
        `configCommitted` in the result and surface the notice string.
  - [ ] CLI and MCP print/return the notice when present.
  - [ ] Success: builds; the commit message wording is unchanged.

- [ ] **Task 13T: D3 tests** (effort: 3)
  - [ ] Create `core/tests/guides/configExcludeCommit.test.ts` using a real
        temp git repo (`git init`, set a local user): exclude-only diff → add;
        mixed diff → leave out with notice; unmodified → not added; new file
        with only `guide.exclude` → add; new file with other keys → leave out.
  - [ ] Add a strategy test in `tarballStrategyLocal.test.ts` with a real temp
        git repo: after changing `guide.exclude` and updating, `git show --stat
        HEAD` lists both the guide dir and `.context-forge.toml`, and `git
        status --porcelain` is empty. With an extra unrelated edit in the
        config, the file is left out and a file the user pre-staged is not
        swept into the commit.
  - [ ] Success: all pass.

- [ ] **Task 13C: Commit** — `fix(core): narrow guide.exclude protection and commit config with re-extract`

### Part 6 — Docs, verification, release notes

- [ ] **Task 14: Documentation** (effort: 2)
  - [ ] README `cf guides` section: `--version`, `--source` (URL or local
        `.tgz`) on install and update, `--yes`, the preview output, the
        `local` version marker behavior, and that these apply to tarball
        installs only.
  - [ ] README `guide.exclude` description: the `project-guides/lint/<language>`
        carve-out and the config-file commit behavior.
  - [ ] CHANGELOG entry under the unreleased heading, listing #110, #111,
        #93. Do not bump versions (release is a separate step; the PM picks
        the bump).
  - [ ] Success: each flag in `guides --help` output is documented in README.

- [ ] **Task 14C: Commit** — `docs: document guide update preview, lint excludes, and version pinning`

- [ ] **Task 15: Full validation and walkthrough** (effort: 3)
  - [ ] Run `pnpm -r build`, then typecheck, lint, and the full test suite
        once each. Fix any failure. Do not weaken or delete existing tests.
  - [ ] Check file sizes: `TarballStrategy.ts`, `tarballSource.ts`,
        `guideTreeDiff.ts` each near or under ~300 lines.
  - [ ] Walk the design's **Verification Walkthrough** steps 1–6 in a scratch
        project with the local build. Steps needing the network (pinned
        remote versions, step 3) are run if network is available; otherwise
        run the local-archive steps and report the rest as not run to the PM.
  - [ ] Success: all commands green; walkthrough results reported, including
        anything skipped.

- [ ] **Task 15C: Final commit on the slice branch** — `chore: finalize slice 931`
  - [ ] Confirm `git status` is clean and the work is committed on the slice
        branch. Stop here; integration happens in Phase 7 after code review.

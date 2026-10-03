---
docType: tasks
slice: prune-stale-guide-files-in-worktrees
project: context-forge
lld: user/slices/930-slice.prune-stale-guide-files-in-worktrees.md
dependencies: [929]
projectState: main is clean at 6fa3d73; published version is 0.18.3. propagateToWorktrees in setup-ide.ts (300 lines) only adds and overwrites files in worktrees, so files the guide stops shipping linger there. The guide (vendored 0.19.3) writes .context-forge/<target>.manifest and prunes at the root. The 930 design passed two reviews (CONCERNS), all findings resolved; D2 confirmed by the PM.
dateCreated: 20261003
dateUpdated: 20261003
status: not_started
---

## Context Summary

- Working on slice 930: make worktree propagation prune guide files the
  guide no longer ships, using the guide's own rule. Closes the cf side of
  GitHub #103.
- Decisions D1–D5 in the slice design are settled. Do not reopen them while
  implementing. In short:
  - D1: cf diffs manifests itself, with a TypeScript POSIX `cksum`. No
    shelling out, and no test runs the guide script.
  - D2: baseline = worktree's manifest ∪ root's manifest read *before* the
    script runs. Deletion needs an exact CRC and size match. No baseline →
    delete nothing, still seed the manifest.
  - D3: cf writes no `.gitignore`.
  - D4: no root manifest after the script → copy only, one notice per run.
  - D5: generated prompt sweep is driven by a new descriptor field
    `generatedPromptDirs` (copilot only), marker check, no checksum.
- Read the design's Architecture, Technical Decisions, and Patterns and
  Conventions sections before Part 2. They define containment, the
  empty-dir depth rule, error handling, the temp manifest name, and the
  exact output lines. This file references them rather than repeating them.
- Dependency: slice 929 (complete). Next planned slice: 212 (guide exclude
  globs for tarball installs).

**Key files**
- `packages/cli/src/commands/setup-ide.ts`: `TARGETS`, markers,
  `setupIdeAction` (declined prompt `return;` around line 164),
  `propagateToWorktrees` (line 212), command action (line 288).
- `packages/cli/src/commands/ideTargets.ts`: leaf module (43 lines).
- `packages/cli/src/commands/init.ts`: imports `setupIdeAction`; does not
  propagate. Leave its behavior unchanged.
- `packages/cli/tests/commands/setup-ide.test.ts` (1025 lines). It mocks
  `node:fs`, `node:child_process`, and `node:readline` at file scope.
  Propagation tests are at lines 771–1025.
- `.context-forge/claude.manifest`: the real manifest, used as a fixture.

**Test file layout.** `vi.mock` is file-scoped, so tests that need real
temp directories cannot share a file with the mocked-fs tests:
- `installManifest.test.ts`: real fs (reads the repo manifest).
- `worktreePropagation.test.ts`: the moved mocked-fs propagation tests.
- `worktreePrune.test.ts`: real temp dirs (`fs.mkdtempSync` under
  `os.tmpdir()`) for prune, sweep, and end-to-end propagation.

**Testing note:** use the local build (`node packages/cli/dist/index.js`).
The global `cf` is the published npm package and won't show your changes.

---

## Tasks

### Part 0 — Branch

- [ ] **Task 0: Create the slice branch** (effort: 1)
  - [ ] Run `cf config get git.integration_branch`. If it prints a value,
        STOP and ask the Project Manager. The plan assumes it is empty and
        the target is `main`.
  - [ ] From a clean `main`, run
        `git checkout -b 930-slice.prune-stale-guide-files-in-worktrees main`.
        If the branch already exists, switch to it instead.
  - [ ] Success criteria: `git branch --show-current` prints the branch
        name, and the working tree is clean.

### Part 1 — Characterization (design step 0)

- [ ] **Task 1: Assert the propagation header and count lines** (effort: 1)
  - [ ] In `setup-ide.test.ts`, in the existing `propagateToWorktrees`
        direct tests, add assertions that `console.log` output contains
        `→ propagating to worktree: <name> (<path>)` once per real worktree,
        and `Propagated to N worktree(s).` with the right N and plural form
        (`worktree` for 1, `worktrees` otherwise).
  - [ ] Do not change any source file in this task.
  - [ ] Success criteria: the setup-ide test file passes with the new
        assertions against today's code.
  - [ ] Commit: `test: pin worktree propagation header and count output`

### Part 2 — Install manifest module

- [ ] **Task 2: Implement `cksum`** (effort: 2)
  - [ ] Create `packages/cli/src/commands/installManifest.ts`. Header
        comment: the manifest format and CRC are an interface with the
        guide; a guide change to either is a breaking change for cf
        (design, Special Considerations).
  - [ ] Export `cksum(buffer: Buffer): number` implementing POSIX `cksum`
        exactly as D1 describes: CRC-32, polynomial `0x04C11DB7`, MSB-first,
        initial value 0, then the byte length appended least significant
        byte first using only as many bytes as needed, then complemented.
        Return an unsigned 32-bit value. Build the 256-entry table once at
        module load.
  - [ ] Success criteria: `pnpm --filter @context-forge/cli build` passes.

- [ ] **Task 2a: `cksum` tests** (effort: 2)
  - [ ] Create `packages/cli/tests/commands/installManifest.test.ts`.
  - [ ] Real-fixture test first: read the repo's
        `.context-forge/claude.manifest`, and for each line read the listed
        file from the repo root and assert `cksum` equals the recorded CRC
        and the byte length equals the recorded size. Resolve the repo root
        from the test file's location, not from `process.cwd()`. Fail if
        the manifest has zero lines.
  - [ ] Empty buffer: expect `4294967295` (`printf '' | cksum`).
  - [ ] A buffer longer than 255 bytes, so the length needs two or more
        bytes. Get the expected CRC by running the system `cksum` once while
        writing the test, and hard-code it with a comment showing the
        command used. The test itself must not shell out.
  - [ ] Success criteria: the new test file passes.

- [ ] **Task 3: Implement manifest parsing and reading** (effort: 2)
  - [ ] In `installManifest.ts`, export:
    1. `MANIFEST_DIR = '.context-forge'` and
       `manifestPath(root, target)` → `<root>/.context-forge/<target>.manifest`.
    2. `ManifestEntry` type: `{ crc: number; size: number; path: string }`.
    3. `parseManifestLine(line)`: per the design's Component Structure.
       Split on the first two runs of whitespace so the rest of the line
       (spaces included) is the path; trim trailing whitespace; return
       `null` for a blank line; throw on a line without a numeric CRC and
       size.
    4. `readManifest(root, target)`: returns `null` when the file is
       missing, `[]` for an empty file, otherwise the parsed entries. A
       malformed line throws a `UserError` naming the manifest path and the
       1-based line number. Open only the exact `<target>.manifest` path.
  - [ ] Handle "missing" by catching `ENOENT` specifically, with a comment
        saying a missing manifest is the old-guide case. Rethrow everything
        else.
  - [ ] Success criteria: build passes; the file stays well under ~300
        lines.

- [ ] **Task 3a: Parsing and reading tests** (effort: 2)
  - [ ] In `installManifest.test.ts`, test `parseManifestLine` on:
        a real line copied from `.context-forge/claude.manifest`; a path
        with spaces; trailing whitespace and `\r`; a blank line (→ `null`);
        a malformed line (non-numeric CRC, missing size) → throws.
  - [ ] Test `readManifest` with a temp dir: missing file → `null`; empty
        file → `[]`; two valid lines → two entries; a malformed second
        line → `UserError` whose message contains the path and `2`; a stray
        `.claude.manifest.tmp` next to a missing manifest → still `null`.
  - [ ] Also call `readManifest` on the repo root for `claude` and assert
        a non-empty result (real-input check per the parsing rules).
  - [ ] Success criteria: the test file passes.
  - [ ] Commit: `feat: add install manifest reader and POSIX cksum`

### Part 3 — Extraction (no behavior change)

- [ ] **Task 4: Move target descriptors and markers to `ideTargets.ts`**
      (effort: 1)
  - [ ] Move `TargetDescriptor`, `TARGETS`, `MANAGED_MARKER`,
        `MANAGED_BEGIN_MARKER`, and `MANAGED_MARKERS` (with their comments)
        from `setup-ide.ts` into `ideTargets.ts`.
  - [ ] Re-export them from `setup-ide.ts`, following the existing
        `ideTargets` re-export line (line 22), so current importers and
        tests keep working.
  - [ ] `ideTargets.ts` must not import from `setup-ide.ts`.
  - [ ] Success criteria: build passes and all cli tests pass unchanged.
  - [ ] Commit: `refactor(cli): move IDE target descriptors to ideTargets`

- [ ] **Task 5: Move `propagateToWorktrees` to `worktreePropagation.ts`**
      (effort: 2)
  - [ ] Create `packages/cli/src/commands/worktreePropagation.ts` and move
        `propagateToWorktrees` and its doc comment there unchanged. It
        imports from `ideTargets.ts` only, never from `setup-ide.ts`.
  - [ ] The command action in `setup-ide.ts` imports it from the new
        module.
  - [ ] Move the propagation tests (`setup-ide.test.ts` lines 771–1025,
        both describe blocks) into
        `packages/cli/tests/commands/worktreePropagation.test.ts`. Copy over
        only the mocks and fixtures those tests need. The copilot block
        drives the command action, so it needs the same store, fs,
        child_process, and readline mocks.
  - [ ] Change only import paths in the moved tests, not assertions.
  - [ ] Grep `packages/*/src` and `packages/*/tests` for
        `propagateToWorktrees`. Re-export it from `setup-ide.ts` only if
        something outside `setup-ide.ts` and the new test file still
        imports it from there; otherwise don't.
  - [ ] Success criteria: build passes; all cli tests pass; `setup-ide.ts`
        is under 300 lines (`wc -l`).
  - [ ] Commit: `refactor(cli): extract worktree propagation module`

### Part 4 — Prune

- [ ] **Task 6: Implement `pruneStaleFiles`** (effort: 3)
  - [ ] In `worktreePropagation.ts`, export
        `pruneStaleFiles(worktreePath, baselineEntries, newRootEntries)`
        returning `{ removed: string[], kept: string[] }`. No printing.
  - [ ] Stale paths = baseline paths not in the new root's paths. Skip a
        stale path that doesn't exist in the worktree.
  - [ ] For each candidate, in this order (design, Patterns and
        Conventions):
    1. Containment: skip (and add to `kept`) a path that is absolute,
       has a `..` segment, or whose parent directory's realpath is not
       inside the worktree's realpath.
    2. `lstat`: a symlink or non-regular file goes to `kept`.
    3. Read the file, compute `cksum` and size. If they match *any*
       baseline entry for that path, delete it immediately, then remove
       empty parent directories while the relative directory has at least
       three segments. Otherwise add to `kept`.
  - [ ] `kept` carries enough to print the right warning per reason
        (containment, non-regular, edited). Keep the shape simple, e.g. a
        reason field; the edited-file message is the design's `Kept ...`
        line.
  - [ ] No try/catch. Filesystem errors, including `EACCES`, propagate.
  - [ ] Success criteria: build passes; the function is about 50 lines or
        less (split a helper out if needed).

- [ ] **Task 6a: `pruneStaleFiles` tests** (effort: 3)
  - [ ] Create `packages/cli/tests/commands/worktreePrune.test.ts` using
        real temp dirs; remove them in `afterEach`. Build manifest entries
        from the seeded files with `cksum` so the fixtures are exact.
  - [ ] Cases:
    1. Dropped, unedited file → removed.
    2. Dropped, edited file → kept, and still on disk.
    3. File not in any baseline → untouched.
    4. File still in the new root manifest → untouched.
    5. Baseline has two entries for one path (worktree and root
       snapshot); the file matches the second → removed.
    6. Containment: `../outside.md` and an absolute path → kept, and a
       sentinel file outside the worktree survives.
    7. Symlinked directory: `.claude/agents` in the worktree is a symlink
       to a dir outside it holding a matching file → kept, outside file
       survives.
    8. Stale path is a symlink to a matching file → kept; stale path is a
       directory → kept.
    9. Empty dirs: removing `.claude/skills/old/SKILL.md` removes
       `.claude/skills/old` but not `.claude/skills`.
  - [ ] Success criteria: the new tests pass, and all cli tests pass.
  - [ ] Commit: `feat: prune stale guide files in worktrees by checksum`

### Part 5 — Wiring

- [ ] **Task 7: Propagate only when the guide script ran** (effort: 1)
  - [ ] `setupIdeAction` returns `Promise<boolean>`: `false` on the
        declined-prompt path, `true` after the script runs. A non-zero
        script exit still throws its `UserError`.
  - [ ] In the command action, skip propagation and command install when it
        returns `false`. `init.ts` ignores the return value; leave it alone.
  - [ ] Success criteria: build passes.

- [ ] **Task 7a: Tests for skipped propagation** (effort: 1)
  - [ ] In `worktreePropagation.test.ts` (it already has the command-action
        mocks), add: user answers `n` at the overwrite prompt → no
        `cpSync`/`copyFileSync` into any worktree and no
        `→ propagating to worktree:` line; guide script exits non-zero →
        same, and the error is reported.
  - [ ] Success criteria: the tests pass, and all cli tests pass.
  - [ ] Commit: `fix: skip worktree propagation when setup-ide is declined`

- [ ] **Task 8: Baseline snapshot, prune call, notice, manifest copy**
      (effort: 3)
  - [ ] Command action: read `rootBaseline = readManifest(root, target)`
        *before* calling `setupIdeAction`, and pass it to
        `propagateToWorktrees(project, target, rootBaseline)`.
  - [ ] In `propagateToWorktrees`, following the design's Data Flow:
    1. Read `newRoot` after the existing worktree filter and empty-list
       return. If `newRoot` is `null`, run the copy loop as today, print the
       D4 notice once (exact text in D4), and return.
    2. Per worktree, after the copy loop: baseline = worktree manifest
       entries plus `rootBaseline` entries (either may be `null`). If both
       are `null`, skip pruning.
    3. Call `pruneStaleFiles` and print the design's `Removed ...` and
       `Kept ...` lines under the worktree header, plus a one-line warning
       for containment and non-regular skips.
    4. Last step per worktree: copy the root manifest to
       `.context-forge/.<target>.manifest.tmp` in the worktree, then rename
       it to `<target>.manifest`. Create `.context-forge/` if missing.
  - [ ] The final `Propagated to N worktree(s).` line is unchanged.
  - [ ] Moved mocked-fs tests: give them the new third argument. If they
        break because `readManifest` reads through the mocked `fs`, make the
        mock report the manifest as missing for them (the D4 path, which is
        today's copy-only behavior). Do not loosen their existing
        assertions.
  - [ ] Success criteria: build passes; existing tests pass; the file is
        under ~300 lines.

- [ ] **Task 8a: End-to-end propagation tests** (effort: 3)
  - [ ] In `worktreePrune.test.ts`, call `propagateToWorktrees` on a real
        temp root plus one temp worktree, with a `ProjectData` fixture
        registering it. Cases:
    1. Worktree has a manifest; root drops a path → file removed,
       `Removed ... (no longer installed by the guide)` printed.
    2. D2: worktree has no manifest, `rootBaseline` lists the dropped
       path → removed, and the worktree manifest is seeded.
    3. Neither baseline → nothing deleted, manifest seeded.
    4. D4: no root manifest → files copied, nothing deleted, notice
       printed once with two worktrees registered.
    5. Empty root manifest (`[]`) → not the D4 case: no notice, and the
       worktree manifest is copied as an empty file.
    6. After every non-D4 case, the worktree manifest is byte-identical
       to the root's, and no `.<target>.manifest.tmp` remains.
  - [ ] Success criteria: the tests pass, and all cli tests pass.
  - [ ] Commit: `feat: carry install manifest into worktrees after pruning`

- [ ] **Task 9: Generated prompt sweep** (effort: 2)
  - [ ] Add `GENERATED_MARKER = '<!-- context-forge:generated -->'` in
        `ideTargets.ts` next to `MANAGED_MARKERS`.
  - [ ] Add optional `generatedPromptDirs?: string[]` to
        `TargetDescriptor` with a doc comment; set it to
        `['.github/prompts']` on copilot only.
  - [ ] In `worktreePropagation.ts`, export
        `sweepGeneratedPrompts(worktreePath, dirs)` returning removed
        relative paths: delete `*.prompt.md` files that contain the marker;
        remove the directory if that leaves it empty. Leave unmarked files.
  - [ ] Call it per worktree for descriptors that set the field, before
        the manifest copy, and print `Removed superseded prompt file: <rel>`
        for each. It runs whether or not a manifest exists (D5).
  - [ ] No code checks the target name to decide whether to sweep.
  - [ ] Success criteria: build passes.

- [ ] **Task 9a: Sweep tests** (effort: 1)
  - [ ] In `worktreePrune.test.ts`: marked file removed, unmarked file
        kept; only marked files present → directory removed; missing
        directory → returns `[]`; one copilot `propagateToWorktrees` run
        prints the removal line; a claude run never touches
        `.github/prompts`.
  - [ ] Success criteria: the tests pass, and all cli tests pass.
  - [ ] Commit: `feat: sweep generated prompt files from worktrees`

### Part 6 — Verification and close-out

- [ ] **Task 10: Full build and size check** (effort: 1)
  - [ ] Run `pnpm -r build` and the full test suite once each.
  - [ ] `wc -l` `setup-ide.ts`, `worktreePropagation.ts`,
        `installManifest.ts`, and `ideTargets.ts`; each is at or under
        ~300 lines.
  - [ ] Grep confirms the marker literals appear only in `ideTargets.ts`
        among the `src` files.
  - [ ] Success criteria: build and all suites pass; sizes within limit.

- [ ] **Task 11: CHANGELOG** (effort: 1)
  - [ ] Under `## [Unreleased]`, add a `### Fixed` entry: `cf setup-ide`
        now prunes files the guide no longer installs from registered
        worktrees (checksum-gated, edited files kept), carries the install
        manifest into each worktree, sweeps generated copilot prompt files,
        and no longer propagates when the overwrite prompt is declined.
        Reference #103.
  - [ ] Success criteria: entry present; no other sections changed.
  - [ ] Commit: `docs: add CHANGELOG entry for worktree pruning`

- [ ] **Task 12: Verification walkthrough** (effort: 2)
  - [ ] Run `pnpm -r build`, then walkthrough steps 1–7 from the slice
        design with the local build. Step 1 registers a throwaway worktree
        in the real project store; step 7 removes it. Do step 7 even if an
        earlier step fails.
  - [ ] After step 7, `git status` on the slice branch shows no changes
        under `.claude/` or `.context-forge/`.
  - [ ] Success criteria: every expected result in steps 1–6 matches. If
        anything differs, record the actual output in the slice design's
        walkthrough section.
  - [ ] Commit any notes: `docs: record slice 930 verification results`

- [ ] **Task 13: Close out** (effort: 1)
  - [ ] Set the slice design and this task file to `status: complete`
        (update `dateUpdated`), and check off 930 in the 900 slice plan.
  - [ ] Run `cf check` and confirm no new warnings for 930.
  - [ ] Commit: `docs: mark slice 930 complete`
  - [ ] Stop here. Merging to `main` and releasing are the PM's call.

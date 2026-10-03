---
docType: tasks
slice: prune-stale-guide-files-in-worktrees
project: context-forge
lld: user/slices/930-slice.prune-stale-guide-files-in-worktrees.md
dependencies: [929]
projectState: main is clean at 6fa3d73; published version is 0.18.3. propagateToWorktrees in setup-ide.ts (300 lines) only adds and overwrites files in worktrees, so files the guide stops shipping linger there. The guide (vendored 0.19.3) writes .context-forge/<target>.manifest and prunes at the root. The 930 design passed two reviews (CONCERNS), all findings resolved; D2 confirmed by the PM.
dateCreated: 20261003
dateUpdated: 20261003
status: complete
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

- [x] **Task 0: Create the slice branch** (effort: 1)
  - [x] Run `cf config get git.integration_branch`. If it prints a value,
        STOP and ask the Project Manager. The plan assumes it is empty and
        the target is `main`.
  - [x] From a clean `main`, run
        `git checkout -b 930-slice.prune-stale-guide-files-in-worktrees main`.
        If the branch already exists, switch to it instead.
  - [x] Success criteria: `git branch --show-current` prints the branch
        name, and the working tree is clean.

### Part 1 — Characterization (design step 0)

- [x] **Task 1: Assert the propagation header and count lines** (effort: 1)
  - [x] In `setup-ide.test.ts`, in the existing `propagateToWorktrees`
        direct tests, add assertions that `console.log` output contains
        `→ propagating to worktree: <name> (<path>)` once per real worktree,
        and `Propagated to N worktree(s).` with the right N and plural form
        (`worktree` for 1, `worktrees` otherwise).
  - [x] Do not change any source file in this task.
  - [x] Success criteria: the setup-ide test file passes with the new
        assertions against today's code.
  - [x] Commit: `test: pin worktree propagation header and count output`

### Part 2 — Install manifest module

- [x] **Task 2: Implement `cksum`** (effort: 2)
  - [x] Create `packages/cli/src/commands/installManifest.ts`. Header
        comment: the manifest format and CRC are an interface with the
        guide; a guide change to either is a breaking change for cf
        (design, Special Considerations).
  - [x] Export `cksum(buffer: Buffer): number` implementing POSIX `cksum`
        exactly as D1 describes: CRC-32, polynomial `0x04C11DB7`, MSB-first,
        initial value 0, then the byte length appended least significant
        byte first using only as many bytes as needed, then complemented.
        Return an unsigned 32-bit value. Build the 256-entry table once at
        module load.
  - [x] Success criteria: `pnpm --filter @context-forge/cli build` passes.

- [x] **Task 2a: `cksum` tests** (effort: 2)
  - [x] Create `packages/cli/tests/commands/installManifest.test.ts`.
  - [x] Real-fixture test first: read the repo's
        `.context-forge/claude.manifest`, and for each line read the listed
        file from the repo root and assert `cksum` equals the recorded CRC
        and the byte length equals the recorded size. Resolve the repo root
        from the test file's location, not from `process.cwd()`. Fail if
        the manifest has zero lines.
  - [x] Empty buffer: expect `4294967295` (`printf '' | cksum`).
  - [x] A buffer longer than 255 bytes, so the length needs two or more
        bytes. Get the expected CRC by running the system `cksum` once while
        writing the test, and hard-code it with a comment showing the
        command used. The test itself must not shell out.
  - [x] Success criteria: the new test file passes.

- [x] **Task 3: Implement manifest parsing and reading** (effort: 2)
  - [x] In `installManifest.ts`, export:
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
  - [x] Handle "missing" by catching `ENOENT` specifically, with a comment
        saying a missing manifest is the old-guide case. Rethrow everything
        else.
  - [x] Success criteria: build passes; the file stays well under ~300
        lines.

- [x] **Task 3a: Parsing and reading tests** (effort: 2)
  - [x] In `installManifest.test.ts`, test `parseManifestLine` on:
        a real line copied from `.context-forge/claude.manifest`; a path
        with spaces; trailing whitespace and `\r`; a blank line (→ `null`);
        a malformed line (non-numeric CRC, missing size) → throws.
  - [x] Test `readManifest` with a temp dir: missing file → `null`; empty
        file → `[]`; two valid lines → two entries; a malformed second
        line → `UserError` whose message contains the path and `2`; a stray
        `.claude.manifest.tmp` next to a missing manifest → still `null`.
  - [x] Also call `readManifest` on the repo root for `claude` and assert
        a non-empty result (real-input check per the parsing rules).
  - [x] Success criteria: the test file passes.
  - [x] Commit: `feat: add install manifest reader and POSIX cksum`

### Part 3 — Extraction (no behavior change)

- [x] **Task 4: Move target descriptors and markers to `ideTargets.ts`**
      (effort: 1)
  - [x] Move `TargetDescriptor`, `TARGETS`, `MANAGED_MARKER`,
        `MANAGED_BEGIN_MARKER`, and `MANAGED_MARKERS` (with their comments)
        from `setup-ide.ts` into `ideTargets.ts`.
  - [x] Re-export them from `setup-ide.ts`, following the existing
        `ideTargets` re-export line (line 22), so current importers and
        tests keep working.
  - [x] `ideTargets.ts` must not import from `setup-ide.ts`.
  - [x] Success criteria: build passes and all cli tests pass unchanged.
  - [x] Commit: `refactor(cli): move IDE target descriptors to ideTargets`

- [x] **Task 5: Move `propagateToWorktrees` to `worktreePropagation.ts`**
      (effort: 2)
  - [x] Create `packages/cli/src/commands/worktreePropagation.ts` and move
        `propagateToWorktrees` and its doc comment there unchanged. It
        imports nothing from `setup-ide.ts` (it uses `ideTargets.ts` now,
        and `installManifest.ts` from Task 8 on).
  - [x] The command action in `setup-ide.ts` imports it from the new
        module.
  - [x] Move the propagation tests (`setup-ide.test.ts` lines 771–1025,
        both describe blocks) into
        `packages/cli/tests/commands/worktreePropagation.test.ts`. Copy over
        only the mocks and fixtures those tests need. The copilot block
        drives the command action, so it needs the same store, fs,
        child_process, and readline mocks.
  - [x] Change only import paths in the moved tests, not assertions.
  - [x] Grep `packages/*/src` and `packages/*/tests` for
        `propagateToWorktrees`. Re-export it from `setup-ide.ts` only if
        something outside `setup-ide.ts` and the new test file still
        imports it from there; otherwise don't.
  - [x] Success criteria: build passes; all cli tests pass; `setup-ide.ts`
        is under 300 lines (`wc -l`).
  - [x] Commit: `refactor(cli): extract worktree propagation module`

### Part 4 — Prune

- [x] **Task 6: Implement `pruneStaleFiles`** (effort: 3)
  - [x] In `worktreePropagation.ts`, export
        `pruneStaleFiles(worktreePath, baselineEntries, newRootEntries)`
        returning `{ removed: string[], kept: string[] }`. No printing.
  - [x] Stale paths = baseline paths not in the new root's paths. Skip a
        stale path that doesn't exist in the worktree.
  - [x] For each candidate, in this order (design, Patterns and
        Conventions):
    1. Containment: skip (and add to `kept`) a path that is absolute,
       has a `..` segment, or whose parent directory's realpath is not
       inside the worktree's realpath.
    2. `lstat`: a symlink or non-regular file goes to `kept`.
    3. Read the file, compute `cksum` and size. If they match *any*
       baseline entry for that path, delete it immediately, then remove
       empty parent directories while the relative directory has at least
       three segments. Otherwise add to `kept`.
  - [x] `kept` carries enough to print the right warning per reason
        (containment, non-regular, edited). Keep the shape simple, e.g. a
        reason field; the edited-file message is the design's `Kept ...`
        line.
  - [x] No try/catch. Filesystem errors, including `EACCES`, propagate.
  - [x] Success criteria: build passes; the function is about 50 lines or
        less (split a helper out if needed).

- [x] **Task 6a: `pruneStaleFiles` tests** (effort: 3)
  - [x] Create `packages/cli/tests/commands/worktreePrune.test.ts` using
        real temp dirs; remove them in `afterEach`. Build manifest entries
        from the seeded files with `cksum` so the fixtures are exact.
  - [x] Cases:
    1. Dropped, unedited file → removed.
    2. Dropped, edited file → kept with reason "edited", and still on
       disk.
    3. File not in any baseline → untouched.
    4. File still in the new root manifest → untouched.
    5. Baseline has two entries for one path (worktree and root
       snapshot); the file matches the second → removed.
    6. Containment: `../outside.md` and an absolute path → kept with reason "containment", and a
       sentinel file outside the worktree survives.
    7. Symlinked directory: `.claude/agents` in the worktree is a symlink
       to a dir outside it holding a matching file → kept, outside file
       survives.
    8. Stale path is a symlink to a matching file → kept; stale path is a
       directory → kept. Both with reason "non-regular".
    9. Empty dirs: removing `.claude/skills/old/SKILL.md` removes
       `.claude/skills/old` but not `.claude/skills`.
  - [x] Success criteria: the new tests pass, and all cli tests pass.
  - [x] Commit: `feat: prune stale guide files in worktrees by checksum`

### Part 5 — Wiring

- [x] **Task 7: Propagate only when the guide script ran** (effort: 1)
  - [x] `setupIdeAction` returns `Promise<boolean>`: `false` on the
        declined-prompt path, `true` after the script runs. A non-zero
        script exit still throws its `UserError`.
  - [x] In the command action, skip propagation and command install when it
        returns `false`. `init.ts` ignores the return value; leave it alone.
  - [x] Success criteria: build passes.

- [x] **Task 7a: Tests for skipped propagation** (effort: 1)
  - [x] In `worktreePropagation.test.ts` (it already has the command-action
        mocks), add: user answers `n` at the overwrite prompt → no
        `cpSync`/`copyFileSync` into any worktree and no
        `→ propagating to worktree:` line; guide script exits non-zero →
        same, and the error is reported.
  - [x] Success criteria: the tests pass, and all cli tests pass.
  - [x] Commit: `fix: skip worktree propagation when setup-ide is declined`

- [x] **Task 8: Root snapshot and per-worktree structure** (effort: 2)
  - [x] Command action: read `rootBaseline = readManifest(root, target)`
        *before* calling `setupIdeAction`, and pass it to
        `propagateToWorktrees(project, target, rootBaseline)`.
  - [x] In `propagateToWorktrees`, read `newRoot` after the existing
        worktree filter and empty-list return. Do **not** return early when
        `newRoot` is `null`. Every worktree runs the same loop, in this
        order (Tasks 8b and 9 fill in steps 2–4):
    1. Copy `markerFiles` and `propagateDirs` (unchanged).
    2. Prune — only when `newRoot` is not `null` (Task 8b).
    3. Generated prompt sweep — always, whatever `newRoot` is (Task 9, D5).
    4. Manifest copy — only when `newRoot` is not `null` (Task 8b).
  - [x] When `newRoot` is `null`, print the D4 notice (exact text in D4)
        once after the loop, before the `Propagated to N worktree(s).`
        line. That line is unchanged.
  - [x] Moved mocked-fs tests: give them the new third argument. If they
        break because `readManifest` reads through the mocked `fs`, make the
        mock report the manifest as missing for them (the D4 path, which is
        today's copy-only behavior). Do not loosen their existing
        assertions.
  - [x] Success criteria: build passes and existing tests pass.

- [x] **Task 8a: Old-guide path tests** (effort: 1)
  - [x] In `worktreePrune.test.ts`, add end-to-end setup: a real temp
        root, temp worktrees, and a `ProjectData` fixture registering them.
  - [x] D4 case: no root manifest, two worktrees → files copied, nothing
        deleted, no worktree manifest written, and the notice printed
        exactly once.
  - [x] Success criteria: the test passes, and all cli tests pass.
  - [x] Commit: `feat: snapshot root manifest and handle pre-manifest guides`

- [x] **Task 8b: Prune, output, and manifest copy** (effort: 2)
  - [x] Step 2 of the loop: baseline = worktree manifest entries plus
        `rootBaseline` entries (either may be `null`). If both are `null`,
        skip pruning. Otherwise call `pruneStaleFiles` and print under the
        worktree header: the design's `Removed ...` line per removal, the
        `Kept ...` line per edited file, and a one-line warning naming the
        path for each containment or non-regular skip.
  - [x] Step 4 of the loop: copy the root manifest to
        `.context-forge/.<target>.manifest.tmp` in the worktree, then rename
        it to `<target>.manifest`. Create `.context-forge/` if missing.
        This is the last step per worktree.
  - [x] Success criteria: build passes; existing tests pass;
        `worktreePropagation.ts` is under ~300 lines.

- [x] **Task 8c: End-to-end prune tests** (effort: 3)
  - [x] In `worktreePrune.test.ts`, with a root manifest present:
    1. Worktree has a manifest; root drops a path → file removed,
       `Removed ... (no longer installed by the guide)` printed.
    2. Same, but the worktree copy is edited → file kept, and the
       `Kept ... edited since` line names it.
    3. A baseline entry with a `..` path → nothing outside the worktree
       touched, and a warning line names the path.
    4. D2: worktree has no manifest, `rootBaseline` lists the dropped
       path → removed, and the worktree manifest is seeded.
    5. Neither baseline → nothing deleted, manifest seeded.
    6. Empty root manifest (`[]`) → not the D4 case: no notice, and the
       worktree manifest is copied as an empty file.
    7. After each of cases 1–6, the worktree manifest is byte-identical
       to the root's, and no `.<target>.manifest.tmp` remains.
  - [x] Success criteria: the tests pass, and all cli tests pass.
  - [x] Commit: `feat: carry install manifest into worktrees after pruning`

- [x] **Task 9: Generated prompt sweep** (effort: 2)
  - [x] Add `GENERATED_MARKER = '<!-- context-forge:generated -->'` in
        `ideTargets.ts` next to `MANAGED_MARKERS`.
  - [x] Add optional `generatedPromptDirs?: string[]` to
        `TargetDescriptor` with a doc comment; set it to
        `['.github/prompts']` on copilot only.
  - [x] In `worktreePropagation.ts`, export
        `sweepGeneratedPrompts(worktreePath, dirs)` returning removed
        relative paths: delete `*.prompt.md` files that contain the marker;
        remove the directory if that leaves it empty. Leave unmarked files.
        (The design writes `sweepGeneratedPrompts(worktreePath)`; passing
        the descriptor's dirs keeps the sweep descriptor-driven.)
  - [x] Call it at step 3 of the per-worktree loop (Task 8) for
        descriptors that set the field, on both the manifest and the D4
        paths. Print `Removed superseded prompt file: <rel>` for each.
  - [x] No code checks the target name to decide whether to sweep.
  - [x] Success criteria: build passes.

- [x] **Task 9a: Sweep tests** (effort: 2)
  - [x] In `worktreePrune.test.ts`:
    1. Marked file removed, unmarked file kept.
    2. Only marked files present → directory removed.
    3. Missing directory → returns `[]`.
    4. Copilot run with a root manifest prints the removal line.
    5. Copilot run with **no** root manifest (D4): the marked file is
       still removed, and the D4 notice prints once.
    6. Copilot run with an empty root manifest: the marked file is
       removed.
    7. A claude run never touches `.github/prompts`.
  - [x] Success criteria: the tests pass, and all cli tests pass.
  - [x] Commit: `feat: sweep generated prompt files from worktrees`

### Part 6 — Verification and close-out

- [x] **Task 10: Full build and size check** (effort: 1)
  - [x] Run `pnpm -r build` and the full test suite once each.
  - [x] `wc -l` `setup-ide.ts`, `worktreePropagation.ts`,
        `installManifest.ts`, and `ideTargets.ts`; each is at or under
        ~300 lines.
  - [x] Grep confirms the marker literals appear only in `ideTargets.ts`
        among the `src` files.
  - [x] Success criteria: build and all suites pass; sizes within limit.

- [x] **Task 11: CHANGELOG** (effort: 1)
  - [x] Under `## [Unreleased]`, add a `### Fixed` entry: `cf setup-ide`
        now prunes files the guide no longer installs from registered
        worktrees (checksum-gated, edited files kept), carries the install
        manifest into each worktree, sweeps generated copilot prompt files,
        and no longer propagates when the overwrite prompt is declined.
        Reference #103.
  - [x] Success criteria: entry present; no other sections changed.
  - [x] Commit: `docs: add CHANGELOG entry for worktree pruning`

- [x] **Task 12: Verification walkthrough** (effort: 2)
  - [x] Run `pnpm -r build`, then walkthrough steps 1–7 from the slice
        design with the local build. Step 1 registers a throwaway worktree
        in the real project store; step 7 removes it. Do step 7 even if an
        earlier step fails.
  - [x] After step 7, `git status` on the slice branch shows no changes
        under `.claude/` or `.context-forge/`.
  - [x] Success criteria: every expected result in steps 1–6 matches. If
        anything differs, record the actual output in the slice design's
        walkthrough section.
  - [x] Commit any notes: `docs: record slice 930 verification results`

- [x] **Task 13: Close out** (effort: 1)
  - [x] Set the slice design and this task file to `status: complete`
        (update `dateUpdated`), and check off 930 in the 900 slice plan.
  - [x] Run `cf check` and confirm no new warnings for 930.
  - [x] Commit: `docs: mark slice 930 complete`
  - [x] Stop here. Merging to `main` and releasing are the PM's call.

---

## Review Resolution (20261003)

Task review: `user/reviews/930-review.tasks.prune-stale-guide-files-in-worktrees.md`
(CONCERNS, claude-sonnet-5-5, reviewedSha 8c6aa96).

- **F001 (sweep vs D4 early return): accepted.** Task 8 no longer returns
  early on a missing root manifest. It sets a fixed per-worktree order
  (copy, prune, sweep, manifest copy); prune and manifest copy are skipped
  without a root manifest, the sweep always runs. The design's Data Flow
  is updated to match.
- **F002 (D5 untested): accepted.** Task 9a cases 5 and 6 cover a copilot
  run with no root manifest and with an empty one.
- **F003 (output untested): accepted.** Task 8c cases 2 and 3 assert the
  `Kept ... edited since` line and a containment warning.
- **F004 (Task 8 size): accepted.** Split into 8 (snapshot and loop
  structure, D4) with test 8a, and 8b (prune, output, manifest copy) with
  test 8c.
- **F005 (mismatches): accepted.** Task 5 now says the module imports
  nothing from `setup-ide.ts`. Task 9 notes why its sweep signature takes
  `dirs`. Task 6a asserts the `kept` reason.
- **F006, F007:** pass, no change.

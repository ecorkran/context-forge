---
docType: slice-design
slice: prune-stale-guide-files-in-worktrees
project: context-forge
parent: user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: [929]
interfaces: []
dateCreated: 20261003
dateUpdated: 20261003
status: complete
---

# Slice Design: Prune Stale Guide Files in Worktrees

## Overview

`cf setup-ide <target>` runs the guide's `scripts/setup-ide` at the project root, then `propagateToWorktrees` (`packages/cli/src/commands/setup-ide.ts:212`) copies the target's marker files and `propagateDirs` into every registered worktree. That copy only adds and overwrites. Since ai-project-guide v0.19.0 the guide prunes files it no longer ships at the root, using `.context-forge/<target>.manifest`. Worktrees get no such pruning, so a rule, agent, or skill the guide drops stays in every worktree indefinitely.

This slice makes propagation prune with the guide's own rule: delete a worktree file only if it was guide-written (listed in a baseline manifest), the root's new manifest no longer lists it, and its bytes still match a recorded checksum and size. Edited files are kept with a warning. After pruning, the root's manifest is copied into the worktree so the next run has a baseline. The slice also removes stale generated `.github/prompts/*.prompt.md` files from worktrees, mirroring the guide's marker check at the root.

This closes the cf side of GitHub #103.

This is a defect fix, so it belongs in the 900 maintenance initiative. cf's propagation leaves worktrees out of step with the root, and this brings them back in step. The manifest reader, the CRC, and the prune step are the smallest machinery that can do that without running the guide in every worktree (D1). Two pieces are in scope only because pruning needs them:
- **Moving propagation out of `setup-ide.ts`.** Without it, the new logic pushes the file over the size limit.
- **The declined-prompt fix.** Without it, answering "no" to the overwrite prompt would delete files in worktrees.

## Value

- Worktrees stop accumulating dead guide files. Today a dropped skill or agent shows up twice or with stale instructions in every worktree, and the only fix is deleting it by hand in each one.
- The behavior matches what the guide already does at the root, so users see one rule, not two.
- Edits are never lost: a file the user changed is kept and named in a warning.

## Technical Scope

### Included

1. **Manifest-driven prune in `propagateToWorktrees`.** For each worktree, compute stale paths from a baseline and the root's new manifest, then delete the ones whose checksum and size match. Empty install subdirectories are removed under the same depth rule the guide uses.
2. **Manifest carry-over.** Copy the root's `.context-forge/<target>.manifest` into each worktree after pruning.
3. **Root pre-run manifest snapshot.** `setupIdeAction` reads the root's manifest for the target *before* running the script and passes it to propagation as part of the baseline (decision D2).
4. **POSIX `cksum` CRC in TypeScript**, byte-compatible with the guide's `cksum < file` output (decision D1).
5. **Generated prompt-file sweep in worktrees** for targets that propagate `.github/prompts` (copilot): delete `*.prompt.md` files carrying `<!-- context-forge:generated -->`, and remove the directory if that leaves it empty.
6. **Old-guide notice.** When the root has no manifest for the target after the script runs, propagation copies only, as today, and prints one line saying pruning was skipped.
7. **Extraction.** Propagation moves out of `setup-ide.ts` (300 lines today) into its own module, so the new logic doesn't push that file over the size limit.

### Excluded

- The vendored guide tree (`project-documents/ai-project-guide`). Tarball updates delete and re-extract it (`TarballStrategy.ts:135`). Submodule and clone updates leave deletions to git. Nothing to do.
- Pruning at the project root. The guide owns that.
- Writing or editing `.gitignore` (decision D3).
- Per-worktree `rules.exclude` differences. Propagation copies root output, as it does today.
- Removing the guide's legacy-table files (drops from before v0.19.0) from worktrees. D2 explains what is and isn't caught.

## Dependencies

### Prerequisites

- ai-project-guide v0.19.0 or later at the root, for the manifest. This has shipped; the repo vendors 0.19.3. Older guides degrade to copy-only (D4).
- Slice 929 (complete). It added `AGENT_SKILLS_DIR` to copilot's `propagateDirs`, and this slice edits the same descriptor table.

### Interfaces Required

- The guide's manifest format: one line per file, `<crc> <size> <relative path>`, separated by single spaces, sorted by path, with paths relative to the project root and using `/`. Composite files (CLAUDE.md, AGENTS.md, copilot-instructions.md) are never listed. An empty file is a valid manifest (the `agents` target writes nothing wholesale), which is different from a missing one.
- The guide's generated marker literal: `<!-- context-forge:generated -->`.

## Architecture

### Component Structure

New module `packages/cli/src/commands/worktreePropagation.ts`:

- `propagateToWorktrees(project, target, rootBaseline)`: moved from `setup-ide.ts`. It keeps the existing worktree filter (skip missing paths and the "default" worktree whose path is the root) and the existing copy loop, then adds the prune, the prompt sweep, and the manifest copy.
- `pruneStaleFiles(worktreePath, baselineEntries, newRootEntries)`: returns `{ removed: string[], kept: string[] }`. It does no printing, so it can be unit-tested.
- `sweepGeneratedPrompts(worktreePath)`: returns the removed filenames.

New module `packages/cli/src/commands/installManifest.ts`:

- `MANIFEST_DIR = '.context-forge'` and `manifestPath(root, target)`.
- `readManifest(root, target)`: returns `ManifestEntry[] | null`, where `null` means the file is missing and `[]` means an empty manifest.
- `parseManifestLine(line)`: lenient parsing. It splits on the first two runs of whitespace (so paths containing spaces survive), ignores blank lines and trailing whitespace, and throws on a line without a numeric CRC and size.
- `cksum(buffer)`: the POSIX CRC.

`TARGETS`, `TargetDescriptor`, and the marker constants move from `setup-ide.ts` into the existing leaf module `ideTargets.ts`. That module already exists to keep `setup-ide` and `commandInstaller` acyclic. Imports then run one way only: `setup-ide.ts` → `worktreePropagation.ts` → `installManifest.ts` / `ideTargets.ts`. Nothing imports back into `setup-ide.ts`. `GENERATED_MARKER` is added next to `MANAGED_MARKERS`, so every marker literal still lives in one place. `setup-ide.ts` keeps `isManagedInstall`, `setupIdeAction`, and the command registration, and re-exports the moved names for existing importers. `TargetDescriptor` gains an optional `generatedPromptDirs?: string[]`, set to `['.github/prompts']` on copilot only. That way the sweep is driven by the descriptor rather than by checking a target name.

`setupIdeAction` returns `true` when the guide script ran, and `false` when the user declined the overwrite prompt. The command action snapshots the root manifest, and propagates only when the action returns `true`. Today a declined prompt still propagates. With pruning added, that would mean a "no" deletes files in worktrees.

### Data Flow

```
cf setup-ide <target>
  ├─ rootBaseline = readManifest(root, target)            # before the script runs
  ├─ ran = setupIdeAction → guide script                  # rewrites root files + manifest
  │    non-zero exit → UserError, nothing below runs
  │    user declines overwrite → ran = false, nothing below runs
  └─ propagateToWorktrees(project, target, rootBaseline)
       newRoot = readManifest(root, target)
       for each worktree:
         copy markerFiles + propagateDirs                 # unchanged behavior
         if newRoot === null → skip prune and manifest copy (sweep still runs)
         baseline = readManifest(wt, target) ∪ rootBaseline
         stale = paths(baseline) − paths(newRoot)
         for each stale path present in the worktree:
           cksum+size matches any baseline entry for that path → delete, remove empty dirs
           otherwise → keep, warn
         sweep generated prompt files (descriptor-driven)
         copy root manifest → wt/.context-forge/<target>.manifest   # temp file + rename
       if newRoot === null → print notice once
```

The manifest copy is the last step for each worktree. It writes to a temp file in the same directory and then renames it, so an interrupted copy can't leave a truncated manifest behind. A truncated manifest would fail the next run as malformed.

Pruning runs after the copy. A dropped path is absent at the root (the guide deleted it), so the copy can't recreate it. If the guide *kept* an edited file at the root, the copy overwrites the worktree's version with the root's edited bytes, the checksum no longer matches, and the worktree keeps the file too. Root and worktree end up in the same state.

### State Management

The only state is the per-checkout manifest file. cf reads the manifest at the root and in each worktree, and writes it only in worktrees, always as a byte copy of the root's. cf never writes a manifest at the root.

## Technical Decisions

### D1: Implement the manifest diff in cf, with a TypeScript `cksum`

This settles plan item (a). The alternative was running the guide's `setup-ide` inside each worktree, which would reuse its prune logic and legacy table. Rejected because:

- The guide is often not present in a worktree. Tarball installs are untracked, and submodules are uninitialized in new worktrees. `cf worktree rm` already has to handle worktrees with and without guides.
- When a guide is present, it can be a different version from the root's, so the worktree would get output that differs from the root's.
- It would replace the propagation model (copy root output) with a different one (regenerate per worktree). That is a larger change than this slice needs.

The cost is one duplicated rule (old minus new, checksum gate). It is small, and the format it depends on is a documented interface.

This doesn't conflict with D2's refusal to copy the legacy table. The rule, the format, and the marker are an interface. They change only in a breaking guide release, and cf's parser throws on a format change. The legacy table is data, a list of file paths. It can grow in any guide release, and nothing in cf would notice. Copying a stable rule is acceptable; copying a list that changes on every release is not.

Drift in the CRC is the dangerous kind, because it would delete the wrong files. The fixture test pins it in a way that stays current: it reads this repo's committed `.context-forge/claude.manifest` and checks that `cksum` reproduces the recorded CRC and size for each listed file. That manifest is rewritten by whatever guide version is vendored, so every `cf guides update` re-tests the contract. The test doesn't run the guide script itself, which keeps bash out of the test suite.

The checksum is computed in TypeScript rather than by shelling out to `cksum`. Propagation should not need another binary on PATH; `cksum` is not reliably on PATH on Windows outside git-bash. The algorithm is the POSIX one: CRC-32 with polynomial `0x04C11DB7`, processed MSB-first from an initial value of 0. The byte length is appended least significant byte first, using only as many bytes as needed, and the result is complemented. It is about 15 lines plus a 256-entry table. Correctness is pinned by fixtures taken from this repo's real `.context-forge/claude.manifest` lines and their files.

### D2: Baseline = worktree manifest ∪ root's pre-run manifest

This refines plan item (b), confirmed by the PM on 20261003. The plan said a worktree with no manifest should never be pruned, only seeded. Every existing worktree is in that state today, because cf ≤ 0.18.3 never copied the manifest. Under that rule, the first `setup-ide` after this ships would drop nothing in them, and whatever the guide drops in that same run would linger until the next one.

Instead, the baseline is the worktree's own manifest plus the root's manifest as it was just before the script ran. This mirrors the guide, whose baseline is its own manifest plus a legacy table. Safety still comes from the checksum gate, not from where the baseline came from. A file is deleted only if its bytes equal a version the guide wrote and the guide has stopped shipping that path. That is exactly the guide's own deletion guarantee.

What this still doesn't catch: files dropped before the root ever had a manifest. That is the guide's legacy table: `.claude/agents/code-review-agent.md` and `.claude/skills/analyze/SKILL.md`. cf can't see that table without running the script. Those files stay in old worktrees, and the user removes them by hand (they are named in the walkthrough). This is a deliberate gap. Copying the table into cf would be a second copy of guide data that drifts.

If neither baseline exists (old guide at the root before the run, and no worktree manifest), nothing is deleted. The root manifest is still seeded.

### D3: `.context-forge/` is not gitignored by cf

This settles plan item (c). The manifest describes the IDE files sitting next to it, so it should be tracked or ignored the same way they are. In this repo, `.claude/rules/*` and `.context-forge/*.manifest` are both committed. A worktree on a branch then gets a coherent pair of files and manifest from git, and propagation overwrites both together. Gitignoring only the manifest would split that pair. cf writes no `.gitignore` today (see the 900 plan's Future Work), and this slice doesn't start.

### D4: Old guide → copy only, one notice

This settles plan item (d). If the root has no manifest for the target *after* the script runs, the guide predates v0.19.0. Propagation copies as it does today and prints one line per command run, not one per worktree:

```
  Note: guide predates the install manifest (v0.19.0); worktree files were copied but not pruned. Run 'cf guides update' to enable pruning.
```

An empty manifest is not the old-guide case. It means the target writes no wholesale files, so there is nothing to prune.

### D5: Generated prompt sweep is unconditional in worktrees

This settles plan item (e). Generated `.github/prompts/*.prompt.md` files predate the manifest, so no manifest ever lists them. The guide removes them at the root with a marker check, and cf does the same in each worktree for targets whose descriptor lists `generatedPromptDirs`. The marker can only have come from the guide, so this is safe without a checksum. Files without the marker are user-authored and left alone.

### Patterns and Conventions

- **Path containment.** Manifest paths come from a file a user can edit. A path that is absolute, contains a `..` segment, or resolves outside the worktree is skipped with a warning and never deleted. "Resolves" means `fs.realpathSync` on the candidate's parent directory, compared against the realpath of the worktree. That way a symlinked install directory can't redirect a deletion outside the worktree.
- **Only regular files are deleted.** The candidate is checked with `lstat`. A symlink, a directory, or anything else that isn't a regular file is kept with a warning. The guide never writes those, so a checksum gate doesn't apply to them.
- **Empty directories.** After a deletion, remove now-empty parent directories, but only while the relative directory has at least three segments. This is the guide's `remove_empty_install_dirs` rule: `.claude/skills/analyze` can go, `.claude/skills` never does.
- **Errors.** A malformed manifest line throws a `UserError` naming the file and line number. A partial baseline is not used silently. Filesystem errors propagate, consistent with 929's D3b. That includes `EACCES` on a read or delete.
- **Failure partway through.** An error in worktree N stops the run. Worktrees before N are complete. Worktree N may be partly pruned, but it keeps its old manifest, because the manifest copy comes last. Later worktrees are untouched. Re-running after the fix finishes the job for any worktree that has its own manifest.
  - One case is not recovered. Suppose worktree N had no manifest of its own and depended on the root's pre-run snapshot (D2). The re-run snapshots the root's *new* manifest, so the files dropped in the failed run are no longer stale candidates. They stay in the worktree.
  - That gap is accepted. It needs a failure *and* a worktree with no manifest, and that combination only exists during the first run after upgrading. It also fails the safe way: files are kept, never wrongly deleted. Such files land in the same bucket as the legacy-table files in D2.
- **Concurrent edits.** A file can change between the checksum read and the delete. That window is accepted. It lasts milliseconds inside a command the user just ran, and the guide has the same window at the root. Each candidate is read and deleted right away, with no batching, so the window stays as short as it can be.
- **Temp manifest.** The temp file is `.context-forge/.<target>.manifest.tmp`. `readManifest` opens only the exact `<target>.manifest` path, so a stray temp file left by a killed run is never read as a manifest. The next run overwrites it.
- **Output.** These lines go under the existing `→ propagating to worktree:` header:
  - `Removed <rel> (no longer installed by the guide)`
  - `Kept <rel>: no longer installed by the guide, but edited since — remove it by hand if unneeded`
  - `Removed superseded prompt file: <rel>`

## Implementation Details

### Migration Plan

- **Move** `propagateToWorktrees` from `setup-ide.ts` to `worktreePropagation.ts`. Its only caller is the `setup-ide` command action in the same file. Tests in `setup-ide.test.ts` that cover propagation move to `worktreePropagation.test.ts`.
- **Move** `TARGETS`, `TargetDescriptor`, `MANAGED_MARKER`, `MANAGED_BEGIN_MARKER`, and `MANAGED_MARKERS` from `setup-ide.ts` to `ideTargets.ts`. `setup-ide.ts` re-exports them, so test imports keep working.
- **Re-export** `propagateToWorktrees` from `setup-ide.ts`, following the existing re-export pattern for `ideTargets`, unless no external importer remains. Check with a grep at implementation time and drop the re-export if nothing uses it.
- **Behavior preserved:** the worktree filter, the copy set, the per-worktree header, and the final count line are unchanged. Existing propagation tests must pass unmodified, apart from their import path.

## Integration Points

### Provides to Other Slices

- `installManifest.ts` (`readManifest`, `parseManifestLine`, `cksum`) is reusable if cf later reports guide-owned files, for example a `cf check` row for edited guide files. No consumer is planned.

### Consumes from Other Slices

- The guide's manifest format and generated marker (ai-project-guide v0.19.0+). If the format changes, `parseManifestLine` throws on lines it can't read rather than mis-pruning.
- `TARGETS` and `AGENT_SKILLS_DIR` (slice 929).

## Success Criteria

### Functional Requirements

1. After `cf setup-ide <target>`, a file the guide dropped is removed from every registered worktree when the worktree's copy is byte-identical to a baseline entry.
2. A dropped file that was edited in a worktree is kept, and a warning names it.
3. Files absent from every baseline manifest are never deleted. This covers user-authored rules, skills, and prompts.
4. Each worktree ends with `.context-forge/<target>.manifest` byte-identical to the root's.
5. A worktree with no manifest is pruned against the root's pre-run manifest (D2). With neither baseline, nothing is deleted.
6. With a guide older than v0.19.0, propagation copies only and prints the notice once.
7. For copilot, generated `.github/prompts/*.prompt.md` files are removed from worktrees, and unmarked ones are kept.
8. Paths that escape the worktree are never touched.
9. Empty skill or agent subdirectories are removed; install roots are not.
10. Propagation doesn't run when the guide script fails or the user declines the overwrite prompt.
11. Symlinks and non-regular files at stale paths are kept with a warning, and a symlinked directory can't redirect a deletion outside the worktree.

### Technical Requirements

- `cksum()` matches the guide's output on fixtures from real manifest entries (`.context-forge/claude.manifest` in this repo) and on edge cases: an empty buffer and a buffer whose length needs more than one length byte.
- `parseManifestLine` is tested on the real manifest format, on paths with spaces, on trailing whitespace, and on a malformed line (which must throw).
- Unit tests for `pruneStaleFiles` cover delete, keep-edited, unlisted, containment (including a symlinked directory), non-regular files, and empty-dir rules, using temp directories.
- A command-action test confirms that a declined overwrite prompt skips propagation.
- Propagation tests cover D2 (no worktree manifest), D4 (no root manifest), the empty-manifest case, and the prompt sweep.
- `setup-ide.ts` and the new modules each stay at or under ~300 lines.
- `pnpm -r build` and all test suites pass.

### Integration Requirements

- No change to the root-side behavior of `cf setup-ide`, `cf init --ide`, or `installCommandsForTarget`.
- CHANGELOG gets a Fixed entry referencing #103.

### Verification Walkthrough

Run from the project root with the local build. Verified 20261003 on branch `930-slice.prune-stale-guide-files-in-worktrees` (69b961e); every step below behaved as written. Define the command first:

```bash
cf() { node "$PWD/packages/cli/dist/index.js" "$@"; }
pnpm -r build
```

These steps register a throwaway worktree in the real project store, run the guide script at the root, and install commands to the machine-level directory. Back up the store first (`cp ~/.config/context-forge/projects.json /tmp/projects.json.pre930`). Check `cf worktree list --json` for range overlaps before step 1.

1. **Create a worktree and propagate once.**
   ```bash
   git worktree add ../cf-wt-930 -b wt-930-test
   cf worktree init --name wt-930 --path "$(cd ../cf-wt-930 && pwd)" --range 100-199 --override
   cf setup-ide claude
   cmp .context-forge/claude.manifest ../cf-wt-930/.context-forge/claude.manifest
   ```
   `--override` matters: without it, registering 100-199 chops the range of an existing worktree that overlaps it (here `default`, 100-999), and `cf worktree rm` does not restore it. Expect:
   ```
     → propagating to worktree: wt-930 (/…/cf-wt-930)
     Propagated to 1 worktree.
   ```
   `cmp` exits 0.

2. **Simulate a guide drop.** Add an entry for a file the guide will no longer write: copy a real agent file to a new name in both trees, and append its line to both manifests.
   ```bash
   cp .claude/agents/tester.md .claude/agents/old-agent.md
   cp .claude/agents/old-agent.md ../cf-wt-930/.claude/agents/old-agent.md
   line="$(cksum < .claude/agents/old-agent.md) .claude/agents/old-agent.md"
   echo "$line" >> .context-forge/claude.manifest
   echo "$line" >> ../cf-wt-930/.context-forge/claude.manifest
   cf setup-ide claude
   ```
   Expect the guide's `🧹 Removed .claude/agents/old-agent.md (no longer installed by the guide)` at the root, then under the worktree header:
   ```
       Removed .claude/agents/old-agent.md (no longer installed by the guide)
   ```
   The file is gone from both trees.

3. **Edited file is kept.** Repeat step 2, but run `echo "my local edit" >> ../cf-wt-930/.claude/agents/old-agent.md` before `cf setup-ide claude`. Expect:
   ```
       Kept .claude/agents/old-agent.md: no longer installed by the guide, but edited since — remove it by hand if unneeded
   ```
   The file is still in the worktree. Delete it by hand before step 4: the worktree manifest no longer lists it, so later runs won't consider it.

4. **User file is untouched.** `echo "# my rule" > ../cf-wt-930/.claude/rules/my-rule.md`, then `cf setup-ide claude`. Only the header and count lines print, and the file survives.

5. **No worktree manifest (D2).** `rm -rf ../cf-wt-930/.context-forge`, then repeat step 2, appending the manifest line at the root only. Expect the same `Removed …` line under the worktree header; `cmp` of the two manifests exits 0 (re-seeded).

6. **Generated prompt sweep.**
   ```bash
   mkdir -p ../cf-wt-930/.github/prompts
   printf '<!-- context-forge:generated -->\n# x\n' > ../cf-wt-930/.github/prompts/x.prompt.md
   printf '# y, mine\n' > ../cf-wt-930/.github/prompts/y.prompt.md
   cf setup-ide copilot
   ```
   Expect `    Removed superseded prompt file: .github/prompts/x.prompt.md`; `y.prompt.md` is kept.

7. **Clean up.** Run this even if an earlier step failed.
   ```bash
   cf worktree rm wt-930 --yes
   git worktree remove --force ../cf-wt-930 && git branch -D wt-930-test
   git checkout -- .context-forge .claude AGENTS.md
   git status --porcelain --untracked-files=all
   ```
   `--force` is needed because the worktree holds untracked generated files. The copilot run in step 6 leaves untracked output at the root (`.context-forge/copilot.manifest`, `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md`). Remove whatever `git status` lists that was not there before step 1, until it prints nothing. In this repo the guide also regenerates `.claude/rules/electron.md` at the root (deleted by hand in ff80db3, but still in the committed manifest). Remove it too.

Not covered by cf (D2): worktrees created before the root ever had a manifest may still contain `.claude/agents/code-review-agent.md` or `.claude/skills/analyze/SKILL.md`. Delete those by hand.

## Risk Assessment

### Technical Risks

- **This deletes files in worktrees.** A wrong CRC, or a baseline entry matching a file it shouldn't, could remove something the user wanted.

### Mitigation Strategies

- Deletion requires an exact CRC *and* size match against a guide-written entry, the same bar the guide uses at the root.
- CRC correctness is pinned against real manifest data, not only against computed values.
- The containment check means a hand-edited manifest can't reach outside the worktree.
- Every deletion and every kept file is printed.

## Implementation Notes

### Development Approach

0. Characterization tests before any move. `setup-ide.test.ts` already covers the worktree filter (missing path, zero worktrees, the root-path "default" worktree) and the copy set for every target. It does not assert the per-worktree `→ propagating to worktree:` header or the final `Propagated to N worktree(s).` line. Add those two assertions first.
1. `installManifest.ts`: `cksum`, `parseManifestLine`, `readManifest`, with tests (real-fixture CRC first).
2. Move `propagateToWorktrees` to `worktreePropagation.ts` with no behavior change; existing tests pass.
3. Add `pruneStaleFiles` and its tests.
4. Wire in the baseline snapshot in the command action, the manifest copy, and the D4 notice.
5. Add `GENERATED_MARKER`, `generatedPromptDirs`, and `sweepGeneratedPrompts`, with tests.
6. CHANGELOG, then run the walkthrough.

### Special Considerations

- The guide and cf must agree on the CRC byte for byte. Any future guide change to the manifest format (for example, a different hash) is a breaking interface change for cf. Note this in the module's header comment.
- Real worktrees are often outside the project directory (`../`). The containment check resolves against each worktree's own path, not the root's.

## Review Resolution (20261003)

Slice review: `user/reviews/930-review.slice.prune-stale-guide-files-in-worktrees.md` (CONCERNS, claude-sonnet-5-5, reviewedSha 4451807).

- **F001 (thin parent architecture): no change.** Slice plan entry 30 carries this item. The 900 architecture is a standing maintenance charter, not a list of slices.
- **F002 (circular import): accepted, using a leaf module.** `TARGETS`, `TargetDescriptor`, and the markers move to `ideTargets.ts`. Imports now run one way only (Component Structure, Migration Plan). Passing the descriptor in as a parameter was rejected: the sweep also needs `GENERATED_MARKER`, so it would only move the problem.
- **F003 (failure modes): accepted.**
  - A failure partway through stops the run, and the per-worktree state afterward is spelled out.
  - The one case a re-run can't recover (D2 snapshot plus a failure) is accepted and explained. It fails toward keeping files.
  - Containment uses realpath.
  - Symlinks and non-regular files are kept.
  - Read and delete errors propagate.
  - All in Patterns and Conventions, criteria 10–11.
- **F004 (script-failure ordering): accepted.**
  - A non-zero exit already throws before propagation runs. The design now states this.
  - Checking this turned up a real gap: a declined overwrite prompt returns normally and propagation still runs. `setupIdeAction` now returns whether the script ran, and the command propagates only on `true`.
  - The manifest copy uses a temp file plus rename.

## Review Resolution — second pass (20261003)

Slice review: `user/reviews/930-review.slice.prune-stale-guide-files-in-worktrees.md` (CONCERNS, claude-sonnet-5-5, reviewedSha 68dddd6). The first review is in `reviews/archive/`.

- **F002 (characterization tests): accepted.** The worktree filter and copy set are already covered. The header line and count line are not. Step 0 of the Development Approach adds those assertions before the move.
- **F003 (scope): accepted.** The Overview now says why this fix is maintenance work, and why the extraction and the declined-prompt fix are in scope only because pruning needs them.
- **F004 (concurrent edits, stray temp file): accepted.** The window between the checksum read and the delete is accepted and bounded. The temp manifest has a name `readManifest` never opens. Both are in Patterns and Conventions.
- **F005 (duplicated guide logic): accepted in part.**
  - The CRC fixture test now reads the committed manifest. Each guide update therefore re-checks the contract against the vendored guide.
  - D1 now explains why copying the rule is consistent with not copying the legacy table.
  - A test that runs the guide script was declined, to keep bash out of the suite.
  - Drift in the depth rule or the marker is a breaking interface change on the guide side, and no extra detection was added for it.
- **F001, F006, F007:** pass or note, no change.

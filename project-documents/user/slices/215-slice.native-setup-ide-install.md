---
docType: slice-design
slice: native-setup-ide-install
project: context-forge
parent: user/architecture/200-slices.developer-onboarding.md
dependencies: []
interfaces: []
dateCreated: 20261011
dateUpdated: 20261012
status: not_started
---

# Slice Design: Native setup-ide Install

## Overview

Port the guide's `scripts/setup-ide` (1769 lines of bash) and `scripts/setup-ide-lint.sh` (220 lines) into cf as TypeScript, so `cf setup-ide` installs IDE files itself instead of shelling out to `bash <guide>/scripts/setup-ide`.

The ai-project-guide is becoming docs only (PM decision 20261011). The same decision cancelled the guide's Python rewrite (its slice 121) and assigned the install to cf. The user-facing command doesn't change: `cf setup-ide <target> [--dry-run] [--write-lint]`, with the same targets and aliases, because guide content now points users at it.

Hard requirement: everything it writes stays byte-identical to what the bash version writes today. The spec is the guide's black-box suite (`tests/setup_ide/`, 76 tests, 61 snapshots), which moves into cf.

## Value

- **Users:** no bash dependency, and one tool owns the install end to end. The guide stops shipping executables into client repos, the PM's reason for going docs only: it's less obtrusive, and corporate agents flag fewer false positives.
- **cf maintainers:** the cross-repo scaffolding goes away: `--capabilities` probing, the flag text search, the old-guide `.bak` path, the copy-and-prune worktree fallback, and the `cf config get` callback from bash into cf. The install logic gets typed code and fast in-process tests.
- **Guide:** after release it deletes both scripts and its test suite.

## Technical Scope

**Included:**
- A TypeScript installer covering all four targets (claude, cursor, copilot, agents):
  - rule compilation into the CLAUDE.md/AGENTS.md/copilot managed blocks
  - modular rule, agent and skill copies
  - cursor `.mdc` conversion
  - copilot instruction files
  - the install manifest (write and prune)
  - legacy-marker migration and pre-managed backups
  - `rules.exclude`
  - dry run
  - the lint-config check and `--write-lint`
- Console output that matches the bash version line for line (the snapshots pin stdout, stderr and exit code).
- `cf setup-ide`, `cf init --ide` and the worktree loop call the installer directly. A worktree is installed by passing its root as the install target.
- Moving the guide's suite into cf: fixture guide, fixture data and snapshot files copied unchanged, harness and tests ported to vitest.
- Removing the code that existed only because cf and the guide shipped separately (see Migration Plan).

**Excluded:**
- Any change to the command surface, target names, aliases or output files, except the two bug fixes below.
- New targets or install features.
- `validate-slice-design` (slice 214).
- Guide-side removal of the scripts and the suite (the ai-project-guide session, after the cf release).

## Dependencies

### Prerequisites
- None. 214 is independent.
- The installed guide's source layout, which has been stable since v0.19: `project-guides/rules/`, `project-guides/agents/`, `project-guides/skills/`, `project-guides/lint/<lang>/`.

### Interfaces Required
- `GUIDE_RELATIVE_PATH` (`packages/core/src/guides/types.ts`).
- `ConfigManager` / config resolution for `rules.exclude`, read for the checkout being installed.
- `TARGETS`, `normalizeTarget` and the marker literals (`packages/cli/src/commands/ideTargets.ts`).
- `cksum`, `readManifest` and `parseManifestLine` (`packages/cli/src/commands/installManifest.ts`), which already implement the manifest format byte for byte.
- `propagationTargets` (`worktreePropagation.ts`), for the list of worktrees to install.
- Input document: the guide's `project-documents/user/analysis/120-analysis.setup-ide-port-findings.md` (guide commit 26908c1). It lists the bash behaviors a port has to reproduce. Read it from the guide repository checkout (`../ai-project-guide`), not from the installed guide: the installed tree has no `project-documents/user/` or `tests/`. The `tests/setup_ide/` sources for the migration also come from that checkout.

## Architecture

### Component Structure

New directory `packages/cli/src/ideInstall/`. Each file mirrors one area of the bash script and stays under ~300 lines:

| Module | Ports (bash function) | Responsibility |
|---|---|---|
| `installer.ts` | `main`, `run_target_setup`, `install_target` | Entry point `installIde(options)`. Dispatches to the target, finishes the manifest, runs the lint check, warns about unmatched exclusions. Maps install failures to exit 1. |
| `output.ts` | `print_status`, colors | `OutputSink` with stdout/stderr writers. Status lines with ANSI colors, as bash emits them. |
| `lines.ts` | awk record semantics | `toRecords(text)` / `fromRecords(lines)`. Splits on `\n`, keeps a final line with no newline, rewrites with `\n`, leaves `\r` in place. Also strips trailing newlines the way command substitution does. |
| `frontmatter.ts` | `has_always_apply`, `validate_frontmatter`, `get_apply_to`, `get_frontmatter_field`, `convert_paths_to_globs`, `strip_name_field` | Rule-file frontmatter reads and rewrites, each with its bash edge cases (findings doc, "Frontmatter helpers"). |
| `rules.ts` | `compile_claude_rules`, `compile_always_on_rules`, `rule_is_excluded`, `warn_unmatched_exclusions`, `always_apply_rule_matches` | Rule discovery in byte order, the two body extractors, section titles, exclusion matching (bash `case` globs over the basename) and its warnings. |
| `managedSection.ts` | `managed_state`, `write_managed_section`, `backup_premanaged_file` | managed / legacy / unmanaged / broken handling, the `.pre-context-forge` backup, temp file then rename. |
| `manifest.ts` | `begin_manifest`, `install_file`, `record_installed_file`, `finish_manifest`, `legacy_manifest_entries`, `remove_empty_install_dirs` | Ownership-checked installs and stale-file pruning. It absorbs the current `installManifest.ts`, so the reader and writer of the format live in one module. |
| `targets.ts` | `setup_claude`, `setup_cursor`, `setup_copilot`, `setup_agents`, `emit_agents_md`, `emit_copilot_instruction_files`, `remove_generated_prompt_files`, `copy_files`, `copy_skills`, `copy_cursor_rules`, `copy_claude_modular_rules` | Per-target install steps. Split into `targets/claude.ts` etc. if it passes ~300 lines. |
| `dryRun.ts` | `dry_run_install`, `list_install_files`, `report_dry_run_changes` | Copy the install paths into a temp sandbox, install there, report `+`/`~`/`-` in byte order. |
| `lint.ts` | all of `setup-ide-lint.sh` | Language detection, required-config checks, `--write-lint` writes. Reads from the project root and writes to the target root. |

Existing files that change:
- `setup-ide.ts`: calls `installIde` in place of the script, and drops capability probing and the `.bak` path. Keeps target validation, project resolution, the overwrite prompt and command delivery.
- `guideScript.ts`: deleted. `runSetupIdeInWorktrees` becomes a loop in `setup-ide.ts` that calls `installIde` with each worktree as the target root.
- `worktreePropagation.ts`: reduced to `propagationTargets`. The copy-and-prune fallback for pre-`--root` guides is deleted.
- `ideTargets.ts`: comments that call the guide "the sole writer" of the markers are updated. The literals stay.
- `packages/core/src/config/ConfigKeys.ts`: the `rules.exclude` description ("Consumed by the guide's setup-ide script, not by cf itself") and its validator comment ("The consuming script matches with a literal bash `case`") now name cf's installer. Validation is unchanged.

### Data Flow

1. `cf setup-ide <target>` resolves the project and normalizes the target, then reads `rules.exclude` from the config of the checkout being installed. The worktree loop reads it again for each worktree root and doesn't reuse the main checkout's value. That matches bash, which runs `cd "$PROJECT_ROOT" && cf config get rules.exclude` with `PROJECT_ROOT` set to the `--root` worktree. `rules.exclude` is a Shared-scope key, so a worktree on another branch can carry its own value.
2. `installIde({ guideDir, projectRoot, targetRoot, target, dryRun, writeLint, rulesExclude, out })`:
   - Real run: `targetRoot === projectRoot`.
   - Dry run: `dryRun.ts` creates a sandbox, copies the existing install paths into it (skipping `.claude/worktrees`), sets `targetRoot` to the sandbox and runs the install, writing the run's output to a buffer. It then prints the warning lines from the buffer and the change report. The sandbox is removed in a `finally` (`fs.rmSync(sandbox, { recursive: true, force: true })`), so it is also removed when the install aborts or throws. If the removal itself fails, that error propagates. Bash has no trap, so under `set -e` it leaks the sandbox whenever the install fails. This is an intended difference, and no snapshot covers it.
3. A target install reads guide sources and writes files under `targetRoot`:
   - Wholesale files go through `manifest.ts`, which checks ownership against the previous manifest.
   - Composite files go through `managedSection.ts`.
4. `finish_manifest` prunes stale, unedited files and writes `.context-forge/<target>.manifest`, sorted the same way as bash.
5. The lint check reads project files from `projectRoot` and writes missing configs under `targetRoot` when `writeLint` is set.
6. The return value is `{ exitCode: 0 | 1 }`. `cf setup-ide` turns 1 into a `UserError`. The worktree loop records which worktrees returned 1 and keeps going, as it does today (see Failure modes).

### State Management

All state is on disk in the target checkout: the installed files, the managed blocks, `.pre-context-forge` backups and `.context-forge/<target>.manifest`. The formats are unchanged, so an install written by the bash script is read and updated by cf, and the reverse.

## Technical Decisions

### Technology Choices

- **TypeScript in the CLI package, no new dependencies.**
  - `cksum` already exists.
  - Bash `case` globs (`*`, `?`, `[...]`) for `rules.exclude` are converted to an anchored RegExp by a small local function.
  - The dry-run sandbox uses `fs.mkdtempSync` and `fs.cpSync`.
- **Lives in `cli`, not `core`.** Every consumer (setup-ide, init, the worktree loop) is in the CLI, and the MCP server exposes no setup-ide tool. It moves if an MCP tool ever needs it.
- **Suite ported to vitest, snapshot files kept byte for byte.**
  - cf's CI and toolchain are Node only. Keeping pytest would add Python (py39) to cf's dev setup for one suite.
  - The harness is about 226 lines and the tests about 730. Porting them is mechanical.
  - The snapshot files carry the spec and copy over unchanged.
  - The harness calls `installIde` in-process with a capturing `OutputSink` rather than a subprocess. That's faster, and it doesn't touch the global command install or the project registry the way the full `cf setup-ide` command would.
  - Each test has one `.snap` file, so the harness compares with `expect(text).toMatchFileSnapshot(path)`. vitest's `-u` is the only update trigger; there is no env var. A missing snapshot fails in CI, which follows vitest's standard behavior.

### Patterns and Conventions

- **Fidelity rule:**
  - Reproduce every behavior a snapshot pins, and every behavior that changes output for the real guide's rules.
  - Where the bash does something odd that neither pins (examples: `echo -e` escape interpretation in status messages, the BSD-sed `s/bw/Ubw/g` fallback title, glob-expanding `rules.exclude` against the current directory), implement the evident intent and list the difference in the slice's implementation notes.
  - The real-guide parity check (Verification step 4) is what proves this choice changes no output for real installs.
- **Output literals defined once.** Status messages, emoji and colors are constants in `output.ts` or next to their use. Marker literals stay in `ideTargets.ts`.
- **Errors:**
  - Bash exits mid-run with `exit 1` after printing its messages. The port throws an internal `InstallAbort` once the messages are written, and `installIde` catches it at the boundary and returns exit 1.
  - A Node filesystem error (an `Error` with a string `code`, e.g. `EACCES`, `ENOSPC`, `EXDEV`) is an environment failure, not a bug. Bash under `set -e` prints the failing command's error and exits 1. `installIde` matches that: it writes `❌ <message>` to stderr and returns exit 1.
  - Any other exception propagates. It's a bug, not a reported install failure.
  - No swallowed errors (project exception rule). The handler in `installIde` is the install's process boundary, and every failure it maps still reaches the user.
- **Failure modes:**

  | Failure | Handling |
  |---|---|
  | Rules source dir missing (`project-guides/rules`) | `InstallAbort` with bash's `❌ ... Rules source directory not found` lines, exit 1. |
  | Agents or skills source dir missing | Skipped, as bash does (`if [ -d ... ]`): both are optional guide content. |
  | `copy_files` source dir missing | `❌ Source directory not found`, then the bash return-1 path, ported as is. |
  | Filesystem error mid-install | `❌ <message>` and exit 1 (above). |
  | Partial install (failure after some files are written) | The manifest isn't rewritten, as in bash. A re-run recovers on its own: a file that exists and is byte-equal to the guide's version is adopted (`install_file` only checks ownership when the content differs), and managed blocks are found by their markers. No extra recovery code. |
  | One worktree fails (exit 1 or filesystem error) | Recorded by name; the loop continues; the command exits non-zero naming them. That's today's behavior, since every bash failure is a process exit. |
  | One worktree throws anything else | Propagates and stops the loop: it's a bug, and the same input would fail in every worktree. |
- **Paths:** guide subdirectories (`project-guides/rules`, `agents`, `skills`, `lint`) are constants in one place in `ideInstall/`.

### PM decisions (confirmed 20261011)

1. **`rules.exclude` reads cf config only. The `CONTEXT_FORGE_RULES_EXCLUDE` env tier is dropped.** This supersedes the 20260922 ruling.
   - The PM ruling of 20260922 added the env tier only because the bash script could run without cf.
   - That case no longer exists, and cf's standing rule is that no config key can be overridden by an env var.
   - The two env-based snapshots (`test_rules_exclude_env_wins` and the env source line) are dropped. The active-source message names cf config, using the wording the bash prints for its cf source.
   - Rejected alternative: keep the env tier in cf, which goes against that config rule.
2. **Fix #40 (stray newline in the default `**` glob) and #38 (final newline added when a managed block is replaced).**
   - #40 writes broken YAML (`applyTo: "**` then `**"`) into copilot instruction files and the AGENTS.md "Applies to" line.
   - #38 breaks the stated rule that bytes outside the block pass through untouched.
   - Each fix is its own commit, updating only the snapshots that issue changes, with each diff checked to contain only that change. #40 touches 18 snapshots: the copilot fresh and prompts runs, the agents fresh run, the `test_managed_*_agents` runs and every `test_lint_*` run. #38 touches `test_managed_block_replaced_*` and any re-run test that replaces a block. (Corrected after the task review: this line first listed only two #40 snapshots.)
   - Cost: a one-time rewrite of affected files in existing installs. Rejected alternative: porting both bugs as is.

## Implementation Details

### Migration Plan

**What moves:**
- guide `scripts/setup-ide` and `scripts/setup-ide-lint.sh` → `packages/cli/src/ideInstall/*.ts`
- guide `tests/setup_ide/{fixture_guide,fixture_data,snapshots}` → `packages/cli/tests/ideInstall/` (copied as is, without `__pycache__`)
- guide `tests/setup_ide/{harness.py,conftest.py,test_*.py}` → `packages/cli/tests/ideInstall/*.test.ts` plus `harness.ts`

**Test disposition.** The suite tests two things: install behavior, which is the spec, and the bash script's own argument parsing, which goes away.

| Group | Disposition |
|---|---|
| `test_targets`, `test_managed_sections`, `test_ownership`, `test_lint`, `test_harness` | Ported, snapshots unchanged (except the #38/#40 fix commits). |
| `test_flags_dry_run_*` (3) | Ported, snapshots unchanged. |
| `test_flags_root_outside_guide` (`--root x` and `--root=x`) | One ported test: install with `targetRoot` set to another checkout. Snapshot kept (the run label stays `setup-ide <target> --root <ROOT>`, built by the harness). |
| `test_flags_capabilities`, `test_flags_root_missing_directory`, `test_flags_root_without_value`, `test_flags_before_target_same_as_after`, usage and unsupported-target runs | Dropped. They test the bash argument parser. cf's commander parsing and `normalizeTarget` already have tests in `setup-ide.test.ts`. |
| `test_rules_exclude`, `test_lint_python_excluded` | Ported with `rulesExclude` passed in-process. The cf-stub tiers become one cf-level test showing that a configured `rules.exclude` reaches the installer. Four snapshots currently set exclusions through the env var: `test_rules_exclude_env_wins`, `test_rules_exclude_always_on`, `test_rules_exclude_unmatched` and `test_lint_python_excluded`. `env_wins` is retired. The other three keep their scenario, but their active-source line changes from the env var to cf config. That spec change (PM decision 1) goes in its own commit with the reason, like the #38/#40 fixes. |
| `test_real_guide` | Ported as is: a smoke test with no snapshot. For each target it asserts exit 0, no `❌` in the output, and that the target's top-level files exist. It runs against the repo's installed guide at `project-documents/ai-project-guide/project-guides`, so guide content updates don't break it, and it keeps working after the bash script is gone. Byte parity is the job of walkthrough step 4, not this test. |

**Consumers updated in this slice:**
- `setup-ide.ts` (`setupIdeAction` and the command action)
- `init.ts`, through `setupIdeAction`; no code change expected
- the worktree loop

`guideScript.ts` and the copy-and-prune half of `worktreePropagation.ts` are deleted, along with their tests in `worktreePropagation.test.ts` and `setup-ide.test.ts` that mock `execFileSync('bash', ...)`.

**Behavior preserved:**
- The ported suite shows the files, manifest, output and exit code match the bash version on fixtures.
- The real-guide parity check shows byte-identical files for all four targets on the real guide, both for a fresh install and for a re-run over a bash-written install. It runs during implementation, while the bash script still exists.

**Old guides:** the installer reads only the guide's source folders, so any guide from v0.19 on works. No version probing is needed. A guide without `project-guides/rules` fails explicitly (see Failure modes).

**Guide coupling:** after the cf release, the ai-project-guide session removes `scripts/setup-ide`, `scripts/setup-ide-lint.sh` and `tests/setup_ide/`. An old cf paired with a newer guide then fails on the missing script. The PM accepted that.

### API Contracts

```ts
export interface OutputSink {
  stdout(text: string): void;
  stderr(text: string): void;
}

export interface InstallOptions {
  /** Guide checkout to read sources from (the main checkout's guide, also for worktrees). */
  guideDir: string;
  /** Checkout whose project files are inspected (lint detection). */
  projectRoot: string;
  /** Checkout written to. Equals projectRoot except in a dry-run sandbox. A worktree passes its own root as both. */
  targetRoot: string;
  target: Target;
  dryRun: boolean;
  writeLint: boolean;
  /** Patterns from `rules.exclude`, already split and trimmed. Empty = install everything. */
  rulesExclude: readonly string[];
  out: OutputSink;
}

export function installIde(options: InstallOptions): { exitCode: 0 | 1 };
```

The command surface is unchanged: `cf setup-ide <target> [--dry-run] [--write-lint] [--yes] [--project <id>]`.

## Integration Points

### Provides to Other Slices
- `installIde`, a typed, in-process install that any later cf command or MCP tool can call.
- One home for the manifest format (`ideInstall/manifest.ts`).

### Consumes from Other Slices
- Config resolution for `rules.exclude` (the config key from slice 926, unchanged).
- Worktree enumeration (`propagationTargets`), unchanged.

### Guide coordination
- Before release, tell the ai-project-guide session the cf version that stops calling `scripts/setup-ide`.
- The guide then removes the scripts and the suite in its next release, and finishes rewording rule files to `cf setup-ide <target> --write-lint` (already in progress).

## Success Criteria

### Functional Requirements
- `cf setup-ide <target>` for each of claude, cursor, copilot and agents (and the aliases openai and codex) installs without running bash or any guide script.
- Output files, manifests and console output match the snapshot suite.
- On the real guide, installs are byte-identical to the bash version, both fresh and when re-run over a bash-written install. Expected differences are limited to the #38/#40 fixes, plus, on Linux, any place where Linux bash output differed from macOS (see Risk Assessment). The fixes are approved.
- `--dry-run` reports `+`/`~`/`-` changes and writes nothing to the project. `--write-lint` writes missing lint configs; with `--dry-run` it previews them.
- Each registered worktree is installed from the main checkout's guide. A failing worktree doesn't stop the others, and the command exits non-zero naming them.
- `rules.exclude` from cf config excludes matching scoped rules, prunes previously installed ones that weren't edited, and warns on patterns that match nothing or name an always-on rule.
- `cf init --ide <target>` works unchanged.
- A project installed by the bash script is recognized: the managed blocks are replaced in place, the manifest drives pruning, and no `.pre-context-forge` backup is taken again.

### Technical Requirements
- The ported suite passes in vitest with the snapshot files unchanged, apart from fix commits named in the PM decisions.
- No `execFileSync('bash', ...)` or reference to `scripts/setup-ide` remains in `packages/`.
- Build, lint and the full test suite pass. New modules stay under ~300 lines and functions under ~50.
- `--help` text and README or command docs still describe `cf setup-ide` accurately.

### Integration Requirements
- The guide can delete `scripts/setup-ide`, `scripts/setup-ide-lint.sh` and `tests/setup_ide/` once a cf release containing this slice is out, without breaking that cf.

### Verification Walkthrough

From the context-forge repo root, after `pnpm -r build`:

1. **Suite:** `pnpm --filter @context-forge/cli test -- ideInstall` runs the ported tests, all passing against the copied snapshots.
2. **No shell-out:** `grep -rn "scripts/setup-ide\|'bash'" packages/*/src` returns nothing.
3. **Dry run on this repo** (claude target, already installed):
   ```bash
   node packages/cli/dist/index.js setup-ide claude --dry-run
   # 🔍 Dry run for 'claude' — nothing was written
   # 📋 No changes          (or only lines from the #38/#40 fixes)
   git status --short       # clean
   ```
4. **Real-guide parity**, run during implementation while the guide checkout still has the script. For each target:
   ```bash
   T=claude   # then cursor, copilot, agents
   A=$(mktemp -d); B=$(mktemp -d)
   for d in $A $B; do mkdir -p $d/project-documents; cp -R project-documents/ai-project-guide $d/project-documents/; done
   (cd $A && bash project-documents/ai-project-guide/scripts/setup-ide $T)
   node --input-type=module -e "
     const { installIde } = await import('$PWD/packages/cli/dist/ideInstall/installer.js');
     const out = { stdout: (t) => process.stdout.write(t), stderr: (t) => process.stderr.write(t) };
     const r = installIde({ guideDir: '$B/project-documents/ai-project-guide', projectRoot: '$B', targetRoot: '$B',
       target: '$T', dryRun: false, writeLint: false, rulesExclude: [], out });
     process.exit(r.exitCode);"
   diff -r --exclude=project-documents $A $B && echo "IDENTICAL $T"
   ```
   This calls the built installer directly, with no helper file, and skips the command layer (project registry, overwrite prompt, command delivery), which isn't under test here. For the re-run case, run bash in both trees, then run the `node` line on `$B` and check that `diff` still reports identical. The step needs the guide's bash script, so it runs during implementation, before the guide release removes the script. After that, the ported suite and `test_real_guide` are the regression net.
5. **Worktrees:** in a project with a registered worktree, `node packages/cli/dist/index.js setup-ide claude` prints `→ setup-ide in worktree: <name>`, and the worktree's `CLAUDE.md` and `.context-forge/claude.manifest` match the root's. Then, in the worktree only, run `node packages/cli/dist/index.js config set rules.exclude 'dart.md'` and run `setup-ide claude` from the main checkout again. The worktree's `.claude/rules/dart.md` is gone and the main checkout's is still there. Unset the key afterwards.
6. **rules.exclude:**
   ```bash
   node packages/cli/dist/index.js config set rules.exclude 'dart.md'
   node packages/cli/dist/index.js setup-ide claude
   ls .claude/rules/dart.md   # absent
   node packages/cli/dist/index.js config unset rules.exclude
   ```

## Risk Assessment

### Technical Risks
- **Byte-level drift on content the fixtures don't cover.** The fixture guide is small, so the real guide's rules can exercise paths no snapshot pins.
- **Platform-specific reference behavior.** The suite pins macOS awk, BSD sed and `LC_ALL=C` collation. Node string handling is the same on every platform, so cf output becomes platform-independent. Where Linux bash output differed from macOS, cf now always matches macOS.

### Mitigation Strategies
- The real-guide parity check (walkthrough step 4) runs for all four targets, fresh and re-run, before the slice is complete. Any diff is either fixed or listed as an intended difference and approved.
- Byte-order sorting (`LC_ALL=C` semantics) is implemented explicitly with a plain code-unit comparator, never `localeCompare`.

## Implementation Notes

### Development Approach
1. Copy the fixtures and snapshots, and port the harness and `test_harness`. The harness runs against a stub installer, and every behavior test fails red.
2. Lay down `lines.ts`, `output.ts` and `frontmatter.ts` with unit tests for each edge case in the findings doc.
3. Port in order of dependency, each step turning its tests green:
   1. the manifest writer
   2. managed sections
   3. rules compilation
   4. the targets: claude, then agents, copilot, cursor
   5. dry run
   6. lint
4. Run the real-guide parity check and resolve every diff.
5. Wire `cf setup-ide`, `cf init` and the worktree loop to `installIde`, and delete `guideScript.ts`, the copy-and-prune propagation and their tests.
6. Fix #40 and then #38, each in its own commit with its snapshot updates.
7. Update docs that describe setup-ide as a guide script.

### Special Considerations
- Keep the ported tests' names identical to the pytest names, so the snapshot files map one to one.
- The findings doc lists `cksum` test data: `fixture_data/analyze-SKILL.md` gives `4163870229 9896`. The existing `installManifest.test.ts` covers the algorithm, and it carries over.
- After release, send the ai-project-guide session the cf version. Until then the guide keeps both scripts.

### Design review resolutions (215-review.slice, CONCERNS)
- **F004 filesystem failure handling:** added the filesystem-error rule and the Failure modes table under Errors. Partial installs recover on re-run because of how `install_file` already works, so no new code is needed.
- **F005 dry-run cleanup:** the sandbox is removed in `finally` (Data Flow step 2).
- **F006 parity check:** step 4 now calls the built `installIde` directly. `test_real_guide` is defined as a snapshot-free smoke test that keeps working after the script is removed.
- **F007 `rules.exclude` scope:** read per worktree root, matching bash. Walkthrough step 5 checks it.
- **F008 Linux:** added to the expected differences in Success Criteria.
- **F009 input doc location:** read from the guide repository checkout (Dependencies).
- **F010 snapshot trigger:** single trigger, vitest `-u` via `toMatchFileSnapshot`.
- Found while resolving these: the `rules.exclude` config description in `ConfigKeys.ts` still names the guide script as the consumer, so that file is added to the change list.

### Implementation notes

Intended differences from the bash script. None changes output for the real guide: the parity check (walkthrough step 4) gave IDENTICAL for all 8 runs (4 targets, fresh and re-run over a bash install) before the #38/#40 fixes, with no port fixes needed.

- **`echo -e`:** status messages are written as plain text; bash also interpreted backslash escapes in them (file names, patterns).
- **Claude fallback section title** (a rule with no heading): implements the intended `\b\w` → uppercase, e.g. `my-rule.md` → `My Rule Rules`. BSD sed ran it as `s/bw/Ubw/g`.
- **`rules.exclude` matching:** patterns are not glob-expanded against the current directory (the unquoted `for pattern in $RULES_EXCLUDE` bug). POSIX bracket classes such as `[[:alpha:]]` are not supported.
- **Dry-run sandbox:** removed in a `finally`, so an aborted install no longer leaks it.
- **Platform:** sorting and globbing always use byte order (bash under `LC_ALL=C` on macOS). On Linux or under another locale, bash could order manifests and globs differently; cf output is now the same everywhere.
- **Bytes outside the managed block** are handled byte-exactly, including content that is not valid UTF-8.
- **`.bak`:** cf no longer writes `<file>.bak` before an install. The installer's one-time `.pre-context-forge` backup covers it, as it already did for capability-reporting guides.

Test migration:
- Not ported, as the design's disposition table says: the bash argument-parser tests (`--capabilities`, `--root` parsing and errors, flag order, usage and unsupported-target runs) plus the run-from-subdirectory test, which exercised the script's project-root search. Their 6 snapshots were deleted. `test_flags_root_outside_guide` keeps the `--root <ROOT>` snapshot.
- The cf-stub source-tier tests (`old_cf`, `no_cf`, `cf_exit1`, `cf_exit2`) and `env_wins` were retired with the env tier (PM decision 1). `cf_value` and `prunes` were kept with `rulesExclude` passed in-process; their snapshots did not change.
- `test_harness_snapshot_missing_file_fails` was not ported: vitest's `toMatchFileSnapshot` owns that behavior (it fails on a missing file in CI).

Removed with the script plumbing: `guideScript.ts`, the copy-and-prune worktree code, and what only that path used: the manifest reader (`readManifest`, `parseManifestLine`, `manifestTempPath`) and the `propagateDirs`/`generatedPromptDirs` descriptor fields. `parseRulesExclude` (core) is the single parser for the key, used by the validator and by each install.

Release note: `tsc` does not delete outputs of removed sources, so a `packages/cli/dist/` built before this slice holds stale `commands/guideScript.*` and `commands/installManifest.*` files (removed from this checkout). Clean `dist/` before the publish build.

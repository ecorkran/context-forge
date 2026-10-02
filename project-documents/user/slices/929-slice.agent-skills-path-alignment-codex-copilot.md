---
docType: slice-design
slice: agent-skills-path-alignment-codex-copilot
project: context-forge
parent: user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: []
interfaces: [930]
dateCreated: 20261002
dateUpdated: 20261002
status: not_started
---

# Slice Design: Agent Skills Path Alignment (Codex + Copilot)

## Overview

Fixes GitHub issues #99 and #102. Both move cf's skill delivery onto the shared Agent Skills directory, `.agents/skills`.

- **#99:** `cf install-commands --ide codex` writes machine-level skills to `~/.codex/skills`. Codex's own source (`codex-rs/ext/skills/src/host_roots.rs`, checked via context7 on 20261002) calls that location "Deprecated user skills location (`$CODEX_HOME/skills`), kept for backward compatibility" and adds `$HOME/.agents/skills` as the user-scope root. Squadron's `sq install-commands` already writes to `~/.agents/skills`. The PM's own machine shows the split today: `sq-*` skills sit in `~/.agents/skills` and `cf-*` skills sit in `~/.codex/skills`.
- **#102:** Since guide 0.18.1, the guide's `setup-ide copilot` writes skills to `.agents/skills/<name>/SKILL.md` instead of `.github/prompts/*.prompt.md`. cf's copilot propagation descriptor still lists only `.github/instructions` and `.github/prompts`, so worktrees of copilot-only projects get no skills. Right now the gap is latent. The guide dropped its only shipped skill (`analyze`) in 0.18.1, and no release through v0.19.2 has a `project-guides/skills/` source, so `setup-ide` installs no skills on any target today. The fix still belongs here: it is a one-line descriptor change that is correct today and becomes live the moment the guide ships skills again.

This overrides slice 924's D2. D2 picked `~/.codex/skills` from the Codex docs of the time and said there was "no `.agents` equivalent at machine level". That is no longer true. The 924 live check (skills discovered from `~/.codex/skills`) still holds, but only because Codex keeps reading the deprecated path.

## Value

- Codex users get cf skills in the location Codex is moving toward, the same place squadron writes. They stop getting a second, deprecated copy.
- Existing installs migrate on their own: the next `cf install-commands --ide codex` (or `cf setup-ide codex`, or `cf init --ide codex`) moves cf's skills out of `~/.codex/skills` and leaves everything else there alone.
- Copilot worktrees get the same skills as the project root.

## Technical Scope

**Included**
- Change the `agents` command target's machine-level dir to `~/.agents/skills`.
- Remove cf's bundled skills from the legacy `~/.codex/skills` on every default-scope install and uninstall for the `agents` target.
- Add `.agents/skills` to the copilot descriptor's `propagateDirs` in `setup-ide.ts`.
- Update the README's copilot layout line, the `agents` dir comment in `commandInstaller.ts`, and the tests that pin the old path. Add a CHANGELOG entry.

**Excluded**
- Honoring `CODEX_HOME`. cf never did, and the new location is the cross-tool `~/.agents/skills`, which doesn't depend on Codex's home.
- Stale `.github/prompts/*.prompt.md` files already copied into worktrees by earlier propagation. The guide removes its old generated prompt files at the project root, but worktree copies stay behind. That is the "stale guide files in worktrees" problem, so it goes to slice 930 (see Integration Points).
- Any change to `--local` (already `.agents/skills`) or the `claude` target.

## Dependencies

### Prerequisites
- None in cf. #102 is only useful with guide ≥ 0.18.1, which is when the copilot target started writing `.agents/skills`. With an older guide the new `propagateDirs` entry is skipped because the source dir doesn't exist, and propagation already guards for that (`if (!fs.existsSync(srcDir)) continue;`).

### Interfaces Required
- `COMMAND_TARGETS` descriptor and `installSkillDirs` / `uninstallCommands` in `packages/cli/src/commands/commandInstaller.ts`.
- `TARGETS` descriptor and `propagateToWorktrees` in `packages/cli/src/commands/setup-ide.ts`.

## Architecture

### Component Structure

Two independent descriptor edits plus one small function. No new modules.

```
commandInstaller.ts
  COMMAND_TARGETS.agents.globalDir      ~/.codex/skills  →  ~/.agents/skills
  COMMAND_TARGETS.agents.legacyGlobalDir (new, optional)  →  ~/.codex/skills
  sweepLegacyGlobalDir(target)          new; same-dir guard, then uninstallCommands(target, legacyDir)
  installCommandsForTarget / uninstall  call it when scope is the default

setup-ide.ts
  TARGETS.copilot.propagateDirs         + '.agents/skills'
```

### Data Flow

**Default-scope install, `agents` target** (`cf install-commands --ide codex`, and `setup-ide`/`init`, which use the default scope):
1. Resolve dir → `~/.agents/skills`. Copy the bundled `cf-*` skill dirs and prune stale `cf-*` there (unchanged behavior, new path).
2. If the descriptor has a `legacyGlobalDir` and the scope is the default (no `--local`, no `--target`), run `sweepLegacyGlobalDir`:
   - A missing legacy dir is a no-op.
   - **Same-dir guard:** if `realpath(legacyDir) === realpath(installDir)` (one path symlinked to the other), skip the sweep. The skills just written are the ones that would be deleted, and there is nothing to migrate.
   - Otherwise call the existing `uninstallCommands(target, legacyDir)`, which removes exactly the bundled skill names and nothing else.
3. Report the install as today. If the sweep removed anything, print one separate line naming the legacy dir and the removed skills, for example `Removed 9 skills from legacy location <legacyDir>: $cf-build, …`. If nothing was removed, print no line.

**Default-scope uninstall, `agents` target:** remove the bundled skills from `~/.agents/skills` (unchanged logic and unchanged `Removed N skills from <installDir>` line), then run the same sweep. Its removals get their own line in the same format as on install, so each count is printed next to the folder it actually came from. The "No skills found to remove." message prints only when both the install dir and the legacy dir had nothing.

**Copilot propagation:** `propagateToWorktrees` copies `.agents/skills` from the root to each worktree with the same `cpSync` path as every other `propagateDirs` entry.

### State Management

No new state. The sweep removes only the skill names cf bundles (`packages/cli/commands/codex/`), which is the rule `uninstallCommands` already uses. No Codex skill has ever been removed or renamed (git history of `packages/cli/commands/codex/` has no deletes or renames), so the bundled set is every name cf has ever written to `~/.codex/skills`. Codex's own `.system`, user skills (including a hand-made `cf-something`), and other tools' skills are never touched. The legacy dir itself is never removed.

## Technical Decisions

### Technology Choices

- **D1: Machine-level `agents` dir is `~/.agents/skills` (supersedes 924 D2).** Evidence: Codex `host_roots.rs`, user layer, as quoted in the Overview. It also matches squadron (its slice 925, D2), so the shared `claude | agents` target vocabulary now resolves to the same paths in both tools.
- **D2: Sweep the legacy dir on every default-scope install and uninstall, not only when old skills are found.** "Only when found" requires reading the dir either way, so it is the same check with the same cost (one `readdir`). Running it every time keeps it self-healing: a machine that later gets an older cf's install in `~/.codex/skills` is cleaned up on the next install. It reports only when it removed something. It runs only for the default scope, because `--local` and `--target` never wrote to `~/.codex/skills`.
- **D3: The sweep reuses `uninstallCommands`, with bundled names as the ownership rule.** The broader stale-prune rule (`cf-` prefix plus `SKILL.md`) is right inside the folder cf actively manages, but it would also delete a hand-made `cf-*` skill from a folder cf is leaving. Bundled names catch every skill cf ever wrote there (see State Management) and nothing else, and the code already exists. If a skill is ever dropped from the bundle later, it will have been installed to `~/.agents/skills` by then, where stale-prune handles it.
- **D3a: Same-directory guard.** The sweep compares the real paths of the legacy and install dirs and skips when they are equal. This is the same self-targeting trap `propagateToWorktrees` already guards against for the default worktree.
- **D3b: Failure partway through the sweep.** Errors propagate with their real message, and the command exits non-zero after a successful install. The sweep is idempotent, so the next install or uninstall finishes it. There is no rollback, because a half-swept legacy dir does no harm: Codex still finds every skill in `~/.agents/skills`.
- **D4: Copilot keeps `.github/prompts` in `propagateDirs`.** After the guide's migration that dir only holds hand-written prompt files, if any, and copying those to worktrees is still what a user would want. Dropping the entry buys nothing.
- **D5: `legacyGlobalDir` is a single optional descriptor field, not a list.** There is one legacy location. The `claude` target doesn't set it.

### Patterns and Conventions

- Descriptor-driven, matching `COMMAND_TARGETS` and setup-ide's `TARGETS`. The legacy path lives in the descriptor, not in a conditional on the target name.
- Sweep errors propagate like install errors (no swallowing). An unreadable legacy dir fails the command with its real error.

## Implementation Details

### Migration Plan

- **Source:** `~/.codex/skills/cf-*/` (written by cf 0.13.0 through the current release).
- **Destination:** `~/.agents/skills/cf-*/`.
- **Mechanism:** install into the destination first, then sweep the source with the same-dir guard. If the install throws, the sweep never runs, so a failed upgrade never leaves the user with no skills.
- **Consumers:** `installCommandsAction` (CLI `install-commands`), `installCommandsForTarget` (`setup-ide`, line 294), `init` (line 141). All three use the default scope, so all three migrate without changes at the call sites.
- **Behavior preserved:** `--local` and `--target` resolve exactly as before. The `claude` target is untouched. Skill content and names are unchanged.

## Integration Points

### Provides to Other Slices
- **930 (Prune Stale Guide Files in Worktrees):** 929 adds `.agents/skills` to copilot's `propagateDirs`, which 930's worktree pruning has to cover too. 929 also leaves 930 one more input. Worktrees propagated before guide 0.18.1 can hold generated `.github/prompts/*.prompt.md` files (marked `<!-- context-forge:generated -->`) that the guide's manifest doesn't list. The guide removes those at the root with a marker check, so 930 needs the same check in worktrees. Add this to 930's plan entry when this design is accepted.

### Consumes from Other Slices
- Nothing new. 924's descriptor and stale-prune structure is reused as-is.

## Success Criteria

### Functional Requirements
1. `cf install-commands --ide codex` (no scope flags) installs the bundled skills to `~/.agents/skills/cf-*/` and prints that path.
2. The same command removes cf's bundled skills from `~/.codex/skills` and prints one separate line listing what it removed from the legacy location. If nothing was there, it prints no legacy line.
3. Everything else in `~/.codex/skills` (`.system`, user skills, a hand-made `cf-*` skill not in the bundle) is untouched, and the directory itself remains.
4. `cf uninstall-commands --ide codex` removes cf skills from both `~/.agents/skills` and `~/.codex/skills`, printing each folder's removals on its own line.
4a. When `~/.codex/skills` and `~/.agents/skills` resolve to the same real directory, install leaves the just-installed skills in place and sweeps nothing.
5. `--local` and `--target <dir>` behave exactly as before and never touch `~/.codex/skills`.
6. `cf setup-ide codex` and `cf init --ide codex` produce the same result as criteria 1 and 2.
7. `cf setup-ide copilot` in a project with registered worktrees copies the root's `.agents/skills` (when present) into each worktree, alongside `.github/instructions` and `.github/prompts`.

### Technical Requirements
- The `resolveInstallDir('agents')` test expects `~/.agents/skills`.
- New `commandInstaller` tests (temp dirs, `os.homedir` stubbed):
  - default-scope install sweeps the legacy dir;
  - the sweep keeps entries not in the bundle, including a hand-made `cf-*` skill with a `SKILL.md`;
  - `--local`/`--target` skip the sweep;
  - uninstall sweeps and reports legacy removals on their own line;
  - a missing legacy dir is a no-op;
  - a legacy dir symlinked to the install dir is skipped, and the installed skills survive;
  - an install failure leaves the legacy dir untouched.
- The setup-ide copilot propagation test also asserts the `.agents/skills` `cpSync` call.
- The sweep calls `uninstallCommands` and does not duplicate its removal logic.
- No `any`. `pnpm -r build` and all package test suites pass.
- Docs:
  - README copilot layout line reads `.github/instructions/` plus `.agents/skills/<name>/SKILL.md`.
  - The code comment on `globalDir` cites the Codex source, replacing "design D2".
  - CHANGELOG entry under Unreleased.
  - 924's design gets a one-line "superseded by 929" note on D2, in the same style as its D5 note.

### Integration Requirements
- After this slice, `sq install-commands --ide codex` and `cf install-commands --ide codex` write to the same machine-level directory.

### Verification Walkthrough

Use the local build (the global `cf` is the published npm package):

```bash
cd /Users/manta/source/repos/manta/context-forge
pnpm -r build
```

**1. Codex migration on a real machine (#99).** The PM's machine has cf skills in the legacy location right now:

```bash
ls ~/.codex/skills      # expect cf-build ... cf-status (9 dirs), possibly .system
ls ~/.agents/skills     # expect sq-* and others, no cf-*
node packages/cli/dist/index.js install-commands --ide codex
```

Expected output: an `Installed 9 skills to ~/.agents/skills (Codex)` line, the `$cf-*` invocation list, and a line saying the 9 `cf-*` skills were removed from the legacy `~/.codex/skills`.

```bash
ls ~/.codex/skills      # no cf-* left; .system (if present) still there
ls ~/.agents/skills     # cf-* now alongside sq-*
node packages/cli/dist/index.js install-commands --ide codex   # re-run: no legacy line
```

**2. Codex discovers the skills from the new location.** Start `codex` in any project and type `$cf-` at the prompt. Each cf skill should appear exactly once (no duplicates from two roots). Run `$cf-status` and confirm it runs `cf status`.

**3. Scope flags don't touch the legacy dir.** Recreate a dummy legacy skill, then use `--local`:

```bash
mkdir -p ~/.codex/skills/cf-dummy && echo x > ~/.codex/skills/cf-dummy/SKILL.md
cd "$(mktemp -d)" && node /Users/manta/source/repos/manta/context-forge/packages/cli/dist/index.js install-commands --ide codex --local
ls ~/.codex/skills      # cf-dummy still present
node /Users/manta/source/repos/manta/context-forge/packages/cli/dist/index.js uninstall-commands --ide codex
ls ~/.codex/skills      # cf-dummy gone (default-scope uninstall sweeps legacy)
```

Re-run step 1's install afterward to restore the machine-level skills.

**4. Copilot worktree propagation (#102).** No guide release currently ships skills, so seed one at the root. The guide's prune only removes files its own manifest lists, so it leaves the seeded skill alone. Use a scratch project with one registered worktree, isolated from the real project store the same way slice 928's walkthrough did (the `CONTEXT_FORGE_DATA_DIR` env var plus a `cf` wrapper script):

```bash
# in the scratch project root (a git repo with project-documents/ and the guide installed)
git worktree add ../scratch-wt -b wt-test
cf worktree init --name wt --path "$(cd ../scratch-wt && pwd)"
mkdir -p .agents/skills/demo && printf -- '---\nname: demo\ndescription: seeded\n---\n' > .agents/skills/demo/SKILL.md
cf setup-ide copilot --yes
ls ../scratch-wt/.agents/skills # expect: demo
```

On a build without this slice, the same steps leave `../scratch-wt/.agents/skills` missing.

## Implementation Notes

### Development Approach
1. Change `globalDir`, add `legacyGlobalDir`, `sweepLegacyGlobalDir` (same-dir guard, then `uninstallCommands`), and the calls from install and uninstall, then the reporting lines. Add the tests.
2. Copilot `propagateDirs` entry and its test assertion.
3. Docs, CHANGELOG, the 924 D2 supersede note, and the 930 plan-entry addition.
4. Run walkthrough steps 1–4.

### Special Considerations
- The sweep deletes directories in the user's home directory. It removes only the nine names cf bundles, which are exactly what cf wrote there, and it skips when the two folders are the same real directory. A hand-made skill there is never touched, even with a `cf-` prefix.

## Review Resolution (20261002)

Slice review: `user/reviews/929-review.slice.agent-skills-path-alignment-codex-copilot.md` (CONCERNS, deepseek-v4.1-flash, reviewedSha 3a9ab36).

- **F002 (legacy dir aliasing the install dir): accepted.** Added the real-path guard (D3a, criterion 4a, test).
- **F003 (copilot step not demonstrable): accepted.** Confirmed: no guide release through v0.19.2 ships skills. The Overview states that #102 is latent, and walkthrough step 4 seeds a skill at the root. The descriptor fix stays in scope.
- **F004 (uninstall reporting): accepted.** Legacy removals print on their own line on both install and uninstall (Data Flow, criterion 4).
- **F005 (deleting from a folder cf is leaving): accepted, resolved differently than suggested.** No dry-run or backup. The sweep now removes only bundled skill names via `uninstallCommands` (D3), so a hand-made `cf-*` skill is never removed. This also drops the extracted helper from the original D3.
- **F006 (failure partway through the sweep): accepted.** The behavior is stated in D3b: errors propagate, and the next run completes the sweep.


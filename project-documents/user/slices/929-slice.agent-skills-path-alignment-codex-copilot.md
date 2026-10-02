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
- **#102:** Since guide 0.18.1, the guide's `setup-ide copilot` writes skills to `.agents/skills/<name>/SKILL.md` instead of `.github/prompts/*.prompt.md`. cf's copilot propagation descriptor still lists only `.github/instructions` and `.github/prompts`, so worktrees of copilot-only projects get no skills.

This overrides slice 924's D2. D2 picked `~/.codex/skills` from the Codex docs of the time and said there was "no `.agents` equivalent at machine level". That is no longer true. The 924 live check (skills discovered from `~/.codex/skills`) still holds, but only because Codex keeps reading the deprecated path.

## Value

- Codex users get cf skills in the location Codex is moving toward, the same place squadron writes. They stop getting a second, deprecated copy.
- Existing installs migrate on their own: the next `cf install-commands --ide codex` (or `cf setup-ide codex`, or `cf init --ide codex`) moves cf's skills out of `~/.codex/skills` and leaves everything else there alone.
- Copilot worktrees get the same skills as the project root.

## Technical Scope

**Included**
- Change the `agents` command target's machine-level dir to `~/.agents/skills`.
- Sweep cf-owned skills out of the legacy `~/.codex/skills` on every default-scope install and uninstall for the `agents` target.
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

Two independent descriptor edits plus one extracted helper. No new modules.

```
commandInstaller.ts
  COMMAND_TARGETS.agents.globalDir      ~/.codex/skills  →  ~/.agents/skills
  COMMAND_TARGETS.agents.legacyGlobalDir (new, optional)  →  ~/.codex/skills
  removeManagedSkillDirs(dir, keep)     (extracted from installSkillDirs' prune loop)
  installCommandsForTarget / uninstall  call the sweep when scope is the default

setup-ide.ts
  TARGETS.copilot.propagateDirs         + '.agents/skills'
```

### Data Flow

**Default-scope install, `agents` target** (`cf install-commands --ide codex`, and `setup-ide`/`init`, which use the default scope):
1. Resolve dir → `~/.agents/skills`. Copy the bundled `cf-*` skill dirs and prune stale `cf-*` there (unchanged behavior, new path).
2. If the descriptor has a `legacyGlobalDir` and the scope is the default (no `--local`, no `--target`): call `removeManagedSkillDirs(legacyDir, keep = ∅)`. A missing legacy dir is a no-op.
3. Report the install as today. If the sweep removed anything, add one line naming the legacy dir and the removed skills.

**Default-scope uninstall, `agents` target:** remove the bundled skills from `~/.agents/skills` (unchanged logic), then run the same legacy sweep, so an uninstall after upgrading leaves nothing behind in either place.

**Copilot propagation:** `propagateToWorktrees` copies `.agents/skills` from the root to each worktree with the same `cpSync` path as every other `propagateDirs` entry.

### State Management

No new state. Ownership in the legacy dir uses the rule the installer already applies when it prunes stale skills: a directory is cf-owned if its name starts with `cf-` and it contains a `SKILL.md`. Codex's own `~/.codex/skills/.system`, user skills, and other tools' skills fail that test and are never touched. The legacy dir itself is never removed.

## Technical Decisions

### Technology Choices

- **D1: Machine-level `agents` dir is `~/.agents/skills` (supersedes 924 D2).** Evidence: Codex `host_roots.rs`, user layer, as quoted in the Overview. It also matches squadron (its slice 925, D2), so the shared `claude | agents` target vocabulary now resolves to the same paths in both tools.
- **D2: Sweep the legacy dir on every default-scope install and uninstall, not only when old skills are found.** "Only when found" requires reading the dir either way, so it is the same check with the same cost (one `readdir`). Running it every time keeps it self-healing: a machine that later gets an older cf's install in `~/.codex/skills` is cleaned up on the next install. It reports only when it removed something. It runs only for the default scope, because `--local` and `--target` never wrote to `~/.codex/skills`.
- **D3: Same ownership rule, one helper.** Extract the prune loop in `installSkillDirs` (`cf-` prefix, `SKILL.md` present, not in `keep`) into `removeManagedSkillDirs(dir, keep): string[]`. Install prune calls it with `keep` = bundled names. The legacy sweep calls it with an empty `keep`, which also removes skills that older cf versions shipped and later dropped. That is correct for a location cf is leaving.
- **D4: Copilot keeps `.github/prompts` in `propagateDirs`.** After the guide's migration that dir only holds hand-written prompt files, if any, and copying those to worktrees is still what a user would want. Dropping the entry buys nothing.
- **D5: `legacyGlobalDir` is a single optional descriptor field, not a list.** There is one legacy location. The `claude` target doesn't set it.

### Patterns and Conventions

- Descriptor-driven, matching `COMMAND_TARGETS` and setup-ide's `TARGETS`. The legacy path lives in the descriptor, not in a conditional on the target name.
- Sweep errors propagate like install errors (no swallowing). An unreadable legacy dir fails the command with its real error.

## Implementation Details

### Migration Plan

- **Source:** `~/.codex/skills/cf-*/` (written by cf 0.13.0 through the current release).
- **Destination:** `~/.agents/skills/cf-*/`.
- **Mechanism:** install into the destination first, then sweep the source. If the install throws, the sweep never runs, so a failed upgrade never leaves the user with no skills.
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
2. The same command removes every `cf-*` directory containing a `SKILL.md` from `~/.codex/skills` and prints one line listing what it removed from the legacy location. If nothing was there, it prints no legacy line.
3. Non-cf content in `~/.codex/skills` (`.system`, user skills, `cf-`-prefixed dirs without a `SKILL.md`) is untouched, and the directory itself remains.
4. `cf uninstall-commands --ide codex` removes cf skills from both `~/.agents/skills` and `~/.codex/skills`.
5. `--local` and `--target <dir>` behave exactly as before and never touch `~/.codex/skills`.
6. `cf setup-ide codex` and `cf init --ide codex` produce the same result as criteria 1 and 2.
7. `cf setup-ide copilot` in a project with registered worktrees copies `.agents/skills` into each worktree, alongside `.github/instructions` and `.github/prompts`.

### Technical Requirements
- The `resolveInstallDir('agents')` test expects `~/.agents/skills`.
- New `commandInstaller` tests (temp dirs, `os.homedir` stubbed):
  - default-scope install sweeps the legacy dir;
  - the sweep keeps non-owned entries;
  - `--local`/`--target` skip the sweep;
  - uninstall sweeps;
  - a missing legacy dir is a no-op;
  - an install failure leaves the legacy dir untouched.
- The setup-ide copilot propagation test also asserts the `.agents/skills` `cpSync` call.
- `removeManagedSkillDirs` is the only implementation of the ownership rule (DRY with stale-prune).
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

**4. Copilot worktree propagation (#102).** Needs guide ≥ 0.18.1. Use a scratch project with one registered worktree, isolated from the real project store the same way slice 928's walkthrough did (the `CONTEXT_FORGE_DATA_DIR` env var plus a `cf` wrapper script):

```bash
# in the scratch project root (a git repo with project-documents/ and the guide installed)
git worktree add ../scratch-wt -b wt-test
cf worktree init --name wt --path "$(cd ../scratch-wt && pwd)"
cf setup-ide copilot --yes
ls .agents/skills               # skills written by the guide at the root
ls ../scratch-wt/.agents/skills # same skills, propagated
```

Before this slice, the last command fails with "No such file or directory".

## Implementation Notes

### Development Approach
1. Extract `removeManagedSkillDirs` from `installSkillDirs` with no behavior change. Existing prune tests must stay green.
2. Change `globalDir` and add `legacyGlobalDir` plus the sweep in install and uninstall, then the reporting line. Add the tests.
3. Copilot `propagateDirs` entry and its test assertion.
4. Docs, CHANGELOG, the 924 D2 supersede note, and the 930 plan-entry addition.
5. Run walkthrough steps 1–4.

### Special Considerations
- The sweep deletes directories in the user's home directory. Its only guard is the existing ownership rule, which has been in production since 0.13.0 for stale-prune in the same layout. A user's hand-made skill named `cf-something` with a `SKILL.md` in `~/.codex/skills` would be removed. That is the same exposure stale-prune already has in the install dir, and the `cf-` prefix is cf's namespace.

---
docType: slice-design
project: context-forge
slice: 925
parent: user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: [916]
dateCreated: 20260909
dateUpdated: 20260909
status: not_started
review: none
---

# Slice 925: Guide Install Robustness

Fixes GitHub issues #80, #81, #82. All three live on the guide install/detect path in `packages/core/src/guides/` and surface through `cf init`, `cf guides *`, and the MCP `guide_*` tools. Driver: a multi-developer team evaluated adopting the guide via `cf init` and found that teammates who are not submodule-aware silently get an empty guide tree, that the one strategy which avoids the problem is hidden behind the name `manual`, and that nothing tells them the guide directory is managed content.

## Overview

Three changes, in dependency order:

1. **Submodule auto-init (#80).** Detect the "submodule registered but never checked out" state that a plain `git clone`/`git pull`/CI checkout leaves behind, and initialize it before any command reads the guide. Today `GuideDetector` treats an empty gitlink directory as a valid installation.
2. **Tarball strategy surfacing (#81).** Rename the strategy value `manual` to `tarball` (with `manual` as a deprecated alias), expose `--strategy` on `cf init`, and describe the three strategies' trade-offs in help and README. The default stays `submodule` (PM decision, 20260909).
3. **Managed-directory statement (#82).** Say, in `cf guides info` and the README, that `project-documents/ai-project-guide` is overwritten on update and that customizations belong under `project-documents/user/`.

## Value

- A fresh clone of a project that uses the submodule strategy works on the first `cf build` instead of producing a confusing "no prompt file found" error or, worse, a context built from an empty tree.
- Users can choose the tarball strategy from `cf init` with an informed one-line comparison, instead of discovering it by reading `dist/`.
- The customization rule becomes discoverable before someone loses edits to `cf guides update`.

## Technical Scope

**Included**

- `GuideDetector`: distinguish an initialized submodule checkout from an uninitialized gitlink; report it in `GuideInfo`.
- `GuideManager.ensureCheckout()`: a single entry point that initializes an uninitialized submodule and reports what it did; called from every CLI command and MCP tool that reads guide content.
- Strategy rename `manual` → `tarball` with alias normalization at every input boundary (config, CLI flag, MCP parameter); canonical value used internally and in all output.
- `cf init --strategy <method>` pass-through to `guidesInstallAction`.
- Help text for `cf init` and `cf guides install` listing all three strategies with trade-offs; README section on choosing a strategy, including why submodule remains the default.
- Remove the silent `catch` fallbacks in `GuideManager.resolveStrategy()` and `resolveSource()`; source the strategy default from `ConfigKeys` instead of a second hard-coded literal.
- `cf guides info` prints a managed-directory line; README states the rule.
- Tests for each of the above; CHANGELOG and DEVLOG entries.

**Excluded**

- Changing the default strategy. Submodule stays the default; the README explains why (see D5).
- A README stub inside the vendored guide directory. Every strategy replaces that directory wholesale on update, so `cf` cannot maintain a file there. Filed upstream as ecorkran/ai-project-guide#19.
- CI checkout configuration (`submodules: recursive` on `actions/checkout`). Per-consuming-project; covered by the upstream issue's README callout.
- Auto-correcting a submodule whose checkout is *initialized but at a different commit* than the pinned gitlink. See D2 for why this is a warning, not an action.
- Any change to the clone strategy beyond the rename sweep.

## Dependencies

### Prerequisites

- Slice 916 (guide update branch guard) — complete. `ensureCheckout()` must not trip the branch guard; it initializes a checkout at the already-pinned commit and never changes the host repo's pointer, so the guard does not apply.
- 0.13.1/0.13.2 error-surfacing work in `gitExec.ts` (#77, #78) — shipped. Auto-init reuses `withNetworkErrorHint` and `GUIDE_OFFLINE_REMEDIATION`.

### Interfaces Required

- `gitExec` / `isGitAvailable` from `packages/core/src/guides/gitExec.ts`.
- `GuideDetector.checkSyncStatus()` (`GuideDetector.ts:149`) — already parses `git submodule status` into `in_sync | out_of_sync | not_initialized | error`. This is the detection primitive; nothing new is needed to recognize the state.
- `ConfigManager.get()` returning `{ value, source: 'default' }` for unset keys — the basis for removing the duplicated default.

## Architecture

### Component Structure

```
packages/core/src/guides/
  types.ts              GuideMethod = 'submodule' | 'clone' | 'tarball'
                        normalizeGuideMethod(input) — alias handling, ONE place
                        GuideInfo.checkout: 'initialized' | 'uninitialized' | 'n/a'
  GuideDetector.ts      detect() populates checkout for submodule installs
  GuideManager.ts       ensureCheckout(): Promise<EnsureCheckoutResult>
                        resolveStrategy() — no catch, default from ConfigKeys
  strategies/
    SubmoduleStrategy.ts  init(projectOrWorktreePath) — extracted from sync()
    TarballStrategy.ts    method: 'tarball'
packages/core/src/config/ConfigKeys.ts
                        guide.git_strategy enum: ['submodule','clone','tarball','manual']
                        (manual kept so existing shared config files still validate)
packages/cli/src/
  commands/guides.ts    --strategy help text; info prints checkout + managed line
  commands/init.ts      --strategy <method> pass-through
  utils/guideReady.ts   ensureGuideReady(ctx) — calls ensureCheckout, prints notice to stderr
  commands/build.ts, prompt.ts, setup-ide.ts — call ensureGuideReady before reading
packages/mcp-server/src/tools/
  contextTools.ts       context_build, prompt_list, prompt_get call ensureCheckout first
  guideTools.ts         guide_install strategy enum accepts tarball|manual; guide_status
                        reports checkout state
```

### Data Flow: auto-init

```
cf build / cf prompt / cf setup-ide / context_build / prompt_*
  └─ ensureGuideReady(projectPath, operationPath)
       └─ GuideManager.ensureCheckout()
            ├─ detector.detect()            → not installed?  return {action:'none'}  (caller errors as today)
            ├─ method !== 'submodule'?      → return {action:'none'}
            ├─ detector.checkSyncStatus(operationPath)
            │    'in_sync'          → {action:'none'}
            │    'not_initialized'  → SubmoduleStrategy.init(operationPath)
            │                          → {action:'initialized', commit:<short-sha>}
            │    'out_of_sync'      → {action:'warned', reason:'checkout differs from pinned commit'}
            │    'error'            → throw (git unavailable or not a repo — surfaced, not swallowed)
            └─ caller prints notice (CLI: stderr; MCP: `notices[]` in the tool result)
  └─ createContextPipeline(...) proceeds as before
```

`operationPath` is the worktree path when the command runs inside a registered worktree, `projectPath` otherwise — the same resolution `cf guides` already does in `getGuideContext()`.

## Design Decisions

- **D1 — Detection uses `git submodule status`, not filesystem heuristics.** `checkSyncStatus()` already exists and is git-authoritative: `-` prefix means not initialized, `+` means checked out at a different commit. Checking for an empty directory or a missing `.git` file inside the guide dir would give the same answer in the common case but cannot tell "not initialized" from "initialized and broken." The one addition is that `detect()` records the result in `GuideInfo.checkout` so `cf guides info` and `guide_status` can show it without a second call.

- **D2 — Auto-act only on `not_initialized`; warn on `out_of_sync`.** An uninitialized gitlink has exactly one correct resolution: check out the pinned commit. A checkout at a different commit may be deliberate (testing a guide change, a worktree on a branch that pins a different version — the case `sync()` exists for). Resetting it would discard the user's intent, and `git submodule update` on an initialized submodule is precisely the kind of state change the CLAUDE.md rule on destructive actions warns against. The warning names the command to run (`cf guides update` or `git submodule update`). If the PM wants `out_of_sync` auto-corrected later, it is a one-branch change in `ensureCheckout()`.

- **D3 — One core entry point, explicit calls at the boundary.** `createContextPipeline()` and `resolvePromptFilePath()` are synchronous; git is not. Making the factory async would ripple through every consumer for one feature. Instead, `ensureCheckout()` is called explicitly by the CLI commands and MCP tools that read guide content. The list is finite and enumerated in Component Structure; the implementation task must grep for `createContextPipeline`, `resolvePromptFilePath`, and `GUIDE_RELATIVE_PATH` in `packages/cli/src` and `packages/mcp-server/src` and cover every hit. `cf guides info` reports checkout state but does not auto-init — it is a status command and must stay read-only.

- **D4 — Notices go to stderr in the CLI.** `cf build --json` and the prompt commands are parsed by squadron and other callers; an "initialized submodule" line on stdout would corrupt structured output. All auto-init notices and warnings print to stderr. MCP tools return them in a `notices` array on the result rather than mutating the primary payload. There is no config toggle to disable auto-init: an uninitialized submodule has no valid use, and a toggle is complexity without a user.

- **D5 — Rename to `tarball`; `manual` is an alias, not a second value.** `GuideMethod` becomes `'submodule' | 'clone' | 'tarball'`. A single `normalizeGuideMethod(input: string): GuideMethod` in `types.ts` maps `manual` → `tarball` and rejects anything else with an explicit error naming the valid values. It is called at each input boundary: `resolveStrategy()` (config), `--strategy` on `cf init` and `cf guides install`, and the MCP `guide_install` parameter. When the input was `manual`, the boundary prints a one-line deprecation warning to stderr (CLI) or adds a notice (MCP). All output — `cf guides info`, `--json`, `guide_status`, `InstallResult.method` — uses `tarball`. Existing tarball installs need no migration: detection is by the `.context-forge-guide-version` marker file, not by the stored name. Existing shared config files with `guide.git_strategy: manual` keep validating because `manual` stays in the `ConfigKeys` enum; the normalization step is what makes it behave as `tarball`. CHANGELOG records the output change (`method: "manual"` → `"tarball"`) as user-visible.

- **D6 — Default stays `submodule`; document why.** PM decision 20260909. The tarball path depends on `api.github.com` (REST tarball endpoint) in addition to `git ls-remote`, a different network surface from git-over-https and the exact corporate-proxy environment #77/#78 came from. Submodule also gives a reviewable pinned commit in the host repo and a contribute-back path. README's strategy section states this so the next person who reads `dist/` does not reopen the question. The strategy default is read from `ConfigKeys['guide.git_strategy'].default`; the literal `'submodule'` at `GuideManager.ts:196` is removed so the value exists in one place.

- **D7 — Remove the silent catches in `resolveStrategy()`/`resolveSource()`.** A config read that throws (malformed file, permission error) currently degrades to the default with no message, which is exactly the fallback pattern CLAUDE.md prohibits. Errors propagate. "Key unset" is not an error — `ConfigManager.get()` returns the default with `source: 'default'`, so the absent-config path needs no catch at all.

- **D8 — `cf init --strategy`.** Same option name and help text as `cf guides install --strategy`; the descriptor for the three strategies (name, one-line trade-off) lives in one exported constant in `guides.ts` and both commands render help from it. `init` already swallows "already installed" and prints a warning on other install failures; that behavior is unchanged.

- **D9 — Managed-directory wording lives in one constant.** `GUIDE_MANAGED_NOTICE` in `packages/core/src/guides/types.ts`, printed by `cf guides info` and returned by `guide_status`. README quotes the same sentence. Text: "This directory is managed by cf and overwritten on `cf guides update`. Put project-specific customizations under `project-documents/user/`."

## Implementation Details

### Strategy help descriptor (shape only)

```ts
export const GUIDE_STRATEGIES: Record<GuideMethod, { summary: string }> = {
  submodule: { summary: 'git submodule, pinned commit committed to your repo (default; needs git; fresh clones auto-init)' },
  clone:     { summary: 'standalone git clone inside the project (needs git; full guide history available locally)' },
  tarball:   { summary: 'vendored files from a GitHub release tarball (no git or submodule steps; uses api.github.com)' },
};
```

Both `--strategy` help strings are generated from this table. Adding a strategy without a help entry is a compile error.

### `ensureCheckout()` result

```ts
interface EnsureCheckoutResult {
  action: 'none' | 'initialized' | 'warned';
  commit?: string;   // short SHA when initialized
  message?: string;  // human-readable notice/warning when action !== 'none'
}
```

### Auto-init failure path

`SubmoduleStrategy.init()` runs `git submodule update --init <path>` scoped to the guide path. On a fresh clone this fetches from the guide remote, so it can fail behind a proxy exactly as `cf guides install` can. The error is wrapped with `withNetworkErrorHint` (already done by `gitExec`) and the caller appends `GUIDE_OFFLINE_REMEDIATION`, mirroring the #78 fix in `setup-ide.ts:113`. The command then fails with that message rather than proceeding against an empty tree.

### Rename sweep (exact locations)

Non-test occurrences of `'manual'` today: `ConfigKeys.ts:34`, `types.ts:4`, `GuideDetector.ts:125`, `GuideManager.ts:220`, `CloneStrategy.ts:34`, `SubmoduleStrategy.ts:39`, `TarballStrategy.ts:1,31,47,67,75`, `guideTools.ts:47,93,101`, `guides.ts:119`. Tests referencing it: `GuideDetector.test.ts`, `TarballStrategy.test.ts`, `GuideManager.test.ts`. After the sweep the only remaining `manual` literal is the alias entry in `normalizeGuideMethod()` and the `ConfigKeys` enum.

## Integration Points

### Provides

- `GuideInfo.checkout` and `GuideManager.ensureCheckout()` for any future command that reads the guide.
- `GUIDE_STRATEGIES` descriptor and `normalizeGuideMethod()` for any new strategy input surface.

### Consumes

- Squadron parses `cf` stdout (`integrations/context_forge.py`). D4 keeps stdout unchanged; the only output change squadron could observe is `method: tarball` in `cf guides info --json`, which it does not read today. Note in CHANGELOG regardless.

## Success Criteria

### Functional

- A project using the submodule strategy, freshly cloned without `--recurse-submodules`, runs `cf build` successfully; stderr shows one line naming the initialized submodule and short SHA; stdout is the normal build output.
- The same clone with `cf build --json` produces valid JSON on stdout.
- `cf guides info` on that clone, before any other command, reports `Checkout: not initialized` and does not modify the checkout.
- A submodule deliberately checked out at a different commit produces a stderr warning naming the fix and no change to the checkout.
- `cf guides install --strategy manual` installs the tarball strategy, prints a deprecation warning, and `cf guides info` reports `Method: tarball`.
- A project whose shared config has `guide.git_strategy: manual` installs as tarball with the same warning.
- `cf init --strategy tarball` in an empty directory installs via tarball with no `.gitmodules` created.
- `cf init --help` and `cf guides install --help` list all three strategies with the one-line trade-offs.
- `cf guides info` (installed case) prints the managed-directory line; README contains the same sentence and a strategy-selection section that states why submodule is the default.
- A malformed shared config file makes `cf guides install` fail with the config error rather than silently installing with the default strategy.

### Technical

- Tests: `GuideDetector` uninitialized/initialized/out-of-sync fixtures using a real temporary git repo with a submodule (the existing guide tests already create temp repos); `ensureCheckout()` for each branch of the state machine; `normalizeGuideMethod()` for all inputs including rejection; CLI `init --strategy` pass-through; `guides info` output includes the managed line; MCP `guide_install` accepts both `tarball` and `manual`.
- No `'submodule'` default literal outside `ConfigKeys`; no `'manual'` literal outside the alias table and enum.
- All existing tests pass; no `catch {}` without a comment explaining the swallow remains in `GuideManager.ts`.
- CHANGELOG and DEVLOG entries; README updated.

### Verification Walkthrough

1. Make a throwaway project with the default strategy and clone it the way a teammate would:

   ```bash
   mkdir /tmp/g925 && cd /tmp/g925 && cf init --name g925 --no-ide
   git clone /tmp/g925 /tmp/g925-clone && cd /tmp/g925-clone
   ls project-documents/ai-project-guide        # empty — the #80 state
   cf guides info                               # Checkout: not initialized (read-only)
   cf build 2>err.txt >out.txt; cat err.txt     # "Initialized ai-project-guide submodule at <sha>"
   ls project-documents/ai-project-guide        # populated
   cf build --json | jq .project                # stdout is clean JSON
   ```

2. Confirm the out-of-sync warning does not act:

   ```bash
   (cd project-documents/ai-project-guide && git checkout HEAD~1)
   cf build 2>&1 >/dev/null | head -1           # warning naming cf guides update; checkout unchanged
   ```

3. Rename and alias:

   ```bash
   mkdir /tmp/g925-tb && cd /tmp/g925-tb && cf init --name g925-tb --no-ide --strategy manual
   #   → deprecation warning on stderr, install proceeds
   cf guides info                               # Method: tarball; managed-directory line present
   test ! -f .gitmodules && echo "no submodule"
   cf guides install --help | grep -c tarball   # ≥ 1
   ```

4. Managed-directory statement: `cf guides info` in any installed project shows the line; `grep -n "overwritten on" README.md` finds the same sentence.

5. Clean up: `cf project delete g925 g925-tb` (or the equivalent) and remove the `/tmp` directories.

## Risk Assessment

- **Auto-init performs a network fetch inside a read command.** Mitigated by scoping to the single state that has no other resolution, printing what happened, and failing with the existing remediation text when the fetch cannot complete. `cf guides info` stays read-only so a user can always inspect first.
- **Rename touches JSON output.** `method` changes from `manual` to `tarball` for tarball installs only. No known consumer reads it; CHANGELOG entry covers it.

## Implementation Notes

Suggested order: (1) `normalizeGuideMethod` + rename sweep + `ConfigKeys` default sourcing, since every later step touches `GuideMethod`; (2) `GuideInfo.checkout` and `SubmoduleStrategy.init()` extraction from `sync()`; (3) `ensureCheckout()` and the CLI/MCP call sites; (4) `cf init --strategy` and help descriptor; (5) managed-directory notice; (6) README, CHANGELOG, DEVLOG. Run the full suite after step 1 before proceeding — it is the widest change.

Version: the rename is user-visible, so this ships as a minor bump (0.14.0) unless the PM decides otherwise at release time.

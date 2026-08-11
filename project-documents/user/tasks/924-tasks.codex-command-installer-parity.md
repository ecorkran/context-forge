---
docType: tasks
slice: codex-command-installer-parity
project: context-forge
lld: user/slices/924-slice.codex-command-installer-parity.md
dependencies: [211]
projectState: main is green, working tree clean at 8285c61. v0.12.0 is tagged and published (all four packages). Slice 211's TARGETS descriptor table and .agents/skills guide-skill emission are shipped and working. commandInstaller.ts is Claude-only (hardcoded ~/.claude/commands + cf/ layout); init.ts:131 installs Claude commands unconditionally; setup-ide never invokes the installer. Design review skipped by PM declaration (review: none in the slice design frontmatter). Next release will be 0.13.0 (new feature + documented behavior change to bare install-commands).
dateCreated: 20260809
dateUpdated: 20260810
status: complete
---

## Context Summary

- Working on slice 924: deliver the nine `/cf:*` commands to Codex as
  agent skills (`$cf-build`, …) via an IDE-aware `cf install-commands`,
  wire `setup-ide`/`init` to use it, and audit remaining Claude-only
  touchpoints (GitHub #74).
- The issue body plus design decisions D1–D6 in the slice design are
  settled — do not relitigate during implementation. Notably: project-local
  Codex dir is `.agents/skills/` (D1), global is `~/.codex/skills/` (D2,
  live-verify before merge), assets are checked in not converted (D3),
  thin passthroughs are print-verbatim prose (D4), bare `install-commands`
  becomes project-local with `--global` opt-out (D5).
- Urgency note: PM needs this usable in Codex immediately. Prefer landing
  the installer + assets first; audit items follow.

Full rationale lives in `user/slices/924-slice.codex-command-installer-parity.md`.

**Implementation order rationale:** descriptor + assets first (everything
else consumes them), then install/uninstall mechanics, then CLI flags,
then the `setup-ide`/`init` wiring, then tests/packaging, then the
PM-assisted live Codex verification and the parity audit.

---

## Tasks

### Part 1 — Installer Core

- [x] **Task 1: Command target descriptor** (effort: 2)
  - [x] In `packages/cli/src/commands/commandInstaller.ts`, add a
        `CommandTargetDescriptor` record keyed by installer target
        (`claude`, `agents`) per the design's sketch: `sourceDir`,
        `localTarget`, `globalTarget()`, `layout: 'flat-md' | 'skill-dirs'`,
        `invocationHint(name)`. Annotate as `Record<CommandTarget, …>` so
        the compiler rejects a target without an entry (same pattern as
        `setup-ide.ts` TARGETS).
  - [x] Reuse `normalizeTarget()`/`TARGET_ALIASES` from `setup-ide.ts` for
        input resolution (`codex`/`openai` → `agents`); reject `copilot`/
        `cursor` with an explicit "no command delivery for this target"
        error — do not silently no-op.
  - [x] Success criteria: descriptor compiles; unknown/unsupported targets
        produce explicit errors.

- [x] **Task 2: Codex skill assets — nine `cf-*/SKILL.md`** (effort: 2)
  - [x] Create `packages/cli/commands/codex/cf-<name>/SKILL.md` for all nine
        commands: `build`, `check`, `get`, `next`, `onboard`, `project`,
        `prompt`, `set`, `status`. Frontmatter: `name: cf-<name>` +
        `description` (adapted from the Claude file's description so Codex
        auto-invocation matching works). Body: numbered prose steps
        equivalent to the Claude command body.
  - [x] Thin passthroughs (`status`, `get`, `check`): body is "run
        `cf <name>` and print its output verbatim; add no commentary"
        (D4). `build` keeps the confirm-receipt + follow-instruction +
        STOP-condition contract from the Claude version, with arguments
        mapped to `--phase`/`--slice` flags.
  - [x] No hallucination traps: where a step retrieves a value that can be
        empty, specify the empty-case behavior; no plausible hardcoded
        example values adjacent (CLAUDE.md rule).
  - [x] Success criteria: nine directories, each exactly one SKILL.md;
        content review against the Claude counterparts shows no behavioral
        drift beyond the D4 mediation.

- [x] **Task 3: Layout-aware install/uninstall** (effort: 3)
  - [x] `installCommands(target, dir)`: `flat-md` keeps today's copy+prune of
        `cf/*.md` byte-identical in effect; `skill-dirs` copies each
        bundled `cf-*` directory and prunes managed `cf-*` directories
        present in the target but absent from source. "Managed" = name
        matches a bundled skill dir; user-authored skills are never
        touched.
  - [x] `uninstallCommands` mirrors per layout (remove managed files/dirs,
        remove now-empty parent `cf/` for flat-md; never remove
        `.agents/skills/` itself).
  - [x] Success criteria: both layouts idempotent; re-running install after
        deleting a bundled source file removes the stale artifact; foreign
        files/dirs in the target survive both operations.

- [x] **Task 4: CLI flags and output** (effort: 2)
  - [x] `install-commands`/`uninstall-commands` gain `--ide <target>`
        (default `claude`) and `--global`. Default scope is project-local
        (cwd-resolved); `--global` uses the descriptor's `globalTarget()`.
        `--target <dir>` remains as an explicit-path override beating both.
  - [x] Output lists installed entries via `invocationHint` (`/cf:build` vs
        `$cf-build`) and states the resolved directory.
  - [x] `installCommandsAction()` (used by `init`) gains `(ide, {global})`
        params; existing exit-code behavior unchanged.
  - [x] Success criteria: `--help` documents both flags and the behavior
        change; all four flag combinations resolve to the directories in
        the design's acceptance table.

### Part 2 — Wiring

- [x] **Task 5: setup-ide invokes the installer** (effort: 2)
  - [x] `setupIdeAction`: for `claude` and `agents` targets, after existing
        setup steps, run the command install with `--global` semantics.
        `copilot`/`cursor` unchanged (no command delivery).
  - [x] Completion messaging per target names the invocation form
        (`/cf:*` for Claude, `$cf-*` for Codex) and the installed path.
  - [x] Success criteria: `cf setup-ide codex` on a scratch project yields
        `~/.codex/skills/cf-*/`; `cf setup-ide claude` yields
        `~/.claude/commands/cf/` (today's net effect preserved via the
        new path).

- [x] **Task 6: init routes by IDE target** (effort: 1)
  - [x] `init.ts` step 3: replace the unconditional `installCommandsAction()`
        with a call passing the normalized `--ide` target (default
        `claude`; `--no-ide` skips command install entirely — decide and
        document in-code whether no-IDE still installs Claude commands;
        default: it does not).
  - [x] Success criteria: `cf init --ide codex` installs Codex skills and no
        Claude commands; `cf init` (default) behaves as documented.

### Part 3 — Tests, Packaging, Verification

- [x] **Task 7: Tests** (effort: 3)
  - [x] Extend `packages/cli/tests/commands/commandInstaller.test.ts`:
        per-target layout, prune semantics (incl. user-file preservation),
        flag→directory resolution matrix, unsupported-target error.
  - [x] `setup-ide.test.ts` / init tests: wiring assertions per target.
  - [x] Success criteria: full cli suite green; no existing expectations
        rewritten except where they pinned the old global-default behavior
        (those update to the new contract, noted in the test diff).

- [x] **Task 8: Packaging check** (effort: 1)
  - [x] Confirm `packages/cli/package.json` `files` (or equivalent) ships
        `commands/codex/**` in the npm pack; `getSourceCommandsDir()`
        resolution reaches it from dist. Verify via `pnpm pack --dry-run`
        or equivalent file-list inspection.
  - [x] Success criteria: packed tarball contains all nine SKILL.md files.

- [x] **Task 9: Live Codex verification (PM-assisted)** (effort: 2)
  - [x] Execute walkthrough steps 1–3 from the design in a real Codex
        session: project-local discovery + `$cf-status` execution, global
        `~/.codex/skills/` discovery, local-vs-global shadowing (D6).
  - [x] Record observed results in the design's walkthrough section
        (replace the draft steps with actual output). If global discovery
        fails, implement the D2 explicit error and re-verify.
  - [x] Success criteria: D2 and D6 move from "unconfirmed" to observed
        behavior, recorded in the design doc.

- [x] **Task 10: Parity audit** (effort: 2)
  - [x] Work the design's Parity Audit Checklist. Fix small gaps in-slice
        (messaging, help text, docs wording); file GitHub issues for
        anything larger, linking them in the design doc.
  - [x] README: add/extend the Codex section — install, skill invocation,
        MCP registration in Codex `config.toml`.
  - [x] Success criteria: every checklist item checked with an outcome
        (fixed / issue #N / verified-ok).

- [x] **Task 11: CHANGELOG** (effort: 1)
  - [x] Under `[Unreleased]`: `cf install-commands --ide codex` + skills
        delivery, setup-ide/init wiring, and the BREAKING-ish note that
        bare `install-commands` is now project-local (`--global` restores
        the old destination).
  - [x] Success criteria: entries follow the existing file's style.

- [x] **Task 12: Close-out** (effort: 1)
  - [x] All tasks checked; task file + slice design `status: complete`;
        entry 24 checked in `900-slices.maintenance-and-refactoring.md`;
        `cf check` findings limited to the pre-existing 921 baseline.
  - [x] Success criteria: clean `cf check` delta; branch merged per git
        rules (target = main, integration_branch unset).

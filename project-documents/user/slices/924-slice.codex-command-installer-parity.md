---
docType: slice-design
project: context-forge
slice: 924
parent: user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: [211]
dateCreated: 20260809
dateUpdated: 20260809
status: in_progress
review: none
---

# Slice 924: Codex Command Installer & Parity

Fixes GitHub issue #74. The issue body is effectively the design; this document settles the open questions it left and adds the parity-audit scope. Driver: the PM needs the full `/cf:*` workflow usable from Codex immediately, with colleagues likely onboarding within days.

## Overview

Two asset types serve IDE integration, and only one reaches Codex today:

| Asset | Source | Claude | Codex |
|---|---|---|---|
| Guide workflow skills | `project-guides/skills/` | `.claude/skills/` ✅ | `.agents/skills/` ✅ (slice 211) |
| CF CLI-wrapper commands (`/cf:*`) | `packages/cli/commands/cf/` | `~/.claude/commands/cf/` ✅ | — ❌ |

This slice closes the second row: deliver the nine commands (`build`, `check`, `get`, `next`, `onboard`, `project`, `prompt`, `set`, `status`) to Codex as skills (`$cf-build`, `$cf-status`, …), and sweep for any remaining Claude-only touchpoints a Codex user would hit.

## Value

- Codex users get the same one-keystroke workflow entry points Claude users have; without them the guide's process is effectively Claude-gated.
- `cf init --ide codex` stops silently installing Claude commands (today's `init.ts:131` behavior is simply wrong for non-Claude targets).

## Technical Scope

**Included:**
- `install-commands`/`uninstall-commands`: add `--ide <target>` (default `claude`) and `--global` scope flag; per-target install layout and stale-file pruning. **Behavior change per the issue's acceptance criteria:** bare `cf install-commands` becomes project-local (`.claude/commands/cf/`); today's global behavior now requires `--global`. `--target <dir>` stays as an explicit-path escape hatch overriding both. CHANGELOG records the change.
- Nine Codex skill directories (`cf-build/SKILL.md`, …) as checked-in assets under `packages/cli/commands/codex/`.
- Wiring: `setup-ide claude|codex` invokes the installer with `--global`; `init --ide <target>` routes to the matching installer target.
- Codex parity audit (checklist below): fix small gaps in-slice, file issues for larger ones.
- Tests mirroring the existing installer tests per target; CHANGELOG entry.

**Excluded:**
- `copilot`/`cursor` command delivery — no known skills mechanism contract for them yet; the descriptor structure must make adding one a data change, but no assets ship for them here.
- Any change to the guide workflow skills path (slice 211's `.agents/skills` emission) — already works.
- MCP server changes — Codex reaches the MCP server via its own `config.toml`; audit item only.

## Design Decisions

- **D1 — Project-local Codex dir is `.agents/skills/`.** Codex scans `.agents/skills` from cwd up to the repo root (open agent-skills standard) in addition to `.codex/skills`. Slice 211 already emits guide skills to `.agents/skills/`; one directory, one convention. Not configurable.
- **D2 — Global Codex dir is `~/.codex/skills/`.** Per current Codex documentation (OpenAI ships its own system skills under `~/.codex/skills/.system`). There is no `.agents` equivalent at machine level. **Must be confirmed in a live Codex session before merge** (verification walkthrough below); if discovery fails, `--global --ide codex` errors explicitly — no silent fallback to project-local.
- **D3 — Checked-in assets, not install-time conversion.** The Codex SKILL.md files are static, reviewable files in the repo, exactly like the Claude command files. A converter would be code to test and a format coupling to maintain, for nine short files that change rarely.
- **D4 — Deterministic passthroughs stay deterministic in intent, mediated in mechanism.** Claude commands inject live CLI output via `` !`cf status` ``; Codex SKILL.md has no output-injection directive, so `status`/`get`/`check` skills instruct: run the command, print its output verbatim, add nothing. This is model-mediated by platform limitation — recorded here per the issue's request, not worked around.
- **D5 — Scope flags.** Project-local by default, `--global` to opt out — matching `cf config set --global` polarity. No `--local` flag; `--project`/`--project-level` are taken repo-wide. `setup-ide` passes `--global` explicitly (machine-level operation by nature).
- **D6 — Precedence is the host's concern.** Claude Code: project-local shadows global (confirmed). Codex: unconfirmed; verify alongside D2. `installCommands()` remains a plain copy-and-prune with no precedence logic.

## Implementation Sketch

`commandInstaller.ts` grows a small per-target descriptor (same pattern as `setup-ide.ts`'s `TARGETS` — the compiler rejects a target without an entry):

```ts
interface CommandTargetDescriptor {
  sourceDir: string;          // bundled asset dir: 'cf' | 'codex'
  localTarget: string;        // project-relative: '.claude/commands' | '.agents/skills'
  globalTarget: () => string; // ~/.claude/commands | ~/.codex/skills
  layout: 'flat-md' | 'skill-dirs';  // drives install + stale-prune strategy
  invocationHint: (name: string) => string; // '/cf:build' | '$cf-build'
}
```

- `flat-md`: today's copy + prune of `cf/*.md` (unchanged for Claude).
- `skill-dirs`: copy each `cf-*/SKILL.md` directory; prune managed `cf-*` directories present in target but absent from source. "Managed" = name matches a bundled skill dir — user-authored skills are never touched.
- `installCommandsAction()` gains `(ide, { global })`; `init.ts` passes its normalized IDE target; `setup-ide.ts` calls with `--global` semantics for `claude` and `agents` targets (`codex` alias already normalizes to `agents`).
- Reuse `normalizeTarget()`/aliases from `setup-ide.ts` — no second target vocabulary.

Skill content: each SKILL.md carries `name: cf-<command>` + `description` (reuse the Claude file's description, reworded for auto-invocation relevance) and numbered prose steps equivalent to the Claude command body, with the D4 verbatim-print rule for thin passthroughs.

## Parity Audit Checklist

Sweep these for Claude-only assumptions; fix small, file large:

- [ ] `cf init --ide codex` end-to-end (guides, commands, IDE setup, messaging)
- [ ] `cf setup-ide codex` completion messages (mention `$cf-*` skills, not `/cf:*`)
- [ ] `agent_onboard` / `agent_quickstart` MCP output — Claude-specific phrasing?
- [ ] README / docs: Codex install instructions incl. MCP server registration in Codex `config.toml`
- [ ] `cf build --embed` conventions resolution for AGENTS.md (believed working since 211 — verify)
- [ ] Help text: `install-commands --help` describes both targets

## Verification Walkthrough (live Codex, PM-assisted)

1. `cf install-commands --ide codex` in a test project → `.agents/skills/cf-*/SKILL.md` present; Codex session lists the skills; `$cf-status` prints real status.
2. `cf install-commands --ide codex --global` → `~/.codex/skills/cf-*/`; discovered in a session started outside the project.
3. Shadowing: same-name skill in both locations → note which wins (D6).
4. `cf install-commands --ide claude` (no flags) → project-local `.claude/commands/cf/`; `--global` reproduces today's `~/.claude/commands/cf/`.
5. Stale prune per layout: delete a source command, reinstall, confirm removal without touching user files.

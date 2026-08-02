---
docType: slice-design
slice: openai-codex-agents-md-target-ide-parity
project: context-forge
parent: user/architecture/200-slices.developer-onboarding.md
dependencies: [210-github-copilot-vs-code-ide-support]
interfaces: []
dateCreated: 20260802
dateUpdated: 20260802
status: not_started
---

# Slice 211: OpenAI Codex / AGENTS.md Target & IDE Parity

## Overview

Enable the `agents` target (aliases `openai`, `codex`) and the `cursor` target in `cf setup-ide` and `cf init --ide`, and close the non-Claude parity gaps that slice 210 left open.

The guide-side compiler already supports all four targets. `project-documents/ai-project-guide/scripts/setup-ide` dispatches on `cursor|claude|copilot|agents` and normalizes `openai|codex` → `agents` (ai-project-guide v0.16.0, 20260730). CF's `VALID_TARGETS` was never updated to match, so `cf setup-ide codex` fails at the CF gate on capability that already exists one layer down. Most of this slice is reconnecting the two layers correctly — not building a new backend.

The reconnection is not a one-line allowlist edit. Adding two targets to the current code would inherit three defects: `isManagedCopilotFiles()` bakes Copilot's `.github/` layout into a check the `agents` target must also use for `AGENTS.md`; `propagateToWorktrees()` silently propagates nothing for any target it does not recognize; and its directory copy is non-recursive, so nested skill directories never reach a worktree. This slice replaces the per-target `if/else` chains with one target descriptor table that drives validation, the managed-marker check, backup, and propagation from a single definition.

It also fixes a live defect in `cf build --embed`: `ContextEmbedder` hardcodes `CLAUDE.md` and swallows the miss. Squadron appends `--embed` automatically for every non-SDK profile, so every Squadron dispatch to a non-Claude model already runs this path.

## Value

Unblocks OpenAI Codex users — the third major agent surface after Claude Code and Copilot — and retires the "Cursor IDE support" Future Work item.

More immediately, it fixes a defect that is already reachable in production. Squadron's `CfOperation.BUILD_CONTEXT` appends `--embed` whenever the resolved step model is not an SDK profile (`openrouter`, `openai`, `gemini`, `local`, `openai_oauth` all qualify). Those models cannot open files, which is the entire point of `--embed`. Today the `CLAUDE.md` hardcoding is masked because every CF project happens to have a `CLAUDE.md`. The moment a codex-target project exists, those models receive artifacts with no conventions content and no warning — a silent-failure class this project has explicitly been removing (the `draft` frontmatter special case in 0.10.7).

## Technical Scope

### CF-side

- Replace `VALID_TARGETS` with a target descriptor table covering `claude`, `copilot`, `cursor`, `agents`, plus an alias map (`openai`, `codex` → `agents`) normalized at the CF layer. CF owns the `--help` text and the invalid-target message even though the script normalizes too.
- Replace `isManagedClaudeMd()` and `isManagedCopilotFiles()` with one marker check parameterized by the file set each target owns.
- Rewrite `propagateToWorktrees()` against the table: recursive directory copy, explicit failure on an unresolvable target.
- `ContextEmbedder`: resolve the project's actual conventions file from an ordered probe list; warn when none is found, matching the existing missing-artifact warning behavior.
- Delete `buildAndPrint()` from `packages/cli/src/commands/build.ts` — exported, zero callers in CF or Squadron (Squadron shells out to the CLI as a subprocess), and carries a duplicate `--embed` branch that would otherwise need the same fix twice.
- Docs: README command table and quick-start gain the new targets; `cf setup-ide --help` and `cf init --ide` help text list them. Remove the two stale `windsurf` references (the `propagateToWorktrees` comment and the invalid-target test fixture token). The `windsurf` mention in the README MCP-client config block is accurate and unrelated to `setup-ide` — leave it.

### Coupled upstream (ai-project-guide)

- `agents` target emits skills to `.agents/skills/<name>/SKILL.md`. The existing `.claude/skills/<name>/SKILL.md` source layout is nearly identical, so this is close to `copy_skills` with a different destination rather than a translation.
- `cursor` target splits: always-on rules → `AGENTS.md`, scoped rules → `.cursor/rules/*.mdc` (retaining `paths:` → `globs:`). Behavior change — see [Migration](#migration-cursor-target-behavior-change).
- Stop emitting `.cursor/agents/`.
- Apply the AGENTS.md scoped-index policy (Decision 7), which removes the redundant index from the `copilot` target's `AGENTS.md` and keeps it for `agents`.
- Rename `COPILOT_MANAGED_MARKER` → `MANAGED_MARKER`. It is already used by the `agents` target and will be used by `cursor`; the name is now actively misleading. Value is unchanged, so no compatibility impact.

### Not included

- MCP `setup_ide` tool — IDE setup stays CLI-only for every target (accepted gap).
- Codex custom prompts (`.codex/prompts`) — deprecated by OpenAI in favor of skills.
- A `.claude/agents/` equivalent for non-Claude targets. Neither Codex nor Cursor documents an agent-definition surface, so agent definitions remain Claude-only.
- Global install locations (`~/.codex/AGENTS.md`, `~/.codex/skills/`). Project-local emission only.
- Consolidating skills emission across targets. Investigated during design — see Decision 6; not a commitment here.
- Bidirectional sync. One-way source-of-truth → compiled target, unchanged from 210.

## Design Decisions

### 1. One target descriptor table, not four `if/else` chains

Today the same target knowledge is spelled out in five places: `VALID_TARGETS`, the `--help` string, the safety-check branch in `setupIdeAction`, the propagation branch in `propagateToWorktrees`, and `isManagedCopilotFiles`'s hardcoded probe list. Adding two targets multiplies that by two. Instead, define each target once:

```ts
type Target = 'claude' | 'copilot' | 'cursor' | 'agents';

interface TargetDescriptor {
  /** Files probed for the managed marker; also the files backed up before overwrite. */
  markerFiles: string[];
  /** Directories copied to worktrees, recursively. */
  propagateDirs: string[];
  /** Label used in prompts and completion messages. */
  label: string;
}

const TARGETS: Record<Target, TargetDescriptor> = { /* ... */ };
const TARGET_ALIASES: Record<string, Target> = { openai: 'agents', codex: 'agents' };
```

| Target | `markerFiles` | `propagateDirs` |
|---|---|---|
| `claude` | `CLAUDE.md` | `.claude/rules`, `.claude/agents`, `.claude/skills` |
| `copilot` | `.github/copilot-instructions.md`, `AGENTS.md` | `.github/instructions`, `.github/prompts` |
| `cursor` | `AGENTS.md` | `.cursor/rules` |
| `agents` | `AGENTS.md` | `.agents/skills` |

`markerFiles` serves three purposes with no divergence risk: the managed-marker probe, the overwrite-prompt trigger (any listed file exists), and the backup set. Propagation copies `markerFiles` + `propagateDirs`. This reproduces today's Claude and Copilot behavior exactly — verify against the existing tests rather than trusting the table by inspection.

`Record<Target, TargetDescriptor>` makes the compiler reject a target added to the union without a descriptor.

### 2. Aliases normalize at the CF layer

`normalizeTarget(input: string): Target | null` resolves aliases and returns `null` for unknown input. Everything downstream — descriptor lookup, script argument, propagation, completion message — uses the normalized value, so `cf setup-ide codex` and `cf setup-ide agents` are indistinguishable after the first line. The script normalizes too; passing it the already-normalized value is harmless and keeps a single interpretation of the input.

The invalid-target message lists canonical targets and notes the aliases: `Invalid target 'foo'. Valid targets: claude, copilot, cursor, agents (aliases: openai, codex → agents)`.

### 3. Recursive propagation — fixes an existing silent gap

The current propagation loop copies only `entry.isFile()` entries at the top level of each directory. But `copy_skills` emits `.claude/skills/<name>/SKILL.md` plus that skill's support files — every one a nested directory. **Nested skills have never reached worktrees**, silently. `.agents/skills/` has the same shape, so the new target would inherit the bug.

Copy directories with `fs.cpSync(src, dst, { recursive: true })`. This fixes Claude and Copilot propagation as a side effect; call it out in the commit rather than letting it look like a refactor.

### 4. An unresolvable target fails loudly

`propagateToWorktrees` currently ends with an unguarded fall-through: a target matching neither branch propagates nothing and reports success. With the table, a descriptor miss throws:

```ts
const descriptor = TARGETS[target as Target];
if (!descriptor) throw new UserError(`No propagation descriptor for target '${target}'.`);
```

Validation upstream means this should be unreachable — that is the point. It is the guard against a future target added to the union and the script but not to the table, which is exactly how the current gap was introduced.

### 5. `ContextEmbedder` resolves conventions by ordered probe

Replace the hardcoded `CLAUDE.md` read and its silent `catch` with:

```ts
/** Conventions files in read-priority order. First match is embedded. */
const CONVENTIONS_FILES = ['CLAUDE.md', 'AGENTS.md', '.github/copilot-instructions.md'];
```

First match wins — embedding every match would duplicate near-identical always-on rules in a prompt whose reason for existing is that the model cannot read files. When none is found, push the same style of warning the artifact loop already emits: `Warning: no conventions file found (looked for: ...) — the embedded context has no project conventions.` A non-file-reading model must be told what it is missing.

`CLAUDE.md` leads because in a repo that has both, it is the file users hand-edit. Under Decision 7 the remaining two are content-equivalent, so the tail order is not load-bearing.

This list is deliberately **not** merged with the `TARGETS` table. That table is a write-ownership map in the CLI package; this is a read-priority list in core. Coupling them would force core to know about IDE targets to answer "what are this project's conventions?"

### 6. Codex skills land at `.agents/skills/`, confirmed at runtime

The open agent skills standard specifies `.agents/skills/<name>/SKILL.md`, and OpenAI's docs list that chain. Community sources also cite `.codex/skills/` and `~/.codex/skills/`. Documentation alone is not sufficient here — the implementation task must confirm discovery against a real Codex session before the slice closes, and fall back to `.codex/skills/` only if `.agents/skills/` is demonstrably not discovered. Guessing between two plausible paths is how a target ships that writes files nothing reads.

Copilot now supports Agent Skills natively, which raises the possibility that one `.agents/skills/` emission could eventually serve codex, cursor, and copilot in place of the bespoke `.github/prompts/*.prompt.md` translation. That is a real simplification but it changes shipped Copilot behavior for a second time in two slices; it stays out of scope and is recorded as a follow-up.

### 7. `AGENTS.md` indexes scoped rules only when the target has no scoped-rule surface

`emit_agents_md` appends an `## Additional Rules` index listing scoped rules by their source path. That index exists because the AGENTS.md format has no `applyTo`/`paths` mechanism — inlining scoped rules would put Python rules in front of a React project, so they are listed for on-demand reading instead.

That reasoning holds for the `agents` target, which emits no other rule files. It does not hold for `copilot` (`.github/instructions/*.instructions.md` carry `applyTo`) or `cursor` (`.cursor/rules/*.mdc` carry `globs`). Those targets already deliver scoped rules with working scoping; the index adds a third, weaker copy pointing at source paths.

Policy: **emit the scoped index only when the target emits no scoped-rule files of its own.** Parameterize `emit_agents_md` with an `include_scoped_index` flag — `agents` true, `copilot` and `cursor` false.

**This resolves the Copilot `AGENTS.md` duplication.** After the change, a copilot repo's `AGENTS.md` and `.github/copilot-instructions.md` hold identical always-on content and nothing else. A user who enables the experimental `chat.useAgentsMdFile` setting loads that content twice — bounded token waste with no contradictory guidance, since both files compile from one source. Two files with identical content *is* the cross-tool compatibility feature 210 shipped; the emitter prints a setup note so the behavior is visible rather than latent.

Alternatives considered and rejected: making `AGENTS.md` a pointer stub to `.github/copilot-instructions.md` breaks its self-containment, which both other agents and `cf build --embed` depend on; dropping `AGENTS.md` from the copilot target removes the cross-tool compatibility that was the point of emitting it.

### 8. Cursor's `.cursor/agents/` is abandoned, not deleted

`.cursor/agents/*.mdc` appears in no current Cursor documentation — `.cursor/rules/` and `AGENTS.md` are the documented surfaces. The `cursor` target stops writing there. It does **not** delete the directory: those files carry no managed marker, so CF cannot distinguish its own past output from user content. The emitter prints a note that the directory is no longer managed and can be removed by hand.

Contrast with the always-on `.mdc` files in Decision 9, which CF can identify deterministically.

## Migration: cursor target behavior change

The `cursor` target currently copies **every** rule to `.cursor/rules/*.mdc`, always-on ones included, and lets Cursor honor `alwaysApply` natively. After this slice, always-on rules live in `AGENTS.md` and scoped rules live in `.cursor/rules/`. The split is exclusive — no rule loads from two places.

Cursor also reads `AGENTS.md` today. Without a migration step, an existing cursor user who upgrades gets always-on rules from the new `AGENTS.md` *and* from the stale `.mdc` files left behind by the previous run.

Migration, performed by the cursor emitter on every run: for each always-on source rule, remove `.cursor/rules/<stem>.mdc` if present. The stem is derived from the source rule filename, so the set of files removed is exactly the set the previous version wrote from those same sources — deterministic, and it never touches a `.mdc` CF did not generate. Scoped `.mdc` files are rewritten as before.

Consumer impact is limited to the emitted layout; no CF interface changes, and `cursor` was unreachable through `cf` before this slice, so the only affected users are those who invoked the guide script directly.

## Interfaces

**`setupIdeAction(projectPath, target, opts)`** — signature unchanged. `target` accepts four canonical values plus two aliases; the value is normalized on entry.

**`propagateToWorktrees(project, target)`** — signature unchanged; now throws on an unresolvable target instead of returning silently.

**`embedReferencedFiles(project, projectPath, contextString)`** — signature unchanged; conventions resolution and the no-conventions warning are internal.

**`cf init --ide <target>`** — no code change in `init.ts`; it already forwards the string to `setupIdeAction`. Help text updated.

**Guide script contract** — `bash scripts/setup-ide <target>` with `<target>` ∈ {`claude`, `copilot`, `cursor`, `agents`}. Unchanged invocation shape.

## Sequence: `cf setup-ide codex`

1. `normalizeTarget('codex')` → `'agents'`; unknown input errors with the target list before project resolution
2. Resolve project; require `projectPath`
3. `GuideDetector.detect(projectPath)` — guides must be installed (unchanged)
4. Locate `scripts/setup-ide` in the guide dir (unchanged)
5. Look up `TARGETS['agents']` → `markerFiles: ['AGENTS.md']`
6. Safety check: if any `markerFiles` entry exists and none carries the managed marker → prompt (skipped by `--yes`), then back up each existing file to `.bak` unless a `.bak` is already present
7. `execFileSync('bash', [scriptPath, 'agents'], { cwd: projectPath })`
8. `propagateToWorktrees(project, 'agents')` — copies `AGENTS.md` and `.agents/skills/` (recursively) to each registered worktree
9. Print `IDE setup complete for agents.`

Steps 5–8 are identical for every target; only the descriptor differs.

## File layout produced

```
cf setup-ide codex|openai|agents
  AGENTS.md                        ← always-on rules + scoped-rule index
  .agents/skills/<name>/SKILL.md   ← one directory per skill

cf setup-ide cursor
  AGENTS.md                        ← always-on rules (no scoped index)
  .cursor/rules/<name>.mdc         ← scoped rules only, with globs:

cf setup-ide copilot               (unchanged except the scoped index)
  AGENTS.md                        ← always-on rules (no scoped index)
  .github/copilot-instructions.md  ← always-on rules
  .github/instructions/*.instructions.md
  .github/prompts/*.prompt.md

cf setup-ide claude                (unchanged)
  CLAUDE.md
  .claude/{rules,agents,skills}/
```

## Files Changed

**`packages/cli/src/commands/setup-ide.ts`**
- Add `Target` union, `TARGETS` descriptor table, `TARGET_ALIASES`, `normalizeTarget()`
- Replace `isManagedClaudeMd()` / `isManagedCopilotFiles()` with one marker check over a file list. Both current exports are consumed by tests — update those call sites in the same change
- Collapse the claude/copilot safety branches in `setupIdeAction` into one descriptor-driven block
- Rewrite `propagateToWorktrees` against the table: recursive dir copy, throw on descriptor miss, drop the `windsurf` comment
- `--help`: `IDE target: claude, copilot, cursor, agents (aliases: openai, codex)`

**`packages/core/src/services/ContextEmbedder.ts`**
- `CONVENTIONS_FILES` ordered probe replacing the hardcoded `CLAUDE.md` read; warning when none found

**`packages/cli/src/commands/build.ts`**
- Delete `buildAndPrint()` and `BuildAndPrintOpts`

**`packages/cli/src/commands/init.ts`**
- `--ide <target>` help text only

**`packages/cli/tests/commands/setup-ide.test.ts`**
- Replace the `windsurf` fixture token with a value that is not a plausible future target
- New cases per [Test Coverage](#test-coverage)

**`README.md`**
- Command table and quick-start gain `cursor` and `codex`/`agents`

**`project-documents/ai-project-guide/scripts/setup-ide`** (guides submodule)
- `setup_agents`: emit skills to `.agents/skills/`
- Cursor branch: split always-on → `AGENTS.md` / scoped → `.cursor/rules/`; stop writing `.cursor/agents/`; remove superseded always-on `.mdc` files
- `emit_agents_md`: `include_scoped_index` parameter
- Rename `COPILOT_MANAGED_MARKER` → `MANAGED_MARKER`

**No changes to:** `packages/mcp-server/` (no MCP surface for IDE setup, by design).

## Test Coverage

CF-side:
- `normalizeTarget` maps `openai`/`codex` → `agents`, passes canonical targets through, returns `null` for unknown input
- Invalid target message lists all four canonical targets and the aliases
- `cf setup-ide cursor|agents` with no guides installed → same error as the claude path
- Managed-marker check per target: `agents` and `cursor` probe `AGENTS.md` only and are unaffected by `.github/` contents — the regression guard for the `isManagedCopilotFiles` decomposition
- Unmanaged `AGENTS.md` present → prompts before overwrite; `--yes` skips the prompt; `.bak` created; existing `.bak` preserved
- Managed `AGENTS.md` present → silent re-run, no prompt, no backup
- `propagateToWorktrees` per target copies exactly that target's `markerFiles` + `propagateDirs`
- `propagateToWorktrees` copies **nested** directories — a `skills/<name>/SKILL.md` fixture that fails against the current flat loop
- `propagateToWorktrees` throws when the descriptor cannot be resolved
- `TARGETS` covers every member of `Target` (compiler-enforced; assert the table's key count as a runtime backstop)

`ContextEmbedder`:
- Embeds `CLAUDE.md` when present (existing behavior preserved)
- Embeds `AGENTS.md` when `CLAUDE.md` is absent
- Embeds `.github/copilot-instructions.md` when it is the only conventions file
- Embeds exactly one conventions file when several are present, following `CONVENTIONS_FILES` order
- Emits a warning and no conventions block when none is present — the live-defect guard

Manual (cannot be automated in CI):
- Real Codex session discovers and follows `AGENTS.md` + `.agents/skills/` (Decision 6 confirmation)
- Real Cursor session loads `AGENTS.md` and `.cursor/rules/*.mdc` after the split

## Verification Walkthrough

### 1. Codex target, end to end

```bash
mkdir /tmp/test-codex-211 && cd /tmp/test-codex-211
cf init --ide codex --name "Codex Test"
```

Expect the init summary to report `IDE configured for codex`, then:

```bash
cat AGENTS.md | head -5          # H1 + [//]: # (context-forge:managed)
grep -c "## Additional Rules" AGENTS.md   # 1 — agents target keeps the scoped index
ls .agents/skills/               # one directory per skill
ls .agents/skills/*/SKILL.md     # each skill directory contains SKILL.md
ls .claude .github 2>/dev/null || echo "no vendor dirs — correct"
```

Aliases resolve to the same target:

```bash
cf setup-ide openai && cf setup-ide agents   # both silent re-runs, no prompt, no .bak
```

### 2. Codex actually reads it

Open a Codex session in `/tmp/test-codex-211` and ask it to state the project's commit-message convention without naming a file. It should answer from the compiled rules. Then ask it to use a skill by name and confirm it locates the `SKILL.md`. This is the Decision 6 confirmation — if discovery fails, `.agents/skills/` is the wrong path and the fallback applies.

### 3. Cursor target and the split

```bash
mkdir /tmp/test-cursor-211 && cd /tmp/test-cursor-211
cf init --ide cursor --name "Cursor Test"

grep -c "## Additional Rules" AGENTS.md   # 0 — scoped rules live in .cursor/rules/
ls .cursor/rules/                         # scoped rules only
ls .cursor/agents 2>/dev/null || echo "not created — correct"
head -8 .cursor/rules/typescript.mdc      # globs: frontmatter, not paths:
```

No always-on rule appears in both places:

```bash
grep -l "alwaysApply" .cursor/rules/*.mdc || echo "no always-on rules in .cursor/rules — correct"
```

### 4. Cursor migration from a pre-split install

```bash
mkdir /tmp/test-cursor-migrate && cd /tmp/test-cursor-migrate && git init
cf guides install
bash project-documents/ai-project-guide/scripts/setup-ide cursor   # old behavior baseline
ls .cursor/rules/ > /tmp/before.txt
# ...upgrade guides to the version shipping this slice...
cf setup-ide cursor
diff /tmp/before.txt <(ls .cursor/rules/)
```

Expect the always-on rule stems (e.g. `general.mdc`, `git.mdc`) to be gone and scoped stems to remain.

### 5. Worktree propagation, including nested skills

From a project with a registered worktree:

```bash
cf setup-ide codex
ls <worktree-path>/AGENTS.md
ls <worktree-path>/.agents/skills/*/SKILL.md   # nested files present — the recursion fix
```

Then the regression check on the Claude path:

```bash
cf setup-ide claude
ls <worktree-path>/.claude/skills/*/SKILL.md   # fails before this slice, passes after
```

### 6. Unmanaged file protection on the new targets

```bash
mkdir /tmp/test-agents-unmanaged && cd /tmp/test-agents-unmanaged && git init
echo "# My own agent notes" > AGENTS.md
cf guides install
cf setup-ide codex
```

Expect a prompt before overwriting. Answer `n` → `Aborted.`, `AGENTS.md` unchanged. Re-run and answer `y` → `AGENTS.md.bak` created with the original content.

### 7. The `--embed` fix

In the codex project from step 1, with no `CLAUDE.md`:

```bash
cf build --json --embed | jq -r .context | grep "## Embedded: AGENTS.md"
```

Expect a match. Before this slice the same command embeds no conventions at all and says nothing about it.

Then the no-conventions case:

```bash
mv AGENTS.md /tmp/ && cf build --json --embed | jq -r .context | grep -i "no conventions file found"
mv /tmp/AGENTS.md .
```

Expect the warning to be present and visible in the built context.

### 8. Invalid target

```bash
cf setup-ide notarealtarget
```

Expect `Invalid target 'notarealtarget'. Valid targets: claude, copilot, cursor, agents (aliases: openai, codex → agents)` and a non-zero exit. No `windsurf` anywhere in the codebase except the README MCP-client block:

```bash
grep -rn "windsurf" packages/ README.md   # only the README MCP config mention
```

## Success Criteria

- `cf setup-ide codex`, `cf setup-ide openai`, and `cf setup-ide agents` are equivalent and produce `AGENTS.md` (always-on rules + scoped index) plus `.agents/skills/<name>/SKILL.md`
- `cf setup-ide cursor` produces `AGENTS.md` (always-on, no scoped index) and `.cursor/rules/*.mdc` (scoped, with `globs:`), writes no `.cursor/agents/`, and removes `.mdc` files superseded by the always-on split
- `cf init --ide codex` and `cf init --ide cursor` run end-to-end on a fresh directory
- Every target's managed-marker check probes only that target's own files; re-runs are silent on managed files and prompt with backup on unmanaged ones
- `propagateToWorktrees` copies each target's files and directories recursively, and raises on an unresolvable target instead of propagating nothing
- Claude and Copilot behavior is byte-identical to pre-slice output, except that Copilot's `AGENTS.md` no longer carries the scoped-rule index and nested skill directories now reach worktrees
- `cf build --embed` inlines the project's conventions file for every target and emits a visible warning when none is found
- `buildAndPrint` is deleted with no remaining references in CF or Squadron
- Target knowledge is defined once: adding a fifth target requires a `Target` union member and a `TARGETS` entry, and the compiler rejects the union member without the entry
- Verified against real Codex and Cursor sessions that the emitted files are discovered and followed, not merely written to the documented paths

## Risks

**Coupled CF + ai-project-guide release** — Highest risk, inherited from 210 and larger here. `cf setup-ide cursor` against an older guides submodule produces the pre-split layout with no error, because the script accepts `cursor` in both versions. This is a silent version-skew failure, not a loud one. Mitigation: the implementation task should confirm what `cf guide status` reports for a project on an older guide and decide whether a minimum-version check belongs in this slice or is filed as follow-up.

**Codex skills discovery path** — `.agents/skills/` is documented but community sources disagree. Decision 6 makes runtime confirmation a gate rather than an assumption; the cost of being wrong is caught in step 2 of the walkthrough, not after release.

**Cursor split is a behavior change to shipped output** — Bounded by the fact that `cursor` was unreachable through `cf` before this slice. Only direct script users are affected, and the migration in step 4 covers them.

## Effort

3/5. The CF-side work is a table-driven consolidation of code that already exists in duplicate; the upstream work is three contained edits to a script that already has the shape. The cost is in verification breadth — four targets, two of them requiring real third-party sessions to confirm.

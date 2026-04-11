---
docType: slice-design
slice: github-copilot-vs-code-ide-support
project: context-forge
parent: user/architecture/200-slices.developer-onboarding.md
dependencies: []
interfaces: [202-smart-cf-init-composition]
dateCreated: 20260411
dateUpdated: 20260411
status: not_started
---

# Slice 210: GitHub Copilot / VS Code IDE Support

## Overview

Add `copilot` as a second IDE target for `cf setup-ide` and `cf init --ide`, enabling Context Forge projects to deliver their rules, skills, and agent guidance to VS Code Copilot users. The implementation is additive: existing Claude users are untouched. Copilot target writes exclusively to `AGENTS.md`, `.github/copilot-instructions.md`, `.github/instructions/`, and `.github/prompts/` — never to `.claude/` or `CLAUDE.md`.

The core translation: compiled always-on rules → `.github/copilot-instructions.md` + `AGENTS.md`; scoped rule files → `.github/instructions/*.instructions.md` with `applyTo` frontmatter; skills → `.github/prompts/*.prompt.md`.

## Value

Unblocks VS Code Copilot users from adopting Context Forge. The immediate driver is a real external user who cancelled their Claude subscription but wants to keep using CF's methodology. Beyond that, this slice establishes the pattern for future IDE targets (Cursor, Windsurf) — adding a new target after this ships becomes: add an entry to `VALID_TARGETS`, add a backend to the guides script, add a worktree propagation block.

## Technical Scope

**Included:**
- Extend `VALID_TARGETS` in `packages/cli/src/commands/setup-ide.ts` from `['claude']` to `['claude', 'copilot']`
- Add `isManagedCopilot(filePath)` helper analogous to `isManagedClaudeMd()` — checks for `[//]: # (context-forge:managed)` marker in generated Copilot files (same convention, different files)
- Extend `propagateToWorktrees()` with a `copilot` branch: copy `AGENTS.md`, `.github/copilot-instructions.md`, `.github/instructions/`, `.github/prompts/` to each registered worktree
- Add a `copilot` backend to the guides-side `scripts/setup-ide` script in the ai-project-guide submodule — compilation logic lives there, not in CF core
- Frontmatter translation: Claude rule files use `paths: string[]` (defaulting to `**`); Copilot instruction files use `applyTo: "glob1,glob2"` comma-separated string. Translate at emit time, defaulting to `applyTo: "**"` when source omits paths
- `cf init --ide copilot` end-to-end: unchanged detection matrix in `init.ts`, just routes to the copilot setup path
- Update CLI help text to list both targets: `IDE target: claude, copilot`

**File layout produced by `cf setup-ide copilot`:**
```
AGENTS.md                                  ← always-on agent guidance (cross-tool compat)
.github/
  copilot-instructions.md                  ← compiled alwaysApply rules (workspace-wide)
  instructions/
    typescript.instructions.md             ← from .claude/rules/typescript.md
    testing.instructions.md                ← from .claude/rules/testing.md
    ...                                    ← one file per non-alwaysApply rule
  prompts/
    commit.prompt.md                       ← from .claude/skills/commit.md
    review-pr.prompt.md                    ← from .claude/skills/review-pr.md
    ...                                    ← one file per skill
```

**Not included:**
- Cursor support (Future Work item #1 in slice plan — same architecture, separate slice)
- Bidirectional sync (Copilot → Claude). One-way only: source rules → compiled Copilot files
- Copilot custom agents translation (agents are a more complex VS Code concept; document the mapping but defer implementation unless the instruction + prompt layer lands cleanly)
- Any changes to `.claude/` or `CLAUDE.md` (additive only)

## Design Decisions

**Single compiled file for always-on rules, not split instructions**

VS Code states that multiple instruction files combine with no guaranteed order. Scattering always-on content across instruction files risks inconsistent behavior. Instead: compile `alwaysApply` rules into one `.github/copilot-instructions.md` and write the same content to `AGENTS.md` for cross-tool compatibility. Split `.instructions.md` files are used only for narrowly scoped, non-conflicting rule sets (TypeScript rules apply to `**/*.ts`, testing rules apply to `tests/**`, etc.).

**Same managed-marker convention**

Both Claude and Copilot generated files carry `[//]: # (context-forge:managed)` in the first 20 lines. The existing `isManagedClaudeMd` check pattern is replicated for Copilot files. This means re-running `cf setup-ide copilot` on a project with previously generated Copilot files is silent and safe (no prompt, no backup). Re-running on a project with existing unmanaged `.github/copilot-instructions.md` prompts before overwriting — same safety contract as the Claude path.

**Compilation lives in the guides submodule, not CF core**

`cf setup-ide claude` delegates to `bash scripts/setup-ide claude` inside the ai-project-guide submodule. The rules-to-CLAUDE.md compilation is not in CF core — it lives in guide scripts that understand the project-documents layout. The Copilot backend follows the same pattern: `bash scripts/setup-ide copilot`. CF core's job is to validate the target, check guide installation, handle the managed-marker safety check, run the script, and propagate to worktrees.

**`applyTo` translation**

Claude rule frontmatter uses:
```yaml
paths:
  - "src/**/*.ts"
  - "tests/**/*.ts"
```
Copilot instruction frontmatter uses:
```yaml
applyTo: "src/**/*.ts,tests/**/*.ts"
```
When `paths` is absent (alwaysApply rules), translation defaults to `applyTo: "**"` — but these files should not be split instruction files; they go into `.github/copilot-instructions.md` instead. The guide script handles this distinction.

## Interfaces

**`setupIdeAction(projectPath, target, opts)`** — unchanged signature; `'copilot'` is now a valid `target` value.

**`propagateToWorktrees(project, target)`** — unchanged signature; new `else if (target === 'copilot')` block copies the four Copilot dirs/files.

**`cf init --ide copilot`** — no interface change in init.ts; the `--ide` flag already accepts a string and passes it to `setupIdeAction`.

## Sequence: `cf setup-ide copilot`

1. Validate `target === 'copilot'` is in `VALID_TARGETS`
2. Check guide installation (`GuideDetector.detect(projectPath)`) — same requirement as claude path
3. Locate `scripts/setup-ide` in the guide dir — same script, different argument
4. Check `.github/copilot-instructions.md` and `AGENTS.md` for managed marker
   - If either exists and is not managed: prompt (or skip with `--yes`), backup to `.bak`
   - If managed: proceed silently
5. Run `execFileSync('bash', [scriptPath, 'copilot'], { cwd: projectPath })`
6. Run `propagateToWorktrees(project, 'copilot')`
7. Print `IDE setup complete for copilot.`

## Files Changed

**`packages/cli/src/commands/setup-ide.ts`**
- `VALID_TARGETS`: add `'copilot'`
- Add `isManagedCopilotFiles(projectPath)` — checks marker in `.github/copilot-instructions.md` and `AGENTS.md`
- Extend `setupIdeAction`: add copilot safety check (parallel to claude's `isManagedClaudeMd` block)
- Extend `propagateToWorktrees`: add `else if (target === 'copilot')` block

**`project-documents/ai-project-guide/scripts/setup-ide`** (guides submodule)
- Add `copilot` case: compile alwaysApply rules → `.github/copilot-instructions.md` + `AGENTS.md`, translate scoped rules → `.github/instructions/`, translate skills → `.github/prompts/`

**No changes to:**
- `packages/cli/src/commands/init.ts` (already accepts `--ide <string>` and passes to `setupIdeAction`)
- `packages/core/` (no core changes needed)
- `packages/mcp-server/` (no MCP surface needed for this slice)

## Test Coverage

- `cf setup-ide copilot` with no guides installed → error (same as claude path)
- `cf setup-ide copilot` with managed Copilot files → silent re-run, no prompt
- `cf setup-ide copilot` with unmanaged `.github/copilot-instructions.md` → prompts before overwriting; `--yes` skips prompt
- `cf setup-ide copilot` with no existing files → runs cleanly, files created
- `propagateToWorktrees` with `target = 'copilot'` → copies correct dirs to each worktree
- `VALID_TARGETS` includes `copilot` — invalid target still errors with clear message listing valid targets
- `cf init --ide copilot` integration: creates project + runs copilot setup end-to-end (manual verification; CI can verify target validation at minimum)

## Verification Walkthrough

### 1. Fresh install via cf init

```bash
mkdir /tmp/test-copilot-210 && cd /tmp/test-copilot-210
cf init --ide copilot --name "Copilot Test"
```

Expected output (approximate):
```
✓ git initialized
✓ Project 'Copilot Test' registered
✓ Guides installed (vX.Y.Z)
✓ Commands installed (N files → ~/.claude/commands/cf/)
✓ IDE configured for copilot
──────────────────────────────────────
Your project is ready. Run cf next to see recommended next steps.
```

Verify files were created:
```bash
ls .github/
# copilot-instructions.md  instructions/  prompts/
cat AGENTS.md | head -5
# Should contain the context-forge managed marker
cat .github/copilot-instructions.md | head -5
# Should contain the context-forge managed marker + compiled always-on rules
ls .github/instructions/
# One .instructions.md file per scoped rule (e.g. typescript.instructions.md, testing.instructions.md)
ls .github/prompts/
# One .prompt.md file per skill (e.g. commit.prompt.md)
```

Verify `.claude/` was NOT touched:
```bash
ls .claude/ 2>/dev/null && echo "EXISTS" || echo "NOT CREATED — correct"
```

### 2. Re-run is silent (managed files)

```bash
cf setup-ide copilot
```

Expected: runs without prompting, completes silently. No backup files created. Output: `IDE setup complete for copilot.`

### 3. Claude path still works independently

```bash
cf setup-ide claude
```

Expected: generates `CLAUDE.md` and `.claude/` as normal. Copilot files in `.github/` are untouched. Verify:

```bash
ls CLAUDE.md .claude/rules/
# Both present
diff .github/copilot-instructions.md AGENTS.md
# Should be identical (same compiled content)
```

### 4. Unmanaged file protection

```bash
mkdir /tmp/test-copilot-unmanaged && cd /tmp/test-copilot-unmanaged
git init && echo "# My custom instructions" > .github/copilot-instructions.md
cf guides install
cf setup-ide copilot
```

Expected: prompts "Warning: Copilot IDE files already exist and will be overwritten. Continue? (y/N)". Answer `n` → prints "Aborted." and exits. Answer `y` → creates `.github/copilot-instructions.md.bak`, overwrites with managed content.

### 5. Worktree propagation

From a project with a registered worktree:
```bash
cf setup-ide copilot
ls <worktree-path>/.github/
# Should contain copilot-instructions.md, instructions/, prompts/
ls <worktree-path>/AGENTS.md
# Should be present
```

### 6. Instruction file frontmatter

Inspect a generated scoped instruction file:
```bash
head -10 .github/instructions/typescript.instructions.md
```

Expected frontmatter:
```yaml
---
name: TypeScript rules
description: ...
applyTo: "**/*.ts,**/*.tsx"
---
```

Verify `applyTo` is a comma-separated string (not a YAML array), and matches the `paths` from the original `.claude/rules/typescript.md`.

## Risks

**Guides submodule dependency** — The compilation logic lives in ai-project-guide scripts. If the submodule doesn't have a `copilot` case in `setup-ide`, `cf setup-ide copilot` will fail at the script step with a clear error. This is the highest-risk coupling; the CF CLI change is straightforward, but the guide script change requires the submodule to be updated and released in sync.

**VS Code Copilot compatibility surface is evolving** — The `applyTo` glob behavior, `AGENTS.md` folder-locality semantics, and prompt file frontmatter fields are documented but relatively new. The managed-marker convention, in particular, is CF-invented (VS Code has no native concept of "managed" instruction files). If VS Code starts stripping unrecognized comment markers, the safety mechanism degrades to "always prompt." This is acceptable — worst case is a more verbose re-run experience, not data loss.

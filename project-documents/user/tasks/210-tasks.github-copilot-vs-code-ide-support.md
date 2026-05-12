---
docType: tasks
slice: github-copilot-vs-code-ide-support
project: context-forge
lld: user/slices/210-slice.github-copilot-vs-code-ide-support.md
dependencies: []
dateCreated: 20260411
dateUpdated: 20260512
status: complete
---

# Tasks: Slice 210 — GitHub Copilot / VS Code IDE Support

## Context Summary

Add `copilot` as a second IDE target for `cf setup-ide` and `cf init --ide`. The CF CLI change is self-contained: extend `VALID_TARGETS`, add a managed-marker helper for Copilot files, extend worktree propagation, and extend the safety check in `setupIdeAction`. The actual file compilation (rules → `.github/copilot-instructions.md`, skills → `.github/prompts/*.prompt.md`, etc.) lives in the ai-project-guide submodule script `scripts/setup-ide` — that script gains a `copilot` case alongside the existing `claude` case.

**Files to modify:**
- `packages/cli/src/commands/setup-ide.ts`
- `packages/cli/tests/commands/setup-ide.test.ts`
- `project-documents/ai-project-guide/scripts/setup-ide` (guides submodule)

**No changes needed in:**
- `packages/cli/src/commands/init.ts` (already accepts `--ide <string>` and passes to `setupIdeAction`)
- `packages/core/` (no core changes)
- `packages/mcp-server/` (no MCP surface)

**Branch:** `210-slice.github-copilot-vs-code-ide-support`

---

## Section 1: Setup

- [x] **1.1** Verify and create branch
  - [x] Run `git branch` — confirm on `main`
  - [x] Create and switch: `git checkout -b 210-slice.github-copilot-vs-code-ide-support`

---

## Section 2: Extend VALID_TARGETS and add managed-marker helper

- [x] **2.1** Extend `VALID_TARGETS` in `packages/cli/src/commands/setup-ide.ts`
  - [x] Change `const VALID_TARGETS = ['claude'] as const` to `['claude', 'copilot'] as const`
  - [x] Update CLI help text in `registerSetupIdeCommand`: argument description should read `IDE target: claude, copilot`

- [x] **2.2** Add `isManagedCopilotFiles(projectPath: string): boolean` helper
  - [x] Helper checks for the context-forge managed marker in the first 20 lines of both `.github/copilot-instructions.md` and `AGENTS.md` (if they exist)
  - [x] Returns `true` only if at least one of the two files exists AND contains the marker — if either file is managed, the whole Copilot install is considered managed
  - [x] Returns `false` if neither file exists (new install)
  - [x] Mirrors the existing `isManagedClaudeMd(filePath)` pattern

- [x] **2.3** Test: add unit tests for new helpers (in `setup-ide.test.ts`)
  - [x] `VALID_TARGETS` includes both `'claude'` and `'copilot'`
  - [x] `isManagedCopilotFiles`: returns `true` when `.github/copilot-instructions.md` contains the managed marker
  - [x] `isManagedCopilotFiles`: returns `true` when `AGENTS.md` contains the managed marker (even if copilot-instructions.md absent)
  - [x] `isManagedCopilotFiles`: returns `false` when files exist but neither contains the marker
  - [x] `isManagedCopilotFiles`: returns `false` when neither file exists
  - [x] Invalid target (e.g., `'windsurf'`) still errors with updated message listing both valid targets

**Commit:** `feat(cli): extend VALID_TARGETS to include copilot and add managed-marker helper`

---

## Section 3: Extend setupIdeAction with copilot safety check

- [x] **3.1** Add copilot safety check inside `setupIdeAction` (parallel to the existing Claude block)
  - [x] When `target === 'copilot'`:
    - [x] If `isManagedCopilotFiles(projectPath)` returns `true` → proceed silently (no backup, no prompt)
    - [x] If neither `.github/copilot-instructions.md` nor `AGENTS.md` exists → proceed silently
    - [x] If either file exists and is not managed and `--yes` not set → prompt "Warning: Copilot IDE files already exist and will be overwritten. Continue? (y/N)"
    - [x] If confirmed (or `--yes`) → backup `.github/copilot-instructions.md` to `.github/copilot-instructions.md.bak` and `AGENTS.md` to `AGENTS.md.bak` where they exist (skip individual file if `.bak` already exists for that file), print notice
    - [x] If denied → print "Aborted." and return

- [x] **3.2** Test: `setupIdeAction` with `target = 'copilot'` (add to `setup-ide.test.ts`)
  - [x] Managed marker present in `.github/copilot-instructions.md` → no prompt, script runs, no backup
  - [x] File absent → no prompt, script runs, no backup
  - [x] File exists, no marker, `--yes` → backup created, script runs
  - [x] File exists, no marker, no `--yes`, user confirms → backup created, script runs
  - [x] File exists, no marker, no `--yes`, user denies → "Aborted." printed, script not run
  - [x] File exists, no marker, `.bak` already exists → "existing backup preserved" printed, no second copy
  - [x] Run `pnpm --filter @context-forge/cli test` — all pass

**Commit:** `feat(cli): add copilot safety check to setupIdeAction`

---

## Section 4: Extend worktree propagation

- [x] **4.1** Add `copilot` branch to `propagateToWorktrees()` in `setup-ide.ts`
  - [x] Add `else if (target === 'copilot')` block after the `if (target === 'claude')` block
  - [x] Copy `AGENTS.md` from root to each worktree root (if it exists)
  - [x] Copy `.github/copilot-instructions.md` from root to each worktree root (if it exists)
  - [x] Copy `.github/instructions/` directory contents (if the directory exists): `mkdirSync` the destination, copy each file
  - [x] Copy `.github/prompts/` directory contents (if the directory exists): same pattern
  - [x] Update the comment on the `if (target === 'claude')` block from "Future targets (cursor, windsurf)" to "Future targets (cursor, windsurf)" — no functional change needed, comment is still accurate

- [x] **4.2** Test: `propagateToWorktrees` with `target = 'copilot'`
  - [x] Copies `AGENTS.md` to each registered worktree that exists on disk
  - [x] Copies `.github/copilot-instructions.md` to each worktree
  - [x] Copies `.github/instructions/` files to each worktree (creates dir if needed)
  - [x] Copies `.github/prompts/` files to each worktree (creates dir if needed)
  - [x] Skips files/dirs that don't exist at source (no error)
  - [x] Run `pnpm --filter @context-forge/cli test` — all pass

**Commit:** `feat(cli): extend worktree propagation for copilot target`

---

## Section 5: Add copilot backend to guides script

- [x] **5.1** Open the ai-project-guide submodule's `scripts/setup-ide` script
  - [x] Locate the `case "$1" in` / `claude)` handling
  - [x] Add a `copilot)` case with the following compilation steps:

- [x] **5.2** Implement `copilot` case in the guides script
  - [x] **Always-on rules → `.github/copilot-instructions.md` + `AGENTS.md`**
    - [x] Collect all rule files with `alwaysApply: true` (or equivalent marker used by the guides layout)
    - [x] Compile their content (strip frontmatter, concatenate) with the managed marker prepended: `[//]: # (context-forge:managed)`
    - [x] Write to `.github/copilot-instructions.md`
    - [x] Write the same content to `AGENTS.md` (for cross-tool compatibility)
  - [x] **Scoped rule files → `.github/instructions/*.instructions.md`**
    - [x] For each non-alwaysApply rule file:
      - [x] Read `paths:` frontmatter array (default to `["**"]` if absent)
      - [x] Convert to `applyTo: "path1,path2"` comma-separated string
      - [x] Write `name`, `description`, `applyTo` frontmatter + rule body to `.github/instructions/{stem}.instructions.md`
      - [x] Prepend managed marker in frontmatter or as first body line
  - [x] **Skills → `.github/prompts/*.prompt.md`**
    - [x] For each skill file in `.claude/skills/`:
      - [x] Extract `name`, `description` from frontmatter (use filename stem as fallback for `name`)
      - [x] Write new frontmatter with `name`, `description` (Copilot prompt files don't use `paths`/`applyTo`)
      - [x] Write skill body as prompt body
      - [x] Prepend managed marker
  - [x] Create output directories (`mkdir -p .github/instructions .github/prompts`) before writing

- [x] **5.3** Manual verification of guides script
  - [x] Run `cf setup-ide copilot` from a project with guides installed
  - [x] Verify `.github/copilot-instructions.md` created with managed marker and compiled always-on content
  - [x] Verify `AGENTS.md` created with same content
  - [x] Verify `.github/instructions/` populated with one file per scoped rule, `applyTo` frontmatter correct
  - [x] Verify `.github/prompts/` populated with one file per skill
  - [x] Re-run `cf setup-ide copilot` — no prompt (managed files), output identical

**Commit:** `feat(guides): add copilot backend to setup-ide script`

---

## Section 6: Build & Verify

- [x] **6.1** Build all packages
  - [x] `pnpm build` from repo root — no errors

- [x] **6.2** Run full test suite
  - [x] `pnpm test` from repo root — all packages pass

- [x] **6.3** End-to-end smoke test (manual)
  - [x] `mkdir /tmp/cf-init-210-test && cd /tmp/cf-init-210-test`
  - [x] `cf init --ide copilot --name "Copilot Smoke Test"` — project created, guides installed, `cf setup-ide copilot` runs
  - [x] Verify `.github/copilot-instructions.md`, `AGENTS.md`, `.github/instructions/`, `.github/prompts/` all present
  - [x] `cf setup-ide claude` — verify `.claude/` and `CLAUDE.md` still work independently (no cross-contamination)
  - [x] Re-run `cf setup-ide copilot` — silent (managed marker detected, no prompt)

---

## Section 7: Wrap-up

- [x] **7.1** Update slice and slice plan status
  - [x] `210-slice.github-copilot-vs-code-ide-support.md` → `status: complete`, `dateUpdated: today`
  - [x] `200-slices.developer-onboarding.md` → check off slice 210 entry, `dateUpdated: today`

- [x] **7.2** Final commit
  - [x] `git add` all changed doc files
  - [x] `git commit -m "docs: complete slice 210 GitHub Copilot VS Code IDE support"`

- [x] **7.3** Merge to main
  - [x] `git checkout main && git merge 210-slice.github-copilot-vs-code-ide-support --no-ff`

---
docType: tasks
slice: github-copilot-vs-code-ide-support
project: context-forge
lld: user/slices/210-slice.github-copilot-vs-code-ide-support.md
dependencies: []
dateCreated: 20260411
dateUpdated: 20260411
status: not_started
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

- [ ] **1.1** Verify and create branch
  - [ ] Run `git branch` — confirm on `main`
  - [ ] Create and switch: `git checkout -b 210-slice.github-copilot-vs-code-ide-support`

---

## Section 2: Extend VALID_TARGETS and add managed-marker helper

- [ ] **2.1** Extend `VALID_TARGETS` in `packages/cli/src/commands/setup-ide.ts`
  - [ ] Change `const VALID_TARGETS = ['claude'] as const` to `['claude', 'copilot'] as const`
  - [ ] Update CLI help text in `registerSetupIdeCommand`: argument description should read `IDE target: claude, copilot`

- [ ] **2.2** Add `isManagedCopilotFiles(projectPath: string): boolean` helper
  - [ ] Helper checks for the context-forge managed marker in the first 20 lines of both `.github/copilot-instructions.md` and `AGENTS.md` (if they exist)
  - [ ] Returns `true` only if at least one of the two files exists AND contains the marker — if either file is managed, the whole Copilot install is considered managed
  - [ ] Returns `false` if neither file exists (new install)
  - [ ] Mirrors the existing `isManagedClaudeMd(filePath)` pattern

- [ ] **2.3** Test: add unit tests for new helpers (in `setup-ide.test.ts`)
  - [ ] `VALID_TARGETS` includes both `'claude'` and `'copilot'`
  - [ ] `isManagedCopilotFiles`: returns `true` when `.github/copilot-instructions.md` contains the managed marker
  - [ ] `isManagedCopilotFiles`: returns `true` when `AGENTS.md` contains the managed marker (even if copilot-instructions.md absent)
  - [ ] `isManagedCopilotFiles`: returns `false` when files exist but neither contains the marker
  - [ ] `isManagedCopilotFiles`: returns `false` when neither file exists
  - [ ] Invalid target (e.g., `'windsurf'`) still errors with updated message listing both valid targets

**Commit:** `feat(cli): extend VALID_TARGETS to include copilot and add managed-marker helper`

---

## Section 3: Extend setupIdeAction with copilot safety check

- [ ] **3.1** Add copilot safety check inside `setupIdeAction` (parallel to the existing Claude block)
  - [ ] When `target === 'copilot'`:
    - If `isManagedCopilotFiles(projectPath)` returns `true` → proceed silently (no backup, no prompt)
    - If neither `.github/copilot-instructions.md` nor `AGENTS.md` exists → proceed silently
    - If either file exists and is not managed and `--yes` not set → prompt "Warning: Copilot IDE files already exist and will be overwritten. Continue? (y/N)"
    - If confirmed (or `--yes`) → backup `.github/copilot-instructions.md` to `.github/copilot-instructions.md.bak` and `AGENTS.md` to `AGENTS.md.bak` where they exist (skip individual file if `.bak` already exists for that file), print notice
    - If denied → print "Aborted." and return

- [ ] **3.2** Test: `setupIdeAction` with `target = 'copilot'` (add to `setup-ide.test.ts`)
  - [ ] Managed marker present in `.github/copilot-instructions.md` → no prompt, script runs, no backup
  - [ ] File absent → no prompt, script runs, no backup
  - [ ] File exists, no marker, `--yes` → backup created, script runs
  - [ ] File exists, no marker, no `--yes`, user confirms → backup created, script runs
  - [ ] File exists, no marker, no `--yes`, user denies → "Aborted." printed, script not run
  - [ ] File exists, no marker, `.bak` already exists → "existing backup preserved" printed, no second copy
  - [ ] Run `pnpm --filter @context-forge/cli test` — all pass

**Commit:** `feat(cli): add copilot safety check to setupIdeAction`

---

## Section 4: Extend worktree propagation

- [ ] **4.1** Add `copilot` branch to `propagateToWorktrees()` in `setup-ide.ts`
  - [ ] Add `else if (target === 'copilot')` block after the `if (target === 'claude')` block
  - [ ] Copy `AGENTS.md` from root to each worktree root (if it exists)
  - [ ] Copy `.github/copilot-instructions.md` from root to each worktree root (if it exists)
  - [ ] Copy `.github/instructions/` directory contents (if the directory exists): `mkdirSync` the destination, copy each file
  - [ ] Copy `.github/prompts/` directory contents (if the directory exists): same pattern
  - [ ] Update the comment on the `if (target === 'claude')` block from "Future targets (cursor, windsurf)" to "Future targets (cursor, windsurf)" — no functional change needed, comment is still accurate

- [ ] **4.2** Test: `propagateToWorktrees` with `target = 'copilot'`
  - [ ] Copies `AGENTS.md` to each registered worktree that exists on disk
  - [ ] Copies `.github/copilot-instructions.md` to each worktree
  - [ ] Copies `.github/instructions/` files to each worktree (creates dir if needed)
  - [ ] Copies `.github/prompts/` files to each worktree (creates dir if needed)
  - [ ] Skips files/dirs that don't exist at source (no error)
  - [ ] Run `pnpm --filter @context-forge/cli test` — all pass

**Commit:** `feat(cli): extend worktree propagation for copilot target`

---

## Section 5: Add copilot backend to guides script

- [ ] **5.1** Open the ai-project-guide submodule's `scripts/setup-ide` script
  - [ ] Locate the `case "$1" in` / `claude)` handling
  - [ ] Add a `copilot)` case with the following compilation steps:

- [ ] **5.2** Implement `copilot` case in the guides script
  - [ ] **Always-on rules → `.github/copilot-instructions.md` + `AGENTS.md`**
    - Collect all rule files with `alwaysApply: true` (or equivalent marker used by the guides layout)
    - Compile their content (strip frontmatter, concatenate) with the managed marker prepended: `[//]: # (context-forge:managed)`
    - Write to `.github/copilot-instructions.md`
    - Write the same content to `AGENTS.md` (for cross-tool compatibility)
  - [ ] **Scoped rule files → `.github/instructions/*.instructions.md`**
    - For each non-alwaysApply rule file:
      - Read `paths:` frontmatter array (default to `["**"]` if absent)
      - Convert to `applyTo: "path1,path2"` comma-separated string
      - Write `name`, `description`, `applyTo` frontmatter + rule body to `.github/instructions/{stem}.instructions.md`
      - Prepend managed marker in frontmatter or as first body line
  - [ ] **Skills → `.github/prompts/*.prompt.md`**
    - For each skill file in `.claude/skills/`:
      - Extract `name`, `description` from frontmatter (use filename stem as fallback for `name`)
      - Write new frontmatter with `name`, `description` (Copilot prompt files don't use `paths`/`applyTo`)
      - Write skill body as prompt body
      - Prepend managed marker
  - [ ] Create output directories (`mkdir -p .github/instructions .github/prompts`) before writing

- [ ] **5.3** Manual verification of guides script
  - [ ] Run `cf setup-ide copilot` from a project with guides installed
  - [ ] Verify `.github/copilot-instructions.md` created with managed marker and compiled always-on content
  - [ ] Verify `AGENTS.md` created with same content
  - [ ] Verify `.github/instructions/` populated with one file per scoped rule, `applyTo` frontmatter correct
  - [ ] Verify `.github/prompts/` populated with one file per skill
  - [ ] Re-run `cf setup-ide copilot` — no prompt (managed files), output identical

**Commit:** `feat(guides): add copilot backend to setup-ide script`

---

## Section 6: Build & Verify

- [ ] **6.1** Build all packages
  - [ ] `pnpm build` from repo root — no errors

- [ ] **6.2** Run full test suite
  - [ ] `pnpm test` from repo root — all packages pass

- [ ] **6.3** End-to-end smoke test (manual)
  - [ ] `mkdir /tmp/cf-init-210-test && cd /tmp/cf-init-210-test`
  - [ ] `cf init --ide copilot --name "Copilot Smoke Test"` — project created, guides installed, `cf setup-ide copilot` runs
  - [ ] Verify `.github/copilot-instructions.md`, `AGENTS.md`, `.github/instructions/`, `.github/prompts/` all present
  - [ ] `cf setup-ide claude` — verify `.claude/` and `CLAUDE.md` still work independently (no cross-contamination)
  - [ ] Re-run `cf setup-ide copilot` — silent (managed marker detected, no prompt)

---

## Section 7: Wrap-up

- [ ] **7.1** Update slice and slice plan status
  - [ ] `210-slice.github-copilot-vs-code-ide-support.md` → `status: complete`, `dateUpdated: today`
  - [ ] `200-slices.developer-onboarding.md` → check off slice 210 entry, `dateUpdated: today`

- [ ] **7.2** Final commit
  - [ ] `git add` all changed doc files
  - [ ] `git commit -m "docs: complete slice 210 GitHub Copilot VS Code IDE support"`

- [ ] **7.3** Merge to main
  - [ ] `git checkout main && git merge 210-slice.github-copilot-vs-code-ide-support --no-ff`

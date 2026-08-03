---
docType: tasks
slice: openai-codex-agents-md-target-ide-parity
project: context-forge
lld: user/slices/211-slice.openai-codex-agents-md-target-ide-parity.md
dependencies: [210-github-copilot-vs-code-ide-support]
dateCreated: 20260802
dateUpdated: 20260803
status: in_progress
---

# Tasks: Slice 211 — OpenAI Codex / AGENTS.md Target & IDE Parity

## Context Summary

Enable the `agents` target (aliases `openai`, `codex`) and the `cursor` target in `cf setup-ide` and `cf init --ide`. The guide script already supports all four targets and already normalizes `openai|codex` → `agents`; CF's `VALID_TARGETS` was never updated to match.

The CF-side work is a consolidation, not an addition. Target knowledge currently lives in five places (`VALID_TARGETS`, the `--help` string, the safety branch in `setupIdeAction`, the propagation branch in `propagateToWorktrees`, and `isManagedCopilotFiles`'s hardcoded probe list). Sections 3–6 replace all five with one descriptor table. Sections 7–8 fix `cf build --embed` and delete dead code. Sections 9–11 are the coupled ai-project-guide changes.

**Current project state:** `packages/cli/src/commands/setup-ide.ts` supports `claude` and `copilot` only. `packages/core/src/services/ContextEmbedder.ts` hardcodes `CLAUDE.md` with a silent `catch`. `buildAndPrint()` in `packages/cli/src/commands/build.ts` is exported with zero callers. The guide script at `project-documents/ai-project-guide/scripts/setup-ide` dispatches on `cursor|claude|copilot|agents`.

**Files to modify (CF):**
- `packages/cli/src/commands/setup-ide.ts`
- `packages/cli/tests/commands/setup-ide.test.ts`
- `packages/core/src/services/ContextEmbedder.ts` (+ its test file)
- `packages/cli/src/commands/build.ts`
- `packages/cli/src/commands/init.ts` (help text + normalized completion message) and its test file
- `README.md`

**Files to modify (ai-project-guide submodule):**
- `project-documents/ai-project-guide/scripts/setup-ide`

**No changes needed in:** `packages/mcp-server/` (no MCP surface for IDE setup, by design).

**Branch:** `211-slice.openai-codex-agents-md-target-ide-parity` (forked from `main` — `git.integration_branch` is unset)

---

## Section 1: Setup

- [x] **1.1** Create branch
  - [x] Run `cf config get git.integration_branch` — confirm the value is empty (target is `main`)
  - [x] Run `git branch --show-current` — confirm on `main`
  - [x] Create and switch: `git checkout -b 211-slice.openai-codex-agents-md-target-ide-parity main`

---

## Section 2: Confirm the Codex skills discovery path (gate)

Design Decision 6 makes this a gate rather than an assumption. Its outcome determines the destination path in Section 9, so it runs first. Effort: 1/5.

**Manual Verification Ownership:** tasks 2.2 and 11.3's final bullet require an interactive session in a third-party product (OpenAI Codex, Cursor) that the implementing agent has no mechanism to open. The agent's responsibility ends at preparing the scratch repo and stating exactly what to check. It then **stops and hands off to the Project Manager or a human tester**, who runs the session and reports the result. The agent must not mark these bullets complete on its own, must not substitute documentation or web search for the session, and must not proceed past the Section 2 gate until the result is recorded below.

- [x] **2.1** Build a scratch repo with a hand-placed skill (agent)
  - [x] `mkdir /tmp/codex-skills-probe && cd /tmp/codex-skills-probe && git init`
  - [x] Create `AGENTS.md` with one distinctive instruction (e.g. a made-up commit prefix `zzz:`)
  - [x] Create `.agents/skills/probe-skill/SKILL.md` with YAML frontmatter (`name`, `description`) and a body containing a distinctive, unguessable instruction

- [x] **2.2** Confirm discovery in a real Codex session (hand-off — PM or human tester)
  - [x] Open a Codex session in `/tmp/codex-skills-probe`
  - [x] Ask Codex to state the project's commit prefix without naming a file → confirms `AGENTS.md` is read
  - [x] Ask Codex to use `probe-skill` by name → confirms the skill is located and its body followed
  - [x] Record the result (discovered / not discovered) in the task notes below

- [x] **2.3** Decide the destination path
  - [x] If discovered at `.agents/skills/` → Section 9 uses `.agents/skills/`; proceed
  - [x] If NOT discovered → repeat 2.1–2.2 with `.codex/skills/probe-skill/SKILL.md`. If that works, Section 9 uses `.codex/skills/` and the slice design's Decision 6 is updated to record the finding
  - [x] If neither is discovered → STOP and report to the Project Manager. Do not implement a skills destination on documentation alone

**Result:** Confirmed path is `.agents/skills/`. Verified via real Codex session (PM hand-off completed). Both discovery checks passed: AGENTS.md read (commit prefix `zzz:` correctly stated by Codex), skill-by-name location confirmed (probe-skill SKILL.md body followed exactly).

---

## Section 3: Target descriptor table and alias normalization

- [x] **3.1** Define the target model in `packages/cli/src/commands/setup-ide.ts`
  - [x] Add `type Target = 'claude' | 'copilot' | 'cursor' | 'agents'`
  - [x] Add `interface TargetDescriptor` with `markerFiles: string[]`, `propagateDirs: string[]`, `label: string`
  - [x] Add `const TARGETS: Record<Target, TargetDescriptor>` — the `Record<Target, …>` annotation is required so the compiler rejects a union member with no entry
  - [x] Populate per the design's table:
    - [x] `claude`: markerFiles `['CLAUDE.md']`; propagateDirs `['.claude/rules', '.claude/agents', '.claude/skills']`
    - [x] `copilot`: markerFiles `['.github/copilot-instructions.md', 'AGENTS.md']`; propagateDirs `['.github/instructions', '.github/prompts']`
    - [x] `cursor`: markerFiles `['AGENTS.md']`; propagateDirs `['.cursor/rules']`
    - [x] `agents`: markerFiles `['AGENTS.md']`; propagateDirs `['.agents/skills']` (or the path confirmed in 2.3)
  - [x] Add `const TARGET_ALIASES: Record<string, Target> = { openai: 'agents', codex: 'agents' }`
  - [x] Paths in the table use forward slashes; join with `path.join(projectPath, ...file.split('/'))` at use sites so Windows is not broken

- [x] **3.2** Add `normalizeTarget(input: string): Target | null`
  - [x] Lowercase and trim the input
  - [x] Return the canonical target if it is a key of `TARGETS`
  - [x] Return the mapped target if it is a key of `TARGET_ALIASES`
  - [x] Return `null` otherwise — no silent fallback to `claude`
  - [x] Add `invalidTargetMessage(input: string): string` producing: `Invalid target '<input>'. Valid targets: claude, copilot, cursor, agents (aliases: openai, codex → agents)` — built from `TARGETS`/`TARGET_ALIASES` keys, not a hardcoded string
  - [x] Delete `VALID_TARGETS` and its `Target` type alias; update both validation sites (`setupIdeAction` and the `registerSetupIdeCommand` action) to use `normalizeTarget`

- [x] **3.3** Test: target model and normalization
  - [x] `normalizeTarget` returns the canonical value for each of `claude`, `copilot`, `cursor`, `agents`
  - [x] `normalizeTarget('codex')` and `normalizeTarget('openai')` both return `'agents'`
  - [x] `normalizeTarget` is case-insensitive (`'CODEX'` → `'agents'`) and trims whitespace
  - [x] `normalizeTarget('notarealtarget')` returns `null`
  - [x] `Object.keys(TARGETS)` has length 4 — runtime backstop for the compiler-enforced completeness
  - [x] Every `TARGETS` entry has a non-empty `markerFiles` array
  - [x] `invalidTargetMessage` lists all four canonical targets and both aliases

**Commit:** `refactor(cli): replace VALID_TARGETS with a target descriptor table`

---

## Section 4: Managed-marker check decomposition

- [x] **4.1** Replace the two managed-marker functions with one parameterized check
  - [x] Add `isManagedInstall(projectPath: string, markerFiles: string[]): boolean` — for each listed file that exists, read it and return `true` if any of the first 20 lines trimmed equals the managed marker
  - [x] Return `false` when none of the listed files exists (new install) — same contract `isManagedCopilotFiles` has today
  - [x] Promote the marker string to a single module constant (currently duplicated between `isManagedClaudeMd`'s inline literal and `COPILOT_MANAGED_MARKER`)
  - [x] Delete `isManagedClaudeMd` and `isManagedCopilotFiles`, and update the test-file imports that consume them

- [x] **4.2** Test: `isManagedInstall`
  - [x] Returns `true` when the first listed file carries the marker
  - [x] Returns `true` when only the second listed file exists and carries the marker
  - [x] Returns `false` when listed files exist but none carries the marker
  - [x] Returns `false` when no listed file exists
  - [x] Ignores a marker appearing after line 20
  - [x] **Regression guard:** with `TARGETS.agents.markerFiles`, an unmanaged `AGENTS.md` returns `false` even when a managed `.github/copilot-instructions.md` is present — the `agents` target must not inherit Copilot's file assumptions
  - [x] Port the existing `isManagedClaudeMd` / `isManagedCopilotFiles` cases onto the new function so no coverage is lost

**Commit:** `refactor(cli): parameterize the managed-marker check by target file set`

---

## Section 5: Descriptor-driven safety block in `setupIdeAction`

- [x] **5.1** Collapse the claude and copilot branches into one block
  - [x] Normalize `target` on entry; throw `UserError(invalidTargetMessage(target))` when `normalizeTarget` returns `null`
  - [x] Look up the descriptor; use the normalized value for the rest of the function
  - [x] If `isManagedInstall(projectPath, descriptor.markerFiles)` → proceed silently
  - [x] Else if no `markerFiles` entry exists → proceed silently
  - [x] Else: when `--yes` is not set, warn `Warning: <label> IDE files already exist and will be overwritten.` and prompt `Continue? (y/N) `; on denial print `Aborted.` and return
  - [x] On confirmation (or `--yes`): back up each existing `markerFiles` entry to `<file>.bak`, skipping any file that already has a `.bak` and printing `existing backup preserved at <rel>` for it
  - [x] Pass the **normalized** target to `execFileSync('bash', [scriptPath, target], …)`
  - [x] Completion message uses the normalized target: `IDE setup complete for agents.` for a `codex` invocation

- [x] **5.2** Test: `setupIdeAction` across targets
  - [x] `cursor` and `agents` with no guides installed → same `Guides are not installed` error as the claude path
  - [x] `codex` invocation passes `agents` to the script (assert the `execFileSync` argument)
  - [x] Managed `AGENTS.md` present, target `agents` → no prompt, no backup, script runs
  - [x] No conventions file present, target `cursor` → no prompt, script runs
  - [x] Unmanaged `AGENTS.md`, `--yes` → `AGENTS.md.bak` created, script runs
  - [x] Unmanaged `AGENTS.md`, user confirms → backup created, script runs
  - [x] Unmanaged `AGENTS.md`, user denies → `Aborted.` printed, script NOT run
  - [x] Unmanaged `AGENTS.md` with an existing `.bak` → `existing backup preserved` printed, `.bak` not overwritten
  - [x] Existing claude and copilot safety tests still pass unchanged — the consolidation must not alter their behavior

- [x] **5.3** Make `cf init --ide` report the normalized target
  - [x] `init.ts:142` echoes the raw `--ide` value while `setupIdeAction` reports the normalized one, so `cf init --ide codex` prints both `IDE setup complete for agents.` and `✓ IDE configured for codex` — two different names for one action
  - [x] Export `normalizeTarget` from `setup-ide.ts` and use it for the init completion message
  - [x] When the input was an alias, print both so the mapping is visible rather than silently renamed: `IDE configured for agents (codex)`
  - [x] No other change to `init.ts` — it still forwards the raw string to `setupIdeAction`, which owns validation

- [x] **5.4** Test: `cf init --ide` wrapper (in the init test file)
  - [x] `--ide codex` reaches `setupIdeAction` with the raw string (assert the call argument)
  - [x] Completion message for `--ide codex` names `agents` and shows the alias
  - [x] Completion message for `--ide claude` is unchanged (no parenthetical for a canonical target)
  - [x] `--ide notarealtarget` surfaces the invalid-target error from `setupIdeAction` and does not print a success line
  - [x] `--no-ide` still skips IDE setup entirely
  - [x] Default (no `--ide`) still uses `claude`
  - [x] This closes the design's `cf init --ide codex|cursor` success criterion at the unit level; task 13.2 remains the end-to-end confirmation

**Commit:** `refactor(cli): drive setup-ide safety checks from the target descriptor`

---

## Section 6: Worktree propagation rewrite

- [x] **6.1** Rewrite `propagateToWorktrees` against the descriptor table
  - [x] Look up `TARGETS[target]`; if undefined, `throw new UserError("No propagation descriptor for target '<target>'.")` — replaces today's silent fall-through
  - [x] Copy each `markerFiles` entry that exists at the root to the same relative path in each worktree, creating parent directories as needed
  - [x] Copy each `propagateDirs` entry that exists using `fs.cpSync(src, dst, { recursive: true })` — replaces the flat `entry.isFile()` loop
  - [x] Keep the existing per-worktree and summary log lines
  - [x] Update the block comment: describe the descriptor-driven behavior and delete the stale `// Future targets (cursor, windsurf) …` line
  - [x] Preserve the documented exclusions — `.claude/settings.local.json` and `.claude/worktrees/` are not in any `propagateDirs` entry and must stay out

- [x] **6.2** Test: propagation per target
  - [x] `claude` copies `CLAUDE.md` and the three `.claude/` dirs; `.claude/settings.local.json` and `.claude/worktrees/` are NOT copied
  - [x] `copilot` copies both marker files and `.github/instructions/` + `.github/prompts/`
  - [x] `cursor` copies `AGENTS.md` and `.cursor/rules/`
  - [x] `agents` copies `AGENTS.md` and the skills dir confirmed in 2.3
  - [x] **Nested-directory regression:** a `skills/<name>/SKILL.md` fixture reaches the worktree. Write this test against the `claude` target so it fails on the pre-slice implementation and passes after
  - [x] A worktree whose `worktreePath` does not exist is skipped without error (existing behavior)
  - [x] Zero registered worktrees → no-op, no error
  - [x] An unresolvable target throws instead of returning silently

**Commit:** `fix(cli): propagate IDE files recursively and fail on unknown targets`

---

## Section 7: `ContextEmbedder` conventions resolution

- [x] **7.1** Replace the hardcoded `CLAUDE.md` read in `packages/core/src/services/ContextEmbedder.ts`
  - [x] Add `const CONVENTIONS_FILES = ['CLAUDE.md', 'AGENTS.md', '.github/copilot-instructions.md']` with a comment stating it is a read-priority list, first match wins
  - [x] Probe in order; embed the first file that reads successfully, labelled with its relative path
  - [x] When none is found, push a warning into the existing `warnings` array: `no conventions file found (looked for: CLAUDE.md, AGENTS.md, .github/copilot-instructions.md) — the embedded context has no project conventions`
  - [x] Do not merge this list with the CLI's `TARGETS` table — see design Decision 5 for why; note it in the comment
  - [x] Remove the silent `catch` and its "CLAUDE.md is optional" comment

- [x] **7.2** Test: conventions resolution
  - [x] Embeds `CLAUDE.md` when present (existing behavior preserved)
  - [x] Embeds `AGENTS.md` when `CLAUDE.md` is absent
  - [x] Embeds `.github/copilot-instructions.md` when it is the only conventions file
  - [x] With all three present, embeds exactly one — `CLAUDE.md` — and the output contains exactly one conventions block
  - [x] With none present, the returned context contains the no-conventions warning and no conventions block
  - [x] The no-conventions warning appears even when every artifact file resolved successfully (the warning section must not be gated on artifact failures)

**Commit:** `fix(core): resolve the project conventions file instead of hardcoding CLAUDE.md`

---

## Section 8: Delete `buildAndPrint`

- [x] **8.1** Confirm zero callers before deleting
  - [x] `grep -rn "buildAndPrint" packages/ --include=*.ts` — expect only the definition in `packages/cli/src/commands/build.ts`
  - [x] `grep -rn "buildAndPrint" /Users/manta/source/repos/manta/squadron` — expect no matches (Squadron shells out to the `cf` binary)
  - [x] If any caller exists, STOP and report — the design's premise is wrong

- [x] **8.2** Delete the dead export
  - [x] Remove `buildAndPrint()` and the `BuildAndPrintOpts` interface from `packages/cli/src/commands/build.ts`
  - [x] Remove any now-unused imports left behind
  - [x] Run `pnpm -r build` — a type error here means a caller was missed

**Commit:** `refactor(cli): delete unused buildAndPrint and its duplicate embed branch`

---

## Section 9: Upstream — `agents` target emits skills

Requires the path confirmed in 2.3. Work is in `project-documents/ai-project-guide/scripts/setup-ide`.

- [x] **9.1** Emit skills from `setup_agents`
  - [x] After `emit_agents_md`, when `SKILLS_SOURCE_DIR` exists, copy skills to `$TARGET_ROOT/.agents/skills` (or the 2.3 path) using the existing `copy_skills` helper — the source layout (`<name>/SKILL.md`) matches the destination, so no translation is needed
  - [x] Add the destination to the "setup notes" block printed at the end of `setup_agents`
  - [x] Do not emit `.codex/prompts` — deprecated by OpenAI in favor of skills

- [x] **9.2** Verify the agents target output
  - [x] In a scratch repo with guides installed, run `bash project-documents/ai-project-guide/scripts/setup-ide codex`
  - [x] `AGENTS.md` exists, carries the managed marker, and contains the `## Additional Rules` scoped index
  - [x] `.agents/skills/<name>/SKILL.md` exists for each source skill, including support files inside skill directories
  - [x] No `.claude/`, `.github/`, or `.cursor/` directory was created

**Commit:** `feat(guide): emit skills from the agents target`

---

## Section 10: Upstream — AGENTS.md scoped-index policy and marker rename

Runs before the cursor split so that `include_scoped_index` exists when Section 11 needs it.

- [x] **10.1** Parameterize the scoped index
  - [x] Add an `include_scoped_index` parameter to `emit_agents_md`; append the `## Additional Rules` section only when it is set
  - [x] `setup_agents` passes true — the target emits no scoped-rule files of its own
  - [x] `setup_copilot` passes false — `.github/instructions/*.instructions.md` already carry `applyTo`
  - [x] The cursor branch does not call `emit_agents_md` yet; it is wired in 11.1

- [x] **10.2** Add the Copilot duplication note
  - [x] In the Copilot setup-notes block, state that `AGENTS.md` mirrors `.github/copilot-instructions.md` for cross-tool compatibility, and that enabling VS Code's experimental `chat.useAgentsMdFile` loads the same always-on rules twice

- [x] **10.3** Rename the marker constant
  - [x] `COPILOT_MANAGED_MARKER` → `MANAGED_MARKER` at its definition and all use sites — it is already used by the `agents` target and will be used by `cursor`
  - [x] The marker **value** is unchanged; confirm with `grep -c 'context-forge:managed'` that the emitted files still carry the identical string CF probes for

- [x] **10.4** Verify copilot and agents output
  - [x] Run `setup-ide copilot` in a scratch repo before and after these changes; diff the two output trees
  - [x] The only difference is the absent `## Additional Rules` section in `AGENTS.md`
  - [x] `.github/copilot-instructions.md`, `.github/instructions/`, and `.github/prompts/` are byte-identical
  - [x] `setup-ide codex` still emits `AGENTS.md` **with** the `## Additional Rules` index — the parameterization must not change the agents target

**Commit:** `refactor(guide): scope the AGENTS.md rule index to targets without scoped files`

---

## Section 11: Upstream — `cursor` target split and migration

Depends on `include_scoped_index` from 10.1.

- [x] **11.1** Split cursor emission
  - [x] In the cursor branch of `main()`, call `emit_agents_md` for always-on rules, passing `include_scoped_index` false — `.cursor/rules/*.mdc` already carry `globs`
  - [x] Change `copy_cursor_rules` so it skips rules with `alwaysApply`, emitting only scoped rules to `.cursor/rules/*.mdc` with the existing `paths:` → `globs:` conversion
  - [x] Stop writing `.cursor/agents/`. Do NOT delete an existing `.cursor/agents/` directory — those files carry no managed marker, so CF cannot distinguish its own past output from user content. Print a note that the directory is no longer managed and can be removed by hand
  - [x] Update the "Cursor setup notes" block to describe the new layout

- [x] **11.2** Migration: remove superseded always-on `.mdc` files
  - [x] For each source rule carrying `alwaysApply`, remove `.cursor/rules/<stem>.mdc` if it exists — the stem derives from the source filename, so the removed set is exactly what the previous version wrote from those sources
  - [x] Never remove a `.mdc` whose stem does not match a current always-on source rule
  - [x] Print one line per removed file so the migration is visible

- [x] **11.3** Verify the cursor target and its migration
  - [x] Fresh scratch repo: `setup-ide cursor` → `AGENTS.md` present with no `## Additional Rules` section; `.cursor/rules/` holds scoped rules only; no `.cursor/agents/` created
  - [x] `grep -l alwaysApply .cursor/rules/*.mdc` returns nothing — the split is exclusive
  - [x] Scoped `.mdc` files carry `globs:` frontmatter derived from the source `paths:`
  - [x] Migration: run the pre-slice script version in a scratch repo, capture `ls .cursor/rules/`, then run the new version — always-on stems are gone, scoped stems remain, and the removals are printed
  - [ ] **Hand-off (see Manual Verification Ownership):** prepare the scratch repo, then hand off for a real Cursor session confirming always-on guidance from `AGENTS.md` and a scoped rule from `.cursor/rules/` are both in effect

**Commit:** `feat(guide): split cursor rules between AGENTS.md and .cursor/rules`

---

## Section 12: Documentation and stale references

- [ ] **12.1** CLI help text
  - [ ] `packages/cli/src/commands/setup-ide.ts`: argument description → `IDE target: claude, copilot, cursor, agents (aliases: openai, codex)`
  - [ ] `packages/cli/src/commands/init.ts`: `--ide <target>` description → list the same targets, keeping `(default: claude)`

- [ ] **12.2** README
  - [ ] Quick-start: add a `cf init --ide codex` line alongside the existing copilot line
  - [ ] Command table: add `cf setup-ide cursor` and `cf setup-ide codex` rows, noting `openai`/`agents` as equivalents
  - [ ] Note the file layout each new target produces, matching the design's layout block

- [ ] **12.3** Remove stale `windsurf` references
  - [ ] `packages/cli/tests/commands/setup-ide.test.ts`: replace the `windsurf` fixture token with `notarealtarget` and update the test name — `windsurf` reads as a plausible future target, which is exactly the wrong fixture for an invalid-target test
  - [ ] Confirm the `propagateToWorktrees` comment reference was already removed in 6.1
  - [ ] `grep -rn "windsurf" packages/ README.md` → only the README MCP-client config block remains (accurate and unrelated to `setup-ide`; leave it)

**Commit:** `docs: document cursor and codex IDE targets`

---

## Section 13: Verification and integration

- [ ] **13.1** Automated checks
  - [ ] `pnpm -r build` clean
  - [ ] Full test suite passes; no pre-existing test was deleted to make a new one pass
  - [ ] `cf check` reports no new findings

- [ ] **13.2** Walk the design's verification script
  - [ ] Run steps 1–8 of the Verification Walkthrough in the slice design end to end
  - [ ] Record any step whose actual output differs from the documented expectation — the walkthrough is refined at the end of Phase 6, so corrections belong in the design doc, not in a workaround

- [ ] **13.3** Cross-target regression sweep
  - [ ] In one scratch repo, run all four targets in sequence and confirm each writes only its own files
  - [ ] `cf setup-ide claude` after `cf setup-ide codex` leaves `AGENTS.md` and `.agents/skills/` in place (the claude target does not own them)
  - [ ] `cf setup-ide codex` after `cf setup-ide copilot` overwrites `AGENTS.md` and prompts only if the existing file is unmanaged

- [ ] **13.4** Squadron `--embed` path
  - [ ] In a project with no `CLAUDE.md`, run `cf build --json --embed` and confirm the conventions block is present — this is the live-defect fix, and Squadron reaches it automatically for every non-SDK profile
  - [ ] Confirm the no-conventions warning is visible in the built context when every conventions file is absent

- [ ] **13.5** Merge
  - [ ] Commit all remaining changes from the project root
  - [ ] Merge `211-slice.openai-codex-agents-md-target-ide-parity` into `main` (`git.integration_branch` is unset)
  - [ ] Do not delete the branch

---

## Notes

- The ai-project-guide changes (Sections 9–11) live in a submodule and release separately. `cf setup-ide cursor` against an older guides version produces the pre-split layout **with no error**, because both versions accept `cursor`. During 13.2, check what `cf guide status` reports for a project on an older guide and record whether a minimum-version check is warranted — if it is, file it as follow-up rather than expanding this slice.
- Section 2 is a gate. If neither skills path is discovered by a real Codex session, stop and report rather than shipping an emission nothing reads.

## Review Resolutions

Resolutions applied to this task file following `211-review.tasks.openai-codex-agents-md-target-ide-parity.md` (verdict CONCERNS). The review document is unmodified.

- **F001 — Section 10 depended on a parameter Section 11 had not introduced.** Correct: the cursor split had a forward dependency on `include_scoped_index`, and each section is its own commit, so the intermediate state would have emitted an `AGENTS.md` contradicting its own verification step. Resolved by swapping the two sections — the scoped-index parameterization is now Section 10 and the cursor split is Section 11. Chosen over folding the parameter into the cursor section because the policy change also affects `copilot`, which has nothing to do with cursor. Task 10.4 gained a check that the `agents` target's index is unaffected by the parameterization.
- **F002 — Manual third-party sessions had no feasibility path.** Correct: "Open a Codex session" is not an action the implementing agent can take. Resolved with a Manual Verification Ownership note in Section 2 assigning those bullets to the PM or a human tester, with the agent's responsibility ending at scratch-repo preparation. The agent may not self-complete them, substitute documentation for the session, or pass the Section 2 gate without a recorded result. Tasks 2.2 and 11.3 are labelled accordingly.
- **F003 — `cf init --ide codex|cursor` had no automated coverage.** Correct, and the review also identified a real defect while checking it: `init.ts:142` echoes the raw `--ide` value while `setupIdeAction` reports the normalized one, so `cf init --ide codex` prints two different names for one action. Resolved by adding task 5.3 (init reports `agents (codex)` via an exported `normalizeTarget`) and task 5.4 (init wrapper unit tests). Task 13.2 remains the end-to-end confirmation.

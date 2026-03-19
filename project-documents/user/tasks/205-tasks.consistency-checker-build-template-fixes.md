---
slice: consistency-checker-build-template-fixes
project: context-forge
lld: user/slices/205-slice.consistency-checker-build-template-fixes.md
dependencies: []
projectState: Slice 192 complete (v0.6.12). ConsistencyChecker.checkAll only checks configured plan. MCP workflow_check lacks worktree overlay support. cf:build template ordering puts instruction after tools.
dateCreated: 20260319
dateUpdated: 20260319
status: not_started
---

## Context Summary
- Working on 205-slice.consistency-checker-build-template-fixes (maintenance slice in 200 initiative)
- Four fixes: (1) multi-plan scanning in core checkAll, (2) MCP workflow_check worktree parity, (3) /cf:check slash command, (4) cf:build section reordering
- No dependencies on other slices
- Key files: `packages/core/src/introspection/ConsistencyChecker.ts`, `packages/mcp-server/src/tools/workflowTools.ts`, `packages/core/src/services/ContextTemplateEngine.ts`, `packages/cli/commands/cf/`

---

## Section 1: Core `checkAll` Multi-Plan Scanning

**Effort: 3/5**

- [ ] 1.1 Refactor `checkAll` to discover and iterate all slice plans
  - [ ] In `ConsistencyChecker.ts`, modify `checkAll()` to call `discoverAllSlicePlans()` first
  - [ ] Parse each discovered plan via `introspector.parseSlicePlan()`
  - [ ] Collect all entries across all plans, deduplicating by index (first occurrence wins)
  - [ ] Remove the early return when configured `slicePlanResult` is empty — other plans may still have entries
  - [ ] Run `checkSlice()` (rules 1-5) for each unique entry from all plans
  - [ ] Pass the correct `slicePlanResult` for each entry (the plan that owns it) so rule cross-referencing works
  - [ ] Aggregate rules (6-9) continue to run per-plan as they do now (no change)
  - [ ] Existing tests pass, build clean

- [ ] 1.2 Tests for multi-plan scanning
  - [ ] Add test: project with two slice plans, entry exists only in the non-configured plan — verify per-slice rules run for it
  - [ ] Add test: project with two slice plans, both have entries — verify all entries checked, no duplicates in findings
  - [ ] Add test: configured plan is empty but another plan has entries — verify findings produced (no early return)
  - [ ] Add test: single plan project — behavior unchanged from before
  - [ ] All ConsistencyChecker tests pass

**Commit**: `fix(core): checkAll scans all discovered slice plans for per-slice rules`

---

## Section 2: `cf:build` Section Reordering

**Effort: 1/5**

- [ ] 2.1 Update section order in `ContextTemplateEngine.buildTemplate()`
  - [ ] In `packages/core/src/services/ContextTemplateEngine.ts`
  - [ ] Change `instruction` section order from `5` to `3`
  - [ ] Change `additional-notes` section order from `6` to `4`
  - [ ] Change `current-events` section order from `4` to `5`
  - [ ] Change `tools-section` section order from `3` to `6`
  - [ ] Reorder the code blocks to match (for readability — comments reference order)
  - [ ] Build clean

- [ ] 2.2 Tests for section ordering
  - [ ] In `ContextTemplateEngine` tests, verify instruction section appears before tools section in output
  - [ ] Verify additional-notes appears immediately after instruction
  - [ ] Verify current-events appears after additional-notes
  - [ ] Verify tools-section appears last
  - [ ] All existing template engine tests pass (update any that assert specific ordering)

**Commit**: `fix(core): reorder cf:build template to place instruction before tools`

---

## Section 3: `/cf:check` Slash Command

**Effort: 1/5**

- [ ] 3.1 Create slash command file
  - [ ] Create `packages/cli/commands/cf/check.md` with frontmatter: description, argument-hint, allowed-tools
  - [ ] Body: passthrough to `cf check $ARGUMENTS` (see slice design for exact format)

- [ ] 3.2 Register in command installer
  - [ ] In `packages/cli/src/commands/commandInstaller.ts`, add `'check.md'` to `MANAGED_FILES` array
  - [ ] Build clean

- [ ] 3.3 Verify installation
  - [ ] Run `cf install-commands` — confirm `check.md` appears in installed files
  - [ ] Verify `~/.claude/commands/cf/check.md` exists with correct content

**Commit**: `feat(cli): add /cf:check slash command`

---

## Section 4: MCP `workflow_check` Worktree Parity

**Effort: 2/5**

- [ ] 4.1 Add worktree overlay iteration to MCP `workflow_check`
  - [ ] In `packages/mcp-server/src/tools/workflowTools.ts`, in the `workflow_check` handler
  - [ ] After resolving the project, check if `project.worktrees` has entries
  - [ ] If worktrees exist: build one view per worktree (apply overlay via `applyWorktreeOverlay`, set `projectPath` to `worktreePath`)
  - [ ] Run `checkAll` (or `fixAll` if fix mode) on each view
  - [ ] Merge and deduplicate findings using same logic as CLI's `mergeCheckResults`
  - [ ] If no worktrees: run `checkAll` on raw project (current behavior, unchanged)
  - [ ] Add comment noting merge logic should be extracted to core in future (200-slices item 7)
  - [ ] Import `applyWorktreeOverlay` from `@context-forge/core` (or from local utils if already available in MCP)
  - [ ] Build clean

- [ ] 4.2 Tests for MCP worktree parity
  - [ ] Add test: project with worktrees — verify overlay applied, findings from worktree-scoped plans included
  - [ ] Add test: project without worktrees — verify behavior unchanged
  - [ ] Add test: findings are deduplicated across worktree views (same finding from overlapping scans appears once)

**Commit**: `fix(mcp): workflow_check applies worktree overlays matching CLI behavior`

---

## Section 5: Parity Verification & Final Build

**Effort: 1/5**

- [ ] 5.1 Full build and test
  - [ ] `npm run build` — clean
  - [ ] `npm run test` (all packages) — all pass
  - [ ] No regressions in core, CLI, or MCP test suites

- [ ] 5.2 Verification walkthrough
  - [ ] Run `cf check` on context-forge — confirm findings from both 160-slices and 180-slices plans
  - [ ] Run MCP `workflow_check` — confirm same findings as CLI
  - [ ] Run `cf build | head -80` — confirm instruction prompt appears before tools section
  - [ ] Run `cf install-commands` and verify `/cf:check` is available
  - [ ] Update verification walkthrough in slice design with actual results

**Commit**: `docs: complete 205 slice verification walkthrough`

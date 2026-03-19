---
docType: slice-design
slice: consistency-checker-build-template-fixes
project: context-forge
parent: user/architecture/200-slices.developer-onboarding.md
dependencies: []
interfaces: []
dateCreated: 20260319
dateUpdated: 20260319
status: complete
---

# Slice Design: Consistency Checker & Build Template Fixes

## Overview

Maintenance slice that fixes three related gaps: (1) `ConsistencyChecker.checkAll` only runs per-slice rules against the configured slice plan, missing entries from other plans in the same project; (2) MCP `workflow_check` doesn't apply worktree overlays, producing different results than the CLI; (3) `cf:build` template output puts the instruction prompt after the tools section, burying the most important context.

Also adds a `/cf:check` slash command for convenient access from Claude Code.

## Value

- **Consistency**: CLI `cf check` and MCP `workflow_check` produce the same results regardless of which plan is configured or whether worktrees exist.
- **Completeness**: Projects with multiple slice plans (e.g., 160-slices and 180-slices) get per-slice checks across all plans, not just the active one.
- **Usability**: `/cf:check` makes consistency checking available as a slash command. Reordered `cf:build` output puts the instruction prompt in a more logical position.

## Technical Scope

### Included

1. **Core `checkAll` multi-plan scanning** — Iterate per-slice rules (1-5) across entries from all discovered slice plans, not just `project.fileSlicePlan`.
2. **MCP `workflow_check` worktree parity** — Apply worktree overlays and merge results, matching the CLI's multi-view pattern.
3. **`/cf:check` slash command** — New `check.md` in `packages/cli/commands/cf/`, registered in `MANAGED_FILES`.
4. **`cf:build` section reordering** — Move instruction prompt above tools section in `ContextTemplateEngine.buildTemplate()`.

### Excluded

- Changes to per-slice rule logic (rules 1-5 themselves are fine; only their iteration scope changes).
- New consistency rules.
- Changes to `cf check --fix` behavior.

## Technical Decisions

### 1. Multi-Plan Scanning in `checkAll`

**Current behavior** (lines 66-90 of `ConsistencyChecker.ts`):
```
checkAll(project):
  slicePlanResult = safeParseSlicePlan(project)  // configured plan only
  for entry in slicePlanResult.entries:
    checkSlice(entry.index)                       // rules 1-5
  discoveredPlans = discoverAllSlicePlans()        // finds all plans
  for plan in discoveredPlans:
    ruleDuplicateIndex(plan)                       // rules 6-9 only
```

**New behavior**:
```
checkAll(project):
  allPlans = discoverAllSlicePlans()
  // also include configured plan (dedup by path)
  configuredPlan = safeParseSlicePlan(project)

  // Collect all unique entries across all plans
  allEntries = []
  for plan in allPlans:
    parsedPlan = parseSlicePlan(plan)
    allEntries.push(...parsedPlan.entries)

  // Deduplicate by index (same slice may appear in multiple plans if misconfigured)
  uniqueEntries = deduplicateByIndex(allEntries)

  for entry in uniqueEntries:
    checkSlice(entry.index)                        // rules 1-5 for ALL plans

  for plan in allPlans:
    ruleDuplicateIndex(plan)                       // rules 6-9 (unchanged)
```

Key change: Per-slice rules run against entries from **all** discovered plans. The early return on empty `slicePlanResult` is removed — if the configured plan is empty but other plans exist, we still check them.

Each plan's entries carry their plan path for attribution in findings. The `slicePlanResult` parameter passed to `checkSlice` needs to include the relevant plan for that entry (for rule cross-referencing).

### 2. MCP `workflow_check` Worktree Parity

The CLI (`check.ts` lines 158-165) builds one view per worktree overlay, runs `checkAll` on each, then merges with deduplication. The MCP tool should do the same.

In `workflowTools.ts`, after resolving the project:
1. If `project.worktrees` exists and has entries, build one view per worktree (apply overlay, set `projectPath` to `worktreePath`)
2. Run `checkAll` on each view
3. Merge and deduplicate findings (same logic as CLI's `mergeCheckResults`)
4. If no worktrees, run `checkAll` on the raw project (current behavior)

The merge/dedup logic should be extracted to a shared utility in core (or at minimum, the MCP should replicate the CLI's `mergeCheckResults` pattern). Given that the "CLI/MCP duplication extraction" is future work item 7, for now we duplicate the merge logic in the MCP tool and add a comment noting the future extraction.

### 3. `/cf:check` Slash Command

Simple passthrough pattern matching existing commands like `status.md`:

```markdown
---
description: Run consistency checks on project artifacts
argument-hint: [--fix] [--slice <index>]
allowed-tools: Bash(cf:*)
---

Display this output:

!`cf check $ARGUMENTS`
```

Register in `MANAGED_FILES` in `commandInstaller.ts`.

### 4. `cf:build` Section Reordering

Current order in `ContextTemplateEngine.buildTemplate()`:
| Order | Key | Section |
|-------|-----|---------|
| 1 | `project-intro` | Project statement |
| 1.5 | `project-info` | Project metadata |
| 2 | `context-init` | Context initialization prompt |
| 3 | `tools-section` | 3rd-Party Tools & MCP |
| 4 | `current-events` | Current Project State |
| 5 | `instruction` | Instruction Prompt |
| 6 | `additional-notes` | Additional Instructions |

New order:
| Order | Key | Section |
|-------|-----|---------|
| 1 | `project-intro` | Project statement |
| 1.5 | `project-info` | Project metadata |
| 2 | `context-init` | Context initialization prompt |
| 3 | `instruction` | Instruction Prompt |
| 4 | `additional-notes` | Additional Instructions |
| 5 | `current-events` | Current Project State |
| 6 | `tools-section` | 3rd-Party Tools & MCP |

Rationale: The instruction prompt is the core directive — what the agent should do. Additional instructions (user notes like "On Phase Complete: ...") stay adjacent to form a "what to do" block. Reference material (project state, tools) follows — context the agent consults as needed but shouldn't see before its directive.

## Success Criteria

### Functional Requirements
- `cf check` on a project with multiple slice plans (e.g., 160-slices and 180-slices) reports per-slice findings from all plans
- MCP `workflow_check` returns the same findings as CLI `cf check` for the same project
- `/cf:check` slash command works in Claude Code, passes arguments through
- `cf build` output places instruction prompt before tools section

### Technical Requirements
- Existing `ConsistencyChecker` unit tests continue to pass
- New tests cover multi-plan scanning (project with 2+ slice plans, entries from non-configured plan are checked)
- MCP `workflow_check` tests cover worktree overlay iteration
- Parity tests: CLI and MCP produce equivalent findings for the same project (with and without worktrees)
- `ContextTemplateEngine` tests verify new section ordering

### Verification Walkthrough

**1. Multi-plan scanning** — VERIFIED
```bash
cf check
# Output shows findings from ALL plans: 100-slices (slices 1-12), 180-slices (slice 185),
# 780-slices (slices 780-782). Slice 185 now appears despite not being in the configured plan.
# Total: 17 findings: 1 warning, 16 infos
```

**2. MCP parity** — VERIFIED (via unit tests)
```
# MCP workflow_check now applies worktree overlays matching CLI behavior.
# 3 unit tests verify: overlay applied with findings merged, behavior unchanged without
# worktrees, deduplication across views.
# Note: Live MCP test requires server restart after code changes.
```

**3. Slash command** — VERIFIED
```bash
cf install-commands
# Output: Installed 9 commands to ~/.claude/commands/cf/
# /cf:check appears in the list
cat ~/.claude/commands/cf/check.md
# Contains frontmatter with description, argument-hint, allowed-tools, and passthrough body
```

**4. Build template ordering** — VERIFIED
```bash
cf build | head -80
# Output order: Project Context → Instruction Prompt → Additional Instructions →
# Current Project State → 3rd-Party Tools & MCP
# Instruction now appears at order 3 (before tools at order 6)
```

## Implementation Notes

### Development Approach

Suggested order:
1. Core `checkAll` fix (most impactful, enables everything else)
2. `cf:build` section reordering (independent, quick)
3. `/cf:check` slash command (independent, quick)
4. MCP `workflow_check` worktree parity (depends on understanding the core fix)
5. Tests for all changes

---
docType: slice-design
layer: project
project: context-forge
archIndex: 900
slice: cli-usability-improvements
component: cli
status: complete
dateCreated: 20260404
dateUpdated: 20260404
---

# Slice Design: CLI Usability Improvements (908)

## Overview

Catch-all slice for small CLI UX wins that don't warrant their own slice. Items are added to the backlog as discovered and implemented incrementally. Each item is a self-contained task — the slice remains open until PM closes it.

**Backlog** (items to implement, in priority order):
1. ~~`cf list arch` / `cf list initiatives` — initiative-plan-aware listing~~ (complete)
2. ~~Context profile filtering broken — parser doesn't handle compact YAML format~~ (complete)
3. `cf check` noise reduction — auto-fix more frontmatter cases, suppress backlog noise (current item)

---

## Item A: Initiative-Plan-Aware `cf list arch`

### Problem

`cf list arch` (alias `cf list initiatives`) currently drives from `buildModel()`, which scans the filesystem for `NNN-arch.*` and `NNN-slices.*` files and aggregates progress per initiative band. This means:

- Initiatives that exist in the initiative plan but have no arch file yet are invisible
- The listing reflects filesystem state rather than the plan's authoritative list
- The output format (index, arch doc name, plan name, X/Y progress) differs from `cf list slices`, which shows per-entry status and file path

`cf list slices` drives from the slice plan (`fileSlicePlan`) and shows each entry with its checkbox state plus a file indicator when the design doc exists. `cf list arch` should mirror this pattern using the initiative plan.

### Design

#### Data Source

Replace (or supplement) the `buildModel()` call in `archListAction` with a direct parse of the initiative plan file via `ArtifactIntrospector.parseSlicePlan()`.

Initiative plan location: `project-documents/user/project-guides/001-initiative-plan.*.md`

Discovery: extract the `findInitiativePlan` logic from `ConsistencyChecker` into a shared utility (e.g., `resolveInitiativePlanPath(projectPath)` exported from `@context-forge/core`), so both the checker and the list command use the same finder without duplicating the regex.

#### Output Fields (per initiative entry)

| Field | Source | Notes |
|-------|--------|-------|
| Index | `entry.index` | From `(NNN)` in plan |
| Name | `entry.name` | Bold name from plan |
| Status | `entry.isChecked` + arch frontmatter | checked=complete, unchecked=not started/in progress |
| Arch file | `detectDocuments()` or filesystem scan | Path shown when exists, `—` when not |
| Active | compare to `project.fileArch` index | `*` indicator |

Status display logic (mirrors `cf list slices`):
- Entry checked → `complete`
- Entry unchecked + arch file exists → `in_progress` (arch exists but initiative not closed)
- Entry unchecked + no arch file → `not_started`

#### Fallback

If no initiative plan exists, fall back to current `buildModel()`-based behavior so the command still works on projects without a formal initiative plan.

#### Index Range Filtering

Apply the same worktree index range filtering already present in `archListAction` — filter initiative entries by `isInIndexRange(entry.index, indexRange)`.

#### JSON Output

Emit an array of objects with the same fields as the table, consistent with `cf list slices --json`.

### Files Affected

- `packages/core/src/introspection/ConsistencyChecker.ts` — extract `findInitiativePlan` private method
- `packages/core/src/introspection/` — add `resolveInitiativePlanPath(projectPath)` exported utility (or add to `ArtifactIntrospector`)
- `packages/cli/src/commands/list/arch.ts` — replace data source with initiative plan parse + fallback
- `packages/core/tests/` and `packages/cli/tests/` — unit tests for new utility and updated action

---

## Success Criteria

- `cf list arch` shows all entries from the initiative plan (not just those with arch files on disk)
- Entries without an arch file display `—` in the file column and `not_started` status
- Entries with an arch file display the filename and derived status
- Active initiative (current `fileArch` index) is marked with `*`
- `cf list arch --json` emits structured array
- On projects without an initiative plan, output is unchanged (fallback to current behavior)
- `findInitiativePlan` logic lives in one place, used by both checker and list command

---

## Verification Walkthrough

```bash
# From context-forge project root
cf list arch
# Expected: all initiatives from 001-initiative-plan.context-forge.md listed
# (140, 160, 180, 200, 220, 900) with status and arch file path per entry
# Checked entries show "complete"; unchecked with arch file show "in_progress"

cf list initiatives
# Expected: same output (alias)

cf list arch --json
# Expected: JSON array with index, name, status, archFile fields

# Verify fallback: on a project with no initiative plan, cf list arch
# should still work (current buildModel behavior)
```

---

## Item B: Context Profile Filtering Fix

### Problem

`ContextProfileParser.parseProfilesYaml()` only handled an expanded multi-line YAML format:

```yaml
  profile-name:
    variables: [field1, field2]
```

The actual prompt file (`prompt.ai-project.system.md`) uses a compact one-line format:

```yaml
  profile-name:              [field1, field2]
```

The parser silently returned empty variable lists for every profile, which caused `applyProfileFiltering` in `ContextIntegrator` to skip filtering entirely. Result: all artifact fields (including `fileTasks`) were included in every phase's context, regardless of what the context profile specified.

This affected all consumers: CLI `cf build`, MCP `context_build`, and `/cf:build`.

### Design

1. **Simplify `ProfileMap`** from `Record<string, { variables: string[] }>` to `Record<string, string[]>`. The `{ variables: ... }` wrapper anticipated additional per-profile fields that never materialized.

2. **Rewrite `parseProfilesYaml`** to use a single-pass state machine that extracts `key: [values]` regardless of whether the bracket list is on the same line as the key (compact) or on a child `variables:` line (expanded). No indent-counting — the parser distinguishes cases by checking whether the key is `variables` (child line of a pending profile) or a profile name (starts a new profile).

3. **Add compact-format test fixture** matching the actual prompt file layout, plus a test that parses the real `prompt.ai-project.system.md` from the project directory.

### Files Affected

- `packages/core/src/services/ContextProfileParser.ts` — type simplification + parser rewrite
- `packages/core/tests/services/ContextProfileParser.test.ts` — new fixtures and tests

### Success Criteria

- Both compact and expanded YAML formats parse identically
- Phase 4 (Slice Design) context excludes `fileTasks`
- Real prompt file parses successfully in tests
- No indent-depth logic in parser

---

## Item C: `cf check` Noise Reduction & Auto-fix Coverage

### Problem

`cf check` produced findings that were either trivially fixable but emitted as unfixable warnings, or pure noise on backlogs:

1. **`status: draft`** triggered an "Invalid value" warning even though `draft` is the universal English for "not started yet".
2. **Missing `dateUpdated`** emitted an unfixable warning, even when `dateCreated` was present and could trivially serve as a default.
3. **"Slice plan entry exists but no task file found"** fired for every backlog entry — flooding output. There's no inconsistency in having a planned slice without a task file; that's the normal pre-design state. The warning is only meaningful once a slice design exists.

On context-forge itself this was producing 4 fixable-but-unfixed warnings and 17 backlog notices.

### Design

1. **`draft` → `not_started` alias** in `validateFrontmatter` value-normalization step. Joins existing `completed → complete` and `active → in_progress` aliases. No fix written to file — the value passes validation as-is.

2. **`dateUpdated` auto-fix from `dateCreated`** in the missing-required-field block. Only applies when `dateCreated` itself is present and non-empty. If both are missing, no fix is offered (the `dateCreated` finding remains as-is for human attention).

3. **Rule 3 gating** in `ConsistencyChecker.ruleMissingArtifacts`: only emit "missing task file" finding when a slice design exists. The other half of the rule (task file without plan entry) is unchanged.

### Files Affected

- `packages/core/src/schema/frontmatterSchema.ts` — `draft` alias + `dateUpdated` fix
- `packages/core/src/introspection/ConsistencyChecker.ts` — Rule 3 gating
- `packages/core/tests/schema/frontmatterSchema.test.ts` — 3 new tests
- `packages/core/tests/introspection/ConsistencyChecker.test.ts` — 1 new test (suppressed case)

### Success Criteria

- `cf check` on context-forge no longer reports `draft`, missing `dateUpdated`, or backlog "no task file" notices
- All previously-passing tests still pass
- New tests cover each behavior change

---

## Adding Future Items

When a new usability item is identified:
1. Add it to the **Backlog** list in the Overview above (with a brief description)
2. Add a new `## Item N: Title` section with its design
3. Create a task entry in the task file
4. Implement, test, check off
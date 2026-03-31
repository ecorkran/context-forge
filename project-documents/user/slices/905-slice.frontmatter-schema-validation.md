---
docType: slice-design
slice: frontmatter-schema-validation
project: context-forge
parent: user/architecture/900-slices.maintenance-and-refactoring.md
dependencies: []
interfaces: []
dateCreated: 20260330
dateUpdated: 20260330
status: complete
---

# Slice Design: Frontmatter Schema Validation

## Overview

Define required and optional YAML frontmatter fields per `docType` as a machine-readable schema registry in `packages/core`. Extend `ConsistencyChecker` to validate all project documents against their schema — detecting missing required fields and invalid values. Replace ad-hoc per-docType status checks (Rules 9, 11) with a generalized validation rule driven by the registry.

## Current State

### What exists

1. **Canonical schemas in prose** — `file-naming-conventions.md` defines per-docType YAML schemas for: `concept`, `initiative-plan`, `architecture`, `slice-plan`, `slice-design`, `tasks`, `review`, `analysis`.

2. **Ad-hoc frontmatter validation** in ConsistencyChecker:
   - Rule 9: missing `status` on slice plans (hard-coded)
   - Rule 11: missing `status` on arch files (hard-coded)
   - Rules 2, 4, 5: status field value mismatches (cross-referencing task completion)

3. **Frontmatter parser** — `parseFrontmatter()` reads flat key-value pairs. Does not validate against any schema.

### What's missing

- No machine-readable schema definition per docType
- No validation of required fields beyond `status`
- No detection of missing `docType`, `project`, `dateCreated`, `dateUpdated`
- No validation of field values (e.g., `status` must be one of the known values)
- Each new docType validation requires writing a new rule function

## Design

### 1. Schema Registry

A typed constant in `packages/core/src/schema/frontmatterSchema.ts` mapping each `docType` to its field requirements. Source of truth derived from the per-docType schemas in `file-naming-conventions.md`.

```typescript
interface FrontmatterFieldDef {
  required: boolean;
  /** Valid values. Omit for free-text fields. */
  values?: string[];
}

interface DocTypeSchema {
  fields: Record<string, FrontmatterFieldDef>;
}

const FRONTMATTER_SCHEMAS: Record<string, DocTypeSchema> = {
  'concept': {
    fields: {
      docType: { required: true, values: ['concept'] },
      project: { required: true },
      status: { required: true, values: VALID_STATUSES },
      dateCreated: { required: true },
      dateUpdated: { required: true },
      // optional: layer, phase, phaseName, audience, description, dependsOn
    },
  },
  'architecture': {
    fields: {
      docType: { required: true, values: ['architecture'] },
      project: { required: true },
      status: { required: true, values: VALID_STATUSES },
      archIndex: { required: true },
      component: { required: true },
      dateCreated: { required: true },
      dateUpdated: { required: true },
      // optional: layer, relatedSlices, riskLevel
    },
  },
  // ... same pattern for each docType
};
```

**Design decisions:**
- Only required fields are enumerated. Unknown/extra fields are ignored — we don't want to reject valid documents that have additional metadata.
- `values` constrains known enum fields. Free-text fields (like `project`, `component`) omit `values`.
- The `VALID_STATUSES` constant (`not_started`, `in_progress`, `complete`, `deferred`, `deprecated`) is shared, with `completed` accepted as alias for `complete`.

### 2. Validation Function

A pure function that takes frontmatter data and a docType, returns findings:

```typescript
function validateFrontmatter(
  filePath: string,
  data: Record<string, string>,
): FrontmatterFinding[]
```

Logic:
1. If `docType` is absent, emit a single finding: "missing docType field"
2. Look up schema for the `docType` value. If no schema exists, skip (don't block unknown docTypes)
3. For each required field in the schema: if missing from `data`, emit finding
4. For each field with `values` constraint: if present but not in the allowed list, emit finding

Each finding includes:
- `rule: 'frontmatter-schema'`
- `severity: 'warning'`
- `filePath`
- `description` (e.g., "Missing required field 'project' for docType 'architecture'")
- `fixAction` where applicable (e.g., `{ type: 'update-frontmatter', field, value }` for missing status with inferrable default)

### 3. ConsistencyChecker Integration

Add a new rule method `ruleFrontmatterSchema()` that:
1. Scans all `.md` files across `SCAN_DIRS` (reuse existing `discoverAllArchFiles` pattern but generalized)
2. Parses frontmatter for each
3. Calls `validateFrontmatter()`
4. Returns findings

This runs as an aggregate rule in `checkAll()`, after the existing per-slice and per-plan rules.

**Fixable findings:**
- Missing `status` → infer from context (existing behavior from Rules 9/11, now generalized)
- Missing `dateCreated` / `dateUpdated` → not auto-fixable (can't guess)
- Missing `docType` → not auto-fixable (can't guess)
- Missing `project` → could auto-fix from project name, but risky — leave as warning

### 4. Relationship to Existing Rules

Rules 9 and 11 currently hard-code missing-status checks for slice plans and arch files. After this slice:
- The schema validation rule handles missing-status generically for all docTypes
- Rules 9 and 11 can be **removed** — their behavior is subsumed
- Rules 2, 4, 5 (cross-referencing status against task completion) remain unchanged — they validate *correctness* of status values, not *presence*

### 5. Document Discovery

The checker needs to find all methodology documents to validate. Reuse the existing `SCAN_DIRS` scan from `ProjectModelBuilder` or add a similar scan to `ConsistencyChecker`:

Scan directories: `architecture`, `slices`, `tasks`, `project-guides`, `reviews`, `analysis`

Filter: files matching `*.md` with YAML frontmatter present. Skip files without frontmatter (e.g., plain markdown notes).

## Scope Boundaries

**In scope:**
- Schema registry as typed constant
- Validation function
- ConsistencyChecker rule
- Remove Rules 9 and 11 (subsumed)
- `--fix` support for missing status (same behavior as current Rules 9/11)
- Tests

**Out of scope:**
- Schema defined in external config files (YAGNI — typed constant is sufficient)
- Unknown field warnings (too noisy, many docs have extra fields)
- Cross-field validation (e.g., "if docType is review, reviewType must be present") — keep simple, just required/optional
- Modifying existing documents to add missing fields (that's what `--fix` is for)

## Success Criteria

1. `cf check` reports missing required frontmatter fields on all document types
2. `cf check --fix` auto-fixes missing `status` fields (same behavior as current Rules 9/11)
3. Rules 9 and 11 are removed — their tests replaced by schema validation tests
4. Adding a new docType requires only adding an entry to `FRONTMATTER_SCHEMAS`
5. No false positives on existing context-forge documents (validate against our own project)

## Verification Walkthrough

```bash
# 1. Build and run full test suite
pnpm build && pnpm test
# Result: all packages build clean, 726 core + 358 cli + 183 mcp + 106 electron tests pass

# 2. Run cf check — schema findings appear for documents with missing fields
cf check
# Result: 255 findings total (230 warnings, 25 infos)
# Schema findings include: missing docType on legacy docs, missing status on review/task files

# 3. Run cf check --fix — auto-fixes missing status fields
cf check --fix
# Result: Fixed 12 findings (added status: not_started to reviews and task files missing it)

# 4. Run cf check again — no more fixable findings
cf check
# Result: remaining findings are non-fixable (missing docType on pre-convention docs)

# 5. Verify Rules 9/11 are gone
grep -r "missing-plan-status\|missing-arch-status" packages/core/src/
# Result: no matches (exit code 1) — rules fully removed

# 6. Verify status normalization
# in-progress (hyphenated) → accepted as in_progress
# completed → accepted as complete
# active → accepted as in_progress
# not started (space) → accepted as not_started
```

**Caveats:**
- Legacy documents (pre-docType convention) produce "missing docType" warnings — expected, not false positives
- Worktree documents are also scanned; compound statuses like "paused, priority-adjusted" flag as invalid
- Status normalization accepts common aliases (hyphens, spaces, "active", "completed")

## Effort

3/5 — Moderate. The schema registry and validation function are straightforward. The main work is wiring into ConsistencyChecker, handling fix actions, removing Rules 9/11 cleanly, and testing against real project documents.

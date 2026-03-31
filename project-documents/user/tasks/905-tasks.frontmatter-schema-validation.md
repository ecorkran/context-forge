---
docType: tasks
slice: frontmatter-schema-validation
project: context-forge
lld: user/slices/905-slice.frontmatter-schema-validation.md
dependencies: []
projectState: >
  TypeScript monorepo (core, cli, mcp-server, electron). ConsistencyChecker
  has 11 rules including ad-hoc Rules 9/11 for missing status on slice plans
  and arch files. Frontmatter parser exists but does no schema validation.
  Canonical per-docType schemas defined in file-naming-conventions.md.
dateCreated: 20260330
dateUpdated: 20260330
status: complete
---

## Context Summary

- Working on slice 905: Frontmatter Schema Validation
- Adds a machine-readable schema registry mapping docType → required fields
- Extends ConsistencyChecker with a generic validation rule
- Replaces hard-coded Rules 9 and 11 (missing-status checks)
- Key files: `packages/core/src/schema/`, `packages/core/src/introspection/ConsistencyChecker.ts`
- No dependencies on other slices

---

## Section 1: Schema Registry

- [x] **1.1 Create `frontmatterSchema.ts` with types and VALID_STATUSES**
  - [x] Create file at `packages/core/src/schema/frontmatterSchema.ts`
  - [x] Define `FrontmatterFieldDef` interface: `{ required: boolean; values?: string[] }`
  - [x] Define `DocTypeSchema` interface: `{ fields: Record<string, FrontmatterFieldDef> }`
  - [x] Define `VALID_STATUSES` array: `['not_started', 'in_progress', 'complete', 'deferred', 'deprecated']`
  - [x] Export types and constant
  - [x] Success: file compiles, types are importable from core

- [x] **1.2 Define schema entries for all 8 docTypes**
  - [x] `concept`: docType, project, status, dateCreated, dateUpdated (required)
  - [x] `initiative-plan`: docType, project, status, dateCreated, dateUpdated (required)
  - [x] `architecture`: docType, project, status, archIndex, component, dateCreated, dateUpdated (required)
  - [x] `slice-plan`: docType, project, status, dateCreated, dateUpdated (required)
  - [x] `slice-design`: docType, slice, project, status, dateCreated, dateUpdated (required)
  - [x] `tasks`: docType, slice, project, status, dateCreated, dateUpdated (required)
  - [x] `review`: docType, project, status, dateCreated, dateUpdated (required)
  - [x] `analysis`: docType, project, status, dateCreated, dateUpdated (required)
  - [x] Export as `FRONTMATTER_SCHEMAS: Record<string, DocTypeSchema>`
  - [x] `status` field on every schema uses `values: VALID_STATUSES`
  - [x] Success: schemas match the canonical definitions in `file-naming-conventions.md`

- [x] **1.3 Export from core index**
  - [x] Add export for `FRONTMATTER_SCHEMAS`, `VALID_STATUSES`, types from `packages/core/src/index.ts`
  - [x] Success: `import { FRONTMATTER_SCHEMAS } from '@context-forge/core'` works

- [x] **1.4 Tests for schema registry**
  - [x] Test: every docType in file-naming-conventions has an entry in FRONTMATTER_SCHEMAS
  - [x] Test: every schema has `docType`, `status`, `dateCreated`, `dateUpdated` as required
  - [x] Test: `VALID_STATUSES` includes all 5 canonical values
  - [x] Test: `status` field in every schema uses `VALID_STATUSES` as values constraint
  - [x] Success: all tests pass

**Commit**: `feat(core): add frontmatter schema registry for per-docType validation`

---

## Section 2: Validation Function

- [x] **2.1 Implement `validateFrontmatter()` function**
  - [x] Add to `packages/core/src/schema/frontmatterSchema.ts` (or separate file if cleaner)
  - [x] Signature: `validateFrontmatter(filePath: string, data: Record<string, string>): FrontmatterFinding[]`
  - [x] Define `FrontmatterFinding` type with: `rule`, `severity`, `filePath`, `description`, `fixAction?`
  - [x] Logic step 1: if `docType` absent, return single finding "missing docType"
  - [x] Logic step 2: look up schema by `data.docType`. If no schema, return empty (unknown docTypes pass)
  - [x] Logic step 3: for each required field, if missing from data, emit finding
  - [x] Logic step 4: for each field with `values` constraint, if present but not in list, emit finding
  - [x] Accept `completed` as alias for `complete` in status validation
  - [x] Success: function returns correct findings for test inputs

- [x] **2.2 Tests for validateFrontmatter()**
  - [x] Test: missing docType → single finding
  - [x] Test: unknown docType → no findings (pass through)
  - [x] Test: complete valid architecture frontmatter → no findings
  - [x] Test: architecture missing `project` and `status` → two findings
  - [x] Test: status with invalid value → finding with description
  - [x] Test: `completed` accepted as alias for `complete` → no finding
  - [x] Test: fields present but empty string → treated as missing
  - [x] Success: all tests pass

**Commit**: `feat(core): add validateFrontmatter function with per-docType checking`

---

## Section 3: ConsistencyChecker Integration

- [x] **3.1 Add document discovery method**
  - [x] Add `discoverAllDocuments(projectPath: string)` to ConsistencyChecker
  - [x] Scan directories: `architecture`, `slices`, `tasks`, `project-guides`, `reviews`, `analysis`
  - [x] Filter: `*.md` files only
  - [x] Return: array of absolute file paths
  - [x] Success: method discovers documents across all scan directories

- [x] **3.2 Implement `ruleFrontmatterSchema()` rule method**
  - [x] Add method to ConsistencyChecker
  - [x] For each discovered document: parse frontmatter, call `validateFrontmatter()`
  - [x] Convert `FrontmatterFinding[]` to `ConsistencyFinding[]`
  - [x] For missing `status`: include `fixAction` with `type: 'update-frontmatter'` and inferred value
  - [x] Status inference: use `not_started` as default (matching current Rule 9/11 behavior for new docs)
  - [x] Use relative paths in finding descriptions (strip projectPath prefix)
  - [x] Success: rule returns findings for documents with schema violations

- [x] **3.3 Wire rule into `checkAll()`**
  - [x] Call `ruleFrontmatterSchema()` in `checkAll()` after existing aggregate rules
  - [x] Append findings to `allFindings`
  - [x] Success: `cf check` includes frontmatter schema findings in output

- [x] **3.4 Tests for ruleFrontmatterSchema()**
  - [x] Create test fixture: document with missing required fields
  - [x] Create test fixture: document with all required fields (no findings)
  - [x] Test: missing status on a tasks file → finding with fixAction
  - [x] Test: valid document → no findings
  - [x] Test: file without frontmatter → skipped (no findings)
  - [x] Success: all tests pass

**Commit**: `feat(core): add frontmatter schema validation rule to ConsistencyChecker`

---

## Section 4: Remove Rules 9 and 11

- [x] **4.1 Remove Rule 9 (missing-plan-status)**
  - [x] Delete `ruleMissingPlanStatus` or the relevant section in `rulePlanStatusVsEntries()`
  - [x] Identify the exact code that handles the missing status case (Rule 9) vs the status-vs-entries case
  - [x] Keep the plan-status-vs-entries logic (Rule 9a/9b) — only remove the missing-status portion
  - [x] Success: no references to `missing-plan-status` rule name in source

- [x] **4.2 Remove Rule 11 (missing-arch-status)**
  - [x] Delete `ruleArchMissingStatus()` method
  - [x] Remove call to `ruleArchMissingStatus()` from `checkAll()`
  - [x] Success: no references to `missing-arch-status` rule name in source

- [x] **4.3 Update existing tests**
  - [x] Remove or update tests that asserted `missing-plan-status` findings
  - [x] Remove or update tests that asserted `missing-arch-status` findings
  - [x] Add replacement tests verifying the schema rule catches the same cases
  - [x] Success: all tests pass, no test references to removed rule names

**Commit**: `refactor(core): remove Rules 9/11, subsumed by frontmatter schema validation`

---

## Section 5: Validation Against Real Project

- [x] **5.1 Run `cf check` against context-forge project**
  - [x] Build the project
  - [x] Run `cf check` from project root
  - [x] Review all `frontmatter-schema` findings
  - [x] Fix any false positives by adjusting schema (e.g., relaxing a field requirement)
  - [x] Fix any legitimate findings in project documents (missing fields)
  - [x] Success: `cf check` produces no unexpected frontmatter-schema findings

- [x] **5.2 Run `cf check --fix` and verify**
  - [x] Run `cf check --fix`
  - [x] Verify auto-fixed status fields are correct
  - [x] Verify no unintended changes to documents
  - [x] Success: fix mode works correctly, documents unchanged after second run

**Commit**: `fix: resolve frontmatter schema findings in project documents`

---

## Section 6: Final Validation

- [x] **6.1 Full build and test**
  - [x] `pnpm build` succeeds
  - [x] `pnpm test` — all tests pass

- [x] **6.2 Run verification walkthrough from slice design**
  - [x] Verify all walkthrough steps produce expected results
  - [x] Update walkthrough with actual output

- [x] **6.3 Update slice status and DEVLOG**
  - [x] Update slice design status to `complete`
  - [x] Update slice plan entry to checked
  - [x] Update DEVLOG with completion entry

**Commit**: `docs: mark slice 905 complete, update DEVLOG`

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
status: not_started
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

- [ ] **1.1 Create `frontmatterSchema.ts` with types and VALID_STATUSES**
  - [ ] Create file at `packages/core/src/schema/frontmatterSchema.ts`
  - [ ] Define `FrontmatterFieldDef` interface: `{ required: boolean; values?: string[] }`
  - [ ] Define `DocTypeSchema` interface: `{ fields: Record<string, FrontmatterFieldDef> }`
  - [ ] Define `VALID_STATUSES` array: `['not_started', 'in_progress', 'complete', 'deferred', 'deprecated']`
  - [ ] Export types and constant
  - [ ] Success: file compiles, types are importable from core

- [ ] **1.2 Define schema entries for all 8 docTypes**
  - [ ] `concept`: docType, project, status, dateCreated, dateUpdated (required)
  - [ ] `initiative-plan`: docType, project, status, dateCreated, dateUpdated (required)
  - [ ] `architecture`: docType, project, status, archIndex, component, dateCreated, dateUpdated (required)
  - [ ] `slice-plan`: docType, project, status, dateCreated, dateUpdated (required)
  - [ ] `slice-design`: docType, slice, project, status, dateCreated, dateUpdated (required)
  - [ ] `tasks`: docType, slice, project, status, dateCreated, dateUpdated (required)
  - [ ] `review`: docType, project, status, dateCreated, dateUpdated (required)
  - [ ] `analysis`: docType, project, status, dateCreated, dateUpdated (required)
  - [ ] Export as `FRONTMATTER_SCHEMAS: Record<string, DocTypeSchema>`
  - [ ] `status` field on every schema uses `values: VALID_STATUSES`
  - [ ] Success: schemas match the canonical definitions in `file-naming-conventions.md`

- [ ] **1.3 Export from core index**
  - [ ] Add export for `FRONTMATTER_SCHEMAS`, `VALID_STATUSES`, types from `packages/core/src/index.ts`
  - [ ] Success: `import { FRONTMATTER_SCHEMAS } from '@context-forge/core'` works

- [ ] **1.4 Tests for schema registry**
  - [ ] Test: every docType in file-naming-conventions has an entry in FRONTMATTER_SCHEMAS
  - [ ] Test: every schema has `docType`, `status`, `dateCreated`, `dateUpdated` as required
  - [ ] Test: `VALID_STATUSES` includes all 5 canonical values
  - [ ] Test: `status` field in every schema uses `VALID_STATUSES` as values constraint
  - [ ] Success: all tests pass

**Commit**: `feat(core): add frontmatter schema registry for per-docType validation`

---

## Section 2: Validation Function

- [ ] **2.1 Implement `validateFrontmatter()` function**
  - [ ] Add to `packages/core/src/schema/frontmatterSchema.ts` (or separate file if cleaner)
  - [ ] Signature: `validateFrontmatter(filePath: string, data: Record<string, string>): FrontmatterFinding[]`
  - [ ] Define `FrontmatterFinding` type with: `rule`, `severity`, `filePath`, `description`, `fixAction?`
  - [ ] Logic step 1: if `docType` absent, return single finding "missing docType"
  - [ ] Logic step 2: look up schema by `data.docType`. If no schema, return empty (unknown docTypes pass)
  - [ ] Logic step 3: for each required field, if missing from data, emit finding
  - [ ] Logic step 4: for each field with `values` constraint, if present but not in list, emit finding
  - [ ] Accept `completed` as alias for `complete` in status validation
  - [ ] Success: function returns correct findings for test inputs

- [ ] **2.2 Tests for validateFrontmatter()**
  - [ ] Test: missing docType → single finding
  - [ ] Test: unknown docType → no findings (pass through)
  - [ ] Test: complete valid architecture frontmatter → no findings
  - [ ] Test: architecture missing `project` and `status` → two findings
  - [ ] Test: status with invalid value → finding with description
  - [ ] Test: `completed` accepted as alias for `complete` → no finding
  - [ ] Test: fields present but empty string → treated as missing
  - [ ] Success: all tests pass

**Commit**: `feat(core): add validateFrontmatter function with per-docType checking`

---

## Section 3: ConsistencyChecker Integration

- [ ] **3.1 Add document discovery method**
  - [ ] Add `discoverAllDocuments(projectPath: string)` to ConsistencyChecker
  - [ ] Scan directories: `architecture`, `slices`, `tasks`, `project-guides`, `reviews`, `analysis`
  - [ ] Filter: `*.md` files only
  - [ ] Return: array of absolute file paths
  - [ ] Success: method discovers documents across all scan directories

- [ ] **3.2 Implement `ruleFrontmatterSchema()` rule method**
  - [ ] Add method to ConsistencyChecker
  - [ ] For each discovered document: parse frontmatter, call `validateFrontmatter()`
  - [ ] Convert `FrontmatterFinding[]` to `ConsistencyFinding[]`
  - [ ] For missing `status`: include `fixAction` with `type: 'update-frontmatter'` and inferred value
  - [ ] Status inference: use `not_started` as default (matching current Rule 9/11 behavior for new docs)
  - [ ] Use relative paths in finding descriptions (strip projectPath prefix)
  - [ ] Success: rule returns findings for documents with schema violations

- [ ] **3.3 Wire rule into `checkAll()`**
  - [ ] Call `ruleFrontmatterSchema()` in `checkAll()` after existing aggregate rules
  - [ ] Append findings to `allFindings`
  - [ ] Success: `cf check` includes frontmatter schema findings in output

- [ ] **3.4 Tests for ruleFrontmatterSchema()**
  - [ ] Create test fixture: document with missing required fields
  - [ ] Create test fixture: document with all required fields (no findings)
  - [ ] Test: missing status on a tasks file → finding with fixAction
  - [ ] Test: valid document → no findings
  - [ ] Test: file without frontmatter → skipped (no findings)
  - [ ] Success: all tests pass

**Commit**: `feat(core): add frontmatter schema validation rule to ConsistencyChecker`

---

## Section 4: Remove Rules 9 and 11

- [ ] **4.1 Remove Rule 9 (missing-plan-status)**
  - [ ] Delete `ruleMissingPlanStatus` or the relevant section in `rulePlanStatusVsEntries()`
  - [ ] Identify the exact code that handles the missing status case (Rule 9) vs the status-vs-entries case
  - [ ] Keep the plan-status-vs-entries logic (Rule 9a/9b) — only remove the missing-status portion
  - [ ] Success: no references to `missing-plan-status` rule name in source

- [ ] **4.2 Remove Rule 11 (missing-arch-status)**
  - [ ] Delete `ruleArchMissingStatus()` method
  - [ ] Remove call to `ruleArchMissingStatus()` from `checkAll()`
  - [ ] Success: no references to `missing-arch-status` rule name in source

- [ ] **4.3 Update existing tests**
  - [ ] Remove or update tests that asserted `missing-plan-status` findings
  - [ ] Remove or update tests that asserted `missing-arch-status` findings
  - [ ] Add replacement tests verifying the schema rule catches the same cases
  - [ ] Success: all tests pass, no test references to removed rule names

**Commit**: `refactor(core): remove Rules 9/11, subsumed by frontmatter schema validation`

---

## Section 5: Validation Against Real Project

- [ ] **5.1 Run `cf check` against context-forge project**
  - [ ] Build the project
  - [ ] Run `cf check` from project root
  - [ ] Review all `frontmatter-schema` findings
  - [ ] Fix any false positives by adjusting schema (e.g., relaxing a field requirement)
  - [ ] Fix any legitimate findings in project documents (missing fields)
  - [ ] Success: `cf check` produces no unexpected frontmatter-schema findings

- [ ] **5.2 Run `cf check --fix` and verify**
  - [ ] Run `cf check --fix`
  - [ ] Verify auto-fixed status fields are correct
  - [ ] Verify no unintended changes to documents
  - [ ] Success: fix mode works correctly, documents unchanged after second run

**Commit**: `fix: resolve frontmatter schema findings in project documents`

---

## Section 6: Final Validation

- [ ] **6.1 Full build and test**
  - [ ] `pnpm build` succeeds
  - [ ] `pnpm test` — all tests pass

- [ ] **6.2 Run verification walkthrough from slice design**
  - [ ] Verify all walkthrough steps produce expected results
  - [ ] Update walkthrough with actual output

- [ ] **6.3 Update slice status and DEVLOG**
  - [ ] Update slice design status to `complete`
  - [ ] Update slice plan entry to checked
  - [ ] Update DEVLOG with completion entry

**Commit**: `docs: mark slice 905 complete, update DEVLOG`

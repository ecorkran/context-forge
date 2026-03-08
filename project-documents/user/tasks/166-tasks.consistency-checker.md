---
slice: consistency-checker
project: context-forge
lld: user/slices/166-slice.consistency-checker.md
dependencies: [163-slice.artifact-introspection-engine]
projectState: Introspection engine complete (slice 163). Workflow navigator complete (slice 165). cf check CLI command stubbed. No ConsistencyChecker class exists yet.
dateCreated: 20260307
dateUpdated: 20260307
status: complete
---

## Context Summary
- Working on 166-slice.consistency-checker
- Introspection infrastructure (parsers, types, interfaces) is complete and tested
- `cf check` CLI command exists as a stub printing "not yet available"
- MCP `workflowTools.ts` has `workflow_status`, `workflow_next`, `workflow_future` — `workflow_check` will be added
- Config key `workflow.auto_fix` does not exist yet
- This slice delivers: detection rules, fix capabilities, MCP tool, CLI command
- Next planned slice: per slice plan

## Tasks

### 1. Types and Config Key

- [x] **1.1 Add consistency checker types to `packages/core/src/introspection/types.ts`**
  - [x] Add `ConsistencySeverity` type: `'info' | 'warning' | 'error'`
  - [x] Add `ConsistencyFinding` interface with fields: `rule`, `severity`, `location`, `description`, `suggestedFix`, `fixable`, `fixAction?`
  - [x] Add `ConsistencyCheckResult` interface with fields: `projectPath`, `findings`, `totalFindings`, `errors`, `warnings`, `infos`, `summary`
  - [x] Add `FixLogEntry` interface with fields: `rule`, `action`, `filePath`, `field?`, `before`, `after`
  - [x] Add `ConsistencyFixResult` extending `ConsistencyCheckResult` with: `fixed`, `fixLog`, `fixErrors`
  - [x] All types match the slice design specification exactly
  - [x] Project builds successfully

- [x] **1.2 Add `workflow.auto_fix` config key to `packages/core/src/config/ConfigKeys.ts`**
  - [x] Add entry: type `boolean`, default `false`, description about automatic non-destructive corrections
  - [x] Project builds successfully

- [x] **1.3 Commit: types and config key**

### 2. MarkdownWriter Utility

- [x] **2.1 Create `packages/core/src/introspection/writers/markdownWriter.ts`**
  - [x] Implement `updateCheckbox(filePath, lineIndex, checked: boolean): Promise<FixLogEntry>`
    - [x] Reads full file, modifies the target line's checkbox (`[ ]` ↔ `[x]`), writes full file back
    - [x] Returns `FixLogEntry` with `before`/`after` values
    - [x] Throws if line doesn't contain a checkbox pattern
  - [x] Implement `updateFrontmatterField(filePath, key, value): Promise<FixLogEntry>`
    - [x] Reads full file, finds the frontmatter key, replaces its value, writes full file back
    - [x] Returns `FixLogEntry` with `before`/`after` values
    - [x] Throws if frontmatter not found or key not present
  - [x] Both functions use atomic read-modify-write (no streaming, no partial writes)
  - [x] Export from `packages/core/src/introspection/index.ts`

- [x] **2.2 Tests for MarkdownWriter**
  - [x] Create `packages/core/tests/introspection/writers/markdownWriter.test.ts`
  - [x] Test `updateCheckbox`: unchecked → checked
  - [x] Test `updateCheckbox`: checked → unchecked
  - [x] Test `updateCheckbox`: throws on line without checkbox
  - [x] Test `updateCheckbox`: preserves surrounding content
  - [x] Test `updateFrontmatterField`: updates existing field value
  - [x] Test `updateFrontmatterField`: handles quoted values
  - [x] Test `updateFrontmatterField`: throws when frontmatter missing
  - [x] Test `updateFrontmatterField`: throws when key not found
  - [x] Test `updateFrontmatterField`: preserves rest of file
  - [x] All tests pass

- [x] **2.3 Commit: MarkdownWriter utility and tests**

### 3. ConsistencyChecker — Detection Rules

- [x] **3.1 Create `packages/core/src/introspection/ConsistencyChecker.ts`**
  - [x] Constructor takes `IArtifactIntrospector` (dependency injection)
  - [x] Implement `check(project: ProjectData): Promise<ConsistencyCheckResult>`
  - [x] Gracefully handles missing `projectPath`, `fileSlice`, `fileSlicePlan` (returns empty result, not crash)
  - [x] Export from `packages/core/src/introspection/index.ts`
  - [x] Re-export from `packages/core/src/node.ts`

- [x] **3.2 Implement Rule 1: task completion vs. slice plan checkbox**
  - [x] Parse task file for active slice → get `inferredStatus`
  - [x] Parse slice plan → find entry by slice index → get `isChecked`
  - [x] Detect: tasks complete but slice unchecked → warning, fixable (update-checkbox)
  - [x] Detect: slice checked but tasks incomplete → error, fixable (update-checkbox)
  - [x] Handle missing task file as info-level finding (not crash)
  - [x] Handle missing slice plan entry gracefully

- [x] **3.3 Implement Rule 2: frontmatter status vs. computed state**
  - [x] Parse slice design frontmatter → get `status` field (normalize case)
  - [x] Compute expected status from task completion and slice plan state
  - [x] Detect: frontmatter says "complete" but tasks incomplete → error, fixable (update-frontmatter)
  - [x] Detect: frontmatter says "in-progress" but all tasks done → warning, fixable (update-frontmatter)
  - [x] Handle missing slice design file gracefully

- [x] **3.4 Implement Rule 3: missing artifact cross-references**
  - [x] Detect: task file exists but no matching slice plan entry → info
  - [x] Detect: slice plan entry exists but no task file → info (expected during early phases)
  - [x] These are info-level, not fixable

- [x] **3.5 Implement Rule 4: plan checkbox vs. slice frontmatter status**
  - [x] Detect: slice plan entry checked but frontmatter status is not "complete" → warning, fixable
  - [x] Detect: frontmatter status is "complete" but slice plan entry unchecked → warning, fixable
  - [x] Handle cases where slice design file doesn't exist

- [x] **3.6 Tests for ConsistencyChecker detection rules**
  - [x] Create `packages/core/tests/introspection/ConsistencyChecker.test.ts`
  - [x] Mock `IArtifactIntrospector` for all tests
  - [x] Test Rule 1: tasks complete, slice unchecked → warning finding
  - [x] Test Rule 1: slice checked, tasks incomplete → error finding
  - [x] Test Rule 1: consistent state → no finding
  - [x] Test Rule 2: frontmatter "complete", tasks incomplete → error finding
  - [x] Test Rule 2: frontmatter "in-progress", tasks complete → warning finding
  - [x] Test Rule 2: consistent state → no finding
  - [x] Test Rule 3: task file without plan entry → info finding
  - [x] Test Rule 3: plan entry without task file → info finding
  - [x] Test Rule 4: plan checked, frontmatter not complete → warning finding
  - [x] Test Rule 4: frontmatter complete, plan unchecked → warning finding
  - [x] Test graceful handling: missing projectPath → empty result
  - [x] Test graceful handling: missing slice/plan fields → partial results without crash
  - [x] Test summary string format
  - [x] All tests pass

- [x] **3.7 Commit: ConsistencyChecker detection rules and tests**

### 4. ConsistencyChecker — Fix Mode

- [x] **4.1 Implement `fix(project: ProjectData): Promise<ConsistencyFixResult>`**
  - [x] Calls `check()` first to get findings
  - [x] Filters for fixable findings
  - [x] Applies fixes via `MarkdownWriter` (`updateCheckbox` / `updateFrontmatterField`)
  - [x] Populates `fixLog` with `FixLogEntry` for each applied fix (including `before`/`after`)
  - [x] Catches individual fix errors without aborting remaining fixes
  - [x] Populates `fixErrors` array for any failed fix operations
  - [x] Returns `ConsistencyFixResult` with accurate `fixed` count

- [x] **4.2 Tests for fix mode**
  - [x] Test: fixable checkbox finding → `updateCheckbox` called, fixLog populated
  - [x] Test: fixable frontmatter finding → `updateFrontmatterField` called, fixLog populated
  - [x] Test: non-fixable finding → skipped, not in fixLog
  - [x] Test: fix error → captured in fixErrors, does not abort other fixes
  - [x] Test: fixLog entries have correct `before`/`after` values
  - [x] Test: `fixed` count matches applied fixes
  - [x] All tests pass

- [x] **4.3 Commit: fix mode and tests**

### 5. MCP Tool

- [x] **5.1 Add `workflow_check` tool to `packages/mcp-server/src/tools/workflowTools.ts`**
  - [x] Input schema: `projectId?` (string), `fix?` (boolean, default false)
  - [x] When `fix` not set, check `workflow.auto_fix` config key; if true, behave as `fix: true`
  - [x] Resolve project, instantiate `ConsistencyChecker` with `ArtifactIntrospector`
  - [x] Call `check()` or `fix()` based on fix parameter
  - [x] Return JSON result
  - [x] Annotations: `readOnlyHint: false`, `openWorldHint: false`
  - [x] Follow existing tool patterns (error handling, `errorResult`/`jsonResult` helpers)

- [x] **5.2 Tests for `workflow_check` MCP tool**
  - [x] Create or extend `packages/mcp-server/tests/tools/workflowTools.test.ts`
  - [x] Test: basic check returns findings
  - [x] Test: fix mode returns fix result with fixLog
  - [x] Test: auto_fix config integration
  - [x] Test: project not found → error result
  - [x] All tests pass

- [x] **5.3 Commit: MCP workflow_check tool and tests**

### 6. CLI Command

- [x] **6.1 Replace `cf check` stub in `packages/cli/src/commands/check.ts`**
  - [x] Accept `--fix`, `--json`, `--project <id>` options (already stubbed)
  - [x] Resolve project (same pattern as other CLI commands)
  - [x] Instantiate `ConsistencyChecker` with `ArtifactIntrospector`
  - [x] When `--fix` not set, check `workflow.auto_fix` config; if true, enable fix mode
  - [x] JSON mode: output `ConsistencyCheckResult` or `ConsistencyFixResult`
  - [x] Terminal mode: formatted output with severity icons (error, warning, info markers)
  - [x] Fix mode terminal output: show `before → after` per fix inline
  - [x] Show summary line: finding counts or "Fixed N of M findings"
  - [x] Clean output when no findings: "No inconsistencies found"

- [x] **6.2 Tests for `cf check` CLI command**
  - [x] Create or extend `packages/cli/tests/commands/check.test.ts`
  - [x] Test: no findings → clean message
  - [x] Test: findings present → formatted output with severity icons
  - [x] Test: `--fix` → fix results with before/after
  - [x] Test: `--json` → valid JSON output
  - [x] Test: project resolution works
  - [x] All tests pass

- [x] **6.3 Commit: cf check CLI command and tests**

### 7. Integration and Finalization

- [x] **7.1 Integration verification**
  - [x] Full build passes (`pnpm build`)
  - [x] All tests pass across all packages (`pnpm test`)
  - [x] Typecheck passes (`pnpm typecheck`)
  - [x] Lint passes

- [x] **7.2 Update slice design status to complete**
  - [x] Update `166-slice.consistency-checker.md` frontmatter `status: complete`
  - [x] Check off slice 166 entry in `160-slices.project-workflow-system.md`
  - [x] Update DEVLOG with slice 166 completion entry and commit hashes

- [x] **7.3 Final commit: integration verification and status updates**

---
slice: consistency-checker
project: context-forge
lld: user/slices/166-slice.consistency-checker.md
dependencies: [163-slice.artifact-introspection-engine]
projectState: Introspection engine complete (slice 163). Workflow navigator complete (slice 165). cf check CLI command stubbed. No ConsistencyChecker class exists yet.
dateCreated: 20260307
dateUpdated: 20260307
status: not_started
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

- [ ] **1.1 Add consistency checker types to `packages/core/src/introspection/types.ts`**
  - [ ] Add `ConsistencySeverity` type: `'info' | 'warning' | 'error'`
  - [ ] Add `ConsistencyFinding` interface with fields: `rule`, `severity`, `location`, `description`, `suggestedFix`, `fixable`, `fixAction?`
  - [ ] Add `ConsistencyCheckResult` interface with fields: `projectPath`, `findings`, `totalFindings`, `errors`, `warnings`, `infos`, `summary`
  - [ ] Add `FixLogEntry` interface with fields: `rule`, `action`, `filePath`, `field?`, `before`, `after`
  - [ ] Add `ConsistencyFixResult` extending `ConsistencyCheckResult` with: `fixed`, `fixLog`, `fixErrors`
  - [ ] All types match the slice design specification exactly
  - [ ] Project builds successfully

- [ ] **1.2 Add `workflow.auto_fix` config key to `packages/core/src/config/ConfigKeys.ts`**
  - [ ] Add entry: type `boolean`, default `false`, description about automatic non-destructive corrections
  - [ ] Project builds successfully

- [ ] **1.3 Commit: types and config key**

### 2. MarkdownWriter Utility

- [ ] **2.1 Create `packages/core/src/introspection/writers/markdownWriter.ts`**
  - [ ] Implement `updateCheckbox(filePath, lineIndex, checked: boolean): Promise<FixLogEntry>`
    - [ ] Reads full file, modifies the target line's checkbox (`[ ]` ↔ `[x]`), writes full file back
    - [ ] Returns `FixLogEntry` with `before`/`after` values
    - [ ] Throws if line doesn't contain a checkbox pattern
  - [ ] Implement `updateFrontmatterField(filePath, key, value): Promise<FixLogEntry>`
    - [ ] Reads full file, finds the frontmatter key, replaces its value, writes full file back
    - [ ] Returns `FixLogEntry` with `before`/`after` values
    - [ ] Throws if frontmatter not found or key not present
  - [ ] Both functions use atomic read-modify-write (no streaming, no partial writes)
  - [ ] Export from `packages/core/src/introspection/index.ts`

- [ ] **2.2 Tests for MarkdownWriter**
  - [ ] Create `packages/core/tests/introspection/writers/markdownWriter.test.ts`
  - [ ] Test `updateCheckbox`: unchecked → checked
  - [ ] Test `updateCheckbox`: checked → unchecked
  - [ ] Test `updateCheckbox`: throws on line without checkbox
  - [ ] Test `updateCheckbox`: preserves surrounding content
  - [ ] Test `updateFrontmatterField`: updates existing field value
  - [ ] Test `updateFrontmatterField`: handles quoted values
  - [ ] Test `updateFrontmatterField`: throws when frontmatter missing
  - [ ] Test `updateFrontmatterField`: throws when key not found
  - [ ] Test `updateFrontmatterField`: preserves rest of file
  - [ ] All tests pass

- [ ] **2.3 Commit: MarkdownWriter utility and tests**

### 3. ConsistencyChecker — Detection Rules

- [ ] **3.1 Create `packages/core/src/introspection/ConsistencyChecker.ts`**
  - [ ] Constructor takes `IArtifactIntrospector` (dependency injection)
  - [ ] Implement `check(project: ProjectData): Promise<ConsistencyCheckResult>`
  - [ ] Gracefully handles missing `projectPath`, `fileSlice`, `fileSlicePlan` (returns empty result, not crash)
  - [ ] Export from `packages/core/src/introspection/index.ts`
  - [ ] Re-export from `packages/core/src/node.ts`

- [ ] **3.2 Implement Rule 1: task completion vs. slice plan checkbox**
  - [ ] Parse task file for active slice → get `inferredStatus`
  - [ ] Parse slice plan → find entry by slice index → get `isChecked`
  - [ ] Detect: tasks complete but slice unchecked → warning, fixable (update-checkbox)
  - [ ] Detect: slice checked but tasks incomplete → error, fixable (update-checkbox)
  - [ ] Handle missing task file as info-level finding (not crash)
  - [ ] Handle missing slice plan entry gracefully

- [ ] **3.3 Implement Rule 2: frontmatter status vs. computed state**
  - [ ] Parse slice design frontmatter → get `status` field (normalize case)
  - [ ] Compute expected status from task completion and slice plan state
  - [ ] Detect: frontmatter says "complete" but tasks incomplete → error, fixable (update-frontmatter)
  - [ ] Detect: frontmatter says "in-progress" but all tasks done → warning, fixable (update-frontmatter)
  - [ ] Handle missing slice design file gracefully

- [ ] **3.4 Implement Rule 3: missing artifact cross-references**
  - [ ] Detect: task file exists but no matching slice plan entry → info
  - [ ] Detect: slice plan entry exists but no task file → info (expected during early phases)
  - [ ] These are info-level, not fixable

- [ ] **3.5 Implement Rule 4: plan checkbox vs. slice frontmatter status**
  - [ ] Detect: slice plan entry checked but frontmatter status is not "complete" → warning, fixable
  - [ ] Detect: frontmatter status is "complete" but slice plan entry unchecked → warning, fixable
  - [ ] Handle cases where slice design file doesn't exist

- [ ] **3.6 Tests for ConsistencyChecker detection rules**
  - [ ] Create `packages/core/tests/introspection/ConsistencyChecker.test.ts`
  - [ ] Mock `IArtifactIntrospector` for all tests
  - [ ] Test Rule 1: tasks complete, slice unchecked → warning finding
  - [ ] Test Rule 1: slice checked, tasks incomplete → error finding
  - [ ] Test Rule 1: consistent state → no finding
  - [ ] Test Rule 2: frontmatter "complete", tasks incomplete → error finding
  - [ ] Test Rule 2: frontmatter "in-progress", tasks complete → warning finding
  - [ ] Test Rule 2: consistent state → no finding
  - [ ] Test Rule 3: task file without plan entry → info finding
  - [ ] Test Rule 3: plan entry without task file → info finding
  - [ ] Test Rule 4: plan checked, frontmatter not complete → warning finding
  - [ ] Test Rule 4: frontmatter complete, plan unchecked → warning finding
  - [ ] Test graceful handling: missing projectPath → empty result
  - [ ] Test graceful handling: missing slice/plan fields → partial results without crash
  - [ ] Test summary string format
  - [ ] All tests pass

- [ ] **3.7 Commit: ConsistencyChecker detection rules and tests**

### 4. ConsistencyChecker — Fix Mode

- [ ] **4.1 Implement `fix(project: ProjectData): Promise<ConsistencyFixResult>`**
  - [ ] Calls `check()` first to get findings
  - [ ] Filters for fixable findings
  - [ ] Applies fixes via `MarkdownWriter` (`updateCheckbox` / `updateFrontmatterField`)
  - [ ] Populates `fixLog` with `FixLogEntry` for each applied fix (including `before`/`after`)
  - [ ] Catches individual fix errors without aborting remaining fixes
  - [ ] Populates `fixErrors` array for any failed fix operations
  - [ ] Returns `ConsistencyFixResult` with accurate `fixed` count

- [ ] **4.2 Tests for fix mode**
  - [ ] Test: fixable checkbox finding → `updateCheckbox` called, fixLog populated
  - [ ] Test: fixable frontmatter finding → `updateFrontmatterField` called, fixLog populated
  - [ ] Test: non-fixable finding → skipped, not in fixLog
  - [ ] Test: fix error → captured in fixErrors, does not abort other fixes
  - [ ] Test: fixLog entries have correct `before`/`after` values
  - [ ] Test: `fixed` count matches applied fixes
  - [ ] All tests pass

- [ ] **4.3 Commit: fix mode and tests**

### 5. MCP Tool

- [ ] **5.1 Add `workflow_check` tool to `packages/mcp-server/src/tools/workflowTools.ts`**
  - [ ] Input schema: `projectId?` (string), `fix?` (boolean, default false)
  - [ ] When `fix` not set, check `workflow.auto_fix` config key; if true, behave as `fix: true`
  - [ ] Resolve project, instantiate `ConsistencyChecker` with `ArtifactIntrospector`
  - [ ] Call `check()` or `fix()` based on fix parameter
  - [ ] Return JSON result
  - [ ] Annotations: `readOnlyHint: false`, `openWorldHint: false`
  - [ ] Follow existing tool patterns (error handling, `errorResult`/`jsonResult` helpers)

- [ ] **5.2 Tests for `workflow_check` MCP tool**
  - [ ] Create or extend `packages/mcp-server/tests/tools/workflowTools.test.ts`
  - [ ] Test: basic check returns findings
  - [ ] Test: fix mode returns fix result with fixLog
  - [ ] Test: auto_fix config integration
  - [ ] Test: project not found → error result
  - [ ] All tests pass

- [ ] **5.3 Commit: MCP workflow_check tool and tests**

### 6. CLI Command

- [ ] **6.1 Replace `cf check` stub in `packages/cli/src/commands/check.ts`**
  - [ ] Accept `--fix`, `--json`, `--project <id>` options (already stubbed)
  - [ ] Resolve project (same pattern as other CLI commands)
  - [ ] Instantiate `ConsistencyChecker` with `ArtifactIntrospector`
  - [ ] When `--fix` not set, check `workflow.auto_fix` config; if true, enable fix mode
  - [ ] JSON mode: output `ConsistencyCheckResult` or `ConsistencyFixResult`
  - [ ] Terminal mode: formatted output with severity icons (error, warning, info markers)
  - [ ] Fix mode terminal output: show `before → after` per fix inline
  - [ ] Show summary line: finding counts or "Fixed N of M findings"
  - [ ] Clean output when no findings: "No inconsistencies found"

- [ ] **6.2 Tests for `cf check` CLI command**
  - [ ] Create or extend `packages/cli/tests/commands/check.test.ts`
  - [ ] Test: no findings → clean message
  - [ ] Test: findings present → formatted output with severity icons
  - [ ] Test: `--fix` → fix results with before/after
  - [ ] Test: `--json` → valid JSON output
  - [ ] Test: project resolution works
  - [ ] All tests pass

- [ ] **6.3 Commit: cf check CLI command and tests**

### 7. Integration and Finalization

- [ ] **7.1 Integration verification**
  - [ ] Full build passes (`pnpm build`)
  - [ ] All tests pass across all packages (`pnpm test`)
  - [ ] Typecheck passes (`pnpm typecheck`)
  - [ ] Lint passes

- [ ] **7.2 Update slice design status to complete**
  - [ ] Update `166-slice.consistency-checker.md` frontmatter `status: complete`
  - [ ] Check off slice 166 entry in `160-slices.project-workflow-system.md`
  - [ ] Update DEVLOG with slice 166 completion entry and commit hashes

- [ ] **7.3 Final commit: integration verification and status updates**

---
slice: 178-slice.consistency-checker-all-slices-mode
project: context-forge
lld: user/slices/178-slice.consistency-checker-all-slices-mode.md
dependencies: [166-slice.consistency-checker, 163-slice.artifact-introspection-engine]
projectState: "Phase 5 task breakdown for 178. Dependencies complete. ConsistencyChecker, MarkdownWriter, rules 1-5, and IArtifactIntrospector all in place."
dateCreated: 20260309
dateUpdated: 20260309
status: in_progress
---

# Tasks: Consistency Checker — All-Slices Mode

## Context

Working on slice 178 in project context-forge. This slice extends `ConsistencyChecker` to iterate all entries in a slice plan instead of only the active slice. Adds 3 new detection rules (duplicate index, plan status vs entries, arch status vs plans). Adds CLI confirmation safety for fix-all mode.

**Delivers:** `checkAll()` / `fixAll()` methods, 3 new rules, `--slice` and `--yes` CLI flags, MCP `sliceIndex` parameter.
**Dependencies:** `ConsistencyChecker` (166), `IArtifactIntrospector` (163), `MarkdownWriter` (166).

---

## Task 1: Implement `checkAll()` method

- [x] **1.1 Add `checkAll(project)` public method to `ConsistencyChecker`**
  - [x] Method signature: `async checkAll(project: ProjectData): Promise<ConsistencyCheckResult>`
  - [x] Return `emptyResult` if `projectPath` is missing
  - [x] Parse slice plan via existing `safeParseSlicePlan(project, projectPath)`
  - [x] If no slice plan or empty entries, return `emptyResult`
  - [x] Success: method exists, compiles, returns empty result for projects without slice plans

- [x] **1.2 Implement per-slice iteration loop in `checkAll()`**
  - [x] For each entry in `slicePlanResult.entries`, call `safeDetectDocuments(projectPath, entry.index)`
  - [x] For each entry, call `safeParseTaskFile()` and `safeParseFrontmatter()` using detected documents
  - [x] Call `safeParseTaskFileFrontmatter()` for each entry's task file
  - [x] Run existing rules 1-5 against each entry's data (reuse private rule methods)
  - [x] Prefix each finding's `description` with `[{sliceIndex}]` for attribution
  - [x] Aggregate all findings into a single array
  - [x] Return via `buildResult(projectPath, allFindings)`
  - [x] Success: `checkAll()` returns findings across multiple slices in a test scenario

- [x] **1.3 Extract shared per-slice check logic**
  - [x] The code that gathers data + runs rules 1-5 for a single slice exists in `check()`. Extract into a private method like `checkSlice(projectPath, sliceIndex, slicePlanResult, slicePlanPath)` that both `check()` and `checkAll()` can call
  - [x] Update `check()` to delegate to `checkSlice()` — no behavior change
  - [x] Success: existing tests still pass after refactor; `check()` behavior unchanged

**Commit after Task 1.**

---

## Task 2: Implement new detection rules

- [x] **2.1 Rule 6: Duplicate slice index detection**
  - [x] Add private method `ruleDuplicateIndex(entries: SlicePlanEntry[], slicePlanPath: string): ConsistencyFinding[]`
  - [x] Build a `Map<number, string[]>` of index → entry names
  - [x] For each index with >1 entry, emit finding: rule `duplicate-index`, severity `error`, `fixable: false`
  - [x] Description: `"Duplicate slice index {N}: '{Name1}' and '{Name2}'"`
  - [x] Call from `checkAll()` after the per-slice loop
  - [x] Success: test with mock data containing two entries with index 168 produces an error finding

- [x] **2.2 Rule 7: Plan status vs. all-entries-complete**
  - [x] Add private method `rulePlanStatusVsEntries(slicePlanPath, slicePlanResult, projectPath): ConsistencyFinding[]`
  - [x] Parse frontmatter of the slice plan file via `safeParseFrontmatter(slicePlanPath)`
  - [x] Note: `safeParseFrontmatter` takes a relative path — will need the slice plan's relative path or adjust to accept absolute. Use `this.introspector.parseFrontmatter(slicePlanPath)` directly (slice plan path is already absolute from `resolveSlicePlanPath`)
  - [x] Compare: if frontmatter `status: complete` but `completedSlices < totalSlices` → warning
  - [x] Compare: if frontmatter status is not `complete` but `completedSlices === totalSlices` → warning
  - [x] Fixable via `update-frontmatter` on the slice plan file
  - [x] Call from `checkAll()` after per-slice loop
  - [x] Success: test with plan frontmatter "complete" but 2/5 entries checked produces a warning

- [x] **2.3 Rule 8: Architecture status vs. all-plans-complete**
  - [x] Add private method `ruleArchStatusVsPlans(project, projectPath, slicePlanResult): ConsistencyFinding[]`
  - [x] Resolve architecture file path from `project.fileArch` using `resolveArtifactPath('fileArch', ...)`
  - [x] Parse architecture frontmatter via `this.introspector.parseFrontmatter(archPath)`
  - [x] Compare: if arch `status: complete` but plan has unchecked entries → warning
  - [x] Compare: if arch status not `complete` but all plan entries are checked → warning
  - [x] Fixable via `update-frontmatter` on the architecture file
  - [x] Call from `checkAll()` after per-slice loop
  - [x] Success: test with arch frontmatter "complete" but plan has unchecked entries produces a warning

**Commit after Task 2.**

---

## Task 3: Implement `fixAll()` method

- [x] **3.1 Add `fixAll(project)` public method**
  - [x] Method signature: `async fixAll(project: ProjectData): Promise<ConsistencyFixResult>`
  - [x] Call `checkAll(project)` to get findings
  - [x] Iterate fixable findings and apply fixes — same pattern as existing `fix()` method
  - [x] Single pass only — no re-checking after fixes
  - [x] Return `ConsistencyFixResult` with `fixed` count, `fixLog`, and `fixErrors`
  - [x] Success: `fixAll()` applies corrections and returns log entries with before/after

**Commit after Task 3.**

---

## Task 4: Update CLI `cf check`

- [x] **4.1 Add `--slice` and `--yes` flags**
  - [x] Add `.option('--slice <index>', 'Check only a specific slice by index')` to the command
  - [x] Add `.option('--yes', 'Skip confirmation prompt in fix mode')`
  - [x] Parse `opts.slice` as number if provided
  - [x] Success: `cf check --help` shows both new flags

- [x] **4.2 Route to `checkAll` / `check` based on `--slice` flag**
  - [x] If `--slice` provided: temporarily set `project.fileSlice` to the matching slice stem (resolve via slice plan entries or use `{index}-slice.*` pattern), then call existing `checker.check(project)` / `checker.fix(project)`
  - [x] If no `--slice`: call `checker.checkAll(project)` / `checker.fixAll(project)`
  - [x] Success: `cf check` runs all-slices mode; `cf check --slice 175` narrows to one slice

- [x] **4.3 Add confirmation prompt for fix-all mode**
  - [x] When `--fix` is used without `--slice` and without `--yes`:
    - [x] First run `checkAll()` (dry run) to get findings
    - [x] Print summary: `"Found N fixable findings across M slices. Apply fixes?"`
    - [x] Prompt `y/N` using `readline.createInterface` (reuse pattern from `setup-ide.ts`)
    - [x] If declined, print "Aborted." and exit cleanly
    - [x] If confirmed, run `fixAll()`
  - [x] When `--yes` is set, skip prompt and run `fixAll()` directly
  - [x] Success: `cf check --fix` prompts; `cf check --fix --yes` doesn't

- [x] **4.4 Update terminal output for all-slices mode**
  - [x] Group findings by slice index in output (extract index from `[NNN]` prefix in description)
  - [x] Print header per slice group: e.g., `"Slice 175: context-output-consolidation"`
  - [x] Print aggregate summary at the end: `"Checked N slices: X errors, Y warnings, Z info"`
  - [x] Aggregate rules (6-8) displayed in a separate "Project-level" group
  - [x] Success: terminal output is grouped and readable with multiple slices

**Commit after Task 4.**

---

## Task 5: Update MCP tool `workflow_check`

- [ ] **5.1 Add `sliceIndex` parameter to input schema**
  - [ ] Add `sliceIndex: { type: 'number', description: '...' }` to the tool's input schema (optional)
  - [ ] Update handler: if `sliceIndex` provided, set `project.fileSlice` and call `check()` / `fix()`
  - [ ] If `sliceIndex` omitted, call `checkAll()` / `fixAll()`
  - [ ] No confirmation prompt in MCP mode
  - [ ] Success: MCP tool defaults to all-slices; providing `sliceIndex` narrows scope

**Commit after Task 5.**

---

## Task 6: Unit tests

- [ ] **6.1 Test `checkAll()` iterates all slices**
  - [ ] Mock introspector with a slice plan containing 3 entries (indices 170, 171, 172)
  - [ ] Mock documents and task files for each
  - [ ] Verify findings reference multiple slice indices
  - [ ] Success: test passes

- [ ] **6.2 Test Rule 6: duplicate index detection**
  - [ ] Mock slice plan with two entries both having index 168
  - [ ] Verify an error finding with rule `duplicate-index` is returned
  - [ ] Verify finding is `fixable: false`
  - [ ] Success: test passes

- [ ] **6.3 Test Rule 7: plan status vs entries-complete**
  - [ ] Mock slice plan frontmatter `status: complete` with 3/5 entries checked
  - [ ] Verify warning finding with rule `plan-status-vs-entries`
  - [ ] Test reverse: all entries checked but status `in-progress` → warning
  - [ ] Success: both directions tested and passing

- [ ] **6.4 Test Rule 8: arch status vs plans-complete**
  - [ ] Mock arch file frontmatter `status: complete` with plan having unchecked entries
  - [ ] Verify warning finding with rule `arch-status-vs-plans`
  - [ ] Test reverse: all plan entries checked but arch status `in-progress` → warning
  - [ ] Success: both directions tested and passing

- [ ] **6.5 Test `fixAll()` applies fixes and returns log**
  - [ ] Mock scenario with fixable findings across multiple slices
  - [ ] Verify `fixLog` entries have correct before/after values
  - [ ] Verify `fixed` count matches number of fixable findings
  - [ ] Success: test passes

- [ ] **6.6 Test `checkAll()` returns empty result gracefully**
  - [ ] Test with project that has no slice plan → empty result
  - [ ] Test with project that has no `projectPath` → empty result
  - [ ] Success: no errors thrown, empty results returned

**Commit after Task 6.**

---

## Task 7: CLI tests

- [ ] **7.1 Test `cf check` defaults to all-slices mode**
  - [ ] Mock `ConsistencyChecker.checkAll` and verify it's called (not `check`)
  - [ ] Success: test passes

- [ ] **7.2 Test `cf check --slice 175` narrows to single slice**
  - [ ] Verify `check()` is called instead of `checkAll()`
  - [ ] Success: test passes

- [ ] **7.3 Test `cf check --fix` prompts for confirmation**
  - [ ] Mock readline to simulate user declining → verify no fixes applied
  - [ ] Success: test passes

**Commit after Task 7.**

---

## Task 8: Build verification and cleanup

- [ ] **8.1 Run full test suite**
  - [ ] `pnpm test` — all packages pass
  - [ ] `pnpm build` — no compilation errors
  - [ ] Success: all tests pass, build succeeds

- [ ] **8.2 Update slice and plan status**
  - [ ] Set `178-slice.consistency-checker-all-slices-mode.md` frontmatter `status: complete`
  - [ ] Check off slice plan entry 18 in `160-slices.project-workflow-system.md`
  - [ ] Update DEVLOG with implementation summary and commit hashes

**Final commit after Task 8.**

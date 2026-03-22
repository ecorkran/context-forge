---
docType: review
reviewType: tasks
slice: cli-mcp-shared-logic-consolidation
project: squadron
verdict: CONCERNS
dateCreated: 20260322
dateUpdated: 20260322
---

# Review: tasks — slice 206

**Verdict:** CONCERNS
**Model:** claude-haiku-4-5-20251001

## Findings

### [PASS] Success Criteria Coverage

All success criteria from the slice design have corresponding tasks:
- **Functional (5/5):** `cf init` defaults (2.5-2.7), `cf set` auto-set (3.4-3.6), MCP `project_create` (2.6-2.7), MCP `project_update` + bugfix (3.5-3.6, 4.4), tests pass (1.5, 2.7, 3.6, 4.2)
- **Technical (3/3):** No duplication (1.3-1.4, 3.4-3.5, 4.1), unit tests (2.4, 3.3), integration tests (1.5, 2.7, 3.6, 4.2)
- **Verification (5/5):** Duplication checks (4.1), behavioral parity (2.7, 3.6, 4.4), CLI auto-set (3.4-3.6), MCP auto-set (3.5-3.6, 4.4), full test suite (4.2)

No gaps identified.

---

### [CONCERN] Commit Strategy Diverges from Design Intent

The slice design explicitly states (Risk Assessment): *"Delete local definitions in the same commit as adding core imports — compiler catches any missed consumers"* and (Implementation Notes): *"Each step should leave the build passing."*

The task breakdown batches all commits into a single task (4.3) after all implementation is complete. This defers compiler-safety verification:

- Tasks 1.1-1.2 add new core code and exports
- Tasks 1.3-1.4 remove old definitions and add imports
- No intermediate commit between these steps to verify the compiler catches missing consumers

**Mitigation present but weaker:** Task 4.1 explicitly runs grep verification to catch duplicates. This is a valid safety net but relies on a manual script rather than compiler feedback.

**Recommendation:** Add explicit commit tasks after extraction steps (e.g., after 1.4, 2.6, 3.5) to follow the slice design's safety strategy, or clarify that all changes are committed together and 4.1 verification compensates for lack of intermediate compiler checks.

---

### [CONCERN] Verification Approach Inconsistent with Design

The slice design's "Verification Walkthrough" (§328) outlines 5 manual verification steps:
1. Duplication checks (covered: task 4.1) ✓
2. **Behavioral parity — project creation** (mentioned in design, not explicit in tasks)
3. **Auto-set rules via CLI** (mentioned in design, not explicit in tasks)
4. Auto-set rules via MCP (covered: task 4.4) ✓
5. Run test suite (covered: task 4.2) ✓

CLI manual verification steps mentioned in the design (e.g., `cf init --name test-parity-cli /tmp/test-cli` and `cf set fileArch 200-arch...`) are implicitly covered by tests but not called out as explicit verification tasks like task 4.4 is for MCP.

**Recommendation:** Either add explicit manual verification tasks for CLI (to match 4.4 for MCP) or remove 4.4 as redundant since unit tests in 3.3 already verify the fileArch→fileSlicePlan rule.

---

### [CONCERN] Test Run Redundancy

Tasks 1.5, 2.7, 3.6, and 4.2 all invoke `pnpm test` (or `pnpm run build && pnpm test` for 4.2). This is safe but creates 4 separate test runs:
- 1.5 after constants extraction
- 2.7 after defaults implementation
- 3.6 after auto-set rules implementation
- 4.2 final verification

Each test run takes time and provides overlapping coverage. All subsequent test runs re-run tests from prior steps.

**Recommendation:** Consolidate to fewer test checkpoints (e.g., after task 1.4, after 2.6, after 3.5, and final 4.2) to reduce iteration time while maintaining safety. Alternatively, document why each checkpoint is necessary if there's a risk of integration issues between steps.

---

### [PASS] Proper Test-With Pattern

Tests immediately follow implementation for each major feature:
- Constants: 1.1-1.4 → 1.5 ✓
- Defaults: 2.1-2.3 → 2.4, then integration 2.5-2.6 → 2.7 ✓
- Auto-set: 3.1-3.2 → 3.3, then integration 3.4-3.5 → 3.6 ✓
- Final: all changes → 4.2 ✓

---

### [PASS] Clear Task Sequencing

The task order follows the slice design's suggested order exactly:
1. Extract constants (slice design: "Lowest risk, immediate compile-time verification")
2. Extract defaults (slice design: "Isolated from update logic")
3. Extract auto-set rules (slice design: "Most complex, benefits from constants already being in core")
4. Verification and commit

No circular dependencies. All prerequisites satisfied before dependents.

---

### [PASS] Unit Tests for All New Core Functions

- Task 2.4: `formatDateProject()`, `buildProjectCreationDefaults()` with overrides
- Task 3.3: All three auto-set rules, undefined projectPath edge case, regex fallback

Matches the "Technical Requirements" §320-326 precisely.

---

### [PASS] Bug Fix Properly Tracked

The MCP missing `fileArch→fileSlicePlan` auto-set is:
- Identified in the overview (task file context)
- Implemented in task 3.1 (all three rules in `computeAutoSetFields`)
- Integrated in task 3.5 (MCP now gains the rule)
- Verified in task 4.4 (explicit check for new behavior)

No risk of this fix being overlooked.

---

### [PASS] Duplication Elimination Explicitly Verified

Task 4.1 runs the exact grep commands specified in the slice design (§341) to verify:
- No `WORKTREE_SCOPED_FIELDS` outside imports
- No `PROJECT_TO_WORKTREE_FIELD` outside imports  
- No inline date formatting in CLI or MCP

This is a concrete verification gate, not a hand-wave.

---

### [MINOR] No Explicit Criteria Cross-Reference in Tasks Document

The tasks document doesn't link each task back to the success criteria it addresses (e.g., "Task 2.5 satisfies functional requirement 1: `cf init` creates projects with identical defaults"). This makes peer review and traceability harder. A matrix in the task document would improve clarity.

---

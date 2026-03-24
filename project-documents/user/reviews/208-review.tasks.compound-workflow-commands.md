---
docType: review
reviewType: tasks
slice: compound-workflow-commands
project: squadron
verdict: CONCERNS
dateCreated: 20260324
dateUpdated: 20260324
---

# Review: tasks — slice 208

**Verdict:** CONCERNS
**Model:** minimax/minimax-m2.7

## Findings

### [CONCERN] Missing success criteria coverage: Worktree correctness

**Description:** The slice design explicitly states "All commands work correctly with worktrees" as a success criterion, but no task explicitly verifies this. Tasks 3.1-3.4 describe using `opts` which presumably contains worktree-aware routing, but there's no:
- Integration test running compound/list commands from a worktree directory
- Verification that `--project-level` bypasses worktree routing

**Reference:** Slice design "Success Criteria → Compound Commands → All commands work correctly with worktrees"

**Impact:** Medium — if worktree routing breaks silently, users in worktrees may get unexpected behavior.

---

### [CONCERN] Missing success criteria coverage: Auto-set rules not explicitly tested

**Description:** Tasks 3.2-3.4 describe the auto-set behavior (e.g., `cf arch 220` auto-sets `fileSlicePlan`), but the unit tests in task 4.1 only mock `projectSetAction` and verify call sequences—they don't verify the *auto-set* calls are made. The slice design explicitly requires: "Auto-set rules fire as expected (e.g., `cf arch 220` also sets fileSlicePlan)."

**Reference:** 
- Slice design "Success Criteria → Auto-set rules fire as expected"
- Task 4.1 test cases only verify explicit `projectSetAction` calls

**Impact:** Medium — auto-set is a key feature; if it breaks, commands produce wrong output silently.

---

### [CONCERN] Missing success criteria coverage: Stdout/stderr routing

**Description:** The slice design states "Context output goes to stdout, confirmations to stderr (pipeable)" as a success criterion. Tasks describe "outputs prompt" but don't verify:
- Confirmations are written to stderr
- Context is written to stdout
- Piping works (`cf slice 208 | head -5` only gets context)

**Reference:** Slice design "Success Criteria → Context output goes to stdout, confirmations to stderr"

**Impact:** Medium — if confirmations leak to stdout, piping breaks (e.g., `cf concept | pbcopy` gets extra noise).

---

### [CONCERN] Missing verification: `--json` and `--all` flags for list commands

**Description:** Task 2.1 registers the list subcommands with options including `--json`, `--all`, `--project`, but task 2.3 only says "Update test descriptions and imports to reflect the new command paths" and "Ensure all existing test assertions are preserved." This implies the flags are tested, but there's no explicit:
- Verification that `--json` produces machine-readable output
- Verification that `--all` shows items from all worktrees
- Verification that `--project` overrides project resolution

**Reference:** 
- Slice design "Success Criteria → `--json` and `--all` flags work on all list subcommands"
- Task 2.3 vague about which assertions are "preserved"

**Impact:** Low-Medium — flags may work if handlers are unchanged, but not explicitly verified.

---

### [CONCERN] Missing verification: Alias behavior

**Description:** Task 2.1 creates `cf list arch` as an alias for `cf list initiatives`, and task 2.2 verifies the command "works." However, there's no explicit test that the alias produces identical output to the canonical command.

**Reference:** Slice design "Success Criteria → `cf list arch` is an alias for `cf list initiatives`"

**Impact:** Low — alias likely works if using Commander's `.alias()`, but not explicitly verified.

---

### [CONCERN] Missing verification: Old commands removed

**Description:** Task 2.2 removes the old command registrations from `index.ts`, but there's no explicit test that `cf arch list`, `cf plan list`, `cf slice list`, `cf tasks list`, and `cf tasks items` now fail or show as unrecognized.

**Reference:** 
- Slice design "Success Criteria → Old commands (`cf arch list`, etc.) are removed"
- Slice design "Removed Commands" section
- Task 2.2 only verifies "Old artifact commands no longer registered" by checking the code change

**Impact:** Low — removing registrations should cause errors, but not explicitly tested.

---

### [PASS] Task sizing is appropriate

Tasks are well-scoped for a junior AI. Each task has clear file references, specific code to write, and explicit verification criteria. The 3.1-3.4 split is appropriate—each command pair has distinct logic.

---

### [PASS] Test-with pattern is correctly applied

Tasks 4.1/4.2 immediately follow implementation tasks 3.1-3.6. Tasks 2.3/2.4 follow 2.1/2.2. Task 1.6 commits after all extraction tasks.

---

### [PASS] Commit distribution is appropriate

Commits are distributed:
- Task 1.6: Extraction commit
- Task 2.4: `cf list` commit  
- Task 3.6: Compound commands commit
- Task 4.2: Tests commit
- Task 5.3: Final commit

This avoids batching all commits at the end.

---

### [CONCERN] Task 4.1 is at the upper size limit

Task 4.1 contains 9 distinct test cases (7 commands + warning + implement no-warning). This is acceptable but approaching the threshold where splitting could help. Consider whether to split into:
- 4.1a: Tests for Phase 0-2 commands (`concept`, `initiatives`, `arch`, `plan`)
- 4.1b: Tests for Phase 4-6 commands (`slice`, `tasks`, `implement`)
- 4.1c: Tests for warning behavior

**Recommendation:** Acceptable as-is for a junior AI, but flag for potential future splitting.

---

### [PASS] Naming consistency between tasks and slice design

The task section names map cleanly to slice design elements:
- Section 1 → "Extract reusable action handlers"
- Section 2 → "New `cf list` command"
- Section 3 → "Seven compound workflow commands"
- Section 4 → Tests

---

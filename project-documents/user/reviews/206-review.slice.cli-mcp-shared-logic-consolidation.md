---
docType: review
reviewType: slice
slice: cli-mcp-shared-logic-consolidation
project: squadron
verdict: PASS
dateCreated: 20260322
dateUpdated: 20260322
---

# Review: slice — slice 206

**Verdict:** PASS
**Model:** claude-sonnet-4-6

## Findings

### [PASS] Dependency direction is correct

The slice moves logic from `@context-forge/cli` and `@context-forge/mcp-server` into `@context-forge/core`. Both consumer packages already depend on core (as established in 140-arch and 160-arch). This is the correct direction — core gains a new module; neither CLI nor MCP pushes logic downward. No circular dependencies are introduced.

### [PASS] Core module is appropriately scoped

The new `project-defaults.ts` module contains constants, a formatting utility, and two pure functions that return data. The `computeAutoSetFields()` function explicitly returns `{ derivedUpdates, descriptions }` — callers decide what to do with the data. No console I/O, no MCP protocol formatting, and no interactive prompts are introduced in core. The "return data, not side effects" principle called out in the slice design aligns with 160-arch's "automation-ready interfaces" goal (§ *Design Goals*: *"The interfaces should not assume an interactive human is present"*).

### [PASS] Field naming follows established schema conventions

The constants and function signatures use the `fileX` naming convention standardized in 160-arch (§ *Envisioned State*: `fileHLD`, `fileArch`, `fileSlicePlan`, `fileSlice`, `fileTasks`). The `PROJECT_TO_WORKTREE_FIELD` mapping is consistent with the worktree overlay pattern introduced in 180-arch and used throughout the existing CLI and MCP implementations.

### [PASS] Bug fix is in scope and correctly handled

The missing `fileArch→fileSlicePlan` auto-set rule in MCP is a behavioral parity gap, not an architectural violation. Fixing it as a side effect of the consolidation is appropriate — the shared `computeAutoSetFields()` function applies all three rules uniformly, so both consumers gain the fix without any extra scope. The slice correctly documents this as a "critical finding" rather than treating it as a separate change.

### [CONCERN] Parent frontmatter references slice plan, not architecture document

The slice frontmatter declares:
```
parent: user/architecture/200-slices.developer-onboarding.md
```

This points to the slice *plan* (`200-slices`), not the parent architecture document (`200-arch.developer-onboarding.md`). Slice documents typically reference the architecture document that governs the initiative. The slice plan is an intermediate planning artifact, not the authoritative architectural specification. This doesn't affect implementation correctness, but it breaks the traceability chain from slice → arch.

**Recommendation:** Update `parent` to `user/architecture/200-arch.developer-onboarding.md`.

### [CONCERN] `fileHLD` absent from `WORKTREE_SCOPED_FIELDS` — clarification needed

The 160-arch (§ *Envisioned State*) explicitly lists `fileHLD` alongside `fileArch`, `fileSlicePlan`, `fileSlice`, and `fileTasks` as artifact reference fields. The slice's proposed `WORKTREE_SCOPED_FIELDS` set includes `fileArch`, `fileSlicePlan`, `fileSlice`, and `fileTasks` but not `fileHLD`.

There are two valid interpretations: `fileHLD` was intentionally excluded from worktree scoping (perhaps it's a project-level-only document), or it was accidentally omitted when the constants were transcribed from existing CLI/MCP source. The slice claims it is performing a byte-identical copy of existing CLI/MCP constants — if `fileHLD` is genuinely absent there, the omission predates this slice and is not introduced here. Either way, this warrants a comment in the code or a note in the slice design explaining whether `fileHLD` is intentionally not worktree-scoped, to prevent a future implementer from assuming the field set is complete by design.

### [CONCERN] Function name inconsistency in the document

Section "Technical Scope → Included" and the overview use the name `applyAutoSetRules()`. The actual implementation specification (§ *Extraction 3*) and the consumer update pattern both use `computeAutoSetFields()`. These are different names for the same function.

The exported name matters because it becomes the public API of `@context-forge/core`. This inconsistency should be resolved before implementation begins to avoid confusion about which name is canonical. Based on the implementation body and the consumer example, `computeAutoSetFields` appears to be the intended name.

### [PASS] `descriptions` field in `AutoSetResult` is acceptable in core

The `descriptions: string[]` field in `AutoSetResult` contains human-readable log strings. Placing presentation-flavored strings in a core data structure is borderline, but the design handles this correctly: core produces the data, and the consumer (CLI) decides whether to log it; MCP ignores it entirely. The strings are values in a return type, not side effects. This is consistent with the 160-arch principle of "automation-ready interfaces" — the interface is fully usable by non-interactive consumers by simply discarding the `descriptions` array.

### [PASS] Integration points match parent slice plan expectations

The parent slice plan (200-slices, item 6) specifies exactly this scope: shared field mappings, auto-set logic, and project creation defaults extracted into `@context-forge/core` with both CLI and MCP importing from core. The slice design delivers all stated scope items and explicitly excludes the items the parent marked as already-complete (`resolveFileByIndex`, `WorktreeService`). The stated dependencies (`resolveFileByIndex` and `ProjectData` from core) are confirmed as already exported. No undeclared external dependencies are introduced.

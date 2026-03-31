---
docType: review
reviewType: slice
slice: cli-mcp-shared-logic-consolidation
project: squadron
verdict: PASS
dateCreated: 20260322
dateUpdated: 20260322
status: not_started
---

# Review: slice — slice 206

**Verdict:** PASS
**Model:** claude-sonnet-4-6

## Findings

### [PASS] Core layer placement is correct

The slice moves shared orchestration logic (constants, project creation defaults, auto-set rules) into `@context-forge/core`, which is precisely the package that both `@context-forge/cli` and `@context-forge/mcp-server` already depend on. Dependency direction is correct: CLI → core, MCP → core; there is no reverse edge. This is the appropriate home for shared, I/O-free business logic.

### [PASS] Returns data, avoids I/O coupling

`computeAutoSetFields()` returns `{ derivedUpdates, descriptions }` rather than writing to storage or console. CLI consumers use `descriptions` for logging; MCP consumers ignore them. This is an idiomatic design for a shared function that must work in both I/O contexts and is consistent with the architecture's principle of keeping the MCP server "atomic and composable" (arch §Architectural Principles).

### [PASS] Bug fix is a natural side-effect of correct consolidation

The `fileArch→fileSlicePlan` auto-set gap in MCP is fixed by the extraction, not by special-casing. The architecture calls for parity between CLI and MCP paths for project operations (arch §`project_create` MCP Tool), and this fix moves the system toward that parity ahead of the `project_create` slice.

### [PASS] Enabling slice for architecture's anticipated deliverables

The architecture's anticipated slices (smart `cf init`, `project_create`, onboarding skill) all depend on consistent project creation defaults and field auto-set rules being correct and reachable from both CLI and MCP. Slice 206 is the natural pre-condition for those. Although it is not explicitly named in the architecture's "Anticipated Slices" list, it is supportive of, not in conflict with, those goals. Pure refactoring slices of this kind are routinely identified during implementation and need not be forecasted in the architecture document.

### [CONCERN] Internal naming inconsistency in the module overview

The module structure diagram (§Architecture, Component Structure) lists the exported function as `applyAutoSetRules()`, but the implementation section defines and exports it as `computeAutoSetFields()`. Every other reference in the document uses `computeAutoSetFields`. The diagram name appears to be a stale draft label. Align the diagram to match the implementation name before implementation begins to avoid confusion about the public API.

---
docType: slice-plan
parent: user/architecture/900-arch.maintenance-and-refactoring.md
project: context-forge
dateCreated: 20260325
dateUpdated: 20260325
status: not_started
---

# Slice Plan: Maintenance & Refactoring

## Foundation Slices

(none required — maintenance work operates on existing infrastructure)

## Feature Slices

1. [ ] **(901) MCP Tool Surface Cleanup** — Remove `agent_guide` (superseded by `agent_quickstart`), audit tool descriptions for accuracy, review tool registration order. Dependencies: none. Risk: Low. Effort: 2/5

## Integration Work

(none — maintenance slices are self-contained)

## Future Work

- CLI pattern consistency (error handling, output formatting, help text uniformity)
- Hard-coded values audit (extract to config or constants)
- Test coverage improvements for under-tested modules
- Dependency updates and Node.js version compatibility

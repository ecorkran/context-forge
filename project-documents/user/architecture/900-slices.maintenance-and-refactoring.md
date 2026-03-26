---
docType: slice-plan
parent: user/architecture/900-arch.maintenance-and-refactoring.md
project: context-forge
dateCreated: 20260325
dateUpdated: 20260325
status: in_progress
---

# Slice Plan: Maintenance & Refactoring

## Foundation Slices

(none required — maintenance work operates on existing infrastructure)

## Feature Slices

1. [x] **(901) MCP Tool Surface Cleanup** — Remove `agent_guide` (superseded by `agent_quickstart`), audit tool descriptions for accuracy, review tool registration order. Dependencies: none. Risk: Low. Effort: 2/5
2. [ ] **(902) Electron UI & Security Maintenance** — Open Electron issues: combobox TS errors (#27), debounce bypass (#28), IPC path validation (#35), production CSP (#36), external link allowlist (#37). Dependencies: none. Risk: Low. Effort: 2/5
3. [x] **(903) Schema-Driven Field Lists** — Replace duplicated hard-coded field arrays (ARTIFACT_FIELDS, WORKFLOW_FIELDS, fieldKeys, MANAGED_FILES) with schema-derived or filesystem-derived sources. Dependencies: none. Risk: Medium. Effort: 3/5

## Integration Work

(none — maintenance slices are self-contained)

## Future Work

- CLI pattern consistency (error handling, output formatting, help text uniformity)
- Cross-slice integration test fixtures (realistic multi-state scenario coverage)
- SCAN_DIRS vs EXPECTED_SUBDIRS reconciliation (8 vs 4 directory lists)
- Test coverage improvements for under-tested modules
- Dependency updates and Node.js version compatibility

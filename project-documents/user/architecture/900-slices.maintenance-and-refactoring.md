---
docType: slice-plan
parent: user/architecture/900-arch.maintenance-and-refactoring.md
project: context-forge
dateCreated: 20260325
dateUpdated: 20260328
status: in_progress
---

# Slice Plan: Maintenance & Refactoring

## Foundation Slices

(none required — maintenance work operates on existing infrastructure)

## Feature Slices

1. [x] **(901) MCP Tool Surface Cleanup** — Remove `agent_guide` (superseded by `agent_quickstart`), audit tool descriptions for accuracy, review tool registration order. Dependencies: none. Risk: Low. Effort: 2/5
2. [ ] **(902) Electron UI & Security Maintenance** — Open Electron issues: combobox TS errors (#27), debounce bypass (#28), IPC path validation (#35), production CSP (#36), external link allowlist (#37). Dependencies: none. Risk: Low. Effort: 2/5
3. [x] **(903) Schema-Driven Field Lists** — Replace duplicated hard-coded field arrays (ARTIFACT_FIELDS, WORKFLOW_FIELDS, fieldKeys, MANAGED_FILES) with schema-derived or filesystem-derived sources. Dependencies: none. Risk: Medium. Effort: 3/5

4. [x] **(904) Extract Compound Commands to Squadron** — Remove compound workflow commands (cf concept, cf initiatives, cf arch, cf plan, cf slice, cf tasks, cf implement) and their slash commands from CF CLI. These move to Squadron where they're a better fit. Dependencies: none. Risk: Low. Effort: 2/5
5. [x] **(905) Frontmatter Schema Validation** — Define required and optional YAML frontmatter fields per `docType` (e.g., `slice-plan` requires `status`, `docType`, `parent`; `slice` requires `status`, `docType`, `parent`, `slice`; `tasks` requires `status`, `slice`, `project`). Implement a schema registry in `packages/core` that maps `docType` values to field requirements with types and allowed values. Extend `ConsistencyChecker` to validate all project documents against their schema — detecting missing required fields, unknown fields, and invalid values. Currently Rule 9 hard-codes a check for missing `status` on slice plans; this would generalize that pattern to all document types and all required fields. The schema registry should be data-driven (e.g., a config file or typed constant) so adding new document types or fields doesn't require rule code changes. Dependencies: none. Risk: Low. Effort: 3/5

## Integration Work

(none — maintenance slices are self-contained)

## Future Work

- CLI pattern consistency (error handling, output formatting, help text uniformity)
- Cross-slice integration test fixtures (realistic multi-state scenario coverage)
- SCAN_DIRS vs EXPECTED_SUBDIRS reconciliation (8 vs 4 directory lists)
- Test coverage improvements for under-tested modules
- Dependency updates and Node.js version compatibility

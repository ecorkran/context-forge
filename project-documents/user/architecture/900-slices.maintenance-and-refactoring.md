---
docType: slice-plan
parent: user/architecture/900-arch.maintenance-and-refactoring.md
project: context-forge
dateCreated: 20260325
dateUpdated: 20260702
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
6. [x] **(906) CLI Self-Update Command** — Add top-level `cf update` command that checks npm for newer versions and prompts the user to install. Supports `--yes` for non-interactive use. No automatic update checks on startup — explicit invocation only. Separate from `cf guides update` (tool vs guide). Dependencies: none. Risk: Low. Effort: 2/5
7. [x] **(907) CLI Short-Form Options & Option Centralization** — Add standard short-form flags (`-j`/`--json`, `-p`/`--project`, `-y`/`--yes`, `-f`/`--fix`, `-a`/`--all`, `-r`/`--raw`) and centralize the ~70 inline `.option()` registrations into shared helpers. Currently 78 option registrations are copy-pasted across 16 command files with zero centralization and inconsistent descriptions (e.g., "Project ID or name" vs "Project name or ID"). Create a shared `options.ts` module with composable helpers (e.g., `withJsonOption`, `withProjectOption`) so adding or changing a common option is a one-line edit instead of 16. Dependencies: none. Risk: Low. Effort: 2/5
8. [ ] **(908) CLI Usability Improvements** — Catch-all slice for small CLI UX wins that don't warrant their own slice. Items are added here as discovered and worked incrementally. Current backlog: (a) `cf list arch` / `cf list initiatives` — drive from initiative plan (`001-initiative-plan.*.md`) the way `cf list slices` drives from the slice plan: show all entries with index, name, status, and arch file path when it exists; entries with no arch file shown as not started. Dependencies: none. Risk: Low. Effort: 2/5
9. [x] **(909) Configurable Branch Root Prefix** — Optional per-project prefix prepended to work branch names (e.g. `myroot/910-slice.foo`), so branches can live under a chosen root without affecting document/artifact resolution. CF side: added `git.branch_root` config key (project-scoped, default empty = no prefix) with validation rejecting absolute, `..`-escaping, and trailing-slash values (`packages/core/src/config/ConfigKeys.ts` + tests). Convention side: the branch-naming rule in `ai-project-guide/project-guides/rules/git.md` instructs agents to read `cf config get git.branch_root` and prefix when non-empty — this change lives in the **ai-project-guide submodule (upstream)**, not in this repo; it lands here when the submodule pointer is next updated. Originally scoped as initiative 910 (configurable root directory) but collapsed to this note once the real need turned out to be a branch-name prefix, not a filesystem relocation. Dependencies: upstream `git.md` guide change. Risk: Low. Effort: 1/5
10. [ ] **(910) Centralize NormalizedStatus Value References** — The `NormalizedStatus` values (`complete`, `in-progress`, `not-started`, `deprecated`) exist only as a TypeScript type union, so every comparison and assignment re-types the bare literal — ~50 sites across `ConsistencyChecker.ts` (~40), `ProjectModelBuilder.ts`, `WorkflowNavigator.ts`, `taskFileParser.ts`, `slicePlanParser.ts`, and `statusNormalizer.ts`. This violates the "define comparison values once, reference everywhere" rule: changing a status string requires editing dozens of places. Introduce a `STATUS` `as const` object in `introspection/types.ts` with the type derived from it (`type NormalizedStatus = (typeof STATUS)[keyof typeof STATUS]`, keeping the union byte-identical), then sweep all literal sites to reference `STATUS.Complete` etc. Pure mechanical refactor, no behavior change — the existing test suite is the regression guard. Note: slice 241 introduces the `STATUS` constant for its own new code; this slice completes the sweep of pre-existing sites. Dependencies: 241 (constant already defined). Risk: Medium. Effort: 3/5

## Integration Work

(none — maintenance slices are self-contained)

## Future Work

- Cross-slice integration test fixtures (realistic multi-state scenario coverage)
- SCAN_DIRS vs EXPECTED_SUBDIRS reconciliation (8 vs 4 directory lists)
- Test coverage improvements for under-tested modules
- Dependency updates and Node.js version compatibility

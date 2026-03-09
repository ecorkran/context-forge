---
docType: changelog
scope: project-wide
---

# Changelog

All notable changes to Context Forge will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
* Added rule to avoid overly restrictive regex when creating parsers
* Added Prompt filtering (supported in cf:build) to avoid bloated input
* Added cf setup-ide (currently supports claude)

### Fixed
* /cf:prompt works with or without get and avoids the 2x get when specified
* on set architecture, slice plan is alo set (like slice -> tasks)
* cf:next when arch specified but nonexistent suggests creating architecture design
* cf:fileConcept added to schema and project items listed in general->specific order



## [0.3.6] - 20260307

### Added
- Guide install (`cf guides install`) now creates user artifact directories (`user/`, `architecture/`, `slices/`, `tasks/`, `project-guides/`)

### Fixed
- `cf next` recommends creating architecture before slice plan when neither exists
- Electron date picker displays correctly for dates set via CLI as YYYYMMDD (normalized to YYYY-MM-DD)
- Slice plan parser supports unindexed entries (`**Name**` without `(NNN)` prefix)
- Slice plan heading exclusion no longer falsely skips sections like "Feature Slices (in implementation order)"

### Changed
- Removed obsolete test infrastructure task file (all 891 tests now pass)
- Cleaned up maintenance file: removed completed items, condensed descriptions

## [0.3.5] - 20260307

### Added
- `ConsistencyChecker` core service with 5 detection rules: task-vs-plan, frontmatter-vs-computed, missing artifacts, plan-vs-frontmatter, task-file-status
- `MarkdownWriter` utility for non-destructive write-back (checkbox toggling + frontmatter field updates)
- Fix mode with `FixLogEntry` before/after tracing for each applied correction
- `workflow.auto_fix` config key for automatic corrections during consistency checks
- `workflow_check` MCP tool (25 total MCP tools)
- `cf check` CLI command replaces stub with full implementation (`--fix`, `--json`, `--project`)

### Fixed
- `/cf:prompt get P5` slash command no longer doubles the `get` subcommand
- `--project` help text across all CLI commands clarifies name or ID accepted

### Changed
- Integration testing slice (168) demoted to maintenance — most deliverables completed incrementally
- Future work item (169) added: all-slices consistency checking mode, duplicate index detection

## [0.3.4] - 20260307

### Added
- `WorkflowNavigator` core service: `getStatus()` derives slice status from filesystem, `getNext()` priority-ordered state machine
- MCP tools: `workflow_status`, `workflow_next`
- CLI discovery commands: `cf arch list`, `cf plan list`, `cf slice list`, `cf task list`, `cf task items`
- Smart index resolution: `cf set slice 166` derives filename from slice plan
- Auto-set `fileTasks` from slice name
- `workflow.auto_advance` config key

### Fixed
- Artifact path resolution: `resolveArtifactPath()` correctly resolves stems to full paths
- `slicePlan` null handling in `WorkflowNavigator`, `ArtifactIntrospector`, `cf slice list`

### Changed
- Slash command prompts optimized for token efficiency (~800 tokens saved)

## [0.3.3] - 20260307

### Added
- Auto-commit after `cf guides install` and `cf guides update` (submodule and clone strategies)

## [0.3.2] - 20260306

### Fixed
- Phase resolution in `cf build --phase`: accepts P1-P7 shorthands, numbers (1-7), and short names (task-breakdown); warns on unrecognized values
- Instruction matcher (`getPromptForInstruction`) handles full phase strings like `Phase 5: Task Breakdown` — extracts name portion for fuzzy matching
- Template conditionals support `{{#if var}}content{{/if}}` without requiring `{{else}}` clause
- Conditional evaluator uses enhanced data (artifact aliases like `fileArch`) instead of raw ContextData only

## [0.3.1] - 20260306

### Added
- README screenshots and assets (context-visualizer, cf-project-list, cf-status)
- CLI README: slash commands section, git-like CWD model explanation, `cf init` workflow

### Changed
- Root README rewritten with screenshots, structured sections, and updated architecture description
- CLI README restructured: npm-focused install, slash commands table, commands reference
- Core and MCP READMEs updated for slice 175 changes

## [0.3.0] - 20260306

### Added
- Artifact fields (`fileArch`, `fileSlicePlan`, `fileHLD`, `fileSpec`) in ContextData, mapped through full pipeline
- Template variable aliases: `{arch}`, `{plan}`, `{hld}`, `{spec}` with index extraction (`{archIndex}`, `{planIndex}`, `{hldIndex}`)
- Phase→instruction auto-set: setting `developmentPhase` via CLI or MCP automatically updates `instruction` to match
- Top-level shortcuts: `cf set` and `cf get` as shortcuts for `cf project set/get`
- Claude Code slash commands: `/cf:status`, `/cf:build`, `/cf:next`, `/cf:prompt`, `/cf:get`, `/cf:set`, `/cf:project`
- `cf install-commands` / `cf uninstall-commands` for Claude Code integration
- Smart field setting: `cf set slice 171` resolves by scanning project files; customData sub-fields settable with merge semantics
- Schema-driven field metadata: `cf project --schema` with aliases, groups, enum values
- `cf guides` command: install, update, and status for ai-project-guide templates
- `cf check` command: consistency checks with `--fix` option
- `cf future` command: consolidated future work across all slice plans

### Changed
- Consolidated `### Project Context` section with clean key-value format (replaces bracket-wrapped `### Current Work Context`)
- Unified opening statement (`project-statement`) regardless of workType (replaces start/continue branching)
- Template field removed from context output
- CWD-based project detection: `cf` auto-detects project from current directory
- Name-based project resolution: `--project orchestration` with project names instead of IDs
- Compact `cf project list` with `*` active indicator and `~` path shortening

## [0.2.0] - 20260228

### Added
- CWD-based project detection
- Name-based resolution with `--project` flag
- Resolution indicators in `cf status` output
- Compact `cf project list` format

### Changed
- Tighter output formatting: consistent label alignment, suppressed empty fields

## [0.1.0] - 20260225

### Added
- Initial release with 8 commands: `status`, `next`, `build`, `config`, `project`, `future`, `check`, `prompt`
- Integration with `@context-forge/core` for context assembly
- Phase shorthands for prompt templates (P1-P7)
- JSON output mode on all applicable commands
- MCP server with project management, context generation, artifact introspection, and workflow tools
- Core context engine: template processing, statement management, prompt parsing, project storage

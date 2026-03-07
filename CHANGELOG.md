---
docType: changelog
scope: project-wide
---

# Changelog

All notable changes to Context Forge will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

---
layer: project
docType: architecture
title: Prompt System Decoupling Architecture
dateCreated: 2026-02-07
dateUpdated: 2026-02-07
status: active
priority: P1
---

# Architecture: Prompt System Decoupling

## Executive Summary

This architecture addresses the need to decouple Context Forge from its current hardcoded, static dependencies on system prompts and configuration. The current implementation couples the UI, data models, and prompt processing to specific prompt file structures, making it difficult to:

- Expand with new prompt sources
- Support different configuration approaches
- Migrate to more flexible storage (e.g., SQLite)
- Simplify maintenance and feature additions
- Support imported/remote prompt sources

**Goal**: Create a flexible, abstraction-based system that allows Context Forge to adapt to different prompt sources, storage mechanisms, and configuration strategies without code changes.

## Problem Statement

### Current State (Tightly Coupled)

The current implementation has several hardcoded dependencies:

1. **Static UI Configuration**
   - `PHASE_OPTIONS` hardcoded in `ProjectConfigForm.tsx:38-57` (16 phases)
   - Development phase list manually maintained in code
   - Adding new phases requires code changes + rebuild

2. **Prompt File Dependencies**
   - All prompts imported from single file: `project-documents/project-guides/prompt.ai-project.system.md`
   - UI must know exact structure of prompt file
   - No support for alternative prompt sources
   - Remote/imported prompts require manual copy into repo

3. **Storage Limitations**
   - All configuration stored in Markdown files
   - No structured query capabilities
   - Difficult to support versioning or multiple configurations
   - File-based storage doesn't scale well

4. **Expansion Constraints**
   - New prompt files = UI code changes
   - Different naming/indexing schemes not supported
   - Difficult to test with alternative configurations

### Impact

- **Flexibility**: Hard to add new prompt sources or experiment with different structures
- **Maintenance**: Every configuration change requires code review + testing + rebuild
- **Scalability**: Cannot easily support multi-source or remote prompt configurations
- **Extensibility**: New features are coupled to current implementation

## Vision

Support a flexible, configuration-driven system where:

- **Multiple Prompt Sources**: Load from local files, remote URLs, or structured data
- **Dynamic Configuration**: UI elements generated from configuration, not hardcoded
- **Alternative Storage**: Eventually support SQLite or other backends without code restructuring
- **Imported Sources**: Allow prompt files to be imported from external sources (documentation, templates, etc.)
- **Loose Coupling**: Prompt system changes don't require UI changes

## Architecture Goals

1. **Abstraction Layer**
   - Create interfaces between UI and prompt system
   - Decouple component rendering from configuration source
   - Enable dependency injection of configuration

2. **Configuration Source Abstraction**
   - Support multiple prompt/configuration sources
   - Define a common contract for "configuration providers"
   - Allow runtime source selection

3. **Dynamic UI Generation**
   - Generate form options from configuration, not hardcoded lists
   - Support arbitrary phase structures
   - Allow UI to adapt to different naming/indexing schemes

4. **Data Model Independence**
   - Store only semantic information (not file paths or specific formats)
   - Support migration between storage backends
   - Enable versioning and archival

5. **Backward Compatibility**
   - Current projects and configurations continue to work
   - Gradual migration path, not breaking changes
   - Optional adoption of new features

## Scope

This architecture addresses:
- ✅ Decoupling UI from hardcoded configuration lists
- ✅ Supporting multiple prompt file sources
- ✅ Creating abstraction for configuration access
- ✅ Enabling flexible storage strategies
- ✅ Planned support for remote/imported prompt sources

Out of scope (future work):
- SQLite implementation (TBD)
- Alternative naming/indexing schemes (TBD)
- Remote source authentication (TBD)
- UI for configuration management (future phase)

## Linked Issues

### Feature/Enhancement Issues
- [Issue #24](https://github.com/ecorkran/context-forge/issues/24): Dynamic Phase Options - Load PHASE_OPTIONS from system prompts
  - Reference: `project-documents/user/features/824-issue.dynamic-phase-options.md`
  - First concrete step: Extract phase list from prompts instead of hardcoding

### Future Issues (To Be Created)
- **Configuration Provider Interface**: Abstraction for accessing prompt/configuration data
- **Multi-Source Support**: Allow loading from multiple prompt files or sources
- **Storage Backend Abstraction**: Enable alternative storage without code restructuring
- **Remote Prompt Import**: Support importing prompt files from URLs or external sources

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ User Interface Layer                                        │
│ (ProjectConfigForm, etc.)                                  │
└──────────────────────────┬──────────────────────────────────┘
                           │
                    Uses ConfigProvider
                    (abstracted interface)
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
   ┌────▼──────┐  ┌───────▼────────┐  ┌─────▼──────────┐
   │ Local MD   │  │ Remote URL     │  │ SQLite/DB      │
   │ Provider   │  │ Provider       │  │ Provider       │
   │ (current)  │  │ (future)       │  │ (future)       │
   └────────────┘  └────────────────┘  └────────────────┘
```

## Key Principles

1. **Single Responsibility**: Each component has one reason to change
2. **Dependency Inversion**: UI depends on abstractions, not concrete implementations
3. **Configuration Over Hardcoding**: Move logic to configuration files/sources
4. **Gradual Migration**: Implement incrementally, maintain backward compatibility
5. **Open/Closed**: Open for extension (new sources), closed for modification (core APIs stable)

## Implementation Strategy

### Phase 1: Abstraction Layer
- Create `ConfigProvider` interface
- Implement initial `LocalMDProvider` (wraps current system)
- Update UI to use provider instead of hardcoded values

### Phase 2: Dynamic Configuration
- Extract phase options from prompts into structured format
- Generate `PHASE_OPTIONS` from configuration at runtime
- Deprecate hardcoded lists

### Phase 3: Multi-Source Support
- Implement `RemoteURLProvider` (optional)
- Support loading from multiple sources
- Merge/prioritize configurations

### Phase 4: Storage Flexibility
- Create storage abstraction layer
- Implement SQLite provider (optional)
- Maintain MD file support

## Success Metrics

- [ ] `PHASE_OPTIONS` loaded dynamically (Issue #24)
- [ ] UI accepts injected `ConfigProvider` implementation
- [ ] New prompt sources can be added without UI changes
- [ ] Existing projects/configurations unaffected
- [ ] Build passes, no regressions
- [ ] Configuration changes don't require code rebuild

## Dependencies and Constraints

- Continue supporting MD files (no breaking changes)
- Maintain compatibility with existing stored projects
- No database dependencies (yet)
- Keep changes incremental and testable

## Notes

- This is a long-term architectural initiative
- Implementation happens in phases as features/enhancements are requested
- First concrete deliverable: Issue #24 (Dynamic Phase Options)
- Architecture will guide future work on #825-827 and beyond


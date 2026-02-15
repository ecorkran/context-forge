---
docType: slice-plan
parent: user/architecture/055-arch.context-forge-restructure.md
project: context-forge
dateCreated: 20260214
dateUpdated: 20260214
---

# Slice Plan: Context Forge Restructure

## Parent Document
`user/architecture/055-arch.context-forge-restructure.md` — Architecture document for evolving Context Forge from a standalone Electron application into a monorepo with an MCP server as the core engine and state owner.

## Foundation Work

1. [ ] **Monorepo Scaffolding** — Create pnpm workspace structure. Move existing `src/` into `packages/electron/src/`. Create empty `packages/core/` and `packages/mcp-server/` with package.json, tsconfig.json, and build configuration. Electron app must still build and run identically after this change. Effort: 2/5

## Migration / Refactoring Slices

2. [ ] **Core Types Extraction** — Extract all shared type definitions into `packages/core`. This includes `ProjectData`, `CreateProjectData`, `UpdateProjectData`, `ContextData`, `EnhancedContextData`, `ContextSection`, `ContextTemplate`, `SystemPrompt`, `TemplateStatement`, and related interfaces. Both main-process and renderer-process type definitions are consolidated into a single set (eliminating the current duplication between `src/main/services/context/types/` and `src/services/context/types/`). Electron imports from `@context-forge/core` instead of local type files. Dependencies: [Monorepo Scaffolding]. Risk: Low. Effort: 2/5

3. [ ] **Core Services Extraction** — Extract process-agnostic services into `packages/core`. Primary targets: `TemplateProcessor` (pure logic, no dependencies), `SystemPromptParser` (uses only `fs` and `path`), `StatementManager` (similar), `SectionBuilder`, `ProjectPathService`. These services are extracted as-is with minimal modification — the goal is relocation, not redesign. The renderer-side IPC wrappers (`SystemPromptParserIPC`, `StatementManagerIPC`) are not extracted; they will be eliminated in a later slice. Electron's main process imports from core. Dependencies: [Core Types Extraction]. Risk: Medium. Effort: 3/5

4. [ ] **Core Orchestration Extraction** — Extract the context generation orchestrators into `packages/core`: `ContextTemplateEngine`, `ContextIntegrator`, `ContextGenerator`, and `ServiceFactory`. These depend on the services extracted in the previous slice. After this slice, the complete context assembly pipeline lives in core and can be invoked without Electron. Dependencies: [Core Services Extraction]. Risk: Medium. Effort: 3/5

5. [ ] **Storage Migration** — Replace Electron-specific storage (`electron-store`, `ElectronStorageService`, `ElectronProjectStore`) with a filesystem-based storage layer in `packages/core`. Storage location: `~/.config/context-forge/` (via `env-paths` or similar for cross-platform support). Migrate existing project data from electron-store to the new location. Electron's storage services are replaced with imports from core. This is the highest-risk migration slice because it changes where and how all persistent data is stored. Dependencies: [Core Types Extraction]. Risk: Medium. Effort: 3/5

   *Note: This slice depends on Core Types but not on Core Services — storage and services are independent concerns and can be worked in parallel or either order after types are extracted.*

## Feature Slices

6. [ ] **MCP Server — Project Tools** — Create `packages/mcp-server` using the `@modelcontextprotocol/sdk`. Implement project management tools: `project_list`, `project_get`, `project_update`. These wrap the core storage layer to expose project state via MCP protocol. Transport: stdio. This is the first slice that delivers value to the MCP-only developer persona — after this, Claude Code can read and modify project configuration. Dependencies: [Storage Migration]. Risk: Medium. Effort: 3/5

7. [ ] **MCP Server — Context Tools** — Add context assembly tools to the MCP server: `context_build`, `template_preview`, `prompt_list`, `prompt_get`. These wrap the core orchestration layer. After this slice, Claude Code can generate complete context prompts — the primary value proposition of the entire restructure. Dependencies: [MCP Server — Project Tools, Core Orchestration Extraction]. Risk: Medium. Effort: 3/5

8. [ ] **MCP Server — State Update Tools** — Add `context_summarize` (update project summary / recent events) and any remaining state mutation tools needed for the agent workflow. This completes the MCP server's tool surface for the v2 scope. Dependencies: [MCP Server — Context Tools]. Risk: Low. Effort: 2/5

9. [ ] **Electron Client Conversion** — Rewire the Electron app to consume `packages/core` directly (replacing internal service implementations and eliminating the IPC wrappers). The renderer no longer needs `SystemPromptParserIPC` or `StatementManagerIPC` — it uses core services through the main process or through a simplified IPC layer that delegates to core. The app continues to function as before from a user perspective, but is now a thin client over core. Dependencies: [Core Orchestration Extraction, Storage Migration]. Risk: Medium. Effort: 3/5

   *Note: This slice makes Electron a core client, not an MCP client. MCP client integration (Electron connecting to a running MCP server) is a future enhancement. For v2, the Electron app uses core directly — which is the graceful degradation path described in the architecture doc.*

## Integration Work

10. [ ] **Core Test Suite** — Comprehensive unit tests for `packages/core` covering the context assembly pipeline end-to-end without Electron. Validates that the extraction preserved behavior. Dependencies: [Core Orchestration Extraction, Storage Migration]. Effort: 2/5

11. [ ] **MCP Server Integration Testing** — Integration tests that invoke MCP tools and verify correct responses. Test against a fixture project with known configuration to validate context output matches expectations. Dependencies: [MCP Server — State Update Tools]. Effort: 2/5

12. [ ] **Documentation and Packaging** — README for `context-forge-mcp` (installation, configuration for Claude Code / Cursor, available tools). Update root README for the monorepo. npm publishing configuration for `context-forge-mcp` and `@context-forge/core`. Dependencies: [MCP Server — State Update Tools]. Effort: 2/5

## Implementation Order

```
Foundation:
  1. Monorepo Scaffolding

Migration (can partially parallelize after types):
  2. Core Types Extraction
  3. Core Services Extraction ──→ 4. Core Orchestration Extraction
  5. Storage Migration (parallel with 3-4, needs only types)

Features (sequential, each builds on prior):
  6. MCP Server — Project Tools
  7. MCP Server — Context Tools
  8. MCP Server — State Update Tools

  9. Electron Client Conversion (parallel with 6-8, needs core + storage)

Integration (after features):
  10. Core Test Suite
  11. MCP Server Integration Testing
  12. Documentation and Packaging
```

## Notes
- Slices 3-4 (services, orchestration) and slice 5 (storage) are independent after the types extraction and can be worked in either order. The dependency graph is a diamond, not a chain.
- Slice 9 (Electron conversion) is deliberately scoped as "Electron uses core directly" rather than "Electron becomes an MCP client." Making Electron an MCP client adds complexity (server lifecycle management, connection handling) that is better addressed after the core restructure is stable. The architecture doc's hybrid launch model and MCP client behavior can be a future slice.
- The MCP server slices (6-8) are split by tool category rather than by technical layer because each category delivers independently testable and usable functionality. After slice 6, you can query projects from Claude Code. After slice 7, you can generate contexts. This provides incremental value rather than a big-bang MCP server delivery.
- Integration work (10-12) is listed separately but testing should happen incrementally during each slice. The integration slices are for systematic coverage and polish, not for "writing all the tests at the end."

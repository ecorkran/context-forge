---
docType: initiative-plan
layer: project
project: context-forge
source: user/project-guides/000-concept.context-builder-2.md
dateCreated: 20260323
dateUpdated: 20260323
status: in_progress
---

# Initiative Plan: Context Forge

## Source
000-concept.context-builder-2.md

## Index Convention
Variable gaps based on expected initiative breadth. The project predates formal initiative planning — indices were assigned organically as initiatives emerged. Current allocation: 050, 140, 160, 180, 200, 220. Gaps between 050-140 and 200-220 leave room for future initiatives.

## Initiatives

1. [ ] **(050) Prompt System Decoupling** — Decouple hardcoded prompt-system dependencies from Context Forge's UI and data models; abstract prompt sources and storage for flexible, imported/remote prompt sources. Dependencies: None. Status: paused (priority-adjusted to P2; will address after core architecture)

2. [x] **(140) Context Forge v2: MCP Server Architecture** — Extract core context-assembly logic into an MCP server, restructure as monorepo (core, cli, mcp-server, electron), migrate storage from Electron-store to filesystem-based config, establish MCP tools for project and context operations. Dependencies: None (foundation initiative). Status: complete

3. [x] **(160) Project Workflow System** — Add methodology-aware workflow state: schema standardization, config system, artifact introspection, workflow navigation engine. Enable Context Forge to understand project phase progression and recommend next actions. Dependencies: [140]. Status: complete

4. [x] **(180) Initiative Contexts (Worktrees)** — Support parallel development via git worktrees by introducing per-initiative workflow state (`WorktreeContext`), worktree-aware CWD resolution, and CLI commands for worktree management. Dependencies: [160]. Status: complete

5. [x] **(200) Developer Onboarding & First-Run Experience** — Collapse multi-step setup into single `cf init` command with detection-based composition, add `project_create` MCP tool for AI-driven project creation, provide onboarding skill for conversational guidance. Dependencies: [140, 160, 180]. Status: complete

6. [ ] **(220) Event-Driven Pipeline** — Persistent MCP server daemon with Streamable HTTP transport, storage-layer event emission, server-initiated notifications for multi-client coordination and event-driven automation. Dependencies: [140]. Status: active (slice 221 in progress)

## Cross-Initiative Dependencies
- 160 depends on 140: requires MCP infrastructure, standardized types, and filesystem-based storage from the v2 restructure
- 180 depends on 160: requires config infrastructure and artifact reference fields from the workflow system
- 200 depends on 140, 160, 180: requires MCP infrastructure, config system, and worktree management for full onboarding flow
- 220 depends on 140: requires MCP server factory and tool registration infrastructure

## Notes
- Initiative 050 was scoped before the formal initiative structure existed. It remains relevant but is deprioritized while the 140-220 band completes the core platform.
- The 140 → 160 → 180 chain represents the critical path that established Context Forge's current architecture.
- Initiative 220 is the active frontier. Slice 221 (server package and daemon lifecycle) is the current work item.

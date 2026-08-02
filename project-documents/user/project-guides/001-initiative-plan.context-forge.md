---
docType: initiative-plan
layer: project
project: context-forge
source: user/project-guides/000-concept.context-builder-2.md
dateCreated: 20260323
dateUpdated: 20260628
status: in_progress
---

# Initiative Plan: Context Forge

## Source
000-concept.context-builder-2.md

## Index Convention
Variable gaps based on expected initiative breadth. The project predates formal initiative planning — indices were assigned organically as initiatives emerged. Current allocation: 050, 140, 160, 180, 200, 220. Gaps between 050-140 and 200-220 leave room for future initiatives.

## Initiatives

1. [x] **(140) Context Forge v2: MCP Server Architecture** — Extract core context-assembly logic into an MCP server, restructure as monorepo (core, cli, mcp-server, electron), migrate storage from Electron-store to filesystem-based config, establish MCP tools for project and context operations. Dependencies: None (foundation initiative). Status: complete

2. [x] **(160) Project Workflow System** — Add methodology-aware workflow state: schema standardization, config system, artifact introspection, workflow navigation engine. Enable Context Forge to understand project phase progression and recommend next actions. Dependencies: [140]. Status: complete

3. [x] **(180) Initiative Contexts (Worktrees)** — Support parallel development via git worktrees by introducing per-initiative workflow state (`WorktreeContext`), worktree-aware CWD resolution, and CLI commands for worktree management. Dependencies: [160]. Status: complete

4. [ ] **(200) Developer Onboarding & First-Run Experience** — Collapse multi-step setup into single `cf init` command with detection-based composition, add `project_create` MCP tool for AI-driven project creation, provide onboarding skill for conversational guidance. Dependencies: [140, 160, 180]. Status: in_progress

5. [ ] **(220) Event-Driven Pipeline** — Persistent MCP server daemon with Streamable HTTP transport, storage-layer event emission, server-initiated notifications for multi-client coordination and event-driven automation. Dependencies: [140]. Status: active (slice 221 in progress)

6. [x] **(240) Review-Aware Workflow Gating** — Teach the workflow state machine (`workflow_next` / `workflow_check`) to gate on reviews deterministically, with **no AI in the loop**. Today `cf next` reasons over artifact existence and frontmatter status but knows nothing about reviews; it will happily recommend *advance* on a slice whose review is missing or failing. This initiative adds a config-driven review gate: which states require a review artifact (`workflow.review_required`) and what verdict/score clears the bar (`workflow.review_threshold`), mirroring the existing `workflow.auto_advance` / `workflow.auto_fix` knobs. The gate reads the review artifact's frontmatter — **the verdict/score/criteria/provenance contract standardized by Squadron slice 300** — and, when a required review is absent or below threshold, makes the next recommended action *review* (or *block*) rather than *advance*. Pure deterministic logic: a state-machine concern, not a judgment one; it routes *to* a review, it does not perform one. Usable standalone via `cf next` without any external orchestrator; Amoeba's Runner consumes the same gate later rather than reimplementing it. v1 threshold is conservative (verdict ≠ fail passes); numeric-score gating activates once Squadron's judge-enforcement layer (slice 301) emits a score. The review-artifact frontmatter schema is the cross-project seam — kept a documented contract so CF and Squadron stay decoupled. Dependencies: [160]. Status: not_started

7. [x] **(900) Maintenance & Refactoring** (perpetual) — Ongoing maintenance initiative for cross-cutting improvements: pattern consolidation, hard-coding reduction, code quality audits, and refactoring work that doesn't belong to a feature initiative. Dependencies: none. Status: not_started

## Cross-Initiative Dependencies
- 160 depends on 140: requires MCP infrastructure, standardized types, and filesystem-based storage from the v2 restructure
- 180 depends on 160: requires config infrastructure and artifact reference fields from the workflow system
- 200 depends on 140, 160, 180: requires MCP infrastructure, config system, and worktree management for full onboarding flow
- 220 depends on 140: requires MCP server factory and tool registration infrastructure
- 240 depends on 160: extends the workflow navigation engine (`workflow_next`) and config system established by the Project Workflow System; the review gate is a new rule + two config keys on that machine
- 240 ↔ external: reads the **review-artifact frontmatter contract** (verdict/score/criteria/provenance) owned by Squadron (slice 300); numeric-score gating is unblocked by Squadron slice 301. This is a cross-project data contract, not a CF-internal dependency — CF only depends on the frontmatter schema being stable, not on Squadron's code.

## Notes
- Initiative 050 (Prompt System Decoupling) was removed — the original architecture is obsolete and any future decoupling work would require a new design.
- The 140 → 160 → 180 chain represents the critical path that established Context Forge's current architecture.
- Initiative 220 is the active frontier. Slice 221 (server package and daemon lifecycle) is the current work item.

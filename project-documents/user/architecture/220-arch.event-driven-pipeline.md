---
docType: architecture
layer: project
parent: user/architecture/140-arch.context-forge-restructure.md
project: context-forge
archIndex: 220
component: event-driven-pipeline
relatedSlices: []
riskLevel: medium
dateCreated: 20260311
dateUpdated: 20260311
status: not_started
---

# Architecture: Event-Driven Pipeline

## Overview

Context Forge's MCP server currently operates exclusively via stdio transport — one server process per client, no shared state, no push notifications. As the ecosystem grows to include multiple concurrent clients (Claude Code, context-visualizer, Squadron, Electron), the inability to coordinate between them becomes a structural limitation.

This component introduces a persistent MCP server with Streamable HTTP transport, a state-change event model, and server-initiated notifications. Together, these enable event-driven coordination between Context Forge and its clients — replacing polling and manual intervention with reactive state propagation.

**Scope:** This component covers the server daemon lifecycle, Streamable HTTP transport alongside existing stdio, the event emission model within the storage layer, and server-initiated notifications to connected clients. It does not cover Squadron's pipeline architecture (that is Squadron's concern) or web-based onboarding (a separate initiative that depends on this transport).

**Motivation:** Three forces drive this initiative:

1. **Multi-client coordination.** Claude Code, context-visualizer, and Squadron currently spawn independent server instances. They share the same JSON storage file but cannot observe each other's mutations. When Claude Code advances a slice, context-visualizer doesn't know until it polls or is manually refreshed. Squadron pipelines must poll or rely on manual triggers.

2. **Event-driven automation.** Squadron's pipeline executor needs to react to project state changes — a completed slice triggering the next pipeline stage, a phase advance kicking off a new agent. This requires push semantics, not request-response.

3. **Prerequisite for web access.** A Streamable HTTP endpoint is the foundation for browser-based interfaces — whether that's a web-based onboarding flow, a remote dashboard, or team-shared project visibility. stdio cannot serve these use cases.

## Design Goals

- **Shared server, multiple clients.** A single persistent Context Forge server that Claude Code, context-visualizer, Squadron, and Electron can all connect to simultaneously. Mutations from any client are visible to all connected clients without polling.

- **Reactive state propagation.** When project state changes (slice advanced, tasks completed, worktree modified), connected clients receive notifications automatically. Clients opt into the events they care about rather than continuously querying for changes.

- **Transport parity.** stdio and Streamable HTTP are equally capable transports — same tool registrations, same behavior, same responses. stdio remains the default for single-client local use; HTTP is opt-in for multi-client or network scenarios.

- **Zero-disruption adoption.** Existing stdio workflows continue unchanged. Adding the HTTP transport is additive — no existing configuration, client setup, or behavior changes. Projects that don't need multi-client coordination never encounter the HTTP server.

- **Local-first security model.** The server binds to localhost by default with no authentication required. Network-exposed mode (non-localhost binding) requires an explicit configuration step and enables token-based authentication.

## Architectural Principles

- **Transport is plumbing, not architecture.** The `McpServer` is transport-agnostic by design — tools are registered once, transports are plugged in independently. Adding HTTP should not change any tool implementation, storage logic, or context assembly code.

- **Events emerge from storage mutations.** The event model is rooted in the storage layer, not in individual tool handlers. When `FileProjectStore.update()` persists a change, it emits an event describing what changed. Tool handlers don't need to know about the event system — they mutate state, and the storage layer handles notification.

- **Daemon lifecycle is explicit.** The server is a managed process with clear start/stop semantics, not an implicit side effect of running a command. Users start it when they want multi-client coordination and stop it when they don't.

- **Stateless HTTP, stateful connections.** Individual HTTP requests are stateless (new transport per request, no session affinity required). Long-lived event streams (SSE via GET `/mcp`) are the only stateful connection type, and they are ephemeral — a dropped connection is just a client that stopped listening.

- **Squadron informs the contract, not the other way around.** The event model should be general enough that any client can consume it, but the specific event types and payloads should be informed by Squadron's pipeline architecture — the primary consumer of event-driven state changes. This initiative co-develops with Squadron rather than speculating about consumption patterns.

## Current State

Context Forge's MCP server (`packages/mcp-server`) registers 32 tools on a single `McpServer` instance and connects via `StdioServerTransport`. The server launches as a subprocess of the client (Claude Code, Cursor, etc.) and dies when the client disconnects.

```
Client (Claude Code)  →  spawns  →  MCP Server (stdio)  →  reads/writes  →  ~/.config/context-forge/projects.json
Client (Visualizer)   →  spawns  →  MCP Server (stdio)  →  reads/writes  →  ~/.config/context-forge/projects.json
Client (Squadron)     →  spawns  →  MCP Server (stdio)  →  reads/writes  →  ~/.config/context-forge/projects.json
```

Each client gets an independent server process. The only shared state is the filesystem — `projects.json` and project document files. This works for single-client use but creates problems:

- **No change awareness.** Client A mutates state; Client B doesn't know until it queries again. There is no notification mechanism.
- **Write-write risk.** Two clients writing to `projects.json` simultaneously can corrupt data. The current read-modify-write pattern has no locking. In practice, contention is low (human users rarely trigger simultaneous writes), but automated pipelines change this dynamic.
- **Process overhead.** Each client spawns a full Node.js process for its server instance. For a developer running Claude Code + context-visualizer + Squadron, that's three redundant server processes reading the same files.

The MCP SDK (^1.26.0) already supports Streamable HTTP via `@modelcontextprotocol/node` and `@modelcontextprotocol/express`. The `McpServer.connect(transport)` API accepts multiple transports — the server architecture is already multi-transport capable, it just isn't wired up.

## Envisioned State

A persistent Context Forge daemon serves all clients through a shared HTTP endpoint while stdio remains available for simple single-client use.

```
                                    ┌─ Claude Code (stdio, unchanged)
                                    │
cf server (daemon)  ─── /mcp ───────┼─ context-visualizer (HTTP, SSE events)
         │                          │
         │                          ├─ Squadron (HTTP, event-triggered pipelines)
         │                          │
         └── projects.json ─────────└─ Electron (HTTP, live state)
```

**Storage layer emits events.** `FileProjectStore.update()` fires an event describing the mutation — which project, which fields changed, old vs. new values. The event is emitted after successful write, fire-and-forget. If no clients are listening, the event is discarded. No event queue, no persistence, no replay.

**Connected HTTP clients receive notifications.** Clients maintaining an SSE connection (GET `/mcp`) receive server-initiated MCP notifications for state changes they've subscribed to. The MCP SDK's notification mechanism is the delivery channel — no custom protocol needed.

**stdio clients are unaffected.** A Claude Code session using stdio transport continues to work exactly as today. It spawns its own server process, communicates via stdin/stdout, and has no awareness of the HTTP daemon. The two modes coexist without interference.

**The daemon is optional.** For a solo developer using only Claude Code, the daemon is never needed. For multi-client setups, `cf server start` launches the daemon. The CLI auto-detects whether a daemon is running and routes HTTP-capable operations to it when available.

## Technical Considerations

- **Storage-level event emission.** Events must originate from the storage layer to ensure all mutations (from any tool, any transport) generate notifications. Hooking events into individual tool handlers would be fragile and miss mutations from new tools. The challenge is defining event granularity — per-field changes vs. aggregate "project updated" notifications.

- **Write concurrency.** A shared server serializes writes through a single process, eliminating the current read-modify-write race condition. However, the storage layer currently has no write locking — multiple in-flight requests could still interleave. The simplest solution is a per-project mutex in the store, which is sufficient for the expected write volume.

- **Daemon process management.** The daemon needs reliable start/stop/status lifecycle management: PID file for tracking, signal handling for graceful shutdown, port conflict detection on startup. This is well-understood infrastructure but needs to be implemented carefully to avoid orphan processes.

- **Transport security model.** Localhost binding requires no authentication (same trust boundary as stdio). Network binding introduces authentication requirements — likely a static token in config, validated per-request. The MCP SDK's Streamable HTTP implementation includes DNS rebinding protection via `@modelcontextprotocol/express`.

- **Event subscription filtering.** Not every client needs every event. context-visualizer cares about the project it's displaying; Squadron cares about the project whose pipeline it's running. Subscription filtering (by project ID, event type) keeps noise low without requiring complex subscription management.

- **SDK package migration.** The MCP SDK restructured into sub-packages around v1.23-1.24. Adding HTTP transport requires `@modelcontextprotocol/node` (for `NodeStreamableHTTPServerTransport`) and `@modelcontextprotocol/express` (for Express helpers with DNS rebinding protection). These are additive dependencies — the existing `@modelcontextprotocol/sdk` import continues to work for stdio.

- **Squadron dependency timing.** The event model's usefulness depends on having a consumer. Building the full event system before Squadron's pipeline architecture is defined risks building the wrong contract. The transport and daemon lifecycle can proceed independently; the event model should co-develop with Squadron.

## Anticipated Slices

- **Daemon lifecycle.** `cf server start/stop/status` commands, PID file management, port configuration, signal handling. The foundation — a persistent process that can accept connections. Independent of event model.

- **Streamable HTTP transport.** Express server with `/mcp` endpoint, `NodeStreamableHTTPServerTransport` wiring, dual-transport binding (same `McpServer` connects to both stdio and HTTP). All 32 existing tools immediately available over HTTP with no changes. This delivers multi-client access without events.

- **Storage event emission.** Extend `FileProjectStore` to emit typed events on successful mutations. Define the event schema (type, projectId, worktreeId, timestamp, changedFields). Fire-and-forget — no persistence, no replay, no queue. This is the plumbing that notifications build on.

- **Server-initiated notifications.** Wire storage events to connected HTTP clients via MCP server notifications. SSE delivery on the GET `/mcp` stream. Subscription filtering by project and event type. This is the user-visible payoff — clients see changes in real time.

- **Client subscription model.** Lightweight mechanism for clients to declare interest in specific events or projects. Active-connection-only — no persistent subscription storage. Clients that disconnect simply stop receiving events.

- **Squadron integration.** Pipeline steps triggered by Context Forge events. Depends on Squadron's pipeline architecture decisions — scope and contract TBD based on Squadron co-development.

## Related Work

- **140-arch: Context Forge Restructure** — This initiative's parent architecture. Established the monorepo, MCP server, and core engine. The future work item "MCP Server Streamable HTTP Transport" in [140-slices](user/architecture/140-slices.context-forge-restructure.md) is promoted into this initiative.

- **180-arch: Initiative Contexts (Worktrees)** — Worktree events (`worktree.modified`) are part of the event model. Multi-worktree coordination across clients is a primary beneficiary of shared-server architecture.

- **Onboarding initiative (TBD)** — Web-based onboarding requires the HTTP transport delivered by this initiative as a prerequisite. Separate initiative with a dependency on this one.

- **Squadron** — The primary consumer of event-driven state changes. Pipeline architecture decisions in Squadron inform the event contract here. This initiative should co-develop with Squadron rather than speculate.

## Non-Goals

- **Replacing stdio.** stdio remains the default and recommended transport for single-client local use. HTTP is additive, not a replacement.
- **Event persistence or replay.** Events are fire-and-forget. Clients that aren't connected when an event fires don't receive it. No event log, no replay buffer, no guaranteed delivery.
- **Web UI.** This initiative provides the HTTP transport that a web UI would use, but does not build any web UI. That belongs to the onboarding initiative or a dedicated web initiative.
- **Squadron pipeline architecture.** How Squadron consumes events and structures its pipelines is Squadron's concern. This initiative provides the event emission; Squadron provides the consumption.
- **Remote/cloud deployment.** The architecture supports network binding, but productionizing for cloud deployment (container images, service discovery, multi-tenant isolation) is out of scope.

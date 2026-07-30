---
docType: slice-plan
parent: user/architecture/220-arch.event-driven-pipeline.md
project: context-forge
dateCreated: 20260320
dateUpdated: 20260320
status: not_started
---

# Slice Plan: Event-Driven Pipeline

## Parent Document
[220-arch.event-driven-pipeline.md](220-arch.event-driven-pipeline.md) — Persistent MCP server with Streamable HTTP transport, storage-layer event emission, and server-initiated notifications.

## Foundation Work

1. [ ] **(221) Server Package and Daemon Lifecycle** — New `packages/server` package in the monorepo. `cf server start/stop/status` CLI commands. PID file management, port configuration (default 3100), graceful shutdown via signal handling (SIGTERM, SIGINT). The daemon is a persistent Node.js process that hosts the existing `McpServer` instance. No HTTP yet — this slice establishes the process lifecycle. Dependencies: none. Risk: Medium. Effort: 3/5

## Feature Slices

2. [ ] **(222) Streamable HTTP Transport** — Express server with `/mcp` endpoint implementing MCP Streamable HTTP transport (spec 2025-11-25). `StreamableHTTPServerTransport` from `@modelcontextprotocol/sdk` wired alongside existing stdio. Session management via `MCP-Session-Id`. Origin validation for DNS rebinding protection. All 34 existing tools immediately available over HTTP with no tool changes. Localhost binding by default. Dependencies: [221]. Risk: Medium. Effort: 3/5

3. [ ] **(223) Network Binding and Authentication** — Configuration for non-localhost binding (`cf config set server.host 0.0.0.0`). Token-based authentication for network mode — static token in config, validated per-request via `Authorization: Bearer` header. Auth automatically required when host is not localhost. Dependencies: [222]. Risk: Low. Effort: 2/5

4. [ ] **(224) Storage Event Emission** — Extend `FileProjectStore` in `packages/core` to emit typed events on successful mutations. Event schema: `{ type, projectId, worktreeId?, timestamp, changedFields, oldValues, newValues }`. Per-project write mutex to prevent interleaved read-modify-write. Fire-and-forget — no persistence, no replay, no queue. Event types: `project.updated`, `project.created`, `project.deleted`, `worktree.modified`. Dependencies: none (core-only, no server dependency). Risk: Medium. Effort: 3/5

5. [ ] **(225) Server-Initiated Notifications** — Wire storage events to connected HTTP clients via MCP server notifications over SSE (GET `/mcp` stream). Clients receive `notifications/event` messages for state changes. Event filtering by project ID — clients declare interest during subscription. Unsubscribe on disconnect. Dependencies: [222, 224]. Risk: Medium. Effort: 3/5

6. [ ] **(226) Client Subscription Model** — Lightweight subscription API: clients send a `subscribe` request specifying project IDs and event types of interest. Active-connection-only — no persistent subscription storage. Default: all events for all projects (opt-out filtering). Subscription state lives in server memory, scoped to session. Dependencies: [225]. Risk: Low. Effort: 2/5

## Integration Work

7. [ ] **(227) CLI Auto-Detection and Routing** — CLI auto-detects whether a daemon is running (check PID file + health endpoint). When daemon is available, HTTP-capable commands route through it instead of spawning a new process. Fallback to direct execution when no daemon. `cf server url` command to print the endpoint for client configuration. Dependencies: [222]. Risk: Low. Effort: 2/5

8. [ ] **(228) Squadron Integration Contract** — Placeholder. Define the event contract for Squadron pipeline triggers. Pipeline step events, completion callbacks, error propagation. Scope and contract TBD — co-developed with Squadron's pipeline architecture. Dependencies: [225, 226]. Risk: High. Effort: TBD

## Notes

- **Transport parity is a hard requirement.** Every tool must produce identical results whether accessed via stdio or HTTP. No transport-specific behavior in tool handlers.
- **The MCP SDK (^1.26.0) already supports Streamable HTTP** via `StreamableHTTPServerTransport` in `@modelcontextprotocol/sdk/server/streamableHttp.js`. No additional SDK packages needed — the restructured sub-packages landed in ~1.23-1.24.
- **Slice 224 (Storage Events) has no dependency on the server package.** It's a core change that can proceed in parallel with server work. Events are emitted regardless of whether a daemon is running — stdio clients just don't subscribe to them.
- **Slice 228 (Squadron) is intentionally vague.** The architecture doc states this should co-develop with Squadron rather than speculate. Once Squadron's pipeline architecture is defined, this slice gets scoped.
- **Network auth (slice 223) is separated from HTTP transport (222)** to keep 222 focused on getting the transport working on localhost. Auth adds complexity that shouldn't block the core transport work.

## Future Work

1. [ ] **Resumable SSE streams** — Implement `Last-Event-ID` support for stream resumption after disconnects. The MCP spec supports this but it requires event ID management and replay buffering. Not needed for initial release (localhost, low-latency connections).
2. [ ] **Backwards compatibility with HTTP+SSE (2024-11-05)** — Support older clients that expect the deprecated SSE transport. The MCP spec describes a negotiation flow. Low priority unless third-party clients need it.
3. [ ] **Deployment artifacts** — Dockerfile, docker-compose, systemd unit files for production deployment. Separate from the core server work.
4. [ ] **Web UI foundation** — The HTTP transport enables browser-based interfaces. A web-based onboarding flow or remote dashboard would be a separate initiative that depends on slice 222.

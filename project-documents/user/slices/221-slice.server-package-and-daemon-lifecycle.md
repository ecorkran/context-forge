---
docType: slice-design
slice: server-package-and-daemon-lifecycle
project: context-forge
parent: user/architecture/220-slices.event-driven-pipeline.md
dependencies: []
interfaces: [222-slice.streamable-http-transport]
dateCreated: 20260320
dateUpdated: 20260320
status: not_started
---

# Slice Design: Server Package and Daemon Lifecycle

## Overview

New `packages/server` package in the monorepo that provides a persistent daemon process for Context Forge. The daemon hosts a configured `McpServer` instance with all existing tools registered, manages its own lifecycle via PID files and signal handlers, and exposes `cf server start/stop/status` CLI commands for explicit process control.

This slice establishes the process skeleton only — no HTTP transport, no event emission, no client connections. The daemon starts, writes a PID file, configures its port, handles shutdown signals, and waits. Slice 222 wires in Streamable HTTP transport to make the daemon useful to external clients.

## Value

- **Foundation for multi-client access.** Every subsequent slice in the 220 initiative depends on a running daemon process. Getting the lifecycle right first — PID management, signal handling, port allocation, graceful shutdown — avoids baking those concerns into the transport or event slices.
- **Developer-facing process control.** `cf server start/stop/status` gives users explicit control over the daemon. No implicit background processes, no magic — the user decides when the daemon runs.
- **Shared server instantiation.** Extracting `McpServer` creation and tool registration into a reusable factory means the stdio entry point and the daemon share identical server configuration, guaranteeing transport parity from the start.

## Technical Scope

### Included

1. New `packages/server` package (TypeScript, ESM, same build setup as other packages)
2. Server factory function extracted from `packages/mcp-server` — shared `McpServer` instantiation with all tool registrations
3. Daemon entry point that creates the server, writes PID file, registers signal handlers, and waits
4. `cf server start` — launches daemon as a detached child process
5. `cf server stop` — sends SIGTERM to the daemon via PID file
6. `cf server status` — reports whether daemon is running (PID file + process liveness check)
7. Port configuration via `cf config set server.port <port>` (default: 3100)
8. Host configuration via `cf config set server.host <host>` (default: `127.0.0.1`)

### Excluded

- HTTP transport (slice 222)
- Network authentication (slice 223)
- Storage event emission (slice 224)
- Any tool changes — tools are registered identically via the shared factory

## Technical Decisions

### 1. Package Structure

New package at `packages/server/`:

```
packages/server/
  package.json
  tsconfig.json
  src/
    index.ts              — daemon entry point (bin: context-forge-server)
    daemon.ts             — daemon lifecycle: PID, signals, shutdown
    pid.ts                — PID file read/write/check utilities
    config.ts             — server config resolution (port, host)
  tests/
    daemon.test.ts
    pid.test.ts
```

**package.json** key fields:
- `name`: `@context-forge/server`
- `bin`: `{ "context-forge-server": "dist/index.js" }`
- `dependencies`: `@context-forge/core` (for config resolution), `@context-forge/mcp-server` (for server factory)
- `devDependencies`: same as other packages (TypeScript, Vitest)

The package depends on `@context-forge/mcp-server` for the shared server factory (see decision 2). It does **not** duplicate tool registrations.

### 2. Shared Server Factory

Currently `packages/mcp-server/src/index.ts` creates the `McpServer`, registers all tools, and connects stdio — all in one entry point. The daemon needs the same server with the same tools but a different lifecycle.

Extract a factory function into `packages/mcp-server`:

```typescript
// packages/mcp-server/src/serverFactory.ts
export function createContextForgeServer(): McpServer {
  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  // Same registration order as current index.ts
  registerAgentGuideTool(server);
  registerAgentOnboardTool(server);
  registerProjectTools(server, SERVER_VERSION);
  registerWorkflowTools(server);
  registerContextTools(server);
  registerGuideTools(server);
  registerIntrospectionTools(server);
  registerWorktreeTools(server);
  registerConfigTools(server, SERVER_VERSION);
  registerStateTools(server);
  registerVersionTool(server, SERVER_NAME, SERVER_VERSION);

  return server;
}
```

The existing `packages/mcp-server/src/index.ts` calls `createContextForgeServer()` then connects stdio. The daemon calls the same factory then manages its own lifecycle. This guarantees tool parity across both entry points.

Export from `packages/mcp-server` package exports:
```json
{
  "exports": {
    ".": "./dist/index.js",
    "./factory": "./dist/serverFactory.js"
  }
}
```

### 3. Daemon Entry Point

`packages/server/src/index.ts` is the daemon process:

```typescript
#!/usr/bin/env node
async function main() {
  const config = await resolveServerConfig();  // port, host, pidPath

  // Write PID file (fail if already running)
  await writePidFile(config.pidPath);

  // Create the MCP server (all tools registered)
  const server = createContextForgeServer();

  // Register signal handlers for graceful shutdown
  registerShutdownHandlers(config.pidPath, server);

  // No transport connected yet — slice 222 adds HTTP here.
  // The daemon is running and ready to accept a transport connection.
  log(`Daemon started (pid=${process.pid}, port=${config.port})`);

  // Keep process alive
  // (In slice 222, the HTTP server's listen() keeps the process alive.
  //  For now, a simple interval prevents premature exit.)
}
```

The "keep alive" mechanism is intentionally minimal — slice 222 replaces it with `httpServer.listen()`. For this slice, a `setInterval` or equivalent is sufficient to prevent the process from exiting.

### 4. PID File Management

**Location:** `~/.config/context-forge/server.pid` (resolved via `env-paths` from `@context-forge/core`, same as `projects.json`).

**Operations:**

- **Write:** Atomic write of `process.pid` to PID file on daemon start. Fail if a PID file already exists AND the process is still running (prevents double-start).
- **Read:** Parse PID from file, return `null` if file doesn't exist.
- **Check liveness:** After reading PID, verify the process is still running via `process.kill(pid, 0)` (signal 0 checks existence without sending a signal). Stale PID files (process dead) are cleaned up automatically.
- **Remove:** Delete PID file on graceful shutdown (signal handler or explicit stop).

**Stale PID handling:** If `cf server start` finds a PID file but the process is dead (common after crash or reboot), it removes the stale file and proceeds with startup. This avoids requiring manual cleanup.

### 5. Signal Handling

The daemon registers handlers for:

- **SIGTERM** — Graceful shutdown. Clean up PID file, close any open resources, exit 0. This is the signal sent by `cf server stop`.
- **SIGINT** — Same as SIGTERM (handles Ctrl-C during foreground debugging).

Shutdown sequence:
1. Log shutdown initiation
2. Close MCP server (calls `server.close()` if transport is connected — relevant for slice 222+)
3. Remove PID file
4. Exit 0

A shutdown timeout (5 seconds) ensures the process exits even if cleanup hangs. After the timeout, `process.exit(1)`.

### 6. CLI Commands

Three new subcommands under `cf server`:

**`cf server start`**
- Resolves server config (port, host)
- Checks for existing daemon (PID file + liveness)
- If already running: print status and exit (no error)
- If not running: spawn daemon as detached child process via `child_process.spawn` with `detached: true, stdio: 'ignore'`
- Wait briefly for PID file to appear (confirms successful start)
- Print confirmation: `Server started (pid=XXXXX, port=3100)`

**`cf server stop`**
- Read PID file
- If no PID file or process dead: print "Server is not running" and exit
- Send SIGTERM to the PID
- Wait for PID file removal (confirms clean shutdown, timeout 5s)
- If timeout: warn that process may not have stopped cleanly

**`cf server status`**
- Read PID file
- If no PID file: print "Server is not running"
- If PID file but process dead: print "Server is not running (stale PID file cleaned up)", remove stale file
- If running: print `Server running (pid=XXXXX, port=3100, host=127.0.0.1)`

All commands support `--json` for machine-readable output (consistent with existing CLI patterns).

**CLI registration:** New `registerServerCommand(program)` in `packages/cli/src/commands/server.ts`. Registered in the Setup/Admin group in `packages/cli/src/index.ts`.

The CLI imports PID utilities from `@context-forge/server` and spawns the daemon binary (`context-forge-server`).

### 7. Port and Host Configuration

Uses the existing `cf config` system:

- `server.port` — Default `3100`. Validated as integer 1024-65535.
- `server.host` — Default `127.0.0.1`. Validated as valid hostname/IP.

These are read at daemon startup and passed to the server. Changing config while the daemon is running requires a restart (`cf server stop && cf server start`). No hot-reload of config — keeping it simple.

Port conflict detection: On startup, the daemon attempts to bind a temporary socket to the configured port. If it fails (EADDRINUSE), exit with a clear error message: `Port 3100 is already in use. Use cf config set server.port <port> to change.` This check happens before the PID file is written. (In slice 222, the actual HTTP server replaces this check — the listen call itself detects conflicts.)

### 8. Daemon Spawn Strategy

`cf server start` launches the daemon as a fully detached process:

```typescript
const child = spawn(daemonBin, [], {
  detached: true,
  stdio: 'ignore',
  env: { ...process.env },
});
child.unref();
```

Key points:
- `detached: true` — daemon survives CLI exit
- `stdio: 'ignore'` — daemon has no stdio (it's a background process). Logs go to a log file or stderr redirect (see Logging below).
- `child.unref()` — CLI process doesn't wait for daemon
- The daemon binary path is resolved via `require.resolve('@context-forge/server')` or `npx context-forge-server`

**Logging:** The daemon writes to `~/.config/context-forge/server.log` (same data directory). Simple append-only log with timestamps. Rotated by size (max 1MB, keep 1 backup). This gives users something to check when things go wrong without requiring a logging framework.

## Success Criteria

### Functional Requirements
- `cf server start` launches a background daemon process and prints confirmation
- `cf server start` when already running prints status without error or double-start
- `cf server stop` sends SIGTERM and confirms shutdown
- `cf server status` reports running/not-running with PID and port
- Stale PID files (from crash/reboot) are cleaned up automatically
- Port conflict is detected on startup with a clear error message
- `cf config set server.port 4200` changes the port for next start
- `--json` flag on all three subcommands produces machine-readable output

### Technical Requirements
- `packages/server` builds cleanly with same TypeScript config as other packages
- Server factory in `packages/mcp-server` is used by both stdio entry point and daemon — no duplicated tool registrations
- Existing `packages/mcp-server` stdio behavior is unchanged
- Signal handlers (SIGTERM, SIGINT) trigger clean shutdown with PID file removal
- All existing tests continue to pass (no regressions in core, cli, mcp-server)

### Verification Walkthrough

```bash
# 1. Build all packages
npm run build

# 2. Start the daemon
cf server start
# Expected: "Server started (pid=XXXXX, port=3100)"

# 3. Verify status
cf server status
# Expected: "Server running (pid=XXXXX, port=3100, host=127.0.0.1)"

# 4. Verify PID file
cat ~/.config/context-forge/server.pid
# Expected: PID number matching status output

# 5. Double-start is safe
cf server start
# Expected: "Server already running (pid=XXXXX, port=3100)"

# 6. Stop the daemon
cf server stop
# Expected: "Server stopped"

# 7. Verify stopped
cf server status
# Expected: "Server is not running"

# 8. Verify PID file cleaned up
ls ~/.config/context-forge/server.pid
# Expected: file not found

# 9. JSON output
cf server status --json
# Expected: {"running": false}

# 10. Port configuration
cf config set server.port 4200
cf server start
cf server status
# Expected: port=4200 in output

# 11. Stale PID recovery (simulate crash)
cf server start
kill -9 $(cat ~/.config/context-forge/server.pid)
cf server start
# Expected: starts normally (cleans up stale PID file)

# 12. Verify existing stdio MCP still works
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"test","version":"1.0"}}}' | npx context-forge-mcp
# Expected: initialize response (unchanged behavior)
```

## Implementation Notes

### Development Approach

Suggested order:
1. Server factory extraction from `packages/mcp-server` (enables everything else, minimal risk)
2. PID file utilities (standalone, testable in isolation)
3. Daemon entry point (combines factory + PID + signal handling)
4. CLI commands (start/stop/status — depend on PID utilities and daemon binary)
5. Config integration (port/host from `cf config`)
6. Tests for all components

### Dependency on Existing Packages

- `@context-forge/core` — config resolution (`getConfigValue`), data directory paths (`env-paths`)
- `@context-forge/mcp-server` — server factory function (new export)
- `@modelcontextprotocol/sdk` — `McpServer` type (already a transitive dependency via mcp-server)

### Workspace Configuration

Root `package.json` workspaces array needs `packages/server` added. The `pnpm-workspace.yaml` (if present) may also need updating.

---
slice: server-package-and-daemon-lifecycle
project: context-forge
lld: user/slices/221-slice.server-package-and-daemon-lifecycle.md
dependencies: []
projectState: Slice 205 complete (v0.6.14). 220 initiative started — slice plan active. MCP server is stdio-only. No daemon, PID management, or HTTP transport exists yet.
dateCreated: 20260320
dateUpdated: 20260320
status: not_started
docType: tasks
---

## Context Summary
- Working on 221-slice.server-package-and-daemon-lifecycle (foundation slice in 220 event-driven-pipeline initiative)
- Creates `packages/server` for daemon lifecycle management
- Extracts shared server factory from `packages/mcp-server` so both stdio and daemon entry points share identical tool registrations
- Adds `cf server start/stop/status` CLI commands with PID file management and signal handling
- No dependencies on other slices; slice 222 (Streamable HTTP Transport) depends on this
- Key files: `packages/mcp-server/src/index.ts` (extract factory), new `packages/server/`, `packages/cli/src/commands/server.ts`

---

## Section 1: Server Factory Extraction

**Effort: 2/5**

- [ ] 1.1 Create `serverFactory.ts` in `packages/mcp-server`
  - [ ] Create `packages/mcp-server/src/serverFactory.ts`
  - [ ] Move `McpServer` creation and all `register*` calls from `index.ts` into an exported `createContextForgeServer()` function
  - [ ] Function returns a configured `McpServer` with all tools registered (same order as current `index.ts`)
  - [ ] Accept optional `{ name?: string, version?: string }` parameter for server identity (defaults to current `SERVER_NAME` and `SERVER_VERSION`)
  - [ ] Export `SERVER_NAME` and `SERVER_VERSION` constants from the factory module
  - [ ] Build clean

- [ ] 1.2 Update `packages/mcp-server/src/index.ts` to use factory
  - [ ] Import `createContextForgeServer` from `./serverFactory.js`
  - [ ] Replace inline server creation with `const server = createContextForgeServer()`
  - [ ] Remove now-unused individual tool registration imports from `index.ts`
  - [ ] Keep the `log()` function and stdio transport connection in `index.ts`
  - [ ] Build clean

- [ ] 1.3 Add `factory` export to `packages/mcp-server/package.json`
  - [ ] Add `"./factory"` entry to `exports` map pointing to `"./dist/serverFactory.js"`
  - [ ] Build clean

- [ ] 1.4 Tests for server factory extraction
  - [ ] Verify existing `serverLifecycle.test.ts` still passes (stdio behavior unchanged)
  - [ ] Add test in `packages/mcp-server/tests/serverFactory.test.ts`: `createContextForgeServer()` returns a valid `McpServer` instance
  - [ ] All mcp-server tests pass, build clean

**Commit**: `refactor(mcp): extract server factory for shared McpServer instantiation`

---

## Section 2: Server Package Scaffolding

**Effort: 2/5**

- [ ] 2.1 Create `packages/server` directory structure
  - [ ] Create `packages/server/src/` and `packages/server/tests/` directories
  - [ ] Create `packages/server/package.json`:
    - `name`: `@context-forge/server`
    - `version`: match current version (0.6.14)
    - `type`: `module`
    - `bin`: `{ "context-forge-server": "dist/index.js" }`
    - `dependencies`: `@context-forge/core`, `@context-forge/mcp-server`
    - `devDependencies`: `typescript`, `vitest`, `@types/node`
    - `scripts`: `build`, `dev`, `test` (matching other packages)
  - [ ] Create `packages/server/tsconfig.json` (identical to other packages: ES2023, nodenext, strict)

- [ ] 2.2 Register in workspace
  - [ ] Add `packages/server` to root `package.json` workspaces array
  - [ ] Run `pnpm install` to link workspace dependencies
  - [ ] Build clean (`npm run build` succeeds across all packages)

- [ ] 2.3 Create placeholder entry point
  - [ ] Create `packages/server/src/index.ts` with hashbang and minimal `main()` that logs startup and exits
  - [ ] Build clean, verify `dist/index.js` is produced

**Commit**: `feat(server): scaffold packages/server with workspace integration`

---

## Section 3: PID File Utilities

**Effort: 2/5**

- [ ] 3.1 Implement PID file module
  - [ ] Create `packages/server/src/pid.ts`
  - [ ] `getPidFilePath()`: returns `~/.config/context-forge/server.pid` (resolve via `env-paths` from `@context-forge/core` or use same data directory resolution)
  - [ ] `writePidFile(pidPath: string)`: atomic write of `process.pid` as string. Fail with descriptive error if file already exists AND process is alive
  - [ ] `readPidFile(pidPath: string)`: parse PID from file, return `null` if file doesn't exist
  - [ ] `isProcessRunning(pid: number)`: check liveness via `process.kill(pid, 0)` (signal 0). Return `false` on ESRCH (no such process), `true` otherwise
  - [ ] `removePidFile(pidPath: string)`: delete PID file, no error if already gone
  - [ ] `cleanStalePidFile(pidPath: string)`: read PID file, check liveness — if process dead, remove stale file and return `true` (cleaned). If alive, return `false`. If no file, return `false`.
  - [ ] Export all functions

- [ ] 3.2 Tests for PID file utilities
  - [ ] Create `packages/server/tests/pid.test.ts`
  - [ ] Test `writePidFile` creates file with current PID
  - [ ] Test `readPidFile` returns PID number from file
  - [ ] Test `readPidFile` returns `null` when file doesn't exist
  - [ ] Test `isProcessRunning` returns `true` for `process.pid` (self)
  - [ ] Test `isProcessRunning` returns `false` for a non-existent PID (use a very high number)
  - [ ] Test `cleanStalePidFile` removes file when process is dead
  - [ ] Test `cleanStalePidFile` leaves file when process is alive
  - [ ] Test `writePidFile` fails when PID file exists and process is alive
  - [ ] Test `writePidFile` succeeds (overwrites) when PID file exists but process is dead
  - [ ] All tests pass, build clean

**Commit**: `feat(server): add PID file management utilities`

---

## Section 4: Server Configuration

**Effort: 1/5**

- [ ] 4.1 Implement server config resolution
  - [ ] Create `packages/server/src/config.ts`
  - [ ] `resolveServerConfig()`: returns `{ port: number, host: string, pidPath: string, logPath: string }`
  - [ ] Read `server.port` from config (via `@context-forge/core` config utilities), default `3100`, validate integer 1024-65535
  - [ ] Read `server.host` from config, default `127.0.0.1`
  - [ ] Resolve `pidPath` and `logPath` from data directory (same directory as `projects.json`)
  - [ ] Export the config type and resolver function

- [ ] 4.2 Register config keys in core
  - [ ] In `packages/core`, ensure `server.port` and `server.host` are recognized config keys (check how existing config keys are defined — follow the same pattern)
  - [ ] `cf config set server.port 4200` and `cf config set server.host 0.0.0.0` should work
  - [ ] Build clean

- [ ] 4.3 Tests for server config
  - [ ] Create `packages/server/tests/config.test.ts`
  - [ ] Test default values (port 3100, host 127.0.0.1)
  - [ ] Test port validation rejects values outside 1024-65535
  - [ ] All tests pass, build clean

**Commit**: `feat(server): add server port and host configuration`

---

## Section 5: Daemon Lifecycle

**Effort: 3/5**

- [ ] 5.1 Implement daemon module
  - [ ] Create `packages/server/src/daemon.ts`
  - [ ] `startDaemon(config)`: create MCP server via `createContextForgeServer()`, write PID file, register signal handlers, log startup, keep process alive
  - [ ] `registerShutdownHandlers(pidPath, server)`: register SIGTERM and SIGINT handlers that: log shutdown, remove PID file, exit 0. Include a 5-second timeout that calls `process.exit(1)` if cleanup hangs
  - [ ] Logging: write to `config.logPath` (append-only, timestamped lines). Use a simple file logger — no framework dependency
  - [ ] Export `startDaemon`

- [ ] 5.2 Implement daemon entry point
  - [ ] Update `packages/server/src/index.ts`:
    - Hashbang `#!/usr/bin/env node`
    - Import `resolveServerConfig` and `startDaemon`
    - Call `resolveServerConfig()` then `startDaemon(config)`
    - Top-level error handler matching mcp-server pattern (log fatal error, exit 1)
  - [ ] Build clean

- [ ] 5.3 Implement port availability check
  - [ ] In `packages/server/src/daemon.ts` or separate utility
  - [ ] `checkPortAvailable(port, host)`: attempt to create and immediately close a `net.Server` on the port. Resolve `true` if successful, `false` if EADDRINUSE
  - [ ] Call this check in `startDaemon` before writing PID file. If port unavailable, exit with clear error message: `Port {port} is already in use. Use cf config set server.port <port> to change.`

- [ ] 5.4 Tests for daemon lifecycle
  - [ ] Create `packages/server/tests/daemon.test.ts`
  - [ ] Test `checkPortAvailable` returns `true` for an unused port
  - [ ] Test `checkPortAvailable` returns `false` when port is occupied (bind a temp server in test)
  - [ ] Test signal handler removes PID file on SIGTERM (spawn daemon process, send SIGTERM, verify PID file removed)
  - [ ] Test daemon creates PID file on startup and removes on shutdown
  - [ ] All tests pass, build clean

**Commit**: `feat(server): implement daemon lifecycle with signal handling`

---

## Section 6: CLI `cf server` Commands

**Effort: 3/5**

- [ ] 6.1 Implement `cf server start`
  - [ ] Create `packages/cli/src/commands/server.ts`
  - [ ] `registerServerCommand(program)`: adds `server` command group with three subcommands
  - [ ] `start` subcommand:
    - Resolve server config (port, host, PID path)
    - Check for existing daemon via PID file + liveness
    - If already running: print status message and exit (not an error)
    - If stale PID: clean up and proceed
    - Spawn daemon binary (`context-forge-server`) as detached process with `stdio: 'ignore'` and `child.unref()`
    - Wait briefly (up to 3s) for PID file to appear (confirms successful start)
    - Print confirmation: `Server started (pid=XXXXX, port=3100)`
    - Support `--json` flag
  - [ ] Add `@context-forge/server` as dependency of `packages/cli`

- [ ] 6.2 Implement `cf server stop`
  - [ ] `stop` subcommand:
    - Read PID file
    - If no PID file or process dead: print "Server is not running" and exit
    - Send SIGTERM to the PID
    - Wait for PID file removal (up to 5s, poll interval 200ms)
    - If timeout: warn that process may not have stopped cleanly
    - Print confirmation: `Server stopped`
    - Support `--json` flag

- [ ] 6.3 Implement `cf server status`
  - [ ] `status` subcommand:
    - Read PID file
    - If no PID file: print "Server is not running"
    - If PID file but process dead: clean up stale file, print "Server is not running (stale PID file cleaned up)"
    - If running: print `Server running (pid=XXXXX, port=3100, host=127.0.0.1)`
    - Support `--json` flag

- [ ] 6.4 Register in CLI entry point
  - [ ] In `packages/cli/src/index.ts`, import and call `registerServerCommand(program)`
  - [ ] Place in Setup/Admin group (after `registerGuidesCommand`, before `registerInitCommand`)
  - [ ] Build clean

- [ ] 6.5 Tests for CLI server commands
  - [ ] Create `packages/cli/tests/server.test.ts` (or integration test that spawns `cf server`)
  - [ ] Test `cf server start` launches daemon and creates PID file
  - [ ] Test `cf server status` reports running state after start
  - [ ] Test `cf server stop` terminates daemon and removes PID file
  - [ ] Test `cf server status` reports not running after stop
  - [ ] Test `cf server start` when already running prints status without error
  - [ ] Test stale PID file is cleaned up on `cf server start`
  - [ ] All tests pass, build clean

**Commit**: `feat(cli): add cf server start/stop/status commands`

---

## Section 7: Logging

**Effort: 1/5**

- [ ] 7.1 Implement daemon file logger
  - [ ] Create `packages/server/src/logger.ts`
  - [ ] `createDaemonLogger(logPath: string)`: returns a `log(message: string)` function that appends timestamped lines to the log file
  - [ ] Log format: `[ISO8601] message\n`
  - [ ] Simple size-based rotation: if file exceeds 1MB before writing, rename to `.1` (overwriting any existing backup), then create fresh file
  - [ ] Wire into `daemon.ts` — replace any `console.error` calls with the file logger
  - [ ] Build clean

- [ ] 7.2 Tests for daemon logger
  - [ ] Create `packages/server/tests/logger.test.ts`
  - [ ] Test log writes timestamped lines to file
  - [ ] Test rotation: write >1MB, verify backup created and current file reset
  - [ ] All tests pass, build clean

**Commit**: `feat(server): add daemon file logger with rotation`

---

## Section 8: Full Build, Verification, and Final Commit

**Effort: 1/5**

- [ ] 8.1 Full build and test
  - [ ] `npm run build` — clean across all packages
  - [ ] `npm run test` — all packages pass
  - [ ] No regressions in core, CLI, or MCP test suites

- [ ] 8.2 Verification walkthrough
  - [ ] Follow the verification steps in the slice design's Verification Walkthrough section
  - [ ] Confirm: start, status, double-start, stop, status-after-stop, PID cleanup, JSON output, port config, stale PID recovery, existing stdio MCP unchanged
  - [ ] Update slice design verification walkthrough with actual results

- [ ] 8.3 Update slice and plan status
  - [ ] Mark slice 221 status as `complete` in frontmatter
  - [ ] Check off slice 221 entry in `220-slices.event-driven-pipeline.md`

**Commit**: `docs: complete 221 slice verification walkthrough`

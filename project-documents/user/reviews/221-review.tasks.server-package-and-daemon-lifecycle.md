---
docType: review
layer: project
reviewType: tasks
slice: server-package-and-daemon-lifecycle
project: squadron
verdict: CONCERNS
sourceDocument: project-documents/user/tasks/221-tasks.server-package-and-daemon-lifecycle.md
aiModel: minimax/minimax-m2.7
status: addressed
dateCreated: 20260331
dateUpdated: 20260331
---

# Review: tasks — slice 221

**Verdict:** CONCERNS
**Model:** minimax/minimax-m2.7

## Findings

### [CONCERN] Circular dependency between daemon.ts and logger.ts

Section 5.1 task requires wiring the logger into `daemon.ts` ("Wire into `daemon.ts` — replace any `console.error` calls with the file logger"), but Section 7 implements the logger. This creates a sequencing issue: how can daemon.ts be implemented with logger wiring before the logger exists? The tasks should be reordered so logging implementation (Section 7) precedes daemon module implementation (Section 5.1), or Section 7 should be merged into Section 5 as part of daemon implementation.

### [CONCERN] Missing log path validation in config.ts

Section 4.1 creates `resolveServerConfig()` returning `{ port, host, pidPath, logPath }` but only validates port (1024-65535). The slice design (decision 8) specifies logs go to `~/.config/context-forge/server.log`. There's no validation that the log path is writable or that the directory exists. A task should be added to ensure the log directory is created on daemon startup if it doesn't exist.

### [CONCERN] JSON output tests not explicitly specified

Tasks 6.1, 6.2, and 6.3 mention `--json` flag support but task 6.5 (CLI tests) does not include explicit tests for JSON output. The slice design's functional requirements state: "`--json` flag on all three subcommands produces machine-readable output." This is a success criterion without a corresponding test task.

### [CONCERN] Verification walkthrough incomplete in task 8.2

Task 8.2 references "Follow the verification steps in the slice design's Verification Walkthrough section" but the verification includes step 12: verifying existing stdio MCP still works. This is a critical regression check but isn't explicitly called out as a separate task item. It should be explicitly listed: "Test that existing stdio MCP behavior is unchanged via `echo '...' | npx context-forge-mcp`."

### [CONCERN] Task 5.1 is too large — multiple responsibilities

Task 5.1 "Implement daemon module" combines: creating server via factory, writing PID file, registering signal handlers, logging setup, and "keeping process alive." Each of these is a distinct concern. Consider splitting into:
- 5.1: Basic daemon start/shutdown (factory + PID write)
- 5.2: Signal handler registration (separate task)
- 5.3: Port availability check
- (Section 7 becomes 5.4: Logger integration)

### [CONCERN] Port availability check missing from daemon tests

Task 5.3 implements `checkPortAvailable()` and task 5.4 specifies tests for daemon lifecycle, but task 5.4's test list does not include verifying the port availability check behavior. The test list in 5.4 covers `checkPortAvailable` but only for successful/failed port binding — not for the error path where daemon exits with clear message when port is in use.

### [PASS] Success criteria coverage is complete

All functional requirements from the slice design map to tasks:
- `cf server start` → Section 6.1
- Double-start handling → Section 6.1
- `cf server stop` → Section 6.2
- `cf server status` → Section 6.3
- Stale PID cleanup → Section 3.1 (`cleanStalePidFile`)
- Port conflict detection → Section 5.3
- Config port change → Sections 4.1 and 4.2
- JSON flag → mentioned in 6.1, 6.2, 6.3

### [PASS] Server factory extraction is well-scoped

Section 1 properly extracts the factory from `packages/mcp-server/src/index.ts` into `serverFactory.ts`, updates `index.ts` to use it, and adds the export. Existing behavior preservation is tested in 1.4.

### [PASS] PID utilities are appropriately granular

Section 3 breaks down PID operations into individually testable functions (`writePidFile`, `readPidFile`, `isProcessRunning`, `removePidFile`, `cleanStalePidFile`). Tests cover edge cases including stale file handling.

### [PASS] Commit distribution is well-spread

Commits are distributed across all 8 sections, not batched at the end. Each section ends with a meaningful commit message.

### [PASS] Test-with pattern is followed

Each implementation section (1-7) has a corresponding test task immediately following it, satisfying the test-after pattern requirement.

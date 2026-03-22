---
docType: review
reviewType: slice
slice: server-package-and-daemon-lifecycle
project: squadron
verdict: CONCERNS
dateCreated: 20260322
dateUpdated: 20260322
---

# Review: slice — slice 221

**Verdict:** CONCERNS
**Model:** claude-sonnet-4-6

## Findings

### [CONCERN] Slice 221 is not a delivery artifact of Architecture 160

Slice 221 declares `parent: user/architecture/220-slices.event-driven-pipeline.md` and its entire purpose (daemon lifecycle, HTTP transport foundation, PID management) maps directly to the "Daemon lifecycle" slice described in `220-arch.event-driven-pipeline.md §Anticipated Slices`. Architecture 160 is about *project workflow awareness* — schema standardization, artifact introspection, workflow navigation, and the config system. Slice 221 delivers none of those goals.

The evaluation request names `architecture/160.md` as the parent document, but the file does not exist under that exact name; the closest match (`160-arch.project-workflow-system.md`) is a completely different initiative. This likely represents either a mis-specified review request or a bookkeeping error in the slice's lineage. **The slice is correctly parented to 220, not 160.** If 160 was the intended parent, the design scope is entirely wrong. If 220 was intended (which all evidence supports), the review target should be corrected.

---

### [FAIL] Undeclared cross-architecture dependency on 160's Config System

The slice uses `cf config set server.port <port>` and `cf config set server.host <host>` (§Technical Decisions, Decision 7), and its daemon entry point calls `resolveServerConfig()` which reads these config keys. The persistent, two-tier TOML config system that makes `cf config set` work is defined in architecture 160 (§Anticipated Slices: "Config System") — it is not part of arch 220 at all.

The slice front matter lists `dependencies: []`, which is incorrect. The config system slice (wherever it lands in the 160 initiative's slice plan) is a hard prerequisite: if `cf config set server.port` doesn't persist values, the daemon cannot read a user-configured port at startup. This is a hidden dependency that could block implementation or cause a silent degradation (falling back to defaults with no error) if the config system isn't in place first.

**Required action:** Add the config system slice from architecture 160 to `dependencies`. If the config system is not yet implemented, note that `server.port` and `server.host` must fall back gracefully to defaults rather than calling an unimplemented config API.

---

### [CONCERN] Config keys live in a different architecture's namespace with no boundary acknowledgment

Architecture 160 defines config as a "two-tier TOML system" with user-level and project-level resolution, originally scoped to "workflow preferences" (default project, guide behavior, methodology settings). Slice 221 adds `server.port` and `server.host` as new config keys in that system — infrastructure concerns, not workflow concerns — without acknowledging that this extends 160's config namespace into a new domain.

This isn't necessarily wrong (a general config system should be extensible), but it should be stated explicitly: slice 221 *depends on and extends* the config system from architecture 160. The architecture doc for 160 should be updated (or a note added here) to reflect that the config system serves both workflow preferences and server infrastructure settings. Otherwise the namespace growth is invisible to maintainers of either initiative.

---

### [CONCERN] Port pre-check is redundant and will be orphaned by Slice 222

Decision 7 states: "On startup, the daemon attempts to bind a temporary socket to the configured port. If it fails (EADDRINUSE), exit with a clear error message." It then immediately notes: "In slice 222, the actual HTTP server replaces this check — the listen call itself detects conflicts."

This means the temporary socket bind is a one-slice workaround that is deleted in the very next slice. The risk is:
1. It adds code complexity that is intentionally temporary — cleanup is easy to forget.
2. A race condition exists between releasing the temporary socket and `httpServer.listen()` in slice 222 (TOCTOU on port availability).
3. In this slice, the daemon has no transport at all. Port conflict detection is only meaningful once HTTP is wired. The check is premature.

**Recommendation:** Remove the temporary socket check from slice 221. Let the daemon start and write its PID file; port conflict detection can live entirely in slice 222 where it belongs. The keep-alive `setInterval` already covers the "daemon runs but has no transport yet" state.

---

### [CONCERN] `require.resolve` for binary path is ESM-incompatible

Decision 8 states the daemon binary is resolved via `require.resolve('@context-forge/server')`. The slice also declares the package uses **ESM** ("TypeScript, ESM, same build setup as other packages"). In native ESM, `require` is not available — `require.resolve` will throw at runtime. The equivalent in ESM is `import.meta.resolve(...)` (Node ≥ 20.6 with `--experimental-import-meta-resolve`) or constructing the path via `fileURLToPath(new URL(..., import.meta.url))`.

This is an implementation-level issue but worth flagging before coding begins because it affects how `cf server start` locates the daemon binary.

---

### [PASS] Alignment with Architecture 220's core principles

Against the *actual* parent architecture (220), the slice is well-aligned:

- **"Transport is plumbing, not architecture"** — The server factory is extracted specifically to keep the `McpServer` transport-agnostic. Tools are registered identically regardless of which transport connects. ✓
- **"Daemon lifecycle is explicit"** — `cf server start/stop/status` gives users full control; no implicit background processes. ✓
- **"Zero-disruption adoption"** — Existing stdio behavior is explicitly preserved; the factory refactor is non-breaking. ✓
- **"Local-first security model"** — Default host `127.0.0.1`, no auth in this slice (deferred to 223). ✓

---

### [PASS] Scope boundary with downstream slices is clean

The slice correctly defers HTTP transport to 222, authentication to 223, storage events to 224, and notifications to 225. The "keep-alive with `setInterval`" as a placeholder for `httpServer.listen()` is a pragmatic and explicitly acknowledged temporary measure. The integration contract for 222 (`// No transport connected yet — slice 222 adds HTTP here`) is clear. No scope creep into downstream slices is detectable.

---

### [PASS] Stale PID and double-start handling is correct

The PID liveness check via `process.kill(pid, 0)` is the standard Unix idiom. Stale PID cleanup on `cf server start` (rather than requiring manual intervention) is the right UX. The idempotent `cf server start` behavior (already running → print status, no error) matches the 220 architecture's "zero-disruption" principle. The 5-second shutdown timeout as a fallback prevents hung processes.

---
docType: guide
scope: agent-integration
audience: [ai-agent-developers]
dateCreated: 20260325
dateUpdated: 20260325
---

# AI Agent Integration Guide

How to integrate with Context Forge from an AI agent, orchestrator, or CI pipeline.

## Integration Paths (in order of preference)

1. **MCP server** — structured tool calls with built-in schema validation. Best for agents running in MCP-compatible environments (Claude Code, Cursor, etc.).
2. **CLI with `--json`** — structured JSON output on stdout, JSON errors on stderr. Best for shell-based agents and pipelines.
3. **CLI text parsing** — last resort. Human-readable output is not a stable contract.

## Command Discovery

```bash
cf help --json
```

Returns a complete command catalog generated from Commander's runtime state. The catalog is always in sync with the actual registered commands — no static maintenance.

## Breaking Change Detection

```bash
cf version --json
```

Returns `{ name, version, guideVersion, breaking }`. The `breaking` array contains descriptors of breaking changes since the last minor version bump. If your agent caches command names or arguments, check this array after version bumps:

```json
{ "since": "0.6.20", "change": "cf slice list → cf list slices" }
```

## Error Handling

Set `CF_JSON=1` or pass `--json` (on commands that support it) to get structured errors on stderr:

```json
{ "error": true, "code": "INVALID_ARGUMENT", "message": "...", "suggestion": "..." }
```

**Error codes:** `PROJECT_NOT_FOUND`, `FIELD_NOT_FOUND`, `INVALID_ARGUMENT`, `INVALID_VALUE`, `MISSING_CONFIG`, `ARTIFACT_NOT_FOUND`, `READ_ONLY`, `ALREADY_EXISTS`.

## Idempotency

State-mutating commands (`cf set`) are idempotent. Setting a field to its current value prints "already set" to stderr and exits 0 without writing. Safe to retry without side effects.

## MCP Quick Start

For MCP-connected agents, call `agent_quickstart` to get a structured capability schema with tool groupings, a quickstart sequence, and CLI equivalents. For human-supervised sessions, use `agent_onboard` to get step-by-step project setup instructions.

## CLI vs MCP: When to Use Which

| Use Case | Recommended |
|----------|-------------|
| Data operations (CRUD, queries) | MCP tools |
| Context building for sessions | CLI `cf build --json` or MCP `context_build` |
| Workflow methodology (slash commands) | CLI slash commands (`/cf:build`, `/cf:slice`) |
| CI/CD pipelines | CLI with `--json` + `CF_JSON=1` |
| Schema discovery | CLI `cf help --json` or MCP tool schemas |

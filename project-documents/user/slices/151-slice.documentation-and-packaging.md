---
docType: slice-design
slice: documentation-and-packaging
project: context-forge
parent: user/architecture/140-slices.context-forge-restructure.md
dependencies: [150-mcp-integration-test]
interfaces: []
status: complete
dateCreated: 20260223
dateUpdated: 20260223
---

# Slice 151: Documentation and Packaging

## Overview

This slice prepares Context Forge for public consumption. It creates the README documentation for the `context-forge-mcp` package (the primary adoption surface), updates the root README to reflect the current state of the project, creates a minimal `@context-forge/core` README, and configures npm publishing metadata for both packages.

The MCP server README is the most important deliverable — it's what developers see when they find `context-forge-mcp` on npm or GitHub, and it needs to clearly communicate what the tool does, how to install it, and how to configure it with Claude Code and Cursor.

## Value

- **Adoption-ready MCP server**: Developers can discover `context-forge-mcp` on npm and configure it in under 2 minutes
- **Accurate project documentation**: Root README reflects the actual state of the monorepo (slices 140-150 complete, MCP server functional, 8 tools available)
- **Publishable packages**: Both `context-forge-mcp` and `@context-forge/core` have correct npm metadata so publishing is a single command

## Technical Scope

### In Scope

1. **`packages/mcp-server/README.md`** — New file, primary deliverable
2. **`packages/core/README.md`** — New file, contributor/developer-oriented
3. **Root `README.md`** — Update existing file to reflect current state
4. **`docs/TOOLS.md`** — Detailed tool reference (linked from mcp-server README)
5. **`packages/mcp-server/package.json`** — npm publishing metadata
6. **`packages/core/package.json`** — npm publishing metadata

### Out of Scope

- Actual npm publishing (separate operational step)
- GitHub Actions / CI pipeline for automated publishing
- Electron packaging or distribution
- Changelog generation tooling

## Dependencies

### Prerequisites

- All 8 MCP tools implemented and tested (Slices 145-150 complete)
- Core extraction complete with 224 tests passing
- MCP server has 56 tests (31 unit + 25 integration)

### Interfaces Required

None — this is a terminal slice with no downstream dependencies.

---

## Architecture

### Document Structure

```
README.md                          ← Root: project overview + monorepo guide
packages/
  mcp-server/
    README.md                      ← Primary: installation, MCP config, tool overview
    package.json                   ← Updated: publishing metadata
  core/
    README.md                      ← Secondary: contributor/developer reference
    package.json                   ← Updated: publishing metadata
docs/
  TOOLS.md                         ← Detailed tool reference with parameters
```

### Content Flow

The root README introduces Context Forge and points readers to the package they need:
- **MCP-only developers** → `packages/mcp-server/README.md` (linked prominently)
- **Desktop users** → Electron app section (existing, updated)
- **Contributors/developers** → Architecture section + `packages/core/README.md`

The MCP server README is self-contained for its audience — a developer should be able to go from "what is this?" to "working MCP configuration" without leaving that page. The `docs/TOOLS.md` file provides the full parameter reference for users who want detail beyond the README overview.

---

## Technical Decisions

### 1. MCP Server README as Primary Adoption Surface

The architecture document identifies the MCP-only developer as the primary adoption path: "installs `context-forge-mcp`, adds to MCP config, never touches Electron." The README must serve this persona end-to-end.

**Structure:**
1. One-line description + what it does (not how it works internally)
2. Why you'd want it — the problem it solves, stated concretely
3. Quick start — install + configure for Claude Code (the most common case)
4. Configuration for other clients (Cursor, generic MCP)
5. Tool overview — what the 8 tools do, with brief descriptions
6. Link to detailed tool reference (`docs/TOOLS.md`)
7. Requirements (Node.js version, `ai-project-guide` dependency)
8. Related: link to desktop app, core package, ai-project-guide

**Tone**: Informative and readable — not a terse man page. A developer skimming the README should understand the value proposition within 30 seconds. Examples should be concrete and copy-pasteable.

### 2. Tool Reference in Separate File

The 8 tools with their full parameter schemas would make the README too long. The README includes a concise overview table; `docs/TOOLS.md` has the full reference with parameter names, types, descriptions, and usage examples.

### 3. Core README — Developer/Contributor Focus

`@context-forge/core` is an internal package that powers both the MCP server and the Electron app. Its README targets contributors and developers building on core, not end users. Content:
- What it contains (context engine, project store, template processing)
- Two export paths (`.` for types, `./node` for Node.js implementations)
- Key services and their roles
- How it fits in the monorepo

### 4. Root README Update Strategy

The current root README has several outdated statements:
- Says MCP server is "scaffolded, not yet functional" — it has 8 working tools and 56 tests
- "In progress" lists storage migration as ongoing — it's complete
- "Planned" lists MCP context tools as future — they're implemented

The update preserves the existing structure and tone but corrects these statements and adds a prominent pointer to the MCP server for developers who want CLI/agent access.

### 5. npm Publishing Configuration

Both packages need metadata updates before they can be published:

**`context-forge-mcp` (packages/mcp-server/package.json):**
- Remove `"private": true`
- Add: `description`, `keywords`, `repository`, `homepage`, `license`, `author`
- Add: `engines` (Node.js version requirement)
- Add: `files` array (controls what gets published — `dist/`, `README.md`)

**`@context-forge/core` (packages/core/package.json):**
- Remove `"private": true`
- Add: `description`, `keywords`, `repository`, `homepage`, `license`, `author`
- Add: `engines` (Node.js version requirement)
- Add: `files` array (`dist/`, `README.md`)

Root `package.json` stays `"private": true` (workspace root, not published).

### 6. Node.js Engine Requirement

Both packages target ES2023 (`tsconfig.json` `"target": "ES2023"`). The minimum Node.js version for ES2023 support is **Node.js 18**. Set `"engines": { "node": ">=18.0.0" }` in both packages.

---

## Implementation Details

### MCP Server README Content Outline

```markdown
# context-forge-mcp

One-line: MCP server that generates structured context prompts for AI coding sessions.

## What is this?
- Context Forge assembles project-aware context prompts from templates and configuration
- This MCP server exposes that engine to Claude Code, Cursor, and any MCP-compatible tool
- Configure your project once, then generate fresh context whenever you start a session

## Why?
- Every AI session benefits from structured context (conventions, current task, project state)
- Building context by hand is tedious and error-prone
- Context Forge automates it: template + project config → ready-to-use prompt

## Quick Start

### Install
  npx context-forge-mcp              (run directly)
  npm install -g context-forge-mcp   (global install)

### Configure for Claude Code
  JSON config example for claude_desktop_config.json / settings

### Configure for Cursor
  JSON config example for Cursor MCP settings

## Available Tools
  Table: tool name | description (one line each)
  Link to docs/TOOLS.md for full reference

## Requirements
  Node.js 18+, ai-project-guide templates

## Related
  Links to desktop app, core package, ai-project-guide
```

### Tool Reference (docs/TOOLS.md) Content Outline

For each of the 8 tools:
- Tool name and title
- Description
- Parameters (name, type, required/optional, description)
- Example usage scenario

Tools to document:
1. `project_list` — List all projects (no params)
2. `project_get` — Get full project details (`id`)
3. `project_update` — Update project fields (`id` + optional fields)
4. `context_build` — Generate context prompt (`projectId` + optional overrides)
5. `template_preview` — Preview context without side effects (`projectId` + optional overrides)
6. `prompt_list` — List available prompt templates (`projectId`)
7. `prompt_get` — Get specific template content (`projectId`, `templateName`)
8. `context_summarize` — Update project session state (`projectId`, `summary`, optional `additionalNotes`)

### package.json Updates

**packages/mcp-server/package.json additions:**
```json
{
  "private": false,
  "description": "MCP server for Context Forge — generates structured AI context prompts from project configuration and templates",
  "keywords": ["mcp", "context", "ai", "claude", "cursor", "prompt", "context-forge"],
  "repository": {
    "type": "git",
    "url": "https://github.com/ecorkran/context-forge.git",
    "directory": "packages/mcp-server"
  },
  "homepage": "https://github.com/ecorkran/context-forge/tree/main/packages/mcp-server#readme",
  "license": "MIT",
  "author": "Erik Corkran",
  "engines": { "node": ">=18.0.0" },
  "files": ["dist", "README.md"]
}
```

**packages/core/package.json additions:**
```json
{
  "private": false,
  "description": "Core context generation engine for Context Forge — template processing, project state, prompt assembly",
  "keywords": ["context-forge", "context", "ai", "template", "prompt"],
  "repository": {
    "type": "git",
    "url": "https://github.com/ecorkran/context-forge.git",
    "directory": "packages/core"
  },
  "homepage": "https://github.com/ecorkran/context-forge/tree/main/packages/core#readme",
  "license": "MIT",
  "author": "Erik Corkran",
  "engines": { "node": ">=18.0.0" },
  "files": ["dist", "README.md"]
}
```

### Root README Updates

Changes to make (preserving existing structure):

1. **Architecture section**: Change "scaffolded, not yet functional" → describe MCP server as functional with 8 tools
2. **Current State section**:
   - Move MCP items from "In progress" / "Planned" → "What works"
   - Update "In progress" to reflect actual current state (documentation and packaging)
3. **Add MCP pointer**: After the "What Context Forge Does" section, add a brief callout directing CLI/agent users to the MCP server README
4. **Quick Start**: Add a brief MCP quick-start alternative alongside the Electron quick-start

---

## Success Criteria

### Functional
- `packages/mcp-server/README.md` exists with installation, Claude Code config, Cursor config, tool overview, and requirements
- `packages/core/README.md` exists with package description, export paths, and key services
- `docs/TOOLS.md` exists with full parameter reference for all 8 tools
- Root `README.md` accurately reflects current project state (no outdated "scaffolded" / "planned" references)

### Technical
- `packages/mcp-server/package.json` has `"private": false` and all publishing metadata fields
- `packages/core/package.json` has `"private": false` and all publishing metadata fields
- `pnpm build` passes cleanly (no regressions from metadata changes)
- `pnpm test` passes cleanly (no regressions)

### Integration
- MCP config JSON examples in README are valid and copy-pasteable
- All links between documents resolve correctly (root README → mcp-server README → docs/TOOLS.md)

---

## Implementation Notes

### Development Approach

Work sequentially: tool reference first (provides content for the README), then MCP server README, then core README, then root README update, then package.json updates. Build and test verification at the end.

### Documentation Tone

The MCP server README is the public face of the project for developers. It should:
- Lead with what the tool does and why it's useful, not implementation details
- Use concrete examples (actual JSON config, actual tool names)
- Be scannable — a developer should find what they need in under 60 seconds
- Avoid jargon where possible; explain MCP briefly for developers who haven't encountered it
- Not read like a terse man page — be informative and approachable

### ai-project-guide Dependency

The README must clearly state that Context Forge requires `ai-project-guide` templates to be set up in the target project. This is a genuine prerequisite that a new user would need to know. Link to the ai-project-guide repo and bootstrap instructions.

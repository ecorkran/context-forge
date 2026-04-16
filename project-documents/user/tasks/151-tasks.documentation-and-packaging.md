---
slice: documentation-and-packaging
project: context-forge
lld: user/slices/151-slice.documentation-and-packaging.md
dependencies: [150-mcp-integration-test]
projectState: Slices 140-150 complete. Monorepo restructure done. Core has 224 tests, MCP server has 56 tests (31 unit + 25 integration), Electron has 106 tests. All 8 MCP tools implemented and tested. No package READMEs exist. Both packages have "private":true. Root README is outdated (says MCP server is "scaffolded, not yet functional").
dateCreated: 20260223
dateUpdated: 20260223
status: complete
docType: tasks
---

## Context Summary

- Working on documentation-and-packaging slice (151)
- All prerequisites complete: full MCP server with 8 tools, core extraction, integration tests
- No READMEs exist for `packages/mcp-server/` or `packages/core/`
- Root README has outdated statements about MCP server status and project state
- Both package.json files have `"private": true` and lack publishing metadata
- This slice delivers: MCP server README (primary), core README, tool reference doc, root README update, npm publishing config
- Next: this is the final slice in the 140-series restructure plan

---

## Tasks

### Phase 1: Tool Reference Documentation

- [x] **Task 1: Create `docs/TOOLS.md` — full tool reference** (Effort: 2/5)
  - Create `docs/TOOLS.md` with detailed parameter reference for all 8 MCP tools
  - For each tool, document: name, title, description, parameters table (name, type, required/optional, description), and a brief usage scenario
  - Tool order: `project_list`, `project_get`, `project_update`, `context_build`, `template_preview`, `prompt_list`, `prompt_get`, `context_summarize`
  - Source tool descriptions and parameter schemas from `packages/mcp-server/src/tools/` source files (do not guess — read the actual registrations)
  - [x] All 8 tools documented with complete parameter tables
  - [x] Descriptions match the actual tool registration descriptions in source
  - [x] File is valid markdown with consistent formatting

- [x] **Task 2: Commit — tool reference** (Effort: 1/5)
  - Stage `docs/TOOLS.md`
  - Verify `pnpm build` passes
  - [x] Clean commit with descriptive message

### Phase 2: MCP Server README

- [x] **Task 3: Create `packages/mcp-server/README.md`** (Effort: 3/5)
  - Create the primary adoption-facing README per the slice design content outline
  - Sections (in order):
    1. **Title + one-liner**: `context-forge-mcp` — MCP server that generates structured context prompts for AI coding sessions
    2. **What is this?**: What Context Forge does and how this MCP server exposes it (3-4 sentences, approachable)
    3. **Why?**: The problem it solves — context assembly is tedious, error-prone, and breaks flow (concrete, not abstract)
    4. **Quick Start — Install**: `npx context-forge-mcp` and `npm install -g context-forge-mcp`
    5. **Quick Start — Configure for Claude Code**: Copy-pasteable JSON config for `claude_desktop_config.json`
    6. **Quick Start — Configure for Cursor**: Copy-pasteable JSON config for Cursor MCP settings
    7. **Available Tools**: Overview table with tool name and one-line description for each of the 8 tools. Link to `docs/TOOLS.md` for full reference
    8. **Prerequisites**: Node.js 18+, `ai-project-guide` templates (link to repo + bootstrap command)
    9. **Related**: Links to desktop app (Electron), core package, ai-project-guide repo
    10. **License**: MIT
  - Tone: informative and readable, not a terse man page. A developer skimming should understand the value in 30 seconds
  - MCP config JSON examples must be valid and copy-pasteable
  - [x] README exists at `packages/mcp-server/README.md`
  - [x] Contains all 10 sections listed above
  - [x] Claude Code and Cursor config examples are valid JSON
  - [x] Tool overview table lists all 8 tools
  - [x] Links to `docs/TOOLS.md` for detailed reference
  - [x] Mentions ai-project-guide dependency with link and bootstrap command

- [x] **Task 4: Commit — MCP server README** (Effort: 1/5)
  - Stage `packages/mcp-server/README.md`
  - [x] Clean commit with descriptive message

### Phase 3: Core Package README

- [x] **Task 5: Create `packages/core/README.md`** (Effort: 2/5)
  - Create a developer/contributor-focused README for `@context-forge/core`
  - Sections:
    1. **Title + one-liner**: `@context-forge/core` — context generation engine for Context Forge
    2. **Overview**: What the package contains (context pipeline, project store, template processing, prompt parsing)
    3. **Export paths**: Document the two entry points: `.` (types and interfaces) and `./node` (Node.js implementations like `FileProjectStore`, `createContextPipeline`, `SystemPromptParser`)
    4. **Key services**: Brief description of major classes/functions (not API docs — just orientation for contributors)
    5. **Usage in the monorepo**: How MCP server and Electron both depend on core
    6. **License**: MIT
  - Tone: concise and technical — audience is developers reading source, not end users
  - [x] README exists at `packages/core/README.md`
  - [x] Documents both export paths with examples
  - [x] Lists key services with brief descriptions
  - [x] Explains monorepo role

- [x] **Task 6: Commit — core README** (Effort: 1/5)
  - Stage `packages/core/README.md`
  - [x] Clean commit with descriptive message

### Phase 4: Root README Update

- [x] **Task 7: Update root `README.md`** (Effort: 2/5)
  - Update the existing root README to reflect current project state (slices 140-150 complete)
  - Specific changes:
    1. **Architecture section**: Change `context-forge-mcp — MCP server (scaffolded, not yet functional)` → describe as functional with 8 tools and link to its README
    2. **Add MCP callout**: After "What Context Forge Does" section, add a brief paragraph directing CLI/agent users to the MCP server package (with link)
    3. **Current State — "What works"**: Add MCP server items (8 tools, project management, context generation via MCP)
    4. **Current State — "In progress"**: Remove storage migration (complete). Remove MCP server implementation (complete). Update to reflect actual current state (documentation and packaging)
    5. **Current State — "Planned"**: Remove MCP context tools (implemented). Update with actual planned items (npm publishing, CI/CD)
    6. **Quick Start**: Add a brief MCP alternative alongside Electron quick-start (e.g., "For CLI/agent use: `npx context-forge-mcp`")
  - Preserve existing structure, tone, and content that is still accurate
  - Do not change sections that don't need updating (Problem, dependency, Tech Stack, Contributing, License)
  - [x] No references to MCP server being "scaffolded" or "not yet functional"
  - [x] "What works" includes MCP server
  - [x] "In progress" and "Planned" reflect actual current state
  - [x] MCP callout with link to mcp-server README is present
  - [x] Quick Start includes MCP alternative

- [x] **Task 8: Commit — root README update** (Effort: 1/5)
  - Stage `README.md`
  - [x] Clean commit with descriptive message

### Phase 5: npm Publishing Configuration

- [x] **Task 9: Update `packages/mcp-server/package.json` — publishing metadata** (Effort: 1/5)
  - Remove `"private": true` (or set to `false`)
  - Add the following fields per slice design:
    - `description`: MCP server description
    - `keywords`: `["mcp", "context", "ai", "claude", "cursor", "prompt", "context-forge"]`
    - `repository`: `{ "type": "git", "url": "https://github.com/ecorkran/context-forge.git", "directory": "packages/mcp-server" }`
    - `homepage`: link to mcp-server README on GitHub
    - `license`: `"MIT"`
    - `author`: `"Erik Corkran"`
    - `engines`: `{ "node": ">=18.0.0" }`
    - `files`: `["dist", "README.md"]`
  - [x] `"private"` field removed or set to `false`
  - [x] All metadata fields present and correct
  - [x] `pnpm build` passes
  - [x] `pnpm test` passes in `packages/mcp-server`

- [x] **Task 10: Update `packages/core/package.json` — publishing metadata** (Effort: 1/5)
  - Remove `"private": true` (or set to `false`)
  - Add the following fields per slice design:
    - `description`: Core engine description
    - `keywords`: `["context-forge", "context", "ai", "template", "prompt"]`
    - `repository`: `{ "type": "git", "url": "https://github.com/ecorkran/context-forge.git", "directory": "packages/core" }`
    - `homepage`: link to core README on GitHub
    - `license`: `"MIT"`
    - `author`: `"Erik Corkran"`
    - `engines`: `{ "node": ">=18.0.0" }`
    - `files`: `["dist", "README.md"]`
  - [x] `"private"` field removed or set to `false`
  - [x] All metadata fields present and correct
  - [x] `pnpm build` passes
  - [x] `pnpm test` passes in `packages/core`

- [x] **Task 11: Commit — package.json publishing metadata** (Effort: 1/5)
  - Stage both `packages/mcp-server/package.json` and `packages/core/package.json`
  - [x] Clean commit with descriptive message

### Phase 6: Verification and Finalization

- [x] **Task 12: Full verification** (Effort: 1/5)
  - Run `pnpm build` from workspace root — clean build
  - Run `pnpm test` from workspace root — all tests pass
  - Verify all cross-document links resolve:
    - Root README → `packages/mcp-server/README.md`
    - MCP server README → `docs/TOOLS.md`
    - MCP server README → ai-project-guide repo
    - Core README exists and is referenced from root
  - Verify MCP config JSON examples are valid (parseable JSON)
  - [x] Workspace builds clean
  - [x] All tests pass
  - [x] All document links are correct

- [x] **Task 13: DEVLOG update and final commit** (Effort: 1/5)
  - Update `DEVLOG.md` with slice 151 completion entry
  - List commits from this slice (hash + short description)
  - Match existing DEVLOG format
  - [x] DEVLOG updated with slice 151 entry
  - [x] Clean final commit
  - [x] All tests pass

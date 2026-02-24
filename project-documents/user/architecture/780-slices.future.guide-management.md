# Future Slices: Config System & Guide Management

These slices extend the 140-band initiative. They follow slice 12 (Documentation and Packaging) and can be worked sequentially. Suggested indices: 153-155 (leaving room for other work).

---

## Slice 780: Config System

### Overview

Add a persistent configuration system to Context Forge, following the same pattern as orchestration's config manager. Two-tier config: user-level (`~/.config/context-forge/config.toml`) and project-level (`.context-forge.toml` in project root). CLI-style access via MCP tool.

### Value

- Eliminates repetitive parameter passing across MCP tool calls
- Enables preference persistence (auto-update behavior, guide install options, default project)
- Consistent UX with orchestration CLI — developers learn one config pattern for both tools
- Foundation for all subsequent features that need configurable behavior

### Technical Scope

**New MCP tools:**
- `config_set` — Set a config value (user or project level)
- `config_get` — Get resolved value with source indication
- `config_list` — Show all config keys with values and sources

**Config resolution precedence:** MCP tool parameter → project config → user config → built-in default

**Initial config keys:**

| Key | Type | Default | Description |
|---|---|---|---|
| `guide.auto_update` | `boolean` | `false` | Auto-update ai-project-guide files on MCP server start |
| `guide.git_strategy` | `string` | `"ignore"` | How to handle guide files in git: `"ignore"` adds to .gitignore, `"commit"` leaves them tracked |
| `guide.source` | `string` | `"github"` | Where to pull guide files from: `"github"` (default), or a custom URL |
| `default_project` | `string` | `null` | Default project ID for tools that accept projectId |

**Implementation:**
- New `packages/core/src/config/` module: `ConfigManager`, `ConfigKeys` (typed key definitions with defaults)
- TOML for config files (human-editable, supports comments) — use a lightweight TOML parser (e.g., `smol-toml`, zero-dependency)
- Config storage at `~/.config/context-forge/config.toml` (same base dir as project storage, via `env-paths`)
- Project-level config at `{projectPath}/.context-forge.toml`

**Dependencies:** None (builds on existing core infrastructure)
**Effort:** 2/5

---

## Slice 781: Bundled Prompt System & Guide Install

### Overview

Bundle the `prompt.ai-project.system.md` file into `@context-forge/core` so the MCP server works out of the box without ai-project-guide being present. Add a `guide_install` MCP tool that downloads the full ai-project-guide into the user's project directory on request.

### Value

- **Zero-config first run**: `npx @context-forge/mcp` generates useful context immediately — no bootstrap step, no submodule, no curl
- **Progressive adoption**: Users experience context assembly value first, then opt into the full methodology when ready
- **Reduced friction**: The #1 adoption barrier (needing to set up ai-project-guide before Context Forge does anything) is eliminated
- **Natural discovery**: When generated prompts reference guide files that aren't present, the agent notices and suggests `guide_install`

### Technical Scope

**Bundled prompt file:**
- Copy `prompt.ai-project.system.md` into `packages/core/assets/` (included via `files` in package.json)
- Update `CoreServiceFactory.ts` / `constants.ts`: resolve prompt file with fallback chain:
  1. Project-local path (`{projectPath}/project-documents/ai-project-guide/project-guides/prompt.ai-project.system.md`)
  2. Bundled asset (resolved via `import.meta.url` or `__dirname` relative path)
- When using bundled prompt, context output includes a note: "Generated from bundled templates. Install ai-project-guide for full methodology access."

**`guide_install` MCP tool:**
- Downloads ai-project-guide from GitHub (tarball from latest release or main branch, not git clone — no submodule complexity)
- Extracts to `{projectPath}/project-documents/ai-project-guide/`
- Respects `guide.git_strategy` config:
  - `"ignore"`: Adds `project-documents/ai-project-guide/` to project's `.gitignore` (creates or appends)
  - `"commit"`: Does nothing — files are tracked normally
- Returns summary: what was installed, how many files, where
- If guide directory already exists, returns error suggesting `guide_update` instead

**`guide_status` MCP tool:**
- Reports: installed (yes/no), location, version/date if detectable, whether using bundled or local prompt file

**Dependencies:** Slice 153 (Config System) for `guide.git_strategy` resolution
**Effort:** 3/5

---

## Slice 782: Guide Update & Auto-Update

### Overview

Add `guide_update` MCP tool and auto-update capability. When enabled, the MCP server checks for guide updates on startup and pulls fresh copies automatically.

### Value

- Guides stay current without manual intervention
- Config-driven behavior — users opt in, nothing happens silently
- Orchestration/pipeline can rely on guides being up-to-date when automating the development methodology

### Technical Scope

**`guide_update` MCP tool:**
- Downloads latest ai-project-guide from GitHub (same mechanism as `guide_install`)
- Overwrites existing files in `{projectPath}/project-documents/ai-project-guide/`
- Preserves any user modifications? Decision needed:
  - **Option A (simpler):** Full replacement. If users customize, they should fork the guide repo and point `guide.source` at their fork.
  - **Option B:** Merge-aware update that skips files with local modifications (detected via checksum). More complex, probably not worth it for v1.
  - **Recommendation:** Option A. The config system's `guide.source` handles customization cleanly.
- Returns summary: files updated, previous version → new version

**Auto-update on startup:**
- When `guide.auto_update` is `true` and guides are installed, MCP server checks GitHub for newer version on startup
- Version comparison: compare commit SHA or date of last download (stored in `~/.config/context-forge/guide-metadata.json`)
- If newer version available, download and replace silently
- If download fails (network error), continue with existing files — never block startup
- Log update activity for transparency

**Rate limiting:** Check at most once per 24 hours (store last-check timestamp in metadata)

**Dependencies:** Slice 154 (Guide Install — shares download/extraction mechanism)
**Effort:** 2/5

---

## Implementation Order

```
153. Config System
  ↓
154. Bundled Prompt & Guide Install
  ↓
155. Guide Update & Auto-Update
```

Strictly sequential — each builds on the prior. Total effort: 7/5 across three slices (roughly 3-4 implementation sessions with current methodology).

## Effect on User Experience

**Before (current):**
```
# User discovers Context Forge
npx @context-forge/mcp              # install
# "Error: prompt file not found" or degraded output
# User reads README, discovers ai-project-guide dependency
pnpm setup-guides                    # or curl bootstrap
# Now it works
```

**After (with these slices):**
```
# User discovers Context Forge
npx @context-forge/mcp              # install — works immediately
# Agent generates context, notes say "bundled templates, install guide for full methodology"
# User (or agent) decides to install:
# Agent calls guide_install → done
# Later, auto-update keeps it current
```

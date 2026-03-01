---
docType: slice-plan
parent: user/architecture/140-arch.context-forge-restructure.md
project: context-forge
status: partial
dateCreated: 20260226
dateUpdated: 20260301
---

# Future Slices: Guide Management

These slices extend the 140-band initiative (Context Forge Restructure). They depend on the Config System (slice 162, complete).

---

1. [x] **(780) Config System** — Implemented as slice 162 in the 160-band initiative. *(migrated to 160-slices.project-workflow-system.md)*

2. [ ] **(781) Bundled Prompt System & Guide Install** — Bundle the `prompt.ai-project.system.md` file into `@context-forge/core` so the MCP server works out of the box without ai-project-guide being present. Add a `guide_install` MCP tool that downloads the full ai-project-guide into the user's project directory on request.

   **Value:**
   - **Zero-config first run**: `npx @context-forge/mcp` generates useful context immediately — no bootstrap step, no submodule, no curl
   - **Progressive adoption**: Users experience context assembly value first, then opt into the full methodology when ready
   - **Reduced friction**: The #1 adoption barrier (needing to set up ai-project-guide before Context Forge does anything) is eliminated
   - **Natural discovery**: When generated prompts reference guide files that aren't present, the agent notices and suggests `guide_install`

   **Technical Scope:**
   - Bundled prompt file: copy `prompt.ai-project.system.md` into `packages/core/assets/`, resolve with fallback chain (project-local → bundled asset)
   - `guide_install` MCP tool: downloads ai-project-guide from GitHub (tarball), extracts to `{projectPath}/project-documents/ai-project-guide/`, respects `guide.git_strategy` config
   - `guide_status` MCP tool: reports installed state, location, version/date, bundled vs local prompt

   **Dependencies:** Slice 162 (Config System) — complete
   **Effort:** 3/5

3. [ ] **(782) Guide Update & Auto-Update** — Add `guide_update` MCP tool and auto-update capability. When enabled, the MCP server checks for guide updates on startup and pulls fresh copies automatically.

   **Value:**
   - Guides stay current without manual intervention
   - Config-driven behavior — users opt in, nothing happens silently
   - Orchestration/pipeline can rely on guides being up-to-date

   **Technical Scope:**
   - `guide_update` MCP tool: downloads latest from GitHub, full replacement strategy (customizers point `guide.source` at their fork)
   - Auto-update on startup: when `guide.auto_update` is `true`, checks GitHub for newer version (rate-limited to once per 24 hours)
   - Never blocks startup on network failure

   **Dependencies:** Slice 781 (Guide Install — shares download/extraction mechanism)
   **Effort:** 2/5

## Implementation Order

```
781. Bundled Prompt & Guide Install
  ↓
782. Guide Update & Auto-Update
```

Sequential — 782 builds on 781's download/extraction mechanism.

## Effect on User Experience

**Before (current):**
```
npx @context-forge/mcp              # install
# "Error: prompt file not found" or degraded output
# User reads README, discovers ai-project-guide dependency
pnpm setup-guides                    # or curl bootstrap
# Now it works
```

**After (with these slices):**
```
npx @context-forge/mcp              # install — works immediately
# Agent generates context, notes say "bundled templates, install guide for full methodology"
# Agent calls guide_install → done
# Later, auto-update keeps it current
```

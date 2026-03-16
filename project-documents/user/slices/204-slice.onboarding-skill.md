---
docType: slice-design
slice: onboarding-skill
project: context-forge
parent: user/architecture/200-slices.developer-onboarding.md
dependencies: [201-project-create-mcp-tool]
interfaces: []
dateCreated: 20260315
dateUpdated: 20260315
status: not_started
---

# Slice 204: Onboarding Skill

## Overview

A markdown skill file that teaches AI agents how to guide users through Context Forge project creation and the first phase of work. Delivered via `cf install-commands` alongside existing slash commands. The skill sequences existing MCP tools and CLI commands into a conversational onboarding flow — no new runtime code beyond registering the file.

## Value

Enables fully conversational onboarding: an AI agent can take a new user from zero to "discussing their project concept" without the user needing to know any CF commands. This is the final piece of the 200-band onboarding initiative — slices 201-203 built the infrastructure (MCP project creation, smart init, first-run guidance); this slice provides the recipe that ties them together for AI-assisted setup.

## Technical Scope

**Included:**
- New skill file `onboard.md` in `packages/cli/commands/cf/`
- Registration in `commandInstaller.ts` managed files list
- Skill content covering: project detection, creation, guide installation, Phase 1 prompt transition
- CLI fallbacks for environments without MCP

**Excluded:**
- No new runtime code, MCP tools, or core library changes
- No extraction of shared defaults (deferred to dedicated extraction slice — see Future Work)
- No IDE-specific setup logic (the skill suggests `cf init` which handles IDE setup)
- No interactive wizard or multi-step CLI prompts

## Dependencies

### Prerequisites
- **201 (project_create MCP tool)** — complete. The skill references `project_create` as the primary creation path.
- **202 (Smart cf init)** — complete. The skill references `cf init` as the CLI fallback.
- **203 (Enhanced cf next)** — complete. The skill references `cf next` for post-setup guidance.

### Interfaces Required
- MCP tools: `project_list`, `project_create`, `project_get`, `guide_status`, `guide_install`, `workflow_next`, `context_build`
- CLI commands: `cf init`, `cf next`, `cf build`, `cf set`
- Prompt templates: concept phase prompt (retrievable via `context_build` or `cf build`)

## Architecture

### Skill File Pattern

Existing CF slash commands follow this structure:

```yaml
---
description: One-line description for command palette
argument-hint: [optional args]
allowed-tools: Bash(cf:*), ...
---

Instructions for the AI agent...

!`cf command $ARGUMENTS`
```

The onboarding skill differs from typical slash commands:
- It's **multi-step** (detect → create → install → transition) rather than a single command wrapper
- It references **MCP tools directly** (not just CLI commands) since it's designed for MCP-connected agents
- It includes **decision logic** (if project exists, skip creation; if guides installed, skip installation)
- It provides **CLI fallbacks** for each MCP tool call, supporting environments without MCP

### Skill Flow

```
User invokes /cf:onboard [optional project name]
  │
  ├─ Step 1: Detect existing project
  │   ├─ MCP: project_list → check if CWD has a registered project
  │   └─ CLI fallback: cf project list
  │
  ├─ Step 2: Create project (if needed)
  │   ├─ MCP: project_create { name, projectPath: CWD }
  │   └─ CLI fallback: cf init [name]
  │
  ├─ Step 3: Check and install guides
  │   ├─ MCP: guide_status → guide_install (if not installed)
  │   └─ CLI fallback: cf guides status / cf guides install
  │
  ├─ Step 4: Transition to Phase 1 concept discussion
  │   ├─ MCP: context_build (generates concept phase prompt)
  │   └─ CLI fallback: cf build
  │   └─ Begin conversational concept exploration
  │
  └─ Step 5: Post-setup nudge
      └─ Mention cf next for ongoing guidance
```

### Allowed Tools

The skill needs access to both CF CLI commands and MCP tools:

```yaml
allowed-tools: Bash(cf:*), mcp__context-forge__project_list, mcp__context-forge__project_create, mcp__context-forge__project_get, mcp__context-forge__guide_status, mcp__context-forge__guide_install, mcp__context-forge__context_build, mcp__context-forge__workflow_next
```

This follows the pattern of listing specific MCP tools rather than a wildcard, keeping the permission surface explicit.

### Registration

Add `'onboard.md'` to the `MANAGED_FILES` array in `packages/cli/src/commands/commandInstaller.ts`:

```typescript
const MANAGED_FILES = ['status.md', 'build.md', 'next.md', 'prompt.md', 'get.md', 'set.md', 'project.md', 'onboard.md'];
```

This ensures `cf install-commands` installs and updates the skill, and `cf uninstall-commands` removes it cleanly.

## Implementation Details

### Skill Content Structure

The skill file should contain:

1. **YAML frontmatter** — description, argument-hint, allowed-tools
2. **Purpose statement** — what this skill does (one paragraph)
3. **Step-by-step recipe** — numbered steps with MCP tool calls and CLI fallbacks
4. **Decision points** — clear if/then logic for each detection step
5. **Conversation transition** — how to move from setup into the Phase 1 concept discussion naturally

### Key Design Decisions

**MCP-first, CLI-fallback:** The skill prioritizes MCP tool calls because it's designed for AI agents connected via MCP. CLI commands are provided as fallbacks for environments where MCP tools aren't available (e.g., a basic Claude Code session without the CF MCP server configured).

**No `!` command execution:** Unlike other slash commands that use `!`cf ...`` to auto-execute, the onboarding skill provides instructions the agent follows. The agent decides when to call each tool based on detection results. This is intentional — onboarding is conversational, not mechanical.

**Argument handling:** The optional argument is the project name. If not provided, the skill instructs the agent to use the current directory name or ask the user.

**Scope boundary:** The skill handles project creation and guide installation, then transitions to Phase 1. It does NOT:
- Install slash commands (that's `cf init`'s job, and the skill is already installed)
- Configure the IDE (that's `cf init` or manual)
- Generate concept documents (that's the Phase 1 conversation)
- Manage worktrees (out of scope for onboarding)

### Skill Content Draft

```markdown
---
description: Guide a user through Context Forge project setup and into their first phase of work
argument-hint: [project-name]
allowed-tools: Bash(cf:*), mcp__context-forge__project_list, mcp__context-forge__project_create, mcp__context-forge__project_get, mcp__context-forge__guide_status, mcp__context-forge__guide_install, mcp__context-forge__context_build, mcp__context-forge__workflow_next
---

You are guiding a user through Context Forge project onboarding. Follow these
steps in order — skip any step whose precondition is already met.

## Step 1 — Detect existing project

Check whether a Context Forge project is already registered at the current
working directory.

**MCP:** Call `project_list`. Scan results for a project whose `projectPath`
matches the current directory.
**CLI fallback:** Run `cf project list` and check the output.

- If a project exists at this path → skip to Step 3.
- If no project exists → continue to Step 2.

## Step 2 — Create project

Create a new Context Forge project.

**MCP:** Call `project_create` with:
- `name`: Use the argument provided with this command, or the current directory
  name, or ask the user what they'd like to call their project.
- `projectPath`: The current working directory (absolute path).
- `developmentPhase`: "Phase 1: Concept" (default — no need to specify).

**CLI fallback:** Run `cf init <name>`. This handles project creation plus
guide installation and IDE setup in one step — if using the CLI path, skip
to Step 4 after init completes.

Confirm to the user: "Project created: {name}."

## Step 3 — Check and install guides

Verify the AI Project Guide is installed, and install it if missing.

**MCP:** Call `guide_status`.
- If `installed: true` → skip installation.
- If `installed: false` → call `guide_install`.

**CLI fallback:** Run `cf guides status`. If not installed, run
`cf guides install`.

Do not draw attention to this step unless installation fails. It's
infrastructure the user doesn't need to think about.

## Step 4 — Transition to concept discussion

The project is set up. Now begin the Phase 1 (Concept) conversation.

**MCP:** Call `context_build` to generate the concept-phase context prompt.
Use the returned prompt as your working context to guide the conversation.

**CLI fallback:** Run `cf build` and use the output as your working context.

Begin by asking the user to describe what they want to build. Guide them
through the concept exploration naturally — the context prompt provides the
structure. The goal is a concept document at the end of this conversation.

## Step 5 — Mention ongoing guidance

After the concept conversation concludes (or if the user wants to pause),
mention: "You can run `cf next` (or `/cf:next`) anytime to see what to do
next. It adapts as your project progresses."

## Notes

- If any MCP tool call fails, fall back to the CLI equivalent.
- If the user already has a project but is in a later phase (not Phase 1),
  acknowledge this and suggest `cf next` instead of starting a concept
  discussion.
- Keep the conversation natural. This is onboarding, not a checklist.
  Adapt to what the user is telling you.
```

This is a representative draft — the implementation task will refine wording and test it end-to-end.

## Integration Points

### Provides to Other Slices
- None. This is the final slice in the 200-band onboarding initiative.

### Consumes from Other Slices
- **201 (project_create):** MCP tool referenced by name in Step 2
- **202 (Smart cf init):** CLI fallback referenced in Step 2
- **203 (Enhanced cf next):** Referenced in Step 5 for ongoing guidance; also provides the first-run experience users encounter after onboarding

## Success Criteria

1. Skill file `onboard.md` exists in `packages/cli/commands/cf/`
2. `cf install-commands` installs the skill to `~/.claude/commands/cf/onboard.md`
3. `cf uninstall-commands` removes it (via MANAGED_FILES)
4. Skill references correct MCP tool names and parameters (matching current MCP server)
5. Skill includes CLI fallbacks for every MCP tool call
6. Skill handles both cases: project exists (skip creation) and project doesn't exist (create)
7. Skill transitions naturally into Phase 1 concept discussion via `context_build`
8. Skill handles edge case: project exists but is in a later phase (suggests `cf next`)
9. Existing slash commands unchanged
10. Manual verification: AI agent can follow the skill to onboard a new project end-to-end

### Verification Walkthrough

#### 1. Install the skill

```bash
cf install-commands
# Expected: lists installed files, including onboard.md
ls ~/.claude/commands/cf/onboard.md
# Expected: file exists
```

#### 2. Invoke from Claude Code on a new directory

```bash
mkdir /tmp/test-onboard && cd /tmp/test-onboard && git init
# In Claude Code: /cf:onboard "My Test Project"
```

Expected agent behavior:
1. Calls `project_list` → no project at this path
2. Calls `project_create` with name "My Test Project" and projectPath
3. Calls `guide_status` → not installed → calls `guide_install`
4. Calls `context_build` → receives concept phase prompt
5. Begins asking about the project concept

#### 3. Invoke on existing project

```bash
cd /path/to/existing-cf-project
# In Claude Code: /cf:onboard
```

Expected agent behavior:
1. Calls `project_list` → finds existing project
2. Skips creation
3. Checks guide status (likely already installed, skips)
4. Checks project phase — if Phase 1, transitions to concept discussion; if later phase, suggests `cf next`

#### 4. CLI fallback path

In an environment without MCP tools configured, the agent should:
1. Run `cf project list` to check for existing project
2. Run `cf init <name>` to create (which handles guides + IDE)
3. Run `cf build` to get the concept prompt
4. Transition to concept discussion

#### 5. Uninstall

```bash
cf uninstall-commands
ls ~/.claude/commands/cf/onboard.md
# Expected: file does not exist
```

## Implementation Notes

### File Changes
- **New:** `packages/cli/commands/cf/onboard.md` — the skill file
- **Modified:** `packages/cli/src/commands/commandInstaller.ts` — add `'onboard.md'` to `MANAGED_FILES`

### Testing Strategy
- Verify `MANAGED_FILES` includes `'onboard.md'`
- Verify the file exists in `packages/cli/commands/cf/`
- Verify `cf install-commands` copies it to the target directory (existing `commandInstaller` tests may cover this implicitly if they test the full install flow)
- Manual end-to-end verification per the walkthrough above (AI agent following the skill is the real test)

### Effort
1/5 — One markdown file plus a one-line registration change. The complexity is in the content, not the code.

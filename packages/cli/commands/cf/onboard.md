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

Before creating the project, ensure git is initialized in the current
directory. If there is no `.git` directory, ask the user to run `git init`
(or run it for them if you have Bash access).

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

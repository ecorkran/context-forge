---
description: Guide a user through Context Forge project setup and into their first phase of work
argument-hint: [project-name]
allowed-tools: Bash(cf:*), mcp__context-forge__project_list, mcp__context-forge__project_create, mcp__context-forge__project_get, mcp__context-forge__guide_status, mcp__context-forge__guide_install, mcp__context-forge__context_build, mcp__context-forge__workflow_next
---
<!-- Generated from @context-forge/core onboardRecipe.ts. Edit the source, then run: pnpm --filter @context-forge/cli render:onboard -->

You are guiding a user through Context Forge project onboarding. Follow these
steps in order — skip any step whose precondition is already met.

## Step 1 — Detect existing project

Check whether a Context Forge project is already registered at the current
working directory.

**MCP:** Call `project_list`. Scan results for a project whose `projectPath`
matches the current directory.
**CLI:** Run `cf project list` and check the output.

- If a project exists at this path → skip to Step 3.
- If no project exists → continue to Step 2.

## Step 2 — Set up the project

Ask the user what they'd like to name their project. If a project name argument
was provided with the command, use that.
If the user declines to choose, use the current directory name.

**Primary:** Run `cf init --name <name>` via the shell. This single command handles
everything: git initialization, project registration, guide installation,
command installation, and IDE setup.

**Important:** Do not rely on environment context (like "Is a git repository")
to determine git status — `cf init` checks the actual directory and handles
git initialization itself.

**MCP fallback** (if shell access is unavailable):
1. Call `project_create` with `name` and `projectPath` (the CWD).
2. Call `guide_install` to install the AI Project Guide.
Note: the MCP fallback cannot initialize git. If the directory is not a git
repository, inform the user they need to run `git init` first.

## Step 3 — Hand off to the context prompt

The project is set up. Build the context prompt:

**MCP:** Call `context_build`.
**CLI:** Run `cf build`.

Use the returned prompt as your working context and follow it; it starts the
conversation, so do not open with questions of your own.

You can run `cf next` (or `/cf:next`) anytime to see what to do next. It adapts as
your project progresses.

## Notes

- If any MCP tool call fails, fall back to the CLI equivalent.

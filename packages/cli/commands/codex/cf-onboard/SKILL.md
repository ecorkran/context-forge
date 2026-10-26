---
name: cf-onboard
description: Guide a user through Context Forge project setup and into their first phase of work. Use when the user wants to set up or onboard a project with Context Forge.
---
<!-- Generated from @context-forge/core onboardRecipe.ts. Edit the source, then run: pnpm --filter @context-forge/cli render:onboard -->

# Context Forge Onboard

You are guiding a user through Context Forge project onboarding. Follow these
steps in order — skip any step whose precondition is already met.

## Step 1 — Detect existing project

Check whether a Context Forge project is already registered at the current
working directory.

Run `cf project list` and check the output.

- If a project exists at this path → skip to Step 3.
- If no project exists → continue to Step 2.

## Step 2 — Set up the project

Ask the user what they'd like to name their project. If they provided a name
with the request, use that.
If the user declines to choose, use the current directory name.

Run `cf init --name <name>`. This single command handles
everything: git initialization, project registration, guide installation,
command installation, and IDE setup.

**Important:** Do not rely on environment context (like "Is a git repository")
to determine git status — `cf init` checks the actual directory and handles
git initialization itself.

If the Context Forge MCP server is configured and shell access is
unavailable, fall back to its tools:
1. Call `project_create` with `name` and `projectPath` (the CWD).
2. Call `guide_install` to install the AI Project Guide.
Note: the MCP fallback cannot initialize git. If the directory is not a git
repository, inform the user they need to run `git init` first.

## Step 3 — Check the codebase

Judge the current directory before starting any concept conversation.

Run `cf detect --json`.

The result is a JSON report with an `outcome`, or an error object with an `error` field.

- If `outcome` is `brownfield` or `adoption-incomplete` → print each entry of `notices` exactly as given, then stop. Do not build the context prompt and do not start a concept conversation.
- If the result is an error object → show its `message` and stop.
- Otherwise → continue to Step 4.

## Step 4 — Hand off to the context prompt

The project is set up. Build the context prompt:

Run `cf build`.

Use the returned prompt as your working context and follow it; it starts the
conversation, so do not open with questions of your own.

You can run `cf next` (or the `cf-next` skill) anytime to see what to do next. It adapts as
your project progresses.

## Notes

- If an MCP tool call fails, fall back to the CLI equivalent.

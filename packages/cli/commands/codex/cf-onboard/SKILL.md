---
name: cf-onboard
description: Guide a user through Context Forge project setup and into their first phase of work. Use when the user wants to set up or onboard a project with Context Forge.
---

# Context Forge Onboard

You are guiding a user through Context Forge project onboarding. Follow these
steps in order — skip any step whose precondition is already met.

## Step 1 — Detect existing project

Run `cf project list` and check whether a project is already registered at
the current working directory.

- If a project exists at this path → skip to Step 3.
- If no project exists → continue to Step 2.

## Step 2 — Create project

Ask the user what they'd like to name their project. If they provided a name
with the request, use that. If the user declines to choose, default to the
current directory name.

Run `cf init <name>`. This single command handles everything: git
initialization, project registration, guide installation, command/skill
installation, and IDE setup. After `cf init` completes, continue to Step 3.

**Important:** Do not rely on environment context (like "Is a git
repository") to determine git status — `cf init` checks the actual directory
and handles git initialization itself.

If the Context Forge MCP server is configured and shell access is
unavailable, fall back to its `project_create` tool (with `name` and
`projectPath` set to the CWD) followed by `guide_install`. The MCP fallback
cannot initialize git — if the directory is not a git repository, inform the
user they need to run `git init` first.

## Step 3 — Transition to concept discussion

The project is set up. Run `cf build` and use the output as your working
context to begin the Phase 0 (Concept) conversation.

Begin by asking the user to describe what they want to build. Guide them
through the concept exploration naturally — the context prompt provides the
structure. The goal is a concept document at the end of this conversation.

## Step 4 — Mention ongoing guidance

After the concept conversation concludes (or if the user wants to pause),
mention: "You can run `cf next` (or the `cf-next` skill) anytime to see what
to do next. It adapts as your project progresses."

## Notes

- If an MCP tool call fails, fall back to the CLI equivalent.
- If the user already has a project but is in a later phase (not Phase 0),
  acknowledge this and suggest `cf next` instead of starting a concept
  discussion.
- Keep the conversation natural. This is onboarding, not a checklist.
  Adapt to what the user is telling you.

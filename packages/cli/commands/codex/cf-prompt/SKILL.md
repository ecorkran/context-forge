---
name: cf-prompt
description: Get or list Context Forge prompt templates. Use when the user asks for a cf prompt by phase name or wants the list of available prompts.
---

# Context Forge Prompt

1. If the user gave no argument, or the argument is `list`: run
   `cf prompt list` and print its output verbatim, without commentary.
2. Otherwise run `cf prompt get <argument>` with the user's argument
   (a phase name such as those shown by `cf prompt list`).
3. If the command fails, show its error output and stop.
4. When `cf prompt get` returns a prompt template: use it as your working
   context and immediately begin the work it describes. Confirm receipt
   with exactly one line: `Received prompt: {phase name}` — take the phase
   name from the command's output.

---
description: Get or list Context Forge prompt templates (e.g., /cf:prompt P5 or /cf:prompt list)
argument-hint: [phase-name | list]
allowed-tools: Bash(cf:*)
---

If the result is a prompt template (from `cf prompt get`), use it as your working context and immediately begin the work it describes. Confirm receipt with a one-line summary: "Received prompt: {phase name}" — then proceed.

If the result is a list of available prompts (from `cf prompt list`), present it to the user without commentary.

!`cf prompt get $ARGUMENTS 2>/dev/null || cf prompt list`

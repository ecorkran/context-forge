---
description: Build a Context Forge context prompt (accepts optional --phase, --slice flags)
argument-hint: [--phase <phase>] [--slice <slice>]
allowed-tools: Bash(cf:*)
---

Use the following as your working context and immediately begin the work it describes. Confirm receipt with a one-line summary: "Context loaded: {project} | {phase} | {slice}" — then proceed.

!`cf build $ARGUMENTS`

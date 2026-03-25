---
description: Set active slice for implementation and build prompt
argument-hint: <index>
allowed-tools: Bash(cf:*)
---

Use the following as your working context. Confirm receipt with a one-line summary: "Context loaded: {project} | {phase} | {slice}" — then follow the instruction prompt. If the instruction prompt contains a STOP condition, STOP — do not begin work.

!`cf implement $ARGUMENTS --json`

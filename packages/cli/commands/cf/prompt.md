---
description: Get or list Context Forge prompt templates (e.g., /cf:prompt P5 or /cf:prompt list)
argument-hint: <phase-name | list>
allowed-tools: Bash(cf:*)
---

Get prompt template information.

!`cf prompt get $ARGUMENTS 2>/dev/null || cf prompt list 2>/dev/null`

If this is a prompt template, present it clearly. If this is a list, summarize the available prompts.

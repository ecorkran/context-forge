---
description: Get or list Context Forge prompt templates (e.g., /cf:prompt P5 or /cf:prompt list)
argument-hint: [phase-name | list]
allowed-tools: Bash(cf:*)
---

Present the following output exactly as shown, with no additional commentary or interpretation:

!`cf prompt get $ARGUMENTS 2>/dev/null || cf prompt list`

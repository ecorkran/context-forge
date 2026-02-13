---
docType: guide
layer: project
description: Original project concept for context-builder
dateCreated: 20250910
dateUpdated: 20250910
---

# Overview

This project is an Electron application to help with building context for Claude
Code.  It was created from manta-templates Electron template, and uses the ai-project-guide system in project-documents/.

We will use the manta-templates components in src/lib/ui-core to create our UI.

Use Case: user is starting a new context continuing their project.
We add:
* Context Initialization Prompt
* 3rd party tools note
* Monorepo structure note if applicable
* Any recent event summary
* Project state information (project, template, slice, etc) from vars
* instruction prompt
* any additional notes.

Currently these are built manually mostly from prompts in:
project-guides/prompt.ai-project.system.md
This plus adding notes and project state takes several minutes per context, probably avg 3-4.  At even 15 contexts/day (pretty easy metric to hit) this is 1 hour.  We can build this context and just let the user copy it and paste it into Claude Code.  Tedium reduced, time saved.  

We'll want to be able to input the project name, template name, slice name, monorepo/package status, where only project name is truly required.  Tabbed view on left, first tab has input controls for these.

We want to be able to handle multiple projects.  maybe a droplist, maybe multiple tabs (simple droplist e.g. select).  Keep selection easy -- like one selection it changes to the set of variables for my selected project.  I probably need to be able to edit project name.

We want to easily build prompts like above.  This is a very common sequence.  Even if that is the only prompt we can build right now, it's useful.

Ideally we can pick from a system prompt for the instruction prompt, like I could pick: Phase 7 - Task Implementation, and I get that prompt.

The constructed prompt should be displayed in a large scrolling multiline 
text control on the right side of the window.  Ideally again there is one per project, and switching the project selector switches everything including this output window.  Window should have a copy button (icon next text) to simplify copying the output prompt for pasting into agents like Claude Code.

This is an electron app using manta-templates, tailwind 4, radix, typescript, and React.
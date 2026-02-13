---
layer: project
phase: 1
phaseName: concept
guideRole: primary
audience: [human, ai]
description: Project concept for context-builder Electron application
dependsOn: [guide.ai-project.00-process.md]
dateCreated: 20250910
dateUpdated: 20250910
---

#### High-Level Project Concept

We are creating an Electron desktop application called **context-builder** that automates the creation of context prompts for Claude Code sessions. This application eliminates the manual, time-consuming process of building structured context that currently takes 3-4 minutes per session.

What makes this unique is its focus on the specific workflow of AI-assisted development using Claude Code, where developers need to provide consistent, structured context including project state, templates, slices, monorepo information, and instruction prompts.

Key characteristics:
* **Electron desktop application** using React, TypeScript, and Tailwind 4
* **Built on manta-templates foundation** with ui-core components
* **Multi-project support** with easy project switching via dropdown selection
* **Template-driven prompt generation** from curated system prompts
* **Copy-paste optimized output** for seamless integration with Claude Code

The application runs as a desktop utility that developers use to quickly generate context prompts before starting Claude Code sessions. Users access it locally, input project parameters, select from predefined instruction templates, and copy the generated context directly into their AI coding sessions.

##### Target Users

Primary users are developers using Claude Code for AI-assisted development, particularly those working on multiple projects with the manta-templates ecosystem and ai-project-guide methodology.

Users typically:
- Work on 15+ Claude Code contexts per day (1 hour saved daily at current manual process)
- Use structured project methodologies with templates, slices, and phases
- Need consistent context formatting across different projects and development phases
- Switch between multiple active projects requiring different context configurations

##### Proposed Technical Stack

**Platform:** Electron desktop application
**Frontend:** React with TypeScript
**Styling:** Tailwind CSS v4 with Radix UI components
**Architecture:** Built on manta-templates Electron template
**UI Components:** manta-templates ui-core component library

**Key Dependencies:**
- Electron (desktop application framework)
- React 18+ (UI framework)
- TypeScript (type safety)
- Tailwind CSS v4 (styling system)
- Radix UI (accessible component primitives)

**No 3rd-party specialized components required** - application uses standard form controls, text areas, and basic UI components available in the manta-templates ui-core library.

##### Proposed Development Methodology

We will follow the slice-based methodology from `guide.ai-project.00-process` with focus on rapid iteration and user feedback.

Development approach:
- **Speed over complexity** - solve the immediate pain point of manual context creation
- **Iterative enhancement** - start with core functionality, expand based on usage patterns
- **Component reuse** - leverage existing manta-templates ui-core components
- **Minimal viable product** - focus on the primary use case of context generation

In general, favor simplicity and avoid over-engineering. Remember the cliche about premature optimization. Use industry standard solutions where practical and available. Avoid reinventing wheels.

##### Summary

context-builder addresses a specific productivity bottleneck in AI-assisted development workflows by automating the creation of structured context prompts. The application leverages existing manta-templates infrastructure to deliver a focused desktop utility that saves developers significant time while ensuring consistent, high-quality context for Claude Code sessions.
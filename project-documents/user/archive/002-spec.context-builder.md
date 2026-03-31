---
layer: project
phase: 2
phaseName: spec
guideRole: primary
audience: [human, ai]
description: Project specification for context-builder Electron application
dependsOn: [01-concept.context-builder.md]
dateCreated: 20250910
dateUpdated: 20250910
---

## 1. Overview and Purpose

**Project Title:** context-builder

**Summary:** An Electron desktop application that automates the creation of structured context prompts for Claude Code sessions, eliminating the manual 3-4 minute process currently required per context session.

**Objectives:**
- **Specific:** Reduce context creation time from 3-4 minutes to under 30 seconds
- **Measurable:** Save 45+ minutes daily for developers creating 15+ contexts per day
- **Achievable:** Leverage existing manta-templates components and established patterns
- **Relevant:** Addresses immediate productivity bottleneck in AI-assisted development workflow
- **Time-bound:** MVP delivery within current development cycle

**Target Audience:** Developers using Claude Code with manta-templates ecosystem and ai-project-guide methodology, managing multiple active projects requiring consistent context formatting.

## 2. Functional Requirements

### Core Features and Functions

**F1: Project Management (Priority: High)**
- Multi-project support with dropdown selection
- Project configuration persistence (project name, template, slice, monorepo status)
- Project switching with context preservation
- Project editing capabilities

**F2: Context Generation (Priority: High)**
- Template-driven prompt assembly from components:
  - Context Initialization Prompt
  - 3rd party tools notation
  - Monorepo structure notation (conditional)
  - Recent event summary (user input)
  - Project state information (from stored variables)
  - Instruction prompt (from template selection)
  - Additional notes (user input)
- Real-time preview of generated context
- Copy-to-clipboard functionality with single click

**F3: Template Management (Priority: Medium)**
- System prompt template selection (e.g., "Phase 7 - Task Implementation")
- Template categorization by development phase
- Template preview and description display

**F4: User Interface (Priority: High)**
- Split-pane layout: controls on left, output on right
- Tabbed interface for multiple projects
- Large scrollable text area for generated output
- Copy button with visual feedback
- Responsive design within desktop window constraints

### Use Cases/User Stories

**UC1: New Context Creation**
- User selects active project from dropdown
- User reviews/updates project parameters (template, slice, monorepo status)
- User selects appropriate instruction template
- User adds any recent events or additional notes
- User copies generated context and pastes into Claude Code

**UC2: Project Switching**
- User selects different project from dropdown
- Application switches all form fields and output to selected project's configuration
- Previous project's state is preserved for future use

**UC3: Project Configuration**
- User creates new project entry
- User configures project parameters (name, template, slice name, monorepo status)
- User saves configuration for future context generation sessions

### Process Flows

1. **Application Startup** → Load saved projects → Display last selected project → Ready for context generation
2. **Context Generation** → Select project → Review/update parameters → Select template → Add notes → Generate → Copy → Paste to Claude Code
3. **Project Management** → Select project dropdown → Edit/create project → Configure parameters → Save → Return to generation


## 4. Technical Specifications

### Technology Stack

**Core Platform:**
- **Electron** - Desktop application framework
  - Knowledge available: None in tool-guides (standard web APIs apply)
- **React 18+** - UI framework
  - Knowledge available: `/project-guides/rules/react.md`
- **TypeScript** - Type safety and development experience
  - Knowledge available: `/project-guides/rules/typescript.md`

**UI and Styling:**
- **Tailwind CSS v4** - Utility-first CSS framework
  - Knowledge available: `/tool-guides/tailwindcss/`
- **Radix UI** - Accessible component primitives
  - Knowledge available: `/tool-guides/radix/`
- **manta-templates ui-core** - Reusable component library
  - Knowledge available: `/tool-guides/manta-templates/`

**Note:** Electron knowledge gap identified - standard web development patterns apply within Electron renderer process.

### Integration Requirements
- **File System Access:** Local storage for project configurations (JSON files)
- **Clipboard API:** System clipboard integration for copy operations
- **No External APIs:** Self-contained application with no network dependencies

### Hosting and Architecture
- **Desktop Application:** Distributed as packaged Electron app
- **Local Storage:** Project data stored in user's application data directory
- **Single Process:** Main process handles file I/O, renderer process handles UI

### Compatibility
- **Operating Systems:** macOS, Windows, Linux (Electron cross-platform support)
- **Node.js Version:** Compatible with current Electron version requirements
- **Screen Resolutions:** Responsive design for 1024x768 minimum, optimized for 1440x900+

## 5. Deliverables and Milestones

### Wireframes/Mockups
**Main Application Window:**
```
┌─────────────────────────────────────────────────────────────┐
│ context-builder                                         □ ─ ✕ │
├─────────────────────────────────────────────────────────────┤
│ Project Controls (Left Pane)        │ Generated Output       │
│ ┌─────────────────────────────────┐ │ (Right Pane)          │
│ │ Project: [dropdown ▼]          │ │ ┌───────────────────────┐ │
│ │                                 │ │ │ Alright here's where  │ │
│ │ Template: [input field]         │ │ │ we are:              │ │
│ │ Slice: [input field]            │ │ │ {                    │ │
│ │ Monorepo: [checkbox]            │ │ │   project: context-  │ │
│ │                                 │ │ │   builder,           │ │
│ │ Instruction: [dropdown ▼]       │ │ │   slice: ui-design   │ │
│ │                                 │ │ │ }                    │ │
│ │ Recent Events:                  │ │ │                      │ │
│ │ [text area]                     │ │ │ The following...     │ │
│ │                                 │ │ │ [scrollable text]    │ │
│ │ Additional Notes:               │ │ │                      │ │
│ │ [text area]                     │ │ │                      │ │
│ │                                 │ │ │                      │ │
│ │ [Generate Context]              │ │ │ [Copy 📋]            │ │
│ └─────────────────────────────────┘ │ └───────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Development Phases
1. **Foundation Setup** - Electron + React + manta-templates integration
2. **Core UI** - Layout, forms, and basic project management
3. **Context Generation** - Template system and output formatting
4. **Polish & Testing** - Copy functionality, persistence, and user experience refinement

## 6. Risk Management

### Constraints
- **Time:** Single development cycle for MVP
- **Knowledge Gap:** Limited Electron-specific expertise (mitigated by standard web API usage)
- **Dependencies:** Relies on manta-templates ui-core component stability

## 7. Documentation and Appendices

### Glossary
- **Context:** Structured information provided to Claude Code to establish project understanding
- **Slice:** Vertical development increment in ai-project-guide methodology
- **manta-templates:** Component library and development framework
- **ui-core:** Reusable component library within manta-templates ecosystem

### References
- **ai-project-guide methodology:** `guide.ai-project.00-process.md`
- **manta-templates documentation:** `/tool-guides/manta-templates/`
- **System prompt templates:** `project-guides/prompt.ai-project.system.md`

### Supporting Materials
- **Component Inventory:** Leverage existing manta-templates ui-core components for forms, buttons, layout
- **Template Examples:** Reference existing context prompts for formatting patterns
- **User Workflow Analysis:** Based on current 3-4 minute manual process documentation
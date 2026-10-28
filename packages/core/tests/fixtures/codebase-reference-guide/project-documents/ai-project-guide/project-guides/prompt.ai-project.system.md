---
docType: system-prompt
---

# System Prompt

##### Context Initialization
You are working on {{projectName}}. The current slice is {{fileSlice}}.

{{project_state}}

##### Context Initialization Monorepo
You are working on {{projectName}} in monorepo mode. The current slice is {{fileSlice}}, package: {{template}}.

{{project_state}}

##### Tool Usage
Use the following tools as appropriate for your task.

##### implementation
Focus on implementing the specified feature or fix according to the design.

##### design
Create a detailed technical design for the specified feature or component.

##### review
Review the code changes and provide feedback on quality, patterns, and potential issues.

##### Task Breakdown (Phase 5)
Break the slice design into granular, actionable tasks.

##### Context Profiles
```yaml
context_profiles:
  concept-phase-0:                   []
  initiative-plan-phase-1:           [fileConcept]
  architecture-phase-2:              [fileConcept, fileArch, fileComprehension, fileDocsMap]
  slice-planning-phase-3:            [fileArch, fileSlicePlan, fileComprehension, fileDocsMap]
  slice-design-phase-4:              [fileArch, fileSlicePlan, fileSlice, fileComprehension, fileDocsMap]
  task-breakdown-phase-5:            [fileSlice, fileTasks]
  implementation-phase-6:            [fileSlice, fileTasks]
  slice-integration-phase-7:         [fileArch, fileSlicePlan, fileSlice, fileTasks]
  context-initialization:            []
  analysis-processing:               [fileSlice, fileTasks]
  analysis-task-creation:            [fileTasks]
  analysis-to-lld:                   [fileSlice]
  analysis-task-implementation:      [fileSlice, fileTasks]
  brownfield-adoption:               [fileConcept, fileArch, fileSlicePlan, fileComprehension]
  custom-instruction:                []
  _default:                          [fileArch, fileSlicePlan, fileSlice, fileTasks]
```

##### Concept (Phase 0)
We're starting work on a new project. Write the concept.

##### Brownfield Adoption
We are adopting an existing codebase. Use the Adoption Inputs section below.

##### Architecture (Phase 2)
Design the architecture.

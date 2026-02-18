import type { TemplateStatement } from '../types/statements.js';

/** Relative path (from project root) to the default statements file */
export const STATEMENTS_FILE_RELATIVE_PATH = 'default-statements.md';

/** Relative path (from project root) to the system prompt file */
export const PROMPT_FILE_RELATIVE_PATH =
  'project-documents/ai-project-guide/project-guides/prompt.ai-project.system.md';

/** Default statements used as fallback when the statements file is missing */
export const DEFAULT_STATEMENTS: Record<string, TemplateStatement> = {
  'start-project-statement': {
    key: 'start-project-statement',
    content:
      'Starting work on {{projectName}}. Project information, environment context, instructions, and notes follow:',
    description: 'Opening statement for starting a new project',
    editable: true
  },
  'continue-project-statement': {
    key: 'continue-project-statement',
    content:
      'Continuing work on {{projectName}}. Project information, environment context, instructions, and notes follow:',
    description: 'Opening statement for continuing project work',
    editable: true
  },
  'tool-intro-statement': {
    key: 'tool-intro-statement',
    content: 'The following tools and MCP servers are available for this project:',
    description: 'Introduction to tools and MCP section',
    editable: true
  },
  'instruction-intro-statement': {
    key: 'instruction-intro-statement',
    content: 'Current development phase and instructions:',
    description: 'Introduction to instruction prompt section',
    editable: true
  },
  'monorepo-statement': {
    key: 'monorepo-statement',
    content:
      'Project is configured as a monorepo. Working in package: {{template}}, Slice: {{slice}}',
    description: 'Monorepo configuration statement',
    editable: true
  },
  'current-events-header': {
    key: 'current-events-header',
    content: '### Current Project State',
    description: 'Header for current project state section',
    editable: true
  },
  'additional-notes-header': {
    key: 'additional-notes-header',
    content: '### Additional Notes',
    description: 'Header for additional notes section',
    editable: true
  },
  'no-tools-statement': {
    key: 'no-tools-statement',
    content: 'No additional tools or MCP servers detected for this session.',
    description: 'Statement when no tools are available',
    editable: true
  },
  'custom-instruction-statement': {
    key: 'custom-instruction-statement',
    content: 'Custom instruction provided: {{instruction}}',
    description: 'Statement for custom instruction types',
    editable: true
  }
};

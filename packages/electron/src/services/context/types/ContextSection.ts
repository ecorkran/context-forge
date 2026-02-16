import { ContextData } from './ContextData';

/**
 * Represents a section in the context template
 */
export interface ContextSection {
  /**
   * Unique identifier for the section
   */
  key: string;
  
  /**
   * Optional title to display for the section (e.g., "### Current Events")
   */
  title?: string;
  
  /**
   * The content of the section (can include template variables)
   */
  content: string;
  
  /**
   * Whether this section should be conditionally included
   */
  conditional?: boolean;
  
  /**
   * Function to determine if section should be included
   */
  condition?: (data: ContextData | any) => boolean;
  
  /**
   * Sort order for the section (lower numbers appear first)
   */
  order: number;
}

/**
 * Complete context template structure
 */
export interface ContextTemplate {
  /**
   * All sections that make up the template
   */
  sections: ContextSection[];
  
  /**
   * Available statements for the template
   */
  statements: Record<string, any>;
  
  /**
   * Available system prompts
   */
  prompts: Record<string, any>;
}

/**
 * Enhanced context data with additional fields
 */
export interface EnhancedContextData extends ContextData {
  /**
   * List of available tools detected in the environment
   */
  availableTools?: string[];

  /**
   * List of available MCP servers
   */
  mcpServers?: string[];

  /**
   * Version of the template being used
   */
  templateVersion?: string;

  /**
   * Custom sections that can be added dynamically
   */
  customSections?: Record<string, string>;

  /**
   * Custom data fields from form
   */
  customData?: {
    recentEvents?: string;
    additionalNotes?: string;
    monorepoNote?: string;
    availableTools?: string;
  };
}

/**
 * Section builder configuration
 */
export interface SectionBuilderConfig {
  /**
   * Whether to include empty sections
   */
  includeEmptySections?: boolean;
  
  /**
   * Whether to include section titles
   */
  includeTitles?: boolean;
  
  /**
   * Custom section separator (default: double newline)
   */
  sectionSeparator?: string;
}

/**
 * Predefined section keys
 */
export enum SectionKeys {
  PROJECT_INTRO = 'project-intro',
  CONTEXT_INIT = 'context-init',
  TOOLS_SECTION = 'tools-section',
  MONOREPO_SECTION = 'monorepo-section',
  CURRENT_EVENTS = 'current-events',
  INSTRUCTION_PROMPT = 'instruction-prompt',
  ADDITIONAL_NOTES = 'additional-notes'
}

/**
 * Section validation result
 */
export interface SectionValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}
/**
 * Data structure for context generation
 * Maps directly to template variables
 */
export interface ContextData {
  projectName: string;
  template: string;
  slice: string;
  taskFile: string;
  instruction: string;
  developmentPhase?: string; // Human-readable phase label for output display
  workType?: 'start' | 'continue';
  projectDate?: string; // ISO 8601 date for template display
  isMonorepo: boolean;
  recentEvents: string;
  additionalNotes: string;
}

/**
 * Enhanced context data with additional fields for template system
 */
export interface EnhancedContextData extends ContextData {
  availableTools?: string[];
  mcpServers?: string[];
  templateVersion?: string;
  customSections?: Record<string, string>;
  customData?: {
    recentEvents?: string;
    additionalNotes?: string;
    monorepoNote?: string;
    availableTools?: string;
  };
}

/**
 * Type for context generation functions
 */
export interface ContextGenerator {
  generateContext(data: ContextData): Promise<string>;
  processTemplate(template: string, data: ContextData): string;
  formatOutput(content: string): string;
}
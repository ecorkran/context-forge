/**
 * Data structure for context generation.
 * Maps directly to template variables.
 * Consolidated from renderer superset (includes taskFile, developmentPhase, workType, projectDate).
 */
export interface ContextData {
  projectName: string;
  template: string;
  slice: string;
  taskFile: string;
  instruction: string;
  developmentPhase?: string;
  workType?: 'start' | 'continue';
  projectDate?: string;
  isMonorepo: boolean;
  recentEvents: string;
  additionalNotes: string;
}

/**
 * Enhanced context data with additional fields for template system.
 * Single canonical definition — consolidates previous duplicates in
 * ContextData.ts and ContextSection.ts across main/renderer.
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

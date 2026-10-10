/**
 * Data structure for context generation.
 * Maps directly to template variables.
 * Consolidated from renderer superset (includes fileTasks, developmentPhase, workType, dateProject).
 */
export interface ContextData {
  projectName: string;
  template: string;
  fileSlice: string;
  fileTasks: string;
  /**
   * Task files found on disk for the current slice, rendered for prompts
   * (`{task-files}`): one path, or comma-separated paths when the tasks file is
   * split into parts. Left undefined when no task file exists, so the
   * placeholder stays visible instead of naming a file that isn't there.
   */
  taskFiles?: string;
  instruction: string;
  developmentPhase?: string;
  fileArch?: string;
  fileSlicePlan?: string;
  fileHLD?: string;
  fileSpec?: string;
  fileConcept?: string;
  workType?: 'start' | 'continue';
  dateProject?: string;
  recentEvents: string;
  additionalNotes: string;
  worktreeName?: string;
  worktreeIndexStart?: number;
  worktreeIndexEnd?: number;
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
    availableTools?: string;
  };
}


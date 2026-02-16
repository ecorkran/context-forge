/**
 * Represents a system prompt extracted from the prompt file
 */
export interface SystemPrompt {
  /**
   * Display name of the prompt (from section header)
   */
  name: string;
  
  /**
   * Unique key identifier for the prompt
   */
  key: string;
  
  /**
   * The actual prompt content/text
   */
  content: string;
  
  /**
   * Parameters or variables referenced in the prompt
   */
  parameters: string[];
}

/**
 * Result of parsing the system prompt file
 */
export interface ParsedPromptFile {
  /**
   * All prompts found in the file
   */
  prompts: SystemPrompt[];
  
  /**
   * File metadata (version, last updated, etc)
   */
  metadata?: {
    version?: string;
    lastUpdated?: string;
  };
  
  /**
   * Any parsing errors encountered
   */
  errors: string[];
}

/**
 * Cache entry for parsed system prompts
 */
export interface PromptCacheEntry {
  /**
   * Parsed prompts
   */
  prompts: SystemPrompt[];
  
  /**
   * File modification time when cached
   */
  mtime: number;
  
  /**
   * Cache timestamp
   */
  cachedAt: number;
}

/**
 * Special prompt keys for commonly used prompts
 */
export enum SpecialPromptKeys {
  CONTEXT_INITIALIZATION = 'context-initialization',
  TOOL_USE = 'use-3rd-party-tool',
  PROJECT_KICKOFF = 'project-kickoff',
  FEATURE_DESIGN = 'feature-design'
}
/**
 * Template statement configuration for context generation
 */
export interface TemplateStatement {
  /**
   * Unique key identifier for the statement
   */
  key: string;
  
  /**
   * The actual statement content/text
   */
  content: string;
  
  /**
   * Human-readable description of what this statement is for
   */
  description: string;
  
  /**
   * Whether users can edit this statement
   */
  editable: boolean;
}

/**
 * Configuration for storing and managing statements
 */
export interface StatementConfig {
  /**
   * Map of statement keys to statement objects
   */
  statements: Record<string, TemplateStatement>;
  
  /**
   * ISO date string of last update
   */
  lastUpdated: string;
  
  /**
   * Version string for compatibility tracking
   */
  version: string;
}

/**
 * Metadata extracted from markdown file frontmatter
 */
export interface StatementFileMetadata {
  version: string;
  lastUpdated: string;
}

/**
 * Result of parsing a statement from markdown
 */
export interface ParsedStatement {
  key: string;
  content: string;
  editable: boolean;
}
import * as fs from 'fs';
import * as path from 'path';
import { TemplateStatement, StatementConfig, ParsedStatement } from './types/TemplateStatement';

/**
 * Default statements for fallback when files are missing
 */
const DEFAULT_STATEMENTS: Record<string, TemplateStatement> = {
  'start-project-statement': {
    key: 'start-project-statement',
    content: "We're starting work on a new project. Project information, environment context, instructions, and notes follow:",
    description: 'Opening statement for starting a new project',
    editable: true
  },
  'continue-project-statement': {
    key: 'continue-project-statement',
    content: 'We are continuing work on our project. Project information, environment context, instructions, and notes follow:',
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
    content: 'Project is configured as a monorepo. Working in package: {{template}}, Slice: {{slice}}',
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

/**
 * Service for managing configurable template statements
 * Loads statements from markdown files and provides CRUD operations
 */
export class StatementManager {
  private statements: Record<string, TemplateStatement> = {};
  private filePath: string;
  private isLoaded: boolean = false;

  constructor(filePath?: string) {
    // Default path relative to project root in user directory
    this.filePath = filePath || path.join(
      process.cwd(),
      'project-documents',
      'user',
      'content',
      'statements',
      'default-statements.md'
    );
  }

  /**
   * Parse markdown file to extract statements from HTML comments
   */
  private parseMarkdownStatements(content: string): ParsedStatement[] {
    const statements: ParsedStatement[] = [];
    
    // Split content into sections by headers
    const sections = content.split(/^## /m).filter(section => section.trim());
    
    // Pattern to extract metadata from HTML comments
    const commentPattern = /<!--\s*key:\s*([^,]+),\s*editable:\s*(true|false)\s*-->/;
    
    for (const section of sections) {
      const lines = section.split('\n');
      const headerLine = lines[0];
      
      // Look for comment metadata
      const commentMatch = lines.find(line => commentPattern.test(line));
      if (commentMatch) {
        const match = commentMatch.match(commentPattern);
        if (match) {
          const key = match[1].trim();
          const editable = match[2] === 'true';
          
          // Extract content after comment (everything after the comment line)
          const commentIndex = lines.indexOf(commentMatch);
          const contentLines = lines.slice(commentIndex + 1)
            .filter(line => !line.match(/^##\s/)) // Stop at next section (## followed by space, not ###)
            .join('\n')
            .trim();
          
          if (contentLines) {
            statements.push({
              key,
              content: contentLines,
              editable
            });
          }
        }
      }
    }
    
    return statements;
  }

  /**
   * Load statements from markdown file
   */
  async loadStatements(): Promise<void> {
    try {
      // Check if file exists
      if (!fs.existsSync(this.filePath)) {
        console.warn(`Statement file not found at ${this.filePath}, using defaults`);
        // Deep copy defaults to avoid reference issues
        this.statements = {};
        for (const [key, statement] of Object.entries(DEFAULT_STATEMENTS)) {
          this.statements[key] = { ...statement };
        }
        this.isLoaded = true;
        return;
      }

      // Read file content
      const fileContent = fs.readFileSync(this.filePath, 'utf-8');
      
      // Parse statements from markdown
      const parsedStatements = this.parseMarkdownStatements(fileContent);
      
      // Convert to statement objects
      this.statements = {};
      for (const parsed of parsedStatements) {
        // Find description from defaults or create one
        const defaultStatement = DEFAULT_STATEMENTS[parsed.key];
        const description = defaultStatement?.description || `Statement: ${parsed.key}`;
        
        this.statements[parsed.key] = {
          key: parsed.key,
          content: parsed.content,
          description,
          editable: parsed.editable
        };
      }
      
      // Add any missing default statements
      for (const [key, defaultStatement] of Object.entries(DEFAULT_STATEMENTS)) {
        if (!this.statements[key]) {
          console.warn(`Statement '${key}' not found in file, using default`);
          this.statements[key] = { ...defaultStatement };
        }
      }
      
      this.isLoaded = true;
    } catch (error) {
      console.error('Error loading statements:', error);
      // Fall back to defaults on any error (deep copy)
      this.statements = {};
      for (const [key, statement] of Object.entries(DEFAULT_STATEMENTS)) {
        this.statements[key] = { ...statement };
      }
      this.isLoaded = true;
    }
  }

  /**
   * Save statements back to markdown file
   */
  async saveStatements(): Promise<void> {
    try {
      // Ensure directory exists
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Build markdown content
      let content = `---
version: "1.0.0"
lastUpdated: "${new Date().toISOString().split('T')[0]}"
---

`;

      // Add each statement as a section
      for (const statement of Object.values(this.statements)) {
        // Create header from key (convert kebab-case to Title Case)
        const header = statement.key
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
        
        content += `## ${header}\n`;
        content += `<!-- key: ${statement.key}, editable: ${statement.editable} -->\n\n`;
        content += `${statement.content}\n\n`;
      }

      // Write atomically using temp file
      const tempPath = `${this.filePath}.tmp`;
      fs.writeFileSync(tempPath, content, 'utf-8');
      fs.renameSync(tempPath, this.filePath);
      
    } catch (error) {
      console.error('Error saving statements:', error);
      throw new Error(`Failed to save statements: ${error}`);
    }
  }

  /**
   * Get a specific statement by key
   */
  getStatement(key: string): string {
    if (!this.isLoaded) {
      throw new Error('Statements not loaded. Call loadStatements() first.');
    }
    
    const statement = this.statements[key];
    if (!statement) {
      // Try to find in defaults
      const defaultStatement = DEFAULT_STATEMENTS[key];
      if (defaultStatement) {
        console.warn(`Statement '${key}' not found, using default`);
        return defaultStatement.content;
      }
      
      console.warn(`Statement '${key}' not found, returning empty string`);
      return '';
    }
    
    return statement.content;
  }

  /**
   * Update a statement's content
   */
  updateStatement(key: string, content: string): void {
    if (!this.isLoaded) {
      throw new Error('Statements not loaded. Call loadStatements() first.');
    }
    
    const statement = this.statements[key];
    if (!statement) {
      throw new Error(`Statement '${key}' not found`);
    }
    
    if (!statement.editable) {
      throw new Error(`Statement '${key}' is not editable`);
    }
    
    // Validate content
    if (!content || content.trim().length === 0) {
      throw new Error('Statement content cannot be empty');
    }
    
    statement.content = content;
  }

  /**
   * Get all statements
   */
  getAllStatements(): Record<string, TemplateStatement> {
    if (!this.isLoaded) {
      throw new Error('Statements not loaded. Call loadStatements() first.');
    }
    
    // Return a copy to prevent external modifications
    return { ...this.statements };
  }

  /**
   * Reset statements to defaults
   */
  resetToDefaults(): void {
    // Create deep copy of defaults to avoid reference issues
    this.statements = {};
    for (const [key, statement] of Object.entries(DEFAULT_STATEMENTS)) {
      this.statements[key] = { ...statement };
    }
    this.isLoaded = true;
  }
}
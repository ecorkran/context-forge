import * as fs from 'fs';
import * as path from 'path';

/**
 * Service for managing prompt file operations
 * Handles file loading, validation, and basic monitoring
 */
export class PromptFileManager {
  private static readonly DEFAULT_PROMPT_PATH = path.join(
    process.cwd(),
    'project-documents',
    'project-guides',
    'prompt.ai-project.system.md'
  );

  private filePath: string;

  constructor(filePath?: string) {
    this.filePath = filePath || PromptFileManager.DEFAULT_PROMPT_PATH;
  }

  /**
   * Load prompt file content
   */
  async loadPromptFile(): Promise<string> {
    try {
      if (!fs.existsSync(this.filePath)) {
        throw new Error(`Prompt file not found: ${this.filePath}`);
      }

      const content = fs.readFileSync(this.filePath, 'utf-8');
      
      if (!content || content.trim().length === 0) {
        throw new Error('Prompt file is empty');
      }

      return content;
    } catch (error) {
      console.error('Error loading prompt file:', error);
      throw new Error(`Failed to load prompt file: ${error}`);
    }
  }

  /**
   * Check if prompt file exists and is readable
   */
  fileExists(): boolean {
    try {
      return fs.existsSync(this.filePath) && 
             fs.statSync(this.filePath).isFile();
    } catch (error) {
      return false;
    }
  }

  /**
   * Get file modification time
   */
  getModificationTime(): Date | null {
    try {
      if (!this.fileExists()) {
        return null;
      }
      
      const stats = fs.statSync(this.filePath);
      return stats.mtime;
    } catch (error) {
      console.error('Error getting file modification time:', error);
      return null;
    }
  }

  /**
   * Validate prompt file structure and content
   */
  validatePromptFile(content?: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    
    try {
      // Load content if not provided
      if (!content) {
        if (!this.fileExists()) {
          return { isValid: false, errors: ['File does not exist'] };
        }
        content = fs.readFileSync(this.filePath, 'utf-8');
      }

      // Check for YAML frontmatter
      if (!content.startsWith('---')) {
        errors.push('Missing YAML frontmatter at beginning of file');
      }

      // Check for proper frontmatter closure
      const frontmatterEnd = content.indexOf('---', 3);
      if (frontmatterEnd === -1) {
        errors.push('YAML frontmatter not properly closed');
      }

      // Check for prompt sections (##### headers)
      const sectionPattern = /^##### (.+)$/gm;
      const sections = content.match(sectionPattern);
      
      if (!sections || sections.length === 0) {
        errors.push('No prompt sections found (##### headers required)');
      }

      // Check for markdown code blocks
      const codeBlockPattern = /```(?:markdown)?\s*\n([\s\S]*?)\n```/g;
      const codeBlocks = content.match(codeBlockPattern);
      
      if (!codeBlocks || codeBlocks.length === 0) {
        errors.push('No markdown code blocks found (prompts should be in ```markdown blocks)');
      }

      // Basic structure validation
      if (content.length < 100) {
        errors.push('File appears to be too short to contain valid prompts');
      }

      // Check for common required sections
      const requiredSections = [
        'Model Change or Context Refresh',
        'Use 3rd Party Tool'
      ];

      for (const required of requiredSections) {
        if (!content.toLowerCase().includes(required.toLowerCase())) {
          errors.push(`Missing recommended section: "${required}"`);
        }
      }

      return {
        isValid: errors.length === 0,
        errors
      };
    } catch (error) {
      errors.push(`Validation error: ${error}`);
      return {
        isValid: false,
        errors
      };
    }
  }

  /**
   * Basic file watching setup (without live updates initially)
   * Returns a cleanup function
   */
  watchPromptFile(callback: (event: string) => void): () => void {
    if (!this.fileExists()) {
      console.warn('Cannot watch non-existent file:', this.filePath);
      return () => {}; // No-op cleanup
    }

    try {
      fs.watchFile(this.filePath, { interval: 1000 }, (curr, prev) => {
        if (curr.mtime !== prev.mtime) {
          callback('change');
        }
      });

      // Return cleanup function
      return () => {
        try {
          fs.unwatchFile(this.filePath);
        } catch (error) {
          console.warn('Error unwatching file:', error);
        }
      };
    } catch (error) {
      console.error('Error setting up file watcher:', error);
      return () => {}; // No-op cleanup
    }
  }

  /**
   * Get file information for debugging/logging
   */
  getFileInfo(): {
    path: string;
    exists: boolean;
    size?: number;
    modified?: Date;
    readable?: boolean;
  } {
    const info = {
      path: this.filePath,
      exists: this.fileExists()
    };

    if (info.exists) {
      try {
        const stats = fs.statSync(this.filePath);
        return {
          ...info,
          size: stats.size,
          modified: stats.mtime,
          readable: fs.constants.R_OK ? true : false
        };
      } catch (error) {
        console.error('Error getting file stats:', error);
      }
    }

    return info;
  }

  /**
   * Create backup of prompt file
   */
  async createBackup(suffix?: string): Promise<string> {
    if (!this.fileExists()) {
      throw new Error('Cannot backup non-existent file');
    }

    try {
      const backupSuffix = suffix || new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      const backupPath = `${this.filePath}.backup-${backupSuffix}`;
      
      const content = fs.readFileSync(this.filePath, 'utf-8');
      fs.writeFileSync(backupPath, content, 'utf-8');
      
      return backupPath;
    } catch (error) {
      throw new Error(`Failed to create backup: ${error}`);
    }
  }

  /**
   * Get relative path for display purposes
   */
  getRelativePath(): string {
    try {
      return path.relative(process.cwd(), this.filePath);
    } catch (error) {
      return this.filePath;
    }
  }
}
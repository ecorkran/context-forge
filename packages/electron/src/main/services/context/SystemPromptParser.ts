import * as fs from 'fs';
import * as path from 'path';
import { SystemPrompt, ParsedPromptFile, PromptCacheEntry, SpecialPromptKeys } from './types/SystemPrompt';

/**
 * Service for parsing system prompts from the prompt.ai-project.system.md file
 * Handles markdown section parsing, instruction mapping, and caching
 */
export class SystemPromptParser {
  private promptsCache: Map<string, PromptCacheEntry> = new Map();
  private filePath: string;
  private static readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(filePath?: string) {
    // Default path relative to project root
    this.filePath = filePath || path.join(
      process.cwd(),
      'project-documents',
      'ai-project-guide',
      'project-guides',
      'prompt.ai-project.system.md'
    );
  }

  /**
   * Parse the entire prompt file and extract all sections
   */
  async parsePromptFile(): Promise<ParsedPromptFile> {
    // Check if file exists
    if (!fs.existsSync(this.filePath)) {
      throw new Error(`System prompt file not found at ${this.filePath}`);
    }

    // Check cache first
    const cached = this.getCachedPrompts();
    if (cached) {
      return {
        prompts: cached,
        errors: []
      };
    }

    // Read and parse file
    const fileContent = fs.readFileSync(this.filePath, 'utf-8');
    const prompts = this.parseMarkdownSections(fileContent);

    // Cache results
    this.cachePrompts(prompts);

    return {
      prompts,
      errors: []
    };
  }

  /**
   * Parse markdown sections using ##### headers
   */
  private parseMarkdownSections(content: string): SystemPrompt[] {
    const prompts: SystemPrompt[] = [];
    
    // Extract sections by ##### headers
    const sectionPattern = /^##### (.+)$/gm;
    const sections = content.split(sectionPattern);
    
    // Process sections (odd indices are headers, even are content)
    for (let i = 1; i < sections.length; i += 2) {
      const header = sections[i]?.trim();
      const sectionContent = sections[i + 1]?.trim();
      
      if (!header || !sectionContent) continue;
      
      // Extract markdown code blocks from content
      const promptContent = this.extractPromptContent(sectionContent);
      
      if (promptContent) {
        const key = this.generateKeyFromHeader(header);
        const parameters = this.extractParameters(promptContent);
        
        prompts.push({
          name: header,
          key,
          content: promptContent,
          parameters
        });
      }
    }
    
    return prompts;
  }

  /**
   * Extract prompt content from section, handling markdown code blocks
   */
  private extractPromptContent(sectionContent: string): string {
    // Look for markdown code blocks first
    const codeBlockPattern = /```(?:markdown)?\s*\n([\s\S]*?)\n```/g;
    const codeBlocks: string[] = [];
    
    let match;
    while ((match = codeBlockPattern.exec(sectionContent)) !== null) {
      codeBlocks.push(match[1].trim());
    }
    
    // If we found code blocks, join them
    if (codeBlocks.length > 0) {
      return codeBlocks.join('\n\n');
    }
    
    // Otherwise, return the raw content after the first paragraph
    const lines = sectionContent.split('\n');
    const contentStart = lines.findIndex(line => 
      line.trim().startsWith('```') || 
      line.trim().length > 0 && !line.trim().startsWith('*')
    );
    
    if (contentStart >= 0) {
      return lines.slice(contentStart).join('\n').trim();
    }
    
    return sectionContent;
  }

  /**
   * Generate a key from section header
   */
  private generateKeyFromHeader(header: string): string {
    return header
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/--+/g, '-')
      .trim();
  }

  /**
   * Extract parameters from prompt content
   */
  private extractParameters(content: string): string[] {
    const paramPattern = /\{(\w+)\}/g;
    const parameters = new Set<string>();
    
    let match;
    while ((match = paramPattern.exec(content)) !== null) {
      parameters.add(match[1]);
    }
    
    return Array.from(parameters);
  }

  /**
   * Get context initialization prompt (Model Change or Context Refresh)
   * @param isMonorepo - If true, returns monorepo-specific version; otherwise returns regular version
   */
  async getContextInitializationPrompt(isMonorepo: boolean = false): Promise<SystemPrompt | null> {
    const parsed = await this.parsePromptFile();

    if (isMonorepo) {
      // Look for monorepo-specific context initialization prompt
      const monorepoPrompt = parsed.prompts.find(prompt =>
        prompt.name.toLowerCase().includes('context initialization') &&
        prompt.name.toLowerCase().includes('monorepo')
      );

      if (monorepoPrompt) {
        return monorepoPrompt;
      }
    }

    // Return regular (non-monorepo) context initialization prompt
    return parsed.prompts.find(prompt =>
      (prompt.key === SpecialPromptKeys.CONTEXT_INITIALIZATION ||
       prompt.name.toLowerCase().includes('context initialization') ||
       prompt.name.toLowerCase().includes('model change') ||
       prompt.name.toLowerCase().includes('context refresh')) &&
      !prompt.name.toLowerCase().includes('monorepo')
    ) || null;
  }

  /**
   * Get tool use prompt (Use 3rd Party Tool)
   */
  async getToolUsePrompt(): Promise<SystemPrompt | null> {
    const parsed = await this.parsePromptFile();
    
    return parsed.prompts.find(prompt =>
      prompt.key === SpecialPromptKeys.TOOL_USE ||
      prompt.name.toLowerCase().includes('tool usage')
    ) || null;
  }

  /**
   * Get prompt for specific instruction type
   */
  async getPromptForInstruction(instruction: string): Promise<SystemPrompt | null> {
    const parsed = await this.parsePromptFile();

    // Find prompt by fuzzy matching instruction key against section headers
    // The instruction value (e.g., "implementation", "task-breakdown") is matched
    // against prompt section names (e.g., "Task Implementation (Phase 7)")
    const match = parsed.prompts.find(prompt => {
      const nameLower = prompt.name.toLowerCase();
      const instructionLower = instruction.toLowerCase();

      return nameLower.includes(instructionLower) ||
             prompt.key.includes(instructionLower);
    });

    return match || null;
  }

  /**
   * Get all available prompts
   */
  async getAllPrompts(): Promise<SystemPrompt[]> {
    const parsed = await this.parsePromptFile();
    return parsed.prompts;
  }

  /**
   * Check cached prompts and return if valid
   */
  private getCachedPrompts(): SystemPrompt[] | null {
    const cached = this.promptsCache.get(this.filePath);
    if (!cached) return null;
    
    try {
      // Check if cache is expired
      if (Date.now() - cached.cachedAt > SystemPromptParser.CACHE_TTL_MS) {
        this.promptsCache.delete(this.filePath);
        return null;
      }
      
      // Check if file has been modified
      const stats = fs.statSync(this.filePath);
      if (stats.mtime.getTime() !== cached.mtime) {
        this.promptsCache.delete(this.filePath);
        return null;
      }
      
      return cached.prompts;
    } catch (error) {
      // File might not exist, cache is invalid
      this.promptsCache.delete(this.filePath);
      return null;
    }
  }

  /**
   * Cache parsed prompts with file modification time
   */
  private cachePrompts(prompts: SystemPrompt[]): void {
    try {
      const stats = fs.statSync(this.filePath);
      this.promptsCache.set(this.filePath, {
        prompts: [...prompts], // Deep copy
        mtime: stats.mtime.getTime(),
        cachedAt: Date.now()
      });
      
      // Prevent cache from growing too large
      if (this.promptsCache.size > 10) {
        const oldestKey = this.promptsCache.keys().next().value;
        if (oldestKey) {
          this.promptsCache.delete(oldestKey);
        }
      }
    } catch (error) {
      // Don't fail on cache errors
      console.warn('Failed to cache prompts:', error);
    }
  }

  /**
   * Clear cache (useful for testing or forced refresh)
   */
  clearCache(): void {
    this.promptsCache.clear();
  }


  /**
   * Validate prompt file structure
   */
  async validatePromptFile(): Promise<{ isValid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    try {
      if (!fs.existsSync(this.filePath)) {
        errors.push('Prompt file does not exist');
        return { isValid: false, errors };
      }
      
      const content = fs.readFileSync(this.filePath, 'utf-8');
      
      // Check for YAML frontmatter
      if (!content.startsWith('---')) {
        errors.push('Missing YAML frontmatter');
      }
      
      // Check for at least some ##### sections
      const sectionCount = (content.match(/^##### /gm) || []).length;
      if (sectionCount === 0) {
        errors.push('No prompt sections found (##### headers)');
      }
      
      // Try to parse and check for critical prompts
      const parsed = await this.parsePromptFile();
      if (parsed.errors.length > 0) {
        errors.push(...parsed.errors);
      }
      
      return { 
        isValid: errors.length === 0, 
        errors 
      };
    } catch (error) {
      errors.push(`Validation error: ${error}`);
      return { isValid: false, errors };
    }
  }
}
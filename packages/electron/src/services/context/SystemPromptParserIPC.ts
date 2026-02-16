/**
 * Type definition matching main process SystemPrompt interface
 * Data is transferred via IPC from main process
 */
type SystemPrompt = {
  name: string;
  key: string;
  content: string;
  parameters: string[];
};

/**
 * IPC adapter for SystemPromptParser that delegates to main process
 * Provides the same interface as the original SystemPromptParser
 */
export class SystemPromptParserIPC {
  private filename: string;
  private promptsCache: Map<string, SystemPrompt> = new Map();
  private cacheTimestamp: number = 0;

  constructor(filename?: string) {
    // Default to the same path as the main process SystemPromptParser
    this.filename = filename || 'project-documents/ai-project-guide/project-guides/prompt.ai-project.system.md';
  }

  /**
   * Get context initialization prompt via IPC
   * @param isMonorepo - If true, returns monorepo-specific version; otherwise returns regular version
   */
  async getContextInitializationPrompt(isMonorepo: boolean = false): Promise<SystemPrompt | null> {
    try {
      if (!window.electronAPI) {
        throw new Error('Electron API not available');
      }

      const prompt = await window.electronAPI.systemPrompts.getContextInit(this.filename, isMonorepo);
      return prompt;
    } catch (error) {
      console.error('Error getting context initialization prompt via IPC:', error);
      return null;
    }
  }

  /**
   * Get tool use prompt via IPC
   */
  async getToolUsePrompt(): Promise<SystemPrompt | null> {
    try {
      if (!window.electronAPI) {
        throw new Error('Electron API not available');
      }

      const prompt = await window.electronAPI.systemPrompts.getToolUse(this.filename);
      return prompt;
    } catch (error) {
      console.error('Error getting tool use prompt via IPC:', error);
      return null;
    }
  }

  /**
   * Get prompt for specific instruction type via IPC
   */
  async getPromptForInstruction(instruction: string): Promise<SystemPrompt | null> {
    try {
      if (!window.electronAPI) {
        throw new Error('Electron API not available');
      }

      const prompt = await window.electronAPI.systemPrompts.getForInstruction(this.filename, instruction);
      return prompt;
    } catch (error) {
      console.error('Error getting prompt for instruction via IPC:', error);
      return null;
    }
  }

  /**
   * Parse and get all prompts via IPC
   */
  async getAllPrompts(): Promise<SystemPrompt[]> {
    try {
      if (!window.electronAPI) {
        throw new Error('Electron API not available');
      }

      const prompts = await window.electronAPI.systemPrompts.parse(this.filename);
      
      // Update cache
      this.promptsCache.clear();
      prompts.forEach((prompt: SystemPrompt) => {
        this.promptsCache.set(prompt.key, prompt);
      });
      this.cacheTimestamp = Date.now();

      return prompts;
    } catch (error) {
      console.error('Error getting all prompts via IPC:', error);
      return [];
    }
  }

  /**
   * Get cached prompts (for performance)
   */
  getCachedPrompts(): SystemPrompt[] {
    return Array.from(this.promptsCache.values());
  }

  /**
   * Check if cache is valid (for performance optimization)
   */
  isCacheValid(maxAge: number = 300000): boolean { // 5 minutes default
    return (Date.now() - this.cacheTimestamp) < maxAge;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.promptsCache.clear();
    this.cacheTimestamp = 0;
  }

  /**
   * Get specific prompt from cache
   */
  getCachedPrompt(key: string): SystemPrompt | null {
    return this.promptsCache.get(key) || null;
  }

  /**
   * Get filename being used
   */
  get filePath(): string {
    return this.filename;
  }

  /**
   * Set filename and clear cache
   */
  setFilePath(filename: string): void {
    if (filename !== this.filename) {
      this.filename = filename;
      this.clearCache();
    }
  }

  /**
   * Check if file exists (via attempting to parse)
   */
  async fileExists(): Promise<boolean> {
    try {
      const prompts = await this.getAllPrompts();
      return prompts.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Get cache size
   */
  getCacheSize(): number {
    return this.promptsCache.size;
  }

  /**
   * Get cache age in milliseconds
   */
  getCacheAge(): number {
    return this.cacheTimestamp > 0 ? Date.now() - this.cacheTimestamp : -1;
  }
}
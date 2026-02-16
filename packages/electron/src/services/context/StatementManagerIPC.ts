import { TemplateStatement } from './types/TemplateStatement';

/**
 * IPC adapter for StatementManager that delegates to main process
 * Provides the same interface as the original StatementManager
 */
export class StatementManagerIPC {
  private filename: string;
  private isLoaded: boolean = false;
  private statementsCache: Record<string, TemplateStatement> = {};

  constructor(filename?: string) {
    this.filename = filename || 'default-statements.md';
  }

  /**
   * Load statements from file via IPC
   */
  async loadStatements(): Promise<void> {
    try {
      if (!window.electronAPI) {
        throw new Error('Electron API not available');
      }

      const statements = await window.electronAPI.statements.load(this.filename);
      this.statementsCache = statements;
      this.isLoaded = true;
    } catch (error) {
      console.error('Error loading statements via IPC:', error);
      throw error;
    }
  }

  /**
   * Get all loaded statements
   */
  getAllStatements(): Record<string, TemplateStatement> {
    if (!this.isLoaded) {
      throw new Error('Statements not loaded. Call loadStatements() first.');
    }
    return this.statementsCache;
  }

  /**
   * Save statements to file via IPC
   */
  async saveStatements(): Promise<void> {
    try {
      if (!window.electronAPI) {
        throw new Error('Electron API not available');
      }

      if (!this.isLoaded) {
        throw new Error('Statements not loaded. Call loadStatements() first.');
      }

      await window.electronAPI.statements.save(this.filename, this.statementsCache);
    } catch (error) {
      console.error('Error saving statements via IPC:', error);
      throw error;
    }
  }

  /**
   * Get a specific statement by key
   */
  getStatement(key: string): string {
    if (!this.isLoaded) {
      throw new Error('Statements not loaded. Call loadStatements() first.');
    }

    const statement = this.statementsCache[key];
    if (!statement) {
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

    const statement = this.statementsCache[key];
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

    // Update in cache
    statement.content = content;
  }


  /**
   * Reset statements to defaults
   */
  resetToDefaults(): void {
    // This would need to be implemented by re-loading the default file
    // For now, we'll clear the cache and reload
    this.isLoaded = false;
    this.statementsCache = {};
  }

  /**
   * Check if statements are loaded
   */
  get loaded(): boolean {
    return this.isLoaded;
  }

  /**
   * Get the filename being used
   */
  get filePath(): string {
    return this.filename;
  }
}
/**
 * Storage client for IPC communication with main process
 * Provides secure file system access through Electron IPC
 */

interface StorageResponse {
  success: boolean;
  data?: string;
  error?: string;
  recovered?: boolean;
  message?: string;
  notFound?: boolean;
}

declare global {
  interface Window {
    electronAPI: {
      ping: () => Promise<string>;
      getAppVersion: () => Promise<string>;
      updateWindowTitle: (projectName?: string) => Promise<void>;
      onFlushSave: (callback: () => void) => () => void;
      storage: {
        read: (filename: string) => Promise<StorageResponse>;
        write: (filename: string, data: string) => Promise<StorageResponse>;
        backup: (filename: string) => Promise<StorageResponse>;
        listBackups: (filename: string) => Promise<{
          success: boolean;
          backups?: Array<{ name: string; timestamp: string; size: number }>;
          error?: string;
        }>;
      };
      statements: {
        load: (filename?: string) => Promise<Record<string, any>>;
        save: (filename: string, statements: Record<string, any>) => Promise<void>;
        getStatement: (filename: string, key: string) => Promise<string>;
        updateStatement: (filename: string, key: string, content: string) => Promise<void>;
      };
      systemPrompts: {
        parse: (filename?: string) => Promise<any[]>;
        getContextInit: (filename?: string, isMonorepo?: boolean) => Promise<any | null>;
        getToolUse: (filename?: string) => Promise<any | null>;
        getForInstruction: (filename: string, instruction: string) => Promise<any | null>;
      };
      projectPath: {
        validate: (path: string) => Promise<import('@context-forge/core').PathValidationResult>;
        healthCheck: (path: string) => Promise<import('@context-forge/core').PathValidationResult>;
        listDirectory: (path: string, subdirectory: string, isMonorepo?: boolean) => Promise<import('@context-forge/core').DirectoryListResult>;
        pickFolder: () => Promise<{ path: string } | null>;
      };
    };
  }
}

export class StorageClient {
  private isElectron: boolean;

  constructor() {
    this.isElectron = typeof window !== 'undefined' && window.electronAPI !== undefined;
  }

  /**
   * Check if running in Electron environment
   */
  isAvailable(): boolean {
    return this.isElectron;
  }

  /**
   * Read file from app data directory
   * Returns file contents and indicates if data was recovered from backup
   */
  async readFile(filename: string): Promise<{ data: string; recovered?: boolean; message?: string }> {
    if (!this.isElectron) {
      throw new Error('Storage client is only available in Electron environment');
    }

    try {
      const response = await window.electronAPI.storage.read(filename);
      
      if (!response.success) {
        if (response.notFound) {
          // File doesn't exist, return empty data
          return { data: '' };
        }
        throw new Error(response.error || 'Failed to read file');
      }
      
      return {
        data: response.data || '',
        recovered: response.recovered,
        message: response.message
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error reading file';
      throw new Error(`Failed to read file: ${message}`);
    }
  }

  /**
   * Write file to app data directory
   */
  async writeFile(filename: string, data: string): Promise<void> {
    if (!this.isElectron) {
      throw new Error('Storage client is only available in Electron environment');
    }

    try {
      const response = await window.electronAPI.storage.write(filename, data);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to write file');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error writing file';
      throw new Error(`Failed to write file: ${message}`);
    }
  }

  /**
   * Create backup of file
   */
  async createBackup(filename: string): Promise<void> {
    if (!this.isElectron) {
      throw new Error('Storage client is only available in Electron environment');
    }

    try {
      const response = await window.electronAPI.storage.backup(filename);
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to create backup');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error creating backup';
      throw new Error(`Failed to create backup: ${message}`);
    }
  }
}

// Export singleton instance
export const storageClient = new StorageClient();
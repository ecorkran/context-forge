import type { PathValidationResult, DirectoryListResult } from '../main/services/project/types';

export interface ElectronAPI {
  ping: () => Promise<string>;
  getAppVersion: () => Promise<string>;
  updateWindowTitle: (projectName?: string) => Promise<void>;
  storage: {
    read: (filename: string) => Promise<{ success: boolean; data?: string; error?: string; recovered?: boolean; message?: string; notFound?: boolean }>;
    write: (filename: string, data: string) => Promise<{ success: boolean; error?: string }>;
    backup: (filename: string) => Promise<{ success: boolean; error?: string }>;
  };
  statements: {
    load: (filename?: string) => Promise<Record<string, unknown>>;
    save: (filename: string, statements: Record<string, unknown>) => Promise<void>;
    getStatement: (filename: string, key: string) => Promise<string>;
    updateStatement: (filename: string, key: string, content: string) => Promise<void>;
  };
  systemPrompts: {
    parse: (filename?: string) => Promise<unknown[]>;
    getContextInit: (filename?: string, isMonorepo?: boolean) => Promise<unknown>;
    getToolUse: (filename?: string) => Promise<unknown>;
    getForInstruction: (filename: string, instruction: string) => Promise<unknown>;
  };
  projectPath: {
    validate: (path: string) => Promise<PathValidationResult>;
    healthCheck: (path: string) => Promise<PathValidationResult>;
    listDirectory: (path: string, subdirectory: string, isMonorepo?: boolean) => Promise<DirectoryListResult>;
    pickFolder: () => Promise<{ path: string } | null>;
  };
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

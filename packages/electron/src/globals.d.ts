/**
 * Global type augmentations for the Electron renderer process.
 * Declares the shape of window.electronAPI as exposed by the preload script.
 */

import type { AppState } from './services/storage/types/AppState'
import type { ContextOverrides } from './main/ipc/contextHandlers'

declare global {
  interface Window {
    electronAPI: {
      ping: () => Promise<string>;
      getAppVersion: () => Promise<string>;
      updateWindowTitle: (projectName?: string) => Promise<void>;

      // ── Domain-level API ──────────────────────────────────────────────────
      project: {
        list: () => Promise<import('@context-forge/core').ProjectData[]>;
        get: (id: string) => Promise<import('@context-forge/core').ProjectData | null>;
        create: (data: import('@context-forge/core').CreateProjectData) => Promise<import('@context-forge/core').ProjectData>;
        update: (id: string, updates: import('@context-forge/core').UpdateProjectData) => Promise<import('@context-forge/core').ProjectData>;
        delete: (id: string) => Promise<void>;
      };
      context: {
        generate: (projectId: string, overrides?: ContextOverrides) => Promise<string>;
      };
      appState: {
        get: () => Promise<AppState>;
        update: (updates: Partial<AppState>) => Promise<void>;
      };

      // ── Project path (folder picker and path validation) ──────────────────
      projectPath: {
        validate: (path: string) => Promise<import('@context-forge/core').PathValidationResult>;
        healthCheck: (path: string) => Promise<import('@context-forge/core').PathValidationResult>;
        listDirectory: (path: string, subdirectory: string) => Promise<import('@context-forge/core').DirectoryListResult>;
        pickFolder: () => Promise<{ path: string } | null>;
      };
    };
  }
}

export {}

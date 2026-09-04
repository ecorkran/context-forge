// Guide management types and strategy interface

/** Installation method used for the ai-project-guide */
export type GuideMethod = 'submodule' | 'clone' | 'manual';

/** Full status of a guide installation */
export interface GuideInfo {
  installed: boolean;
  method: GuideMethod | null;
  version: string | null;
  path: string;
  source: string;
  latestVersion: string | null;
  updateAvailable: boolean;
  usingBundledPrompt: boolean;
}

/** Result of a guide installation */
export interface InstallResult {
  success: boolean;
  version: string | null;
  method: GuideMethod;
  path: string;
  /** True when the primary source failed with a network error and guide.fallback_source was used instead. */
  usedFallbackSource?: boolean;
}

/** Result of a guide update */
export interface UpdateResult {
  success: boolean;
  previousVersion: string | null;
  newVersion: string | null;
  method: GuideMethod;
  /**
   * True when the update also synced a non-default worktree's submodule
   * checkout. Lets callers report the sync even when previousVersion ===
   * newVersion (the host pointer was already current). Absent otherwise.
   */
  worktreeSynced?: boolean;
}

/** Result of uninstalling a guide */
export interface UninstallResult {
  success: boolean;
  method: GuideMethod;
  version: string | null;
}

/** Result of syncing a worktree's guide submodule checkout */
export interface SyncResult {
  worktreePath: string;
  success: boolean;
  error?: string;
}

/** Detection result returned by a strategy's detect() method */
export interface DetectionResult {
  method: GuideMethod;
  version: string | null;
  source: string | null;
}

/** Strategy interface for guide installation methods */
export interface InstallStrategy {
  install(projectPath: string, source: string, targetDir: string): Promise<InstallResult>;
  update(projectPath: string, targetDir: string): Promise<UpdateResult>;
  detect(projectPath: string, targetDir: string): Promise<DetectionResult | null>;
}

// Constants
export const DEFAULT_SOURCE_GIT = 'https://github.com/ecorkran/ai-project-guide.git';
export const DEFAULT_SOURCE_API = 'https://api.github.com/repos/ecorkran/ai-project-guide';
export const GUIDE_RELATIVE_PATH = 'project-documents/ai-project-guide';
export const VERSION_MARKER_FILE = '.context-forge-guide-version';

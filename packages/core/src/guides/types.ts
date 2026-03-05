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
}

/** Result of a guide update */
export interface UpdateResult {
  success: boolean;
  previousVersion: string | null;
  newVersion: string | null;
  method: GuideMethod;
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

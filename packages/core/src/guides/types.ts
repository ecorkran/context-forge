// Guide management types and strategy interface

/** Installation method used for the ai-project-guide */
export type GuideMethod = 'submodule' | 'clone' | 'tarball';

/** Canonical guide methods, in the order they are presented to users. */
export const GUIDE_METHODS: readonly GuideMethod[] = ['submodule', 'clone', 'tarball'];

/**
 * Deprecated strategy names accepted on input, mapped to their canonical
 * replacement. Callers check this to emit a deprecation warning without
 * re-comparing strings. This is the only place an alias is spelled in core
 * source outside the ConfigKeys enum (which keeps `manual` so existing
 * shared config files still validate).
 */
export const GUIDE_METHOD_DEPRECATED_ALIASES: Readonly<Record<string, GuideMethod>> = {
  manual: 'tarball',
};

/**
 * Normalize a strategy name from any input boundary (config value, CLI
 * `--strategy` flag, MCP tool parameter) into a canonical GuideMethod.
 * Throws when the input is neither canonical nor a known deprecated alias.
 */
export function normalizeGuideMethod(input: string): GuideMethod {
  const candidate = input.trim();
  if ((GUIDE_METHODS as readonly string[]).includes(candidate)) {
    return candidate as GuideMethod;
  }
  const aliased = GUIDE_METHOD_DEPRECATED_ALIASES[candidate];
  if (aliased) {
    return aliased;
  }
  throw new Error(
    `Invalid guide strategy '${input}'. Valid values: ${GUIDE_METHODS.join(', ')}.`
  );
}

/**
 * True when `input` is a deprecated alias rather than a canonical method.
 * Lets a boundary decide whether to print the D5 deprecation warning.
 */
export function isDeprecatedGuideMethodAlias(input: string): boolean {
  return input.trim() in GUIDE_METHOD_DEPRECATED_ALIASES;
}

/**
 * Checkout state of a submodule-installed guide, as `git submodule status`
 * reports it. Only meaningful for the submodule method.
 */
export type SubmoduleCheckoutState = 'in_sync' | 'out_of_sync' | 'not_initialized';

/** Human-readable labels for each checkout state, used in CLI and tool output. */
export const CHECKOUT_STATE_LABELS: Record<SubmoduleCheckoutState, string> = {
  in_sync: 'in sync',
  out_of_sync: 'out of sync',
  not_initialized: 'not initialized',
};

/**
 * Upper bound on the automatic `git submodule update --init` performed by a
 * read command. A blackholed proxy would otherwise block for the OS TCP
 * timeout. User-initiated install and update stay unbounded (D10).
 */
export const GUIDE_INIT_TIMEOUT_MS = 60_000;

/** Full status of a guide installation */
export interface GuideInfo {
  installed: boolean;
  method: GuideMethod | null;
  /**
   * Submodule checkout state; null for clone/tarball installs and when no
   * guide is installed.
   */
  checkout: SubmoduleCheckoutState | null;
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
  /**
   * Set when the requested strategy was named by a deprecated alias (e.g.
   * `manual`), carrying the original spelling. Callers print a deprecation
   * warning; absent when the canonical name was used (D5).
   */
  deprecatedAlias?: string;
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

// @context-forge/core — context assembly engine
export * from './types/index.js';
export * from './services/index.js';

// Storage interfaces (browser-safe types only — no fs dependencies)
export type { IProjectStore, IStorageService, StorageReadResult } from './storage/interfaces.js';

// Introspection types and interfaces (browser-safe — no fs dependencies)
export * from './introspection/index.js';

// Guide types (browser-safe — no fs dependencies)
export type { GuideInfo, GuideMethod, InstallResult, UninstallResult, UpdateResult, SyncResult, SubmoduleCheckoutState, EnsureCheckoutResult } from './guides/types.js';
export {
  CHECKOUT_STATE_LABELS,
  GUIDE_MANAGED_NOTICE,
  GUIDE_METHODS,
  GUIDE_METHOD_DEPRECATED_ALIASES,
  GUIDE_STRATEGIES,
  guideMethodDeprecationMessage,
} from './guides/types.js';

// Project schema (field metadata, aliases, phase maps)
export * from './schema/projectSchema.js';

// Frontmatter schema registry (per-docType field validation)
export {
  FRONTMATTER_SCHEMAS,
  VALID_STATUSES,
  validateFrontmatter,
  inferDocTypeFromPath,
  inferFieldsFromPath,
  type FrontmatterFieldDef,
  type DocTypeSchema,
  type FrontmatterFinding,
} from './schema/frontmatterSchema.js';

// Git utilities
export { GitWorktreeDiscovery, parseWorktreeListOutput } from './git/index.js';

// Project defaults — browser-safe constants and creation helpers
// NOTE: computeAutoSetFields is exported from node.ts (fs-dependent via resolveFileByIndex)
export {
  WORKTREE_SCOPED_FIELDS,
  PROJECT_TO_WORKTREE_FIELD,
  formatDateProject,
  buildProjectCreationDefaults,
  type ProjectCreationOptions,
  type AutoSetResult,
} from './project-defaults.js';

// Worktree overlay (browser-safe — pure object mapping, no fs/path)
export {
  applyWorktreeOverlay,
  isInIndexRange,
  getWorktreeIndexRange,
  getWorktreeRangeOverride,
} from './utils/worktree-overlay.js';

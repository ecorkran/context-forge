// @context-forge/core — context assembly engine
export * from './types/index.js';
export * from './services/index.js';

// Storage interfaces (browser-safe types only — no fs dependencies)
export type { IProjectStore, IStorageService, StorageReadResult } from './storage/interfaces.js';

// Introspection types and interfaces (browser-safe — no fs dependencies)
export * from './introspection/index.js';

// Guide types (browser-safe — no fs dependencies)
export type { GuideInfo, GuideMethod, InstallResult, UpdateResult } from './guides/types.js';

// Project schema (field metadata, aliases, phase maps)
export * from './schema/projectSchema.js';

// Git utilities
export { GitWorktreeDiscovery, parseWorktreeListOutput } from './git/index.js';

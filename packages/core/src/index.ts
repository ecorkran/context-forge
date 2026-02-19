// @context-forge/core — context assembly engine
export * from './types/index.js';
export * from './services/index.js';

// Storage interfaces (browser-safe types only — no fs dependencies)
export type { IProjectStore, IStorageService, StorageReadResult } from './storage/interfaces.js';

// Introspection module — types and interfaces (browser-safe)
export * from './types.js';
export type { IArtifactIntrospector } from './interfaces.js';

// Parser functions (Node.js — fs dependent)
export { normalizeStatus } from './parsers/statusNormalizer.js';

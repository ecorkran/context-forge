// Introspection module — browser-safe exports (types, interfaces, pure functions)
export * from './types.js';
export type { IArtifactIntrospector } from './interfaces.js';

// normalizeStatus is a pure function with no fs dependency — browser-safe
export { normalizeStatus } from './parsers/statusNormalizer.js';

// @context-forge/core/node — Node.js-only services (fs/path dependent)
// Use this entry point in main process, CLI, MCP server, and tests.
// Do NOT import from renderer/browser code — use IPC wrappers instead.

export { StatementManager } from './services/StatementManager.js';
export { SystemPromptParser } from './services/SystemPromptParser.js';
export { ProjectPathService } from './services/ProjectPathService.js';
export { createContextPipeline } from './services/CoreServiceFactory.js';

// Storage — filesystem-backed project CRUD, backup, and storage utilities
export * from './storage/index.js';

// Config — two-tier TOML configuration (user + project level)
export * from './config/index.js';

// Introspection — artifact parsing and document detection (fs dependent)
export { ArtifactIntrospector } from './introspection/ArtifactIntrospector.js';
export { parseFrontmatter } from './introspection/parsers/frontmatterParser.js';
export { parseSlicePlan } from './introspection/parsers/slicePlanParser.js';
export { parseTaskItems, parseTaskFile } from './introspection/parsers/taskFileParser.js';
export { parseFutureWork } from './introspection/parsers/futureWorkParser.js';
export { detectDocuments, checkFileExists } from './introspection/parsers/documentDetector.js';

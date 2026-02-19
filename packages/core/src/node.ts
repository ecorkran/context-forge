// @context-forge/core/node — Node.js-only services (fs/path dependent)
// Use this entry point in main process, CLI, MCP server, and tests.
// Do NOT import from renderer/browser code — use IPC wrappers instead.

export { StatementManager } from './services/StatementManager.js';
export { SystemPromptParser } from './services/SystemPromptParser.js';
export { ProjectPathService } from './services/ProjectPathService.js';
export { createContextPipeline } from './services/CoreServiceFactory.js';

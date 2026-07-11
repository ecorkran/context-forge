// @context-forge/core/node — Node.js-only services (fs/path dependent)
// Use this entry point in main process, CLI, MCP server, and tests.
// Do NOT import from renderer/browser code — use IPC wrappers instead.

export { StatementManager } from './services/StatementManager.js';
export { SystemPromptParser } from './services/SystemPromptParser.js';
export { ProjectPathService } from './services/ProjectPathService.js';
export { createContextPipeline, resolvePromptFilePath } from './services/CoreServiceFactory.js';

// Storage — filesystem-backed project CRUD, backup, and storage utilities
export * from './storage/index.js';

// Config — two-tier TOML configuration (user + project level)
export * from './config/index.js';

// Guides — guide lifecycle management (git/fs dependent)
export * from './guides/index.js';

// Schema — fs-dependent helpers (index-based file resolution)
export { resolveFileByIndex, resolveArtifactPath, deriveArtifactStem, resolveSlicePlanPathByIndex } from './schema/resolveFileByIndex.js';
export { normalizeArtifactValue } from './schema/normalizeArtifactValue.js';

// Introspection — artifact parsing and document detection (fs dependent)
export { ArtifactIntrospector, resolveInitiativePlanPath } from './introspection/ArtifactIntrospector.js';
export { WorkflowNavigator, extractSliceIndex } from './introspection/WorkflowNavigator.js';
export { parseFrontmatter } from './introspection/parsers/frontmatterParser.js';
export { parseSlicePlan } from './introspection/parsers/slicePlanParser.js';
export { parseTaskItems, parseTaskFile } from './introspection/parsers/taskFileParser.js';
export { parseFutureWork } from './introspection/parsers/futureWorkParser.js';
export { detectDocuments, checkFileExists } from './introspection/parsers/documentDetector.js';
export { buildModel, scanDirectory, mergeProjectModels } from './introspection/ProjectModelBuilder.js';
export { FutureWorkCollector } from './introspection/FutureWorkCollector.js';
export { ConsistencyChecker } from './introspection/ConsistencyChecker.js';
export { updateCheckbox, updateFrontmatterField } from './introspection/writers/markdownWriter.js';

// Project defaults — fs-dependent auto-set rules (uses resolveFileByIndex)
export { computeAutoSetFields } from './project-autoset.js';

// Git utilities — spawns git subprocess (fs/process dependent)
export { GitWorktreeDiscovery } from './git/index.js';

// Worktree management — uses IProjectStore (Node.js-backed)
export { WorktreeService } from './services/WorktreeService.js';

// Context embedding — inlines referenced artifact files for non-SDK models
export { embedReferencedFiles } from './services/ContextEmbedder.js';

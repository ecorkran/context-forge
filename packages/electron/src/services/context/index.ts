// Orchestrators now in @context-forge/core
export { ContextGenerator, ContextTemplateEngine, ContextIntegrator } from '@context-forge/core';

// Services now in @context-forge/core
export { TemplateProcessor, SectionBuilder } from '@context-forge/core';

// IPC implementations (for renderer process)
export { StatementManagerIPC } from './StatementManagerIPC';
export { SystemPromptParserIPC } from './SystemPromptParserIPC';

// Factory functions (re-export from ServiceFactory)
export { createStatementManager, createSystemPromptParser } from './ServiceFactory';

// Types (re-exported from @context-forge/core)
export type { ContextData, EnhancedContextData } from '@context-forge/core';
export type { TemplateStatement } from '@context-forge/core';
export type { ContextSection } from '@context-forge/core';
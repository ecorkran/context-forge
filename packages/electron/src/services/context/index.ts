// Main services
export { ContextIntegrator } from './ContextIntegrator';
export { TemplateProcessor } from './TemplateProcessor';
export { ContextTemplateEngine } from './ContextTemplateEngine';
export { SectionBuilder } from './SectionBuilder';

// IPC implementations (for renderer process)
export { StatementManagerIPC } from './StatementManagerIPC';
export { SystemPromptParserIPC } from './SystemPromptParserIPC';

// Factory functions (re-export from ServiceFactory)
export { createStatementManager, createSystemPromptParser } from './ServiceFactory';

// Types (re-exported from @context-forge/core)
export type { ContextData, ContextGenerator, EnhancedContextData } from '@context-forge/core';
export type { TemplateStatement } from '@context-forge/core';
export type { ContextSection } from '@context-forge/core';
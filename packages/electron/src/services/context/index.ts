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

// Types
export type { ContextData, ContextGenerator, EnhancedContextData } from './types/ContextData';
export type { TemplateStatement } from './types/TemplateStatement';
export type { ContextSection } from './types/ContextSection';
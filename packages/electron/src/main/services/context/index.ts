// Services now in @context-forge/core
export { StatementManager, SystemPromptParser } from '@context-forge/core';

// Other main process context services
export { PromptFileManager } from './PromptFileManager';

// Export types (re-exported from @context-forge/core)
export type { TemplateStatement, StatementConfig, StatementFileMetadata, ParsedStatement } from '@context-forge/core';
export type { SystemPrompt, ParsedPromptFile, PromptCacheEntry } from '@context-forge/core';
export { SpecialPromptKeys } from '@context-forge/core';
export type { ContextSection, ContextTemplate, SectionBuilderConfig, SectionValidation } from '@context-forge/core';
export { SectionKeys } from '@context-forge/core';
export type { ContextData, EnhancedContextData, ContextGenerator } from '@context-forge/core';
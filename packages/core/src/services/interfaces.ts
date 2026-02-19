import type { SystemPrompt } from '../types/prompts.js';

/** Minimal interface for reading template statements (satisfied by StatementManager and StatementManagerIPC) */
export interface IStatementReader {
  getStatement(key: string): string;
}

/** Minimal interface for reading system prompts (satisfied by SystemPromptParser and SystemPromptParserIPC) */
export interface IPromptReader {
  getToolUsePrompt(): Promise<SystemPrompt | null>;
  getPromptForInstruction(instruction: string): Promise<SystemPrompt | null>;
  getContextInitializationPrompt(isMonorepo?: boolean): Promise<SystemPrompt | null>;
}

/** Extended interface for statement management with file path support */
export interface IStatementService extends IStatementReader {
  loadStatements(): Promise<void>;
  setFilePath(path: string): void;
}

/** Extended interface for prompt parsing with file path support */
export interface IPromptService extends IPromptReader {
  setFilePath(path: string): void;
}

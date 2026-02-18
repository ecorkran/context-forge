import type { SystemPrompt } from '../types/prompts.js';

/** Minimal interface for reading template statements (satisfied by StatementManager and StatementManagerIPC) */
export interface IStatementReader {
  getStatement(key: string): string;
}

/** Minimal interface for reading system prompts (satisfied by SystemPromptParser and SystemPromptParserIPC) */
export interface IPromptReader {
  getToolUsePrompt(): Promise<SystemPrompt | null>;
  getPromptForInstruction(instruction: string): Promise<SystemPrompt | null>;
}

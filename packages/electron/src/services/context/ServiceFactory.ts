import { StatementManagerIPC } from './StatementManagerIPC';
import { SystemPromptParserIPC } from './SystemPromptParserIPC';

/**
 * Factory functions for creating context services in renderer process
 * Always uses IPC implementations since renderer cannot use Node.js modules
 */

export function createStatementManager(filename?: string) {
  // Renderer process always uses IPC implementation
  return new StatementManagerIPC(filename);
}

export function createSystemPromptParser(filename?: string) {
  // Renderer process always uses IPC implementation
  return new SystemPromptParserIPC(filename);
}